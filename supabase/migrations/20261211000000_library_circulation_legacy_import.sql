-- Imports only reconciled legacy circulation history. Fines and missing links
-- must be resolved in preview; this migration does not create Finance entries.
BEGIN;

ALTER TABLE public.library_circulations
  ADD COLUMN source_fingerprint TEXT;

ALTER TABLE public.library_circulations
  ADD CONSTRAINT library_circulations_source_fingerprint_check
  CHECK (
    (source_system = 'manual' AND source_fingerprint IS NULL)
    OR (source_system = 'legacy_import' AND source_fingerprint IS NOT NULL
      AND source_fingerprint ~ '^[0-9a-f]{64}$')
  );

CREATE TABLE public.library_circulation_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count BETWEEN 1 AND 1000),
  imported_count INTEGER NOT NULL CHECK (imported_count BETWEEN 0 AND source_count),
  unchanged_count INTEGER NOT NULL CHECK (unchanged_count BETWEEN 0 AND source_count),
  imported_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, snapshot_fingerprint),
  FOREIGN KEY (tenant_id, imported_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (imported_count + unchanged_count = source_count)
);

ALTER TABLE public.library_circulation_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_circulation_import_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.library_circulation_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.library_circulation_import_batches TO service_role;

CREATE OR REPLACE FUNCTION public.import_legacy_library_circulations(
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
  v_previous public.library_circulation_import_batches%ROWTYPE;
  v_item JSONB;
  v_existing public.library_circulations%ROWTYPE;
  v_count INTEGER := 0;
  v_imported INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_source_id TEXT;
  v_source_fingerprint TEXT;
  v_book_id UUID;
  v_student_id UUID;
  v_borrowed_on DATE;
  v_due_on DATE;
  v_returned_on DATE;
  v_status TEXT;
  v_book_lock UUID;
  v_total_copies INTEGER;
  v_active_loans INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_source_count IS NULL OR p_source_count NOT BETWEEN 1 AND 1000
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows) <> p_source_count THEN
    RAISE EXCEPTION 'Invalid legacy library circulation snapshot' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant perpustakaan tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
      AND lower(btrim(role::text)) IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Impor sirkulasi hanya tersedia untuk Admin aktif tenant' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-circulation-import:' || p_tenant_id::text || ':' || p_snapshot_fingerprint, 0
  ));
  SELECT * INTO v_previous FROM public.library_circulation_import_batches
  WHERE tenant_id = p_tenant_id AND snapshot_fingerprint = p_snapshot_fingerprint;
  IF FOUND THEN
    IF v_previous.source_count <> p_source_count THEN
      RAISE EXCEPTION 'Legacy library circulation batch count changed' USING ERRCODE = '23514';
    END IF;
    RETURN jsonb_build_object('alreadyApplied', true, 'imported', v_previous.imported_count, 'unchanged', v_previous.unchanged_count);
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_rows) AS expanded(item)
    GROUP BY item->>'sourceRecordId' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate legacy library circulation source ID' USING ERRCODE = '23505';
  END IF;

  -- Match the lock order used by checkout so import and live transactions cannot
  -- over-allocate the same book or deadlock on a multi-book snapshot.
  FOR v_book_lock IN
    SELECT DISTINCT (item->>'bookId')::UUID
    FROM jsonb_array_elements(p_rows) AS expanded(item)
    WHERE COALESCE(item->>'bookId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ORDER BY 1
  LOOP
    PERFORM 1 FROM public.library_books
    WHERE tenant_id = p_tenant_id AND id = v_book_lock
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Legacy circulation book does not belong to tenant' USING ERRCODE = '42501';
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_count := v_count + 1;
    v_source_id := COALESCE(v_item->>'sourceRecordId', '');
    v_source_fingerprint := COALESCE(v_item->>'sourceFingerprint', '');
    IF v_source_id !~ '^[0-9a-f]{64}$' OR v_source_fingerprint !~ '^[0-9a-f]{64}$'
      OR COALESCE(v_item->>'bookId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR COALESCE(v_item->>'studentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR COALESCE(v_item->>'borrowedOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR COALESCE(v_item->>'dueOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR COALESCE(v_item->>'status', '') NOT IN ('active', 'returned') THEN
      RAISE EXCEPTION 'Invalid legacy library circulation fields' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_book_id := (v_item->>'bookId')::UUID;
      v_student_id := (v_item->>'studentId')::UUID;
      v_borrowed_on := (v_item->>'borrowedOn')::DATE;
      v_due_on := (v_item->>'dueOn')::DATE;
      v_returned_on := NULLIF(v_item->>'returnedOn', '')::DATE;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Invalid legacy library circulation date or identifier' USING ERRCODE = '22023';
    END;
    v_status := v_item->>'status';
    IF v_due_on < v_borrowed_on OR v_due_on > v_borrowed_on + 90
      OR (v_status = 'active' AND v_returned_on IS NOT NULL)
      OR (v_status = 'returned' AND (v_returned_on IS NULL OR v_returned_on < v_borrowed_on)) THEN
      RAISE EXCEPTION 'Invalid legacy library circulation dates or status' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.library_books WHERE tenant_id = p_tenant_id AND id = v_book_id)
      OR NOT EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND id = v_student_id) THEN
      RAISE EXCEPTION 'Legacy circulation references another tenant or missing record' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_existing FROM public.library_circulations
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import' AND source_record_id = v_source_id;
    IF FOUND THEN
      IF v_existing.source_fingerprint IS DISTINCT FROM v_source_fingerprint
        OR v_existing.book_id IS DISTINCT FROM v_book_id
        OR v_existing.student_id IS DISTINCT FROM v_student_id
        OR v_existing.borrowed_on IS DISTINCT FROM v_borrowed_on
        OR v_existing.due_on IS DISTINCT FROM v_due_on
        OR v_existing.returned_on IS DISTINCT FROM v_returned_on
        OR v_existing.status IS DISTINCT FROM v_status THEN
        RAISE EXCEPTION 'Legacy library circulation changed after preview' USING ERRCODE = '23514';
      END IF;
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.library_circulations (
      tenant_id, book_id, student_id, borrowed_on, due_on, returned_on, status,
      recorded_by_user_id, source_system, source_record_id, source_fingerprint
    ) VALUES (
      p_tenant_id, v_book_id, v_student_id, v_borrowed_on, v_due_on, v_returned_on,
      v_status, p_actor_user_id, 'legacy_import', v_source_id, v_source_fingerprint
    );
    v_imported := v_imported + 1;
  END LOOP;

  IF v_count <> p_source_count THEN
    RAISE EXCEPTION 'Legacy library circulation import count mismatch' USING ERRCODE = '22023';
  END IF;

  FOR v_book_lock IN
    SELECT DISTINCT (item->>'bookId')::UUID
    FROM jsonb_array_elements(p_rows) AS expanded(item)
    WHERE item->>'status' = 'active'
    ORDER BY 1
  LOOP
    SELECT total_copies INTO v_total_copies FROM public.library_books
    WHERE tenant_id = p_tenant_id AND id = v_book_lock;
    SELECT count(*)::INTEGER INTO v_active_loans FROM public.library_circulations
    WHERE tenant_id = p_tenant_id AND book_id = v_book_lock AND status = 'active';
    IF v_active_loans > v_total_copies THEN
      RAISE EXCEPTION 'Legacy active loans exceed the tenant book copy count' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  INSERT INTO public.library_circulation_import_batches (
    tenant_id, snapshot_fingerprint, source_count, imported_count, unchanged_count, imported_by_user_id
  ) VALUES (p_tenant_id, p_snapshot_fingerprint, p_source_count, v_imported, v_unchanged, p_actor_user_id);
  RETURN jsonb_build_object('alreadyApplied', false, 'imported', v_imported, 'unchanged', v_unchanged);
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_library_circulations(UUID, UUID, TEXT, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_library_circulations(UUID, UUID, TEXT, INTEGER, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.import_legacy_library_circulations(UUID, UUID, TEXT, INTEGER, JSONB) IS
  'Atomically imports reviewed library circulation history with explicit tenant mappings and immutable source fingerprints.';

COMMIT;

