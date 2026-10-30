-- Let Finance admins explicitly map historical expenses to tenant units.
-- An approved expense and its ledger entry are updated in the same transaction.
BEGIN;

CREATE INDEX finance_expenses_unmapped_unit_idx
  ON public.finance_expenses (tenant_id, expense_date DESC, id DESC)
  WHERE unit_id IS NULL;

CREATE TABLE public.finance_legacy_unit_assignment_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  expense_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, expense_id)
    REFERENCES public.finance_expenses (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.finance_legacy_unit_assignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_legacy_unit_assignment_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.finance_legacy_unit_assignment_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.finance_legacy_unit_assignment_requests TO service_role;
CREATE INDEX finance_legacy_unit_assignment_actor_idx
  ON public.finance_legacy_unit_assignment_requests (tenant_id, actor_user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_finance_unit_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.unit_id IS NOT NULL AND NEW.unit_id IS DISTINCT FROM OLD.unit_id THEN
    RAISE EXCEPTION 'Unit biaya tidak dapat dipindahkan setelah ditetapkan' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_expenses_unit_immutable
  BEFORE UPDATE OF unit_id ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.prevent_finance_unit_reassignment();
CREATE TRIGGER finance_ledger_unit_immutable
  BEFORE UPDATE OF unit_id ON public.finance_ledger
  FOR EACH ROW WHEN (OLD.source_type = 'expense')
  EXECUTE FUNCTION public.prevent_finance_unit_reassignment();
REVOKE ALL ON FUNCTION public.prevent_finance_unit_reassignment() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_tenant_unmapped_finance_expenses(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_expenses JSONB;
  v_expense_count BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Permintaan daftar pengeluaran tanpa unit tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin' AND v_permissions ? 'finance'
     AND NOT (jsonb_typeof(v_permissions -> 'finance') = 'boolean'
       AND v_permissions ->> 'finance' = 'true') THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Keuangan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_expense_count
  FROM public.finance_expenses AS e
  WHERE e.tenant_id = p_tenant_id AND e.unit_id IS NULL;

  SELECT COALESCE(jsonb_agg(item ORDER BY expense_date DESC, id), '[]'::jsonb)
    INTO v_expenses
  FROM (
    SELECT e.id, e.expense_date, jsonb_build_object(
      'id', e.id,
      'category', e.category,
      'description', e.description,
      'department', e.department,
      'amount', e.amount,
      'date', e.expense_date,
      'status', e.status,
      'requesterName', e.requester_name,
      'hasLedgerEntry', EXISTS (
        SELECT 1 FROM public.finance_ledger AS l
        WHERE l.tenant_id = e.tenant_id AND l.source_type = 'expense'
          AND l.source_id = e.id AND l.entry_type = 'expense'
      )
    ) AS item
    FROM public.finance_expenses AS e
    WHERE e.tenant_id = p_tenant_id AND e.unit_id IS NULL
    ORDER BY e.expense_date DESC, e.id
    LIMIT p_limit OFFSET p_offset
  ) AS pending_expenses;

  RETURN jsonb_build_object(
    'success', true,
    'expenses', v_expenses,
    'expenseCount', v_expense_count,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_tenant_finance_expense_unit(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_expense_id UUID,
  p_unit_id UUID,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_unit_status TEXT;
  v_expense public.finance_expenses%ROWTYPE;
  v_request public.finance_legacy_unit_assignment_requests%ROWTYPE;
  v_payload JSONB;
  v_result JSONB;
  v_ledger_count INTEGER := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_expense_id IS NULL
     OR p_unit_id IS NULL OR p_client_request_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Permintaan pemetaan pengeluaran tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin' AND v_permissions ? 'finance'
     AND NOT (jsonb_typeof(v_permissions -> 'finance') = 'boolean'
       AND v_permissions ->> 'finance' = 'true') THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Keuangan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object('expenseId', p_expense_id, 'unitId', p_unit_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance-expense-unit-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.finance_legacy_unit_assignment_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.expense_id IS DISTINCT FROM p_expense_id
       OR v_request.unit_id IS DISTINCT FROM p_unit_id
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan unit telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;

  SELECT u.status INTO v_unit_status
  FROM public.organization_units AS u
  WHERE u.tenant_id = p_tenant_id AND u.id = p_unit_id
  FOR SHARE;
  IF NOT FOUND OR v_unit_status <> 'active' THEN
    RAISE EXCEPTION 'Unit aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_expense
  FROM public.finance_expenses AS e
  WHERE e.tenant_id = p_tenant_id AND e.id = p_expense_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pengeluaran tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_expense.unit_id IS NOT NULL THEN
    RAISE EXCEPTION 'Unit pengeluaran sudah ditetapkan dan tidak dapat dipindahkan' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.finance_ledger AS l
    WHERE l.tenant_id = p_tenant_id AND l.source_type = 'expense'
      AND l.source_id = p_expense_id AND l.entry_type = 'expense'
      AND l.unit_id IS NOT NULL AND l.unit_id IS DISTINCT FROM p_unit_id
  ) THEN
    RAISE EXCEPTION 'Unit buku besar tidak cocok dengan pemetaan pengeluaran' USING ERRCODE = '23514';
  END IF;
  IF v_expense.status = 'approved' AND NOT EXISTS (
    SELECT 1 FROM public.finance_ledger AS l
    WHERE l.tenant_id = p_tenant_id AND l.source_type = 'expense'
      AND l.source_id = p_expense_id AND l.entry_type = 'expense'
  ) THEN
    RAISE EXCEPTION 'Pengeluaran disetujui belum memiliki catatan buku besar' USING ERRCODE = '23503';
  END IF;

  UPDATE public.finance_expenses
  SET unit_id = p_unit_id, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_expense_id AND unit_id IS NULL;
  UPDATE public.finance_ledger
  SET unit_id = p_unit_id
  WHERE tenant_id = p_tenant_id AND source_type = 'expense'
    AND source_id = p_expense_id AND entry_type = 'expense' AND unit_id IS NULL;
  GET DIAGNOSTICS v_ledger_count = ROW_COUNT;

  v_result := jsonb_build_object(
    'success', true,
    'expenseId', p_expense_id,
    'unitId', p_unit_id,
    'ledgerEntriesUpdated', v_ledger_count
  );
  INSERT INTO public.finance_legacy_unit_assignment_requests (
    tenant_id, client_request_id, actor_user_id, expense_id, unit_id, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, p_expense_id, p_unit_id, v_payload, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_unmapped_finance_expenses(UUID, UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_unmapped_finance_expenses(UUID, UUID, TEXT, INTEGER, INTEGER)
  TO service_role;
REVOKE ALL ON FUNCTION public.assign_tenant_finance_expense_unit(UUID, UUID, TEXT, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tenant_finance_expense_unit(UUID, UUID, TEXT, UUID, UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.get_tenant_unmapped_finance_expenses(UUID, UUID, TEXT, INTEGER, INTEGER) IS
  'Paginated Finance-only Admin queue of historical expenses that need explicit tenant-unit mapping.';
COMMENT ON FUNCTION public.assign_tenant_finance_expense_unit(UUID, UUID, TEXT, UUID, UUID, UUID) IS
  'One-time idempotent Finance Admin mapping that assigns a legacy expense and its ledger entries atomically.';
COMMENT ON TABLE public.finance_legacy_unit_assignment_requests IS
  'Append-only idempotency and audit records for explicit Admin mapping of legacy Finance expense units.';

COMMIT;
