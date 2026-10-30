-- Idempotent, tenant-scoped import of the legacy library catalog.
-- This migration does not import circulation or digital-asset metadata.
BEGIN;

ALTER TABLE public.library_books
  ADD COLUMN source_fingerprint TEXT;

ALTER TABLE public.library_books
  ADD CONSTRAINT library_books_source_fingerprint_check
  CHECK (
    (source_system = 'manual' AND source_fingerprint IS NULL)
    OR (source_system = 'legacy_import' AND source_fingerprint IS NOT NULL
      AND source_fingerprint ~ '^[0-9a-f]{64}$')
  );

-- ISBN-10 and ISBN-13 can have multiple visual separators. Treat their canonical
-- digits consistently so a hyphenated manual entry cannot bypass uniqueness.
DROP INDEX IF EXISTS public.library_books_isbn_uq;
CREATE UNIQUE INDEX library_books_isbn_canonical_uq
  ON public.library_books (
    tenant_id,
    regexp_replace(upper(btrim(isbn)), '[[:space:]-]+', '', 'g')
  )
  WHERE isbn IS NOT NULL AND btrim(isbn) <> '' AND status = 'active';

CREATE TABLE public.library_book_import_batches (
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

ALTER TABLE public.library_book_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_book_import_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.library_book_import_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.library_book_import_batches TO service_role;

CREATE OR REPLACE FUNCTION public.import_legacy_library_books(
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
  v_previous public.library_book_import_batches%ROWTYPE;
  v_item JSONB;
  v_count INTEGER := 0;
  v_imported INTEGER := 0;
  v_unchanged INTEGER := 0;
  v_id UUID;
  v_title TEXT;
  v_author TEXT;
  v_category TEXT;
  v_isbn TEXT;
  v_shelf TEXT;
  v_source_id TEXT;
  v_source_fingerprint TEXT;
  v_existing_fingerprint TEXT;
  v_total_copies INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_source_count IS NULL OR p_source_count NOT BETWEEN 0 AND 1000
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_rows) <> p_source_count THEN
    RAISE EXCEPTION 'Invalid legacy library import snapshot' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant perpustakaan tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
      AND lower(btrim(role::text)) IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Impor katalog hanya tersedia untuk Admin aktif tenant' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-book-import:' || p_tenant_id::text || ':' || p_snapshot_fingerprint, 0
  ));
  SELECT * INTO v_previous FROM public.library_book_import_batches
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
    RAISE EXCEPTION 'Duplicate legacy library source or request ID' USING ERRCODE = '23505';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    v_count := v_count + 1;
    v_source_id := COALESCE(v_item->>'sourceRecordId', '');
    v_source_fingerprint := COALESCE(v_item->>'sourceFingerprint', '');
    v_title := btrim(COALESCE(v_item->>'title', ''));
    v_author := btrim(COALESCE(v_item->>'author', ''));
    v_category := btrim(COALESCE(v_item->>'category', ''));
    v_isbn := NULLIF(upper(regexp_replace(btrim(COALESCE(v_item->>'isbn', '')), '[[:space:]-]+', '', 'g')), '');
    v_shelf := NULLIF(btrim(COALESCE(v_item->>'shelf', '')), '');
    v_total_copies := NULLIF(v_item->>'totalCopies', '')::INTEGER;

    IF v_source_id !~ '^[0-9a-f]{64}$' OR v_source_fingerprint !~ '^[0-9a-f]{64}$'
      OR COALESCE(v_item->>'clientRequestId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR length(v_title) NOT BETWEEN 1 AND 240 OR length(v_author) NOT BETWEEN 1 AND 180
      OR length(v_category) NOT BETWEEN 1 AND 100 OR length(COALESCE(v_isbn, '')) > 32
      OR length(COALESCE(v_shelf, '')) > 80 OR v_total_copies IS NULL OR v_total_copies NOT BETWEEN 0 AND 100000 THEN
      RAISE EXCEPTION 'Invalid legacy library book fields' USING ERRCODE = '22023';
    END IF;
    IF v_isbn IS NOT NULL AND v_isbn !~ '^(\d{9}[\dX]|\d{13})$' THEN
      RAISE EXCEPTION 'Invalid normalized ISBN representation' USING ERRCODE = '22023';
    END IF;

    SELECT id, source_fingerprint INTO v_id, v_existing_fingerprint
    FROM public.library_books
    WHERE tenant_id = p_tenant_id AND source_system = 'legacy_import' AND source_record_id = v_source_id;
    IF v_id IS NOT NULL THEN
      IF v_existing_fingerprint IS DISTINCT FROM v_source_fingerprint THEN
        RAISE EXCEPTION 'Legacy library book changed after preview' USING ERRCODE = '23514';
      END IF;
      v_unchanged := v_unchanged + 1;
      CONTINUE;
    END IF;

    IF v_isbn IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.library_books b
      WHERE b.tenant_id = p_tenant_id AND b.status = 'active'
        AND regexp_replace(upper(btrim(b.isbn)), '[[:space:]-]+', '', 'g') = v_isbn
    ) THEN
      RAISE EXCEPTION 'Legacy ISBN conflicts with an existing tenant catalog entry' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.library_books (
      tenant_id, title, author, category, isbn, total_copies, shelf,
      status, source_system, source_record_id, source_fingerprint, created_by_user_id
    ) VALUES (
      p_tenant_id, v_title, v_author, v_category, v_isbn, v_total_copies, v_shelf,
      'active', 'legacy_import', v_source_id, v_source_fingerprint, p_actor_user_id
    ) RETURNING id INTO v_id;
    v_imported := v_imported + 1;
  END LOOP;

  IF v_count <> p_source_count THEN
    RAISE EXCEPTION 'Legacy library import count mismatch' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.library_book_import_batches (
    tenant_id, snapshot_fingerprint, source_count, imported_count, unchanged_count, imported_by_user_id
  ) VALUES (p_tenant_id, p_snapshot_fingerprint, p_source_count, v_imported, v_unchanged, p_actor_user_id);
  RETURN jsonb_build_object('alreadyApplied', false, 'imported', v_imported, 'unchanged', v_unchanged);
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_library_books(UUID, UUID, TEXT, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_library_books(UUID, UUID, TEXT, INTEGER, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.import_legacy_library_books(UUID, UUID, TEXT, INTEGER, JSONB) IS
  'Atomically imports a reviewed tenant library catalog snapshot with immutable source fingerprints and Admin authorization.';

COMMIT;
