-- Rejection workflow for PPDB payment records on Supabase.
BEGIN;

CREATE OR REPLACE FUNCTION public.reject_ppdb_finance_payment(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_payment_type TEXT,
  p_reason TEXT,
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
  v_payment JSONB;
  v_fee JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR p_payment_type IS NULL OR p_payment_type NOT IN ('registration', 'tuition')
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000
    OR p_actor_uid IS NULL OR length(btrim(p_actor_uid)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'Alasan atau identitas penolakan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_candidate FROM public.candidates
    WHERE tenant_id = p_tenant_id AND id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kandidat tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_bill FROM public.finance_billings
    WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id AND payment_type = p_payment_type
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan PPDB belum diterbitkan' USING ERRCODE = 'P0002'; END IF;
  IF v_bill.status <> 'Verification' OR v_bill.paid_amount <> 0 THEN
    RAISE EXCEPTION 'Tagihan tidak lagi menunggu verifikasi atau sudah memiliki pembayaran' USING ERRCODE = '23505';
  END IF;

  UPDATE public.finance_billings
  SET status = 'Unpaid',
      details = jsonb_set(COALESCE(details, '{}'::jsonb), '{rejectionReason}', to_jsonb(btrim(p_reason)), true),
      updated_by_uid = p_actor_uid,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_bill.id
  RETURNING * INTO v_bill;

  v_fee_key := CASE WHEN p_payment_type = 'registration' THEN 'registrationFee' ELSE 'tuitionFee' END;
  v_payment := COALESCE(v_candidate.workflow_data->'payment', '{}'::jsonb);
  v_fee := jsonb_build_object(
    'amount', v_bill.amount,
    'paidAmount', 0,
    'status', 'Unpaid',
    'invoiceId', v_bill.id,
    'rejectionReason', btrim(p_reason)
  );
  v_payment := public.jsonb_deep_merge(v_payment, jsonb_build_object(v_fee_key, v_fee));
  UPDATE public.candidates
  SET workflow_data = public.jsonb_deep_merge(
        COALESCE(workflow_data, '{}'::jsonb),
        jsonb_build_object('payment', v_payment)
      ),
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id;

  RETURN jsonb_build_object('id', v_bill.id, 'status', 'Unpaid');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_ppdb_finance_payment(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_ppdb_finance_payment(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
