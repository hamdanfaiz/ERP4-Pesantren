-- Tenant-scoped Alumni directory and atomic student graduation workflow.
-- Staged only: keep runtime flags disabled until this migration is reconciled and applied.
BEGIN;

CREATE TABLE public.alumni_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  graduation_year SMALLINT NOT NULL CHECK (graduation_year BETWEEN 1900 AND 2200),
  graduated_at DATE NOT NULL,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, student_id),
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, id)
);

CREATE INDEX alumni_profiles_tenant_graduation_idx
  ON public.alumni_profiles (tenant_id, graduation_year DESC, graduated_at DESC);

CREATE TABLE public.alumni_graduation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  student_id UUID NOT NULL,
  graduation_year SMALLINT NOT NULL CHECK (graduation_year BETWEEN 1900 AND 2200),
  graduated_at DATE NOT NULL,
  created_by_user_id UUID NOT NULL,
  alumni_profile_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, alumni_profile_id)
    REFERENCES public.alumni_profiles (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.alumni_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_graduation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_graduation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alumni_profiles, public.alumni_graduation_requests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.alumni_profiles TO service_role;
GRANT SELECT, INSERT ON TABLE public.alumni_graduation_requests TO service_role;

CREATE OR REPLACE FUNCTION public.graduate_tenant_student(
  p_tenant_id UUID,
  p_student_id UUID,
  p_graduation_year SMALLINT,
  p_graduated_at DATE,
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
  v_student public.students%ROWTYPE;
  v_existing_request public.alumni_graduation_requests%ROWTYPE;
  v_profile_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_created_by_user_id IS NULL
    OR p_client_request_id IS NULL OR p_graduation_year IS NULL OR p_graduation_year NOT BETWEEN 1900 AND 2200
    OR p_graduated_at IS NULL OR extract(year FROM p_graduated_at)::integer <> p_graduation_year
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Data kelulusan Alumni tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_created_by_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') OR v_role <> p_expected_role THEN
    RAISE EXCEPTION 'Hanya Admin aktif pada tenant yang dapat memproses kelulusan' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'alumni-graduation:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing_request
  FROM public.alumni_graduation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing_request.student_id IS DISTINCT FROM p_student_id
      OR v_existing_request.graduation_year IS DISTINCT FROM p_graduation_year
      OR v_existing_request.graduated_at IS DISTINCT FROM p_graduated_at
      OR v_existing_request.created_by_user_id IS DISTINCT FROM p_created_by_user_id THEN
      RAISE EXCEPTION 'Kunci permintaan kelulusan telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyGraduated', true, 'alumniId', v_existing_request.alumni_profile_id);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'alumni-student:' || p_tenant_id::text || ':' || p_student_id::text, 0
  ));
  SELECT * INTO v_student FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF lower(COALESCE(v_student.status, '')) = 'archived'
    OR EXISTS (SELECT 1 FROM public.alumni_profiles WHERE tenant_id = p_tenant_id AND student_id = p_student_id) THEN
    RAISE EXCEPTION 'Santri sudah diarsipkan atau tercatat sebagai Alumni' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.alumni_profiles (
    tenant_id, student_id, graduation_year, graduated_at, created_by_user_id
  ) VALUES (
    p_tenant_id, p_student_id, p_graduation_year, p_graduated_at, p_created_by_user_id
  ) RETURNING id INTO v_profile_id;

  UPDATE public.students SET status = 'Archived', updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_student_id;

  INSERT INTO public.alumni_graduation_requests (
    tenant_id, client_request_id, student_id, graduation_year, graduated_at,
    created_by_user_id, alumni_profile_id
  ) VALUES (
    p_tenant_id, p_client_request_id, p_student_id, p_graduation_year, p_graduated_at,
    p_created_by_user_id, v_profile_id
  );
  RETURN jsonb_build_object('success', true, 'alreadyGraduated', false, 'alumniId', v_profile_id);
END;
$$;

REVOKE ALL ON FUNCTION public.graduate_tenant_student(UUID, UUID, SMALLINT, DATE, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.graduate_tenant_student(UUID, UUID, SMALLINT, DATE, UUID, TEXT, UUID)
  TO service_role;

COMMENT ON TABLE public.alumni_profiles IS
  'Tenant-scoped Alumni records derived from a student graduation; source student remains archived for audit and history.';
COMMENT ON FUNCTION public.graduate_tenant_student(UUID, UUID, SMALLINT, DATE, UUID, TEXT, UUID) IS
  'Atomically validates an active tenant Admin, records Alumni, archives the student, and makes retries idempotent.';

COMMIT;
