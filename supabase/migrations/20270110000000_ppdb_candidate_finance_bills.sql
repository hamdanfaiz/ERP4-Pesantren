-- Link PPDB candidate fees to the central tenant Finance book.
-- Candidate invoices remain visible only through trusted server APIs until
-- onboarding attaches the candidate to a student and linked guardian.
BEGIN;

ALTER TABLE public.finance_bills
  ALTER COLUMN student_id DROP NOT NULL,
  ADD COLUMN candidate_id UUID,
  ADD CONSTRAINT finance_bills_candidate_tenant_fkey
    FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_bills_subject_check
    CHECK (student_id IS NOT NULL OR candidate_id IS NOT NULL),
  ADD CONSTRAINT finance_bills_candidate_payment_type_check
    CHECK (candidate_id IS NULL OR (payment_type IS NOT NULL AND payment_type IN ('registration', 'tuition')));

CREATE INDEX finance_bills_tenant_candidate_idx
  ON public.finance_bills (tenant_id, candidate_id, bill_date DESC, id DESC)
  WHERE candidate_id IS NOT NULL;
CREATE UNIQUE INDEX finance_bills_candidate_payment_type_uq
  ON public.finance_bills (tenant_id, candidate_id, payment_type)
  WHERE candidate_id IS NOT NULL;

ALTER TABLE public.finance_write_requests
  DROP CONSTRAINT finance_write_requests_action_check,
  ADD CONSTRAINT finance_write_requests_action_check
    CHECK (action IN (
      'create_bills', 'create_ppdb_bill', 'create_expense', 'approve_expense',
      'reject_expense', 'settle_bill', 'reject_bill', 'set_lock', 'payment_proof'
    ));

CREATE OR REPLACE FUNCTION public.link_ppdb_candidate_finance_bills()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.master_student_id IS NOT NULL
     AND NEW.master_student_id IS DISTINCT FROM OLD.master_student_id THEN
    UPDATE public.finance_bills
    SET student_id = NEW.master_student_id
    WHERE tenant_id = NEW.tenant_id
      AND candidate_id = NEW.id
      AND student_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.link_ppdb_candidate_finance_bills() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER candidates_link_finance_bills_after_onboarding
  AFTER UPDATE OF master_student_id ON public.candidates
  FOR EACH ROW
  WHEN (OLD.master_student_id IS DISTINCT FROM NEW.master_student_id AND NEW.master_student_id IS NOT NULL)
  EXECUTE FUNCTION public.link_ppdb_candidate_finance_bills();

CREATE OR REPLACE FUNCTION public.create_tenant_ppdb_candidate_bill(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_candidate_id UUID,
  p_payment_type TEXT,
  p_amount NUMERIC,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_control public.finance_controls%ROWTYPE;
  v_request public.finance_write_requests%ROWTYPE;
  v_candidate public.candidates%ROWTYPE;
  v_bill_id UUID;
  v_fee_type TEXT;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_candidate_id IS NULL
     OR p_client_request_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
     OR p_payment_type IS NULL OR p_payment_type NOT IN ('registration', 'tuition')
     OR p_amount IS NULL OR p_amount <= 0 OR p_amount > 999999999999 OR p_amount <> trunc(p_amount) THEN
    RAISE EXCEPTION 'Data tagihan PPDB tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'candidateId', p_candidate_id,
    'paymentType', p_payment_type,
    'amount', p_amount
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.finance_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.action IS DISTINCT FROM 'create_ppdb_bill'
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result;
  END IF;

  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id)
  ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control
  FROM public.finance_controls
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;
  IF v_control.finance_locked THEN
    RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_candidate
  FROM public.candidates
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calon santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_candidate.stage = 'Rejected' THEN
    RAISE EXCEPTION 'Tagihan tidak dapat diterbitkan untuk pendaftar yang ditolak' USING ERRCODE = '23514';
  END IF;
  IF p_payment_type = 'tuition' AND v_candidate.stage <> 'Accepted' THEN
    RAISE EXCEPTION 'Uang pangkal hanya dapat diterbitkan setelah calon santri diterima' USING ERRCODE = '23514';
  END IF;

  v_fee_type := CASE p_payment_type
    WHEN 'registration' THEN 'Biaya Pendaftaran PPDB'
    ELSE 'Uang Pangkal PPDB'
  END;
  INSERT INTO public.finance_bills (
    tenant_id, student_id, candidate_id, student_name, grade, fee_type,
    period, amount, payment_type, created_by_user_id
  ) VALUES (
    p_tenant_id, v_candidate.master_student_id, v_candidate.id, v_candidate.name,
    COALESCE(v_candidate.grade, ''), v_fee_type, v_candidate.registration_id,
    p_amount, p_payment_type, p_actor_user_id
  )
  ON CONFLICT (tenant_id, candidate_id, payment_type) WHERE candidate_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_bill_id;

  v_result := jsonb_build_object(
    'success', true,
    'created', CASE WHEN v_bill_id IS NULL THEN 0 ELSE 1 END,
    'skipped', CASE WHEN v_bill_id IS NULL THEN 1 ELSE 0 END,
    'alreadyExists', v_bill_id IS NULL
  );
  IF v_bill_id IS NULL THEN
    SELECT id INTO v_bill_id FROM public.finance_bills
    WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id AND payment_type = p_payment_type;
  END IF;
  v_result := v_result || jsonb_build_object('billId', v_bill_id);
  INSERT INTO public.finance_write_requests (
    tenant_id, client_request_id, actor_user_id, action, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, 'create_ppdb_bill', v_payload, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_ppdb_candidate_bill(UUID, UUID, TEXT, UUID, TEXT, NUMERIC, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_ppdb_candidate_bill(UUID, UUID, TEXT, UUID, TEXT, NUMERIC, UUID)
  TO service_role;

COMMENT ON COLUMN public.finance_bills.candidate_id IS
  'Candidate source for PPDB bills; retained after onboarding links the same bill to student_id.';
COMMENT ON FUNCTION public.create_tenant_ppdb_candidate_bill(UUID, UUID, TEXT, UUID, TEXT, NUMERIC, UUID) IS
  'Creates one idempotent tenant-scoped PPDB candidate bill in the Finance book.';

COMMIT;
