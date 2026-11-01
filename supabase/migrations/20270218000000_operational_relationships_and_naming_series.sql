-- Tenant-owned operational relationships and server-allocated business identifiers.
-- UUIDs remain immutable technical primary keys; these codes are unique display identifiers.
BEGIN;

ALTER TABLE public.student_room_assignment_history
  ADD COLUMN previous_room_category TEXT
    GENERATED ALWAYS AS (CASE WHEN previous_room_id IS NOT NULL THEN 'Kamar'::TEXT END) STORED,
  ADD COLUMN room_category TEXT
    GENERATED ALWAYS AS (CASE WHEN room_id IS NOT NULL THEN 'Kamar'::TEXT END) STORED,
  ADD COLUMN previous_building_category TEXT
    GENERATED ALWAYS AS (CASE WHEN previous_building_id IS NOT NULL THEN 'Gedung'::TEXT END) STORED,
  ADD COLUMN building_category TEXT
    GENERATED ALWAYS AS (CASE WHEN building_id IS NOT NULL THEN 'Gedung'::TEXT END) STORED;

ALTER TABLE public.student_room_assignment_history
  ADD CONSTRAINT student_room_history_previous_room_fk
    FOREIGN KEY (tenant_id, previous_room_id, previous_room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT student_room_history_room_fk
    FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT student_room_history_previous_building_fk
    FOREIGN KEY (tenant_id, previous_building_id, previous_building_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT student_room_history_building_fk
    FOREIGN KEY (tenant_id, building_id, building_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT student_room_history_changed_by_fk
    FOREIGN KEY (tenant_id, changed_by)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT NOT VALID;

-- Fail closed if old snapshots contain an unresolved reference. Keep their names intact;
-- an operator must map the source record before deploying this migration.
ALTER TABLE public.student_room_assignment_history
  VALIDATE CONSTRAINT student_room_history_previous_room_fk,
  VALIDATE CONSTRAINT student_room_history_room_fk,
  VALIDATE CONSTRAINT student_room_history_previous_building_fk,
  VALIDATE CONSTRAINT student_room_history_building_fk,
  VALIDATE CONSTRAINT student_room_history_changed_by_fk;

ALTER TABLE public.library_digital_asset_upload_requests
  ADD CONSTRAINT library_upload_request_tenant_request_asset_key
    UNIQUE (tenant_id, client_request_id, asset_id);

ALTER TABLE public.library_digital_assets
  ADD CONSTRAINT library_digital_asset_reservation_asset_fk
    FOREIGN KEY (tenant_id, client_request_id, id)
    REFERENCES public.library_digital_asset_upload_requests (tenant_id, client_request_id, asset_id)
    ON DELETE RESTRICT NOT VALID;
ALTER TABLE public.library_digital_assets
  VALIDATE CONSTRAINT library_digital_asset_reservation_asset_fk;

CREATE INDEX student_room_history_previous_room_fk_idx
  ON public.student_room_assignment_history (tenant_id, previous_room_id, previous_room_category)
  WHERE previous_room_id IS NOT NULL;
CREATE INDEX student_room_history_room_fk_idx
  ON public.student_room_assignment_history (tenant_id, room_id, room_category)
  WHERE room_id IS NOT NULL;
CREATE INDEX student_room_history_previous_building_fk_idx
  ON public.student_room_assignment_history (tenant_id, previous_building_id, previous_building_category)
  WHERE previous_building_id IS NOT NULL;
CREATE INDEX student_room_history_building_fk_idx
  ON public.student_room_assignment_history (tenant_id, building_id, building_category)
  WHERE building_id IS NOT NULL;
CREATE INDEX student_room_history_changed_by_fk_idx
  ON public.student_room_assignment_history (tenant_id, changed_by)
  WHERE changed_by IS NOT NULL;
CREATE INDEX library_digital_assets_reservation_asset_fk_idx
  ON public.library_digital_assets (tenant_id, client_request_id, id);

CREATE TABLE public.tenant_naming_series (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  series_key TEXT NOT NULL CHECK (series_key IN ('nis', 'ppdb_registration', 'employee_number')),
  module_id TEXT NOT NULL CHECK (module_id IN ('master-data', 'ppdb', 'hris')),
  display_name TEXT NOT NULL CHECK (length(btrim(display_name)) BETWEEN 2 AND 100),
  description TEXT NOT NULL CHECK (
    length(btrim(description)) BETWEEN 8 AND 500
    AND lower(btrim(description)) <> lower(btrim(display_name))
  ),
  format_template TEXT NOT NULL CHECK (
    length(btrim(format_template)) BETWEEN 1 AND 120
    AND format_template !~ '[[:cntrl:]]'
    AND length(format_template) - length(replace(format_template, '{{SEQ}}', '')) = 7
    AND replace(replace(replace(replace(format_template, '{{YEAR}}', ''), '{{MONTH}}', ''), '{{GRADE}}', ''), '{{SEQ}}', '') !~ '[{}]'
  ),
  sequence_width SMALLINT NOT NULL CHECK (sequence_width BETWEEN 1 AND 12),
  reset_period TEXT NOT NULL CHECK (reset_period IN ('never', 'yearly', 'monthly')),
  start_number BIGINT NOT NULL CHECK (start_number BETWEEN 1 AND 999999999999),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_user_id UUID,
  updated_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, series_key),
  CHECK (
    (series_key = 'nis' AND module_id = 'master-data')
    OR (series_key = 'ppdb_registration' AND module_id = 'ppdb')
    OR (series_key = 'employee_number' AND module_id = 'hris')
  ),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.tenant_naming_series_counters (
  tenant_id UUID NOT NULL,
  series_key TEXT NOT NULL,
  period_key TEXT NOT NULL CHECK (length(period_key) BETWEEN 1 AND 64),
  last_value BIGINT NOT NULL CHECK (last_value >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, series_key, period_key),
  FOREIGN KEY (tenant_id, series_key)
    REFERENCES public.tenant_naming_series (tenant_id, series_key) ON DELETE RESTRICT
);

CREATE TABLE public.tenant_naming_series_allocations (
  tenant_id UUID NOT NULL,
  series_key TEXT NOT NULL,
  period_key TEXT NOT NULL,
  sequence_number BIGINT NOT NULL CHECK (sequence_number > 0),
  business_code TEXT NOT NULL CHECK (length(btrim(business_code)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, series_key, period_key, sequence_number),
  UNIQUE (tenant_id, series_key, business_code),
  FOREIGN KEY (tenant_id, series_key, period_key)
    REFERENCES public.tenant_naming_series_counters (tenant_id, series_key, period_key) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, series_key)
    REFERENCES public.tenant_naming_series (tenant_id, series_key) ON DELETE RESTRICT
);

CREATE TABLE public.tenant_naming_series_events (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  series_key TEXT NOT NULL,
  actor_user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('created', 'updated')),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, series_key)
    REFERENCES public.tenant_naming_series (tenant_id, series_key) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX tenant_naming_series_created_by_fk_idx
  ON public.tenant_naming_series (tenant_id, created_by_user_id)
  WHERE created_by_user_id IS NOT NULL;
CREATE INDEX tenant_naming_series_updated_by_fk_idx
  ON public.tenant_naming_series (tenant_id, updated_by_user_id)
  WHERE updated_by_user_id IS NOT NULL;
CREATE INDEX tenant_naming_series_events_series_fk_idx
  ON public.tenant_naming_series_events (tenant_id, series_key);
CREATE INDEX tenant_naming_series_events_actor_fk_idx
  ON public.tenant_naming_series_events (tenant_id, actor_user_id);

ALTER TABLE public.tenant_naming_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_naming_series FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_naming_series_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_naming_series_counters FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_naming_series_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_naming_series_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_naming_series_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_naming_series_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_naming_series, public.tenant_naming_series_counters,
  public.tenant_naming_series_allocations, public.tenant_naming_series_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_naming_series,
  public.tenant_naming_series_counters TO service_role;
GRANT SELECT, INSERT ON TABLE public.tenant_naming_series_allocations,
  public.tenant_naming_series_events TO service_role;

CREATE TRIGGER tenant_naming_series_set_updated_at
  BEFORE UPDATE ON public.tenant_naming_series
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.seed_tenant_naming_series_defaults()
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
      (NEW.id, 'nis', 'master-data', 'Nomor Induk Santri',
       'Nomor unik santri yang dibuat saat onboarding PPDB diterima.',
       '{{YEAR}}{{GRADE}}{{SEQ}}', 4, 'yearly', 1),
      (NEW.id, 'ppdb_registration', 'ppdb', 'Nomor Pendaftaran PPDB',
       'Nomor unik pendaftar untuk satu tahun penerimaan santri baru.',
       'PPDB-{{YEAR}}-{{SEQ}}', 6, 'yearly', 1),
      (NEW.id, 'employee_number', 'hris', 'Nomor Pegawai',
       'Nomor identitas pegawai untuk data kepegawaian tenant.',
       'PEG-{{YEAR}}-{{SEQ}}', 5, 'yearly', 1)
    ON CONFLICT (tenant_id, series_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenants_seed_naming_series_defaults
  AFTER INSERT OR UPDATE OF status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_naming_series_defaults();
REVOKE ALL ON FUNCTION public.seed_tenant_naming_series_defaults() FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.tenant_naming_series (
  tenant_id, series_key, module_id, display_name, description, format_template,
  sequence_width, reset_period, start_number
)
SELECT t.id, config.series_key, config.module_id, config.display_name, config.description,
  config.format_template, config.sequence_width, config.reset_period, config.start_number
FROM public.tenants AS t
CROSS JOIN (VALUES
  ('nis', 'master-data', 'Nomor Induk Santri', 'Nomor unik santri yang dibuat saat onboarding PPDB diterima.', '{{YEAR}}{{GRADE}}{{SEQ}}', 4::SMALLINT, 'yearly', 1::BIGINT),
  ('ppdb_registration', 'ppdb', 'Nomor Pendaftaran PPDB', 'Nomor unik pendaftar untuk satu tahun penerimaan santri baru.', 'PPDB-{{YEAR}}-{{SEQ}}', 6::SMALLINT, 'yearly', 1::BIGINT),
  ('employee_number', 'hris', 'Nomor Pegawai', 'Nomor identitas pegawai untuk data kepegawaian tenant.', 'PEG-{{YEAR}}-{{SEQ}}', 5::SMALLINT, 'yearly', 1::BIGINT)
) AS config(series_key, module_id, display_name, description, format_template, sequence_width, reset_period, start_number)
WHERE t.status = 'active'
ON CONFLICT (tenant_id, series_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.save_tenant_naming_series(
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
  v_operation TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_series_key IS NULL OR p_series_key NOT IN ('nis', 'ppdb_registration', 'employee_number')
    OR p_format_template IS NULL OR length(btrim(p_format_template)) NOT BETWEEN 1 AND 120
    OR p_sequence_width IS NULL OR p_sequence_width NOT BETWEEN 1 AND 12
    OR p_reset_period NOT IN ('never', 'yearly', 'monthly')
    OR p_start_number IS NULL OR p_start_number < 1 OR p_start_number > 999999999999
    OR p_start_number > power(10::NUMERIC, p_sequence_width)::BIGINT - 1
    OR p_is_active IS NULL
    OR p_reset_period IS NULL
    OR length(p_format_template) - length(replace(p_format_template, '{{SEQ}}', '')) <> 7
    OR p_format_template ~ '[[:cntrl:]]'
    OR replace(replace(replace(replace(p_format_template, '{{YEAR}}', ''), '{{MONTH}}', ''), '{{GRADE}}', ''), '{{SEQ}}', '') ~ '[{}]' THEN
    RAISE EXCEPTION 'Konfigurasi seri penomoran tidak valid' USING ERRCODE = '22023';
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

  IF p_series_key = 'nis' THEN
    v_sample := replace(replace(replace(p_format_template, '{{YEAR}}', '2026'), '{{GRADE}}', '01'), '{{SEQ}}', lpad('1', p_sequence_width, '0'));
    IF p_sequence_width <> 4 OR p_reset_period <> 'yearly'
      OR length(p_format_template) - length(replace(p_format_template, '{{YEAR}}', '')) <> 8
      OR length(p_format_template) - length(replace(p_format_template, '{{GRADE}}', '')) <> 9
      OR position('{{MONTH}}' IN p_format_template) > 0
      OR v_sample !~ '^[0-9]{10}$'
      OR p_start_number > 9999 THEN
      RAISE EXCEPTION 'Aturan NIS harus tetap menghasilkan 10 digit: tahun, kode jenjang, dan 4 digit urut tahunan' USING ERRCODE = '22023';
    END IF;
  ELSIF p_series_key = 'ppdb_registration' THEN
    v_sample := replace(replace(p_format_template, '{{YEAR}}', '2026'), '{{SEQ}}', lpad('1', p_sequence_width, '0'));
    IF length(p_format_template) - length(replace(p_format_template, '{{YEAR}}', '')) <> 8
      OR position('{{GRADE}}' IN p_format_template) > 0 OR position('{{MONTH}}' IN p_format_template) > 0
      OR p_reset_period NOT IN ('never', 'yearly') OR length(v_sample) > 50
      OR v_sample !~ '^[A-Za-z0-9][A-Za-z0-9./-]{0,49}$' THEN
      RAISE EXCEPTION 'Aturan nomor PPDB harus memakai tahun dan nomor urut, maksimal 50 karakter' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_sample := replace(replace(replace(p_format_template, '{{YEAR}}', '2026'), '{{MONTH}}', '01'), '{{SEQ}}', lpad('1', p_sequence_width, '0'));
    IF position('{{GRADE}}' IN p_format_template) > 0 OR length(v_sample) > 40
      OR v_sample !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$' THEN
      RAISE EXCEPTION 'Aturan nomor pegawai mengandung karakter yang tidak didukung atau melebihi 40 karakter' USING ERRCODE = '22023';
    END IF;
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
    SELECT * INTO v_series FROM public.tenant_naming_series
    WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
    RETURN jsonb_build_object('alreadyApplied', true, 'seriesKey', v_series.series_key);
  END IF;

  SELECT * INTO v_series FROM public.tenant_naming_series
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seri penomoran belum diinisialisasi untuk tenant' USING ERRCODE = 'P0002'; END IF;
  v_operation := CASE
    WHEN v_series.format_template = p_format_template
      AND v_series.sequence_width = p_sequence_width
      AND v_series.reset_period = p_reset_period
      AND v_series.start_number = p_start_number
      AND v_series.is_active = p_is_active THEN 'updated'
    ELSE 'updated'
  END;

  UPDATE public.tenant_naming_series
  SET format_template = p_format_template,
      sequence_width = p_sequence_width,
      reset_period = p_reset_period,
      start_number = p_start_number,
      is_active = p_is_active,
      updated_by_user_id = p_actor_user_id,
      updated_at = now()
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  INSERT INTO public.tenant_naming_series_events (
    tenant_id, client_request_id, series_key, actor_user_id, operation, payload
  ) VALUES (p_tenant_id, p_client_request_id, p_series_key, p_actor_user_id, v_operation, v_payload);
  IF v_series.start_number IS DISTINCT FROM p_start_number THEN
    -- Raising the start number skips unused slots but never reuses an issued value.
    UPDATE public.tenant_naming_series_counters
    SET last_value = GREATEST(last_value, p_start_number - 1), updated_at = now()
    WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  END IF;
  RETURN jsonb_build_object('alreadyApplied', false, 'seriesKey', p_series_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_tenant_naming_series(
  p_tenant_id UUID,
  p_series_key TEXT,
  p_effective_date DATE,
  p_context JSONB DEFAULT '{}'::JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_series public.tenant_naming_series%ROWTYPE;
  v_period_key TEXT;
  v_grade TEXT;
  v_exclude_candidate UUID;
  v_sequence BIGINT;
  v_max_sequence BIGINT;
  v_code TEXT;
  v_available BOOLEAN;
  v_attempt INTEGER;
  v_year TEXT;
  v_month TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_series_key IS NULL OR p_series_key NOT IN ('nis', 'ppdb_registration', 'employee_number')
    OR p_effective_date IS NULL OR jsonb_typeof(COALESCE(p_context, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'Permintaan alokasi nomor tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_series FROM public.tenant_naming_series
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key AND is_active
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seri penomoran tidak aktif pada tenant ini' USING ERRCODE = '23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF p_series_key = 'nis' THEN
    v_grade := NULLIF(btrim(COALESCE(p_context->>'grade', '')), '');
    IF v_grade IS NULL OR v_grade !~ '^[0-9]{2}$' THEN
      RAISE EXCEPTION 'Kode jenjang dua digit diperlukan untuk membuat NIS' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(p_context->>'exclude_candidate_id', '') IS NOT NULL THEN
      IF p_context->>'exclude_candidate_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'ID calon santri pengecualian tidak valid' USING ERRCODE = '22023';
      END IF;
      v_exclude_candidate := (p_context->>'exclude_candidate_id')::UUID;
    END IF;
  END IF;
  v_year := to_char(p_effective_date, 'YYYY');
  v_month := to_char(p_effective_date, 'MM');
  v_period_key := CASE v_series.reset_period
    WHEN 'yearly' THEN v_year
    WHEN 'monthly' THEN v_year || v_month
    ELSE 'all'
  END;
  IF p_series_key = 'nis' THEN v_period_key := v_period_key || ':GRADE=' || v_grade; END IF;

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
    v_code := replace(v_series.format_template, '{{YEAR}}', v_year);
    v_code := replace(v_code, '{{MONTH}}', v_month);
    v_code := replace(v_code, '{{GRADE}}', COALESCE(v_grade, ''));
    v_code := replace(v_code, '{{SEQ}}', lpad(v_sequence::TEXT, v_series.sequence_width, '0'));

    v_available := CASE p_series_key
      WHEN 'nis' THEN
        NOT EXISTS (SELECT 1 FROM public.students s WHERE s.tenant_id = p_tenant_id AND s.nis = v_code)
        AND NOT EXISTS (SELECT 1 FROM public.nis_reservations r WHERE r.tenant_id = p_tenant_id AND r.nis = v_code)
        AND NOT EXISTS (SELECT 1 FROM public.candidates c WHERE c.tenant_id = p_tenant_id
          AND c.id IS DISTINCT FROM v_exclude_candidate AND c.nis = v_code)
      WHEN 'ppdb_registration' THEN
        NOT EXISTS (SELECT 1 FROM public.candidates c WHERE c.tenant_id = p_tenant_id
          AND upper(btrim(c.registration_id)) = upper(v_code))
      ELSE
        NOT EXISTS (SELECT 1 FROM public.hris_employees e WHERE e.tenant_id = p_tenant_id
          AND lower(btrim(e.employee_number)) = lower(v_code))
    END;
    IF v_available AND NOT EXISTS (
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
  RAISE EXCEPTION 'Tidak ada nomor unik yang tersedia pada seri tenant ini' USING ERRCODE = '23505';
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_library_upload_request_asset_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'completed' AND NOT EXISTS (
    SELECT 1 FROM public.library_digital_assets a
    WHERE a.tenant_id = NEW.tenant_id AND a.client_request_id = NEW.client_request_id AND a.id = NEW.asset_id
  ) THEN
    RAISE EXCEPTION 'Permintaan upload selesai harus memiliki aset dengan ID yang sama' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER library_upload_request_completed_asset_check
  AFTER INSERT OR UPDATE OF status ON public.library_digital_asset_upload_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_library_upload_request_asset_consistency();

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
  v_registration_id TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR p_admission_year NOT BETWEEN 2000 AND 2200
    OR jsonb_typeof(p_candidate) <> 'object'
    OR jsonb_typeof(p_document_paths) <> 'object' THEN
    RAISE EXCEPTION 'Invalid PPDB payload' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_document_paths ? 'kk') OR NOT (p_document_paths ? 'birthCertificate') OR NOT (p_document_paths ? 'pasPhoto') THEN
    RAISE EXCEPTION 'Required PPDB documents are missing' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each_text(p_document_paths) AS item(key, value)
    WHERE item.key NOT IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')
      OR item.value NOT LIKE p_tenant_id::TEXT || '/' || p_candidate_id::TEXT || '/%'
  ) THEN RAISE EXCEPTION 'Invalid PPDB document path' USING ERRCODE = '22023'; END IF;

  v_registration_id := public.allocate_tenant_naming_series(
    p_tenant_id, 'ppdb_registration', make_date(p_admission_year, 1, 1), '{}'::JSONB
  );
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
    p_tenant_id, p_candidate_id, true, true, p_document_paths ? 'reportCards',
    p_document_paths ? 'ijazah', p_document_paths ? 'skhun', true,
    p_document_paths->>'kk', p_document_paths->>'birthCertificate', p_document_paths->>'reportCards',
    p_document_paths->>'ijazah', p_document_paths->>'skhun', p_document_paths->>'pasPhoto'
  );
  RETURN jsonb_build_object('id', p_candidate_id, 'registrationId', v_registration_id);
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
  v_normalized_grade TEXT;
  v_entry_date DATE := (now() AT TIME ZONE 'Asia/Jakarta')::DATE;
BEGIN
  -- The caller's NIS is ignored. A completed retry reuses its committed number;
  -- a new onboarding allocates and reserves one in this same transaction.
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
    SELECT c.grade, c.nis INTO v_grade, v_nis
    FROM public.candidates c
    WHERE c.tenant_id = p_tenant_id AND c.id = p_candidate_id
      AND c.onboarding_status = 'Completed' AND c.master_student_id IS NOT NULL;
  END IF;
  IF v_nis IS NULL THEN
    SELECT c.grade INTO v_grade FROM public.candidates c
    WHERE c.tenant_id = p_tenant_id AND c.id = p_candidate_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Calon santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
    v_normalized_grade := regexp_replace(upper(COALESCE(v_grade, '')), '[^A-Z0-9]', '', 'g');
    IF v_normalized_grade LIKE '%SD%' OR v_normalized_grade LIKE '%MI%' OR v_normalized_grade LIKE '%IBTIDAIYAH%' THEN
      v_grade_code := '01';
    ELSIF v_normalized_grade LIKE '%SMA%' OR v_normalized_grade LIKE '%SMK%' OR v_normalized_grade LIKE '%ALIYAH%'
      OR upper(COALESCE(v_grade, '')) ~ '(^|[^A-Z])MA([^A-Z]|$)' THEN
      v_grade_code := '03';
    ELSE
      v_grade_code := '02';
    END IF;
    v_nis := public.allocate_tenant_naming_series(
      p_tenant_id, 'nis', v_entry_date,
      jsonb_build_object('grade', v_grade_code, 'exclude_candidate_id', p_candidate_id::TEXT)
    );
  END IF;
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'ppdb_onboarding', true);
  RETURN public.onboard_accepted_ppdb_candidate_for_admin(
    p_tenant_id, p_actor_user_id, p_candidate_id, v_nis, p_class_id,
    p_room_id, p_building_id, p_guardian_name, p_guardian_phone, p_client_request_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin_ppdb_candidates_batch(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_payload_fingerprint TEXT,
  p_candidates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_existing public.ppdb_candidate_creation_requests%ROWTYPE;
  v_item JSONB;
  v_candidate_id UUID;
  v_registration_id TEXT;
  v_created JSONB;
  v_results JSONB := '[]'::JSONB;
  v_response JSONB;
  v_row_count BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[0-9a-fA-F]{64}$'
    OR p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array'
    OR jsonb_array_length(p_candidates) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid PPDB candidate batch input' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501'; END IF;
  SELECT profile.role INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_actor_user_id AND profile.status = 'active'
    AND profile.role IN ('admin', 'super_admin') AND profile.role = p_expected_role
    AND (profile.role = 'super_admin' OR NOT (profile.module_permissions ? 'ppdb')
      OR (jsonb_typeof(profile.module_permissions -> 'ppdb') = 'boolean' AND profile.module_permissions ->> 'ppdb' = 'true'))
  FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Active Admin PPDB permission is required' USING ERRCODE = '42501'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item->'candidate') IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item->'workflowData', '{}'::JSONB)) IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item->'documents', '{}'::JSONB)) IS DISTINCT FROM 'object'
      OR length(COALESCE(v_item->>'registrationId', '')) > 50 THEN
      RAISE EXCEPTION 'Invalid PPDB candidate record in batch' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  PERFORM pg_advisory_xact_lock(hashtextextended('ppdb-candidate-create:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_existing FROM public.ppdb_candidate_creation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id OR v_existing.payload_fingerprint <> decode(p_payload_fingerprint, 'hex') THEN
      RAISE EXCEPTION 'PPDB request ID was already used for a different actor or payload' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.response || jsonb_build_object('alreadyApplied', true);
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
    v_candidate_id := (v_item->>'candidateId')::UUID;
    v_registration_id := NULLIF(btrim(COALESCE(v_item->>'registrationId', '')), '');
    IF v_registration_id IS NULL THEN
      v_registration_id := public.allocate_tenant_naming_series(
        p_tenant_id, 'ppdb_registration', (now() AT TIME ZONE 'Asia/Jakarta')::DATE, '{}'::JSONB
      );
    END IF;
    v_created := public.create_admin_ppdb_candidate(
      p_tenant_id, v_candidate_id, v_registration_id, v_item->'candidate',
      COALESCE(v_item->'workflowData', '{}'::JSONB), COALESCE(v_item->'documents', '{}'::JSONB)
    );
    UPDATE public.candidates SET created_by_user_id = p_actor_user_id
    WHERE tenant_id = p_tenant_id AND id = v_candidate_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN RAISE EXCEPTION 'Created candidate attribution could not be saved' USING ERRCODE = '23503'; END IF;
    v_results := v_results || jsonb_build_array(v_created);
  END LOOP;
  v_response := jsonb_build_object('alreadyApplied', false, 'requestId', p_client_request_id, 'candidates', v_results);
  INSERT INTO public.ppdb_candidate_creation_requests (
    tenant_id, client_request_id, actor_user_id, payload_fingerprint, response
  ) VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, decode(p_payload_fingerprint, 'hex'), v_response);
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hris_employee(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_employee_id UUID,
  p_employee_number TEXT,
  p_full_name TEXT,
  p_job_title TEXT,
  p_department TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_hire_date DATE,
  p_employment_status TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_employee_events%ROWTYPE;
  v_employee public.hris_employees%ROWTYPE;
  v_employee_number TEXT;
  v_email TEXT := NULLIF(lower(btrim(p_email)), '');
  v_phone TEXT := NULLIF(btrim(p_phone), '');
  v_existing_found BOOLEAN := false;
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_employee_id IS NULL OR p_client_request_id IS NULL
    OR (NULLIF(btrim(COALESCE(p_employee_number, '')), '') IS NOT NULL
      AND btrim(p_employee_number) !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$')
    OR p_full_name IS NULL OR length(btrim(p_full_name)) NOT BETWEEN 2 AND 180
    OR p_job_title IS NULL OR length(btrim(p_job_title)) NOT BETWEEN 1 AND 120
    OR p_department IS NULL OR length(btrim(p_department)) NOT BETWEEN 1 AND 120
    OR p_employment_status IS NULL OR p_employment_status NOT IN ('active', 'on_leave', 'inactive', 'terminated')
    OR (v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    OR (v_phone IS NOT NULL AND length(v_phone) NOT BETWEEN 5 AND 40) THEN
    RAISE EXCEPTION 'Data pegawai tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hris-employee-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_employee_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.employee_id <> p_employee_id THEN
      RAISE EXCEPTION 'ID permintaan pegawai telah digunakan untuk operasi lain' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_employee FROM public.hris_employees
    WHERE tenant_id = p_tenant_id AND id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pegawai tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    IF (NULLIF(btrim(COALESCE(p_employee_number, '')), '') IS NOT NULL
        AND v_employee.employee_number IS DISTINCT FROM btrim(p_employee_number))
      OR v_employee.full_name IS DISTINCT FROM btrim(p_full_name)
      OR v_employee.job_title IS DISTINCT FROM btrim(p_job_title)
      OR v_employee.department IS DISTINCT FROM btrim(p_department)
      OR v_employee.email IS DISTINCT FROM v_email
      OR v_employee.phone IS DISTINCT FROM v_phone
      OR v_employee.hire_date IS DISTINCT FROM p_hire_date
      OR v_employee.employment_status IS DISTINCT FROM p_employment_status THEN
      RAISE EXCEPTION 'Pegawai berubah setelah permintaan awal; muat ulang sebelum mencoba lagi' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_employee.id, 'employeeNumber', v_employee.employee_number, 'replayed', true);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('hris-employee:' || p_tenant_id::TEXT || ':' || p_employee_id::TEXT, 0));
  SELECT * INTO v_employee FROM public.hris_employees
  WHERE tenant_id = p_tenant_id AND id = p_employee_id FOR UPDATE;
  v_existing_found := FOUND;
  IF v_existing_found THEN
    IF NULLIF(btrim(COALESCE(p_employee_number, '')), '') IS NOT NULL
      AND v_employee.employee_number IS DISTINCT FROM btrim(p_employee_number) THEN
      RAISE EXCEPTION 'Nomor pegawai dibuat otomatis dan tidak dapat diubah' USING ERRCODE = '23514';
    END IF;
    v_employee_number := v_employee.employee_number;
  ELSE
    v_employee_number := NULLIF(btrim(COALESCE(p_employee_number, '')), '');
    IF v_employee_number IS NULL THEN
      v_employee_number := public.allocate_tenant_naming_series(
        p_tenant_id, 'employee_number', COALESCE(p_hire_date, (now() AT TIME ZONE 'Asia/Jakarta')::DATE), '{}'::JSONB
      );
    END IF;
  END IF;
  INSERT INTO public.hris_employees (
    id, tenant_id, employee_number, full_name, job_title, department, email, phone, hire_date,
    employment_status, created_by_user_id, updated_by_user_id
  ) VALUES (
    p_employee_id, p_tenant_id, v_employee_number, btrim(p_full_name), btrim(p_job_title), btrim(p_department),
    v_email, v_phone, p_hire_date, p_employment_status, p_actor_user_id, p_actor_user_id
  )
  ON CONFLICT (tenant_id, id) DO UPDATE SET
    full_name = EXCLUDED.full_name, job_title = EXCLUDED.job_title, department = EXCLUDED.department,
    email = EXCLUDED.email, phone = EXCLUDED.phone, hire_date = EXCLUDED.hire_date,
    employment_status = EXCLUDED.employment_status, updated_by_user_id = p_actor_user_id, updated_at = now()
  RETURNING * INTO v_employee;
  INSERT INTO public.hris_employee_events (tenant_id, employee_id, actor_user_id, client_request_id)
  VALUES (p_tenant_id, v_employee.id, p_actor_user_id, p_client_request_id);
  RETURN jsonb_build_object('id', v_employee.id, 'employeeNumber', v_employee.employee_number, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.save_tenant_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_tenant_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.allocate_tenant_naming_series(UUID, TEXT, DATE, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_tenant_naming_series(UUID, TEXT, DATE, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION public.enforce_library_upload_request_asset_consistency()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.submit_public_ppdb(UUID, UUID, SMALLINT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_ppdb(UUID, UUID, SMALLINT, JSONB, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.create_admin_ppdb_candidates_batch(UUID, UUID, TEXT, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_ppdb_candidates_batch(UUID, UUID, TEXT, UUID, TEXT, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION public.upsert_hris_employee(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hris_employee(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID)
  TO service_role;

COMMENT ON TABLE public.tenant_naming_series IS
  'Tenant-owned business-number formats. UUID primary keys remain the immutable technical identifiers.';
COMMENT ON TABLE public.tenant_naming_series_allocations IS
  'Transactional, tenant-scoped ledger of generated business identifiers; numbers are never reused after a committed allocation.';
COMMENT ON COLUMN public.tenant_naming_series.format_template IS
  'Allowed tokens: {{YEAR}}, {{MONTH}}, {{GRADE}}, and exactly one {{SEQ}}. Each consumer validates its own number format.';

COMMIT;
