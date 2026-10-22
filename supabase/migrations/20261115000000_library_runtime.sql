-- Tenant-scoped library catalog and circulation workflows.
-- Do not enable runtime until the tenant's legacy catalog is previewed and reconciled.
BEGIN;

CREATE TABLE public.library_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  author TEXT NOT NULL CHECK (length(btrim(author)) BETWEEN 1 AND 180),
  category TEXT NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
  isbn TEXT CHECK (isbn IS NULL OR length(btrim(isbn)) <= 32),
  total_copies INTEGER NOT NULL CHECK (total_copies BETWEEN 0 AND 100000),
  shelf TEXT CHECK (shelf IS NULL OR length(shelf) <= 80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source_system TEXT NOT NULL DEFAULT 'manual' CHECK (source_system IN ('manual', 'legacy_import')),
  source_record_id TEXT,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (source_system = 'manual' AND source_record_id IS NULL)
    OR (source_system = 'legacy_import' AND source_record_id IS NOT NULL
      AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
  ),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX library_books_source_record_uq
  ON public.library_books (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;
CREATE UNIQUE INDEX library_books_isbn_uq
  ON public.library_books (tenant_id, lower(btrim(isbn)))
  WHERE isbn IS NOT NULL AND btrim(isbn) <> '' AND status = 'active';
CREATE INDEX library_books_tenant_title_idx
  ON public.library_books (tenant_id, lower(title), id) WHERE status = 'active';

CREATE TABLE public.library_circulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  book_id UUID NOT NULL,
  student_id UUID NOT NULL,
  borrowed_on DATE NOT NULL DEFAULT CURRENT_DATE,
  due_on DATE NOT NULL,
  returned_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'returned')),
  recorded_by_user_id UUID NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'manual' CHECK (source_system IN ('manual', 'legacy_import')),
  source_record_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (due_on >= borrowed_on AND due_on <= borrowed_on + 90),
  CHECK ((status = 'active' AND returned_on IS NULL) OR (status = 'returned' AND returned_on IS NOT NULL)),
  CHECK (
    (source_system = 'manual' AND source_record_id IS NULL)
    OR (source_system = 'legacy_import' AND source_record_id IS NOT NULL
      AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
  ),
  FOREIGN KEY (tenant_id, book_id)
    REFERENCES public.library_books (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, recorded_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id)
);

CREATE UNIQUE INDEX library_circulations_source_record_uq
  ON public.library_circulations (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;
CREATE INDEX library_circulations_active_book_idx
  ON public.library_circulations (tenant_id, book_id, due_on)
  WHERE status = 'active';
CREATE INDEX library_circulations_student_history_idx
  ON public.library_circulations (tenant_id, student_id, borrowed_on DESC, id DESC);

CREATE TABLE public.library_write_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('book_upsert', 'checkout', 'return')),
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TRIGGER library_books_set_updated_at BEFORE UPDATE ON public.library_books
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER library_circulations_set_updated_at BEFORE UPDATE ON public.library_circulations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_books FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_circulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_circulations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_write_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.library_books, public.library_circulations, public.library_write_requests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.library_books TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.library_circulations TO service_role;
GRANT SELECT, INSERT ON TABLE public.library_write_requests TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_tenant_library_book(
  p_tenant_id UUID,
  p_book_id UUID,
  p_title TEXT,
  p_author TEXT,
  p_category TEXT,
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
  v_existing public.library_books%ROWTYPE;
  v_active_loans INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz')
    OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240
    OR p_author IS NULL OR length(btrim(p_author)) NOT BETWEEN 1 AND 180
    OR p_category IS NULL OR length(btrim(p_category)) NOT BETWEEN 1 AND 100
    OR length(COALESCE(p_isbn, '')) > 32 OR length(COALESCE(p_shelf, '')) > 80
    OR p_total_copies IS NULL OR p_total_copies NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION 'Data katalog buku tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'ustadz') OR v_role <> p_expected_role THEN
    RAISE EXCEPTION 'Profil aktif tidak berwenang mengubah katalog buku' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'bookId', p_book_id, 'title', btrim(p_title), 'author', btrim(p_author),
    'category', btrim(p_category), 'isbn', NULLIF(btrim(COALESCE(p_isbn, '')), ''),
    'totalCopies', p_total_copies, 'shelf', NULLIF(btrim(COALESCE(p_shelf, '')), '')
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_request FROM public.library_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_request.action IS DISTINCT FROM 'book_upsert'
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan katalog telah digunakan untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'bookId', v_request.result_id);
  END IF;

  IF p_book_id IS NULL THEN
    INSERT INTO public.library_books (
      tenant_id, title, author, category, isbn, total_copies, shelf, created_by_user_id
    ) VALUES (
      p_tenant_id, btrim(p_title), btrim(p_author), btrim(p_category),
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
      category = btrim(p_category), isbn = NULLIF(btrim(COALESCE(p_isbn, '')), ''),
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

CREATE OR REPLACE FUNCTION public.checkout_tenant_library_book(
  p_tenant_id UUID,
  p_book_id UUID,
  p_student_id UUID,
  p_borrowed_on DATE,
  p_due_on DATE,
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
  v_book public.library_books%ROWTYPE;
  v_request public.library_write_requests%ROWTYPE;
  v_circulation_id UUID;
  v_active_loans INTEGER;
  v_student_status TEXT;
  v_payload JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_book_id IS NULL OR p_student_id IS NULL OR p_actor_user_id IS NULL
    OR p_client_request_id IS NULL OR p_borrowed_on IS NULL OR p_due_on IS NULL
    OR p_due_on < p_borrowed_on OR p_due_on > p_borrowed_on + 90
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Data peminjaman buku tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'ustadz') OR v_role <> p_expected_role THEN
    RAISE EXCEPTION 'Profil aktif tidak berwenang mencatat peminjaman' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object('bookId', p_book_id, 'studentId', p_student_id,
    'borrowedOn', p_borrowed_on, 'dueOn', p_due_on);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_request FROM public.library_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_request.action IS DISTINCT FROM 'checkout'
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan peminjaman telah digunakan untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'circulationId', v_request.result_id);
  END IF;

  SELECT * INTO v_book FROM public.library_books
  WHERE tenant_id = p_tenant_id AND id = p_book_id AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Buku aktif tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  SELECT status INTO v_student_status FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id FOR UPDATE;
  IF NOT FOUND OR lower(btrim(COALESCE(v_student_status, ''))) IN
    ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan') THEN
    RAISE EXCEPTION 'Santri aktif tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  SELECT count(*) INTO v_active_loans FROM public.library_circulations
  WHERE tenant_id = p_tenant_id AND book_id = p_book_id AND status = 'active';
  IF v_active_loans >= v_book.total_copies THEN
    RAISE EXCEPTION 'Semua eksemplar buku sedang dipinjam' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.library_circulations (
    tenant_id, book_id, student_id, borrowed_on, due_on, recorded_by_user_id
  ) VALUES (
    p_tenant_id, p_book_id, p_student_id, p_borrowed_on, p_due_on, p_actor_user_id
  ) RETURNING id INTO v_circulation_id;
  INSERT INTO public.library_write_requests
    (tenant_id, client_request_id, actor_user_id, action, request_payload, result_id)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'checkout', v_payload, v_circulation_id);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'circulationId', v_circulation_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.return_tenant_library_book(
  p_tenant_id UUID,
  p_circulation_id UUID,
  p_returned_on DATE,
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
  v_circulation public.library_circulations%ROWTYPE;
  v_request public.library_write_requests%ROWTYPE;
  v_payload JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_circulation_id IS NULL OR p_returned_on IS NULL
    OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Data pengembalian buku tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'ustadz') OR v_role <> p_expected_role THEN
    RAISE EXCEPTION 'Profil aktif tidak berwenang mencatat pengembalian' USING ERRCODE = '42501';
  END IF;
  v_payload := jsonb_build_object('circulationId', p_circulation_id, 'returnedOn', p_returned_on);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_request FROM public.library_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM 'return'
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan pengembalian telah digunakan untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'circulationId', v_request.result_id);
  END IF;
  SELECT * INTO v_circulation FROM public.library_circulations
  WHERE tenant_id = p_tenant_id AND id = p_circulation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi peminjaman tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
  IF v_circulation.status = 'returned' THEN
    RAISE EXCEPTION 'Buku sudah tercatat dikembalikan' USING ERRCODE = '23514';
  END IF;
  IF p_returned_on < v_circulation.borrowed_on THEN
    RAISE EXCEPTION 'Tanggal pengembalian mendahului tanggal peminjaman' USING ERRCODE = '22023';
  END IF;
  UPDATE public.library_circulations SET status = 'returned', returned_on = p_returned_on
  WHERE tenant_id = p_tenant_id AND id = p_circulation_id;
  INSERT INTO public.library_write_requests
    (tenant_id, client_request_id, actor_user_id, action, request_payload, result_id)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'return', v_payload, p_circulation_id);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'circulationId', p_circulation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_tenant_library_book(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_tenant_library_book(UUID, UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, UUID, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.checkout_tenant_library_book(UUID, UUID, UUID, DATE, DATE, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_tenant_library_book(UUID, UUID, UUID, DATE, DATE, UUID, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.return_tenant_library_book(UUID, UUID, DATE, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_tenant_library_book(UUID, UUID, DATE, UUID, TEXT, UUID)
  TO service_role;

COMMENT ON TABLE public.library_books IS 'Tenant-scoped catalog. Seed/demo records are not inserted automatically.';
COMMENT ON TABLE public.library_circulations IS 'Tenant-scoped loans. Availability is serialized by the checkout RPC.';

COMMIT;
