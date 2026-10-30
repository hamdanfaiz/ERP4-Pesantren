-- Trusted, auditable and idempotent entry point for PPDB-to-student onboarding.
-- Keep staged until the canonical profile schema and migration history are reconciled.
BEGIN;

CREATE TABLE public.ppdb_onboarding_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  candidate_id UUID NOT NULL,
  student_id UUID NOT NULL,
  guardian_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, candidate_id) REFERENCES public.candidates(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, guardian_id) REFERENCES public.guardians(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX ppdb_onboarding_events_tenant_created_idx
  ON public.ppdb_onboarding_events(tenant_id, created_at DESC, id DESC);

ALTER TABLE public.ppdb_onboarding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppdb_onboarding_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ppdb_onboarding_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ppdb_onboarding_events FROM service_role;

CREATE OR REPLACE FUNCTION public.onboard_accepted_ppdb_candidate_for_admin(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_candidate_id UUID,
  p_nis TEXT,
  p_class_id TEXT,
  p_room_id TEXT,
  p_building_id TEXT,
  p_guardian_name TEXT,
  p_guardian_phone TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_has_payload_match BOOLEAN;
  v_prior public.ppdb_onboarding_events%ROWTYPE;
  v_result JSONB;
  v_student_id UUID;
  v_guardian_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_candidate_id IS NULL OR p_client_request_id IS NULL
    OR p_nis IS NULL OR p_nis !~ '^[0-9]{10}$'
    OR p_class_id IS NULL OR length(btrim(p_class_id)) = 0
    OR p_room_id IS NULL OR length(btrim(p_room_id)) = 0
    OR p_guardian_name IS NULL OR length(btrim(p_guardian_name)) NOT BETWEEN 2 AND 180
    OR p_guardian_phone IS NULL OR length(btrim(p_guardian_phone)) NOT BETWEEN 5 AND 24 THEN
    RAISE EXCEPTION 'Data onboarding tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT, module_permissions INTO v_role, v_permissions
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND OR v_role NOT IN ('admin', 'super_admin')
    OR (v_role <> 'super_admin' AND EXISTS (
      SELECT 1
      FROM unnest(ARRAY['ppdb', 'master-data', 'boarding']::TEXT[]) AS required(module)
      WHERE CASE
        WHEN v_permissions ? required.module THEN
          CASE WHEN jsonb_typeof(v_permissions -> required.module) = 'boolean'
            THEN (v_permissions ->> required.module)::BOOLEAN ELSE false END
        ELSE v_role = 'admin'
      END IS NOT TRUE
    )) THEN
    RAISE EXCEPTION 'Admin tenant dengan izin PPDB, Master Data, dan Asrama diperlukan' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ppdb-onboard-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.ppdb_onboarding_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.candidate_id <> p_candidate_id
      OR NOT EXISTS (
        SELECT 1
        FROM public.students s
        JOIN public.guardians g ON g.tenant_id = s.tenant_id AND g.id = v_prior.guardian_id
        JOIN public.guardian_students gs ON gs.tenant_id = s.tenant_id
          AND gs.student_id = s.id AND gs.guardian_id = g.id
        WHERE s.tenant_id = p_tenant_id AND s.id = v_prior.student_id
          AND s.source_candidate_id = p_candidate_id
          AND s.nis = btrim(p_nis)
          AND s.class_id = btrim(p_class_id)
          AND s.room_id = btrim(p_room_id)
          AND (NULLIF(btrim(p_building_id), '') IS NULL OR s.building_id = btrim(p_building_id))
          AND g.name = btrim(p_guardian_name)
          AND g.phone = btrim(p_guardian_phone)
      ) THEN
      RAISE EXCEPTION 'Kunci permintaan onboarding telah digunakan untuk payload berbeda' USING ERRCODE = '23505';
    END IF;
    SELECT jsonb_build_object(
      'success', true, 'alreadyOnboarded', true, 'replayed', true,
      'nis', s.nis, 'santriId', s.id, 'waliId', g.id
    ) INTO v_result
    FROM public.students s
    JOIN public.guardians g ON g.tenant_id = s.tenant_id AND g.id = v_prior.guardian_id
    WHERE s.tenant_id = p_tenant_id AND s.id = v_prior.student_id;
    RETURN v_result;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('ppdb-onboard-candidate:' || p_tenant_id::TEXT || ':' || p_candidate_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.ppdb_onboarding_events
  WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id
  ORDER BY created_at, id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.guardians g ON g.tenant_id = s.tenant_id AND g.id = v_prior.guardian_id
      JOIN public.guardian_students gs ON gs.tenant_id = s.tenant_id
        AND gs.student_id = s.id AND gs.guardian_id = g.id
      WHERE s.tenant_id = p_tenant_id AND s.id = v_prior.student_id
        AND s.source_candidate_id = p_candidate_id
        AND s.nis = btrim(p_nis)
        AND s.class_id = btrim(p_class_id)
        AND s.room_id = btrim(p_room_id)
        AND (NULLIF(btrim(p_building_id), '') IS NULL OR s.building_id = btrim(p_building_id))
        AND g.name = btrim(p_guardian_name)
        AND g.phone = btrim(p_guardian_phone)
    ) INTO v_has_payload_match;
    IF NOT v_has_payload_match THEN
      RAISE EXCEPTION 'Kandidat telah di-onboard dengan penempatan berbeda' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.ppdb_onboarding_events (
      tenant_id, candidate_id, student_id, guardian_id, actor_user_id, client_request_id
    ) VALUES (
      p_tenant_id, p_candidate_id, v_prior.student_id, v_prior.guardian_id, p_actor_user_id, p_client_request_id
    );
    SELECT jsonb_build_object(
      'success', true, 'alreadyOnboarded', true, 'replayed', false,
      'nis', s.nis, 'santriId', s.id, 'waliId', g.id
    ) INTO v_result
    FROM public.students s
    JOIN public.guardians g ON g.tenant_id = s.tenant_id AND g.id = v_prior.guardian_id
    WHERE s.tenant_id = p_tenant_id AND s.id = v_prior.student_id;
    RETURN v_result;
  END IF;

  v_result := public.onboard_accepted_ppdb_candidate(
    p_tenant_id, p_candidate_id, btrim(p_nis), btrim(p_class_id), btrim(p_room_id),
    NULLIF(btrim(p_building_id), ''), btrim(p_guardian_name), btrim(p_guardian_phone)
  );
  IF COALESCE((v_result->>'success')::BOOLEAN, false) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Backend belum mengonfirmasi onboarding santri' USING ERRCODE = '55000';
  END IF;
  v_student_id := NULLIF(v_result->>'santriId', '')::UUID;
  v_guardian_id := NULLIF(v_result->>'waliId', '')::UUID;
  IF v_student_id IS NULL OR v_guardian_id IS NULL THEN
    RAISE EXCEPTION 'Identitas hasil onboarding tidak lengkap' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.ppdb_onboarding_events (
    tenant_id, candidate_id, student_id, guardian_id, actor_user_id, client_request_id
  ) VALUES (
    p_tenant_id, p_candidate_id, v_student_id, v_guardian_id, p_actor_user_id, p_client_request_id
  );
  RETURN v_result || jsonb_build_object('replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.onboard_accepted_ppdb_candidate(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.onboard_accepted_ppdb_candidate_for_admin(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_accepted_ppdb_candidate_for_admin(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  TO service_role;

COMMIT;
