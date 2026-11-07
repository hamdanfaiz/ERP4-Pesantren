-- Make the CSV preview and the transactional student import enforce the same
-- active tenant catalog and placement rules as the normal Master Data flow.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_legacy_master_data_student_relationships(
  p_tenant_id UUID,
  p_student JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source_id TEXT;
  v_grade_name TEXT;
  v_grade_reference_id UUID;
  v_class_id TEXT;
  v_class_grade_reference_id UUID;
  v_building_id TEXT;
  v_room_id TEXT;
  v_building public.master_data_records%ROWTYPE;
  v_room public.master_data_records%ROWTYPE;
  v_room_gender public.gender_type;
  v_student_gender public.gender_type;
  v_gender_text TEXT;
  v_room_count INTEGER;
  v_student_id UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_student IS NULL OR jsonb_typeof(p_student) <> 'object' THEN
    RAISE EXCEPTION 'Data relasi impor santri tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_source_id := NULLIF(btrim(p_student->>'sourceRecordId'), '');
  IF v_source_id IS NOT NULL THEN
    SELECT id INTO v_student_id
    FROM public.students
    WHERE tenant_id = p_tenant_id
      AND source_system = 'legacy_import'
      AND source_record_id = v_source_id;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'already_imported', 'studentId', v_student_id);
    END IF;
  END IF;

  v_grade_name := NULLIF(btrim(p_student->>'grade'), '');
  v_class_id := NULLIF(btrim(p_student->>'classId'), '');
  IF v_class_id IS NOT NULL THEN
    SELECT grade_level_reference_id INTO v_class_grade_reference_id
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = v_class_id
      AND lower(btrim(status)) = 'active';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Kelas tidak aktif atau tidak ditemukan pada tenant ini.');
    END IF;
    IF v_class_grade_reference_id IS NULL THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Kelas belum terhubung ke jenjang aktif tenant.');
    END IF;
  END IF;

  IF v_grade_name IS NOT NULL THEN
    SELECT id, name INTO v_grade_reference_id, v_grade_name
    FROM public.tenant_reference_items
    WHERE tenant_id = p_tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(v_grade_name) AND status = 'active';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Jenjang harus dipilih dari katalog aktif tenant.');
    END IF;
  ELSIF v_class_grade_reference_id IS NOT NULL THEN
    v_grade_reference_id := v_class_grade_reference_id;
    SELECT name INTO v_grade_name
    FROM public.tenant_reference_items
    WHERE tenant_id = p_tenant_id AND domain = 'academic_grade_level'
      AND id = v_grade_reference_id AND status = 'active';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Jenjang kelas tidak aktif atau tidak ditemukan pada tenant ini.');
    END IF;
  END IF;

  IF v_class_grade_reference_id IS NOT NULL AND v_class_grade_reference_id <> v_grade_reference_id THEN
    RETURN jsonb_build_object('status', 'conflict', 'message', 'Jenjang yang dipilih tidak sesuai dengan jenjang kelas.');
  END IF;

  v_building_id := NULLIF(btrim(p_student->>'buildingId'), '');
  IF v_building_id IS NOT NULL THEN
    SELECT * INTO v_building
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = v_building_id
      AND lower(btrim(status)) = 'active';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Gedung tidak aktif atau tidak ditemukan pada tenant ini.');
    END IF;
  END IF;

  v_room_id := NULLIF(btrim(p_student->>'roomId'), '');
  IF v_room_id IS NOT NULL THEN
    SELECT * INTO v_room
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_room_id
      AND lower(btrim(status)) = 'active';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Kamar tidak aktif atau tidak ditemukan pada tenant ini.');
    END IF;
    IF v_room.parent_id IS NULL THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Kamar belum terhubung ke gedung tenant.');
    END IF;
    IF v_building_id IS NOT NULL AND v_building_id IS DISTINCT FROM v_room.parent_id THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Gedung yang dipilih tidak sesuai dengan gedung induk kamar.');
    END IF;
    v_building_id := v_room.parent_id;
    SELECT * INTO v_building
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = v_building_id
      AND lower(btrim(status)) = 'active';
    IF NOT FOUND THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Gedung induk kamar tidak aktif atau tidak ditemukan pada tenant ini.');
    END IF;

    IF v_room.gender_code IS NOT NULL AND v_building.gender_code IS NOT NULL
      AND v_room.gender_code <> v_building.gender_code THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Konfigurasi gender kamar bertentangan dengan gedung.');
    END IF;

    v_gender_text := upper(NULLIF(btrim(p_student->>'gender'), ''));
    IF v_gender_text = 'L' THEN v_student_gender := 'L';
    ELSIF v_gender_text = 'P' THEN v_student_gender := 'P';
    ELSE
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Jenis kelamin santri wajib dipilih sebelum menempatkan ke kamar.');
    END IF;
    v_room_gender := COALESCE(v_room.gender_code, v_building.gender_code);
    IF v_room_gender IS NULL THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Jenis kelamin kamar atau gedung belum dikonfigurasi.');
    END IF;
    IF v_room_gender <> v_student_gender THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Jenis kelamin santri tidak sesuai dengan kamar atau gedung.');
    END IF;
    IF v_room.capacity IS NULL OR v_room.capacity < 1 THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Kapasitas kamar belum diatur dengan benar.');
    END IF;

    SELECT count(*)::INTEGER INTO v_room_count
    FROM public.students
    WHERE tenant_id = p_tenant_id AND room_id = v_room_id;
    IF v_room.occupied <> v_room_count THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Okupansi kamar tidak sinkron; rekonsiliasi sebelum impor.');
    END IF;
    IF v_room_count >= v_room.capacity THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'Kamar sudah penuh.');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'status', 'planned',
    'grade', v_grade_name,
    'gradeLevelReferenceId', v_grade_reference_id,
    'classId', v_class_id,
    'buildingId', v_building_id,
    'roomId', v_room_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_master_data_student_with_actor(
  p_tenant_id UUID, p_student JSONB, p_guardian JSONB, p_apply BOOLEAN, p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_relationships JSONB;
  v_student JSONB;
  v_result JSONB;
  v_room_result JSONB;
  v_room_id TEXT;
  v_building_id TEXT;
  v_grade_reference_id UUID;
  v_student_id UUID;
BEGIN
  PERFORM public.validate_master_data_audit_actor(p_tenant_id, p_actor_user_id);
  IF p_apply IS NULL THEN
    RAISE EXCEPTION 'Mode impor tidak valid' USING ERRCODE = '22023';
  END IF;

  v_relationships := public.validate_legacy_master_data_student_relationships(p_tenant_id, p_student);
  IF v_relationships->>'status' = 'already_imported' THEN
    RETURN public.import_legacy_master_data_student(p_tenant_id, p_student, p_guardian, p_apply);
  END IF;
  IF v_relationships->>'status' <> 'planned' THEN
    RETURN v_relationships;
  END IF;

  v_room_id := NULLIF(v_relationships->>'roomId', '');
  v_building_id := NULLIF(v_relationships->>'buildingId', '');
  v_grade_reference_id := NULLIF(v_relationships->>'gradeLevelReferenceId', '')::UUID;
  v_student := p_student || jsonb_build_object(
    'grade', NULLIF(v_relationships->>'grade', ''),
    'classId', NULLIF(v_relationships->>'classId', ''),
    'buildingId', v_building_id,
    'roomId', v_room_id
  );
  -- The legacy importer stores the student first. A room is assigned only through
  -- the transactional RPC so capacity, occupancy, gender, and history stay aligned.
  IF p_apply AND v_room_id IS NOT NULL THEN
    v_student := v_student - 'roomId' - 'buildingId';
  END IF;

  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'master_data', true);
  PERFORM set_config(
    'app.master_data_audit_source',
    CASE WHEN p_apply IS TRUE THEN 'master_data_import' ELSE 'master_data' END,
    true
  );
  v_result := public.import_legacy_master_data_student(p_tenant_id, v_student, p_guardian, p_apply);
  IF p_apply IS TRUE AND v_result->>'status' = 'imported' THEN
    v_student_id := NULLIF(v_result->>'studentId', '')::UUID;
    IF v_student_id IS NULL THEN
      RAISE EXCEPTION 'ID santri hasil impor tidak tersedia' USING ERRCODE = '55000';
    END IF;
    UPDATE public.students
    SET grade_level_reference_id = v_grade_reference_id
    WHERE tenant_id = p_tenant_id AND id = v_student_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Santri hasil impor tidak ditemukan pada tenant aktif' USING ERRCODE = '55000';
    END IF;
  END IF;
  IF p_apply IS NOT TRUE OR v_result->>'status' <> 'imported' OR v_room_id IS NULL THEN
    RETURN v_result;
  END IF;

  v_room_result := public.assign_student_to_room(p_tenant_id, v_student_id, v_room_id, v_building_id);
  RETURN v_result || jsonb_build_object('roomAssignment', v_room_result);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_legacy_master_data_student_relationships(UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_master_data_student_with_actor(UUID, JSONB, JSONB, BOOLEAN, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.import_legacy_master_data_student_with_actor(UUID, JSONB, JSONB, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.validate_legacy_master_data_student_relationships(UUID, JSONB) IS
  'Validates active tenant grade/class/building/room links, gender, and current room capacity for trusted import preflight.';
COMMENT ON FUNCTION public.import_legacy_master_data_student_with_actor(UUID, JSONB, JSONB, BOOLEAN, UUID) IS
  'Audited tenant Master Data import. Room placement is delegated to the transactional room assignment RPC.';

COMMIT;
