-- Scope RKAT plans to a tenant-owned unit while preserving legacy plans for explicit mapping.
BEGIN;

ALTER TABLE public.finance_budget_plans ADD COLUMN unit_id UUID;
ALTER TABLE public.finance_budget_plans
  ADD CONSTRAINT finance_budget_plans_tenant_unit_fk
  FOREIGN KEY (tenant_id, unit_id) REFERENCES public.organization_units(tenant_id, id)
  ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.finance_budget_plans
  ADD CONSTRAINT finance_budget_plans_unit_required_check
  CHECK (unit_id IS NOT NULL) NOT VALID;

ALTER TABLE public.finance_budget_mutation_requests
  DROP CONSTRAINT IF EXISTS finance_budget_mutation_requests_action_check;
ALTER TABLE public.finance_budget_mutation_requests
  ADD CONSTRAINT finance_budget_mutation_requests_action_check
  CHECK (action IN ('save_draft', 'approve', 'close', 'map_legacy_unit')) NOT VALID;

ALTER TABLE public.finance_budget_plans
  DROP CONSTRAINT IF EXISTS finance_budget_plans_tenant_id_period_start_period_end_key;
CREATE UNIQUE INDEX finance_budget_plans_legacy_period_uidx
  ON public.finance_budget_plans (tenant_id, period_start, period_end)
  WHERE unit_id IS NULL;
CREATE UNIQUE INDEX finance_budget_plans_tenant_unit_period_uidx
  ON public.finance_budget_plans (tenant_id, unit_id, period_start, period_end)
  WHERE unit_id IS NOT NULL;
CREATE INDEX finance_budget_plans_tenant_unit_period_idx
  ON public.finance_budget_plans (tenant_id, unit_id, period_start DESC, id DESC);

CREATE OR REPLACE FUNCTION public.get_tenant_finance_budget_snapshot(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_plans JSONB;
  v_units JSONB;
  v_finance_locked BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_expected_role IS NULL
    OR p_expected_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Akun tidak dapat membaca anggaran tenant' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant aktif tidak ditemukan' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN
    RAISE EXCEPTION 'Profil Admin anggaran tidak cocok dengan tenant aktif' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', u.id, 'code', u.code, 'name', u.name, 'status', u.status
  ) ORDER BY lower(u.name), u.code, u.id), '[]'::jsonb)
  INTO v_units
  FROM public.organization_units AS u
  WHERE u.tenant_id = p_tenant_id;

  SELECT COALESCE(fc.finance_locked, false) INTO v_finance_locked
  FROM (SELECT 1) AS singleton
  LEFT JOIN public.finance_controls AS fc ON fc.tenant_id = p_tenant_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'unitId', p.unit_id,
      'unitCode', u.code,
      'unitName', u.name,
      'unitStatus', u.status,
      'needsUnitMapping', p.unit_id IS NULL,
      'periodLabel', p.period_label,
      'periodStart', p.period_start,
      'periodEnd', p.period_end,
      'notes', p.notes,
      'status', p.status,
      'createdByUserId', p.created_by_user_id,
      'updatedByUserId', p.updated_by_user_id,
      'approvedByUserId', p.approved_by_user_id,
      'approvedAt', p.approved_at,
      'closedByUserId', p.closed_by_user_id,
      'closedAt', p.closed_at,
      'createdAt', p.created_at,
      'updatedAt', p.updated_at,
      'lines', COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'department', l.department,
            'category', l.category,
            'allocatedAmount', l.allocated_amount,
            'actualAmount', CASE WHEN p.unit_id IS NULL THEN NULL ELSE COALESCE((
              SELECT sum(e.amount)
              FROM public.finance_expenses AS e
              JOIN public.finance_ledger AS fl
                ON fl.tenant_id = e.tenant_id
                AND fl.source_type = 'expense'
                AND fl.source_id = e.id
                AND fl.entry_type = 'expense'
                AND fl.unit_id = e.unit_id
              WHERE e.tenant_id = l.tenant_id
                AND e.unit_id = p.unit_id
                AND e.status = 'approved'
                AND e.expense_date BETWEEN p.period_start AND p.period_end
                AND lower(btrim(e.department)) = lower(btrim(l.department))
                AND lower(btrim(e.category)) = lower(btrim(l.category))
            ), 0) END
          ) ORDER BY lower(btrim(l.department)), lower(btrim(l.category)), l.id
        )
        FROM public.finance_budget_lines AS l
        WHERE l.tenant_id = p.tenant_id AND l.plan_id = p.id
      ), '[]'::jsonb)
    ) ORDER BY p.period_start DESC, p.id DESC
  ), '[]'::jsonb)
  INTO v_plans
  FROM public.finance_budget_plans AS p
  LEFT JOIN public.organization_units AS u ON u.tenant_id = p.tenant_id AND u.id = p.unit_id
  WHERE p.tenant_id = p_tenant_id;

  RETURN jsonb_build_object('success', true, 'plans', v_plans, 'units', v_units, 'financeLocked', v_finance_locked);
END;
$$;


CREATE OR REPLACE FUNCTION public.manage_tenant_finance_budget(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_action TEXT,
  p_plan_id UUID,
  p_payload JSONB,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_plan public.finance_budget_plans%ROWTYPE;
  v_request public.finance_budget_mutation_requests%ROWTYPE;
  v_period_start DATE;
  v_period_end DATE;
  v_period_label TEXT;
  v_notes TEXT;
  v_lines JSONB;
  v_payload JSONB;
  v_result JSONB;
  v_plan_id UUID;
  v_unit_id UUID;
  v_invalid_count INTEGER;
  v_duplicate_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_action IS NULL OR p_action NOT IN ('save_draft', 'approve', 'close', 'map_legacy_unit')
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Permintaan anggaran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant aktif tidak ditemukan' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN
    RAISE EXCEPTION 'Profil Admin anggaran tidak cocok dengan tenant aktif' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'save_draft' THEN
    IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Baris anggaran harus berupa daftar' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Anggaran harus memiliki 1 sampai 500 baris' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'lines') AS x(value) WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'object') THEN
      RAISE EXCEPTION 'Format baris anggaran tidak valid' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_period_start := (p_payload->>'periodStart')::DATE;
      v_period_end := (p_payload->>'periodEnd')::DATE;
    EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
      RAISE EXCEPTION 'Tanggal periode anggaran tidak valid' USING ERRCODE = '22023';
    END;
    v_period_label := btrim(COALESCE(p_payload->>'periodLabel', ''));
    v_notes := COALESCE(p_payload->>'notes', '');
    IF length(v_period_label) NOT BETWEEN 1 AND 120 OR length(v_notes) > 2000
      OR v_period_start IS NULL OR v_period_end IS NULL
      OR v_period_end < v_period_start THEN
      RAISE EXCEPTION 'Label atau rentang periode anggaran tidak valid' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_unit_id := (p_payload->>'unitId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Unit anggaran tidak valid' USING ERRCODE = '22023';
    END;
    IF v_unit_id IS NULL THEN
      RAISE EXCEPTION 'Pilih unit aktif pada tenant ini untuk rencana anggaran' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.organization_units AS unit
    WHERE unit.tenant_id = p_tenant_id AND unit.id = v_unit_id AND unit.status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pilih unit aktif pada tenant ini untuk rencana anggaran' USING ERRCODE = '42501';
    END IF;
    SELECT count(*)::INTEGER INTO v_invalid_count
    FROM jsonb_to_recordset(p_payload->'lines') AS x(department TEXT, category TEXT, "allocatedAmount" NUMERIC)
    WHERE length(btrim(COALESCE(x.department, ''))) NOT BETWEEN 1 AND 120
      OR length(btrim(COALESCE(x.category, ''))) NOT BETWEEN 1 AND 100
      OR x."allocatedAmount" IS NULL OR x."allocatedAmount" <= 0
      OR x."allocatedAmount" <> trunc(x."allocatedAmount") OR x."allocatedAmount" > 999999999999;
    IF v_invalid_count > 0 THEN
      RAISE EXCEPTION 'Bagian, kategori, atau nominal anggaran tidak valid' USING ERRCODE = '22023';
    END IF;
    SELECT count(*)::INTEGER INTO v_duplicate_count FROM (
      SELECT lower(btrim(x.department)), lower(btrim(x.category))
      FROM jsonb_to_recordset(p_payload->'lines') AS x(department TEXT, category TEXT, "allocatedAmount" NUMERIC)
      GROUP BY lower(btrim(x.department)), lower(btrim(x.category)) HAVING count(*) > 1
    ) AS duplicates;
    IF v_duplicate_count > 0 THEN
      RAISE EXCEPTION 'Kategori dan bagian yang sama hanya boleh muncul satu kali' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_agg(jsonb_build_object(
      'department', btrim(x.department),
      'category', btrim(x.category),
      'allocatedAmount', x."allocatedAmount"
    ) ORDER BY lower(btrim(x.department)), lower(btrim(x.category))) INTO v_lines
    FROM jsonb_to_recordset(p_payload->'lines') AS x(department TEXT, category TEXT, "allocatedAmount" NUMERIC);
    v_payload := jsonb_build_object(
      'unitId', v_unit_id,
      'periodLabel', v_period_label,
      'periodStart', v_period_start,
      'periodEnd', v_period_end,
      'notes', v_notes,
      'lines', v_lines
    );
  ELSIF p_action = 'map_legacy_unit' THEN
    IF p_plan_id IS NULL OR p_payload ? 'lines' OR (SELECT count(*) FROM jsonb_object_keys(p_payload)) <> 1 THEN
      RAISE EXCEPTION 'Isi pemetaan unit anggaran tidak valid' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_unit_id := (p_payload->>'unitId')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Unit anggaran tidak valid' USING ERRCODE = '22023';
    END;
    IF v_unit_id IS NULL THEN
      RAISE EXCEPTION 'Pilih unit pesantren untuk memetakan rencana lama' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.organization_units AS unit
    WHERE unit.tenant_id = p_tenant_id AND unit.id = v_unit_id
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unit pemetaan tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
    END IF;
    v_payload := jsonb_build_object('unitId', v_unit_id);
  ELSE
    IF p_plan_id IS NULL OR p_payload <> '{}'::JSONB THEN
      RAISE EXCEPTION 'ID dan isi permintaan perubahan status anggaran tidak valid' USING ERRCODE = '22023';
    END IF;
    v_payload := '{}'::JSONB;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-budget-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_request FROM public.finance_budget_mutation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_request.action IS DISTINCT FROM p_action
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan anggaran telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;

  IF p_action IN ('save_draft', 'map_legacy_unit') THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-budget-unit:' || p_tenant_id::TEXT || ':' || v_unit_id::TEXT, 0));
  END IF;
  IF p_action = 'save_draft' THEN
    IF EXISTS (
      SELECT 1 FROM public.finance_budget_plans AS existing
      WHERE existing.tenant_id = p_tenant_id
        AND existing.unit_id = v_unit_id
        AND existing.id IS DISTINCT FROM p_plan_id
        AND existing.period_start <= v_period_end
        AND existing.period_end >= v_period_start
    ) THEN
      RAISE EXCEPTION 'Rentang periode bertabrakan dengan rencana anggaran pada unit ini' USING ERRCODE = '23P01';
    END IF;
    IF p_plan_id IS NULL THEN
      INSERT INTO public.finance_budget_plans (
        tenant_id, unit_id, period_label, period_start, period_end, notes, created_by_user_id, updated_by_user_id
      ) VALUES (
        p_tenant_id, v_unit_id, v_period_label, v_period_start, v_period_end, v_notes, p_actor_user_id, p_actor_user_id
      ) RETURNING id INTO v_plan_id;
    ELSE
      SELECT * INTO v_plan FROM public.finance_budget_plans
      WHERE tenant_id = p_tenant_id AND id = p_plan_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Rencana anggaran tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
      IF v_plan.status <> 'draft' THEN RAISE EXCEPTION 'Hanya rancangan anggaran yang dapat diubah' USING ERRCODE = '55000'; END IF;
      UPDATE public.finance_budget_plans SET
        unit_id = v_unit_id, period_label = v_period_label, period_start = v_period_start, period_end = v_period_end,
        notes = v_notes, updated_by_user_id = p_actor_user_id, updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = p_plan_id;
      v_plan_id := p_plan_id;
      DELETE FROM public.finance_budget_lines WHERE tenant_id = p_tenant_id AND plan_id = v_plan_id;
    END IF;
    INSERT INTO public.finance_budget_lines (tenant_id, plan_id, department, category, allocated_amount)
    SELECT p_tenant_id, v_plan_id, btrim(x.department), btrim(x.category), x."allocatedAmount"
    FROM jsonb_to_recordset(v_lines) AS x(department TEXT, category TEXT, "allocatedAmount" NUMERIC);
    v_result := jsonb_build_object('success', true, 'planId', v_plan_id, 'status', 'draft');
  ELSIF p_action = 'map_legacy_unit' THEN
    SELECT * INTO v_plan FROM public.finance_budget_plans
    WHERE tenant_id = p_tenant_id AND id = p_plan_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rencana anggaran tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
    IF v_plan.unit_id IS NOT NULL THEN RAISE EXCEPTION 'Rencana anggaran sudah memiliki unit' USING ERRCODE = '55000'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.finance_budget_plans AS existing
      WHERE existing.tenant_id = p_tenant_id AND existing.unit_id = v_unit_id
        AND existing.id IS DISTINCT FROM p_plan_id
        AND existing.period_start <= v_plan.period_end
        AND existing.period_end >= v_plan.period_start
    ) THEN
      RAISE EXCEPTION 'Rentang periode bertabrakan dengan rencana anggaran pada unit ini' USING ERRCODE = '23P01';
    END IF;
    UPDATE public.finance_budget_plans SET unit_id = v_unit_id, updated_by_user_id = p_actor_user_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_plan_id;
    v_plan_id := p_plan_id;
    v_result := jsonb_build_object('success', true, 'planId', v_plan_id, 'unitId', v_unit_id, 'status', v_plan.status, 'mapped', true);
  ELSIF p_action = 'approve' THEN
    SELECT * INTO v_plan FROM public.finance_budget_plans
    WHERE tenant_id = p_tenant_id AND id = p_plan_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rencana anggaran tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
    IF v_plan.status <> 'draft' THEN RAISE EXCEPTION 'Hanya rancangan yang dapat disetujui' USING ERRCODE = '55000'; END IF;
    IF v_plan.unit_id IS NULL THEN RAISE EXCEPTION 'Petakan rencana lama ke unit sebelum menyetujui' USING ERRCODE = '55000'; END IF;
    PERFORM 1 FROM public.organization_units
    WHERE tenant_id = p_tenant_id AND id = v_plan.unit_id AND status = 'active'
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unit rencana harus aktif sebelum disetujui' USING ERRCODE = '55000';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.finance_budget_lines WHERE tenant_id = p_tenant_id AND plan_id = p_plan_id) THEN
      RAISE EXCEPTION 'Rencana anggaran belum memiliki alokasi' USING ERRCODE = '23514';
    END IF;
    UPDATE public.finance_budget_plans SET status = 'approved', approved_by_user_id = p_actor_user_id,
      approved_at = now(), updated_by_user_id = p_actor_user_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_plan_id;
    v_plan_id := p_plan_id;
    v_result := jsonb_build_object('success', true, 'planId', v_plan_id, 'status', 'approved');
  ELSE
    SELECT * INTO v_plan FROM public.finance_budget_plans
    WHERE tenant_id = p_tenant_id AND id = p_plan_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Rencana anggaran tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
    IF v_plan.status <> 'approved' THEN RAISE EXCEPTION 'Hanya anggaran disetujui yang dapat ditutup' USING ERRCODE = '55000'; END IF;
    IF v_plan.unit_id IS NULL THEN RAISE EXCEPTION 'Petakan rencana lama ke unit sebelum menutup' USING ERRCODE = '55000'; END IF;
    UPDATE public.finance_budget_plans SET status = 'closed', closed_by_user_id = p_actor_user_id,
      closed_at = now(), updated_by_user_id = p_actor_user_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_plan_id;
    v_plan_id := p_plan_id;
    v_result := jsonb_build_object('success', true, 'planId', v_plan_id, 'status', 'closed');
  END IF;

  INSERT INTO public.finance_budget_mutation_requests (
    tenant_id, client_request_id, actor_user_id, action, request_payload, result
  ) VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, p_action, v_payload, v_result);
  RETURN v_result;
END;
$$;



REVOKE ALL ON FUNCTION public.get_tenant_finance_budget_snapshot(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_finance_budget_snapshot(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.manage_tenant_finance_budget(UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_tenant_finance_budget(UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID) TO service_role;

COMMENT ON COLUMN public.finance_budget_plans.unit_id IS 'Tenant unit owning this RKAT. NULL rows are legacy and must be explicitly mapped before approval.';
COMMIT;
