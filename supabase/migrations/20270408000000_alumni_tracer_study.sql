-- Store consented, categorical Alumni tracer responses without free-text PII.
-- All reads/writes remain behind authenticated tenant-scoped server routes.
BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.alumni_tracer_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  alumni_profile_id UUID NOT NULL,
  survey_year SMALLINT NOT NULL CHECK (survey_year BETWEEN 2000 AND 2200),
  activity_status TEXT NOT NULL CHECK (activity_status IN (
    'studying', 'employed', 'self_employed', 'working_and_studying',
    'seeking_work', 'not_working', 'other'
  )),
  education_level TEXT NOT NULL CHECK (education_level IN (
    'not_applicable', 'secondary', 'diploma', 'bachelor', 'master', 'doctorate', 'nonformal', 'other'
  )),
  employment_sector TEXT NOT NULL CHECK (employment_sector IN (
    'not_applicable', 'education', 'government', 'healthcare', 'business', 'industry',
    'agriculture', 'technology', 'religious', 'nonprofit', 'other'
  )),
  consent_confirmed_at TIMESTAMPTZ NOT NULL,
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, alumni_profile_id, survey_year),
  FOREIGN KEY (tenant_id, alumni_profile_id)
    REFERENCES public.alumni_profiles (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (activity_status IN ('studying', 'working_and_studying') AND education_level <> 'not_applicable')
    OR (activity_status NOT IN ('studying', 'working_and_studying') AND education_level = 'not_applicable')
  ),
  CHECK (
    (activity_status IN ('employed', 'self_employed', 'working_and_studying') AND employment_sector <> 'not_applicable')
    OR (activity_status NOT IN ('employed', 'self_employed', 'working_and_studying') AND employment_sector = 'not_applicable')
  )
);

CREATE INDEX alumni_tracer_responses_tenant_year_idx
  ON public.alumni_tracer_responses (tenant_id, survey_year DESC, alumni_profile_id);

CREATE TABLE public.alumni_tracer_mutation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  payload_fingerprint TEXT NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  response_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, response_id)
    REFERENCES public.alumni_tracer_responses (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.alumni_tracer_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_tracer_responses FORCE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_tracer_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alumni_tracer_mutation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.alumni_tracer_responses, public.alumni_tracer_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.alumni_tracer_responses TO service_role;
GRANT SELECT, INSERT ON TABLE public.alumni_tracer_mutation_requests TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_alumni_tracer_response(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_alumni_profile_id UUID,
  p_survey_year SMALLINT,
  p_activity_status TEXT,
  p_education_level TEXT,
  p_employment_sector TEXT,
  p_consent_confirmed BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_existing_request public.alumni_tracer_mutation_requests%ROWTYPE;
  v_response_id UUID;
  v_created BOOLEAN;
  v_payload_fingerprint TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_alumni_profile_id IS NULL OR p_survey_year IS NULL OR p_survey_year NOT BETWEEN 2000 AND 2200
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_activity_status IS NULL OR p_activity_status NOT IN (
      'studying', 'employed', 'self_employed', 'working_and_studying', 'seeking_work', 'not_working', 'other'
    )
    OR p_education_level IS NULL OR p_education_level NOT IN (
      'not_applicable', 'secondary', 'diploma', 'bachelor', 'master', 'doctorate', 'nonformal', 'other'
    )
    OR p_employment_sector IS NULL OR p_employment_sector NOT IN (
      'not_applicable', 'education', 'government', 'healthcare', 'business', 'industry',
      'agriculture', 'technology', 'religious', 'nonprofit', 'other'
    )
    OR p_consent_confirmed IS DISTINCT FROM TRUE
    OR (p_activity_status IN ('studying', 'working_and_studying') AND p_education_level = 'not_applicable')
    OR (p_activity_status NOT IN ('studying', 'working_and_studying') AND p_education_level <> 'not_applicable')
    OR (p_activity_status IN ('employed', 'self_employed', 'working_and_studying') AND p_employment_sector = 'not_applicable')
    OR (p_activity_status NOT IN ('employed', 'self_employed', 'working_and_studying') AND p_employment_sector <> 'not_applicable') THEN
    RAISE EXCEPTION 'Data Tracer Study tidak valid atau persetujuan belum dikonfirmasi' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_payload_fingerprint := encode(extensions.digest(convert_to(jsonb_build_object(
    'alumniProfileId', p_alumni_profile_id,
    'surveyYear', p_survey_year,
    'activityStatus', p_activity_status,
    'educationLevel', p_education_level,
    'employmentSector', p_employment_sector,
    'consentConfirmed', p_consent_confirmed
  )::text, 'UTF8'), 'sha256'), 'hex');

  SELECT lower(btrim(role::text)), module_permissions
  INTO v_role, v_permissions
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') OR v_role <> p_expected_role
    OR v_permissions @> '{"alumni": false}'::jsonb THEN
    RAISE EXCEPTION 'Akses Admin modul Alumni diperlukan untuk mencatat Tracer Study' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'alumni-tracer-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing_request
  FROM public.alumni_tracer_mutation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing_request.payload_fingerprint IS DISTINCT FROM v_payload_fingerprint
      OR v_existing_request.actor_user_id IS DISTINCT FROM p_actor_user_id THEN
      RAISE EXCEPTION 'Kunci permintaan Tracer Study telah digunakan untuk jawaban berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'responseId', v_existing_request.response_id);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'alumni-tracer-response:' || p_tenant_id::text || ':' || p_alumni_profile_id::text || ':' || p_survey_year::text, 0
  ));
  IF NOT EXISTS (
    SELECT 1 FROM public.alumni_profiles
    WHERE tenant_id = p_tenant_id AND id = p_alumni_profile_id
  ) THEN
    RAISE EXCEPTION 'Profil Alumni tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_response_id
  FROM public.alumni_tracer_responses
  WHERE tenant_id = p_tenant_id
    AND alumni_profile_id = p_alumni_profile_id
    AND survey_year = p_survey_year
  FOR UPDATE;
  v_created := NOT FOUND;

  INSERT INTO public.alumni_tracer_responses (
    tenant_id, alumni_profile_id, survey_year, activity_status, education_level,
    employment_sector, consent_confirmed_at, created_by_user_id, updated_by_user_id
  ) VALUES (
    p_tenant_id, p_alumni_profile_id, p_survey_year, p_activity_status, p_education_level,
    p_employment_sector, clock_timestamp(), p_actor_user_id, p_actor_user_id
  )
  ON CONFLICT (tenant_id, alumni_profile_id, survey_year) DO UPDATE SET
    activity_status = EXCLUDED.activity_status,
    education_level = EXCLUDED.education_level,
    employment_sector = EXCLUDED.employment_sector,
    consent_confirmed_at = EXCLUDED.consent_confirmed_at,
    updated_by_user_id = EXCLUDED.updated_by_user_id,
    updated_at = clock_timestamp()
  RETURNING id INTO v_response_id;

  INSERT INTO public.alumni_tracer_mutation_requests (
    tenant_id, client_request_id, actor_user_id, payload_fingerprint, response_id
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, v_payload_fingerprint, v_response_id
  );

  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'created', v_created, 'responseId', v_response_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_alumni_tracer_response(UUID, UUID, TEXT, UUID, UUID, SMALLINT, TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_alumni_tracer_response(UUID, UUID, TEXT, UUID, UUID, SMALLINT, TEXT, TEXT, TEXT, BOOLEAN)
  TO service_role;

COMMENT ON TABLE public.alumni_tracer_responses IS
  'Tenant-scoped, consent-confirmed categorical Alumni outcomes; avoids free-text personal details.';
COMMENT ON TABLE public.alumni_tracer_mutation_requests IS
  'Minimal idempotency receipts for Alumni Tracer Study writes; stores a payload fingerprint without duplicating answers.';
COMMENT ON FUNCTION public.upsert_alumni_tracer_response(UUID, UUID, TEXT, UUID, UUID, SMALLINT, TEXT, TEXT, TEXT, BOOLEAN) IS
  'Upserts one consent-confirmed Alumni response per survey year after active tenant Admin and module permission checks.';

COMMIT;
