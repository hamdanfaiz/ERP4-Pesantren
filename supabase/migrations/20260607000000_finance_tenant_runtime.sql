-- Tenant-scoped finance ledger foundation for the Supabase-only migration.
-- This migration is inert until explicitly applied to a Supabase database.
BEGIN;

CREATE TABLE public.finance_billings (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  id TEXT NOT NULL CHECK (length(btrim(id)) BETWEEN 1 AND 180),
  candidate_id UUID,
  candidate_registration_id TEXT,
  student_ref TEXT,
  santri_name TEXT NOT NULL DEFAULT '',
  grade TEXT NOT NULL DEFAULT '',
  payment_type TEXT CHECK (payment_type IS NULL OR payment_type IN ('registration', 'tuition')),
  billing_type TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0 AND paid_amount <= amount),
  status TEXT NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Overdue', 'Partial', 'Verification', 'Paid', 'Rejected')),
  CHECK (status <> 'Paid' OR paid_amount = amount),
  payment_method TEXT,
  receipt_no TEXT,
  proof_file TEXT,
  proof_storage_path TEXT,
  legacy_proof_reference TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_by_uid TEXT,
  updated_by_uid TEXT,
  billing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  paid_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, candidate_id, payment_type),
  FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX finance_billings_tenant_status_date_idx
  ON public.finance_billings (tenant_id, status, billing_date DESC);
CREATE INDEX finance_billings_tenant_student_idx
  ON public.finance_billings (tenant_id, student_ref, billing_date DESC);
CREATE INDEX finance_billings_tenant_candidate_idx
  ON public.finance_billings (tenant_id, candidate_id)
  WHERE candidate_id IS NOT NULL;

CREATE TABLE public.finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('income', 'expense')),
  source_type TEXT NOT NULL CHECK (length(btrim(source_type)) BETWEEN 1 AND 80),
  source_id TEXT NOT NULL CHECK (length(btrim(source_id)) BETWEEN 1 AND 180),
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  receipt_no TEXT,
  created_by_uid TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, source_type, source_id, receipt_no)
);

CREATE INDEX finance_transactions_tenant_date_idx
  ON public.finance_transactions (tenant_id, transaction_date DESC);

CREATE TABLE public.finance_expenses (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  id TEXT NOT NULL CHECK (length(btrim(id)) BETWEEN 1 AND 180),
  requester_uid TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  department TEXT NOT NULL DEFAULT '',
  requester_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Paid')),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by_uid TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX finance_expenses_tenant_status_date_idx
  ON public.finance_expenses (tenant_id, status, expense_date DESC);

CREATE TABLE public.finance_controls (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  finance_locked BOOLEAN NOT NULL DEFAULT false,
  updated_by_uid TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.finance_billings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_billings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.finance_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_controls FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.finance_billings, public.finance_transactions,
  public.finance_expenses, public.finance_controls FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.finance_billings,
  public.finance_transactions, public.finance_expenses, public.finance_controls TO service_role;

CREATE OR REPLACE FUNCTION public.create_ppdb_finance_billing(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_payment_type TEXT,
  p_amount NUMERIC,
  p_actor_uid TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate public.candidates%ROWTYPE;
  v_fee_key TEXT;
  v_invoice_id TEXT;
  v_period TEXT;
  v_academic_start INTEGER;
  v_status TEXT;
  v_payment JSONB;
  v_fee JSONB;
  v_bill public.finance_billings%ROWTYPE;
  v_created BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR p_payment_type IS NULL OR p_payment_type NOT IN ('registration', 'tuition')
    OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000000
    OR p_actor_uid IS NULL OR length(btrim(p_actor_uid)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Data tagihan PPDB tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.candidates
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kandidat tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF p_payment_type = 'tuition' AND v_candidate.stage <> 'Accepted' THEN
    RAISE EXCEPTION 'Tagihan daftar ulang hanya untuk kandidat yang diterima' USING ERRCODE = '22023';
  END IF;

  v_fee_key := CASE WHEN p_payment_type = 'registration' THEN 'registrationFee' ELSE 'tuitionFee' END;
  v_invoice_id := 'INV-PPDB-' || v_candidate.registration_id || '-' || CASE WHEN p_payment_type = 'registration' THEN 'REG' ELSE 'SPP' END;
  IF length(v_invoice_id) > 180 THEN RAISE EXCEPTION 'ID registrasi terlalu panjang' USING ERRCODE = '22023'; END IF;

  v_academic_start := CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 7
    THEN EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
    ELSE EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1 END;
  v_period := CASE WHEN p_payment_type = 'registration'
    THEN 'PPDB ' || v_academic_start::TEXT || '/' || (v_academic_start + 1)::TEXT
    ELSE 'Tahun Ajaran ' || v_academic_start::TEXT || '/' || (v_academic_start + 1)::TEXT END;

  INSERT INTO public.finance_billings (
    tenant_id, id, candidate_id, candidate_registration_id, santri_name, grade,
    payment_type, billing_type, period, amount, paid_amount, status, created_by_uid
  ) VALUES (
    p_tenant_id, v_invoice_id, p_candidate_id, v_candidate.registration_id,
    v_candidate.name || CASE WHEN p_payment_type = 'registration' THEN ' (Calon Santri)' ELSE ' (Santri Baru)' END,
    v_candidate.grade || CASE WHEN p_payment_type = 'registration' THEN ' - PPDB' ELSE ' - Daftar Ulang' END,
    p_payment_type,
    CASE WHEN p_payment_type = 'registration' THEN 'Biaya Pendaftaran PPDB' ELSE 'Uang Pangkal & SPP Awal PPDB' END,
    v_period, p_amount, 0, 'Unpaid', p_actor_uid
  )
  ON CONFLICT (tenant_id, id) DO NOTHING
  RETURNING * INTO v_bill;
  v_created := FOUND;

  IF NOT v_created THEN
    SELECT * INTO v_bill FROM public.finance_billings
      WHERE tenant_id = p_tenant_id AND id = v_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_bill.candidate_id IS DISTINCT FROM p_candidate_id
      OR v_bill.payment_type IS DISTINCT FROM p_payment_type THEN
      RAISE EXCEPTION 'ID tagihan sudah digunakan oleh data lain' USING ERRCODE = '23505';
    END IF;
    IF v_bill.status IN ('Paid', 'Partial', 'Verification') THEN
      RETURN jsonb_build_object('id', v_bill.id, 'status', v_bill.status, 'created', false);
    END IF;
    IF v_bill.amount <> p_amount THEN
      RAISE EXCEPTION 'Tagihan sudah ada dengan nominal berbeda' USING ERRCODE = '23505';
    END IF;
  END IF;

  v_payment := COALESCE(v_candidate.workflow_data->'payment', '{}'::jsonb);
  v_fee := jsonb_build_object(
    'amount', v_bill.amount,
    'paidAmount', v_bill.paid_amount,
    'status', v_bill.status,
    'invoiceId', v_bill.id
  );
  UPDATE public.candidates
  SET workflow_data = public.jsonb_deep_merge(
        COALESCE(workflow_data, '{}'::jsonb),
        jsonb_build_object('payment', jsonb_build_object(v_fee_key, v_fee))
      ),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id;

  RETURN jsonb_build_object('id', v_bill.id, 'status', v_bill.status, 'created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ppdb_finance_payment(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_payment_type TEXT,
  p_paid_amount NUMERIC,
  p_status TEXT,
  p_payment_method TEXT,
  p_receipt_no TEXT,
  p_actor_uid TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate public.candidates%ROWTYPE;
  v_bill public.finance_billings%ROWTYPE;
  v_fee_key TEXT;
  v_old_paid NUMERIC;
  v_payment JSONB;
  v_fee JSONB;
  v_total_paid NUMERIC;
  v_ledger_amount NUMERIC;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR p_payment_type IS NULL OR p_payment_type NOT IN ('registration', 'tuition')
    OR p_paid_amount IS NULL OR p_paid_amount < 0
    OR p_status IS NULL OR p_status NOT IN ('Unpaid', 'Overdue', 'Partial', 'Verification', 'Paid')
    OR p_payment_method IS NULL OR length(btrim(p_payment_method)) NOT BETWEEN 1 AND 120
    OR p_actor_uid IS NULL OR length(btrim(p_actor_uid)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Data pembayaran PPDB tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.candidates
    WHERE tenant_id = p_tenant_id AND id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kandidat tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;

  v_fee_key := CASE WHEN p_payment_type = 'registration' THEN 'registrationFee' ELSE 'tuitionFee' END;
  SELECT * INTO v_bill FROM public.finance_billings
    WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id AND payment_type = p_payment_type
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan PPDB belum diterbitkan' USING ERRCODE = 'P0002'; END IF;

  v_old_paid := v_bill.paid_amount;
  IF p_paid_amount > v_bill.amount
    OR (p_status = 'Paid' AND p_paid_amount <> v_bill.amount)
    OR (p_status = 'Partial' AND (p_paid_amount <= 0 OR p_paid_amount >= v_bill.amount))
    OR (p_status IN ('Unpaid', 'Overdue') AND p_paid_amount <> 0)
    OR p_paid_amount < v_old_paid THEN
    RAISE EXCEPTION 'Nominal/status pembayaran tidak konsisten' USING ERRCODE = '22023';
  END IF;
  IF v_bill.status = 'Paid' THEN
    IF p_status = 'Paid' AND p_paid_amount = v_bill.paid_amount
      AND p_receipt_no IS NOT DISTINCT FROM v_bill.receipt_no THEN
      RETURN jsonb_build_object('id', v_bill.id, 'status', 'Paid', 'receiptNo', v_bill.receipt_no, 'alreadyRecorded', true);
    END IF;
    RAISE EXCEPTION 'Tagihan lunas tidak dapat diubah atau ditagih ulang' USING ERRCODE = '23505';
  END IF;
  IF p_paid_amount > v_old_paid AND (p_receipt_no IS NULL OR length(btrim(p_receipt_no)) NOT BETWEEN 1 AND 160) THEN
    RAISE EXCEPTION 'Nomor kuitansi wajib untuk pembayaran' USING ERRCODE = '22023';
  END IF;

  v_ledger_amount := p_paid_amount - v_old_paid;
  UPDATE public.finance_billings
  SET paid_amount = p_paid_amount,
      status = p_status,
      payment_method = btrim(p_payment_method),
      receipt_no = NULLIF(btrim(COALESCE(p_receipt_no, '')), ''),
      paid_at = CASE WHEN p_status = 'Paid' THEN CURRENT_DATE ELSE paid_at END,
      updated_by_uid = p_actor_uid,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_bill.id
  RETURNING * INTO v_bill;

  v_payment := COALESCE(v_candidate.workflow_data->'payment', '{}'::jsonb);
  v_fee := jsonb_build_object(
    'amount', v_bill.amount,
    'paidAmount', v_bill.paid_amount,
    'status', v_bill.status,
    'paidAt', COALESCE(v_bill.paid_at::TEXT, CURRENT_DATE::TEXT),
    'method', v_bill.payment_method,
    'receiptNo', v_bill.receipt_no,
    'invoiceId', v_bill.id
  );
  v_payment := public.jsonb_deep_merge(
    v_payment,
    jsonb_build_object(v_fee_key, v_fee)
  );
  v_total_paid := COALESCE((v_payment #>> '{registrationFee,paidAmount}')::NUMERIC, 0)
    + COALESCE((v_payment #>> '{tuitionFee,paidAmount}')::NUMERIC, 0);
  v_payment := jsonb_set(v_payment, '{totalPaid}', to_jsonb(v_total_paid), true);
  UPDATE public.candidates
  SET workflow_data = public.jsonb_deep_merge(
        COALESCE(workflow_data, '{}'::jsonb),
        jsonb_build_object('payment', v_payment)
      ),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id;

  IF v_ledger_amount > 0 THEN
    INSERT INTO public.finance_transactions (
      tenant_id, transaction_type, source_type, source_id, description,
      amount, payment_method, receipt_no, created_by_uid
    ) VALUES (
      p_tenant_id, 'income', 'billing', v_bill.id,
      v_bill.billing_type || ' PPDB', v_ledger_amount,
      v_bill.payment_method, v_bill.receipt_no, p_actor_uid
    )
    ON CONFLICT (tenant_id, source_type, source_id, receipt_no)
      DO UPDATE SET amount = EXCLUDED.amount
      WHERE public.finance_transactions.amount = EXCLUDED.amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'Nomor kuitansi sudah digunakan untuk transaksi lain' USING ERRCODE = '23505'; END IF;
  END IF;

  RETURN jsonb_build_object('id', v_bill.id, 'status', v_bill.status, 'receiptNo', v_bill.receipt_no, 'alreadyRecorded', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_finance_billing(
  p_tenant_id UUID,
  p_billing_id TEXT,
  p_record JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.finance_billings%ROWTYPE;
  v_candidate_id UUID;
  v_candidate_ref TEXT;
  v_candidate_id_ref TEXT;
  v_amount NUMERIC;
  v_paid NUMERIC;
  v_status TEXT;
  v_type TEXT;
  v_details JSONB;
  v_created BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR p_billing_id IS NULL
    OR length(btrim(p_billing_id)) NOT BETWEEN 1 AND 180
    OR p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'Data tagihan lama tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_amount := NULLIF(p_record->>'amount', '')::NUMERIC;
  v_paid := COALESCE(NULLIF(p_record->>'paidAmount', '')::NUMERIC, 0);
  v_status := COALESCE(NULLIF(p_record->>'status', ''), 'Unpaid');
  v_type := NULLIF(p_record->>'paymentType', '');
  v_candidate_ref := NULLIF(p_record->>'candidateRegistrationId', '');
  v_candidate_id_ref := NULLIF(p_record->>'candidateId', '');
  IF v_candidate_ref IS NOT NULL THEN
    SELECT id INTO v_candidate_id FROM public.candidates
      WHERE tenant_id = p_tenant_id AND registration_id = v_candidate_ref
      LIMIT 1;
  END IF;
  IF v_candidate_id IS NULL AND v_candidate_id_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  IF v_amount IS NULL OR v_amount <= 0 OR v_paid < 0 OR v_paid > v_amount
    OR v_status NOT IN ('Unpaid', 'Overdue', 'Partial', 'Verification', 'Paid', 'Rejected')
    OR (v_status = 'Paid' AND v_paid <> v_amount)
    OR (v_type IS NOT NULL AND v_type NOT IN ('registration', 'tuition')) THEN
    RAISE EXCEPTION 'Nilai tagihan lama tidak valid' USING ERRCODE = '22023';
  END IF;

  v_details := p_record - ARRAY[
    'id','tenantId','candidateId','candidateRegistrationId','santriId','santriName',
    'grade','paymentType','type','period','amount','paidAmount','status','date',
    'paymentMethod','receiptNo','proofFile','proofStoragePath','proofUrl',
    'createdByUid','updatedByUid','createdAt','updatedAt'
  ];

  INSERT INTO public.finance_billings (
    tenant_id, id, candidate_id, candidate_registration_id, student_ref, santri_name,
    grade, payment_type, billing_type, period, amount, paid_amount, status,
    payment_method, receipt_no, legacy_proof_reference, details, created_by_uid,
    updated_by_uid, billing_date, paid_at
  ) VALUES (
    p_tenant_id, p_billing_id, v_candidate_id, v_candidate_ref,
    NULLIF(p_record->>'santriId', ''), COALESCE(p_record->>'santriName', ''),
    COALESCE(p_record->>'grade', ''), v_type, COALESCE(p_record->>'type', ''),
    COALESCE(p_record->>'period', ''), v_amount, v_paid, v_status,
    NULLIF(p_record->>'paymentMethod', ''), NULLIF(p_record->>'receiptNo', ''),
    COALESCE(NULLIF(p_record->>'proofStoragePath', ''), NULLIF(p_record->>'proofUrl', '')),
    COALESCE(v_details, '{}'::jsonb), NULLIF(p_record->>'createdByUid', ''),
    NULLIF(p_record->>'updatedByUid', ''),
    COALESCE(NULLIF(p_record->>'date', '')::DATE, CURRENT_DATE),
    COALESCE(NULLIF(left(p_record->>'paidAt', 10), '')::DATE, NULL)
  )
  ON CONFLICT (tenant_id, id) DO NOTHING
  RETURNING * INTO v_existing;
  v_created := FOUND;

  IF NOT v_created THEN
    SELECT * INTO v_existing FROM public.finance_billings
      WHERE tenant_id = p_tenant_id AND id = p_billing_id;
    IF v_existing.amount IS DISTINCT FROM v_amount
      OR v_existing.candidate_registration_id IS DISTINCT FROM v_candidate_ref
      OR v_existing.status IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'Tagihan lama berbenturan dengan data Supabase yang sudah ada' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN jsonb_build_object('id', p_billing_id, 'created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.create_ppdb_finance_billing(UUID, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_ppdb_finance_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_finance_billing(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ppdb_finance_billing(UUID, UUID, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ppdb_finance_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_finance_billing(UUID, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.link_ppdb_billing_to_onboarded_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.master_student_id IS DISTINCT FROM OLD.master_student_id AND NEW.master_student_id IS NOT NULL THEN
    UPDATE public.finance_billings
    SET student_ref = NEW.master_student_id::TEXT, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND candidate_id = NEW.id
      AND (student_ref IS NULL OR student_ref = NEW.master_student_id::TEXT);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_link_ppdb_finance_billing
  AFTER UPDATE OF master_student_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.link_ppdb_billing_to_onboarded_student();

COMMIT;
 THEN
    SELECT id INTO v_candidate_id FROM public.candidates
      WHERE tenant_id = p_tenant_id AND id = v_candidate_id_ref::UUID;
  END IF;
  IF (v_candidate_ref IS NOT NULL OR v_candidate_id_ref IS NOT NULL) AND v_candidate_id IS NULL THEN
    RAISE EXCEPTION 'Kandidat tagihan lama belum ditemukan di tenant Supabase' USING ERRCODE = 'P0002';
  END IF;
  IF v_candidate_ref IS NOT NULL AND v_candidate_id_ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  IF v_amount IS NULL OR v_amount <= 0 OR v_paid < 0 OR v_paid > v_amount
    OR v_status NOT IN ('Unpaid', 'Overdue', 'Partial', 'Verification', 'Paid', 'Rejected')
    OR (v_status = 'Paid' AND v_paid <> v_amount)
    OR (v_type IS NOT NULL AND v_type NOT IN ('registration', 'tuition')) THEN
    RAISE EXCEPTION 'Nilai tagihan lama tidak valid' USING ERRCODE = '22023';
  END IF;

  v_details := p_record - ARRAY[
    'id','tenantId','candidateId','candidateRegistrationId','santriId','santriName',
    'grade','paymentType','type','period','amount','paidAmount','status','date',
    'paymentMethod','receiptNo','proofFile','proofStoragePath','proofUrl',
    'createdByUid','updatedByUid','createdAt','updatedAt'
  ];

  INSERT INTO public.finance_billings (
    tenant_id, id, candidate_id, candidate_registration_id, student_ref, santri_name,
    grade, payment_type, billing_type, period, amount, paid_amount, status,
    payment_method, receipt_no, legacy_proof_reference, details, created_by_uid,
    updated_by_uid, billing_date, paid_at
  ) VALUES (
    p_tenant_id, p_billing_id, v_candidate_id, v_candidate_ref,
    NULLIF(p_record->>'santriId', ''), COALESCE(p_record->>'santriName', ''),
    COALESCE(p_record->>'grade', ''), v_type, COALESCE(p_record->>'type', ''),
    COALESCE(p_record->>'period', ''), v_amount, v_paid, v_status,
    NULLIF(p_record->>'paymentMethod', ''), NULLIF(p_record->>'receiptNo', ''),
    COALESCE(NULLIF(p_record->>'proofStoragePath', ''), NULLIF(p_record->>'proofUrl', '')),
    COALESCE(v_details, '{}'::jsonb), NULLIF(p_record->>'createdByUid', ''),
    NULLIF(p_record->>'updatedByUid', ''),
    COALESCE(NULLIF(p_record->>'date', '')::DATE, CURRENT_DATE),
    COALESCE(NULLIF(p_record->>'paidAt', '')::DATE, NULL)
  )
  ON CONFLICT (tenant_id, id) DO NOTHING
  RETURNING * INTO v_existing;
  v_created := FOUND;

  IF NOT v_created THEN
    SELECT * INTO v_existing FROM public.finance_billings
      WHERE tenant_id = p_tenant_id AND id = p_billing_id;
    IF v_existing.amount IS DISTINCT FROM v_amount
      OR v_existing.candidate_registration_id IS DISTINCT FROM v_candidate_ref
      OR v_existing.status IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'Tagihan lama berbenturan dengan data Supabase yang sudah ada' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN jsonb_build_object('id', p_billing_id, 'created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.create_ppdb_finance_billing(UUID, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_ppdb_finance_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_finance_billing(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ppdb_finance_billing(UUID, UUID, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ppdb_finance_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_finance_billing(UUID, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.link_ppdb_billing_to_onboarded_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.master_student_id IS DISTINCT FROM OLD.master_student_id AND NEW.master_student_id IS NOT NULL THEN
    UPDATE public.finance_billings
    SET student_ref = NEW.master_student_id::TEXT, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND candidate_id = NEW.id
      AND (student_ref IS NULL OR student_ref = NEW.master_student_id::TEXT);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_link_ppdb_finance_billing
  AFTER UPDATE OF master_student_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.link_ppdb_billing_to_onboarded_student();

COMMIT;

    AND v_candidate_id <> v_candidate_id_ref::UUID THEN
    RAISE EXCEPTION 'ID kandidat dan nomor registrasi tagihan tidak cocok' USING ERRCODE = '23503';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 OR v_paid < 0 OR v_paid > v_amount
    OR v_status NOT IN ('Unpaid', 'Overdue', 'Partial', 'Verification', 'Paid', 'Rejected')
    OR (v_status = 'Paid' AND v_paid <> v_amount)
    OR (v_type IS NOT NULL AND v_type NOT IN ('registration', 'tuition')) THEN
    RAISE EXCEPTION 'Nilai tagihan lama tidak valid' USING ERRCODE = '22023';
  END IF;

  v_details := p_record - ARRAY[
    'id','tenantId','candidateId','candidateRegistrationId','santriId','santriName',
    'grade','paymentType','type','period','amount','paidAmount','status','date',
    'paymentMethod','receiptNo','proofFile','proofStoragePath','proofUrl',
    'createdByUid','updatedByUid','createdAt','updatedAt'
  ];

  INSERT INTO public.finance_billings (
    tenant_id, id, candidate_id, candidate_registration_id, student_ref, santri_name,
    grade, payment_type, billing_type, period, amount, paid_amount, status,
    payment_method, receipt_no, legacy_proof_reference, details, created_by_uid,
    updated_by_uid, billing_date, paid_at
  ) VALUES (
    p_tenant_id, p_billing_id, v_candidate_id, v_candidate_ref,
    NULLIF(p_record->>'santriId', ''), COALESCE(p_record->>'santriName', ''),
    COALESCE(p_record->>'grade', ''), v_type, COALESCE(p_record->>'type', ''),
    COALESCE(p_record->>'period', ''), v_amount, v_paid, v_status,
    NULLIF(p_record->>'paymentMethod', ''), NULLIF(p_record->>'receiptNo', ''),
    COALESCE(NULLIF(p_record->>'proofStoragePath', ''), NULLIF(p_record->>'proofUrl', '')),
    COALESCE(v_details, '{}'::jsonb), NULLIF(p_record->>'createdByUid', ''),
    NULLIF(p_record->>'updatedByUid', ''),
    COALESCE(NULLIF(p_record->>'date', '')::DATE, CURRENT_DATE),
    COALESCE(NULLIF(p_record->>'paidAt', '')::DATE, NULL)
  )
  ON CONFLICT (tenant_id, id) DO NOTHING
  RETURNING * INTO v_existing;
  v_created := FOUND;

  IF NOT v_created THEN
    SELECT * INTO v_existing FROM public.finance_billings
      WHERE tenant_id = p_tenant_id AND id = p_billing_id;
    IF v_existing.amount IS DISTINCT FROM v_amount
      OR v_existing.candidate_registration_id IS DISTINCT FROM v_candidate_ref
      OR v_existing.status IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'Tagihan lama berbenturan dengan data Supabase yang sudah ada' USING ERRCODE = '23505';
    END IF;
  END IF;
  RETURN jsonb_build_object('id', p_billing_id, 'created', v_created);
END;
$$;

REVOKE ALL ON FUNCTION public.create_ppdb_finance_billing(UUID, UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_ppdb_finance_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_finance_billing(UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ppdb_finance_billing(UUID, UUID, TEXT, NUMERIC, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_ppdb_finance_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_finance_billing(UUID, TEXT, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.link_ppdb_billing_to_onboarded_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.master_student_id IS DISTINCT FROM OLD.master_student_id AND NEW.master_student_id IS NOT NULL THEN
    UPDATE public.finance_billings
    SET student_ref = NEW.master_student_id::TEXT, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND candidate_id = NEW.id
      AND (student_ref IS NULL OR student_ref = NEW.master_student_id::TEXT);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_link_ppdb_finance_billing
  AFTER UPDATE OF master_student_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.link_ppdb_billing_to_onboarded_student();

COMMIT;
