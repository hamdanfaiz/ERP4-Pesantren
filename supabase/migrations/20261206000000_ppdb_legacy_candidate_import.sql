-- Tenant-scoped, encrypted, atomic and replay-safe import of legacy Firestore PPDB candidates.
-- Keep the API feature flag disabled until this migration and PII key configuration are verified.
BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'application',
  ADD COLUMN source_record_id TEXT,
  ADD COLUMN source_fingerprint TEXT,
  ADD CONSTRAINT candidates_source_system_check
    CHECK (source_system IN ('application', 'legacy_firestore')),
  ADD CONSTRAINT candidates_legacy_source_metadata_check
    CHECK (
      (source_system = 'legacy_firestore'
        AND source_record_id IS NOT NULL
        AND length(btrim(source_record_id)) BETWEEN 1 AND 1500
        AND source_fingerprint IS NOT NULL
        AND source_fingerprint ~ '^[0-9a-f]{64}$')
      OR
      (source_system = 'application'
        AND source_record_id IS NULL
        AND source_fingerprint IS NULL)
    );

CREATE UNIQUE INDEX candidates_legacy_source_record_uq
  ON public.candidates (tenant_id, source_record_id)
  WHERE source_system = 'legacy_firestore';

CREATE TABLE public.ppdb_legacy_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_tenant_key TEXT NOT NULL CHECK (length(btrim(source_tenant_key)) BETWEEN 1 AND 150),
  source_date_format TEXT NOT NULL CHECK (source_date_format = 'ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)'),
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 1 AND 500),
  imported_count INTEGER NOT NULL CHECK (imported_count BETWEEN 0 AND source_count),
  skipped_count INTEGER NOT NULL CHECK (skipped_count BETWEEN 0 AND source_count),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, snapshot_fingerprint),
  CHECK (imported_count + skipped_count = source_count),
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE public.ppdb_legacy_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppdb_legacy_import_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ppdb_legacy_import_batches FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON TABLE public.ppdb_legacy_import_batches TO service_role;

CREATE OR REPLACE FUNCTION public.import_legacy_ppdb_candidates(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_source_tenant_key TEXT,
  p_source_date_format TEXT,
  p_snapshot_fingerprint TEXT,
  p_source_count INTEGER,
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_legacy_tenant_key TEXT;
  v_batch public.ppdb_legacy_import_batches%ROWTYPE;
  v_item JSONB;
  v_candidate_id UUID;
  v_registration_id TEXT;
  v_source_record_id TEXT;
  v_source_fingerprint TEXT;
  v_existing_fingerprint TEXT;
  v_imported INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_source_tenant_key IS NULL OR length(btrim(p_source_tenant_key)) NOT BETWEEN 1 AND 150
    OR p_source_date_format IS DISTINCT FROM 'ISO-8601 UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)'
    OR p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_source_count IS NULL OR p_source_count NOT BETWEEN 1 AND 500
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) <> p_source_count THEN
    RAISE EXCEPTION 'Invalid legacy PPDB import snapshot' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
      AND legacy_tenant_key = btrim(p_source_tenant_key)
  ) THEN
    RAISE EXCEPTION 'Legacy PPDB tenant mapping is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT, module_permissions
    INTO v_role, v_permissions
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND OR v_role NOT IN ('admin', 'super_admin')
    OR (v_role <> 'super_admin' AND CASE
      WHEN v_permissions ? 'ppdb' THEN
        CASE WHEN jsonb_typeof(v_permissions -> 'ppdb') = 'boolean'
          THEN (v_permissions ->> 'ppdb')::BOOLEAN ELSE false END
      ELSE v_role = 'admin'
    END IS NOT TRUE) THEN
    RAISE EXCEPTION 'Active tenant Admin with PPDB permission is required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ppdb-legacy-import:' || p_tenant_id::TEXT, 0));
  SELECT * INTO v_batch
  FROM public.ppdb_legacy_import_batches
  WHERE tenant_id = p_tenant_id AND snapshot_fingerprint = p_snapshot_fingerprint
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'alreadyApplied', true,
      'imported', v_batch.imported_count,
      'skipped', v_batch.skipped_count,
      'sourceCount', v_batch.source_count
    );
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item -> 'candidate') IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item -> 'workflowData', '{}'::JSONB)) IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item -> 'documents', '{}'::JSONB)) IS DISTINCT FROM 'object'
      OR COALESCE(v_item ->> 'candidateId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(v_item ->> 'sourceRecordId', '') = ''
      OR length(v_item ->> 'sourceRecordId') > 1500
      OR COALESCE(v_item ->> 'sourceFingerprint', '') !~ '^[0-9a-f]{64}$'
      OR COALESCE(v_item ->> 'registrationId', '') = ''
      OR length(v_item ->> 'registrationId') > 50 THEN
      RAISE EXCEPTION 'Invalid legacy PPDB candidate row' USING ERRCODE = '22023';
    END IF;
    v_candidate_id := (v_item ->> 'candidateId')::UUID;
    v_source_record_id := v_item ->> 'sourceRecordId';
    v_source_fingerprint := v_item ->> 'sourceFingerprint';
    v_registration_id := btrim(v_item ->> 'registrationId');

    SELECT source_fingerprint INTO v_existing_fingerprint
    FROM public.candidates
    WHERE tenant_id = p_tenant_id
      AND source_system = 'legacy_firestore'
      AND source_record_id = v_source_record_id
    FOR UPDATE;
    IF FOUND THEN
      IF v_existing_fingerprint IS DISTINCT FROM v_source_fingerprint THEN
        RAISE EXCEPTION 'Legacy candidate changed after prior import; manual reconciliation is required' USING ERRCODE = '23514';
      END IF;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    PERFORM public.create_admin_ppdb_candidate(
      p_tenant_id,
      v_candidate_id,
      v_registration_id,
      v_item -> 'candidate',
      COALESCE(v_item -> 'workflowData', '{}'::JSONB),
      COALESCE(v_item -> 'documents', '{}'::JSONB)
    );

    UPDATE public.candidates
    SET source_system = 'legacy_firestore',
        source_record_id = v_source_record_id,
        source_fingerprint = v_source_fingerprint
    WHERE tenant_id = p_tenant_id AND id = v_candidate_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Imported candidate could not be linked to its source record' USING ERRCODE = 'P0002';
    END IF;
    v_imported := v_imported + 1;
  END LOOP;

  INSERT INTO public.ppdb_legacy_import_batches (
    tenant_id, source_tenant_key, source_date_format, snapshot_fingerprint,
    source_count, imported_count, skipped_count, created_by
  ) VALUES (
    p_tenant_id, btrim(p_source_tenant_key), p_source_date_format, p_snapshot_fingerprint,
    p_source_count, v_imported, v_skipped, p_actor_user_id
  );

  RETURN jsonb_build_object(
    'alreadyApplied', false,
    'imported', v_imported,
    'skipped', v_skipped,
    'sourceCount', p_source_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_ppdb_candidates(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_ppdb_candidates(UUID, UUID, TEXT, TEXT, TEXT, INTEGER, JSONB)
  TO service_role;

COMMENT ON TABLE public.ppdb_legacy_import_batches IS
  'Tenant-scoped audit and idempotency ledger for explicitly confirmed legacy Firestore PPDB imports.';
COMMENT ON COLUMN public.candidates.source_fingerprint IS
  'Keyed fingerprint of normalized legacy source data; raw applicant identity values are never stored here.';

COMMIT;
