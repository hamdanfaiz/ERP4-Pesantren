-- Supabase-backed public PPDB runtime.
-- Keep this migration unapplied until legacy candidate identities have been reconciled
-- and the private Storage bucket and server secrets are prepared in a non-production environment.
BEGIN;

ALTER TABLE public.candidates
  ALTER COLUMN phone TYPE VARCHAR(24),
  ALTER COLUMN whatsapp_phone TYPE VARCHAR(24),
  ALTER COLUMN email TYPE VARCHAR(254);

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS province VARCHAR(80),
  ADD COLUMN IF NOT EXISTS regency VARCHAR(80),
  ADD COLUMN IF NOT EXISTS district VARCHAR(80),
  ADD COLUMN IF NOT EXISTS village VARCHAR(80),
  ADD COLUMN IF NOT EXISTS father_education VARCHAR(80),
  ADD COLUMN IF NOT EXISTS mother_education VARCHAR(80),
  ADD COLUMN IF NOT EXISTS family_income VARCHAR(80),
  ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS sync_to_master_data BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.candidate_documents
  ADD COLUMN IF NOT EXISTS kk_path TEXT,
  ADD COLUMN IF NOT EXISTS birth_certificate_path TEXT,
  ADD COLUMN IF NOT EXISTS report_cards_path TEXT,
  ADD COLUMN IF NOT EXISTS ijazah_path TEXT,
  ADD COLUMN IF NOT EXISTS skhun_path TEXT,
  ADD COLUMN IF NOT EXISTS pas_photo_path TEXT;

CREATE TABLE IF NOT EXISTS public.identity_claims (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  identity_type TEXT NOT NULL CHECK (identity_type IN ('nik', 'nisn')),
  fingerprint BYTEA NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate', 'santri')),
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, identity_type, fingerprint)
);

CREATE INDEX IF NOT EXISTS identity_claims_owner_idx
  ON public.identity_claims (tenant_id, entity_type, entity_id);

ALTER TABLE public.identity_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_claims FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.identity_claims FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.identity_claims TO service_role;

-- Documents stay private. There are deliberately no anon/authenticated object policies;
-- the trusted server accesses objects with its server-only service-role key.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'ppdb-documents' AND public = true
  ) THEN
    RAISE EXCEPTION 'Bucket ppdb-documents already exists as public; make it private before applying this migration';
  END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ppdb-documents', 'ppdb-documents', false, 2097152, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.submit_public_ppdb(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_admission_year SMALLINT,
  p_candidate JSONB,
  p_document_paths JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_sequence BIGINT;
  v_registration_id TEXT;
  v_attempt INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR p_admission_year NOT BETWEEN 2000 AND 2200
    OR jsonb_typeof(p_candidate) <> 'object'
    OR jsonb_typeof(p_document_paths) <> 'object' THEN
    RAISE EXCEPTION 'Invalid PPDB payload' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  IF NOT (p_document_paths ? 'kk')
    OR NOT (p_document_paths ? 'birthCertificate')
    OR NOT (p_document_paths ? 'pasPhoto') THEN
    RAISE EXCEPTION 'Required PPDB documents are missing' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(p_document_paths) AS item(key, value)
    WHERE item.key NOT IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')
      OR item.value NOT LIKE p_tenant_id::TEXT || '/' || p_candidate_id::TEXT || '/%'
  ) THEN
    RAISE EXCEPTION 'Invalid PPDB document path' USING ERRCODE = '22023';
  END IF;

  -- The counter row serializes concurrent registrations per tenant and admission year.
  -- The loop also advances past legacy IDs if a counter is lower than imported data.
  FOR v_attempt IN 1..100 LOOP
    INSERT INTO public.registration_counters (tenant_id, admission_year, last_value)
    VALUES (p_tenant_id, p_admission_year, 1)
    ON CONFLICT (tenant_id, admission_year)
    DO UPDATE SET
      last_value = public.registration_counters.last_value + 1,
      updated_at = now()
    RETURNING last_value INTO v_sequence;

    v_registration_id := 'PPDB-' || p_admission_year::TEXT || '-' || lpad(v_sequence::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.candidates
      WHERE tenant_id = p_tenant_id
        AND upper(btrim(registration_id)) = upper(v_registration_id)
    );
  END LOOP;

  IF v_registration_id IS NULL OR EXISTS (
    SELECT 1 FROM public.candidates
    WHERE tenant_id = p_tenant_id
      AND upper(btrim(registration_id)) = upper(v_registration_id)
  ) THEN
    RAISE EXCEPTION 'Registration ID allocation exhausted' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.candidates (
    id, tenant_id, registration_id, name, previous_school, grade, phone, whatsapp_phone, email,
    nik_ciphertext, nik_fingerprint, nisn_ciphertext, nisn_fingerprint, pob, dob, address,
    province, regency, district, village, gender, father_name, mother_name, father_job,
    mother_job, father_education, mother_education, family_income, stage, score, date_applied,
    onboarding_status, sync_to_master_data
  ) VALUES (
    p_candidate_id, p_tenant_id, v_registration_id,
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
    'Registered', 0, CURRENT_DATE, 'Pending', false
  );

  INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
  VALUES (p_tenant_id, 'nik', decode(p_candidate->>'nikFingerprint', 'hex'), 'candidate', p_candidate_id);

  IF NULLIF(p_candidate->>'nisnFingerprint', '') IS NOT NULL THEN
    INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
    VALUES (p_tenant_id, 'nisn', decode(p_candidate->>'nisnFingerprint', 'hex'), 'candidate', p_candidate_id);
  END IF;

  INSERT INTO public.candidate_documents (
    tenant_id, candidate_id, kk, birth_certificate, report_cards, ijazah, skhun, pas_photo,
    kk_path, birth_certificate_path, report_cards_path, ijazah_path, skhun_path, pas_photo_path
  ) VALUES (
    p_tenant_id, p_candidate_id, true, true,
    p_document_paths ? 'reportCards', p_document_paths ? 'ijazah',
    p_document_paths ? 'skhun', true,
    p_document_paths->>'kk', p_document_paths->>'birthCertificate',
    p_document_paths->>'reportCards', p_document_paths->>'ijazah',
    p_document_paths->>'skhun', p_document_paths->>'pasPhoto'
  );

  RETURN jsonb_build_object('id', p_candidate_id, 'registrationId', v_registration_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_ppdb(UUID, UUID, SMALLINT, JSONB, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_ppdb(UUID, UUID, SMALLINT, JSONB, JSONB) TO service_role;

COMMIT;
