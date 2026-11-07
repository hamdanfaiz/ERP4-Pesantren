-- Extend tenant Naming Series to business identifiers in documents, finance, and GA.
-- UUIDs stay as immutable technical keys; imported historical codes are preserved.
BEGIN;

-- Replace only allowlist checks. Keep the table's independent format/name checks.
DO $$
DECLARE v_constraint RECORD;
BEGIN
  FOR v_constraint IN
    SELECT conname FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.tenant_naming_series'::REGCLASS AND contype = 'c'
      AND (pg_catalog.pg_get_constraintdef(oid) ILIKE '%series_key%'
        OR pg_catalog.pg_get_constraintdef(oid) ILIKE '%module_id%')
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE public.tenant_naming_series DROP CONSTRAINT %I', v_constraint.conname);
  END LOOP;
END;
$$;

ALTER TABLE public.tenant_naming_series
  ADD CONSTRAINT tenant_naming_series_series_key_check CHECK (series_key IN (
    'nis', 'ppdb_registration', 'employee_number', 'building_code', 'room_code', 'class_code',
    'document_number', 'finance_receipt', 'asset_code', 'inventory_item_code'
  )),
  ADD CONSTRAINT tenant_naming_series_module_id_check CHECK (
    module_id IN ('master-data', 'ppdb', 'hris', 'document', 'finance', 'ga')
  ),
  ADD CONSTRAINT tenant_naming_series_key_module_check CHECK (
    (series_key = 'nis' AND module_id = 'master-data')
    OR (series_key = 'ppdb_registration' AND module_id = 'ppdb')
    OR (series_key = 'employee_number' AND module_id = 'hris')
    OR (series_key IN ('building_code', 'room_code', 'class_code') AND module_id = 'master-data')
    OR (series_key = 'document_number' AND module_id = 'document')
    OR (series_key = 'finance_receipt' AND module_id = 'finance')
    OR (series_key IN ('asset_code', 'inventory_item_code') AND module_id = 'ga')
  );

-- A request can be retried after a network failure without consuming another number.
ALTER TABLE public.tenant_naming_series_allocations
  ADD COLUMN client_request_id UUID;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tenant_naming_series_allocations
    GROUP BY tenant_id, series_key, lower(btrim(business_code)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Alokasi nomor tenant duplikat setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
END;
$$;
CREATE UNIQUE INDEX tenant_naming_series_allocation_request_uq
  ON public.tenant_naming_series_allocations (tenant_id, series_key, client_request_id)
  WHERE client_request_id IS NOT NULL;
CREATE UNIQUE INDEX tenant_naming_series_allocation_normalized_code_uq
  ON public.tenant_naming_series_allocations (tenant_id, series_key, lower(btrim(business_code)));

-- Refuse deployment if legacy codes already collide after trimming/case normalization.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ga_facilities GROUP BY tenant_id, lower(btrim(asset_code)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Kode aset tenant duplikat setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.ga_inventory_items GROUP BY tenant_id, lower(btrim(item_code)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Kode inventaris tenant duplikat setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_bills WHERE receipt_no IS NOT NULL GROUP BY tenant_id, lower(btrim(receipt_no)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Nomor kuitansi tagihan tenant duplikat setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.finance_ledger WHERE receipt_no IS NOT NULL GROUP BY tenant_id, lower(btrim(receipt_no)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Nomor kuitansi buku besar tenant duplikat setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.document_records GROUP BY tenant_id, lower(btrim(document_number)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Nomor dokumen tenant duplikat setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
END;
$$;

CREATE UNIQUE INDEX ga_facilities_tenant_asset_code_normalized_uq
  ON public.ga_facilities (tenant_id, lower(btrim(asset_code)));
CREATE UNIQUE INDEX ga_inventory_tenant_item_code_normalized_uq
  ON public.ga_inventory_items (tenant_id, lower(btrim(item_code)));
CREATE UNIQUE INDEX finance_bills_tenant_receipt_normalized_uq
  ON public.finance_bills (tenant_id, lower(btrim(receipt_no))) WHERE receipt_no IS NOT NULL;
CREATE UNIQUE INDEX finance_ledger_tenant_receipt_normalized_uq
  ON public.finance_ledger (tenant_id, lower(btrim(receipt_no))) WHERE receipt_no IS NOT NULL;
CREATE UNIQUE INDEX document_records_tenant_number_normalized_uq
  ON public.document_records (tenant_id, lower(btrim(document_number)));

CREATE OR REPLACE FUNCTION public.seed_tenant_extended_naming_series_defaults()
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
      (NEW.id, 'document_number', 'document', 'Nomor Dokumen',
       'Nomor unik surat masuk, surat keluar, dan dokumen internal tenant.', 'DOC/{{YEAR}}/{{SEQ}}', 5, 'yearly', 1),
      (NEW.id, 'finance_receipt', 'finance', 'Nomor Kuitansi',
       'Nomor unik bukti pelunasan yang diterbitkan pada buku keuangan tenant.', 'KWT/{{YEAR}}/{{SEQ}}', 6, 'yearly', 1),
      (NEW.id, 'asset_code', 'ga', 'Kode Aset',
       'Kode unik aset tetap yang diterbitkan backend pada saat pendaftaran.', 'AST-{{SEQ}}', 5, 'never', 1),
      (NEW.id, 'inventory_item_code', 'ga', 'Kode Inventaris',
       'Kode unik barang persediaan yang diterbitkan backend saat pencatatan.', 'BRG-{{SEQ}}', 5, 'never', 1)
    ON CONFLICT (tenant_id, series_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tenants_seed_extended_naming_series_defaults
  AFTER INSERT OR UPDATE OF status ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_extended_naming_series_defaults();
REVOKE ALL ON FUNCTION public.seed_tenant_extended_naming_series_defaults()
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.tenant_naming_series (
  tenant_id, series_key, module_id, display_name, description, format_template,
  sequence_width, reset_period, start_number
)
SELECT t.id, config.series_key, config.module_id, config.display_name, config.description,
  config.format_template, config.sequence_width, config.reset_period, 1
FROM public.tenants AS t
CROSS JOIN (VALUES
  ('document_number', 'document', 'Nomor Dokumen', 'Nomor unik surat masuk, surat keluar, dan dokumen internal tenant.', 'DOC/{{YEAR}}/{{SEQ}}', 5::SMALLINT, 'yearly'),
  ('finance_receipt', 'finance', 'Nomor Kuitansi', 'Nomor unik bukti pelunasan yang diterbitkan pada buku keuangan tenant.', 'KWT/{{YEAR}}/{{SEQ}}', 6::SMALLINT, 'yearly'),
  ('asset_code', 'ga', 'Kode Aset', 'Kode unik aset tetap yang diterbitkan backend pada saat pendaftaran.', 'AST-{{SEQ}}', 5::SMALLINT, 'never'),
  ('inventory_item_code', 'ga', 'Kode Inventaris', 'Kode unik barang persediaan yang diterbitkan backend saat pencatatan.', 'BRG-{{SEQ}}', 5::SMALLINT, 'never')
) AS config(series_key, module_id, display_name, description, format_template, sequence_width, reset_period)
WHERE t.status = 'active'
ON CONFLICT (tenant_id, series_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.allocate_tenant_extended_naming_series(
  p_tenant_id UUID,
  p_series_key TEXT,
  p_effective_date DATE,
  p_client_request_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_series public.tenant_naming_series%ROWTYPE;
  v_period_key TEXT;
  v_sequence BIGINT;
  v_max_sequence BIGINT;
  v_code TEXT;
  v_available BOOLEAN;
  v_attempt INTEGER;
  v_year TEXT;
  v_month TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_series_key IS NULL
    OR p_series_key NOT IN ('document_number', 'finance_receipt', 'asset_code', 'inventory_item_code')
    OR p_effective_date IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Permintaan alokasi nomor tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_series FROM public.tenant_naming_series
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seri belum diinisialisasi untuk tenant' USING ERRCODE = 'P0002'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'naming-series-allocation:' || p_tenant_id::TEXT || ':' || p_series_key || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT business_code INTO v_code FROM public.tenant_naming_series_allocations
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key AND client_request_id = p_client_request_id;
  IF FOUND THEN RETURN v_code; END IF;
  IF NOT v_series.is_active THEN RAISE EXCEPTION 'Seri penomoran tidak aktif pada tenant ini' USING ERRCODE = '23514'; END IF;

  v_year := to_char(p_effective_date, 'YYYY');
  v_month := to_char(p_effective_date, 'MM');
  v_period_key := CASE v_series.reset_period
    WHEN 'yearly' THEN v_year
    WHEN 'monthly' THEN v_year || v_month
    ELSE 'all'
  END;
  v_max_sequence := least(v_series.start_number + 100000,
    power(10::NUMERIC, v_series.sequence_width)::BIGINT - 1);

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
    v_code := replace(v_code, '{{SEQ}}', lpad(v_sequence::TEXT, v_series.sequence_width, '0'));

    v_available := CASE p_series_key
      WHEN 'document_number' THEN NOT EXISTS (
        SELECT 1 FROM public.document_records d
        WHERE d.tenant_id = p_tenant_id AND lower(btrim(d.document_number)) = lower(btrim(v_code)))
      WHEN 'finance_receipt' THEN NOT EXISTS (
        SELECT 1 FROM public.finance_bills b
        WHERE b.tenant_id = p_tenant_id AND b.receipt_no IS NOT NULL AND lower(btrim(b.receipt_no)) = lower(btrim(v_code)))
        AND NOT EXISTS (SELECT 1 FROM public.finance_ledger l
          WHERE l.tenant_id = p_tenant_id AND l.receipt_no IS NOT NULL AND lower(btrim(l.receipt_no)) = lower(btrim(v_code)))
      WHEN 'asset_code' THEN NOT EXISTS (
        SELECT 1 FROM public.ga_facilities a
        WHERE a.tenant_id = p_tenant_id AND lower(btrim(a.asset_code)) = lower(btrim(v_code)))
      ELSE NOT EXISTS (
        SELECT 1 FROM public.ga_inventory_items i
        WHERE i.tenant_id = p_tenant_id AND lower(btrim(i.item_code)) = lower(btrim(v_code)))
    END;
    IF v_available AND NOT EXISTS (
      SELECT 1 FROM public.tenant_naming_series_allocations a
      WHERE a.tenant_id = p_tenant_id AND a.series_key = p_series_key
        AND lower(btrim(a.business_code)) = lower(btrim(v_code))
    ) THEN
      INSERT INTO public.tenant_naming_series_allocations (
        tenant_id, series_key, period_key, sequence_number, business_code, client_request_id
      ) VALUES (p_tenant_id, p_series_key, v_period_key, v_sequence, v_code, p_client_request_id);
      RETURN v_code;
    END IF;
    IF v_sequence >= v_max_sequence THEN EXIT; END IF;
  END LOOP;
  RAISE EXCEPTION 'Tidak ada nomor unik yang tersedia pada seri tenant ini' USING ERRCODE = '23505';
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_tenant_extended_naming_series(UUID, TEXT, DATE, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_tenant_extended_naming_series(UUID, TEXT, DATE, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.save_tenant_extended_naming_series(
  p_tenant_id UUID, p_actor_user_id UUID, p_series_key TEXT, p_format_template TEXT,
  p_sequence_width SMALLINT, p_reset_period TEXT, p_start_number BIGINT,
  p_is_active BOOLEAN, p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_module_id TEXT;
  v_series public.tenant_naming_series%ROWTYPE;
  v_existing public.tenant_naming_series_events%ROWTYPE;
  v_payload JSONB;
  v_sample TEXT;
  v_max_length INTEGER;
  v_pattern TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_series_key IS NULL
    OR p_series_key NOT IN ('document_number', 'finance_receipt', 'asset_code', 'inventory_item_code')
    OR p_format_template IS NULL OR length(btrim(p_format_template)) NOT BETWEEN 1 AND 120
    OR p_sequence_width IS NULL OR p_sequence_width NOT BETWEEN 1 AND 12
    OR p_reset_period IS NULL OR p_reset_period NOT IN ('never', 'yearly', 'monthly')
    OR p_start_number IS NULL OR p_start_number < 1 OR p_start_number > 999999999999
    OR p_start_number > power(10::NUMERIC, p_sequence_width)::BIGINT - 1
    OR p_is_active IS NULL
    OR length(p_format_template) - length(replace(p_format_template, '{{SEQ}}', '')) <> 7
    OR length(p_format_template) - length(replace(p_format_template, '{{YEAR}}', '')) > 8
    OR length(p_format_template) - length(replace(p_format_template, '{{MONTH}}', '')) > 9
    OR p_format_template ~ '[[:cntrl:]]'
    OR replace(replace(replace(p_format_template, '{{YEAR}}', ''), '{{MONTH}}', ''), '{{SEQ}}', '') ~ '[{}]'
    OR (p_reset_period IN ('yearly', 'monthly') AND position('{{YEAR}}' IN p_format_template) = 0)
    OR (p_reset_period = 'monthly' AND position('{{MONTH}}' IN p_format_template) = 0) THEN
    RAISE EXCEPTION 'Konfigurasi seri penomoran tidak valid' USING ERRCODE = '22023';
  END IF;
  v_module_id := CASE p_series_key
    WHEN 'document_number' THEN 'document'
    WHEN 'finance_receipt' THEN 'finance'
    ELSE 'ga'
  END;
  v_max_length := CASE WHEN p_series_key = 'document_number' THEN 80 ELSE 40 END;
  v_pattern := CASE WHEN p_series_key = 'document_number'
    THEN '^[A-Za-z0-9][A-Za-z0-9./_-]{0,79}$'
    ELSE '^[A-Za-z0-9][A-Za-z0-9./_-]{0,39}$' END;
  v_sample := replace(replace(p_format_template, '{{YEAR}}', '2026'), '{{MONTH}}', '11');
  v_sample := replace(v_sample, '{{SEQ}}', lpad('1', p_sequence_width, '0'));
  IF position('{{GRADE}}' IN p_format_template) > 0 OR length(v_sample) > v_max_length
    OR v_sample !~ v_pattern THEN
    RAISE EXCEPTION 'Pola nomor tidak sesuai panjang atau karakter yang didukung' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT role::TEXT, module_permissions INTO v_role, v_permissions
  FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active' FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin')
    OR (v_role <> 'super_admin' AND CASE
      WHEN v_permissions ? v_module_id THEN jsonb_typeof(v_permissions -> v_module_id) = 'boolean'
        AND v_permissions ->> v_module_id = 'true'
      ELSE v_role = 'admin'
    END IS NOT TRUE) THEN
    RAISE EXCEPTION 'Admin tenant dengan akses modul terkait diperlukan' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object('formatTemplate', p_format_template, 'sequenceWidth', p_sequence_width,
    'resetPeriod', p_reset_period, 'startNumber', p_start_number, 'isActive', p_is_active);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Seri belum diinisialisasi untuk tenant' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenant_naming_series SET format_template = p_format_template,
    sequence_width = p_sequence_width, reset_period = p_reset_period, start_number = p_start_number,
    is_active = p_is_active, updated_by_user_id = p_actor_user_id, updated_at = now()
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  INSERT INTO public.tenant_naming_series_events (
    tenant_id, client_request_id, series_key, actor_user_id, operation, payload
  ) VALUES (p_tenant_id, p_client_request_id, p_series_key, p_actor_user_id, 'updated', v_payload);
  IF v_series.start_number IS DISTINCT FROM p_start_number THEN
    UPDATE public.tenant_naming_series_counters SET last_value = GREATEST(last_value, p_start_number - 1), updated_at = now()
    WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  END IF;
  RETURN jsonb_build_object('alreadyApplied', false, 'seriesKey', p_series_key);
END;
$$;
REVOKE ALL ON FUNCTION public.save_tenant_extended_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_tenant_extended_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  TO service_role;

-- Generate document numbers inside the registration transaction. The supplied number is ignored.
CREATE OR REPLACE FUNCTION public.register_tenant_document(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT, p_client_request_id UUID,
  p_document_id UUID, p_document_number TEXT, p_direction TEXT, p_subject TEXT,
  p_sender_name TEXT, p_recipient_name TEXT, p_document_date DATE, p_summary TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.document_records%ROWTYPE;
  v_document_number TEXT;
  v_subject TEXT := btrim(COALESCE(p_subject, ''));
  v_sender TEXT := NULLIF(btrim(COALESCE(p_sender_name, '')), '');
  v_recipient TEXT := NULLIF(btrim(COALESCE(p_recipient_name, '')), '');
  v_summary TEXT := NULLIF(btrim(COALESCE(p_summary, '')), '');
BEGIN
  PERFORM public.assert_tenant_document_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_client_request_id IS NULL OR p_document_id IS NULL
    OR p_direction IS NULL OR p_direction NOT IN ('incoming', 'outgoing', 'internal')
    OR length(v_subject) NOT BETWEEN 1 AND 240 OR v_subject ~ '[[:cntrl:]]'
    OR COALESCE(length(v_sender), 0) > 200 OR COALESCE(v_sender, '') ~ '[[:cntrl:]]'
    OR COALESCE(length(v_recipient), 0) > 200 OR COALESCE(v_recipient, '') ~ '[[:cntrl:]]'
    OR p_document_date IS NULL OR COALESCE(length(v_summary), 0) > 2000 THEN
    RAISE EXCEPTION 'Data dokumen tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-register:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing FROM public.document_records
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.created_by_user_id = p_actor_user_id AND v_existing.direction = p_direction
      AND v_existing.subject = v_subject AND v_existing.sender_name IS NOT DISTINCT FROM v_sender
      AND v_existing.recipient_name IS NOT DISTINCT FROM v_recipient
      AND v_existing.document_date = p_document_date AND v_existing.summary IS NOT DISTINCT FROM v_summary THEN
      RETURN jsonb_build_object('documentId', v_existing.id, 'documentNumber', v_existing.document_number, 'alreadyApplied', true);
    END IF;
    RAISE EXCEPTION 'ID permintaan sudah dipakai untuk isi dokumen lain' USING ERRCODE = '23505';
  END IF;
  v_document_number := public.allocate_tenant_extended_naming_series(
    p_tenant_id, 'document_number', p_document_date, p_client_request_id);
  INSERT INTO public.document_records (
    id, tenant_id, client_request_id, document_number, direction, subject,
    sender_name, recipient_name, document_date, summary, status,
    created_by_user_id, updated_by_user_id
  ) VALUES (
    p_document_id, p_tenant_id, p_client_request_id, v_document_number, p_direction, v_subject,
    v_sender, v_recipient, p_document_date, v_summary, 'registered', p_actor_user_id, p_actor_user_id
  );
  INSERT INTO public.document_workflow_events (
    tenant_id, document_id, actor_user_id, event_type, next_status
  ) VALUES (p_tenant_id, p_document_id, p_actor_user_id, 'registered', 'registered');
  RETURN jsonb_build_object('documentId', p_document_id, 'documentNumber', v_document_number, 'alreadyApplied', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_ga_facility_naming_series_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.source_system = 'supabase_runtime' THEN
    NEW.asset_code := public.allocate_tenant_extended_naming_series(
      NEW.tenant_id, 'asset_code', timezone('Asia/Jakarta', now())::DATE, NEW.client_request_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ga_facilities_assign_naming_series_code
  BEFORE INSERT ON public.ga_facilities
  FOR EACH ROW EXECUTE FUNCTION public.assign_ga_facility_naming_series_code();
REVOKE ALL ON FUNCTION public.assign_ga_facility_naming_series_code() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.assign_ga_inventory_naming_series_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.source_system = 'supabase_runtime' THEN
    NEW.item_code := public.allocate_tenant_extended_naming_series(
      NEW.tenant_id, 'inventory_item_code', timezone('Asia/Jakarta', now())::DATE, NEW.client_request_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ga_inventory_assign_naming_series_code
  BEFORE INSERT ON public.ga_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.assign_ga_inventory_naming_series_code();
REVOKE ALL ON FUNCTION public.assign_ga_inventory_naming_series_code() FROM PUBLIC, anon, authenticated, service_role;

-- Issue the number before the existing inventory RPC checks replay payloads. On a retry,
-- the same request ID resolves to the same code, so the RPC can verify the original payload.
ALTER FUNCTION public.manage_ga_inventory_item(UUID, UUID, JSONB)
  RENAME TO manage_ga_inventory_item_with_legacy_code;
REVOKE ALL ON FUNCTION public.manage_ga_inventory_item_with_legacy_code(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.manage_ga_inventory_item(p_tenant_id UUID, p_actor_user_id UUID, p_item JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_request UUID;
  v_role TEXT;
  v_permissions JSONB;
  v_code TEXT;
  v_item JSONB := p_item;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Permintaan inventaris tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_item->>'action' = 'create' THEN
    IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE) THEN
      RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
    END IF;
    SELECT role::TEXT, module_permissions INTO v_role, v_permissions
    FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    FOR SHARE;
    IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin')
      OR NOT (NOT COALESCE(v_permissions ? 'ga', false)
        OR COALESCE(v_permissions->>'ga', 'false') = 'true') THEN
      RAISE EXCEPTION 'Akses General Affairs diperlukan' USING ERRCODE = '42501';
    END IF;
    BEGIN
      v_request := NULLIF(p_item->>'clientRequestId', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ID permintaan inventaris tidak valid' USING ERRCODE = '22023';
    END;
    IF v_request IS NULL THEN
      RAISE EXCEPTION 'ID permintaan inventaris tidak valid' USING ERRCODE = '22023';
    END IF;
    v_code := public.allocate_tenant_extended_naming_series(
      p_tenant_id, 'inventory_item_code', timezone('Asia/Jakarta', now())::DATE, v_request);
    v_item := jsonb_set(p_item, '{itemCode}', to_jsonb(v_code), true);
  END IF;
  RETURN public.manage_ga_inventory_item_with_legacy_code(p_tenant_id, p_actor_user_id, v_item);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_ga_inventory_item(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_ga_inventory_item(UUID, UUID, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.protect_ga_business_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'ga_facilities' AND NEW.asset_code IS DISTINCT FROM OLD.asset_code THEN
    RAISE EXCEPTION 'Kode aset yang sudah diterbitkan tidak dapat diubah' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'ga_inventory_items' AND NEW.item_code IS DISTINCT FROM OLD.item_code THEN
    RAISE EXCEPTION 'Kode inventaris yang sudah diterbitkan tidak dapat diubah' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER ga_facilities_business_code_immutable
  BEFORE UPDATE OF asset_code ON public.ga_facilities
  FOR EACH ROW EXECUTE FUNCTION public.protect_ga_business_codes();
CREATE TRIGGER ga_inventory_business_code_immutable
  BEFORE UPDATE OF item_code ON public.ga_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.protect_ga_business_codes();
REVOKE ALL ON FUNCTION public.protect_ga_business_codes() FROM PUBLIC, anon, authenticated, service_role;

-- Receipt generation and write-idempotency remain in the same locked transaction.
CREATE OR REPLACE FUNCTION public.review_tenant_finance_bill(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_bill_id UUID, p_action TEXT, p_method_or_reason TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_role TEXT; v_control public.finance_controls%ROWTYPE; v_request public.finance_write_requests%ROWTYPE;
  v_bill public.finance_bills%ROWTYPE; v_write_action TEXT; v_payload JSONB; v_result JSONB; v_receipt TEXT; v_method TEXT; v_business_date DATE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_bill_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin') OR p_action IS NULL OR p_action NOT IN ('settle', 'reject')
    OR length(btrim(COALESCE(p_method_or_reason, ''))) NOT BETWEEN 1 AND 1000
    OR (p_action = 'settle' AND length(btrim(COALESCE(p_method_or_reason, ''))) > 100) THEN
    RAISE EXCEPTION 'Keputusan tagihan tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(role::text)) INTO v_role FROM public.profiles WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS DISTINCT FROM p_expected_role THEN RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501'; END IF;
  v_write_action := CASE WHEN p_action = 'settle' THEN 'settle_bill' ELSE 'reject_bill' END;
  v_payload := jsonb_build_object('billId', p_bill_id, 'action', p_action, 'methodOrReason', btrim(p_method_or_reason));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('finance-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_request FROM public.finance_write_requests WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_request.action IS DISTINCT FROM v_write_action OR v_request.request_payload IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Kunci keputusan telah dipakai untuk data berbeda' USING ERRCODE = '23505'; END IF;
    RETURN v_request.result;
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000'; END IF;
  SELECT * INTO v_bill FROM public.finance_bills WHERE tenant_id = p_tenant_id AND id = p_bill_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002'; END IF;
  IF p_action = 'settle' THEN
    IF v_bill.status NOT IN ('unpaid', 'partial', 'verification') OR v_bill.paid_amount >= v_bill.amount THEN RAISE EXCEPTION 'Status tagihan tidak dapat diselesaikan' USING ERRCODE = '23514'; END IF;
    IF v_bill.status = 'verification' AND v_bill.proof_storage_path IS NULL THEN RAISE EXCEPTION 'Bukti pembayaran belum tersimpan' USING ERRCODE = '23514'; END IF;
    v_method := CASE WHEN v_bill.status = 'verification' THEN COALESCE(v_bill.payment_method, btrim(p_method_or_reason)) ELSE btrim(p_method_or_reason) END;
    v_business_date := timezone('Asia/Jakarta', now())::DATE;
    v_receipt := public.allocate_tenant_extended_naming_series(p_tenant_id, 'finance_receipt', v_business_date, p_client_request_id);
    UPDATE public.finance_bills SET status = 'paid', paid_amount = amount, payment_method = v_method,
      receipt_no = v_receipt, paid_at = v_business_date, rejection_reason = NULL
    WHERE tenant_id = p_tenant_id AND id = p_bill_id;
    INSERT INTO public.finance_ledger (tenant_id, entry_type, source_type, source_id, description, amount, payment_method, receipt_no, actor_user_id)
    VALUES (p_tenant_id, 'income', 'bill', p_bill_id, 'Pelunasan tagihan ' || v_bill.fee_type || ' - ' || v_bill.period,
      v_bill.amount - v_bill.paid_amount, v_method, v_receipt, p_actor_user_id);
  ELSE
    IF v_bill.status <> 'verification' THEN RAISE EXCEPTION 'Tagihan tidak menunggu verifikasi pembayaran' USING ERRCODE = '23514'; END IF;
    UPDATE public.finance_bills SET status = CASE WHEN paid_amount > 0 THEN 'partial' ELSE 'unpaid' END,
      payment_method = NULL, proof_file = NULL, proof_storage_path = NULL, proof_storage_provider = NULL,
      uploaded_at = NULL, rejection_reason = btrim(p_method_or_reason)
    WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  END IF;
  v_result := jsonb_build_object('success', true, 'billId', p_bill_id, 'status', CASE WHEN p_action = 'settle' THEN 'paid' ELSE 'unpaid' END, 'receiptNo', v_receipt);
  INSERT INTO public.finance_write_requests (tenant_id, client_request_id, actor_user_id, action, request_payload, result)
  VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, v_write_action, v_payload, v_result);
  RETURN v_result;
END;
$$;

COMMENT ON TABLE public.tenant_naming_series_allocations IS
  'Tenant business identifiers allocated atomically by the trusted backend. UUIDs remain technical primary keys.';
COMMENT ON FUNCTION public.allocate_tenant_extended_naming_series(UUID, TEXT, DATE, UUID) IS
  'Atomically allocates an idempotent tenant-scoped identifier for document, finance, and general-affairs records.';

COMMIT;
