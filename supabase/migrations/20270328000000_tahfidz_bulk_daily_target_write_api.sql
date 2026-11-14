-- Persist bulk daily targets atomically. The wrapper reuses the single-target
-- RPC so tenant, role, assignment, business-date, overlap and idempotency
-- rules remain identical for every selected student.
BEGIN;

CREATE TABLE public.tahfidz_target_bulk_write_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  student_ids UUID[] NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE,
  ziyadah_pages_per_day NUMERIC(6,2) NOT NULL,
  murojaah_pages_per_day NUMERIC(6,2) NOT NULL,
  target_policy TEXT NOT NULL,
  notes TEXT,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (cardinality(student_ids) BETWEEN 1 AND 250),
  CHECK (period_end IS NULL OR period_end >= period_start),
  CHECK (ziyadah_pages_per_day BETWEEN 0 AND 100),
  CHECK (murojaah_pages_per_day BETWEEN 0 AND 100),
  CHECK (ziyadah_pages_per_day > 0 OR murojaah_pages_per_day > 0),
  CHECK (target_policy IN ('standard', 'strict')),
  CHECK (notes IS NULL OR length(notes) <= 1000)
);

ALTER TABLE public.tahfidz_target_bulk_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_target_bulk_write_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tahfidz_target_bulk_write_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.tahfidz_target_bulk_write_requests TO service_role;

CREATE OR REPLACE FUNCTION public.record_tahfidz_daily_targets_bulk(
  p_tenant_id UUID,
  p_student_ids UUID[],
  p_period_start DATE,
  p_period_end DATE,
  p_ziyadah_pages_per_day NUMERIC,
  p_murojaah_pages_per_day NUMERIC,
  p_target_policy TEXT,
  p_notes TEXT,
  p_created_by_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_ids UUID[];
  v_student_id UUID;
  v_notes TEXT;
  v_actor_role TEXT;
  v_payload JSONB;
  v_existing public.tahfidz_target_bulk_write_requests%ROWTYPE;
  v_target_result JSONB;
  v_targets JSONB := '[]'::JSONB;
  v_result JSONB;
  v_child_request_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_student_ids IS NULL OR cardinality(p_student_ids) < 1
    OR cardinality(p_student_ids) > 250 OR array_position(p_student_ids, NULL) IS NOT NULL
    OR p_period_start IS NULL OR (p_period_end IS NOT NULL AND p_period_end < p_period_start)
    OR p_ziyadah_pages_per_day IS NULL OR p_ziyadah_pages_per_day < 0 OR p_ziyadah_pages_per_day > 100
    OR p_murojaah_pages_per_day IS NULL OR p_murojaah_pages_per_day < 0 OR p_murojaah_pages_per_day > 100
    OR (p_ziyadah_pages_per_day = 0 AND p_murojaah_pages_per_day = 0)
    OR p_target_policy IS NULL OR p_target_policy NOT IN ('standard', 'strict')
    OR length(COALESCE(p_notes, '')) > 1000
    OR p_created_by_user_id IS NULL OR p_client_request_id IS NULL
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Data target massal Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(ids.student_id ORDER BY ids.student_id)
  INTO v_student_ids
  FROM (SELECT DISTINCT unnest(p_student_ids) AS student_id) AS ids;
  IF cardinality(v_student_ids) <> cardinality(p_student_ids) THEN
    RAISE EXCEPTION 'Santri target massal tidak boleh duplikat' USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(role::text)) INTO v_actor_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_created_by_user_id AND status = 'active';
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'super_admin', 'ustadz')
    OR v_actor_role <> lower(p_expected_role) THEN
    RAISE EXCEPTION 'Role akun tidak sesuai dengan profil Supabase aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_payload := jsonb_build_object(
    'studentIds', to_jsonb(v_student_ids),
    'periodStart', p_period_start,
    'periodEnd', p_period_end,
    'ziyadahPagesPerDay', p_ziyadah_pages_per_day,
    'murojaahPagesPerDay', p_murojaah_pages_per_day,
    'policy', p_target_policy,
    'notes', v_notes
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_client_request_id::text, 0));
  -- The transaction-scoped key serializes this tenant/request pair, so a row
  -- lock is unnecessary and would require UPDATE privilege on the ledger.
  SELECT * INTO v_existing
  FROM public.tahfidz_target_bulk_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.created_by_user_id IS DISTINCT FROM p_created_by_user_id
      OR v_existing.student_ids IS DISTINCT FROM v_student_ids
      OR v_existing.period_start IS DISTINCT FROM p_period_start
      OR v_existing.period_end IS DISTINCT FROM p_period_end
      OR v_existing.ziyadah_pages_per_day IS DISTINCT FROM p_ziyadah_pages_per_day
      OR v_existing.murojaah_pages_per_day IS DISTINCT FROM p_murojaah_pages_per_day
      OR v_existing.target_policy IS DISTINCT FROM p_target_policy
      OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Kunci permintaan target massal telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.result || jsonb_build_object('alreadyApplied', TRUE);
  END IF;

  FOREACH v_student_id IN ARRAY v_student_ids LOOP
    -- A deterministic child key makes a retry of this batch idempotent per row.
    v_child_request_id := md5(p_client_request_id::text || ':' || v_student_id::text)::UUID;
    v_target_result := public.record_tahfidz_daily_target(
      p_tenant_id,
      v_student_id,
      p_period_start,
      p_period_end,
      p_ziyadah_pages_per_day,
      p_murojaah_pages_per_day,
      p_target_policy,
      v_notes,
      p_created_by_user_id,
      p_expected_role,
      v_child_request_id
    );
    v_targets := v_targets || jsonb_build_array(jsonb_build_object(
      'studentId', v_student_id,
      'targetId', v_target_result->>'targetId',
      'alreadyApplied', COALESCE((v_target_result->>'alreadyApplied')::BOOLEAN, FALSE)
    ));
  END LOOP;

  v_result := jsonb_build_object(
    'success', TRUE,
    'alreadyApplied', FALSE,
    'count', cardinality(v_student_ids),
    'targets', v_targets
  );
  INSERT INTO public.tahfidz_target_bulk_write_requests (
    tenant_id, client_request_id, created_by_user_id, student_ids, period_start,
    period_end, ziyadah_pages_per_day, murojaah_pages_per_day, target_policy, notes, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_created_by_user_id, v_student_ids, p_period_start,
    p_period_end, p_ziyadah_pages_per_day, p_murojaah_pages_per_day, p_target_policy, v_notes, v_result
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_tahfidz_daily_targets_bulk(
  UUID, UUID[], DATE, DATE, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tahfidz_daily_targets_bulk(
  UUID, UUID[], DATE, DATE, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) TO service_role;

COMMENT ON FUNCTION public.record_tahfidz_daily_targets_bulk(
  UUID, UUID[], DATE, DATE, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) IS 'Atomically applies the canonical target rules to a tenant-scoped batch of at most 250 students; service-only and idempotent.';

COMMIT;
