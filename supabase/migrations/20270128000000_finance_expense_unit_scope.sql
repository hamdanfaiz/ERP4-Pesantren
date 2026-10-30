-- Link each new Finance expense and its posted ledger row to a tenant-owned organization unit.
-- Existing financial rows remain readable and are left unmapped until an operator reconciles them.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN organization_unit_id UUID;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_tenant_organization_unit_fk
  FOREIGN KEY (tenant_id, organization_unit_id)
  REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX profiles_tenant_organization_unit_idx
  ON public.profiles (tenant_id, organization_unit_id, status)
  WHERE organization_unit_id IS NOT NULL;

ALTER TABLE public.finance_expenses
  ADD COLUMN unit_id UUID;
ALTER TABLE public.finance_expenses
  ADD CONSTRAINT finance_expenses_tenant_unit_fk
  FOREIGN KEY (tenant_id, unit_id)
  REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX finance_expenses_tenant_unit_date_idx
  ON public.finance_expenses (tenant_id, unit_id, expense_date DESC, id DESC);

ALTER TABLE public.finance_ledger
  ADD COLUMN unit_id UUID;
ALTER TABLE public.finance_ledger
  ADD CONSTRAINT finance_ledger_tenant_unit_fk
  FOREIGN KEY (tenant_id, unit_id)
  REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX finance_ledger_tenant_unit_posted_idx
  ON public.finance_ledger (tenant_id, unit_id, posted_at DESC, id DESC);

-- Prevent an older server from creating new expenses without a unit after this migration.
REVOKE ALL ON FUNCTION public.create_tenant_finance_expense(UUID, UUID, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_tenant_finance_expense_for_unit(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_unit_id UUID,
  p_category TEXT,
  p_description TEXT,
  p_department TEXT,
  p_amount NUMERIC,
  p_expense_date DATE,
  p_requester_name TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_actor_unit_id UUID;
  v_tenant_status TEXT;
  v_unit public.organization_units%ROWTYPE;
  v_control public.finance_controls%ROWTYPE;
  v_request public.finance_write_requests%ROWTYPE;
  v_id UUID;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_unit_id IS NULL OR p_expected_role IS NULL
    OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz')
    OR length(btrim(COALESCE(p_category, ''))) NOT BETWEEN 1 AND 100
    OR length(btrim(COALESCE(p_description, ''))) NOT BETWEEN 1 AND 1000
    OR length(btrim(COALESCE(p_department, ''))) NOT BETWEEN 1 AND 120
    OR p_amount IS NULL OR p_amount <= 0 OR p_amount <> trunc(p_amount)
    OR p_expense_date IS NULL
    OR length(btrim(COALESCE(p_requester_name, ''))) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Data pengajuan pengeluaran tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.organization_unit_id
    INTO v_tenant_status, v_role, v_actor_unit_id
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
    OR v_role IS DISTINCT FROM p_expected_role THEN
    RAISE EXCEPTION 'Profil aktif tidak sesuai dengan pengaju atau tenant' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_unit
  FROM public.organization_units AS u
  WHERE u.tenant_id = p_tenant_id AND u.id = p_unit_id AND u.status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unit aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  -- Ustadz can submit only for the unit assigned on their active tenant profile.
  IF v_role = 'ustadz' AND v_actor_unit_id IS DISTINCT FROM p_unit_id THEN
    RAISE EXCEPTION 'Unit pengajuan tidak sesuai dengan penugasan akun' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'unitId', p_unit_id,
    'category', btrim(p_category),
    'description', btrim(p_description),
    'department', btrim(p_department),
    'amount', p_amount,
    'expenseDate', p_expense_date
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.finance_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_request.action IS DISTINCT FROM 'create_expense'
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;

  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN
    RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.finance_expenses (
    tenant_id, unit_id, category, description, amount, expense_date, department,
    requester_user_id, requester_name
  ) VALUES (
    p_tenant_id, p_unit_id, btrim(p_category), btrim(p_description), p_amount,
    p_expense_date, btrim(p_department), p_actor_user_id, btrim(p_requester_name)
  ) RETURNING id INTO v_id;

  v_result := jsonb_build_object('success', true, 'expenseId', v_id, 'unitId', p_unit_id);
  INSERT INTO public.finance_write_requests (
    tenant_id, client_request_id, actor_user_id, action, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, 'create_expense', v_payload, v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_tenant_finance_expense(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_expense_id UUID,
  p_action TEXT,
  p_rejection_reason TEXT,
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
  v_expense public.finance_expenses%ROWTYPE;
  v_write_action TEXT;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expense_id IS NULL OR p_expected_role IS NULL
    OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_action IS NULL OR p_action NOT IN ('approve', 'reject')
    OR (p_action = 'reject' AND length(btrim(COALESCE(p_rejection_reason, ''))) NOT BETWEEN 1 AND 1000) THEN
    RAISE EXCEPTION 'Keputusan pengeluaran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants AS t
    JOIN public.profiles AS p ON p.tenant_id = t.id
    WHERE t.id = p_tenant_id AND t.status = 'active' AND p.user_id = p_actor_user_id
      AND p.status = 'active' AND lower(btrim(p.role::text)) = p_expected_role
  ) THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;

  v_write_action := CASE WHEN p_action = 'approve' THEN 'approve_expense' ELSE 'reject_expense' END;
  v_payload := jsonb_build_object(
    'expenseId', p_expense_id,
    'action', p_action,
    'rejectionReason', NULLIF(btrim(COALESCE(p_rejection_reason, '')), '')
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request FROM public.finance_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_request.action IS DISTINCT FROM v_write_action
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci keputusan telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result;
  END IF;

  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN
    RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_expense FROM public.finance_expenses
  WHERE tenant_id = p_tenant_id AND id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengeluaran tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF v_expense.status <> 'pending' THEN
    RAISE EXCEPTION 'Pengajuan sudah diproses' USING ERRCODE = '23514';
  END IF;
  IF v_expense.requester_user_id = p_actor_user_id THEN
    RAISE EXCEPTION 'Pengaju tidak boleh menyetujui atau menolak pengajuannya sendiri' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'approve' THEN
    UPDATE public.finance_expenses
    SET status = 'approved', reviewed_by_user_id = p_actor_user_id, reviewed_at = now(), rejection_reason = NULL
    WHERE tenant_id = p_tenant_id AND id = p_expense_id;
    INSERT INTO public.finance_ledger (
      tenant_id, unit_id, entry_type, source_type, source_id, description, amount, actor_user_id
    ) VALUES (
      p_tenant_id, v_expense.unit_id, 'expense', 'expense', p_expense_id,
      v_expense.description, v_expense.amount, p_actor_user_id
    );
  ELSE
    UPDATE public.finance_expenses
    SET status = 'rejected', reviewed_by_user_id = p_actor_user_id, reviewed_at = now(),
        rejection_reason = btrim(p_rejection_reason)
    WHERE tenant_id = p_tenant_id AND id = p_expense_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'expenseId', p_expense_id,
    'unitId', v_expense.unit_id,
    'status', CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'rejected' END
  );
  INSERT INTO public.finance_write_requests (
    tenant_id, client_request_id, actor_user_id, action, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, v_write_action, v_payload, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tenant_finance_expense_for_unit(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_finance_expense_for_unit(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, NUMERIC, DATE, TEXT, UUID
) TO service_role;
REVOKE ALL ON FUNCTION public.review_tenant_finance_expense(UUID, UUID, TEXT, UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_tenant_finance_expense(UUID, UUID, TEXT, UUID, TEXT, TEXT, UUID)
  TO service_role;

COMMENT ON COLUMN public.finance_expenses.unit_id IS
  'Organization unit for new expenses; existing rows remain NULL until deliberately reconciled.';
COMMENT ON COLUMN public.finance_ledger.unit_id IS
  'Organization unit inherited from an approved expense; non-expense ledger entries may remain NULL.';

COMMIT;
