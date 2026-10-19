-- Create enum for evaluation stages
CREATE TYPE registration_stage AS ENUM (
  'Registered',
  'Document Review',
  'Entry Exam',
  'Interview',
  'Accepted',
  'Rejected'
);

-- Create enum for gender
CREATE TYPE gender_type AS ENUM ('L', 'P');

-- Create candidates table
CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id VARCHAR(50) UNIQUE NOT NULL,
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
  gender gender_type DEFAULT 'L',
  father_name VARCHAR(150),
  mother_name VARCHAR(150),
  father_job VARCHAR(100),
  mother_job VARCHAR(100),
  whatsapp_phone VARCHAR(20),
  stage registration_stage DEFAULT 'Registered',
  score INTEGER,
  date_applied DATE DEFAULT CURRENT_DATE,
  exam_slot VARCHAR(100),
  interviewer VARCHAR(150),
  interview_slot VARCHAR(100),
  interview_notified BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create documents tracking table
CREATE TABLE candidate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  kk BOOLEAN DEFAULT false,
  birth_certificate BOOLEAN DEFAULT false,
  report_cards BOOLEAN DEFAULT false,
  ijazah BOOLEAN DEFAULT false,
  skhun BOOLEAN DEFAULT false,
  pas_photo BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidate_id)
);

-- Create a trigger to automatically maintain updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_candidates_modtime
    BEFORE UPDATE ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_modtime
    BEFORE UPDATE ON candidate_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
