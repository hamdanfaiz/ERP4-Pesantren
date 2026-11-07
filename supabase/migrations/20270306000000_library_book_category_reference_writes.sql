-- Persist Library book categories as tenant-owned reference relationships.
BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_tenant_library_book_with_reference(
  p_tenant_id UUID,
  p_book_id UUID,
  p_title TEXT,
  p_author TEXT,
  p_category TEXT,
  p_category_reference_id UUID,
  p_isbn TEXT,
  p_total_copies INTEGER,
  p_shelf TEXT,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_book_id UUID;
  v_request public.library_write_requests%ROWTYPE;
  v_payload JSONB;
  v_legacy_payload JSONB;
  v_category_name TEXT;
  v_existing public.library_books%ROWTYPE;
  v_active_loans INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz')
    OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240
    OR p_author IS NULL OR length(btrim(p_author)) NOT BETWEEN 1 AND 180
    OR p_category IS NULL OR length(btrim(p_category)) NOT BETWEEN 1 AND 100 OR p_category_reference_id IS NULL
    OR length(COALESCE(p_isbn, '')) > 32 OR length(COALESCE(p_shelf, '')) > 80
    OR p_total_copies IS NULL OR p_total_copies NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Data katalog buku tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_category_name FROM public.tenant_reference_items
  WHERE tenant_id = p_tenant_id AND domain = 'library_book_category'
    AND id = p_category_reference_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Kategori buku tidak aktif atau bukan milik tenant ini' USING ERRCODE = '23503'; END IF;
  IF lower(btrim(p_category)) IS DISTINCT FROM lower(btrim(v_category_name)) THEN
    RAISE EXCEPTION 'Nama kategori tidak sesuai dengan referensi tenant' USING ERRCODE = '22023';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'ustadz') OR v_role <> p_expected_role THEN
    RAISE EXCEPTION 'Profil aktif tidak berwenang mengubah katalog buku' USING ERRCODE = '42501';
  END IF;

  v_legacy_payload := jsonb_build_object(
    'bookId', p_book_id, 'title', btrim(p_title), 'author', btrim(p_author),
    'category', btrim(v_category_name), 'isbn', NULLIF(btrim(COALESCE(p_isbn, '')), ''),
    'totalCopies', p_total_copies, 'shelf', NULLIF(btrim(COALESCE(p_shelf, '')), '')
  );
  v_payload := v_legacy_payload || jsonb_build_object('categoryReferenceId', p_category_reference_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_request FROM public.library_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_request.action IS DISTINCT FROM 'book_upsert'
      OR (v_request.request_payload IS DISTINCT FROM v_payload AND v_request.request_payload IS DISTINCT FROM v_legacy_payload) THEN
      RAISE EXCEPTION 'Kunci permintaan katalog telah digunakan untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_existing FROM public.library_books
    WHERE tenant_id = p_tenant_id AND id = v_request.result_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Buku dari permintaan terdahulu tidak ditemukan' USING ERRCODE = '23505'; END IF;
    IF v_existing.category IS DISTINCT FROM v_category_name THEN
      RAISE EXCEPTION 'Buku dari permintaan terdahulu tidak sesuai dengan kategori tenant' USING ERRCODE = '23505';
    END IF;
    IF v_existing.category_reference_id IS NULL THEN
      UPDATE public.library_books SET category_reference_id = p_category_reference_id
      WHERE tenant_id = p_tenant_id AND id = v_request.result_id;
    ELSIF v_existing.category_reference_id IS DISTINCT FROM p_category_reference_id THEN
      RAISE EXCEPTION 'Kunci permintaan katalog telah digunakan untuk kategori berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'bookId', v_request.result_id);
  END IF;

  IF p_book_id IS NULL THEN
    INSERT INTO public.library_books (
      tenant_id, title, author, category, category_reference_id, isbn, total_copies, shelf, created_by_user_id
    ) VALUES (
      p_tenant_id, btrim(p_title), btrim(p_author), btrim(v_category_name), p_category_reference_id,
      NULLIF(btrim(COALESCE(p_isbn, '')), ''), p_total_copies,
      NULLIF(btrim(COALESCE(p_shelf, '')), ''), p_actor_user_id
    ) RETURNING id INTO v_book_id;
  ELSE
    SELECT * INTO v_existing FROM public.library_books
    WHERE tenant_id = p_tenant_id AND id = p_book_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Buku tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
    SELECT count(*) INTO v_active_loans FROM public.library_circulations
    WHERE tenant_id = p_tenant_id AND book_id = p_book_id AND status = 'active';
    IF v_active_loans > p_total_copies THEN
      RAISE EXCEPTION 'Jumlah eksemplar tidak boleh di bawah jumlah peminjaman aktif' USING ERRCODE = '23514';
    END IF;
    UPDATE public.library_books SET title = btrim(p_title), author = btrim(p_author),
      category = btrim(v_category_name), category_reference_id = p_category_reference_id,
      isbn = NULLIF(btrim(COALESCE(p_isbn, '')), ''),
      total_copies = p_total_copies, shelf = NULLIF(btrim(COALESCE(p_shelf, '')), ''),
      status = 'active'
    WHERE tenant_id = p_tenant_id AND id = p_book_id
    RETURNING id INTO v_book_id;
  END IF;
  INSERT INTO public.library_write_requests
    (tenant_id, client_request_id, actor_user_id, action, request_payload, result_id)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'book_upsert', v_payload, v_book_id);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'bookId', v_book_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_tenant_library_book(
  p_tenant_id UUID, p_book_id UUID, p_title TEXT, p_author TEXT, p_category TEXT, p_isbn TEXT,
  p_total_copies INTEGER, p_shelf TEXT, p_actor_user_id UUID, p_expected_role TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_category_count INTEGER;
  v_category_reference_id UUID;
BEGIN
  SELECT count(*), (array_agg(id ORDER BY id))[1]
    INTO v_category_count, v_category_reference_id
  FROM public.tenant_reference_items
  WHERE tenant_id = p_tenant_id AND domain = 'library_book_category' AND status = 'active'
    AND lower(btrim(name)) = lower(btrim(COALESCE(p_category, '')));
  IF v_category_count <> 1 THEN
    RAISE EXCEPTION 'Pilih satu kategori buku aktif dari katalog tenant' USING ERRCODE = '23503';
  END IF;
  RETURN public.upsert_tenant_library_book_with_reference(
    p_tenant_id, p_book_id, p_title, p_author, p_category, v_category_reference_id,
    p_isbn, p_total_copies, p_shelf, p_actor_user_id, p_expected_role, p_client_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_tenant_library_book_with_reference(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_library_book_with_reference(UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, INTEGER, TEXT, UUID, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.upsert_tenant_library_book(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_library_book(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, UUID)
  TO service_role;

COMMIT;
