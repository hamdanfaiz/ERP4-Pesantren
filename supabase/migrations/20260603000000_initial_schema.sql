-- Initial tenant-scoped PPDB schema.
-- Candidate PII is intentionally inaccessible to browser roles. Public enrollment
-- must go through a trusted server endpoint that assigns tenant_id and validates input.

CREATE TYPE public.registration_stage AS ENUM (
  'Registered',
  'Document Review',
  'Entry Exam',
  'Interview',
  'Accepted',
  'Rejected'
);

CREATE TYPE public.gender_type AS ENUM ('L', 'P');

CREATE TABLE public.candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL CHECK (btrim(tenant_id) <> ''),
  registration_id VARCHAR(50) NOT NULL,
  name VARCHAR(150) NOT NULL,
  previous_school VARCHAR(150),
  grade VARCHAR(50),
  phone VARCHAR(20),
  nik VARCHAR(20),
  nisn VARCHAR(20),
  pob VARCHAR(100),
  dob DATE,
  email VARCHAR(150),
  address TEXT,
  gender public.gender_type DEFAULT 'L',
  father_name VARCHAR(150),
  mother_name VARCHAR(150),
  father_job VARCHAR(100),
  mother_job VARCHAR(100),
  whatsapp_phone VARCHAR(20),
  stage public.registration_stage DEFAULT 'Registered',
  score INTEGER,
  date_applied DATE DEFAULT CURRENT_DATE,
  exam_slot VARCHAR(100),
  interviewer VARCHAR(150),
  interview_slot VARCHAR(100),
  interview_notified BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidates_tenant_registration_id_key UNIQUE (tenant_id, registration_id),
  CONSTRAINT candidates_id_tenant_id_key UNIQUE (id, tenant_id)
);

CREATE INDEX candidates_tenant_stage_idx ON public.candidates (tenant_id, stage);
CREATE INDEX candidates_tenant_date_applied_idx ON public.candidates (tenant_id, date_applied DESC);
CREATE UNIQUE INDEX candidates_tenant_nik_key
  ON public.candidates (tenant_id, nik)
  WHERE nik IS NOT NULL AND btrim(nik) <> '';
CREATE UNIQUE INDEX candidates_tenant_nisn_key
  ON public.candidates (tenant_id, nisn)
  WHERE nisn IS NOT NULL AND btrim(nisn) <> '';

CREATE TABLE public.candidate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL CHECK (btrim(tenant_id) <> ''),
  candidate_id UUID NOT NULL,
  kk BOOLEAN DEFAULT false,
  birth_certificate BOOLEAN DEFAULT false,
  report_cards BOOLEAN DEFAULT false,
  ijazah BOOLEAN DEFAULT false,
  skhun BOOLEAN DEFAULT false,
  pas_photo BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_documents_candidate_id_key UNIQUE (candidate_id),
  CONSTRAINT candidate_documents_candidate_tenant_fkey
    FOREIGN KEY (candidate_id, tenant_id)
    REFERENCES public.candidates (id, tenant_id)
    ON DELETE CASCADE
);

CREATE OR REPLACE FUNCTION public.erp4_ppdb_update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_candidates_modtime
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.erp4_ppdb_update_updated_at_column();

CREATE TRIGGER update_documents_modtime
  BEFORE UPDATE ON public.candidate_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.erp4_ppdb_update_updated_at_column();

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_documents ENABLE ROW LEVEL SECURITY;

-- Until tenant-aware API routes are implemented, neither anonymous nor signed-in
-- browser clients can read/write candidate PII. The trusted server uses service_role.
REVOKE ALL ON TABLE public.candidates, public.candidate_documents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.candidates, public.candidate_documents TO service_role;

COMMENT ON TABLE public.candidates IS
  'Tenant-scoped PPDB candidate PII; browser roles are denied, use trusted server routes.';
COMMENT ON TABLE public.candidate_documents IS
  'Tenant-scoped PPDB document checklist; browser roles are denied, use trusted server routes.';
