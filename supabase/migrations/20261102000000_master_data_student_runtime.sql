-- Forward-only port following tenant foundation, PPDB workflows, and Master Data onboarding.
-- Tenant-scoped Master Data student write contract.
-- All writes go through trusted API/RPC; identity values arrive encrypted from the server.
BEGIN;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_source_origin_check,
  ADD CONSTRAINT students_source_origin_check
    CHECK (
      (source_system = 'ppdb' AND source_candidate_id IS NOT NULL AND source_record_id IS NULL)
      OR
      (source_system IN ('legacy_import', 'master_data') AND source_candidate_id IS NULL
        AND source_record_id IS NOT NULL AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
    );

ALTER TABLE public.nis_reservations
  DROP CONSTRAINT IF EXISTS nis_reservations_source_check,
  ADD CONSTRAINT nis_reservations_source_check
    CHECK (source IN ('ppdb_onboarding', 'master_data_import', 'master_data_crud'));

CREATE OR REPLACE FUNCTION public.upsert_master_data_student(
  p_tenant_id UUID,
  p_student_id UUID,
  p_source_record_id TEXT,
  p_student JSONB,
  p_nik_ciphertext_hex TEXT DEFAULT NULL,
  p_nik_fingerprint_hex TEXT DEFAULT NULL,
  p_nisn_ciphertext_hex TEXT DEFAULT NULL,
  p_nisn_fingerprint_hex TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.students%ROWTYPE;
  v_existing_found BOOLEAN := false;
  v_student_id UUID;
  v_source_record_id TEXT;
  v_source_system TEXT;
  v_name TEXT;
  v_nis TEXT;
  v_gender public.gender_type;
  v_grade TEXT;
  v_class_id TEXT;
  v_room_id TEXT;
  v_building_id TEXT;
  v_status TEXT;
  v_details JSONB;
  v_nik_cipher BYTEA;
  v_nik_fingerprint BYTEA;
  v_nisn_cipher BYTEA;
  v_nisn_fingerprint BYTEA;
  v_claim_type TEXT;
  v_claim_entity_id UUID;
  v_guardian_source_id TEXT;
  v_guardian_id UUID;
  v_relationship TEXT;
  v_lock_key TEXT;
  v_rows INTEGER;
  v_room_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_student IS NULL OR jsonb_typeof(p_student) <> 'object' THEN
    RAISE EXCEPTION 'Data santri tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_source_record_id := NULLIF(btrim(COALESCE(p_source_record_id, '')), '');
  IF v_source_record_id IS NOT NULL THEN
    IF length(v_source_record_id) > 1500 THEN
      RAISE EXCEPTION 'ID sumber santri tidak valid' USING ERRCODE = '22023';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('master-data-student-source:' || p_tenant_id::text || ':' || v_source_record_id, 0)
    );
  END IF;

  IF p_student_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_student_id
    FOR UPDATE;
    v_existing_found := FOUND;
    IF NOT v_existing_found THEN
      RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_source_record_id IS NOT NULL
      AND v_existing.source_record_id IS NOT NULL
      AND v_existing.source_record_id <> v_source_record_id THEN
      RAISE EXCEPTION 'ID sumber santri tidak dapat diubah' USING ERRCODE = '22023';
    END IF;
    v_student_id := v_existing.id;
    v_source_record_id := COALESCE(v_existing.source_record_id, v_source_record_id);
    v_source_system := v_existing.source_system;
  ELSIF v_source_record_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.students
    WHERE tenant_id = p_tenant_id
      AND source_system IN ('legacy_import', 'master_data')
      AND source_record_id = v_source_record_id
    FOR UPDATE;
    v_existing_found := FOUND;
    IF v_existing_found THEN
      v_student_id := v_existing.id;
      v_source_system := v_existing.source_system;
    ELSE
      v_student_id := gen_random_uuid();
      v_source_system := 'master_data';
    END IF;
  ELSE
    RAISE EXCEPTION 'ID santri wajib diisi' USING ERRCODE = '22023';
  END IF;

  v_name := NULLIF(btrim(p_student->>'name'), '');
  IF v_name IS NULL OR length(v_name) > 180 THEN
    RAISE EXCEPTION 'Nama santri tidak valid' USING ERRCODE = '22023';
  END IF;

  IF p_student ? 'nis' THEN
    v_nis := NULLIF(btrim(p_student->>'nis'), '');
  ELSE
    v_nis := CASE WHEN v_existing_found THEN v_existing.nis ELSE NULL END;
  END IF;
  IF v_nis IS NOT NULL AND v_nis !~ '^[0-9]{1,10}$' THEN
    RAISE EXCEPTION 'Format NIS tidak valid' USING ERRCODE = '22023';
  END IF;

  IF p_student ? 'gender' THEN
    IF NULLIF(btrim(p_student->>'gender'), '') IS NULL THEN
      v_gender := NULL;
    ELSE
      CASE upper(btrim(p_student->>'gender'))
        WHEN 'L' THEN v_gender := 'L';
        WHEN 'P' THEN v_gender := 'P';
        ELSE RAISE EXCEPTION 'Jenis kelamin santri tidak valid' USING ERRCODE = '22023';
      END CASE;
    END IF;
  ELSE
    v_gender := CASE WHEN v_existing_found THEN v_existing.gender ELSE NULL END;
  END IF;

  IF p_student ? 'grade' THEN
    v_grade := NULLIF(btrim(p_student->>'grade'), '');
  ELSE
    v_grade := CASE WHEN v_existing_found THEN v_existing.grade ELSE NULL END;
  END IF;
  IF v_grade IS NOT NULL AND length(v_grade) > 80 THEN
    RAISE EXCEPTION 'Jenjang santri tidak valid' USING ERRCODE = '22023';
  END IF;

  IF p_student ? 'classId' THEN
    v_class_id := NULLIF(btrim(p_student->>'classId'), '');
  ELSE
    v_class_id := CASE WHEN v_existing_found THEN v_existing.class_id ELSE NULL END;
  END IF;
  IF v_class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = v_class_id
  ) THEN
    RAISE EXCEPTION 'Kelas tidak ditemukan pada tenant ini' USING ERRCODE = '23503';
  END IF;

  IF p_student ? 'roomId' THEN
    v_room_id := NULLIF(btrim(p_student->>'roomId'), '');
  ELSE
    v_room_id := CASE WHEN v_existing_found THEN v_existing.room_id ELSE NULL END;
  END IF;
  IF p_student ? 'buildingId' THEN
    v_building_id := NULLIF(btrim(p_student->>'buildingId'), '');
  ELSE
    v_building_id := CASE WHEN v_existing_found THEN v_existing.building_id ELSE NULL END;
  END IF;
  IF v_room_id IS NULL THEN
    v_building_id := NULL;
  END IF;

  IF p_student ? 'status' THEN
    v_status := COALESCE(NULLIF(btrim(p_student->>'status'), ''), 'Active');
  ELSE
    v_status := CASE WHEN v_existing_found THEN v_existing.status ELSE 'Active' END;
  END IF;
  IF length(v_status) > 40 OR lower(v_status) = 'archived' THEN
    RAISE EXCEPTION 'Status santri tidak valid; gunakan operasi arsip untuk mengarsipkan data' USING ERRCODE = '22023';
  END IF;

  v_details := CASE
    WHEN jsonb_typeof(p_student->'details') = 'object' THEN p_student->'details'
    ELSE '{}'::jsonb
  END;
  IF pg_catalog.octet_length(v_details::text) > 32768 THEN
    RAISE EXCEPTION 'Detail data santri melebihi batas ukuran' USING ERRCODE = '22023';
  END IF;
  IF v_existing_found THEN
    v_details := COALESCE(v_existing.details, '{}'::jsonb) || v_details;
  END IF;

  IF NULLIF(p_nik_ciphertext_hex, '') IS NOT NULL THEN
    IF length(p_nik_ciphertext_hex) <> 88 OR p_nik_ciphertext_hex !~ '^[0-9a-fA-F]{88}$'
      OR p_nik_fingerprint_hex IS NULL OR p_nik_fingerprint_hex !~ '^[0-9a-fA-F]{64}$' THEN
      RAISE EXCEPTION 'NIK terenkripsi tidak valid' USING ERRCODE = '22023';
    END IF;
    v_nik_cipher := decode(p_nik_ciphertext_hex, 'hex');
    v_nik_fingerprint := decode(p_nik_fingerprint_hex, 'hex');
  ELSE
    v_nik_cipher := CASE WHEN v_existing_found THEN v_existing.nik_ciphertext ELSE NULL END;
    v_nik_fingerprint := CASE WHEN v_existing_found THEN v_existing.nik_fingerprint ELSE NULL END;
  END IF;

  IF NULLIF(p_nisn_ciphertext_hex, '') IS NOT NULL THEN
    IF length(p_nisn_ciphertext_hex) <> 76 OR p_nisn_ciphertext_hex !~ '^[0-9a-fA-F]{76}$'
      OR p_nisn_fingerprint_hex IS NULL OR p_nisn_fingerprint_hex !~ '^[0-9a-fA-F]{64}$' THEN
      RAISE EXCEPTION 'NISN terenkripsi tidak valid' USING ERRCODE = '22023';
    END IF;
    v_nisn_cipher := decode(p_nisn_ciphertext_hex, 'hex');
    v_nisn_fingerprint := decode(p_nisn_fingerprint_hex, 'hex');
  ELSE
    v_nisn_cipher := CASE WHEN v_existing_found THEN v_existing.nisn_ciphertext ELSE NULL END;
    v_nisn_fingerprint := CASE WHEN v_existing_found THEN v_existing.nisn_fingerprint ELSE NULL END;
  END IF;

  IF v_existing_found AND v_existing.source_system = 'ppdb' AND (
    v_nis IS DISTINCT FROM v_existing.nis
    OR v_nik_fingerprint IS DISTINCT FROM v_existing.nik_fingerprint
    OR v_nisn_fingerprint IS DISTINCT FROM v_existing.nisn_fingerprint
  ) THEN
    RAISE EXCEPTION 'NIS, NIK, atau NISN santri PPDB harus dikoreksi melalui alur identitas khusus' USING ERRCODE = '22023';
  END IF;

  IF v_nis IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('master-data-student-nis:' || p_tenant_id::text || ':' || v_nis, 0)
    );
    IF EXISTS (
      SELECT 1 FROM public.students
      WHERE tenant_id = p_tenant_id AND nis = v_nis AND id <> v_student_id
    ) OR EXISTS (
      SELECT 1 FROM public.nis_reservations r
      WHERE r.tenant_id = p_tenant_id AND r.nis = v_nis
        AND r.student_id IS DISTINCT FROM v_student_id
        AND (
          NOT v_existing_found
          OR v_existing.source_candidate_id IS NULL
          OR r.candidate_id IS DISTINCT FROM v_existing.source_candidate_id
        )
    ) OR EXISTS (
      SELECT 1 FROM public.candidates c
      WHERE c.tenant_id = p_tenant_id
        AND (c.nis = v_nis OR c.workflow_data->>'nis' = v_nis)
        AND (NOT v_existing_found OR c.id IS DISTINCT FROM v_existing.source_candidate_id)
    ) THEN
      RAISE EXCEPTION 'NIS sudah digunakan pada tenant ini' USING ERRCODE = '23505';
    END IF;
  END IF;

  FOR v_lock_key IN
    SELECT DISTINCT item
    FROM unnest(ARRAY[
      CASE WHEN v_nik_fingerprint IS NOT NULL THEN 'master-data-identity:' || p_tenant_id::text || ':nik:' || encode(v_nik_fingerprint, 'hex') END,
      CASE WHEN v_nisn_fingerprint IS NOT NULL THEN 'master-data-identity:' || p_tenant_id::text || ':nisn:' || encode(v_nisn_fingerprint, 'hex') END
    ]) AS locks(item)
    WHERE item IS NOT NULL
    ORDER BY item
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_lock_key, 0));
  END LOOP;

  IF v_nik_fingerprint IS NOT NULL THEN
    SELECT entity_type, entity_id INTO v_claim_type, v_claim_entity_id
    FROM public.identity_claims
    WHERE tenant_id = p_tenant_id AND identity_type = 'nik' AND fingerprint = v_nik_fingerprint
    FOR UPDATE;
    IF FOUND AND (v_claim_type <> 'santri' OR v_claim_entity_id <> v_student_id) THEN
      RAISE EXCEPTION 'NIK sudah digunakan pada tenant ini' USING ERRCODE = '23505';
    END IF;
  END IF;
  IF v_nisn_fingerprint IS NOT NULL THEN
    SELECT entity_type, entity_id INTO v_claim_type, v_claim_entity_id
    FROM public.identity_claims
    WHERE tenant_id = p_tenant_id AND identity_type = 'nisn' AND fingerprint = v_nisn_fingerprint
    FOR UPDATE;
    IF FOUND AND (v_claim_type <> 'santri' OR v_claim_entity_id <> v_student_id) THEN
      RAISE EXCEPTION 'NISN sudah digunakan pada tenant ini' USING ERRCODE = '23505';
    END IF;
  END IF;

  IF v_existing_found THEN
    UPDATE public.students
    SET source_record_id = COALESCE(source_record_id, v_source_record_id),
        nis = v_nis,
        name = v_name,
        gender = v_gender,
        grade = v_grade,
        nik_ciphertext = v_nik_cipher,
        nik_fingerprint = v_nik_fingerprint,
        nisn_ciphertext = v_nisn_cipher,
        nisn_fingerprint = v_nisn_fingerprint,
        class_id = v_class_id,
        details = v_details,
        status = v_status,
        updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_student_id;
  ELSE
    INSERT INTO public.students (
      id, tenant_id, source_candidate_id, source_system, source_record_id, nis, name, gender, grade,
      nik_ciphertext, nik_fingerprint, nisn_ciphertext, nisn_fingerprint, class_id, room_id,
      building_id, details, status
    ) VALUES (
      v_student_id, p_tenant_id, NULL, v_source_system, v_source_record_id, v_nis, v_name, v_gender, v_grade,
      v_nik_cipher, v_nik_fingerprint, v_nisn_cipher, v_nisn_fingerprint, v_class_id, NULL,
      NULL, v_details, v_status
    );
  END IF;

  IF v_nik_fingerprint IS NOT NULL THEN
    INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
    VALUES (p_tenant_id, 'nik', v_nik_fingerprint, 'santri', v_student_id)
    ON CONFLICT (tenant_id, identity_type, fingerprint) DO NOTHING;
  END IF;
  IF v_nisn_fingerprint IS NOT NULL THEN
    INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
    VALUES (p_tenant_id, 'nisn', v_nisn_fingerprint, 'santri', v_student_id)
    ON CONFLICT (tenant_id, identity_type, fingerprint) DO NOTHING;
  END IF;

  IF v_nis IS NULL THEN
    DELETE FROM public.nis_reservations
    WHERE tenant_id = p_tenant_id AND (student_id = v_student_id
      OR (v_existing_found AND v_existing.source_candidate_id IS NOT NULL AND candidate_id = v_existing.source_candidate_id));
  ELSE
    DELETE FROM public.nis_reservations
    WHERE tenant_id = p_tenant_id AND nis <> v_nis
      AND (student_id = v_student_id
        OR (v_existing_found AND v_existing.source_candidate_id IS NOT NULL AND candidate_id = v_existing.source_candidate_id));
    INSERT INTO public.nis_reservations (tenant_id, nis, candidate_id, student_id, source)
    VALUES (
      p_tenant_id, v_nis,
      CASE WHEN v_existing_found THEN v_existing.source_candidate_id ELSE NULL END,
      v_student_id,
      CASE WHEN v_existing_found AND v_existing.source_candidate_id IS NOT NULL
        THEN 'ppdb_onboarding' ELSE 'master_data_crud' END
    )
    ON CONFLICT (tenant_id, nis) DO UPDATE
      SET candidate_id = EXCLUDED.candidate_id,
          student_id = EXCLUDED.student_id,
          source = EXCLUDED.source
      WHERE public.nis_reservations.student_id = EXCLUDED.student_id
        OR (EXCLUDED.candidate_id IS NOT NULL AND public.nis_reservations.candidate_id = EXCLUDED.candidate_id);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      RAISE EXCEPTION 'NIS sudah digunakan pada tenant ini' USING ERRCODE = '23505';
    END IF;
  END IF;

  v_guardian_source_id := NULLIF(btrim(COALESCE(v_details->>'waliSantriId', '')), '');
  v_relationship := COALESCE(NULLIF(btrim(v_details->>'waliRelationship'), ''), 'Wali');
  DELETE FROM public.guardian_students
  WHERE tenant_id = p_tenant_id AND student_id = v_student_id;
  IF v_guardian_source_id IS NOT NULL THEN
    SELECT id INTO v_guardian_id
    FROM public.guardians
    WHERE tenant_id = p_tenant_id
      AND source_system = 'legacy_import'
      AND source_record_id = v_guardian_source_id
    LIMIT 1;
    IF v_guardian_id IS NOT NULL THEN
      INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id, relationship)
      VALUES (p_tenant_id, v_guardian_id, v_student_id, v_relationship)
      ON CONFLICT (tenant_id, guardian_id, student_id)
      DO UPDATE SET relationship = EXCLUDED.relationship;
    END IF;
  END IF;

  IF v_room_id IS NOT NULL
    OR v_room_id IS DISTINCT FROM CASE WHEN v_existing_found THEN v_existing.room_id ELSE NULL END
    OR v_building_id IS DISTINCT FROM CASE WHEN v_existing_found THEN v_existing.building_id ELSE NULL END THEN
    v_room_result := public.assign_student_to_room(p_tenant_id, v_student_id, v_room_id, v_building_id);
  END IF;
  IF v_room_id IS NULL THEN
    UPDATE public.students
    SET building_id = NULL, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_student_id AND room_id IS NULL AND building_id IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'studentId', v_student_id,
    'sourceRecordId', v_source_record_id,
    'created', NOT v_existing_found
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_master_data_student(
  p_tenant_id UUID,
  p_student_id UUID DEFAULT NULL,
  p_source_record_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_room_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR (
    p_student_id IS NULL AND (
      NULLIF(btrim(COALESCE(p_source_record_id, '')), '') IS NULL
      OR length(btrim(p_source_record_id)) > 1500
    )
  ) THEN
    RAISE EXCEPTION 'ID santri tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  IF p_student_id IS NOT NULL THEN
    SELECT * INTO v_student FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_student_id FOR UPDATE;
  ELSE
    SELECT * INTO v_student FROM public.students
    WHERE tenant_id = p_tenant_id AND source_record_id = p_source_record_id
      AND source_system IN ('legacy_import', 'master_data')
    FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF lower(v_student.status) = 'archived' THEN
    RETURN jsonb_build_object('success', true, 'alreadyArchived', true, 'studentId', v_student.id);
  END IF;
  IF v_student.room_id IS NOT NULL THEN
    v_room_result := public.assign_student_to_room(p_tenant_id, v_student.id, NULL, NULL);
  END IF;
  UPDATE public.students
  SET status = 'Archived', updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = v_student.id;

  RETURN jsonb_build_object('success', true, 'alreadyArchived', false, 'studentId', v_student.id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_master_data_student(UUID, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_master_data_student(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_master_data_student(UUID, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_master_data_student(UUID, UUID, TEXT)
  TO service_role;

COMMIT;
