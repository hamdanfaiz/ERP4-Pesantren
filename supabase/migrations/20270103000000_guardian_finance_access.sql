-- Replace the finance proof authorization predicate with canonical guardian links.
-- The function remains service-role only; all payment state updates are unchanged.
BEGIN;

CREATE OR REPLACE FUNCTION public.register_tenant_finance_payment_proof(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_bill_id UUID, p_storage_path TEXT, p_file_name TEXT, p_payment_method TEXT,
  p_file_sha256 TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_role TEXT;
  v_profile public.profiles%ROWTYPE;
  v_control public.finance_controls%ROWTYPE;
  v_bill public.finance_bills%ROWTYPE;
  v_request public.finance_write_requests%ROWTYPE;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_bill_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('wali_santri', 'admin', 'super_admin')
    OR p_storage_path IS NULL OR length(p_storage_path) > 900 OR p_storage_path NOT LIKE 'financeProofs/%'
    OR position('..' IN p_storage_path) > 0 OR p_file_name IS NULL OR length(p_file_name) NOT BETWEEN 1 AND 120
    OR p_payment_method IS NULL OR p_payment_method NOT IN ('BSI', 'Muamalat', 'MandiriSyariah')
    OR p_file_sha256 IS NULL OR p_file_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Data bukti pembayaran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  v_role := lower(btrim(v_profile.role::text));
  IF v_role IS DISTINCT FROM p_expected_role THEN
    RAISE EXCEPTION 'Profil aktif tidak sesuai dengan pengirim bukti' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_bill
  FROM public.finance_bills
  WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'wali_santri'
     AND NOT public.guardian_can_access_student(p_tenant_id, p_actor_user_id, v_bill.student_id) THEN
    RAISE EXCEPTION 'Tagihan tidak terhubung ke akun wali ini' USING ERRCODE = '42501';
  END IF;
  IF position(('/' || replace(p_bill_id::text, '/', '') || '/') IN p_storage_path) = 0 THEN
    RAISE EXCEPTION 'Lokasi bukti tidak cocok dengan tagihan' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object(
    'billId', p_bill_id, 'fileName', p_file_name,
    'paymentMethod', p_payment_method, 'fileSha256', lower(p_file_sha256)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.finance_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.action IS DISTINCT FROM 'payment_proof'
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci unggahan telah dipakai untuk berkas berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
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
  SELECT * INTO v_bill
  FROM public.finance_bills
  WHERE tenant_id = p_tenant_id AND id = p_bill_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'wali_santri'
     AND NOT public.guardian_can_access_student(p_tenant_id, p_actor_user_id, v_bill.student_id) THEN
    RAISE EXCEPTION 'Tagihan tidak terhubung ke akun wali ini' USING ERRCODE = '42501';
  END IF;
  IF v_bill.status NOT IN ('unpaid', 'partial') THEN
    RAISE EXCEPTION 'Tagihan tidak menerima bukti baru' USING ERRCODE = '23514';
  END IF;
  UPDATE public.finance_bills
  SET status = 'verification',
      payment_method = 'Transfer Manual (' || p_payment_method || ')',
      proof_file = p_file_name,
      proof_storage_path = p_storage_path,
      proof_storage_provider = 'supabase',
      uploaded_at = now(),
      rejection_reason = NULL
  WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  v_result := jsonb_build_object('success', true, 'billId', p_bill_id, 'status', 'verification');
  INSERT INTO public.finance_write_requests (
    tenant_id, client_request_id, actor_user_id, action, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, 'payment_proof', v_payload, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tenant_finance_payment_proof(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_tenant_finance_payment_proof(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID)
  TO service_role;

COMMIT;