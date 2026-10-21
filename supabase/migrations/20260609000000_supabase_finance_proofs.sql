-- Private Supabase Storage bucket and transactional metadata for finance proofs.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'finance-proofs',
  'finance-proofs',
  false,
  3145728,
  ARRAY['image/png', 'image/jpeg', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.attach_ppdb_finance_payment_proof(
  p_tenant_id UUID,
  p_billing_id TEXT,
  p_student_ref TEXT,
  p_storage_path TEXT,
  p_file_name TEXT,
  p_payment_method TEXT,
  p_actor_uid TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_bill public.finance_billings%ROWTYPE;
  v_finance_locked BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR p_billing_id IS NULL
    OR length(btrim(p_billing_id)) NOT BETWEEN 1 AND 180
    OR p_storage_path IS NULL OR length(p_storage_path) > 600
    OR p_file_name IS NULL OR length(btrim(p_file_name)) NOT BETWEEN 1 AND 180
    OR p_payment_method IS NULL OR length(btrim(p_payment_method)) NOT BETWEEN 1 AND 120
    OR p_actor_uid IS NULL OR length(btrim(p_actor_uid)) NOT BETWEEN 1 AND 160
    OR array_length(string_to_array(p_storage_path, '/'), 1) <> 4
    OR split_part(p_storage_path, '/', 1) <> p_tenant_id::TEXT
    OR split_part(p_storage_path, '/', 2) !~ '^[A-Za-z0-9_-]{1,180}
    RAISE EXCEPTION 'Data bukti pembayaran tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT finance_locked INTO v_finance_locked
    FROM public.finance_controls
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;
  IF COALESCE(v_finance_locked, false) THEN
    RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_bill FROM public.finance_billings
    WHERE tenant_id = p_tenant_id AND id = p_billing_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF p_student_ref IS NOT NULL AND v_bill.student_ref IS DISTINCT FROM p_student_ref THEN
    RAISE EXCEPTION 'Tagihan tidak terhubung ke santri ini' USING ERRCODE = '42501';
  END IF;
  IF v_bill.status NOT IN ('Unpaid', 'Overdue', 'Partial') THEN
    RAISE EXCEPTION 'Status tagihan tidak menerima bukti pembayaran baru' USING ERRCODE = '55000';
  END IF;

  UPDATE public.finance_billings
  SET status = 'Verification',
      payment_method = btrim(p_payment_method),
      proof_file = btrim(p_file_name),
      proof_storage_path = p_storage_path,
      updated_by_uid = p_actor_uid,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_billing_id;

  RETURN jsonb_build_object('id', p_billing_id, 'status', 'Verification');
END;
$$;

REVOKE ALL ON FUNCTION public.attach_ppdb_finance_payment_proof(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_ppdb_finance_payment_proof(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;

    OR split_part(p_storage_path, '/', 3) <> left(regexp_replace(p_billing_id, '[^A-Za-z0-9_-]', '_', 'g'), 180)
    OR split_part(p_storage_path, '/', 4) !~ '^[A-Za-z0-9_.-]+
    RAISE EXCEPTION 'Data bukti pembayaran tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT finance_locked INTO v_finance_locked
    FROM public.finance_controls
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;
  IF COALESCE(v_finance_locked, false) THEN
    RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_bill FROM public.finance_billings
    WHERE tenant_id = p_tenant_id AND id = p_billing_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF p_student_ref IS NOT NULL AND v_bill.student_ref IS DISTINCT FROM p_student_ref THEN
    RAISE EXCEPTION 'Tagihan tidak terhubung ke santri ini' USING ERRCODE = '42501';
  END IF;
  IF v_bill.status NOT IN ('Unpaid', 'Overdue', 'Partial') THEN
    RAISE EXCEPTION 'Status tagihan tidak menerima bukti pembayaran baru' USING ERRCODE = '55000';
  END IF;

  UPDATE public.finance_billings
  SET status = 'Verification',
      payment_method = btrim(p_payment_method),
      proof_file = btrim(p_file_name),
      proof_storage_path = p_storage_path,
      updated_by_uid = p_actor_uid,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_billing_id;

  RETURN jsonb_build_object('id', p_billing_id, 'status', 'Verification');
END;
$$;

REVOKE ALL ON FUNCTION public.attach_ppdb_finance_payment_proof(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_ppdb_finance_payment_proof(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;
 THEN
    RAISE EXCEPTION 'Data bukti pembayaran tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT finance_locked INTO v_finance_locked
    FROM public.finance_controls
    WHERE tenant_id = p_tenant_id
    FOR UPDATE;
  IF COALESCE(v_finance_locked, false) THEN
    RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_bill FROM public.finance_billings
    WHERE tenant_id = p_tenant_id AND id = p_billing_id
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF p_student_ref IS NOT NULL AND v_bill.student_ref IS DISTINCT FROM p_student_ref THEN
    RAISE EXCEPTION 'Tagihan tidak terhubung ke santri ini' USING ERRCODE = '42501';
  END IF;
  IF v_bill.status NOT IN ('Unpaid', 'Overdue', 'Partial') THEN
    RAISE EXCEPTION 'Status tagihan tidak menerima bukti pembayaran baru' USING ERRCODE = '55000';
  END IF;

  UPDATE public.finance_billings
  SET status = 'Verification',
      payment_method = btrim(p_payment_method),
      proof_file = btrim(p_file_name),
      proof_storage_path = p_storage_path,
      updated_by_uid = p_actor_uid,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_billing_id;

  RETURN jsonb_build_object('id', p_billing_id, 'status', 'Verification');
END;
$$;

REVOKE ALL ON FUNCTION public.attach_ppdb_finance_payment_proof(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_ppdb_finance_payment_proof(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;
