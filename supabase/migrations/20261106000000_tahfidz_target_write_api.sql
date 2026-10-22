-- Forward-only port for direct Supabase Auth profiles; Firebase identity bridge is intentionally omitted.
-- Tenant-scoped, auditable and idempotent daily Tahfidz target writes.
-- This migration is staged only; do not apply before environment provisioning and review.
BEGIN;

CREATE TABLE public.tahfidz_target_write_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  student_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE,
  ziyadah_pages_per_day NUMERIC(6,2) NOT NULL,
  murojaah_pages_per_day NUMERIC(6,2) NOT NULL,
  target_policy TEXT NOT NULL,
  notes TEXT,
  target_id UUID NOT NULL REFERENCES public.tahfidz_targets(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  CHECK (period_end IS NULL OR period_end >= period_start),
  CHECK (ziyadah_pages_per_day BETWEEN 0 AND 100),
  CHECK (murojaah_pages_per_day BETWEEN 0 AND 100),
  CHECK (ziyadah_pages_per_day > 0 OR murojaah_pages_per_day > 0),
  CHECK (target_policy IN ('standard', 'strict')),
  CHECK (notes IS NULL OR length(notes) <= 1000),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.tahfidz_target_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_target_write_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tahfidz_target_write_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.tahfidz_target_write_requests TO service_role;

CREATE OR REPLACE FUNCTION public.record_tahfidz_daily_target(
  p_tenant_id UUID,
  p_student_id UUID,
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
  v_role TEXT;
  v_student_status TEXT;
  v_latest_period DATE;
  v_target public.tahfidz_targets%ROWTYPE;
  v_existing public.tahfidz_target_write_requests%ROWTYPE;
  v_target_id UUID;
  v_notes TEXT;
BEGIN
  v_notes := NULLIF(btrim(COALESCE(p_notes, '')), '');
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_created_by_user_id IS NULL OR p_client_request_id IS NULL
    OR p_period_start IS NULL OR (p_period_end IS NOT NULL AND p_period_end < p_period_start)
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin', 'ustadz')
    OR p_ziyadah_pages_per_day IS NULL OR p_ziyadah_pages_per_day < 0 OR p_ziyadah_pages_per_day > 100
    OR p_murojaah_pages_per_day IS NULL OR p_murojaah_pages_per_day < 0 OR p_murojaah_pages_per_day > 100
    OR (p_ziyadah_pages_per_day = 0 AND p_murojaah_pages_per_day = 0)
    OR p_target_policy IS NULL OR p_target_policy NOT IN ('standard', 'strict')
    OR length(COALESCE(p_notes, '')) > 1000 THEN
    RAISE EXCEPTION 'Data target harian Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(role::text))
  INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id
    AND user_id = p_created_by_user_id
    AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin', 'ustadz')
    OR v_role <> lower(p_expected_role) THEN
    RAISE EXCEPTION 'Role akun tidak sesuai dengan profil Supabase aktif' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_client_request_id::text, 0));

  SELECT * INTO v_existing
  FROM public.tahfidz_target_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.created_by_user_id IS DISTINCT FROM p_created_by_user_id
      OR v_existing.student_id IS DISTINCT FROM p_student_id
      OR v_existing.period_start IS DISTINCT FROM p_period_start
      OR v_existing.period_end IS DISTINCT FROM p_period_end
      OR v_existing.ziyadah_pages_per_day IS DISTINCT FROM p_ziyadah_pages_per_day
      OR v_existing.murojaah_pages_per_day IS DISTINCT FROM p_murojaah_pages_per_day
      OR v_existing.target_policy IS DISTINCT FROM p_target_policy
      OR v_existing.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION 'Kunci permintaan target telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'targetId', v_existing.target_id);
  END IF;

  IF p_period_start > CURRENT_DATE OR (p_period_end IS NOT NULL AND p_period_end < CURRENT_DATE) THEN
    RAISE EXCEPTION 'Target aktif harus berlaku pada hari ini atau sebelumnya dan tidak berakhir di masa lalu' USING ERRCODE = '22023';
  END IF;

  SELECT status
  INTO v_student_status
  FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id
  FOR UPDATE;
  IF NOT FOUND OR lower(COALESCE(v_student_status, '')) = 'archived' THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;

  IF v_role = 'ustadz' AND NOT EXISTS (
    SELECT 1
    FROM public.tahfidz_memberships AS m
    JOIN public.tahfidz_halaqahs AS h
      ON h.tenant_id = m.tenant_id AND h.id = m.halaqah_id
    WHERE m.tenant_id = p_tenant_id
      AND m.student_id = p_student_id
      AND m.status = 'active'
      AND m.starts_on <= CURRENT_DATE
      AND (m.ends_on IS NULL OR m.ends_on >= CURRENT_DATE)
      AND h.status = 'active'
      AND h.ustadz_user_id = p_created_by_user_id
  ) THEN
    RAISE EXCEPTION 'Ustadz hanya dapat mengatur target santri pada halaqah tugasnya' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target
  FROM public.tahfidz_targets
  WHERE tenant_id = p_tenant_id AND student_id = p_student_id AND status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF p_period_start < v_target.period_start THEN
      RAISE EXCEPTION 'Tanggal mulai target tidak boleh mundur dari target aktif' USING ERRCODE = '23514';
    END IF;
    v_target_id := v_target.id;
    IF p_period_start = v_target.period_start THEN
      UPDATE public.tahfidz_targets
      SET period_end = p_period_end,
          ziyadah_pages_per_day = p_ziyadah_pages_per_day,
          murojaah_pages_per_day = p_murojaah_pages_per_day,
          target_policy = p_target_policy,
          notes = v_notes
      WHERE id = v_target.id AND tenant_id = p_tenant_id;
    ELSE
      UPDATE public.tahfidz_targets
      SET status = 'ended',
          period_end = CASE
            WHEN period_end IS NULL OR period_end >= p_period_start THEN p_period_start - 1
            ELSE period_end
          END
      WHERE id = v_target.id AND tenant_id = p_tenant_id;
      v_target_id := NULL;
    END IF;
  ELSE
    SELECT max(period_start) INTO v_latest_period
    FROM public.tahfidz_targets
    WHERE tenant_id = p_tenant_id AND student_id = p_student_id;
    IF v_latest_period IS NOT NULL AND p_period_start < v_latest_period THEN
      RAISE EXCEPTION 'Tanggal mulai target tidak boleh mendahului riwayat target' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_target_id IS NULL AND EXISTS (
    SELECT 1
    FROM public.tahfidz_targets
    WHERE tenant_id = p_tenant_id
      AND student_id = p_student_id
      AND (period_end IS NULL OR period_end >= p_period_start)
      AND (p_period_end IS NULL OR period_start <= p_period_end)
  ) THEN
    RAISE EXCEPTION 'Periode target bertumpang tindih dengan riwayat yang sudah tersimpan' USING ERRCODE = '23514';
  ELSIF v_target_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.tahfidz_targets
    WHERE tenant_id = p_tenant_id
      AND student_id = p_student_id
      AND id <> v_target_id
      AND (period_end IS NULL OR period_end >= p_period_start)
      AND (p_period_end IS NULL OR period_start <= p_period_end)
  ) THEN
    RAISE EXCEPTION 'Periode target bertumpang tindih dengan riwayat yang sudah tersimpan' USING ERRCODE = '23514';
  END IF;

  IF v_target_id IS NULL THEN
    INSERT INTO public.tahfidz_targets (
      tenant_id, student_id, period_start, period_end, ziyadah_pages_per_day,
      murojaah_pages_per_day, target_policy, status, notes, created_by_user_id
    ) VALUES (
      p_tenant_id, p_student_id, p_period_start, p_period_end, p_ziyadah_pages_per_day,
      p_murojaah_pages_per_day, p_target_policy, 'active', v_notes, p_created_by_user_id
    )
    RETURNING id INTO v_target_id;
  END IF;

  INSERT INTO public.tahfidz_target_write_requests (
    tenant_id, client_request_id, created_by_user_id, student_id, period_start, period_end,
    ziyadah_pages_per_day, murojaah_pages_per_day, target_policy, notes, target_id
  ) VALUES (
    p_tenant_id, p_client_request_id, p_created_by_user_id, p_student_id, p_period_start, p_period_end,
    p_ziyadah_pages_per_day, p_murojaah_pages_per_day, p_target_policy, v_notes, v_target_id
  );

  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'targetId', v_target_id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_tahfidz_daily_target(
  UUID, UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tahfidz_daily_target(
  UUID, UUID, DATE, DATE, NUMERIC, NUMERIC, TEXT, TEXT, UUID, TEXT, UUID
) TO service_role;

COMMENT ON TABLE public.tahfidz_target_write_requests IS
  'Private idempotency and audit ledger for tenant-scoped daily Tahfidz target changes.';

COMMIT;
