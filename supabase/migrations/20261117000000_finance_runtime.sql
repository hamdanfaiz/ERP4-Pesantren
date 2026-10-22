-- Tenant-scoped finance bills, expense approvals, audit ledger and book lock.
-- Keep disabled until legacy financial records are previewed and reconciled.
BEGIN;

CREATE TABLE public.finance_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  student_name TEXT NOT NULL CHECK (length(btrim(student_name)) BETWEEN 1 AND 180),
  grade TEXT NOT NULL DEFAULT '' CHECK (length(grade) <= 100),
  fee_type TEXT NOT NULL CHECK (length(btrim(fee_type)) BETWEEN 1 AND 160),
  period TEXT NOT NULL CHECK (length(btrim(period)) BETWEEN 1 AND 80),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0 AND amount = trunc(amount)),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount AND paid_amount = trunc(paid_amount)),
  status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'partial', 'verification', 'paid')),
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT,
  proof_file TEXT,
  proof_storage_path TEXT,
  proof_storage_provider TEXT CHECK (proof_storage_provider IS NULL OR proof_storage_provider = 'supabase'),
  uploaded_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  receipt_no TEXT,
  paid_at DATE,
  payment_type TEXT CHECK (payment_type IS NULL OR payment_type IN ('registration', 'tuition')),
  source_candidate_id TEXT,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, student_id, fee_type, period),
  UNIQUE (tenant_id, receipt_no),
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'unpaid' AND paid_amount = 0)
    OR (status = 'partial' AND paid_amount > 0 AND paid_amount < amount)
    OR (status = 'verification' AND paid_amount < amount AND proof_storage_path IS NOT NULL)
    OR (status = 'paid' AND paid_amount = amount AND paid_at IS NOT NULL AND receipt_no IS NOT NULL)
  ),
  CHECK ((proof_storage_path IS NULL AND proof_storage_provider IS NULL)
      OR (proof_storage_path IS NOT NULL AND proof_storage_provider = 'supabase'))
);

CREATE INDEX finance_bills_tenant_date_idx ON public.finance_bills (tenant_id, bill_date DESC, id DESC);
CREATE INDEX finance_bills_tenant_student_idx ON public.finance_bills (tenant_id, student_id, bill_date DESC, id DESC);
CREATE INDEX finance_bills_tenant_status_idx ON public.finance_bills (tenant_id, status, bill_date DESC);

CREATE TABLE public.finance_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (length(btrim(category)) BETWEEN 1 AND 100),
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 1000),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0 AND amount = trunc(amount)),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  department TEXT NOT NULL CHECK (length(btrim(department)) BETWEEN 1 AND 120),
  requester_user_id UUID NOT NULL,
  requester_name TEXT NOT NULL CHECK (length(btrim(requester_name)) BETWEEN 1 AND 180),
  reviewed_by_user_id UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT CHECK (rejection_reason IS NULL OR length(rejection_reason) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, requester_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reviewed_by_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
      OR (status <> 'pending' AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)),
  CHECK ((status = 'rejected' AND rejection_reason IS NOT NULL)
      OR (status <> 'rejected' AND rejection_reason IS NULL))
);

CREATE INDEX finance_expenses_tenant_date_idx ON public.finance_expenses (tenant_id, expense_date DESC, id DESC);
CREATE INDEX finance_expenses_tenant_status_idx ON public.finance_expenses (tenant_id, status, expense_date DESC);
CREATE INDEX finance_expenses_requester_idx ON public.finance_expenses (tenant_id, requester_user_id, expense_date DESC);

CREATE TABLE public.finance_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('income', 'expense')),
  source_type TEXT NOT NULL CHECK (source_type IN ('bill', 'expense')),
  source_id UUID NOT NULL,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 1000),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0 AND amount = trunc(amount)),
  payment_method TEXT,
  receipt_no TEXT,
  actor_user_id UUID NOT NULL,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, source_type, source_id),
  CHECK ((entry_type = 'income' AND source_type = 'bill') OR (entry_type = 'expense' AND source_type = 'expense'))
);
CREATE INDEX finance_ledger_tenant_posted_idx ON public.finance_ledger (tenant_id, posted_at DESC, id DESC);

CREATE TABLE public.finance_controls (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  finance_locked BOOLEAN NOT NULL DEFAULT false,
  updated_by_user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.finance_write_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create_bills', 'create_expense', 'approve_expense', 'reject_expense', 'settle_bill', 'reject_bill', 'set_lock', 'payment_proof')),
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TRIGGER finance_bills_set_updated_at BEFORE UPDATE ON public.finance_bills
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER finance_expenses_set_updated_at BEFORE UPDATE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.finance_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_bills FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_controls FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_write_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_bills, public.finance_expenses, public.finance_ledger,
  public.finance_controls, public.finance_write_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_bills TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_expenses TO service_role;
GRANT SELECT, INSERT ON TABLE public.finance_ledger TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.finance_controls TO service_role;
GRANT SELECT, INSERT ON TABLE public.finance_write_requests TO service_role;

CREATE OR REPLACE FUNCTION public.create_tenant_finance_bills(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_items JSONB, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_role TEXT;
  v_control public.finance_controls%ROWTYPE;
  v_request public.finance_write_requests%ROWTYPE;
  v_item JSONB;
  v_student_id UUID;
  v_student_name TEXT;
  v_grade TEXT;
  v_fee_type TEXT;
  v_period TEXT;
  v_amount NUMERIC(14,2);
  v_bill_id UUID;
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_result JSONB;
  v_payload JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Data tagihan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Jumlah tagihan harus 1 sampai 500' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501'; END IF;
  v_payload := jsonb_build_object('items', p_items);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.finance_write_requests WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM 'create_bills'
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Kunci permintaan telah dipakai untuk data berbeda' USING ERRCODE = '23505'; END IF;
    RETURN v_request.result;
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000'; END IF;

  FOR v_item IN SELECT item.value FROM jsonb_array_elements(p_items) AS item(value) LOOP
    BEGIN v_student_id := (v_item->>'studentId')::UUID; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'ID santri tidak valid' USING ERRCODE = '22023'; END;
    v_fee_type := btrim(COALESCE(v_item->>'feeType', ''));
    v_period := btrim(COALESCE(v_item->>'period', ''));
    BEGIN v_amount := (v_item->>'amount')::NUMERIC; EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Nominal tagihan tidak valid' USING ERRCODE = '22023'; END;
    IF length(v_fee_type) NOT BETWEEN 1 AND 160 OR length(v_period) NOT BETWEEN 1 AND 80
      OR v_amount <= 0 OR v_amount <> trunc(v_amount) THEN RAISE EXCEPTION 'Jenis, periode, atau nominal tagihan tidak valid' USING ERRCODE = '22023'; END IF;
    SELECT name, COALESCE(grade, '') INTO v_student_name, v_grade FROM public.students
    WHERE tenant_id = p_tenant_id AND id = v_student_id
      AND lower(btrim(status)) NOT IN ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan')
    FOR KEY SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Santri aktif tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
    INSERT INTO public.finance_bills (tenant_id, student_id, student_name, grade, fee_type, period, amount, created_by_user_id)
    VALUES (p_tenant_id, v_student_id, v_student_name, v_grade, v_fee_type, v_period, v_amount, p_actor_user_id)
    ON CONFLICT (tenant_id, student_id, fee_type, period) DO NOTHING
    RETURNING id INTO v_bill_id;
    IF v_bill_id IS NULL THEN v_skipped := v_skipped + 1; ELSE v_created := v_created + 1; END IF;
    v_bill_id := NULL;
  END LOOP;
  v_result := jsonb_build_object('success', true, 'created', v_created, 'skipped', v_skipped);
  INSERT INTO public.finance_write_requests (tenant_id, client_request_id, actor_user_id, action, request_payload, result)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'create_bills', v_payload, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_tenant_finance_expense(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_category TEXT, p_description TEXT, p_department TEXT, p_amount NUMERIC,
  p_expense_date DATE, p_requester_name TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_role TEXT; v_control public.finance_controls%ROWTYPE; v_request public.finance_write_requests%ROWTYPE;
  v_id UUID; v_payload JSONB; v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_expected_role IS NULL
    OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz')
    OR length(btrim(COALESCE(p_category, ''))) NOT BETWEEN 1 AND 100
    OR length(btrim(COALESCE(p_description, ''))) NOT BETWEEN 1 AND 1000
    OR length(btrim(COALESCE(p_department, ''))) NOT BETWEEN 1 AND 120
    OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount)
    OR p_expense_date IS NULL OR length(btrim(COALESCE(p_requester_name, ''))) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Data pengajuan pengeluaran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Profil aktif tidak sesuai dengan pengaju' USING ERRCODE = '42501'; END IF;
  v_payload := jsonb_build_object('category', btrim(p_category), 'description', btrim(p_description), 'department', btrim(p_department), 'amount', p_amount, 'expenseDate', p_expense_date);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.finance_write_requests WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM 'create_expense' OR v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Kunci permintaan telah dipakai untuk data berbeda' USING ERRCODE = '23505'; END IF;
    RETURN v_request.result;
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.finance_expenses (tenant_id, category, description, amount, expense_date, department, requester_user_id, requester_name)
  VALUES (p_tenant_id, btrim(p_category), btrim(p_description), p_amount, p_expense_date, btrim(p_department), p_actor_user_id, btrim(p_requester_name)) RETURNING id INTO v_id;
  v_result := jsonb_build_object('success', true, 'expenseId', v_id);
  INSERT INTO public.finance_write_requests (tenant_id, client_request_id, actor_user_id, action, request_payload, result)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'create_expense', v_payload, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_tenant_finance_expense(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_expense_id UUID, p_action TEXT, p_rejection_reason TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_role TEXT; v_control public.finance_controls%ROWTYPE; v_request public.finance_write_requests%ROWTYPE;
  v_expense public.finance_expenses%ROWTYPE; v_write_action TEXT; v_payload JSONB; v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_expense_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin') OR p_action IS NULL OR p_action NOT IN ('approve', 'reject')
    OR (p_action = 'reject' AND length(btrim(COALESCE(p_rejection_reason, ''))) NOT BETWEEN 1 AND 1000) THEN
    RAISE EXCEPTION 'Keputusan pengeluaran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501'; END IF;
  v_write_action := CASE WHEN p_action = 'approve' THEN 'approve_expense' ELSE 'reject_expense' END;
  v_payload := jsonb_build_object('expenseId', p_expense_id, 'action', p_action, 'rejectionReason', NULLIF(btrim(COALESCE(p_rejection_reason, '')), ''));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.finance_write_requests WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM v_write_action OR v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Kunci keputusan telah dipakai untuk data berbeda' USING ERRCODE = '23505'; END IF;
    RETURN v_request.result;
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_expense FROM public.finance_expenses WHERE tenant_id = p_tenant_id AND id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pengeluaran tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
  IF v_expense.status <> 'pending' THEN RAISE EXCEPTION 'Pengajuan sudah diproses' USING ERRCODE = '23514'; END IF;
  IF v_expense.requester_user_id = p_actor_user_id THEN RAISE EXCEPTION 'Pengaju tidak boleh menyetujui atau menolak pengajuannya sendiri' USING ERRCODE = '42501'; END IF;
  IF p_action = 'approve' THEN
    UPDATE public.finance_expenses SET status = 'approved', reviewed_by_user_id = p_actor_user_id, reviewed_at = now(), rejection_reason = NULL
    WHERE tenant_id = p_tenant_id AND id = p_expense_id;
    INSERT INTO public.finance_ledger (tenant_id, entry_type, source_type, source_id, description, amount, actor_user_id)
    VALUES (p_tenant_id, 'expense', 'expense', p_expense_id, v_expense.description, v_expense.amount, p_actor_user_id);
  ELSE
    UPDATE public.finance_expenses SET status = 'rejected', reviewed_by_user_id = p_actor_user_id, reviewed_at = now(), rejection_reason = btrim(p_rejection_reason)
    WHERE tenant_id = p_tenant_id AND id = p_expense_id;
  END IF;
  v_result := jsonb_build_object('success', true, 'expenseId', p_expense_id, 'status', CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END);
  INSERT INTO public.finance_write_requests (tenant_id, client_request_id, actor_user_id, action, request_payload, result)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, v_write_action, v_payload, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_tenant_finance_bill(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_bill_id UUID, p_action TEXT, p_method_or_reason TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_role TEXT; v_control public.finance_controls%ROWTYPE; v_request public.finance_write_requests%ROWTYPE;
  v_bill public.finance_bills%ROWTYPE; v_write_action TEXT; v_payload JSONB; v_result JSONB; v_receipt TEXT; v_method TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_bill_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin') OR p_action IS NULL OR p_action NOT IN ('settle', 'reject')
    OR length(btrim(COALESCE(p_method_or_reason, ''))) NOT BETWEEN 1 AND 1000
    OR (p_action = 'settle' AND length(btrim(COALESCE(p_method_or_reason, ''))) > 100) THEN
    RAISE EXCEPTION 'Keputusan tagihan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501'; END IF;
  v_write_action := CASE WHEN p_action = 'settle' THEN 'settle_bill' ELSE 'reject_bill' END;
  v_payload := jsonb_build_object('billId', p_bill_id, 'action', p_action, 'methodOrReason', btrim(p_method_or_reason));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.finance_write_requests WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM v_write_action OR v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Kunci keputusan telah dipakai untuk data berbeda' USING ERRCODE = '23505'; END IF;
    RETURN v_request.result;
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_bill FROM public.finance_bills WHERE tenant_id = p_tenant_id AND id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
  IF p_action = 'settle' THEN
    IF v_bill.status NOT IN ('unpaid', 'partial', 'verification') OR v_bill.paid_amount >= v_bill.amount THEN RAISE EXCEPTION 'Status tagihan tidak dapat diselesaikan' USING ERRCODE = '23514'; END IF;
    IF v_bill.status = 'verification' AND v_bill.proof_storage_path IS NULL THEN RAISE EXCEPTION 'Bukti pembayaran belum tersimpan' USING ERRCODE = '23514'; END IF;
    v_method := CASE WHEN v_bill.status = 'verification' THEN COALESCE(v_bill.payment_method, btrim(p_method_or_reason)) ELSE btrim(p_method_or_reason) END;
    v_receipt := 'KWT/FIN/' || to_char(CURRENT_DATE, 'YYYY') || '/' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    UPDATE public.finance_bills SET status = 'paid', paid_amount = amount, payment_method = v_method,
      receipt_no = v_receipt, paid_at = CURRENT_DATE, rejection_reason = NULL
    WHERE tenant_id = p_tenant_id AND id = p_bill_id;
    INSERT INTO public.finance_ledger (tenant_id, entry_type, source_type, source_id, description, amount, payment_method, receipt_no, actor_user_id)
    VALUES (p_tenant_id, 'income', 'bill', p_bill_id, 'Pelunasan tagihan ' || v_bill.fee_type || ' - ' || v_bill.period,
      v_bill.amount - v_bill.paid_amount, v_method, v_receipt, p_actor_user_id);
  ELSE
    IF v_bill.status <> 'verification' THEN RAISE EXCEPTION 'Tagihan tidak menunggu verifikasi pembayaran' USING ERRCODE = '23514'; END IF;
    UPDATE public.finance_bills SET status = CASE WHEN paid_amount > 0 THEN 'partial' ELSE 'unpaid' END,
      payment_method = NULL, proof_file = NULL, proof_storage_path = NULL, proof_storage_provider = NULL,
      uploaded_at = NULL, rejection_reason = btrim(p_method_or_reason)
    WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  END IF;
  v_result := jsonb_build_object('success', true, 'billId', p_bill_id, 'status', CASE WHEN p_action = 'settle' THEN 'paid' ELSE 'unpaid' END, 'receiptNo', v_receipt);
  INSERT INTO public.finance_write_requests (tenant_id, client_request_id, actor_user_id, action, request_payload, result)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, v_write_action, v_payload, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_finance_lock(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_locked BOOLEAN, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_role TEXT; v_request public.finance_write_requests%ROWTYPE; v_payload JSONB; v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_locked IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin') THEN RAISE EXCEPTION 'Status penutupan buku tidak valid' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501'; END IF;
  v_payload := jsonb_build_object('locked', p_locked);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.finance_write_requests WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM 'set_lock' OR v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Kunci perubahan buku telah dipakai untuk data berbeda' USING ERRCODE = '23505'; END IF;
    RETURN v_request.result;
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, p_locked, p_actor_user_id)
  ON CONFLICT (tenant_id) DO UPDATE SET finance_locked = EXCLUDED.finance_locked, updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now();
  v_result := jsonb_build_object('success', true, 'financeLocked', p_locked);
  INSERT INTO public.finance_write_requests (tenant_id, client_request_id, actor_user_id, action, request_payload, result)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'set_lock', v_payload, v_result);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_tenant_finance_payment_proof(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_bill_id UUID, p_storage_path TEXT, p_file_name TEXT, p_payment_method TEXT,
  p_file_sha256 TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_role TEXT; v_profile public.profiles%ROWTYPE; v_control public.finance_controls%ROWTYPE;
  v_bill public.finance_bills%ROWTYPE; v_request public.finance_write_requests%ROWTYPE; v_payload JSONB; v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_bill_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('wali_santri', 'admin', 'super_admin')
    OR p_storage_path IS NULL OR length(p_storage_path) > 900 OR p_storage_path NOT LIKE 'financeProofs/%'
    OR position('..' IN p_storage_path) > 0 OR p_file_name IS NULL OR length(p_file_name) NOT BETWEEN 1 AND 120
    OR p_payment_method IS NULL OR p_payment_method NOT IN ('BSI', 'Muamalat', 'MandiriSyariah')
    OR p_file_sha256 IS NULL OR p_file_sha256 !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Data bukti pembayaran tidak valid' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_profile FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  v_role := lower(btrim(v_profile.role::text));
  IF v_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Profil aktif tidak sesuai dengan pengirim bukti' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_bill FROM public.finance_bills WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'wali_santri' AND v_profile.linked_santri_id IS DISTINCT FROM v_bill.student_id::TEXT THEN RAISE EXCEPTION 'Tagihan tidak terhubung ke akun wali ini' USING ERRCODE = '42501'; END IF;
  IF position(('/' || replace(p_bill_id::text, '/', '') || '/') IN p_storage_path) = 0 THEN RAISE EXCEPTION 'Lokasi bukti tidak cocok dengan tagihan' USING ERRCODE = '22023'; END IF;
  v_payload := jsonb_build_object('billId', p_bill_id, 'fileName', p_file_name, 'paymentMethod', p_payment_method, 'fileSha256', lower(p_file_sha256));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_request FROM public.finance_write_requests WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM 'payment_proof' OR v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Kunci unggahan telah dipakai untuk berkas berbeda' USING ERRCODE = '23505'; END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_bill FROM public.finance_bills WHERE tenant_id = p_tenant_id AND id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
  IF v_role = 'wali_santri' AND v_profile.linked_santri_id IS DISTINCT FROM v_bill.student_id::TEXT THEN RAISE EXCEPTION 'Tagihan tidak terhubung ke akun wali ini' USING ERRCODE = '42501'; END IF;
  IF v_bill.status NOT IN ('unpaid', 'partial') THEN RAISE EXCEPTION 'Tagihan tidak menerima bukti baru' USING ERRCODE = '23514'; END IF;
  UPDATE public.finance_bills SET status = 'verification', payment_method = 'Transfer Manual (' || p_payment_method || ')',
    proof_file = p_file_name, proof_storage_path = p_storage_path, proof_storage_provider = 'supabase', uploaded_at = now(), rejection_reason = NULL
  WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  v_result := jsonb_build_object('success', true, 'billId', p_bill_id, 'status', 'verification');
  INSERT INTO public.finance_write_requests (tenant_id, client_request_id, actor_user_id, action, request_payload, result)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, 'payment_proof', v_payload, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_finance_bills(UUID, UUID, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_finance_bills(UUID, UUID, TEXT, JSONB, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.create_tenant_finance_expense(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_finance_expense(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.review_tenant_finance_expense(UUID, UUID, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_tenant_finance_expense(UUID, UUID, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.review_tenant_finance_bill(UUID, UUID, TEXT, UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_tenant_finance_bill(UUID, UUID, TEXT, UUID, TEXT, TEXT, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.set_tenant_finance_lock(UUID, UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_finance_lock(UUID, UUID, TEXT, BOOLEAN, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.register_tenant_finance_payment_proof(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_tenant_finance_payment_proof(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

COMMENT ON TABLE public.finance_bills IS 'Tenant-scoped tuition/fee bills; seed data is not inserted automatically.';
COMMENT ON TABLE public.finance_expenses IS 'Tenant-scoped expense requests with maker/checker separation.';
COMMENT ON TABLE public.finance_ledger IS 'Immutable transaction ledger; only approved or settled items are posted.';
COMMENT ON TABLE public.finance_controls IS 'Tenant-level book closing state applied inside write RPC transactions.';
COMMENT ON TABLE public.finance_write_requests IS 'Private idempotency records for trusted Finance writes.';

COMMIT;
