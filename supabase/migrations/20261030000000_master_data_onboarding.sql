-- Forward port of the tenant-scoped Master Data structures and PPDB onboarding contract.
-- Prerequisites: canonical tenant/profile foundation, public PPDB workflow, and onboarding_status.
BEGIN;

CREATE TABLE public.master_data_records (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('Gedung', 'Kamar', 'Kelas')),
  id TEXT NOT NULL CHECK (length(btrim(id)) BETWEEN 1 AND 160),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'Active',
  parent_id TEXT,
  parent_category TEXT GENERATED ALWAYS AS (CASE WHEN category = 'Kamar' THEN 'Gedung' END) STORED,
  grade TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0),
  occupied INTEGER NOT NULL DEFAULT 0 CHECK (occupied >= 0),
  gender_code public.gender_type,
  location TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, category, id),
  UNIQUE (tenant_id, id, category),
  FOREIGN KEY (tenant_id, parent_category, parent_id)
    REFERENCES public.master_data_records (tenant_id, category, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION public.validate_master_data_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.category = 'Kamar' THEN
    IF NEW.capacity IS NULL OR NEW.capacity < 1 THEN
      RAISE EXCEPTION 'Kapasitas kamar harus minimal satu' USING ERRCODE = '22023';
    END IF;
  ELSIF NEW.category <> 'Kamar' AND NEW.parent_id IS NOT NULL THEN
    -- Kelas/Gedung may carry a parent code in source data; leave it as descriptive metadata only.
    NEW.parent_id := NULL;
  END IF;

  IF NEW.capacity IS NOT NULL AND NEW.occupied > NEW.capacity THEN
    RAISE EXCEPTION 'Kapasitas tidak dapat lebih kecil daripada jumlah penghuni saat ini' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER master_data_records_validate
  BEFORE INSERT OR UPDATE ON public.master_data_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_master_data_record();

CREATE INDEX master_data_records_tenant_category_status_idx
  ON public.master_data_records (tenant_id, category, status, name);

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_candidate_id UUID NOT NULL,
  nis VARCHAR(10) NOT NULL CHECK (nis ~ '^[0-9]{10}$'),
  name VARCHAR(180) NOT NULL CHECK (length(btrim(name)) > 0),
  gender public.gender_type NOT NULL,
  grade TEXT,
  nik_ciphertext BYTEA NOT NULL,
  nik_fingerprint BYTEA NOT NULL,
  nisn_ciphertext BYTEA,
  nisn_fingerprint BYTEA,
  class_id TEXT NOT NULL,
  class_category TEXT NOT NULL DEFAULT 'Kelas' CHECK (class_category = 'Kelas'),
  room_id TEXT NOT NULL,
  room_category TEXT NOT NULL DEFAULT 'Kamar' CHECK (room_category = 'Kamar'),
  building_id TEXT,
  building_category TEXT NOT NULL DEFAULT 'Gedung' CHECK (building_category = 'Gedung'),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_candidate_id),
  UNIQUE (tenant_id, nis),
  FOREIGN KEY (tenant_id, source_candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, class_id, class_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, building_id, building_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  CHECK ((nisn_ciphertext IS NULL) = (nisn_fingerprint IS NULL))
);

CREATE INDEX students_tenant_class_idx ON public.students (tenant_id, class_id);
CREATE INDEX students_tenant_room_idx ON public.students (tenant_id, room_id);
CREATE INDEX students_tenant_name_idx ON public.students (tenant_id, name);

CREATE TABLE public.guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  source_candidate_id UUID NOT NULL,
  name VARCHAR(180) NOT NULL CHECK (length(btrim(name)) > 0),
  phone VARCHAR(24) NOT NULL CHECK (length(btrim(phone)) > 0),
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_candidate_id),
  FOREIGN KEY (tenant_id, source_candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.guardian_students (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  guardian_id UUID NOT NULL,
  student_id UUID NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Wali',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, guardian_id, student_id),
  FOREIGN KEY (tenant_id, guardian_id)
    REFERENCES public.guardians (tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE CASCADE
);

CREATE TABLE public.nis_reservations (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  nis VARCHAR(10) NOT NULL CHECK (nis ~ '^[0-9]{10}$'),
  candidate_id UUID NOT NULL,
  student_id UUID,
  source TEXT NOT NULL CHECK (source IN ('ppdb_onboarding', 'master_data_import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, nis),
  UNIQUE (tenant_id, candidate_id),
  FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS nis VARCHAR(10),
  ADD COLUMN IF NOT EXISTS class_id TEXT,
  ADD COLUMN IF NOT EXISTS class_name TEXT,
  ADD COLUMN IF NOT EXISTS dormitory_id TEXT,
  ADD COLUMN IF NOT EXISTS dormitory TEXT,
  ADD COLUMN IF NOT EXISTS room_id TEXT,
  ADD COLUMN IF NOT EXISTS room TEXT,
  ADD COLUMN IF NOT EXISTS master_student_id UUID,
  ADD COLUMN IF NOT EXISTS master_guardian_id UUID,
  ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_nis_format_check
    CHECK (nis IS NULL OR nis ~ '^[0-9]{10}$'),
  ADD CONSTRAINT candidates_master_student_fk
    FOREIGN KEY (tenant_id, master_student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  ADD CONSTRAINT candidates_master_guardian_fk
    FOREIGN KEY (tenant_id, master_guardian_id)
    REFERENCES public.guardians (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX candidates_tenant_onboarding_status_idx
  ON public.candidates (tenant_id, onboarding_status, stage);

ALTER TABLE public.master_data_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_data_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians FORCE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_students FORCE ROW LEVEL SECURITY;
ALTER TABLE public.nis_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nis_reservations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.master_data_records, public.students, public.guardians,
  public.guardian_students, public.nis_reservations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.master_data_records,
  public.students, public.guardians, public.guardian_students, public.nis_reservations
  TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_master_data_structure(
  p_tenant_id UUID,
  p_category TEXT,
  p_id TEXT,
  p_record JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_name TEXT;
  v_parent_id TEXT;
  v_status TEXT;
  v_grade TEXT;
  v_location TEXT;
  v_capacity INTEGER;
  v_gender public.gender_type;
  v_attributes JSONB;
  v_result public.master_data_records%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_category IS NULL
    OR p_category NOT IN ('Gedung', 'Kamar', 'Kelas')
    OR p_id IS NULL OR length(btrim(p_id)) NOT BETWEEN 1 AND 160
    OR p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'Data struktur tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_name := NULLIF(btrim(p_record->>'name'), '');
  IF v_name IS NULL OR length(v_name) > 180 THEN
    RAISE EXCEPTION 'Nama struktur wajib diisi dan maksimal 180 karakter' USING ERRCODE = '22023';
  END IF;

  v_parent_id := NULLIF(btrim(COALESCE(p_record->>'parentId', p_record->>'parentCode')), '');
  v_status := COALESCE(NULLIF(btrim(p_record->>'status'), ''), 'Active');
  v_grade := NULLIF(btrim(p_record->>'grade'), '');
  v_location := NULLIF(btrim(p_record->>'location'), '');

  IF NULLIF(regexp_replace(COALESCE(p_record->>'capacity', ''), '[^0-9]', '', 'g'), '') IS NOT NULL THEN
    v_capacity := regexp_replace(p_record->>'capacity', '[^0-9]', '', 'g')::INTEGER;
  END IF;

  CASE lower(COALESCE(NULLIF(btrim(p_record->>'genderRestriction'), ''), NULLIF(btrim(p_record->>'gender'), '')))
    WHEN 'l' THEN v_gender := 'L';
    WHEN 'm' THEN v_gender := 'L';
    WHEN 'male' THEN v_gender := 'L';
    WHEN 'putra' THEN v_gender := 'L';
    WHEN 'laki-laki' THEN v_gender := 'L';
    WHEN 'p' THEN v_gender := 'P';
    WHEN 'f' THEN v_gender := 'P';
    WHEN 'female' THEN v_gender := 'P';
    WHEN 'putri' THEN v_gender := 'P';
    WHEN 'perempuan' THEN v_gender := 'P';
    ELSE v_gender := NULL;
  END CASE;

  v_attributes := p_record - ARRAY[
    'id', 'category', 'name', 'status', 'tenantId', '_firestoreId', 'createdByUid',
    'parentId', 'parentCode', 'grade', 'location', 'capacity', 'occupied', 'gender', 'genderRestriction'
  ];

  INSERT INTO public.master_data_records (
    tenant_id, category, id, name, status, parent_id, grade, capacity, gender_code, location, attributes
  ) VALUES (
    p_tenant_id, p_category, p_id, v_name, v_status, v_parent_id, v_grade, v_capacity, v_gender, v_location,
    COALESCE(v_attributes, '{}'::jsonb)
  )
  ON CONFLICT (tenant_id, category, id) DO UPDATE SET
    name = EXCLUDED.name,
    status = EXCLUDED.status,
    parent_id = EXCLUDED.parent_id,
    grade = EXCLUDED.grade,
    capacity = EXCLUDED.capacity,
    gender_code = EXCLUDED.gender_code,
    location = EXCLUDED.location,
    attributes = EXCLUDED.attributes
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'tenantId', v_result.tenant_id,
    'id', v_result.id,
    'category', v_result.category,
    'name', v_result.name,
    'status', v_result.status,
    'parentId', v_result.parent_id,
    'grade', v_result.grade,
    'capacity', v_result.capacity,
    'occupied', v_result.occupied,
    'gender', v_result.gender_code,
    'location', v_result.location
  ) || v_result.attributes;
END;
$$;

CREATE OR REPLACE FUNCTION public.next_available_santri_nis(
  p_tenant_id UUID,
  p_grade TEXT,
  p_exclude_candidate_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_grade TEXT := regexp_replace(upper(COALESCE(p_grade, '')), '[^A-Z0-9]', '', 'g');
  v_grade_code TEXT;
  v_year INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Jakarta'))::INTEGER;
  v_sequence INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  IF v_grade LIKE '%SD%' OR v_grade LIKE '%MI%' OR v_grade LIKE '%IBTIDAIYAH%' THEN
    v_grade_code := '01';
  ELSIF v_grade LIKE '%SMA%' OR v_grade LIKE '%SMK%' OR v_grade LIKE '%ALIYAH%'
    OR upper(COALESCE(p_grade, '')) ~ '(^|[^A-Z])MA([^A-Z]|$)' THEN
    v_grade_code := '03';
  ELSE
    v_grade_code := '02';
  END IF;

  SELECT available.seq INTO v_sequence
  FROM generate_series(1, 9999) AS available(seq)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.nis_reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.nis = v_year::TEXT || v_grade_code || lpad(available.seq::TEXT, 4, '0')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.tenant_id = p_tenant_id
      AND s.nis = v_year::TEXT || v_grade_code || lpad(available.seq::TEXT, 4, '0')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.tenant_id = p_tenant_id
      AND c.id IS DISTINCT FROM p_exclude_candidate_id
      AND c.workflow_data->>'nis' = v_year::TEXT || v_grade_code || lpad(available.seq::TEXT, 4, '0')
  )
  ORDER BY available.seq
  LIMIT 1;

  IF v_sequence IS NULL THEN
    RAISE EXCEPTION 'Nomor urut NIS untuk tahun dan jenjang ini telah habis' USING ERRCODE = '23505';
  END IF;

  RETURN v_year::TEXT || v_grade_code || lpad(v_sequence::TEXT, 4, '0');
END;
$$;

CREATE OR REPLACE FUNCTION public.onboard_accepted_ppdb_candidate(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_nis TEXT,
  p_class_id TEXT,
  p_room_id TEXT,
  p_building_id TEXT,
  p_guardian_name TEXT,
  p_guardian_phone TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate public.candidates%ROWTYPE;
  v_class public.master_data_records%ROWTYPE;
  v_room public.master_data_records%ROWTYPE;
  v_building public.master_data_records%ROWTYPE;
  v_student_id UUID;
  v_guardian_id UUID;
  v_grade_code TEXT;
  v_normalized_grade TEXT;
  v_reservation_candidate UUID;
  v_claim_count INTEGER;
  v_now TIMESTAMPTZ := now();
  v_gender public.gender_type;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
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

  SELECT * INTO v_candidate
  FROM public.candidates
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Calon santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;

  IF v_candidate.onboarding_status = 'Completed'
    AND v_candidate.master_student_id IS NOT NULL
    AND v_candidate.master_guardian_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true, 'alreadyOnboarded', true, 'nis', v_candidate.nis,
      'santriId', v_candidate.master_student_id, 'waliId', v_candidate.master_guardian_id
    );
  END IF;

  IF v_candidate.stage <> 'Accepted' THEN
    RAISE EXCEPTION 'Hanya calon santri berstatus diterima yang dapat di-onboard' USING ERRCODE = '22023';
  END IF;
  IF v_candidate.gender IS NULL THEN
    RAISE EXCEPTION 'Jenis kelamin calon santri wajib diatur' USING ERRCODE = '22023';
  END IF;
  IF v_candidate.nik_ciphertext IS NULL OR v_candidate.nik_fingerprint IS NULL THEN
    RAISE EXCEPTION 'NIK calon santri belum diverifikasi' USING ERRCODE = '22023';
  END IF;

  v_normalized_grade := regexp_replace(upper(COALESCE(v_candidate.grade, '')), '[^A-Z0-9]', '', 'g');
  IF v_normalized_grade LIKE '%SD%' OR v_normalized_grade LIKE '%MI%' OR v_normalized_grade LIKE '%IBTIDAIYAH%' THEN
    v_grade_code := '01';
  ELSIF v_normalized_grade LIKE '%SMA%' OR v_normalized_grade LIKE '%SMK%' OR v_normalized_grade LIKE '%ALIYAH%'
    OR upper(COALESCE(v_candidate.grade, '')) ~ '(^|[^A-Z])MA([^A-Z]|$)' THEN
    v_grade_code := '03';
  ELSE
    v_grade_code := '02';
  END IF;
  IF substring(p_nis FROM 5 FOR 2) <> v_grade_code
    OR substring(p_nis FROM 1 FOR 4)::INTEGER NOT BETWEEN 2000 AND 9999
    OR substring(p_nis FROM 7 FOR 4)::INTEGER NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'NIS tidak sesuai dengan format tahun, jenjang, dan nomor urut' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_class
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = p_class_id
  FOR KEY SHARE;
  IF NOT FOUND OR lower(v_class.status) IN ('inactive', 'nonaktif', 'disabled') THEN
    RAISE EXCEPTION 'Kelas tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_room
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = p_room_id
  FOR UPDATE;
  IF NOT FOUND OR lower(v_room.status) IN ('inactive', 'nonaktif', 'disabled') THEN
    RAISE EXCEPTION 'Kamar tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;

  IF p_building_id IS NOT NULL AND length(btrim(p_building_id)) > 0 THEN
    SELECT * INTO v_building
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = p_building_id
    FOR KEY SHARE;
    IF NOT FOUND OR lower(v_building.status) IN ('inactive', 'nonaktif', 'disabled') THEN
      RAISE EXCEPTION 'Gedung tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_room.parent_id IS DISTINCT FROM p_building_id THEN
      RAISE EXCEPTION 'Gedung tidak sesuai dengan kamar yang dipilih' USING ERRCODE = '22023';
    END IF;
  ELSIF v_room.parent_id IS NOT NULL THEN
    p_building_id := v_room.parent_id;
    SELECT * INTO v_building
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = p_building_id
    FOR KEY SHARE;
    IF NOT FOUND OR lower(v_building.status) IN ('inactive', 'nonaktif', 'disabled') THEN
      RAISE EXCEPTION 'Gedung kamar tidak aktif atau tidak ditemukan' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  v_gender := COALESCE(v_room.gender_code, v_building.gender_code);
  IF v_gender IS NULL OR v_gender <> v_candidate.gender THEN
    RAISE EXCEPTION 'Gender kamar belum diatur atau tidak sesuai dengan calon santri' USING ERRCODE = '22023';
  END IF;

  IF v_room.capacity IS NULL OR v_room.capacity < 1 OR v_room.occupied >= v_room.capacity THEN
    RAISE EXCEPTION 'Kamar sudah penuh atau kapasitas belum diatur' USING ERRCODE = '23514';
  END IF;

  SELECT candidate_id INTO v_reservation_candidate
  FROM public.nis_reservations
  WHERE tenant_id = p_tenant_id AND nis = p_nis
  FOR UPDATE;
  IF FOUND AND v_reservation_candidate <> p_candidate_id THEN
    RAISE EXCEPTION 'NIS sudah digunakan pada tenant ini' USING ERRCODE = '23505';
  END IF;

  v_student_id := gen_random_uuid();
  v_guardian_id := gen_random_uuid();

  INSERT INTO public.students (
    id, tenant_id, source_candidate_id, nis, name, gender, grade,
    nik_ciphertext, nik_fingerprint, nisn_ciphertext, nisn_fingerprint,
    class_id, room_id, building_id, details
  ) VALUES (
    v_student_id, p_tenant_id, p_candidate_id, p_nis, v_candidate.name, v_candidate.gender, v_candidate.grade,
    v_candidate.nik_ciphertext, v_candidate.nik_fingerprint, v_candidate.nisn_ciphertext, v_candidate.nisn_fingerprint,
    p_class_id, p_room_id, NULLIF(p_building_id, ''),
    jsonb_build_object(
      'previousSchool', v_candidate.previous_school,
      'phone', v_candidate.phone,
      'email', v_candidate.email,
      'pob', v_candidate.pob,
      'dob', v_candidate.dob,
      'address', v_candidate.address,
      'province', v_candidate.province,
      'regency', v_candidate.regency,
      'district', v_candidate.district,
      'village', v_candidate.village,
      'fatherName', v_candidate.father_name,
      'motherName', v_candidate.mother_name,
      'fatherJob', v_candidate.father_job,
      'motherJob', v_candidate.mother_job,
      'fatherEducation', v_candidate.father_education,
      'motherEducation', v_candidate.mother_education
    )
  );

  INSERT INTO public.guardians (id, tenant_id, source_candidate_id, name, phone, details)
  VALUES (
    v_guardian_id, p_tenant_id, p_candidate_id, btrim(p_guardian_name), btrim(p_guardian_phone),
    jsonb_build_object(
      'address', v_candidate.address,
      'fatherName', v_candidate.father_name,
      'motherName', v_candidate.mother_name,
      'fatherJob', v_candidate.father_job,
      'motherJob', v_candidate.mother_job
    )
  );

  INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id)
  VALUES (p_tenant_id, v_guardian_id, v_student_id);

  INSERT INTO public.nis_reservations (tenant_id, nis, candidate_id, student_id, source)
  VALUES (p_tenant_id, p_nis, p_candidate_id, v_student_id, 'ppdb_onboarding')
  ON CONFLICT (tenant_id, nis) DO UPDATE SET student_id = EXCLUDED.student_id
  WHERE public.nis_reservations.candidate_id = EXCLUDED.candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NIS sudah digunakan pada tenant ini' USING ERRCODE = '23505';
  END IF;

  UPDATE public.identity_claims
  SET entity_type = 'santri', entity_id = v_student_id
  WHERE tenant_id = p_tenant_id AND identity_type = 'nik'
    AND fingerprint = v_candidate.nik_fingerprint
    AND entity_type = 'candidate' AND entity_id = p_candidate_id;
  GET DIAGNOSTICS v_claim_count = ROW_COUNT;
  IF v_claim_count <> 1 THEN
    RAISE EXCEPTION 'Reservasi NIK calon santri tidak valid' USING ERRCODE = '23505';
  END IF;

  IF v_candidate.nisn_fingerprint IS NOT NULL THEN
    UPDATE public.identity_claims
    SET entity_type = 'santri', entity_id = v_student_id
    WHERE tenant_id = p_tenant_id AND identity_type = 'nisn'
      AND fingerprint = v_candidate.nisn_fingerprint
      AND entity_type = 'candidate' AND entity_id = p_candidate_id;
    GET DIAGNOSTICS v_claim_count = ROW_COUNT;
    IF v_claim_count <> 1 THEN
      RAISE EXCEPTION 'Reservasi NISN calon santri tidak valid' USING ERRCODE = '23505';
    END IF;
  END IF;

  UPDATE public.master_data_records
  SET occupied = occupied + 1, updated_at = v_now
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = p_room_id
    AND occupied < capacity;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar sudah penuh' USING ERRCODE = '23514';
  END IF;

  UPDATE public.candidates
  SET nis = p_nis,
      class_id = p_class_id,
      class_name = v_class.name,
      dormitory_id = NULLIF(p_building_id, ''),
      dormitory = v_building.name,
      room_id = p_room_id,
      room = v_room.name,
      master_student_id = v_student_id,
      master_guardian_id = v_guardian_id,
      onboarding_status = 'Completed',
      sync_to_master_data = true,
      onboarded_at = v_now,
      workflow_data = public.jsonb_deep_merge(workflow_data, jsonb_build_object(
        'nis', p_nis,
        'classId', p_class_id,
        'className', v_class.name,
        'dormitoryId', NULLIF(p_building_id, ''),
        'dormitory', v_building.name,
        'roomId', p_room_id,
        'room', v_room.name,
        'onboardedAt', v_now,
        'waliAccountCreated', false,
        'waliAccountStatus', 'PendingProvisioning'
      )),
      updated_at = v_now
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id;

  RETURN jsonb_build_object(
    'success', true, 'alreadyOnboarded', false, 'nis', p_nis,
    'santriId', v_student_id, 'waliId', v_guardian_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_imported_room_occupancy(
  p_tenant_id UUID,
  p_room_id TEXT,
  p_occupied INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_capacity INTEGER;
  v_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_room_id IS NULL OR length(btrim(p_room_id)) = 0
    OR p_occupied IS NULL OR p_occupied < 0 THEN
    RAISE EXCEPTION 'Jumlah penghuni hasil migrasi tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT capacity INTO v_capacity
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kamar tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_capacity IS NULL OR p_occupied > v_capacity THEN
    RAISE EXCEPTION 'Jumlah penghuni lama melebihi kapasitas kamar; selesaikan konflik sebelum migrasi' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.students
    WHERE tenant_id = p_tenant_id AND room_id = p_room_id
  ) THEN
    RAISE EXCEPTION 'Migrasi okupansi ditolak karena kamar sudah memiliki record Supabase' USING ERRCODE = '55000';
  END IF;

  UPDATE public.master_data_records
  SET occupied = p_occupied, updated_at = now()
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = p_room_id
  RETURNING occupied INTO v_count;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.set_imported_room_occupancy(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_master_data_structure(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.next_available_santri_nis(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.onboard_accepted_ppdb_candidate(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_imported_room_occupancy(UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_master_data_structure(UUID, TEXT, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_available_santri_nis(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.onboard_accepted_ppdb_candidate(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
