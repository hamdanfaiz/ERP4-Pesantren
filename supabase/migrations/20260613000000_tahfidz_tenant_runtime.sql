-- Tenant-scoped Tahfidz runtime foundation.
-- All writes are routed through trusted server APIs; sample/demo records are not imported.
BEGIN;

CREATE TABLE public.tahfidz_halaqahs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  ustadz_user_id UUID,
  ustadz_name TEXT NOT NULL CHECK (length(btrim(ustadz_name)) BETWEEN 1 AND 180),
  schedule_text TEXT CHECK (schedule_text IS NULL OR length(schedule_text) <= 500),
  room_text TEXT CHECK (room_text IS NULL OR length(room_text) <= 180),
  daily_target_pages NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (daily_target_pages >= 0 AND daily_target_pages <= 100),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, ustadz_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tahfidz_halaqahs_active_name_tenant_uq
  ON public.tahfidz_halaqahs (tenant_id, lower(btrim(name)))
  WHERE status = 'active';
CREATE INDEX tahfidz_halaqahs_tenant_status_name_idx
  ON public.tahfidz_halaqahs (tenant_id, status, name);

CREATE TABLE public.tahfidz_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  halaqah_id UUID NOT NULL,
  student_id UUID NOT NULL,
  starts_on DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, halaqah_id)
    REFERENCES public.tahfidz_halaqahs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tahfidz_memberships_one_active_per_student_uq
  ON public.tahfidz_memberships (tenant_id, student_id)
  WHERE status = 'active';
CREATE INDEX tahfidz_memberships_halaqah_status_idx
  ON public.tahfidz_memberships (tenant_id, halaqah_id, status);
CREATE INDEX tahfidz_memberships_student_history_idx
  ON public.tahfidz_memberships (tenant_id, student_id, starts_on DESC);

CREATE TABLE public.tahfidz_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  halaqah_id UUID NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('Ziyadah', 'Muroja''ah', 'Tasmi''', 'Tasmik')),
  surah_name TEXT NOT NULL CHECK (length(btrim(surah_name)) BETWEEN 1 AND 100),
  ayah_start INTEGER NOT NULL CHECK (ayah_start >= 1),
  ayah_end INTEGER NOT NULL CHECK (ayah_end >= ayah_start),
  fluency_grade TEXT CHECK (fluency_grade IS NULL OR fluency_grade IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'N/A')),
  tajweed_grade TEXT CHECK (tajweed_grade IS NULL OR tajweed_grade IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'N/A')),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by_user_id UUID NOT NULL,
  recorded_by_name TEXT CHECK (recorded_by_name IS NULL OR length(recorded_by_name) <= 180),
  client_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, halaqah_id)
    REFERENCES public.tahfidz_halaqahs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, recorded_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX tahfidz_records_tenant_performed_idx
  ON public.tahfidz_records (tenant_id, performed_at DESC);
CREATE INDEX tahfidz_records_student_performed_idx
  ON public.tahfidz_records (tenant_id, student_id, performed_at DESC);
CREATE INDEX tahfidz_records_halaqah_performed_idx
  ON public.tahfidz_records (tenant_id, halaqah_id, performed_at DESC);

CREATE TABLE public.tahfidz_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  period_start DATE NOT NULL DEFAULT CURRENT_DATE,
  period_end DATE,
  ziyadah_pages_per_day NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (ziyadah_pages_per_day BETWEEN 0 AND 100),
  murojaah_pages_per_day NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (murojaah_pages_per_day BETWEEN 0 AND 100),
  target_policy TEXT NOT NULL DEFAULT 'standard' CHECK (target_policy IN ('standard', 'strict')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end IS NULL OR period_end >= period_start),
  CHECK (ziyadah_pages_per_day > 0 OR murojaah_pages_per_day > 0),
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tahfidz_targets_one_active_per_student_uq
  ON public.tahfidz_targets (tenant_id, student_id)
  WHERE status = 'active';
CREATE INDEX tahfidz_targets_tenant_period_idx
  ON public.tahfidz_targets (tenant_id, period_start DESC, status);

CREATE TRIGGER tahfidz_halaqahs_set_updated_at
  BEFORE UPDATE ON public.tahfidz_halaqahs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tahfidz_memberships_set_updated_at
  BEFORE UPDATE ON public.tahfidz_memberships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tahfidz_targets_set_updated_at
  BEFORE UPDATE ON public.tahfidz_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tahfidz_halaqahs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_halaqahs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_targets FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.tahfidz_halaqahs,
  public.tahfidz_memberships,
  public.tahfidz_records,
  public.tahfidz_targets
FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.tahfidz_halaqahs,
  public.tahfidz_memberships,
  public.tahfidz_targets
TO service_role;
GRANT SELECT, INSERT ON TABLE public.tahfidz_records TO service_role;

CREATE OR REPLACE FUNCTION public.record_tahfidz_setoran(
  p_tenant_id UUID,
  p_student_id UUID,
  p_halaqah_id UUID,
  p_activity_type TEXT,
  p_surah_name TEXT,
  p_ayah_start INTEGER,
  p_ayah_end INTEGER,
  p_fluency_grade TEXT,
  p_tajweed_grade TEXT,
  p_notes TEXT,
  p_performed_at TIMESTAMPTZ,
  p_recorded_by_user_id UUID,
  p_recorded_by_name TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_record_id UUID;
  v_existing public.tahfidz_records%ROWTYPE;
  v_surah TEXT;
  v_recorder_id UUID;
BEGIN
  v_surah := NULLIF(btrim(COALESCE(p_surah_name, '')), '');
  v_recorder_id := p_recorded_by_user_id;
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_halaqah_id IS NULL
    OR p_client_request_id IS NULL OR p_performed_at IS NULL OR p_ayah_start IS NULL OR p_ayah_end IS NULL
    OR p_ayah_start < 1 OR p_ayah_end < p_ayah_start
    OR p_activity_type NOT IN ('Ziyadah', 'Muroja''ah', 'Tasmi''', 'Tasmik')
    OR v_surah IS NULL OR length(v_surah) > 100
    OR v_recorder_id IS NULL
    OR length(COALESCE(p_notes, '')) > 2000
    OR length(COALESCE(p_recorded_by_name, '')) > 180 THEN
    RAISE EXCEPTION 'Data setoran Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_fluency_grade IS NOT NULL AND p_fluency_grade NOT IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'N/A')
    OR p_tajweed_grade IS NOT NULL AND p_tajweed_grade NOT IN ('A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'N/A') THEN
    RAISE EXCEPTION 'Nilai setoran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_student_id AND lower(status) <> 'archived'
  ) THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tahfidz_halaqahs
    WHERE tenant_id = p_tenant_id AND id = p_halaqah_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Halaqah tidak ditemukan atau tidak aktif pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tahfidz_memberships
    WHERE tenant_id = p_tenant_id
      AND student_id = p_student_id
      AND halaqah_id = p_halaqah_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Santri belum terdaftar pada halaqah ini' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.tahfidz_records (
    tenant_id, student_id, halaqah_id, activity_type, surah_name, ayah_start, ayah_end,
    fluency_grade, tajweed_grade, notes, performed_at, recorded_by_user_id,
    recorded_by_name, client_request_id
  ) VALUES (
    p_tenant_id, p_student_id, p_halaqah_id, p_activity_type, v_surah, p_ayah_start, p_ayah_end,
    p_fluency_grade, p_tajweed_grade, NULLIF(btrim(COALESCE(p_notes, '')), ''),
    p_performed_at, v_recorder_id,
    NULLIF(btrim(COALESCE(p_recorded_by_name, '')), ''), p_client_request_id
  )
  ON CONFLICT (tenant_id, client_request_id) DO NOTHING
  RETURNING id INTO v_record_id;

  IF v_record_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'alreadyRecorded', false, 'recordId', v_record_id);
  END IF;

  SELECT * INTO v_existing
  FROM public.tahfidz_records
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setoran belum dapat dipastikan tersimpan' USING ERRCODE = '40001';
  END IF;
  IF v_existing.student_id IS DISTINCT FROM p_student_id
    OR v_existing.halaqah_id IS DISTINCT FROM p_halaqah_id
    OR v_existing.activity_type IS DISTINCT FROM p_activity_type
    OR v_existing.surah_name IS DISTINCT FROM v_surah
    OR v_existing.ayah_start IS DISTINCT FROM p_ayah_start
    OR v_existing.ayah_end IS DISTINCT FROM p_ayah_end
    OR v_existing.fluency_grade IS DISTINCT FROM p_fluency_grade
    OR v_existing.tajweed_grade IS DISTINCT FROM p_tajweed_grade
    OR v_existing.notes IS DISTINCT FROM NULLIF(btrim(COALESCE(p_notes, '')), '')
    OR v_existing.performed_at IS DISTINCT FROM p_performed_at
    OR v_existing.recorded_by_user_id IS DISTINCT FROM v_recorder_id
    OR v_existing.recorded_by_name IS DISTINCT FROM NULLIF(btrim(COALESCE(p_recorded_by_name, '')), '') THEN
    RAISE EXCEPTION 'Kunci permintaan setoran telah digunakan untuk data berbeda' USING ERRCODE = '23505';
  END IF;
  RETURN jsonb_build_object('success', true, 'alreadyRecorded', true, 'recordId', v_existing.id);
END;
$$;

REVOKE ALL ON FUNCTION public.record_tahfidz_setoran(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tahfidz_setoran(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, UUID
) TO service_role;

COMMENT ON TABLE public.tahfidz_halaqahs IS
  'Tenant-scoped halaqah master; ustadz identity references the tenant-scoped Supabase Auth profile.';
COMMENT ON TABLE public.tahfidz_memberships IS
  'Tenant-scoped student-to-halaqah history; at most one active halaqah membership per student.';
COMMENT ON TABLE public.tahfidz_records IS
  'Append-only Tahfidz submission history with tenant/student/halaqah foreign keys and request idempotency.';
COMMENT ON TABLE public.tahfidz_targets IS
  'Current and historical per-student daily targets, tenant-scoped and retained for reporting.';

COMMIT;
