-- Aggregate tenant dashboard data server-side; never expose cross-module rows to browsers.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_tenant_dashboard_snapshot(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_allow_ppdb BOOLEAN,
  p_allow_master_data BOOLEAN,
  p_allow_finance BOOLEAN,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_ppdb JSONB := jsonb_build_object('enabled', false);
  v_master_data JSONB := jsonb_build_object('enabled', false);
  v_finance JSONB := jsonb_build_object('enabled', false);
  v_result JSONB;
  v_monthly_trend JSONB := '[]'::JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_allow_ppdb IS NULL OR p_allow_master_data IS NULL OR p_allow_finance IS NULL
    OR p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end
    OR p_period_end > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Dashboard request is invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Dashboard tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF NOT FOUND OR v_profile.role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Dashboard access is restricted to active tenant administrators' USING ERRCODE = '42501';
  END IF;

  IF p_allow_ppdb AND v_profile.role <> 'super_admin'
    AND v_profile.module_permissions ? 'ppdb'
    AND (v_profile.module_permissions->>'ppdb') <> 'true' THEN
    RAISE EXCEPTION 'PPDB dashboard access is not permitted' USING ERRCODE = '42501';
  END IF;
  IF p_allow_master_data AND v_profile.role <> 'super_admin'
    AND v_profile.module_permissions ? 'master-data'
    AND (v_profile.module_permissions->>'master-data') <> 'true' THEN
    RAISE EXCEPTION 'Master Data dashboard access is not permitted' USING ERRCODE = '42501';
  END IF;
  IF p_allow_finance AND v_profile.role <> 'super_admin'
    AND v_profile.module_permissions ? 'finance'
    AND (v_profile.module_permissions->>'finance') <> 'true' THEN
    RAISE EXCEPTION 'Finance dashboard access is not permitted' USING ERRCODE = '42501';
  END IF;

  IF p_allow_ppdb THEN
    SELECT jsonb_build_object(
      'enabled', true,
      'total', count(*),
      'accepted', count(*) FILTER (WHERE stage = 'Accepted'),
      'pending', count(*) FILTER (WHERE stage IS NULL OR stage NOT IN ('Accepted', 'Rejected', 'Withdrawn')),
      'stages', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('stage', grouped.stage, 'count', grouped.total) ORDER BY grouped.stage)
        FROM (
          SELECT COALESCE(stage::TEXT, 'Belum ditentukan') AS stage, count(*) AS total
          FROM public.candidates
          WHERE tenant_id = p_tenant_id
          GROUP BY stage
        ) AS grouped
      ), '[]'::JSONB)
    ) INTO v_ppdb
    FROM public.candidates
    WHERE tenant_id = p_tenant_id;
  END IF;

  IF p_allow_master_data THEN
    SELECT jsonb_build_object(
      'enabled', true,
      'activeStudents', count(*) FILTER (WHERE lower(btrim(status)) IN ('active', 'aktif', 'santri aktif')),
      'maleStudents', count(*) FILTER (WHERE lower(btrim(status)) IN ('active', 'aktif', 'santri aktif') AND gender = 'L'),
      'femaleStudents', count(*) FILTER (WHERE lower(btrim(status)) IN ('active', 'aktif', 'santri aktif') AND gender = 'P')
    ) INTO v_master_data
    FROM public.students
    WHERE tenant_id = p_tenant_id;
  END IF;

  IF p_allow_finance THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'month', to_char(month_start AT TIME ZONE 'UTC', 'YYYY-MM'),
      'income', income,
      'expense', expense,
      'walletDeposits', wallet_deposits,
      'walletRedemptions', wallet_redemptions
    ) ORDER BY month_start), '[]'::JSONB)
    INTO v_monthly_trend
    FROM (
      SELECT months.month_start,
        COALESCE(sum(ledger.amount) FILTER (WHERE ledger.entry_type = 'income'), 0) AS income,
        COALESCE(sum(ledger.amount) FILTER (WHERE ledger.entry_type = 'expense'), 0) AS expense,
        COALESCE(sum(ledger.amount) FILTER (WHERE ledger.entry_type = 'custodial_inflow'), 0) AS wallet_deposits,
        COALESCE(sum(ledger.amount) FILTER (WHERE ledger.entry_type = 'custodial_release'), 0) AS wallet_redemptions
      FROM generate_series(
        date_trunc('month', now()) - interval '11 months',
        date_trunc('month', now()),
        interval '1 month'
      ) AS months(month_start)
      LEFT JOIN public.finance_ledger AS ledger
        ON ledger.tenant_id = p_tenant_id
        AND ledger.posted_at >= months.month_start
        AND ledger.posted_at < months.month_start + interval '1 month'
      GROUP BY months.month_start
    ) AS monthly;

    SELECT jsonb_build_object(
      'enabled', true,
      'openBillCount', COALESCE((SELECT count(*) FROM public.finance_bills WHERE tenant_id = p_tenant_id AND status <> 'paid'), 0),
      'outstandingAmount', COALESCE((SELECT sum(greatest(amount - paid_amount, 0)) FROM public.finance_bills WHERE tenant_id = p_tenant_id AND status <> 'paid'), 0),
      'unpaidCount', COALESCE((SELECT count(*) FROM public.finance_bills WHERE tenant_id = p_tenant_id AND status = 'unpaid'), 0),
      'partialCount', COALESCE((SELECT count(*) FROM public.finance_bills WHERE tenant_id = p_tenant_id AND status = 'partial'), 0),
      'verificationCount', COALESCE((SELECT count(*) FROM public.finance_bills WHERE tenant_id = p_tenant_id AND status = 'verification'), 0),
      'periodIncome', COALESCE((SELECT sum(amount) FROM public.finance_ledger WHERE tenant_id = p_tenant_id AND entry_type = 'income' AND posted_at >= p_period_start AND posted_at <= p_period_end), 0),
      'periodExpense', COALESCE((SELECT sum(amount) FROM public.finance_ledger WHERE tenant_id = p_tenant_id AND entry_type = 'expense' AND posted_at >= p_period_start AND posted_at <= p_period_end), 0),
      'periodWalletDeposits', COALESCE((SELECT sum(amount) FROM public.finance_ledger WHERE tenant_id = p_tenant_id AND entry_type = 'custodial_inflow' AND posted_at >= p_period_start AND posted_at <= p_period_end), 0),
      'periodWalletRedemptions', COALESCE((SELECT sum(amount) FROM public.finance_ledger WHERE tenant_id = p_tenant_id AND entry_type = 'custodial_release' AND posted_at >= p_period_start AND posted_at <= p_period_end), 0),
      'walletLiability', COALESCE((SELECT sum(balance) FROM public.cooperative_wallets WHERE tenant_id = p_tenant_id), 0),
      'monthlyTrend', v_monthly_trend
    ) INTO v_finance;
  END IF;

  v_result := jsonb_build_object(
    'ppdb', v_ppdb,
    'masterData', v_master_data,
    'finance', v_finance,
    'periodStart', p_period_start,
    'periodEnd', p_period_end
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_dashboard_snapshot(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_dashboard_snapshot(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_tenant_dashboard_snapshot(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ)
  IS 'Returns tenant-scoped aggregate dashboard metrics after active admin, tenant, and module permission checks.';

COMMIT;
