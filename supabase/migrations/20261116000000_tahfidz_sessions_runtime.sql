-- Tenant-scoped Talaqqi and Munaqasyah scheduling and outcomes.
-- Keep runtime disabled until this migration is reconciled with the database history.
BEGIN;

CREATE TABLE public.tahfidz_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('talaqqi', 'exam')),
  student_id UUID NOT NULL,
  halaqah_id UUID NOT NULL,
  teacher_user_id UUID NOT NULL,
  exam_type TEXT,
  juz_start SMALLINT,
  juz_end SMALLINT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes SMALLINT NOT NULL CHECK (duration_minutes BETWEEN 15 AND 240),
  focus TEXT NOT NULL CHECK (length(btrim(focus)) BETWEEN 1 AND 500),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  score NUMERIC(5,2),
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('pass', 'retest')),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by_user_id UUID NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, halaqah_id) REFERENCES public.tahfidz_halaqahs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, teacher_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (kind = 'talaqqi' AND exam_type IS NULL AND juz_start IS NULL AND juz_end IS NULL AND score IS NULL AND outcome IS NULL)
    OR (kind = 'exam' AND exam_type IS NOT NULL AND exam_type IN ('munaqasyah', 'tasmi')
      AND juz_start IS NOT NULL AND juz_start BETWEEN 1 AND 30
      AND juz_end IS NOT NULL AND juz_end BETWEEN juz_start AND 30
      AND ((status = 'completed' AND score BETWEEN 0 AND 100 AND outcome IS NOT NULL)
        OR (status <> 'completed' AND score IS NULL AND outcome IS NULL)))
  ),
  CHECK ((status = 'completed' AND completed_at IS NOT NULL) OR (status <> 'completed' AND completed_at IS NULL))
);

CREATE INDEX tahfidz_sessions_tenant_schedule_idx
  ON public.tahfidz_sessions (tenant_id, scheduled_at DESC, id DESC);
CREATE INDEX tahfidz_sessions_student_schedule_idx
  ON public.tahfidz_sessions (tenant_id, student_id, scheduled_at DESC, id DESC);
CREATE INDEX tahfidz_sessions_teacher_schedule_idx
  ON public.tahfidz_sessions (tenant_id, teacher_user_id, scheduled_at, id)
  WHERE status = 'scheduled';

CREATE TABLE public.tahfidz_session_write_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'complete', 'cancel')),
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TRIGGER tahfidz_sessions_set_updated_at BEFORE UPDATE ON public.tahfidz_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tahfidz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_session_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_session_write_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tahfidz_sessions, public.tahfidz_session_write_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tahfidz_sessions TO service_role;
GRANT SELECT, INSERT ON TABLE public.tahfidz_session_write_requests TO service_role;

CREATE OR REPLACE FUNCTION public.mutate_tenant_tahfidz_session(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_session_id UUID,
  p_kind TEXT,
  p_student_id UUID,
  p_halaqah_id UUID,
  p_teacher_user_id UUID,
  p_exam_type TEXT,
  p_juz_start SMALLINT,
  p_juz_end SMALLINT,
  p_scheduled_at TIMESTAMPTZ,
  p_duration_minutes SMALLINT,
  p_focus TEXT,
  p_status TEXT,
  p_score NUMERIC,
  p_outcome TEXT,
  p_notes TEXT,
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
  v_halaqah_teacher UUID;
  v_session public.tahfidz_sessions%ROWTYPE;
  v_request public.tahfidz_session_write_requests%ROWTYPE;
  v_action TEXT;
  v_payload JSONB;
  v_session_id UUID;
  v_membership_date DATE;
  v_tenant_time_zone TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Aktor sesi Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT time_zone INTO v_tenant_time_zone FROM public.tenants WHERE id = p_tenant_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tenant_time_zone) THEN
    RAISE EXCEPTION 'Zona waktu tenant tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> p_expected_role OR v_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Profil aktif tidak berwenang mengelola sesi Tahfidz' USING ERRCODE = '42501';
  END IF;

  IF p_session_id IS NULL THEN
    IF p_kind IS NULL OR p_kind NOT IN ('talaqqi', 'exam') OR p_status IS DISTINCT FROM 'scheduled'
      OR p_student_id IS NULL OR p_halaqah_id IS NULL OR p_teacher_user_id IS NULL
      OR p_scheduled_at IS NULL OR p_duration_minutes IS NULL OR p_duration_minutes NOT BETWEEN 15 AND 240
      OR p_focus IS NULL OR length(btrim(p_focus)) NOT BETWEEN 1 AND 500 THEN
      RAISE EXCEPTION 'Jadwal Tahfidz tidak valid' USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'talaqqi' AND (p_exam_type IS NOT NULL OR p_juz_start IS NOT NULL OR p_juz_end IS NOT NULL OR p_score IS NOT NULL OR p_outcome IS NOT NULL) THEN
      RAISE EXCEPTION 'Data ujian tidak boleh diisi pada sesi talaqqi' USING ERRCODE = '22023';
    END IF;
    IF p_kind = 'exam' AND (p_exam_type IS NULL OR p_exam_type NOT IN ('munaqasyah', 'tasmi') OR p_juz_start IS NULL OR p_juz_start NOT BETWEEN 1 AND 30
      OR p_juz_end IS NULL OR p_juz_end NOT BETWEEN p_juz_start AND 30 OR p_score IS NOT NULL OR p_outcome IS NOT NULL) THEN
      RAISE EXCEPTION 'Data jadwal ujian tidak valid' USING ERRCODE = '22023';
    END IF;
    v_action := 'create';
    v_payload := jsonb_build_object('kind', p_kind, 'studentId', p_student_id, 'halaqahId', p_halaqah_id,
      'teacherUserId', p_teacher_user_id, 'examType', p_exam_type, 'juzStart', p_juz_start, 'juzEnd', p_juz_end,
      'scheduledAt', p_scheduled_at, 'durationMinutes', p_duration_minutes, 'focus', btrim(p_focus));
  ELSE
    IF p_kind IS NULL OR p_kind NOT IN ('talaqqi', 'exam') OR p_status IS NULL
      OR p_status NOT IN ('completed', 'cancelled') OR length(COALESCE(p_notes, '')) > 2000 THEN
      RAISE EXCEPTION 'Perubahan status sesi Tahfidz tidak valid' USING ERRCODE = '22023';
    END IF;
    v_action := CASE WHEN p_status = 'completed' THEN 'complete' ELSE 'cancel' END;
    v_payload := jsonb_build_object('sessionId', p_session_id, 'status', p_status, 'score', p_score,
      'outcome', p_outcome, 'notes', NULLIF(btrim(COALESCE(p_notes, '')), ''));
    IF p_status = 'completed' AND p_kind = 'exam'
      AND (p_score IS NULL OR p_score NOT BETWEEN 0 AND 100 OR p_outcome IS NULL OR p_outcome NOT IN ('pass', 'retest')) THEN
      RAISE EXCEPTION 'Nilai dan hasil ujian wajib diisi' USING ERRCODE = '22023';
    END IF;
    IF (p_kind <> 'exam' OR p_status = 'cancelled') AND (p_score IS NOT NULL OR p_outcome IS NOT NULL) THEN
      RAISE EXCEPTION 'Nilai hanya dapat disimpan saat ujian diselesaikan' USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tahfidz-session-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_request FROM public.tahfidz_session_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM v_action
      OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan sesi sudah dipakai untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'sessionId', v_request.result_id);
  END IF;

  IF p_session_id IS NULL THEN
    SELECT status INTO v_student_status FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_student_id FOR KEY SHARE;
    IF NOT FOUND OR lower(COALESCE(v_student_status, '')) IN ('archived', 'inactive', 'nonaktif', 'alumni', 'dikeluarkan') THEN
      RAISE EXCEPTION 'Santri aktif tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
    END IF;
    SELECT ustadz_user_id INTO v_halaqah_teacher FROM public.tahfidz_halaqahs
    WHERE tenant_id = p_tenant_id AND id = p_halaqah_id AND status = 'active' FOR KEY SHARE;
    IF NOT FOUND OR v_halaqah_teacher IS DISTINCT FROM p_teacher_user_id THEN
      RAISE EXCEPTION 'Halaqah atau pengampu tidak sesuai' USING ERRCODE = 'P0002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_teacher_user_id
      AND status = 'active' AND lower(role::text) = 'ustadz') THEN
      RAISE EXCEPTION 'Pengampu aktif tidak ditemukan' USING ERRCODE = 'P0002';
    END IF;
    IF v_role = 'ustadz' AND p_actor_user_id IS DISTINCT FROM p_teacher_user_id THEN
      RAISE EXCEPTION 'Ustadz hanya dapat mengelola sesi halaqah yang diampu' USING ERRCODE = '42501';
    END IF;
    v_membership_date := (p_scheduled_at AT TIME ZONE v_tenant_time_zone)::date;
    IF NOT EXISTS (SELECT 1 FROM public.tahfidz_memberships m WHERE m.tenant_id = p_tenant_id
      AND m.student_id = p_student_id AND m.halaqah_id = p_halaqah_id AND m.status = 'active'
      AND m.starts_on <= v_membership_date AND (m.ends_on IS NULL OR m.ends_on >= v_membership_date)) THEN
      RAISE EXCEPTION 'Santri tidak memiliki penempatan aktif pada halaqah di tanggal tersebut' USING ERRCODE = '23503';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'tahfidz-session-slot:' || p_tenant_id::text || ':' || p_teacher_user_id::text, 0
    ));
    IF EXISTS (SELECT 1 FROM public.tahfidz_sessions s WHERE s.tenant_id = p_tenant_id
      AND s.teacher_user_id = p_teacher_user_id AND s.status = 'scheduled'
      AND s.scheduled_at < p_scheduled_at + make_interval(mins => p_duration_minutes::integer)
      AND s.scheduled_at + make_interval(mins => s.duration_minutes::integer) > p_scheduled_at) THEN
      RAISE EXCEPTION 'Pengampu sudah memiliki sesi lain pada rentang waktu tersebut' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.tahfidz_sessions (
      tenant_id, kind, student_id, halaqah_id, teacher_user_id, exam_type, juz_start, juz_end,
      scheduled_at, duration_minutes, focus, created_by_user_id
    ) VALUES (
      p_tenant_id, p_kind, p_student_id, p_halaqah_id, p_teacher_user_id, p_exam_type, p_juz_start, p_juz_end,
      p_scheduled_at, p_duration_minutes, btrim(p_focus), p_actor_user_id
    ) RETURNING id INTO v_session_id;
  ELSE
    SELECT * INTO v_session FROM public.tahfidz_sessions
    WHERE tenant_id = p_tenant_id AND id = p_session_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sesi tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
    IF v_session.status <> 'scheduled' OR v_session.kind IS DISTINCT FROM p_kind THEN
      RAISE EXCEPTION 'Sesi sudah ditutup atau jenis sesi berubah' USING ERRCODE = '23514';
    END IF;
    IF v_role = 'ustadz' AND v_session.teacher_user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'Ustadz hanya dapat menutup sesi yang diampu' USING ERRCODE = '42501';
    END IF;
    UPDATE public.tahfidz_sessions SET status = p_status,
      score = CASE WHEN p_status = 'completed' AND p_kind = 'exam' THEN p_score ELSE NULL END,
      outcome = CASE WHEN p_status = 'completed' AND p_kind = 'exam' THEN p_outcome ELSE NULL END,
      notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
      completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE NULL END
    WHERE tenant_id = p_tenant_id AND id = p_session_id;
    v_session_id := p_session_id;
  END IF;

  INSERT INTO public.tahfidz_session_write_requests
    (tenant_id, client_request_id, actor_user_id, action, request_payload, result_id)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, v_action, v_payload, v_session_id);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'sessionId', v_session_id);
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_tenant_tahfidz_session(UUID, UUID, TEXT, UUID, TEXT, UUID, UUID, UUID, TEXT, SMALLINT, SMALLINT, TIMESTAMPTZ, SMALLINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_tenant_tahfidz_session(UUID, UUID, TEXT, UUID, TEXT, UUID, UUID, UUID, TEXT, SMALLINT, SMALLINT, TIMESTAMPTZ, SMALLINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID)
  TO service_role;

COMMENT ON TABLE public.tahfidz_sessions IS
  'Tenant-scoped Talaqqi and Munaqasyah appointments; no demonstration sessions are seeded.';
COMMENT ON FUNCTION public.mutate_tenant_tahfidz_session(UUID, UUID, TEXT, UUID, TEXT, UUID, UUID, UUID, TEXT, SMALLINT, SMALLINT, TIMESTAMPTZ, SMALLINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, UUID) IS
  'Creates or closes a tenant session, verifies active halaqah membership and teacher assignment, serializes teacher slots, and makes writes idempotent.';

COMMIT;
