-- PPDB admin workflow data and trusted mutation RPCs.
-- This migration is stacked on the public PPDB runtime migration.
BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS workflow_data JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(workflow_data) = 'object');

CREATE OR REPLACE FUNCTION public.jsonb_deep_merge(p_target JSONB, p_patch JSONB)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result JSONB := COALESCE(p_target, '{}'::jsonb);
  v_key TEXT;
  v_value JSONB;
BEGIN
  IF jsonb_typeof(COALESCE(p_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'JSON patch must be an object' USING ERRCODE = '22023';
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(COALESCE(p_patch, '{}'::jsonb))
  LOOP
    IF jsonb_typeof(v_value) = 'object' AND jsonb_typeof(v_result -> v_key) = 'object' THEN
      v_result := jsonb_set(v_result, ARRAY[v_key], public.jsonb_deep_merge(v_result -> v_key, v_value), true);
    ELSE
      v_result := jsonb_set(v_result, ARRAY[v_key], v_value, true);
    END IF;
  END LOOP;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.jsonb_deep_merge(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jsonb_deep_merge(JSONB, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.update_ppdb_candidate(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_core_patch JSONB,
  p_workflow_patch JSONB,
  p_documents_patch JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR jsonb_typeof(COALESCE(p_core_patch, '{}'::jsonb)) <> 'object'
    OR jsonb_typeof(COALESCE(p_workflow_patch, '{}'::jsonb)) <> 'object'
    OR jsonb_typeof(COALESCE(p_documents_patch, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid PPDB update payload' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(COALESCE(p_core_patch, '{}'::jsonb)) AS key
    WHERE key NOT IN ('stage', 'score', 'examSlot', 'interviewer', 'interviewSlot', 'interviewNotified', 'notes')
  ) THEN
    RAISE EXCEPTION 'Unsupported PPDB core field' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(COALESCE(p_documents_patch, '{}'::jsonb)) AS key
    WHERE key NOT IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')
  ) THEN
    RAISE EXCEPTION 'Unsupported PPDB document field' USING ERRCODE = '22023';
  END IF;

  UPDATE public.candidates
  SET stage = CASE WHEN p_core_patch ? 'stage' THEN (p_core_patch->>'stage')::public.registration_stage ELSE stage END,
      score = CASE WHEN p_core_patch ? 'score' THEN NULLIF(p_core_patch->>'score', '')::INTEGER ELSE score END,
      exam_slot = CASE WHEN p_core_patch ? 'examSlot' THEN NULLIF(p_core_patch->>'examSlot', '') ELSE exam_slot END,
      interviewer = CASE WHEN p_core_patch ? 'interviewer' THEN NULLIF(p_core_patch->>'interviewer', '') ELSE interviewer END,
      interview_slot = CASE WHEN p_core_patch ? 'interviewSlot' THEN NULLIF(p_core_patch->>'interviewSlot', '') ELSE interview_slot END,
      interview_notified = CASE WHEN p_core_patch ? 'interviewNotified' THEN (p_core_patch->>'interviewNotified')::BOOLEAN ELSE interview_notified END,
      notes = CASE WHEN p_core_patch ? 'notes' THEN NULLIF(p_core_patch->>'notes', '') ELSE notes END,
      workflow_data = public.jsonb_deep_merge(workflow_data, COALESCE(p_workflow_patch, '{}'::jsonb))
  WHERE id = p_candidate_id AND tenant_id = p_tenant_id
  RETURNING id INTO v_updated;

  IF v_updated IS NULL THEN
    RETURN false;
  END IF;

  IF p_documents_patch <> '{}'::jsonb THEN
    INSERT INTO public.candidate_documents (
      tenant_id, candidate_id, kk, birth_certificate, report_cards, ijazah, skhun, pas_photo
    ) VALUES (
      p_tenant_id, p_candidate_id,
      COALESCE((p_documents_patch->>'kk')::BOOLEAN, false),
      COALESCE((p_documents_patch->>'birthCertificate')::BOOLEAN, false),
      COALESCE((p_documents_patch->>'reportCards')::BOOLEAN, false),
      COALESCE((p_documents_patch->>'ijazah')::BOOLEAN, false),
      COALESCE((p_documents_patch->>'skhun')::BOOLEAN, false),
      COALESCE((p_documents_patch->>'pasPhoto')::BOOLEAN, false)
    )
    ON CONFLICT (tenant_id, candidate_id) DO UPDATE SET
      kk = CASE WHEN p_documents_patch ? 'kk' THEN (p_documents_patch->>'kk')::BOOLEAN ELSE public.candidate_documents.kk END,
      birth_certificate = CASE WHEN p_documents_patch ? 'birthCertificate' THEN (p_documents_patch->>'birthCertificate')::BOOLEAN ELSE public.candidate_documents.birth_certificate END,
      report_cards = CASE WHEN p_documents_patch ? 'reportCards' THEN (p_documents_patch->>'reportCards')::BOOLEAN ELSE public.candidate_documents.report_cards END,
      ijazah = CASE WHEN p_documents_patch ? 'ijazah' THEN (p_documents_patch->>'ijazah')::BOOLEAN ELSE public.candidate_documents.ijazah END,
      skhun = CASE WHEN p_documents_patch ? 'skhun' THEN (p_documents_patch->>'skhun')::BOOLEAN ELSE public.candidate_documents.skhun END,
      pas_photo = CASE WHEN p_documents_patch ? 'pasPhoto' THEN (p_documents_patch->>'pasPhoto')::BOOLEAN ELSE public.candidate_documents.pas_photo END,
      updated_at = now();
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_ppdb_candidates_batch(
  p_tenant_id UUID,
  p_updates JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_item JSONB;
  v_count INTEGER := 0;
  v_updated BOOLEAN;
BEGIN
  IF p_tenant_id IS NULL OR jsonb_typeof(p_updates) <> 'array' OR jsonb_array_length(p_updates) > 500 THEN
    RAISE EXCEPTION 'Invalid PPDB batch payload' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    v_updated := public.update_ppdb_candidate(
      p_tenant_id,
      (v_item->>'id')::UUID,
      COALESCE(v_item->'core', '{}'::jsonb),
      COALESCE(v_item->'workflow', '{}'::jsonb),
      COALESCE(v_item->'documents', '{}'::jsonb)
    );
    IF NOT v_updated THEN
      RAISE EXCEPTION 'PPDB candidate is unavailable in this tenant' USING ERRCODE = 'P0002';
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_ppdb_candidate(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_registration_id TEXT,
  p_candidate JSONB,
  p_workflow_data JSONB,
  p_documents JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR p_registration_id IS NULL OR length(btrim(p_registration_id)) < 1
    OR length(p_registration_id) > 50
    OR jsonb_typeof(p_candidate) <> 'object'
    OR jsonb_typeof(COALESCE(p_workflow_data, '{}'::jsonb)) <> 'object'
    OR jsonb_typeof(COALESCE(p_documents, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Invalid PPDB candidate input' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.candidates (
    id, tenant_id, registration_id, name, previous_school, grade, phone, whatsapp_phone, email,
    nik_ciphertext, nik_fingerprint, nisn_ciphertext, nisn_fingerprint, pob, dob, address,
    province, regency, district, village, gender, father_name, mother_name, father_job,
    mother_job, father_education, mother_education, family_income, stage, score, date_applied,
    onboarding_status, sync_to_master_data, workflow_data
  ) VALUES (
    p_candidate_id, p_tenant_id, p_registration_id,
    p_candidate->>'name', p_candidate->>'previousSchool', p_candidate->>'grade',
    p_candidate->>'phone', p_candidate->>'whatsappPhone', NULLIF(p_candidate->>'email', ''),
    decode(p_candidate->>'nikCiphertext', 'hex'), decode(p_candidate->>'nikFingerprint', 'hex'),
    CASE WHEN NULLIF(p_candidate->>'nisnCiphertext', '') IS NULL THEN NULL ELSE decode(p_candidate->>'nisnCiphertext', 'hex') END,
    CASE WHEN NULLIF(p_candidate->>'nisnFingerprint', '') IS NULL THEN NULL ELSE decode(p_candidate->>'nisnFingerprint', 'hex') END,
    p_candidate->>'pob', (p_candidate->>'dob')::DATE, p_candidate->>'address',
    NULLIF(p_candidate->>'province', ''), NULLIF(p_candidate->>'regency', ''),
    NULLIF(p_candidate->>'district', ''), NULLIF(p_candidate->>'village', ''),
    (p_candidate->>'gender')::public.gender_type, p_candidate->>'fatherName',
    p_candidate->>'motherName', NULLIF(p_candidate->>'fatherJob', ''),
    NULLIF(p_candidate->>'motherJob', ''), NULLIF(p_candidate->>'fatherEducation', ''),
    NULLIF(p_candidate->>'motherEducation', ''), NULLIF(p_candidate->>'familyIncome', ''),
    COALESCE((p_candidate->>'stage')::public.registration_stage, 'Registered'),
    NULLIF(p_candidate->>'score', '')::INTEGER,
    COALESCE(NULLIF(p_candidate->>'dateApplied', '')::DATE, CURRENT_DATE),
    COALESCE(NULLIF(p_candidate->>'onboardingStatus', ''), 'Pending'),
    COALESCE((p_candidate->>'syncToMasterData')::BOOLEAN, false),
    COALESCE(p_workflow_data, '{}'::jsonb)
  );

  INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
  VALUES (p_tenant_id, 'nik', decode(p_candidate->>'nikFingerprint', 'hex'), 'candidate', p_candidate_id);

  IF NULLIF(p_candidate->>'nisnFingerprint', '') IS NOT NULL THEN
    INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
    VALUES (p_tenant_id, 'nisn', decode(p_candidate->>'nisnFingerprint', 'hex'), 'candidate', p_candidate_id);
  END IF;

  INSERT INTO public.candidate_documents (
    tenant_id, candidate_id, kk, birth_certificate, report_cards, ijazah, skhun, pas_photo
  ) VALUES (
    p_tenant_id, p_candidate_id,
    COALESCE((p_documents->>'kk')::BOOLEAN, false),
    COALESCE((p_documents->>'birthCertificate')::BOOLEAN, false),
    COALESCE((p_documents->>'reportCards')::BOOLEAN, false),
    COALESCE((p_documents->>'ijazah')::BOOLEAN, false),
    COALESCE((p_documents->>'skhun')::BOOLEAN, false),
    COALESCE((p_documents->>'pasPhoto')::BOOLEAN, false)
  );

  RETURN jsonb_build_object('id', p_candidate_id, 'registrationId', p_registration_id);
END;
$$;

REVOKE ALL ON FUNCTION public.update_ppdb_candidate(UUID, UUID, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_ppdb_candidates_batch(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_admin_ppdb_candidate(UUID, UUID, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ppdb_candidate(UUID, UUID, JSONB, JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_ppdb_candidates_batch(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_ppdb_candidate(UUID, UUID, TEXT, JSONB, JSONB, JSONB) TO service_role;

COMMIT;
