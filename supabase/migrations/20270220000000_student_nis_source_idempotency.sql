-- Repeated Master Data writes with the same source ID must retain the issued
-- technical UUID and NIS, including when the first response was lost in transit.
BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_master_data_student_auto_nis_with_actor(
  p_tenant_id UUID,
  p_student_id UUID,
  p_source_record_id TEXT,
  p_student JSONB,
  p_nik_ciphertext_hex TEXT,
  p_nik_fingerprint_hex TEXT,
  p_nisn_ciphertext_hex TEXT,
  p_nisn_fingerprint_hex TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student JSONB := p_student;
  v_grade TEXT;
  v_grade_code TEXT;
  v_grade_reference UUID;
  v_student_id UUID := p_student_id;
  v_source_record_id TEXT := NULLIF(btrim(COALESCE(p_source_record_id, '')), '');
  v_current_nis TEXT;
BEGIN
  PERFORM public.validate_master_data_audit_actor(p_tenant_id, p_actor_user_id);
  IF p_student IS NULL OR jsonb_typeof(p_student) <> 'object' THEN
    RAISE EXCEPTION 'Data santri tidak valid' USING ERRCODE = '22023';
  END IF;

  IF v_student_id IS NULL THEN
    IF v_source_record_id IS NULL OR length(v_source_record_id) > 1500 THEN
      RAISE EXCEPTION 'ID sumber santri tidak valid' USING ERRCODE = '22023';
    END IF;
    -- Match the lock used by upsert_master_data_student so concurrent retries
    -- serialize before deciding whether a new UUID and NIS need to be issued.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'master-data-student-source:' || p_tenant_id::TEXT || ':' || v_source_record_id,
        0
      )
    );
    SELECT s.id, s.nis INTO v_student_id, v_current_nis
    FROM public.students AS s
    WHERE s.tenant_id = p_tenant_id
      AND s.source_system IN ('legacy_import', 'master_data')
      AND s.source_record_id = v_source_record_id
    FOR UPDATE;
  ELSE
    SELECT s.nis INTO v_current_nis
    FROM public.students AS s
    WHERE s.tenant_id = p_tenant_id AND s.id = v_student_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_student_id IS NULL THEN
    v_grade := NULLIF(btrim(COALESCE(p_student->>'grade', '')), '');
    IF v_grade IS NULL THEN RAISE EXCEPTION 'Pilih jenjang tenant sebelum NIS dibuat' USING ERRCODE = '23503'; END IF;
    SELECT r.id, r.nis_grade_code INTO v_grade_reference, v_grade_code
    FROM public.tenant_reference_items AS r
    WHERE r.tenant_id = p_tenant_id AND r.domain = 'academic_grade_level'
      AND r.status = 'active' AND lower(btrim(r.name)) = lower(v_grade)
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Jenjang santri harus berasal dari katalog tenant yang aktif' USING ERRCODE = '23503';
    END IF;
    IF v_grade_code IS NULL OR v_grade_code !~ '^[0-9]{2}$' THEN
      RAISE EXCEPTION 'Kode NIS dua digit belum diatur untuk jenjang santri ini' USING ERRCODE = '23514';
    END IF;
    v_student := jsonb_set(v_student, '{nis}', to_jsonb(public.allocate_tenant_naming_series(
      p_tenant_id, 'nis', (now() AT TIME ZONE 'Asia/Jakarta')::DATE,
      jsonb_build_object('grade', v_grade_code)
    )), true);
  ELSE
    -- Issued business identifiers are immutable on retries and edits.
    v_student := jsonb_set(v_student, '{nis}', to_jsonb(v_current_nis), true);
  END IF;

  RETURN public.upsert_master_data_student_with_actor(
    p_tenant_id, v_student_id, v_source_record_id, v_student,
    p_nik_ciphertext_hex, p_nik_fingerprint_hex,
    p_nisn_ciphertext_hex, p_nisn_fingerprint_hex, p_actor_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_master_data_student_auto_nis_with_actor(UUID,UUID,TEXT,JSONB,TEXT,TEXT,TEXT,TEXT,UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_master_data_student_auto_nis_with_actor(UUID,UUID,TEXT,JSONB,TEXT,TEXT,TEXT,TEXT,UUID)
  TO service_role;

COMMIT;

