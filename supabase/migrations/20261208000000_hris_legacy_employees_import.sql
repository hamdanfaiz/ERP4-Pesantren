-- Tenant-scoped, replay-safe import of legacy Pegawai into HRIS.
-- This does not create Supabase Auth accounts or import Guru/Asatidz records.
BEGIN;

ALTER TABLE public.hris_employees
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_system IN ('manual', 'legacy_import')),
  ADD COLUMN source_record_id TEXT,
  ADD COLUMN source_fingerprint TEXT,
  ADD COLUMN legacy_details JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(legacy_details) = 'object' AND octet_length(legacy_details::text) <= 16384),
  ADD CONSTRAINT hris_employees_source_provenance_check
    CHECK (
      (source_system = 'manual' AND source_record_id IS NULL AND source_fingerprint IS NULL)
      OR (source_system = 'legacy_import'
        AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL
        AND source_record_id ~ '^[0-9a-f]{64}$'
        AND source_fingerprint ~ '^[0-9a-f]{64}$')
    );

CREATE UNIQUE INDEX hris_employees_legacy_source_uq
  ON public.hris_employees (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

CREATE TABLE public.hris_employee_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 0 AND 1000),
  imported_count INTEGER NOT NULL CHECK (imported_count BETWEEN 0 AND source_count),
  unchanged_count INTEGER NOT NULL CHECK (unchanged_count BETWEEN 0 AND source_count),
  imported_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, snapshot_fingerprint),
  FOREIGN KEY (tenant_id, imported_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (imported_count + unchanged_count = source_count)
);

ALTER TABLE public.hris_employee_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_employee_import_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hris_employee_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.hris_employee_import_batches TO service_role;

CREATE OR REPLACE FUNCTION public.import_legacy_hris_employees(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_snapshot_fingerprint TEXT,
  p_source_count INTEGER,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_previous public.hris_employee_import_batches%ROWTYPE;
  v_item JSONB;
  v_source_count INTEGER := 0;
  v_imported INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_employee_id UUID;
  v_client_request_id UUID;
  v_employee_number TEXT;
  v_full_name TEXT;
  v_job_title TEXT;
  v_department TEXT;
  v_email TEXT;
  v_phone TEXT;
  v_status TEXT;
  v_source_id TEXT;
  v_source_fingerprint TEXT;
  v_existing_fingerprint TEXT;
  v_existing_id UUID;
  v_details JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_source_count IS NULL OR p_source_count NOT BETWEEN 0 AND 1000
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows) <> p_source_count THEN
    RAISE EXCEPTION 'Invalid legacy HRIS import snapshot' USING ERRCODE = '22023';
  END IF;
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'hris-employee-import:' || p_tenant_id::text || ':' || p_snapshot_fingerprint, 0
  ));
  SELECT * INTO v_previous FROM public.hris_employee_import_batches
  WHERE tenant_id = p_tenant_id AND snapshot_fingerprint = p_snapshot_fingerprint;
  IF FOUND THEN
    RETURN jsonb_build_object('alreadyApplied', true, 'imported', v_previous.imported_count, 'unchanged', v_previous.unchanged_count);
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS expanded(item)
    GROUP BY item->>'sourceRecordId' HAVING count(*) > 1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS expanded(item)
    GROUP BY item->>'clientRequestId' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate legacy HRIS source or request ID' USING ERRCODE = '23505';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_source_count := v_source_count + 1;
    v_employee_id := NULLIF(v_item->>'employeeId', '')::UUID;
    v_client_request_id := NULLIF(v_item->>'clientRequestId', '')::UUID;
    v_employee_number := btrim(COALESCE(v_item->>'employeeNumber', ''));
    v_full_name := btrim(COALESCE(v_item->>'fullName', ''));
    v_job_title := btrim(COALESCE(v_item->>'jobTitle', ''));
    v_department := btrim(COALESCE(v_item->>'department', ''));
    v_email := NULLIF(lower(btrim(COALESCE(v_item->>'email', ''))), '');
    v_phone := NULLIF(btrim(COALESCE(v_item->>'phone', '')), '');
    v_status := COALESCE(v_item->>'employmentStatus', '');
    v_source_id := COALESCE(v_item->>'sourceRecordId', '');
    v_source_fingerprint := COALESCE(v_item->>'sourceFingerprint', '');
    v_details := COALESCE(v_item->'legacyDetails', '{}'::jsonb);

    IF v_employee_id IS NULL OR v_client_request_id IS NULL
      OR v_source_id !~ '^[0-9a-f]{64}$' OR v_source_fingerprint !~ '^[0-9a-f]{64}$'
      OR v_employee_number !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'
      OR length(v_full_name) NOT BETWEEN 2 AND 180
      OR length(v_job_title) NOT BETWEEN 1 AND 120
      OR length(v_department) NOT BETWEEN 1 AND 120
      OR (v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
      OR (v_phone IS NOT NULL AND length(v_phone) NOT BETWEEN 5 AND 40)
      OR v_status NOT IN ('active', 'on_leave', 'inactive', 'terminated')
      OR jsonb_typeof(v_details) IS DISTINCT FROM 'object'
      OR octet_length(v_details::text) > 16384
      OR v_details - ARRAY['address', 'gender', 'shift', 'category', 'type', 'sourceCreatedAt', 'sourceStatus'] <> '{}'::jsonb
      OR (v_details ? 'address' AND (jsonb_typeof(v_details->'address') IS DISTINCT FROM 'string' OR length(v_details->>'address') > 2000))
      OR (v_details ? 'gender' AND (jsonb_typeof(v_details->'gender') IS DISTINCT FROM 'string' OR length(v_details->>'gender') > 20))
      OR (v_details ? 'shift' AND (jsonb_typeof(v_details->'shift') IS DISTINCT FROM 'string' OR length(v_details->>'shift') > 80))
      OR (v_details ? 'category' AND (jsonb_typeof(v_details->'category') IS DISTINCT FROM 'string' OR length(v_details->>'category') > 100))
      OR (v_details ? 'type' AND (jsonb_typeof(v_details->'type') IS DISTINCT FROM 'string' OR length(v_details->>'type') > 80))
      OR (v_details ? 'sourceCreatedAt' AND (jsonb_typeof(v_details->'sourceCreatedAt') IS DISTINCT FROM 'string' OR length(v_details->>'sourceCreatedAt') > 40))
      OR (v_details ? 'sourceStatus' AND (jsonb_typeof(v_details->'sourceStatus') IS DISTINCT FROM 'string' OR length(v_details->>'sourceStatus') > 40)) THEN
      RAISE EXCEPTION 'Invalid legacy HRIS employee fields' USING ERRCODE = '22023';
    END IF;

    SELECT id, source_fingerprint INTO v_existing_id, v_existing_fingerprint
    FROM public.hris_employees
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import' AND source_record_id = v_source_id;
    IF v_existing_id IS NOT NULL THEN
      IF v_existing_fingerprint IS DISTINCT FROM v_source_fingerprint THEN
        RAISE EXCEPTION 'Legacy employee changed after preview' USING ERRCODE = '23514';
      END IF;
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.hris_employees e
      WHERE e.tenant_id = p_tenant_id AND e.employee_number = v_employee_number
    ) THEN
      RAISE EXCEPTION 'Legacy employee number conflicts with an existing HRIS record' USING ERRCODE = '23505';
    END IF;
    IF v_email IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.hris_employees e WHERE e.tenant_id = p_tenant_id AND e.email = v_email
    ) THEN
      RAISE EXCEPTION 'Legacy employee email conflicts with an existing HRIS record' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.hris_employees (
      id, tenant_id, employee_number, full_name, job_title, department, email, phone,
      employment_status, source_system, source_record_id, source_fingerprint, legacy_details,
      created_by_user_id, updated_by_user_id
    ) VALUES (
      v_employee_id, p_tenant_id, v_employee_number, v_full_name, v_job_title, v_department,
      v_email, v_phone, v_status, 'legacy_import', v_source_id, v_source_fingerprint, v_details,
      p_actor_user_id, p_actor_user_id
    );
    INSERT INTO public.hris_employee_events (tenant_id, employee_id, actor_user_id, client_request_id)
    VALUES (p_tenant_id, v_employee_id, p_actor_user_id, v_client_request_id);
    v_imported := v_imported + 1;
  END LOOP;

  IF v_source_count <> p_source_count THEN
    RAISE EXCEPTION 'Legacy HRIS import count mismatch' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.hris_employee_import_batches (
    tenant_id, snapshot_fingerprint, source_count, imported_count, unchanged_count, imported_by_user_id
  ) VALUES (p_tenant_id, p_snapshot_fingerprint, p_source_count, v_imported, v_unchanged, p_actor_user_id);
  RETURN jsonb_build_object('alreadyApplied', false, 'imported', v_imported, 'unchanged', v_unchanged);
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_hris_employees(UUID, UUID, TEXT, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_hris_employees(UUID, UUID, TEXT, INTEGER, JSONB)
  TO service_role;

COMMENT ON COLUMN public.hris_employees.legacy_details IS
  'Restricted server-side archive attributes retained for reviewed HRIS migration; never exposed through public Data API.';
COMMENT ON FUNCTION public.import_legacy_hris_employees(UUID, UUID, TEXT, INTEGER, JSONB) IS
  'Atomically imports reviewed legacy Pegawai into tenant HRIS without creating Auth accounts.';

COMMIT;
