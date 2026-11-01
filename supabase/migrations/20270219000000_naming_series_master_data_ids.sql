-- Extend server-side Naming Series to structure codes and direct Master Data student creation.
-- Imports keep historical identifiers; new interactive records receive generated identifiers.
BEGIN;

-- Keep NIS jenjang codes tenant-configurable and stable in the shared grade catalog.
ALTER TABLE public.tenant_reference_items
  ADD COLUMN IF NOT EXISTS nis_grade_code TEXT;
ALTER TABLE public.tenant_reference_items
  DROP CONSTRAINT IF EXISTS tenant_reference_items_nis_grade_code_check,
  DROP CONSTRAINT IF EXISTS tenant_reference_items_nis_grade_domain_check;
ALTER TABLE public.tenant_reference_items
  ADD CONSTRAINT tenant_reference_items_nis_grade_code_check
    CHECK (nis_grade_code IS NULL OR nis_grade_code ~ '^[0-9]{2}$'),
  ADD CONSTRAINT tenant_reference_items_nis_grade_domain_check
    CHECK (nis_grade_code IS NULL OR domain = 'academic_grade_level');
CREATE UNIQUE INDEX IF NOT EXISTS tenant_reference_items_tenant_nis_grade_code_uq
  ON public.tenant_reference_items (tenant_id, nis_grade_code)
  WHERE domain = 'academic_grade_level' AND nis_grade_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_tenant_reference_nis_grade_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.domain = 'academic_grade_level' AND NEW.status = 'active' AND NEW.nis_grade_code IS NULL THEN
    RAISE EXCEPTION 'Atur kode NIS dua digit pada jenjang aktif sebelum menyimpan' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.nis_grade_code IS NOT NULL
    AND NEW.nis_grade_code IS DISTINCT FROM OLD.nis_grade_code
    AND (
      EXISTS (SELECT 1 FROM public.tenant_naming_series_allocations a
        WHERE a.tenant_id = OLD.tenant_id AND a.series_key = 'nis'
          AND substring(a.business_code FROM 5 FOR 2) = OLD.nis_grade_code)
      OR EXISTS (SELECT 1 FROM public.students s
        WHERE s.tenant_id = OLD.tenant_id AND substring(s.nis FROM 5 FOR 2) = OLD.nis_grade_code)
      OR EXISTS (SELECT 1 FROM public.candidates c
        WHERE c.tenant_id = OLD.tenant_id AND substring(c.nis FROM 5 FOR 2) = OLD.nis_grade_code)
      OR EXISTS (SELECT 1 FROM public.nis_reservations n
        WHERE n.tenant_id = OLD.tenant_id AND substring(n.nis FROM 5 FOR 2) = OLD.nis_grade_code)
    ) THEN
    RAISE EXCEPTION 'Kode jenjang NIS tidak dapat diubah setelah nomor diterbitkan; nonaktifkan jenjang lama dan buat jenjang baru' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tenant_reference_nis_grade_code_guard ON public.tenant_reference_items;
CREATE TRIGGER tenant_reference_nis_grade_code_guard
  BEFORE INSERT OR UPDATE OF domain, status, nis_grade_code ON public.tenant_reference_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_reference_nis_grade_code();
REVOKE ALL ON FUNCTION public.guard_tenant_reference_nis_grade_code() FROM PUBLIC, anon, authenticated, service_role;

-- Constraint names from an earlier manual application are not stable: PostgreSQL
-- may assign the combined series/module check a generated suffix such as check1.
-- Replace only checks that govern series_key/module_id; preserve independent
-- display-name, description, and format validation constraints.
DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.tenant_naming_series'::REGCLASS
      AND contype = 'c'
      AND (
        pg_catalog.pg_get_constraintdef(oid) ILIKE '%series_key%'
        OR pg_catalog.pg_get_constraintdef(oid) ILIKE '%module_id%'
      )
  LOOP
    EXECUTE pg_catalog.format(
      'ALTER TABLE public.tenant_naming_series DROP CONSTRAINT %I',
      v_constraint.conname
    );
  END LOOP;
END;
$$;
ALTER TABLE public.tenant_naming_series
  ADD CONSTRAINT tenant_naming_series_series_key_check CHECK (series_key IN (
    'nis', 'ppdb_registration', 'employee_number', 'building_code', 'room_code', 'class_code'
  )),
  ADD CONSTRAINT tenant_naming_series_module_id_check CHECK (module_id IN ('master-data', 'ppdb', 'hris')),
  ADD CONSTRAINT tenant_naming_series_key_module_check CHECK (
    (series_key = 'nis' AND module_id = 'master-data')
    OR (series_key = 'ppdb_registration' AND module_id = 'ppdb')
    OR (series_key = 'employee_number' AND module_id = 'hris')
    OR (series_key IN ('building_code', 'room_code', 'class_code') AND module_id = 'master-data')
  );

CREATE OR REPLACE FUNCTION public.seed_tenant_structure_naming_series_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'active' THEN
    INSERT INTO public.tenant_naming_series (
      tenant_id, series_key, module_id, display_name, description, format_template,
      sequence_width, reset_period, start_number
    ) VALUES
      (NEW.id, 'building_code', 'master-data', 'Kode Gedung',
       'Kode unik gedung asrama atau fasilitas pada tenant ini.', 'GED-{{SEQ}}', 5, 'never', 1),
      (NEW.id, 'room_code', 'master-data', 'Kode Kamar',
       'Kode unik kamar asrama untuk relasi penempatan santri.', 'KMR-{{SEQ}}', 5, 'never', 1),
      (NEW.id, 'class_code', 'master-data', 'Kode Kelas',
       'Kode unik kelas akademik pada tenant ini.', 'KLS-{{SEQ}}', 5, 'never', 1)
    ON CONFLICT (tenant_id, series_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenants_seed_structure_naming_series_defaults
  AFTER INSERT OR UPDATE OF status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_structure_naming_series_defaults();
REVOKE ALL ON FUNCTION public.seed_tenant_structure_naming_series_defaults() FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.tenant_naming_series (
  tenant_id, series_key, module_id, display_name, description, format_template,
  sequence_width, reset_period, start_number
)
SELECT t.id, config.series_key, 'master-data', config.display_name, config.description,
  config.format_template, 5, 'never', 1
FROM public.tenants t
CROSS JOIN (VALUES
  ('building_code', 'Kode Gedung', 'Kode unik gedung asrama atau fasilitas pada tenant ini.', 'GED-{{SEQ}}'),
  ('room_code', 'Kode Kamar', 'Kode unik kamar asrama untuk relasi penempatan santri.', 'KMR-{{SEQ}}'),
  ('class_code', 'Kode Kelas', 'Kode unik kelas akademik pada tenant ini.', 'KLS-{{SEQ}}')
) AS config(series_key, display_name, description, format_template)
WHERE t.status = 'active'
ON CONFLICT (tenant_id, series_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_tenant_structure_naming_series(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_series_key TEXT,
  p_format_template TEXT,
  p_sequence_width SMALLINT,
  p_reset_period TEXT,
  p_start_number BIGINT,
  p_is_active BOOLEAN,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_series public.tenant_naming_series%ROWTYPE;
  v_existing public.tenant_naming_series_events%ROWTYPE;
  v_payload JSONB;
  v_sample TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_series_key IS NULL OR p_series_key NOT IN ('building_code', 'room_code', 'class_code')
    OR p_format_template IS NULL OR length(btrim(p_format_template)) NOT BETWEEN 1 AND 120
    OR p_sequence_width IS NULL OR p_sequence_width NOT BETWEEN 1 AND 12
    OR p_reset_period IS NULL OR p_reset_period NOT IN ('never', 'yearly', 'monthly')
    OR p_start_number IS NULL OR p_start_number < 1 OR p_start_number > 999999999999
    OR p_start_number > power(10::NUMERIC, p_sequence_width)::BIGINT - 1
    OR p_is_active IS NULL
    OR length(p_format_template) - length(replace(p_format_template, '{{SEQ}}', '')) <> 7
    OR p_format_template ~ '[[:cntrl:]]'
    OR replace(replace(replace(p_format_template, '{{YEAR}}', ''), '{{MONTH}}', ''), '{{SEQ}}', '') ~ '[{}]' THEN
    RAISE EXCEPTION 'Konfigurasi seri kode struktur tidak valid' USING ERRCODE = '22023';
  END IF;
  v_sample := replace(replace(p_format_template, '{{YEAR}}', '2026'), '{{MONTH}}', '11');
  v_sample := replace(v_sample, '{{SEQ}}', lpad('1', p_sequence_width, '0'));
  IF length(v_sample) > 40 OR v_sample !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'
    OR length(p_format_template) - length(replace(p_format_template, '{{YEAR}}', '')) > 8
    OR length(p_format_template) - length(replace(p_format_template, '{{MONTH}}', '')) > 9 THEN
    RAISE EXCEPTION 'Pola kode struktur harus menghasilkan 1–40 karakter yang didukung' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT role::TEXT, module_permissions INTO v_role, v_permissions
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
  FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin')
    OR (v_role <> 'super_admin' AND CASE
      WHEN v_permissions ? 'master-data' THEN
        jsonb_typeof(v_permissions -> 'master-data') = 'boolean'
        AND v_permissions ->> 'master-data' = 'true'
      ELSE v_role = 'admin'
    END IS NOT TRUE) THEN
    RAISE EXCEPTION 'Admin tenant dengan akses Data Induk diperlukan' USING ERRCODE = '42501';
  END IF;
  v_payload := jsonb_build_object(
    'formatTemplate', p_format_template, 'sequenceWidth', p_sequence_width,
    'resetPeriod', p_reset_period, 'startNumber', p_start_number, 'isActive', p_is_active
  );
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'naming-series-config:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing FROM public.tenant_naming_series_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.series_key IS DISTINCT FROM p_series_key
      OR v_existing.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'ID permintaan konfigurasi telah digunakan untuk perubahan lain' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('alreadyApplied', true, 'seriesKey', p_series_key);
  END IF;
  SELECT * INTO v_series FROM public.tenant_naming_series
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seri kode struktur belum diinisialisasi' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenant_naming_series
  SET format_template = p_format_template, sequence_width = p_sequence_width,
      reset_period = p_reset_period, start_number = p_start_number,
      is_active = p_is_active, updated_by_user_id = p_actor_user_id, updated_at = now()
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  INSERT INTO public.tenant_naming_series_events (
    tenant_id, client_request_id, series_key, actor_user_id, operation, payload
  ) VALUES (p_tenant_id, p_client_request_id, p_series_key, p_actor_user_id, 'updated', v_payload);
  IF v_series.start_number IS DISTINCT FROM p_start_number THEN
    UPDATE public.tenant_naming_series_counters
    SET last_value = GREATEST(last_value, p_start_number - 1), updated_at = now()
    WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  END IF;
  RETURN jsonb_build_object('alreadyApplied', false, 'seriesKey', p_series_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_tenant_structure_naming_series(
  p_tenant_id UUID,
  p_series_key TEXT,
  p_effective_date DATE
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_series public.tenant_naming_series%ROWTYPE;
  v_category TEXT;
  v_period_key TEXT;
  v_sequence BIGINT;
  v_code TEXT;
  v_year TEXT;
  v_month TEXT;
  v_attempt INTEGER;
  v_max_sequence BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_effective_date IS NULL OR p_series_key NOT IN ('building_code', 'room_code', 'class_code') THEN
    RAISE EXCEPTION 'Permintaan alokasi kode struktur tidak valid' USING ERRCODE = '22023';
  END IF;
  v_category := CASE p_series_key WHEN 'building_code' THEN 'Gedung' WHEN 'room_code' THEN 'Kamar' ELSE 'Kelas' END;
  SELECT * INTO v_series FROM public.tenant_naming_series
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seri kode struktur tidak aktif pada tenant ini' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  v_year := to_char(p_effective_date, 'YYYY');
  v_month := to_char(p_effective_date, 'MM');
  v_period_key := CASE v_series.reset_period
    WHEN 'yearly' THEN v_year WHEN 'monthly' THEN v_year || v_month ELSE 'all' END;
  v_max_sequence := least(v_series.start_number + 100000, power(10::NUMERIC, v_series.sequence_width)::BIGINT - 1);
  FOR v_attempt IN 1..100000 LOOP
    INSERT INTO public.tenant_naming_series_counters (tenant_id, series_key, period_key, last_value)
    VALUES (p_tenant_id, p_series_key, v_period_key, v_series.start_number)
    ON CONFLICT (tenant_id, series_key, period_key)
    DO UPDATE SET last_value = public.tenant_naming_series_counters.last_value + 1, updated_at = now()
    RETURNING last_value INTO v_sequence;
    IF v_sequence > power(10::NUMERIC, v_series.sequence_width)::BIGINT - 1 THEN
      RAISE EXCEPTION 'Nomor seri telah mencapai batas digit yang dikonfigurasi' USING ERRCODE = '23505';
    END IF;
    v_code := replace(replace(v_series.format_template, '{{YEAR}}', v_year), '{{MONTH}}', v_month);
    v_code := replace(v_code, '{{SEQ}}', lpad(v_sequence::TEXT, v_series.sequence_width, '0'));
    IF NOT EXISTS (
      SELECT 1 FROM public.master_data_records r
      WHERE r.tenant_id = p_tenant_id AND r.category = v_category AND r.id = v_code
    ) AND NOT EXISTS (
      SELECT 1 FROM public.tenant_naming_series_allocations a
      WHERE a.tenant_id = p_tenant_id AND a.series_key = p_series_key AND a.business_code = v_code
    ) THEN
      INSERT INTO public.tenant_naming_series_allocations (
        tenant_id, series_key, period_key, sequence_number, business_code
      ) VALUES (p_tenant_id, p_series_key, v_period_key, v_sequence, v_code);
      RETURN v_code;
    END IF;
    IF v_sequence >= v_max_sequence THEN EXIT; END IF;
  END LOOP;
  RAISE EXCEPTION 'Tidak ada kode struktur unik yang tersedia pada seri tenant ini' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_master_data_structure_auto_with_actor(
  p_tenant_id UUID,
  p_category TEXT,
  p_id TEXT,
  p_record JSONB,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_id TEXT;
  v_series_key TEXT;
  v_result JSONB;
BEGIN
  PERFORM public.validate_master_data_audit_actor(p_tenant_id, p_actor_user_id);
  IF p_category NOT IN ('Gedung', 'Kamar', 'Kelas') OR p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'Data struktur tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(btrim(COALESCE(p_id, '')), '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = p_category AND id = btrim(p_id) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Struktur tidak ditemukan untuk diperbarui' USING ERRCODE = 'P0002'; END IF;
  ELSE
    v_series_key := CASE p_category WHEN 'Gedung' THEN 'building_code' WHEN 'Kamar' THEN 'room_code' ELSE 'class_code' END;
    v_id := public.allocate_tenant_structure_naming_series(
      p_tenant_id, v_series_key, (now() AT TIME ZONE 'Asia/Jakarta')::DATE
    );
  END IF;
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.master_data_audit_source', 'master_data', true);
  v_result := public.upsert_master_data_structure(p_tenant_id, p_category, v_id, p_record);
  RETURN v_result || jsonb_build_object('identifierGenerated', NULLIF(btrim(COALESCE(p_id, '')), '') IS NULL);
END;
$$;

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
  v_current_nis TEXT;
BEGIN
  IF p_student_id IS NULL THEN
    v_grade := NULLIF(btrim(COALESCE(p_student->>'grade', '')), '');
    IF v_grade IS NULL THEN RAISE EXCEPTION 'Pilih jenjang tenant sebelum NIS dibuat' USING ERRCODE = '23503'; END IF;
    SELECT r.id, r.nis_grade_code INTO v_grade_reference, v_grade_code
    FROM public.tenant_reference_items r
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
    SELECT nis INTO v_current_nis FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_student_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
    v_student := jsonb_set(v_student, '{nis}', COALESCE(to_jsonb(v_current_nis), 'null'::JSONB), true);
  END IF;
  RETURN public.upsert_master_data_student_with_actor(
    p_tenant_id, p_student_id, p_source_record_id, v_student,
    p_nik_ciphertext_hex, p_nik_fingerprint_hex,
    p_nisn_ciphertext_hex, p_nisn_fingerprint_hex, p_actor_user_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_candidate_id UUID,
  p_nis TEXT,
  p_class_id TEXT,
  p_room_id TEXT,
  p_building_id TEXT,
  p_guardian_name TEXT,
  p_guardian_phone TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_nis TEXT;
  v_grade TEXT;
  v_grade_code TEXT;
  v_entry_date DATE := (now() AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  SELECT s.nis INTO v_nis
  FROM public.ppdb_onboarding_events e
  JOIN public.students s ON s.tenant_id = e.tenant_id AND s.id = e.student_id
  WHERE e.tenant_id = p_tenant_id AND e.client_request_id = p_client_request_id
    AND e.candidate_id = p_candidate_id;
  IF v_nis IS NULL THEN
    SELECT s.nis INTO v_nis
    FROM public.ppdb_onboarding_events e
    JOIN public.students s ON s.tenant_id = e.tenant_id AND s.id = e.student_id
    WHERE e.tenant_id = p_tenant_id AND e.candidate_id = p_candidate_id
    ORDER BY e.created_at, e.id LIMIT 1;
  END IF;
  IF v_nis IS NULL THEN
    SELECT c.grade,
      CASE WHEN c.onboarding_status = 'Completed' AND c.master_student_id IS NOT NULL THEN c.nis ELSE NULL END,
      COALESCE(by_id.nis_grade_code, by_name.nis_grade_code)
      INTO v_grade, v_nis, v_grade_code
    FROM public.candidates c
    LEFT JOIN public.tenant_reference_items by_id
      ON by_id.tenant_id = c.tenant_id AND by_id.domain = 'academic_grade_level'
      AND by_id.id = c.grade_level_reference_id
    LEFT JOIN public.tenant_reference_items by_name
      ON by_name.tenant_id = c.tenant_id AND by_name.domain = 'academic_grade_level'
      AND lower(btrim(by_name.name)) = lower(btrim(c.grade))
    WHERE c.tenant_id = p_tenant_id AND c.id = p_candidate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Calon santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
    IF v_nis IS NULL THEN
      IF v_grade_code IS NULL OR v_grade_code !~ '^[0-9]{2}$' THEN
        RAISE EXCEPTION 'Atur kode NIS dua digit pada jenjang calon santri sebelum penerimaan' USING ERRCODE = '23514';
      END IF;
      v_nis := public.allocate_tenant_naming_series(
        p_tenant_id, 'nis', v_entry_date,
        jsonb_build_object('grade', v_grade_code, 'exclude_candidate_id', p_candidate_id::TEXT)
      );
    END IF;
  END IF;
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'ppdb_onboarding', true);
  RETURN public.onboard_accepted_ppdb_candidate_for_admin(
    p_tenant_id, p_actor_user_id, p_candidate_id, v_nis, p_class_id,
    p_room_id, p_building_id, p_guardian_name, p_guardian_phone, p_client_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_tenant_structure_naming_series_defaults() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_tenant_structure_naming_series(UUID,UUID,TEXT,TEXT,SMALLINT,TEXT,BIGINT,BOOLEAN,UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.allocate_tenant_structure_naming_series(UUID,TEXT,DATE) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_master_data_structure_auto_with_actor(UUID,TEXT,TEXT,JSONB,UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_master_data_student_auto_nis_with_actor(UUID,UUID,TEXT,JSONB,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_tenant_structure_naming_series(UUID,UUID,TEXT,TEXT,SMALLINT,TEXT,BIGINT,BOOLEAN,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_tenant_structure_naming_series(UUID,TEXT,DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_master_data_structure_auto_with_actor(UUID,TEXT,TEXT,JSONB,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_master_data_student_auto_nis_with_actor(UUID,UUID,TEXT,JSONB,TEXT,TEXT,TEXT,TEXT,UUID) TO service_role;
REVOKE ALL ON FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID) TO service_role;

COMMIT;
