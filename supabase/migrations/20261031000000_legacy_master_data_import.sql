-- Forward-only port following tenant foundation, PPDB workflows, and Master Data onboarding.
-- Prepare the schema for traceable import of existing operational records.
-- This migration only changes schema; it does not read Firebase or import live data.
BEGIN;

ALTER TABLE public.students
  ALTER COLUMN source_candidate_id DROP NOT NULL,
  ALTER COLUMN nis DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL,
  ALTER COLUMN nik_ciphertext DROP NOT NULL,
  ALTER COLUMN nik_fingerprint DROP NOT NULL,
  ALTER COLUMN class_id DROP NOT NULL,
  ALTER COLUMN room_id DROP NOT NULL,
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'ppdb',
  ADD COLUMN source_record_id TEXT;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_nis_check,
  ADD CONSTRAINT students_legacy_nis_format_check
    CHECK (nis IS NULL OR nis ~ '^[0-9]{1,10}$'),
  ADD CONSTRAINT students_source_origin_check
    CHECK (
      (source_system = 'ppdb' AND source_candidate_id IS NOT NULL AND source_record_id IS NULL)
      OR
      (source_system = 'legacy_import' AND source_candidate_id IS NULL
        AND source_record_id IS NOT NULL AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
    );

CREATE UNIQUE INDEX students_source_record_tenant_uq
  ON public.students (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

ALTER TABLE public.guardians
  ALTER COLUMN source_candidate_id DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'ppdb',
  ADD COLUMN source_record_id TEXT,
  ADD COLUMN nik_ciphertext BYTEA,
  ADD COLUMN nik_fingerprint BYTEA;

ALTER TABLE public.guardians
  ADD CONSTRAINT guardians_source_origin_check
    CHECK (
      (source_system = 'ppdb' AND source_candidate_id IS NOT NULL AND source_record_id IS NULL)
      OR
      (source_system = 'legacy_import' AND source_candidate_id IS NULL
        AND source_record_id IS NOT NULL AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
    ),
  ADD CONSTRAINT guardians_nik_pair_check
    CHECK ((nik_ciphertext IS NULL) = (nik_fingerprint IS NULL));

CREATE UNIQUE INDEX guardians_source_record_tenant_uq
  ON public.guardians (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

ALTER TABLE public.nis_reservations
  ALTER COLUMN candidate_id DROP NOT NULL;

ALTER TABLE public.nis_reservations
  DROP CONSTRAINT IF EXISTS nis_reservations_nis_check,
  ADD CONSTRAINT nis_reservations_legacy_nis_format_check
    CHECK (nis ~ '^[0-9]{1,10}$'),
  ADD CONSTRAINT nis_reservations_candidate_or_student_check
    CHECK (candidate_id IS NOT NULL OR student_id IS NOT NULL);



ALTER TABLE public.identity_claims
  DROP CONSTRAINT IF EXISTS identity_claims_entity_type_check,
  ADD CONSTRAINT identity_claims_entity_type_check
    CHECK (entity_type IN ('candidate', 'santri', 'guardian'));

CREATE OR REPLACE FUNCTION public.import_legacy_master_data_student(
  p_tenant_id UUID,
  p_student JSONB,
  p_guardian JSONB DEFAULT NULL,
  p_apply BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_source_id TEXT;
  v_name TEXT;
  v_nis TEXT;
  v_gender public.gender_type;
  v_nik_cipher BYTEA;
  v_nik_fingerprint BYTEA;
  v_nisn_cipher BYTEA;
  v_nisn_fingerprint BYTEA;
  v_class_id TEXT;
  v_room_id TEXT;
  v_building_id TEXT;
  v_student_id UUID;
  v_guardian_id UUID;
  v_guardian_source_id TEXT;
  v_guardian_name TEXT;
  v_guardian_phone TEXT;
  v_guardian_nik_cipher BYTEA;
  v_guardian_nik_fingerprint BYTEA;
  v_warnings JSONB := '[]'::jsonb;
  v_existing_id UUID;
  v_already_imported BOOLEAN := false;
  v_existing_guardian_nik_fingerprint BYTEA;
  v_details JSONB;
  v_guardian_details JSONB;
BEGIN
  IF p_tenant_id IS NULL
    OR p_student IS NULL OR jsonb_typeof(p_student) <> 'object'
    OR (p_guardian IS NOT NULL AND jsonb_typeof(p_guardian) <> 'object') THEN
    RAISE EXCEPTION 'Data migrasi santri tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_source_id := NULLIF(btrim(p_student->>'sourceRecordId'), '');
  v_name := NULLIF(btrim(p_student->>'name'), '');
  v_nis := NULLIF(btrim(p_student->>'nis'), '');
  IF v_source_id IS NULL OR length(v_source_id) > 1500 OR v_name IS NULL OR length(v_name) > 180 THEN
    RAISE EXCEPTION 'ID sumber atau nama santri tidak valid' USING ERRCODE = '22023';
  END IF;
  IF v_nis IS NOT NULL AND v_nis !~ '^[0-9]{1,10}$' THEN
    RAISE EXCEPTION 'Format NIS tidak valid' USING ERRCODE = '22023';
  END IF;

  CASE upper(NULLIF(btrim(p_student->>'gender'), ''))
    WHEN 'L' THEN v_gender := 'L';
    WHEN 'P' THEN v_gender := 'P';
    ELSE v_gender := NULL;
  END CASE;

  IF NULLIF(p_student->>'nikCiphertextHex', '') IS NOT NULL THEN
    IF length(p_student->>'nikCiphertextHex') <> 88
      OR p_student->>'nikCiphertextHex' !~ '^[0-9a-fA-F]{88}$'
      OR p_student->>'nikFingerprintHex' !~ '^[0-9a-fA-F]{64}$' THEN
      RAISE EXCEPTION 'NIK terenkripsi tidak valid' USING ERRCODE = '22023';
    END IF;
    v_nik_cipher := decode(p_student->>'nikCiphertextHex', 'hex');
    v_nik_fingerprint := decode(p_student->>'nikFingerprintHex', 'hex');
  ELSIF NULLIF(p_student->>'nikFingerprintHex', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Fingerprint NIK tanpa ciphertext' USING ERRCODE = '22023';
  END IF;

  IF NULLIF(p_student->>'nisnCiphertextHex', '') IS NOT NULL THEN
    IF length(p_student->>'nisnCiphertextHex') <> 76
      OR p_student->>'nisnCiphertextHex' !~ '^[0-9a-fA-F]{76}$'
      OR p_student->>'nisnFingerprintHex' !~ '^[0-9a-fA-F]{64}$' THEN
      RAISE EXCEPTION 'NISN terenkripsi tidak valid' USING ERRCODE = '22023';
    END IF;
    v_nisn_cipher := decode(p_student->>'nisnCiphertextHex', 'hex');
    v_nisn_fingerprint := decode(p_student->>'nisnFingerprintHex', 'hex');
  ELSIF NULLIF(p_student->>'nisnFingerprintHex', '') IS NOT NULL THEN
    RAISE EXCEPTION 'Fingerprint NISN tanpa ciphertext' USING ERRCODE = '22023';
  END IF;

  -- Serialize retries of the same source row before checking idempotency.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('legacy-student:' || p_tenant_id::text || ':' || v_source_id, 0)
  );

  SELECT id INTO v_existing_id
  FROM public.students
  WHERE tenant_id = p_tenant_id
    AND source_system = 'legacy_import'
    AND source_record_id = v_source_id;
  v_already_imported := FOUND;

  IF NOT v_already_imported AND v_nis IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.nis_reservations WHERE tenant_id = p_tenant_id AND nis = v_nis)
    OR EXISTS (SELECT 1 FROM public.students WHERE tenant_id = p_tenant_id AND nis = v_nis)
    OR EXISTS (SELECT 1 FROM public.candidates WHERE tenant_id = p_tenant_id AND workflow_data->>'nis' = v_nis)
  ) THEN
    RETURN jsonb_build_object('status', 'conflict', 'message', 'NIS sudah digunakan pada tenant ini.');
  END IF;

  IF NOT v_already_imported THEN
    IF v_nik_fingerprint IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.identity_claims
      WHERE tenant_id = p_tenant_id AND identity_type = 'nik' AND fingerprint = v_nik_fingerprint
    ) THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'NIK sudah terikat pada record lain di tenant ini.');
    END IF;
    IF v_nisn_fingerprint IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.identity_claims
      WHERE tenant_id = p_tenant_id AND identity_type = 'nisn' AND fingerprint = v_nisn_fingerprint
    ) THEN
      RETURN jsonb_build_object('status', 'conflict', 'message', 'NISN sudah terikat pada record lain di tenant ini.');
    END IF;
  END IF;

  v_class_id := NULLIF(btrim(p_student->>'classId'), '');
  IF v_class_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = v_class_id
  ) THEN
    v_class_id := NULL;
    v_warnings := v_warnings || jsonb_build_array('Kelas lama tidak ditemukan di Supabase; relasi kelas perlu direkonsiliasi.');
  END IF;

  v_room_id := NULLIF(btrim(p_student->>'roomId'), '');
  IF v_room_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_room_id
  ) THEN
    v_room_id := NULL;
    v_warnings := v_warnings || jsonb_build_array('Kamar lama tidak ditemukan di Supabase; relasi kamar perlu direkonsiliasi.');
  END IF;

  v_building_id := NULLIF(btrim(p_student->>'buildingId'), '');
  IF v_building_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = v_building_id
  ) THEN
    v_building_id := NULL;
    v_warnings := v_warnings || jsonb_build_array('Gedung lama tidak ditemukan di Supabase; relasi gedung perlu direkonsiliasi.');
  END IF;

  v_details := CASE
    WHEN jsonb_typeof(p_student->'details') = 'object' THEN p_student->'details'
    ELSE '{}'::jsonb
  END;

  IF p_guardian IS NOT NULL THEN
    v_guardian_source_id := NULLIF(btrim(p_guardian->>'sourceRecordId'), '');
    v_guardian_name := NULLIF(btrim(p_guardian->>'name'), '');
    v_guardian_phone := NULLIF(btrim(p_guardian->>'phone'), '');
    v_guardian_details := CASE
      WHEN jsonb_typeof(p_guardian->'details') = 'object' THEN p_guardian->'details'
      ELSE '{}'::jsonb
    END;

    IF v_guardian_source_id IS NOT NULL THEN
      -- Siblings may import the same guardian concurrently; serialize by tenant and legacy guardian ID.
      PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('legacy-guardian:' || p_tenant_id::text || ':' || v_guardian_source_id, 0)
      );
      SELECT id, nik_fingerprint INTO v_guardian_id, v_existing_guardian_nik_fingerprint
      FROM public.guardians
      WHERE tenant_id = p_tenant_id
        AND source_system = 'legacy_import'
        AND source_record_id = v_guardian_source_id;
    END IF;

    IF v_guardian_id IS NULL AND v_guardian_name IS NOT NULL AND length(v_guardian_name) > 180 THEN
      RAISE EXCEPTION 'Nama wali tidak valid' USING ERRCODE = '22023';
    END IF;

    IF NULLIF(p_guardian->>'nikCiphertextHex', '') IS NOT NULL THEN
      IF length(p_guardian->>'nikCiphertextHex') <> 88
        OR p_guardian->>'nikCiphertextHex' !~ '^[0-9a-fA-F]{88}$'
        OR p_guardian->>'nikFingerprintHex' !~ '^[0-9a-fA-F]{64}$' THEN
        RAISE EXCEPTION 'NIK wali terenkripsi tidak valid' USING ERRCODE = '22023';
      END IF;
      v_guardian_nik_cipher := decode(p_guardian->>'nikCiphertextHex', 'hex');
      v_guardian_nik_fingerprint := decode(p_guardian->>'nikFingerprintHex', 'hex');

      IF v_guardian_id IS NULL OR v_existing_guardian_nik_fingerprint IS NULL THEN
        IF EXISTS (
          SELECT 1 FROM public.identity_claims
          WHERE tenant_id = p_tenant_id
            AND identity_type = 'nik'
            AND fingerprint = v_guardian_nik_fingerprint
        ) OR (
          v_nik_fingerprint IS NOT NULL
          AND v_guardian_nik_fingerprint = v_nik_fingerprint
        ) THEN
          RETURN jsonb_build_object('status', 'conflict', 'message', 'NIK wali sudah terikat pada record lain di tenant ini.');
        END IF;
      ELSIF v_existing_guardian_nik_fingerprint <> v_guardian_nik_fingerprint THEN
        RETURN jsonb_build_object('status', 'conflict', 'message', 'NIK wali sumber berbeda dari nilai yang sudah diimpor.');
      END IF;
    ELSIF NULLIF(p_guardian->>'nikFingerprintHex', '') IS NOT NULL THEN
      RAISE EXCEPTION 'Fingerprint NIK wali tanpa ciphertext' USING ERRCODE = '22023';
    END IF;

    IF v_guardian_id IS NULL AND v_guardian_source_id IS NULL
      AND (v_guardian_name IS NOT NULL OR v_guardian_phone IS NOT NULL) THEN
      RAISE EXCEPTION 'ID sumber wali tidak valid' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF NOT p_apply THEN
    RETURN jsonb_build_object(
      'status', CASE WHEN v_already_imported THEN 'already_imported' ELSE 'planned' END,
      'studentId', v_existing_id,
      'guardianPending', v_guardian_source_id IS NOT NULL AND v_guardian_id IS NULL AND v_guardian_name IS NOT NULL,
      'warnings', v_warnings
    );
  END IF;

  IF v_guardian_id IS NULL AND v_guardian_source_id IS NOT NULL AND v_guardian_name IS NOT NULL THEN
    INSERT INTO public.guardians (
      tenant_id, source_candidate_id, source_system, source_record_id, name, phone,
      nik_ciphertext, nik_fingerprint, details
    ) VALUES (
      p_tenant_id, NULL, 'legacy_import', v_guardian_source_id, v_guardian_name, v_guardian_phone,
      v_guardian_nik_cipher, v_guardian_nik_fingerprint, COALESCE(v_guardian_details, '{}'::jsonb)
    )
    RETURNING id INTO v_guardian_id;

    IF v_guardian_nik_cipher IS NOT NULL AND v_guardian_nik_fingerprint IS NOT NULL THEN
      INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
      VALUES (p_tenant_id, 'nik', v_guardian_nik_fingerprint, 'guardian', v_guardian_id);
    END IF;
  ELSIF v_guardian_id IS NOT NULL AND v_guardian_nik_cipher IS NOT NULL
    AND v_existing_guardian_nik_fingerprint IS NULL THEN
    UPDATE public.guardians
    SET nik_ciphertext = v_guardian_nik_cipher, nik_fingerprint = v_guardian_nik_fingerprint
    WHERE tenant_id = p_tenant_id AND id = v_guardian_id AND nik_fingerprint IS NULL;
    IF FOUND THEN
      INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
      VALUES (p_tenant_id, 'nik', v_guardian_nik_fingerprint, 'guardian', v_guardian_id);
    END IF;
  END IF;

  IF v_already_imported THEN
    IF v_guardian_id IS NOT NULL THEN
      INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id, relationship)
      VALUES (
        p_tenant_id, v_guardian_id, v_existing_id,
        COALESCE(NULLIF(btrim(p_guardian->>'relationship'), ''), 'Wali')
      )
      ON CONFLICT (tenant_id, guardian_id, student_id) DO NOTHING;
    END IF;
    RETURN jsonb_build_object(
      'status', 'already_imported',
      'studentId', v_existing_id,
      'guardianId', v_guardian_id,
      'warnings', v_warnings
    );
  END IF;

  INSERT INTO public.students (
    tenant_id, source_candidate_id, source_system, source_record_id, nis, name, gender, grade,
    nik_ciphertext, nik_fingerprint, nisn_ciphertext, nisn_fingerprint,
    class_id, room_id, building_id, details, status
  ) VALUES (
    p_tenant_id, NULL, 'legacy_import', v_source_id, v_nis, v_name, v_gender,
    NULLIF(btrim(p_student->>'grade'), ''),
    v_nik_cipher, v_nik_fingerprint, v_nisn_cipher, v_nisn_fingerprint,
    v_class_id, v_room_id, v_building_id, v_details,
    COALESCE(NULLIF(btrim(p_student->>'status'), ''), 'Active')
  )
  RETURNING id INTO v_student_id;

  IF v_nik_fingerprint IS NOT NULL THEN
    INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
    VALUES (p_tenant_id, 'nik', v_nik_fingerprint, 'santri', v_student_id);
  END IF;
  IF v_nisn_fingerprint IS NOT NULL THEN
    INSERT INTO public.identity_claims (tenant_id, identity_type, fingerprint, entity_type, entity_id)
    VALUES (p_tenant_id, 'nisn', v_nisn_fingerprint, 'santri', v_student_id);
  END IF;
  IF v_nis IS NOT NULL THEN
    INSERT INTO public.nis_reservations (tenant_id, nis, candidate_id, student_id, source)
    VALUES (p_tenant_id, v_nis, NULL, v_student_id, 'master_data_import');
  END IF;
  IF v_guardian_id IS NOT NULL THEN
    INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id, relationship)
    VALUES (
      p_tenant_id, v_guardian_id, v_student_id,
      COALESCE(NULLIF(btrim(p_guardian->>'relationship'), ''), 'Wali')
    )
    ON CONFLICT (tenant_id, guardian_id, student_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'status', 'imported',
    'studentId', v_student_id,
    'guardianId', v_guardian_id,
    'warnings', v_warnings
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('status', 'conflict', 'message', 'NIS, NIK, NISN, atau sumber data duplikat pada tenant ini.');
  WHEN foreign_key_violation THEN
    RETURN jsonb_build_object('status', 'conflict', 'message', 'Relasi data tidak valid untuk tenant ini.');
  WHEN check_violation THEN
    RETURN jsonb_build_object('status', 'conflict', 'message', 'Data tidak memenuhi aturan validasi pada tenant ini.');
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_master_data_student(UUID, JSONB, JSONB, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_master_data_student(UUID, JSONB, JSONB, BOOLEAN)
  TO service_role;

COMMIT;
