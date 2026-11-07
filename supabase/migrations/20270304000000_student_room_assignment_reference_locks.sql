-- Forward-only port following tenant foundation, PPDB workflows, and Master Data onboarding.
-- Transactional tenant-scoped room placement for the Supabase operational cutover.
-- This RPC is called only by the trusted application server using service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.assign_student_to_room(
  p_tenant_id UUID,
  p_student_id UUID,
  p_room_id TEXT,
  p_building_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_room public.master_data_records%ROWTYPE;
  v_old_room public.master_data_records%ROWTYPE;
  v_building public.master_data_records%ROWTYPE;
  v_target_room_id TEXT;
  v_building_id TEXT;
  v_room_gender public.gender_type;
  v_room_count INTEGER;
  v_old_room_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Tenant atau ID santri tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_room_id IS NOT NULL AND (
    length(btrim(p_room_id)) NOT BETWEEN 1 AND 160 OR position('/' in p_room_id) > 0
  ) THEN
    RAISE EXCEPTION 'ID kamar tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_building_id IS NOT NULL AND (
    length(btrim(p_building_id)) NOT BETWEEN 1 AND 160 OR position('/' in p_building_id) > 0
  ) THEN
    RAISE EXCEPTION 'ID gedung tidak valid' USING ERRCODE = '22023';
  END IF;
  -- Keep tenant status stable until this assignment transaction commits.
  PERFORM 1
  FROM public.tenants
  WHERE id = p_tenant_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  v_target_room_id := CASE WHEN p_room_id IS NULL THEN NULL ELSE btrim(p_room_id) END;

  -- Lock old and target rooms in stable order so concurrent moves cannot overbook or deadlock.
  PERFORM id
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id
    AND category = 'Kamar'
    AND id = ANY(ARRAY[v_student.room_id, v_target_room_id]::TEXT[])
  ORDER BY id
  FOR UPDATE;

  IF v_target_room_id IS NULL THEN
    IF v_student.room_id IS NULL THEN
      RETURN jsonb_build_object('success', true, 'alreadyUnassigned', true, 'studentId', v_student.id);
    END IF;

    SELECT * INTO v_old_room
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kamar lama santri tidak ditemukan; rekonsiliasi data terlebih dahulu' USING ERRCODE = '55000';
    END IF;

    SELECT count(*)::INTEGER INTO v_old_room_count
    FROM public.students
    WHERE tenant_id = p_tenant_id AND room_id = v_student.room_id;
    IF v_old_room.occupied <> v_old_room_count THEN
      RAISE EXCEPTION 'Okupansi kamar lama tidak sinkron; rekonsiliasi data sebelum mengubah penempatan' USING ERRCODE = '55000';
    END IF;
    IF v_old_room_count < 1 THEN
      RAISE EXCEPTION 'Okupansi kamar lama tidak valid' USING ERRCODE = '23514';
    END IF;

    UPDATE public.master_data_records
    SET occupied = occupied - 1, updated_at = now()
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;

    UPDATE public.students
    SET room_id = NULL, building_id = NULL, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_student_id;

    RETURN jsonb_build_object(
      'success', true, 'alreadyUnassigned', false, 'studentId', v_student.id,
      'previousRoomId', v_student.room_id, 'roomId', NULL,
      'occupied', v_old_room_count - 1, 'capacity', v_old_room.capacity
    );
  END IF;

  SELECT * INTO v_room
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_target_room_id;
  IF NOT FOUND OR lower(v_room.status) IN ('inactive', 'nonaktif', 'disabled') THEN
    RAISE EXCEPTION 'Kamar tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_room.capacity IS NULL OR v_room.capacity < 1 THEN
    RAISE EXCEPTION 'Kapasitas kamar belum diatur dengan benar' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_building_id), '') IS NOT NULL
    AND v_room.parent_id IS DISTINCT FROM btrim(p_building_id) THEN
    RAISE EXCEPTION 'Gedung tidak sesuai dengan kamar yang dipilih' USING ERRCODE = '22023';
  END IF;
  v_building_id := COALESCE(NULLIF(btrim(p_building_id), ''), v_room.parent_id);
  IF v_building_id IS NOT NULL THEN
    SELECT * INTO v_building
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = v_building_id
    -- KEY SHARE permits concurrent non-key updates to status/gender_code.
    -- SHARE makes assignment wait and validate the committed building configuration.
    FOR SHARE;
    IF NOT FOUND OR lower(v_building.status) IN ('inactive', 'nonaktif', 'disabled') THEN
      RAISE EXCEPTION 'Gedung tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_room.gender_code IS NOT NULL AND v_building.gender_code IS NOT NULL
      AND v_room.gender_code <> v_building.gender_code THEN
      RAISE EXCEPTION 'Konfigurasi gender kamar bertentangan dengan gedung' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_room_gender := COALESCE(v_room.gender_code, v_building.gender_code);
  IF v_room_gender IS NULL OR v_student.gender IS NULL THEN
    RAISE EXCEPTION 'Gender kamar, gedung, atau santri belum dikonfigurasi' USING ERRCODE = '22023';
  END IF;
  IF v_room_gender <> v_student.gender THEN
    RAISE EXCEPTION 'Gender santri tidak sesuai dengan kamar' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::INTEGER INTO v_room_count
  FROM public.students
  WHERE tenant_id = p_tenant_id AND room_id = v_room.id;
  IF v_room.occupied <> v_room_count THEN
    RAISE EXCEPTION 'Okupansi kamar tidak sinkron; rekonsiliasi data sebelum mengubah penempatan' USING ERRCODE = '55000';
  END IF;

  IF v_student.room_id IS NOT DISTINCT FROM v_room.id THEN
    UPDATE public.students
    SET building_id = v_building_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_student_id;
    RETURN jsonb_build_object(
      'success', true, 'alreadyAssigned', true, 'studentId', v_student.id,
      'roomId', v_room.id, 'buildingId', v_building_id,
      'occupied', v_room.occupied, 'capacity', v_room.capacity
    );
  END IF;

  IF v_room_count >= v_room.capacity THEN
    RAISE EXCEPTION 'Kamar sudah penuh (%/%)', v_room_count, v_room.capacity USING ERRCODE = '23514';
  END IF;

  IF v_student.room_id IS NOT NULL THEN
    SELECT * INTO v_old_room
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kamar lama santri tidak ditemukan; rekonsiliasi data terlebih dahulu' USING ERRCODE = '55000';
    END IF;

    SELECT count(*)::INTEGER INTO v_old_room_count
    FROM public.students
    WHERE tenant_id = p_tenant_id AND room_id = v_student.room_id;
    IF v_old_room.occupied <> v_old_room_count OR v_old_room_count < 1 THEN
      RAISE EXCEPTION 'Okupansi kamar lama tidak sinkron; rekonsiliasi data sebelum mengubah penempatan' USING ERRCODE = '55000';
    END IF;

    UPDATE public.master_data_records
    SET occupied = occupied - 1, updated_at = now()
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
  END IF;

  UPDATE public.master_data_records
  SET occupied = occupied + 1, updated_at = now()
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_room.id;

  UPDATE public.students
  SET room_id = v_room.id, building_id = v_building_id, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_student_id;

  RETURN jsonb_build_object(
    'success', true, 'alreadyAssigned', false, 'studentId', v_student.id,
    'previousRoomId', v_student.room_id, 'roomId', v_room.id,
    'buildingId', v_building_id, 'occupied', v_room_count + 1,
    'capacity', v_room.capacity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_student_to_room(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_student_to_room(UUID, UUID, TEXT, TEXT)
  TO service_role;


-- Keep PPDB room, class, building and tenant status validation stable through onboarding.
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

  -- Keep tenant status stable while PPDB enrollment is being committed.
  PERFORM 1
  FROM public.tenants
  WHERE id = p_tenant_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
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

  SELECT COALESCE(
    (SELECT reference.nis_grade_code
     FROM public.tenant_reference_items AS reference
     WHERE reference.tenant_id = p_tenant_id
       AND reference.domain = 'academic_grade_level'
       AND reference.status = 'active'
       AND reference.id = v_candidate.grade_level_reference_id),
    (SELECT reference.nis_grade_code
     FROM public.tenant_reference_items AS reference
     WHERE reference.tenant_id = p_tenant_id
       AND reference.domain = 'academic_grade_level'
       AND reference.status = 'active'
       AND lower(btrim(reference.name)) = lower(btrim(v_candidate.grade))
     ORDER BY reference.code
     LIMIT 1)
  ) INTO v_grade_code;
  IF v_grade_code IS NULL OR v_grade_code !~ '^[0-9]{2}$' THEN
    RAISE EXCEPTION 'Atur kode NIS dua digit pada jenjang calon santri sebelum penerimaan' USING ERRCODE = '23514';
  END IF;
  IF substring(p_nis FROM 5 FOR 2) <> v_grade_code
    OR substring(p_nis FROM 1 FOR 4)::INTEGER NOT BETWEEN 2000 AND 9999
    OR substring(p_nis FROM 7 FOR 4)::INTEGER NOT BETWEEN 1 AND 9999 THEN
    RAISE EXCEPTION 'NIS tidak sesuai dengan format tahun, jenjang, dan nomor urut' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_class
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = p_class_id
  FOR SHARE;
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
    FOR SHARE;
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
    FOR SHARE;
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

COMMIT;

