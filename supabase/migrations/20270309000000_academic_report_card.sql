-- Semester report cards, homeroom comments, and the tenant KKTP threshold.
-- Version follows 20270308000000 so the academic chain stays ordered.
-- This file is the source contract. Do not apply it to Production from an agent session.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.academic_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  kktp_threshold NUMERIC(5,2) NOT NULL DEFAULT 75 CHECK (kktp_threshold >= 0 AND kktp_threshold <= 100),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  CHECK (ends_on >= starts_on),
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX academic_terms_one_open_per_tenant
  ON public.academic_terms (tenant_id)
  WHERE status = 'open';

CREATE TABLE public.academic_homeroom_assignments (
  tenant_id UUID NOT NULL,
  term_id UUID NOT NULL,
  class_category TEXT NOT NULL DEFAULT 'Kelas' CHECK (class_category = 'Kelas'),
  class_id TEXT NOT NULL CHECK (length(btrim(class_id)) BETWEEN 1 AND 160),
  teacher_user_id UUID NOT NULL,
  assigned_by UUID NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, term_id, class_id),
  FOREIGN KEY (tenant_id, term_id) REFERENCES public.academic_terms (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, class_category, class_id) REFERENCES public.master_data_records (tenant_id, category, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, teacher_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, assigned_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX academic_homeroom_teacher_idx
  ON public.academic_homeroom_assignments (tenant_id, teacher_user_id, term_id);

CREATE TABLE public.academic_report_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  term_id UUID NOT NULL,
  student_id UUID NOT NULL,
  class_category TEXT NOT NULL DEFAULT 'Kelas' CHECK (class_category = 'Kelas'),
  class_id TEXT NOT NULL CHECK (length(btrim(class_id)) BETWEEN 1 AND 160),
  status TEXT NOT NULL CHECK (status IN ('draft', 'validated', 'published')),
  homeroom_comment TEXT CHECK (homeroom_comment IS NULL OR length(btrim(homeroom_comment)) BETWEEN 1 AND 2000),
  score_fingerprint TEXT CHECK (score_fingerprint IS NULL OR score_fingerprint ~ '^[0-9a-f]{64}$'),
  kktp_threshold NUMERIC(5,2) CHECK (kktp_threshold IS NULL OR (kktp_threshold >= 0 AND kktp_threshold <= 100)),
  lines JSONB CHECK (lines IS NULL OR jsonb_typeof(lines) = 'array'),
  homeroom_user_id UUID,
  validated_by UUID,
  validated_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, term_id, student_id),
  FOREIGN KEY (tenant_id, term_id) REFERENCES public.academic_terms (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, class_category, class_id) REFERENCES public.master_data_records (tenant_id, category, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, homeroom_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, validated_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, published_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (status = 'draft'
      AND score_fingerprint IS NULL AND kktp_threshold IS NULL AND lines IS NULL AND homeroom_user_id IS NULL
      AND validated_by IS NULL AND validated_at IS NULL AND published_by IS NULL AND published_at IS NULL)
    OR (status = 'validated'
      AND score_fingerprint IS NOT NULL AND homeroom_comment IS NOT NULL
      AND kktp_threshold IS NULL AND lines IS NULL AND homeroom_user_id IS NULL
      AND validated_by IS NOT NULL AND validated_at IS NOT NULL
      AND published_by IS NULL AND published_at IS NULL)
    OR (status = 'published'
      AND score_fingerprint IS NOT NULL AND homeroom_comment IS NOT NULL
      AND kktp_threshold IS NOT NULL AND lines IS NOT NULL AND homeroom_user_id IS NOT NULL
      AND validated_by IS NOT NULL AND validated_at IS NOT NULL
      AND published_by IS NOT NULL AND published_at IS NOT NULL)
  )
);

CREATE INDEX academic_report_cards_published_student_idx
  ON public.academic_report_cards (tenant_id, student_id, published_at DESC)
  WHERE status = 'published';
CREATE INDEX academic_report_cards_homeroom_idx
  ON public.academic_report_cards (tenant_id, homeroom_user_id)
  WHERE homeroom_user_id IS NOT NULL;
CREATE INDEX academic_report_cards_validated_by_idx
  ON public.academic_report_cards (tenant_id, validated_by)
  WHERE validated_by IS NOT NULL;
CREATE INDEX academic_report_cards_published_by_idx
  ON public.academic_report_cards (tenant_id, published_by)
  WHERE published_by IS NOT NULL;

CREATE TABLE public.academic_report_actions (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'save_term', 'close_term', 'save_threshold', 'assign_homeroom',
    'save_comment', 'reopen_card', 'validate_card', 'publish_card'
  )),
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX academic_report_actions_actor_idx
  ON public.academic_report_actions (tenant_id, actor_user_id, created_at DESC);

ALTER TABLE public.academic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_terms FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academic_homeroom_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_homeroom_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academic_report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_report_cards FORCE ROW LEVEL SECURITY;
ALTER TABLE public.academic_report_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_report_actions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.academic_settings FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.academic_terms FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.academic_homeroom_assignments FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.academic_report_cards FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.academic_report_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.academic_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.academic_terms TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.academic_homeroom_assignments TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.academic_report_cards TO service_role;
GRANT SELECT, INSERT ON TABLE public.academic_report_actions TO service_role;

CREATE OR REPLACE FUNCTION public.academic_report_cards_freeze_published()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'Rapor yang sudah diterbitkan tidak dapat diubah' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academic_report_cards_freeze_published
  BEFORE UPDATE ON public.academic_report_cards
  FOR EACH ROW EXECUTE FUNCTION public.academic_report_cards_freeze_published();

REVOKE ALL ON FUNCTION public.academic_report_cards_freeze_published() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.academic_kktp_threshold(p_tenant_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (SELECT kktp_threshold FROM public.academic_settings WHERE tenant_id = p_tenant_id),
    75::NUMERIC
  );
$$;

CREATE OR REPLACE FUNCTION public.academic_report_authorize(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_allowed_roles TEXT[]
)
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_expected_role IS NULL
     OR p_allowed_roles IS NULL OR NOT (p_expected_role = ANY (p_allowed_roles)) THEN
    RAISE EXCEPTION 'Permintaan rapor akademik tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT t.status, lower(btrim(p.role::TEXT)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR NOT (v_role = ANY (p_allowed_roles)) THEN
    RAISE EXCEPTION 'Profil tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin'
     AND v_permissions ? 'academic'
     AND (v_permissions -> 'academic') IS DISTINCT FROM 'true'::JSONB THEN
    RAISE EXCEPTION 'Profil tidak memiliki akses Akademik pada tenant ini' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.academic_report_score_snapshot(
  p_tenant_id UUID,
  p_student_id UUID,
  p_starts_on DATE,
  p_ends_on DATE,
  p_threshold NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_row public.academic_records%ROWTYPE;
  v_score NUMERIC;
  v_subject TEXT;
  v_assessment_type TEXT;
  v_category TEXT;
  v_lines JSONB := '[]'::JSONB;
  v_canonical TEXT := trim(to_char(p_threshold, '990.00'));
  v_count INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT a.*
    FROM public.academic_records AS a
    WHERE a.tenant_id = p_tenant_id AND a.kind = 'assessment' AND a.student_id = p_student_id
      AND a.deleted_at IS NULL
      AND (a.created_at AT TIME ZONE 'Asia/Jakarta')::DATE BETWEEN p_starts_on AND p_ends_on
    ORDER BY btrim(a.record_data->>'subject'), btrim(a.record_data->>'assessmentType'), a.created_at, a.id
  LOOP
    v_subject := btrim(COALESCE(v_row.record_data->>'subject', ''));
    v_assessment_type := btrim(COALESCE(v_row.record_data->>'assessmentType', ''));
    v_category := COALESCE(v_row.record_data->>'category', '');
    BEGIN
      v_score := (v_row.record_data->>'score')::NUMERIC;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Ada nilai pada rentang semester yang tidak dapat dimasukkan ke rapor' USING ERRCODE = '22023';
    END;
    IF v_subject = '' OR length(v_subject) > 150 OR v_assessment_type = '' OR length(v_assessment_type) > 100
       OR v_category NOT IN ('Formative', 'Summative')
       OR v_score IS NULL OR v_score < 0 OR v_score > 100 THEN
      RAISE EXCEPTION 'Ada nilai pada rentang semester yang tidak dapat dimasukkan ke rapor' USING ERRCODE = '22023';
    END IF;
    v_count := v_count + 1;
    v_canonical := v_canonical || E'\n' || v_row.id::TEXT || '|' || v_subject || '|' || v_assessment_type || '|' || v_category || '|' || trim(to_char(v_score, '990.00'));
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'subject', v_subject,
      'assessmentType', v_assessment_type,
      'category', v_category,
      'score', v_score,
      'remedialStatus', CASE WHEN v_score < p_threshold THEN 'Needed' ELSE 'None' END
    ));
  END LOOP;
  RETURN jsonb_build_object(
    'count', v_count,
    'lines', v_lines,
    'fingerprint', encode(extensions.digest(convert_to(v_canonical, 'UTF8'), 'sha256'), 'hex')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_academic_report_action(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_action TEXT,
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
  v_allowed TEXT[];
  v_keys TEXT[];
  v_expected_keys TEXT[];
  v_request public.academic_report_actions%ROWTYPE;
  v_payload JSONB;
  v_result JSONB;
  v_term public.academic_terms%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_card public.academic_report_cards%ROWTYPE;
  v_class public.master_data_records%ROWTYPE;
  v_teacher_name TEXT;
  v_homeroom UUID;
  v_threshold NUMERIC;
  v_snapshot JSONB;
  v_name TEXT;
  v_starts DATE;
  v_ends DATE;
  v_comment TEXT;
  v_class_id TEXT;
  v_teacher_id UUID;
  v_term_id UUID;
BEGIN
  IF p_action IS NULL OR p_client_request_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Permintaan rapor akademik tidak valid' USING ERRCODE = '22023';
  END IF;
  v_allowed := CASE p_action
    WHEN 'save_comment' THEN ARRAY['admin', 'super_admin', 'ustadz']
    WHEN 'reopen_card' THEN ARRAY['admin', 'super_admin', 'ustadz']
    WHEN 'validate_card' THEN ARRAY['admin', 'super_admin', 'ustadz']
    WHEN 'save_term' THEN ARRAY['admin', 'super_admin']
    WHEN 'close_term' THEN ARRAY['admin', 'super_admin']
    WHEN 'save_threshold' THEN ARRAY['admin', 'super_admin']
    WHEN 'assign_homeroom' THEN ARRAY['admin', 'super_admin']
    WHEN 'publish_card' THEN ARRAY['admin', 'super_admin']
    ELSE NULL
  END;
  IF v_allowed IS NULL THEN
    RAISE EXCEPTION 'Aksi rapor akademik tidak dikenal' USING ERRCODE = '22023';
  END IF;
  v_role := public.academic_report_authorize(p_tenant_id, p_actor_user_id, p_expected_role, v_allowed);

  v_expected_keys := CASE p_action
    WHEN 'save_term' THEN ARRAY['endsOn', 'name', 'startsOn']
    WHEN 'close_term' THEN ARRAY['termId']
    WHEN 'save_threshold' THEN ARRAY['threshold']
    WHEN 'assign_homeroom' THEN ARRAY['classId', 'teacherUserId']
    WHEN 'save_comment' THEN ARRAY['comment', 'studentId']
    ELSE ARRAY['studentId']
  END;
  SELECT COALESCE(array_agg(payload_key ORDER BY payload_key), ARRAY[]::TEXT[])
    INTO v_keys
  FROM jsonb_object_keys(p_payload) AS payload_key;
  IF v_keys IS DISTINCT FROM v_expected_keys THEN
    RAISE EXCEPTION 'Isi permintaan rapor akademik tidak valid' USING ERRCODE = '22023';
  END IF;

  IF p_action = 'save_term' THEN
    v_name := btrim(COALESCE(p_payload->>'name', ''));
    IF v_name = '' OR length(v_name) > 80 OR v_name ~ '[[:cntrl:]]'
       OR COALESCE(p_payload->>'startsOn', '') !~ '^\d{4}-\d{2}-\d{2}$'
       OR COALESCE(p_payload->>'endsOn', '') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Nama atau tanggal semester tidak valid' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_starts := (p_payload->>'startsOn')::DATE;
      v_ends := (p_payload->>'endsOn')::DATE;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Nama atau tanggal semester tidak valid' USING ERRCODE = '22023';
    END;
    IF v_starts::TEXT <> p_payload->>'startsOn' OR v_ends::TEXT <> p_payload->>'endsOn' OR v_ends < v_starts THEN
      RAISE EXCEPTION 'Nama atau tanggal semester tidak valid' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object('name', v_name, 'startsOn', v_starts, 'endsOn', v_ends);
  ELSIF p_action = 'close_term' THEN
    IF COALESCE(p_payload->>'termId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Semester rapor tidak valid' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object('termId', (p_payload->>'termId')::UUID);
  ELSIF p_action = 'save_threshold' THEN
    BEGIN
      v_threshold := (p_payload->>'threshold')::NUMERIC;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Ambang KKTP harus berupa angka 0–100' USING ERRCODE = '22023';
    END;
    IF v_threshold IS NULL OR v_threshold < 0 OR v_threshold > 100 OR v_threshold <> round(v_threshold, 2) THEN
      RAISE EXCEPTION 'Ambang KKTP harus berupa angka 0–100' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object('threshold', trim(to_char(v_threshold, '990.00')));
  ELSIF p_action = 'assign_homeroom' THEN
    v_class_id := btrim(COALESCE(p_payload->>'classId', ''));
    IF v_class_id = '' OR length(v_class_id) > 160 OR v_class_id ~ '[[:cntrl:]]'
       OR COALESCE(p_payload->>'teacherUserId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Kelas atau wali kelas tidak valid' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object('classId', v_class_id, 'teacherUserId', (p_payload->>'teacherUserId')::UUID);
  ELSE
    IF COALESCE(p_payload->>'studentId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Santri rapor tidak valid' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'save_comment' THEN
      v_comment := btrim(COALESCE(p_payload->>'comment', ''));
      IF v_comment = '' OR length(v_comment) > 2000
         OR replace(replace(replace(v_comment, E'\n', ''), E'\r', ''), E'\t', '') ~ '[[:cntrl:]]' THEN
        RAISE EXCEPTION 'Catatan wali kelas wajib diisi dan tidak boleh mengandung karakter kendali' USING ERRCODE = '22023';
      END IF;
      v_payload := jsonb_build_object('studentId', (p_payload->>'studentId')::UUID, 'comment', v_comment);
    ELSE
      v_payload := jsonb_build_object('studentId', (p_payload->>'studentId')::UUID);
    END IF;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'academic-report-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_request
  FROM public.academic_report_actions
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.action IS DISTINCT FROM p_action
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan rapor telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('academic-report-term:' || p_tenant_id::TEXT, 0));

  IF p_action = 'save_term' THEN
    SELECT * INTO v_term FROM public.academic_terms
    WHERE tenant_id = p_tenant_id AND status = 'open' FOR UPDATE;
    IF FOUND THEN
      IF EXISTS (
        SELECT 1 FROM public.academic_report_cards
        WHERE tenant_id = p_tenant_id AND term_id = v_term.id AND status = 'published'
      ) AND (v_term.name IS DISTINCT FROM v_name OR v_term.starts_on IS DISTINCT FROM v_starts OR v_term.ends_on IS DISTINCT FROM v_ends) THEN
        RAISE EXCEPTION 'Semester yang sudah memiliki rapor terbit tidak dapat diubah' USING ERRCODE = '23514';
      END IF;
      IF v_term.starts_on IS DISTINCT FROM v_starts OR v_term.ends_on IS DISTINCT FROM v_ends THEN
        UPDATE public.academic_report_cards
        SET status = 'draft', score_fingerprint = NULL, validated_by = NULL, validated_at = NULL,
            updated_by = p_actor_user_id, updated_at = now()
        WHERE tenant_id = p_tenant_id AND term_id = v_term.id AND status = 'validated';
      END IF;
      UPDATE public.academic_terms
      SET name = v_name, starts_on = v_starts, ends_on = v_ends, updated_by = p_actor_user_id, updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = v_term.id;
      v_term_id := v_term.id;
    ELSE
      INSERT INTO public.academic_terms (tenant_id, name, starts_on, ends_on, status, created_by, updated_by)
      VALUES (p_tenant_id, v_name, v_starts, v_ends, 'open', p_actor_user_id, p_actor_user_id)
      RETURNING id INTO v_term_id;
    END IF;
    v_result := jsonb_build_object('success', true, 'action', p_action, 'termId', v_term_id, 'alreadyApplied', false);
  ELSIF p_action = 'close_term' THEN
    SELECT * INTO v_term FROM public.academic_terms
    WHERE tenant_id = p_tenant_id AND id = (v_payload->>'termId')::UUID AND status = 'open' FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Semester terbuka tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.academic_report_cards
      WHERE tenant_id = p_tenant_id AND term_id = v_term.id AND status IN ('draft', 'validated')
    ) THEN
      RAISE EXCEPTION 'Masih ada rapor yang belum diterbitkan pada semester ini' USING ERRCODE = '23514';
    END IF;
    UPDATE public.academic_terms
    SET status = 'closed', updated_by = p_actor_user_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_term.id;
    v_result := jsonb_build_object('success', true, 'action', p_action, 'termId', v_term.id, 'alreadyApplied', false);
  ELSIF p_action = 'save_threshold' THEN
    INSERT INTO public.academic_settings (tenant_id, kktp_threshold, updated_by)
    VALUES (p_tenant_id, (v_payload->>'threshold')::NUMERIC, p_actor_user_id)
    ON CONFLICT (tenant_id) DO UPDATE
      SET kktp_threshold = EXCLUDED.kktp_threshold, updated_by = EXCLUDED.updated_by, updated_at = now();
    UPDATE public.academic_report_cards AS card
    SET status = 'draft', score_fingerprint = NULL, validated_by = NULL, validated_at = NULL,
        updated_by = p_actor_user_id, updated_at = now()
    FROM public.academic_terms AS term
    WHERE card.tenant_id = p_tenant_id AND card.term_id = term.id AND term.tenant_id = p_tenant_id
      AND term.status = 'open' AND card.status = 'validated';
    v_result := jsonb_build_object('success', true, 'action', p_action, 'threshold', v_payload->>'threshold', 'alreadyApplied', false);
  ELSIF p_action = 'assign_homeroom' THEN
    SELECT * INTO v_term FROM public.academic_terms
    WHERE tenant_id = p_tenant_id AND status = 'open' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Semester terbuka belum tersedia' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_class FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = v_payload->>'classId'
      AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kelas aktif tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    SELECT display_name INTO v_teacher_name FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = (v_payload->>'teacherUserId')::UUID
      AND status = 'active' AND lower(role::TEXT) = 'ustadz';
    IF v_teacher_name IS NULL THEN
      RAISE EXCEPTION 'Wali kelas harus berupa pengajar aktif pada tenant ini' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.academic_homeroom_assignments (
      tenant_id, term_id, class_id, teacher_user_id, assigned_by
    ) VALUES (
      p_tenant_id, v_term.id, v_class.id, (v_payload->>'teacherUserId')::UUID, p_actor_user_id
    )
    ON CONFLICT (tenant_id, term_id, class_id) DO UPDATE
      SET teacher_user_id = EXCLUDED.teacher_user_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now();
    v_result := jsonb_build_object('success', true, 'action', p_action, 'classId', v_class.id, 'alreadyApplied', false);
  ELSE
    SELECT * INTO v_term FROM public.academic_terms
    WHERE tenant_id = p_tenant_id AND status = 'open' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Semester terbuka belum tersedia' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_student FROM public.students
    WHERE tenant_id = p_tenant_id AND id = (v_payload->>'studentId')::UUID
    FOR UPDATE;
    IF NOT FOUND OR lower(btrim(v_student.status)) IN (
      'archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan'
    ) OR v_student.class_id IS NULL THEN
      RAISE EXCEPTION 'Santri aktif dengan kelas belum ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    SELECT * INTO v_class FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = v_student.class_id
      AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kelas santri tidak aktif pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    SELECT teacher_user_id INTO v_homeroom FROM public.academic_homeroom_assignments
    WHERE tenant_id = p_tenant_id AND term_id = v_term.id AND class_id = v_class.id;
    IF v_homeroom IS NULL THEN
      RAISE EXCEPTION 'Wali kelas belum ditetapkan untuk kelas santri ini' USING ERRCODE = '42501';
    END IF;
    IF v_role = 'ustadz' AND v_homeroom IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'Ustadz hanya dapat mengerjakan rapor kelas walinya' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_card FROM public.academic_report_cards
    WHERE tenant_id = p_tenant_id AND term_id = v_term.id AND student_id = v_student.id
    FOR UPDATE;

    IF p_action = 'save_comment' THEN
      IF FOUND AND v_card.status <> 'draft' THEN
        RAISE EXCEPTION 'Catatan hanya dapat diubah saat rapor masih draf' USING ERRCODE = '23514';
      END IF;
      IF NOT FOUND THEN
        INSERT INTO public.academic_report_cards (
          tenant_id, term_id, student_id, class_id, status, homeroom_comment, created_by, updated_by
        ) VALUES (
          p_tenant_id, v_term.id, v_student.id, v_class.id, 'draft', v_payload->>'comment', p_actor_user_id, p_actor_user_id
        ) RETURNING * INTO v_card;
      ELSE
        UPDATE public.academic_report_cards
        SET class_id = v_class.id, homeroom_comment = v_payload->>'comment', updated_by = p_actor_user_id, updated_at = now()
        WHERE tenant_id = p_tenant_id AND id = v_card.id
        RETURNING * INTO v_card;
      END IF;
    ELSIF p_action = 'reopen_card' THEN
      IF NOT FOUND OR v_card.status <> 'validated' THEN
        RAISE EXCEPTION 'Hanya rapor yang sudah divalidasi dan belum terbit yang dapat dibuka kembali' USING ERRCODE = '23514';
      END IF;
      UPDATE public.academic_report_cards
      SET status = 'draft', score_fingerprint = NULL, validated_by = NULL, validated_at = NULL,
          updated_by = p_actor_user_id, updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = v_card.id
      RETURNING * INTO v_card;
    ELSIF p_action = 'validate_card' THEN
      IF NOT FOUND OR v_card.status <> 'draft' OR v_card.homeroom_comment IS NULL THEN
        RAISE EXCEPTION 'Rapor draf dengan catatan wali kelas diperlukan sebelum validasi' USING ERRCODE = '23514';
      END IF;
      v_threshold := public.academic_kktp_threshold(p_tenant_id);
      v_snapshot := public.academic_report_score_snapshot(p_tenant_id, v_student.id, v_term.starts_on, v_term.ends_on, v_threshold);
      IF (v_snapshot->>'count')::INTEGER < 1 THEN
        RAISE EXCEPTION 'Belum ada nilai pada rentang semester ini' USING ERRCODE = '22023';
      END IF;
      UPDATE public.academic_report_cards
      SET class_id = v_class.id, status = 'validated', score_fingerprint = v_snapshot->>'fingerprint',
          validated_by = p_actor_user_id, validated_at = now(), updated_by = p_actor_user_id, updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = v_card.id
      RETURNING * INTO v_card;
    ELSE
      IF NOT FOUND OR v_card.status <> 'validated' THEN
        RAISE EXCEPTION 'Rapor harus divalidasi wali kelas sebelum diterbitkan' USING ERRCODE = '23514';
      END IF;
      IF v_card.class_id IS DISTINCT FROM v_class.id THEN
        RAISE EXCEPTION 'Kelas santri berubah. Buka kembali draf rapor' USING ERRCODE = '23514';
      END IF;
      v_threshold := public.academic_kktp_threshold(p_tenant_id);
      v_snapshot := public.academic_report_score_snapshot(p_tenant_id, v_student.id, v_term.starts_on, v_term.ends_on, v_threshold);
      IF v_snapshot->>'fingerprint' IS DISTINCT FROM v_card.score_fingerprint THEN
        RAISE EXCEPTION 'Nilai atau ambang KKTP berubah. Wali kelas perlu validasi ulang' USING ERRCODE = '23514';
      END IF;
      UPDATE public.academic_report_cards
      SET status = 'published', kktp_threshold = v_threshold, lines = v_snapshot->'lines',
          homeroom_user_id = v_homeroom, published_by = p_actor_user_id, published_at = now(),
          updated_by = p_actor_user_id, updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = v_card.id
      RETURNING * INTO v_card;
    END IF;
    v_result := jsonb_build_object(
      'success', true, 'action', p_action, 'cardId', v_card.id, 'status', v_card.status, 'alreadyApplied', false
    );
  END IF;

  INSERT INTO public.academic_report_actions (
    tenant_id, client_request_id, actor_user_id, action, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, p_action, v_payload, v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_academic_report_workspace(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_term public.academic_terms%ROWTYPE;
  v_threshold NUMERIC;
  v_student_count INTEGER;
  v_class_count INTEGER;
  v_teacher_count INTEGER;
  v_students JSONB;
  v_homerooms JSONB;
  v_classes JSONB := '[]'::JSONB;
  v_teachers JSONB := '[]'::JSONB;
BEGIN
  v_role := public.academic_report_authorize(
    p_tenant_id, p_actor_user_id, p_expected_role, ARRAY['admin', 'super_admin', 'ustadz']
  );
  v_threshold := public.academic_kktp_threshold(p_tenant_id);
  SELECT * INTO v_term FROM public.academic_terms
  WHERE tenant_id = p_tenant_id AND status = 'open';

  IF v_role IN ('admin', 'super_admin') THEN
    SELECT count(*) INTO v_class_count FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas'
      AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
    SELECT count(*) INTO v_teacher_count FROM public.profiles
    WHERE tenant_id = p_tenant_id AND status = 'active' AND lower(role::TEXT) = 'ustadz';
    IF v_class_count > 200 OR v_teacher_count > 200 THEN
      RAISE EXCEPTION 'Pilihan kelas atau pengajar rapor melebihi batas 200' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY lower(name), id), '[]'::JSONB)
      INTO v_classes
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas'
      AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip');
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', user_id, 'name', display_name) ORDER BY lower(display_name), user_id), '[]'::JSONB)
      INTO v_teachers
    FROM public.profiles
    WHERE tenant_id = p_tenant_id AND status = 'active' AND lower(role::TEXT) = 'ustadz';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'classId', assignment.class_id,
    'className', class_row.name,
    'teacherUserId', assignment.teacher_user_id,
    'teacherName', teacher.display_name
  ) ORDER BY lower(class_row.name), assignment.class_id), '[]'::JSONB)
    INTO v_homerooms
  FROM public.academic_homeroom_assignments AS assignment
  JOIN public.master_data_records AS class_row
    ON class_row.tenant_id = assignment.tenant_id AND class_row.category = 'Kelas' AND class_row.id = assignment.class_id
  JOIN public.profiles AS teacher
    ON teacher.tenant_id = assignment.tenant_id AND teacher.user_id = assignment.teacher_user_id
  WHERE assignment.tenant_id = p_tenant_id AND v_term.id IS NOT NULL AND assignment.term_id = v_term.id
    AND (v_role IN ('admin', 'super_admin') OR assignment.teacher_user_id = p_actor_user_id);

  SELECT count(*) INTO v_student_count
  FROM public.students AS student
  JOIN public.academic_homeroom_assignments AS assignment
    ON assignment.tenant_id = student.tenant_id AND assignment.term_id = v_term.id AND assignment.class_id = student.class_id
  WHERE v_term.id IS NOT NULL AND student.tenant_id = p_tenant_id
    AND lower(btrim(student.status)) NOT IN ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan')
    AND (v_role IN ('admin', 'super_admin') OR assignment.teacher_user_id = p_actor_user_id);
  IF v_student_count > 500 THEN
    RAISE EXCEPTION 'Jumlah santri pada semester ini melebihi batas 500' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'studentId', student.id,
    'studentName', student.name,
    'nis', student.nis,
    'classId', student.class_id,
    'className', class_row.name,
    'status', COALESCE(card.status, 'unstarted'),
    'comment', card.homeroom_comment,
    'lines', card.lines,
    'publishedAt', card.published_at
  ) ORDER BY lower(class_row.name), lower(student.name), student.id), '[]'::JSONB)
    INTO v_students
  FROM public.students AS student
  JOIN public.academic_homeroom_assignments AS assignment
    ON assignment.tenant_id = student.tenant_id AND assignment.term_id = v_term.id AND assignment.class_id = student.class_id
  JOIN public.master_data_records AS class_row
    ON class_row.tenant_id = student.tenant_id AND class_row.category = 'Kelas' AND class_row.id = student.class_id
  LEFT JOIN public.academic_report_cards AS card
    ON card.tenant_id = student.tenant_id AND card.term_id = v_term.id AND card.student_id = student.id
  WHERE v_term.id IS NOT NULL AND student.tenant_id = p_tenant_id
    AND lower(btrim(student.status)) NOT IN ('archived', 'archive', 'arsip', 'inactive', 'nonaktif', 'tidak aktif', 'alumni', 'graduated', 'lulus', 'dikeluarkan')
    AND (v_role IN ('admin', 'super_admin') OR assignment.teacher_user_id = p_actor_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'threshold', v_threshold,
    'term', CASE WHEN v_term.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_term.id, 'name', v_term.name, 'startsOn', v_term.starts_on, 'endsOn', v_term.ends_on, 'status', v_term.status
    ) END,
    'homerooms', v_homerooms,
    'students', v_students,
    'classes', v_classes,
    'teachers', v_teachers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_published_academic_report_cards(
  p_tenant_id UUID,
  p_student_id UUID
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', card.id,
    'termName', term.name,
    'startsOn', term.starts_on,
    'endsOn', term.ends_on,
    'comment', card.homeroom_comment,
    'threshold', card.kktp_threshold,
    'lines', card.lines,
    'publishedAt', card.published_at
  ) ORDER BY card.published_at DESC, card.id DESC), '[]'::JSONB)
  FROM (
    SELECT *
    FROM public.academic_report_cards
    WHERE tenant_id = p_tenant_id AND student_id = p_student_id AND status = 'published'
    ORDER BY published_at DESC, id DESC
    LIMIT 20
  ) AS card
  JOIN public.academic_terms AS term
    ON term.tenant_id = card.tenant_id AND term.id = card.term_id;
$$;

REVOKE ALL ON FUNCTION public.academic_kktp_threshold(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academic_report_authorize(UUID, UUID, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.academic_report_score_snapshot(UUID, UUID, DATE, DATE, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academic_report_authorize(UUID, UUID, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.academic_report_score_snapshot(UUID, UUID, DATE, DATE, NUMERIC) TO service_role;
REVOKE ALL ON FUNCTION public.apply_academic_report_action(UUID, UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_academic_report_workspace(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_published_academic_report_cards(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academic_kktp_threshold(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_academic_report_action(UUID, UUID, TEXT, TEXT, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_academic_report_workspace(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_published_academic_report_cards(UUID, UUID) TO service_role;

COMMENT ON TABLE public.academic_report_cards IS
  'One report card per student and term. Published rows are frozen, including the KKTP threshold and score lines.';
COMMENT ON FUNCTION public.apply_academic_report_action(UUID, UUID, TEXT, TEXT, JSONB, UUID) IS
  'Admin and homeroom transitions for a semester report card. Publication freezes scores; a changed score requires validation again.';
COMMENT ON FUNCTION public.get_published_academic_report_cards(UUID, UUID) IS
  'Published report cards for one tenant student. The API must authorize the student link before calling it.';

COMMIT;
