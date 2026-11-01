-- Extend tenant-controlled automatic identifiers to donation, laundry and product workflows.
-- Existing business codes remain immutable; import paths keep their historical identifiers.
BEGIN;

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
    'document_number', 'finance_receipt', 'asset_code', 'inventory_item_code',
    'donation_receipt', 'waqf_asset_code', 'laundry_order_number',
    'cooperative_product_sku', 'marketplace_product_sku'
  )),
  ADD CONSTRAINT tenant_naming_series_module_id_check CHECK (
    module_id IN ('master-data', 'ppdb', 'hris', 'document', 'finance', 'ga', 'donation', 'laundry', 'cooperative', 'marketplace')
  ),
  ADD CONSTRAINT tenant_naming_series_key_module_check CHECK (
    (series_key = 'nis' AND module_id = 'master-data')
    OR (series_key = 'ppdb_registration' AND module_id = 'ppdb')
    OR (series_key = 'employee_number' AND module_id = 'hris')
    OR (series_key IN ('building_code', 'room_code', 'class_code') AND module_id = 'master-data')
    OR (series_key = 'document_number' AND module_id = 'document')
    OR (series_key = 'finance_receipt' AND module_id = 'finance')
    OR (series_key IN ('asset_code', 'inventory_item_code') AND module_id = 'ga')
    OR (series_key IN ('donation_receipt', 'waqf_asset_code') AND module_id = 'donation')
    OR (series_key = 'laundry_order_number' AND module_id = 'laundry')
    OR (series_key = 'cooperative_product_sku' AND module_id = 'cooperative')
    OR (series_key = 'marketplace_product_sku' AND module_id = 'marketplace')
  );

-- Fail before adding constraints if historical values collide when normalized.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.donations WHERE receipt_number IS NOT NULL
    GROUP BY tenant_id, lower(btrim(receipt_number)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Nomor kuitansi donasi tenant berbenturan setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.waqf_assets
    GROUP BY tenant_id, lower(btrim(asset_code)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Kode aset wakaf tenant berbenturan setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.laundry_orders
    GROUP BY tenant_id, lower(btrim(order_number)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Nomor laundry tenant berbenturan setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cooperative_products
    GROUP BY tenant_id, lower(btrim(sku)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Kode produk koperasi tenant berbenturan setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
  IF EXISTS (SELECT 1 FROM public.marketplace_products
    GROUP BY tenant_id, lower(btrim(sku)) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Kode produk marketplace tenant berbenturan setelah normalisasi; selesaikan konflik sebelum migrasi';
  END IF;
END;
$$;

CREATE UNIQUE INDEX donations_tenant_receipt_normalized_uq
  ON public.donations (tenant_id, lower(btrim(receipt_number)));
CREATE UNIQUE INDEX waqf_assets_tenant_asset_code_normalized_uq
  ON public.waqf_assets (tenant_id, lower(btrim(asset_code)));
CREATE UNIQUE INDEX laundry_orders_tenant_order_number_normalized_uq
  ON public.laundry_orders (tenant_id, lower(btrim(order_number)));
CREATE UNIQUE INDEX cooperative_products_tenant_sku_normalized_uq
  ON public.cooperative_products (tenant_id, lower(btrim(sku)));
CREATE UNIQUE INDEX marketplace_products_tenant_sku_normalized_uq
  ON public.marketplace_products (tenant_id, lower(btrim(sku)));

-- Include all new module-owned series in the existing tenant-activation seed.
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
      (NEW.id, 'finance_receipt', 'finance', 'Nomor Kuitansi Keuangan',
       'Nomor unik bukti pelunasan tagihan pada buku keuangan tenant.', 'KWT/{{YEAR}}/{{SEQ}}', 6, 'yearly', 1),
      (NEW.id, 'asset_code', 'ga', 'Kode Aset',
       'Kode unik aset sarana dan prasarana yang diterbitkan backend.', 'AST-{{SEQ}}', 5, 'never', 1),
      (NEW.id, 'inventory_item_code', 'ga', 'Kode Inventaris',
       'Kode unik barang persediaan yang diterbitkan backend.', 'BRG-{{SEQ}}', 5, 'never', 1),
      (NEW.id, 'donation_receipt', 'donation', 'Nomor Kuitansi Donasi',
       'Nomor unik tanda terima donasi yang diterbitkan pada transaksi.', 'DON/{{YEAR}}/{{SEQ}}', 7, 'yearly', 1),
      (NEW.id, 'waqf_asset_code', 'donation', 'Kode Aset Wakaf',
       'Kode unik aset wakaf yang dibuat backend dan tidak berubah setelah terbit.', 'WAK-{{SEQ}}', 5, 'never', 1),
      (NEW.id, 'laundry_order_number', 'laundry', 'Nomor Pesanan Laundry',
       'Nomor unik pesanan laundry yang dibuat saat pesanan dicatat.', 'LDY-{{YEAR}}-{{SEQ}}', 6, 'yearly', 1),
      (NEW.id, 'cooperative_product_sku', 'cooperative', 'Kode Produk Koperasi',
       'Kode internal produk koperasi yang dibuat backend saat produk baru disimpan.', 'KOP-{{SEQ}}', 5, 'never', 1),
      (NEW.id, 'marketplace_product_sku', 'marketplace', 'Kode Produk Marketplace',
       'Kode internal produk marketplace yang dibuat backend saat produk baru disimpan.', 'TOK-{{SEQ}}', 5, 'never', 1)
    ON CONFLICT (tenant_id, series_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

INSERT INTO public.tenant_naming_series (
  tenant_id, series_key, module_id, display_name, description, format_template,
  sequence_width, reset_period, start_number
)
SELECT t.id, config.series_key, config.module_id, config.display_name, config.description,
  config.format_template, config.sequence_width, config.reset_period, 1
FROM public.tenants AS t
CROSS JOIN (VALUES
  ('donation_receipt', 'donation', 'Nomor Kuitansi Donasi', 'Nomor unik tanda terima donasi yang diterbitkan pada transaksi.', 'DON/{{YEAR}}/{{SEQ}}', 7::SMALLINT, 'yearly'),
  ('waqf_asset_code', 'donation', 'Kode Aset Wakaf', 'Kode unik aset wakaf yang dibuat backend dan tidak berubah setelah terbit.', 'WAK-{{SEQ}}', 5::SMALLINT, 'never'),
  ('laundry_order_number', 'laundry', 'Nomor Pesanan Laundry', 'Nomor unik pesanan laundry yang dibuat saat pesanan dicatat.', 'LDY-{{YEAR}}-{{SEQ}}', 6::SMALLINT, 'yearly'),
  ('cooperative_product_sku', 'cooperative', 'Kode Produk Koperasi', 'Kode internal produk koperasi yang dibuat backend saat produk baru disimpan.', 'KOP-{{SEQ}}', 5::SMALLINT, 'never'),
  ('marketplace_product_sku', 'marketplace', 'Kode Produk Marketplace', 'Kode internal produk marketplace yang dibuat backend saat produk baru disimpan.', 'TOK-{{SEQ}}', 5::SMALLINT, 'never')
) AS config(series_key, module_id, display_name, description, format_template, sequence_width, reset_period)
WHERE t.status = 'active'
ON CONFLICT (tenant_id, series_key) DO NOTHING;

-- Preserve the original allocator for the first four extended series. A restricted dispatcher
-- routes the additional five series to the same transactional counter/allocation ledger.
ALTER FUNCTION public.allocate_tenant_extended_naming_series(UUID, TEXT, DATE, UUID)
  RENAME TO allocate_tenant_core_extended_naming_series;
REVOKE ALL ON FUNCTION public.allocate_tenant_core_extended_naming_series(UUID, TEXT, DATE, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.allocate_tenant_additional_naming_series(
  p_tenant_id UUID, p_series_key TEXT, p_effective_date DATE, p_client_request_id UUID
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_series public.tenant_naming_series%ROWTYPE;
  v_period_key TEXT;
  v_sequence BIGINT;
  v_code TEXT;
  v_attempt INTEGER;
  v_year TEXT;
  v_month TEXT;
  v_available BOOLEAN;
BEGIN
  IF p_tenant_id IS NULL OR p_client_request_id IS NULL OR p_effective_date IS NULL
    OR p_series_key NOT IN ('donation_receipt', 'waqf_asset_code', 'laundry_order_number', 'cooperative_product_sku', 'marketplace_product_sku') THEN
    RAISE EXCEPTION 'Permintaan alokasi nomor tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_series FROM public.tenant_naming_series
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key FOR SHARE;
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
  v_period_key := CASE v_series.reset_period WHEN 'yearly' THEN v_year WHEN 'monthly' THEN v_year || v_month ELSE 'all' END;
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
      WHEN 'donation_receipt' THEN NOT EXISTS (SELECT 1 FROM public.donations d WHERE d.tenant_id = p_tenant_id AND lower(btrim(d.receipt_number)) = lower(btrim(v_code)))
      WHEN 'waqf_asset_code' THEN NOT EXISTS (SELECT 1 FROM public.waqf_assets a WHERE a.tenant_id = p_tenant_id AND lower(btrim(a.asset_code)) = lower(btrim(v_code)))
      WHEN 'laundry_order_number' THEN NOT EXISTS (SELECT 1 FROM public.laundry_orders l WHERE l.tenant_id = p_tenant_id AND lower(btrim(l.order_number)) = lower(btrim(v_code)))
      WHEN 'cooperative_product_sku' THEN NOT EXISTS (SELECT 1 FROM public.cooperative_products c WHERE c.tenant_id = p_tenant_id AND lower(btrim(c.sku)) = lower(btrim(v_code)))
      ELSE NOT EXISTS (SELECT 1 FROM public.marketplace_products m WHERE m.tenant_id = p_tenant_id AND lower(btrim(m.sku)) = lower(btrim(v_code)))
    END;
    IF v_available AND NOT EXISTS (SELECT 1 FROM public.tenant_naming_series_allocations a
      WHERE a.tenant_id = p_tenant_id AND a.series_key = p_series_key AND lower(btrim(a.business_code)) = lower(btrim(v_code))) THEN
      INSERT INTO public.tenant_naming_series_allocations (
        tenant_id, series_key, period_key, sequence_number, business_code, client_request_id
      ) VALUES (p_tenant_id, p_series_key, v_period_key, v_sequence, v_code, p_client_request_id);
      RETURN v_code;
    END IF;
  END LOOP;
  RAISE EXCEPTION 'Tidak ada nomor unik yang tersedia pada seri tenant ini' USING ERRCODE = '23505';
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_tenant_additional_naming_series(UUID, TEXT, DATE, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.allocate_tenant_extended_naming_series(
  p_tenant_id UUID, p_series_key TEXT, p_effective_date DATE, p_client_request_id UUID
)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_series_key IN ('document_number', 'finance_receipt', 'asset_code', 'inventory_item_code') THEN
    RETURN public.allocate_tenant_core_extended_naming_series(p_tenant_id, p_series_key, p_effective_date, p_client_request_id);
  END IF;
  RETURN public.allocate_tenant_additional_naming_series(p_tenant_id, p_series_key, p_effective_date, p_client_request_id);
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_tenant_extended_naming_series(UUID, TEXT, DATE, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.allocate_tenant_extended_naming_series(UUID, TEXT, DATE, UUID) TO service_role;

ALTER FUNCTION public.save_tenant_extended_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  RENAME TO save_tenant_core_extended_naming_series;
REVOKE ALL ON FUNCTION public.save_tenant_core_extended_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_tenant_additional_naming_series(
  p_tenant_id UUID, p_actor_user_id UUID, p_series_key TEXT, p_format_template TEXT,
  p_sequence_width SMALLINT, p_reset_period TEXT, p_start_number BIGINT,
  p_is_active BOOLEAN, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_module TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_series public.tenant_naming_series%ROWTYPE;
  v_existing public.tenant_naming_series_events%ROWTYPE;
  v_payload JSONB;
  v_sample TEXT;
  v_pattern TEXT;
  v_max_length INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_series_key NOT IN ('donation_receipt', 'waqf_asset_code', 'laundry_order_number', 'cooperative_product_sku', 'marketplace_product_sku')
    OR p_format_template IS NULL OR length(btrim(p_format_template)) NOT BETWEEN 1 AND 120
    OR p_sequence_width IS NULL OR p_sequence_width NOT BETWEEN 1 AND 12
    OR p_reset_period NOT IN ('never', 'yearly', 'monthly') OR p_start_number IS NULL OR p_start_number < 1
    OR p_start_number > 999999999999 OR p_start_number > power(10::NUMERIC, p_sequence_width)::BIGINT - 1
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
  v_module := CASE p_series_key
    WHEN 'donation_receipt' THEN 'donation'
    WHEN 'waqf_asset_code' THEN 'donation'
    WHEN 'laundry_order_number' THEN 'laundry'
    WHEN 'cooperative_product_sku' THEN 'cooperative'
    ELSE 'marketplace'
  END;
  v_max_length := CASE p_series_key WHEN 'cooperative_product_sku' THEN 48 WHEN 'marketplace_product_sku' THEN 40 ELSE 50 END;
  v_pattern := CASE p_series_key WHEN 'cooperative_product_sku' THEN '^[A-Za-z0-9][A-Za-z0-9._/-]{0,47}$'
    WHEN 'marketplace_product_sku' THEN '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'
    ELSE '^[A-Za-z0-9][A-Za-z0-9./_-]{0,49}$' END;
  v_sample := replace(replace(p_format_template, '{{YEAR}}', '2026'), '{{MONTH}}', '11');
  v_sample := replace(v_sample, '{{SEQ}}', lpad('1', p_sequence_width, '0'));
  IF position('{{GRADE}}' IN p_format_template) > 0 OR length(v_sample) > v_max_length OR v_sample !~ v_pattern THEN
    RAISE EXCEPTION 'Pola nomor tidak sesuai panjang atau karakter yang didukung' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT role::TEXT, module_permissions INTO v_role, v_permissions FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active' FOR SHARE;
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') OR (v_role <> 'super_admin' AND CASE
    WHEN v_permissions ? v_module THEN jsonb_typeof(v_permissions -> v_module) = 'boolean' AND v_permissions ->> v_module = 'true'
    ELSE v_role = 'admin' END IS NOT TRUE) THEN
    RAISE EXCEPTION 'Admin tenant dengan akses modul terkait diperlukan' USING ERRCODE = '42501';
  END IF;
  v_payload := jsonb_build_object('formatTemplate', p_format_template, 'sequenceWidth', p_sequence_width,
    'resetPeriod', p_reset_period, 'startNumber', p_start_number, 'isActive', p_is_active);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'naming-series-config:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_existing FROM public.tenant_naming_series_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM p_actor_user_id OR v_existing.series_key IS DISTINCT FROM p_series_key
      OR v_existing.payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'ID permintaan konfigurasi telah digunakan untuk perubahan lain' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('alreadyApplied', true, 'seriesKey', p_series_key);
  END IF;
  SELECT * INTO v_series FROM public.tenant_naming_series
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Seri belum diinisialisasi untuk tenant' USING ERRCODE = 'P0002'; END IF;
  UPDATE public.tenant_naming_series SET format_template = p_format_template, sequence_width = p_sequence_width,
    reset_period = p_reset_period, start_number = p_start_number, is_active = p_is_active,
    updated_by_user_id = p_actor_user_id, updated_at = now()
  WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  INSERT INTO public.tenant_naming_series_events (tenant_id, client_request_id, series_key, actor_user_id, operation, payload)
  VALUES (p_tenant_id, p_client_request_id, p_series_key, p_actor_user_id, 'updated', v_payload);
  IF v_series.start_number IS DISTINCT FROM p_start_number THEN
    UPDATE public.tenant_naming_series_counters SET last_value = GREATEST(last_value, p_start_number - 1), updated_at = now()
    WHERE tenant_id = p_tenant_id AND series_key = p_series_key;
  END IF;
  RETURN jsonb_build_object('alreadyApplied', false, 'seriesKey', p_series_key);
END;
$$;
REVOKE ALL ON FUNCTION public.save_tenant_additional_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.save_tenant_extended_naming_series(
  p_tenant_id UUID, p_actor_user_id UUID, p_series_key TEXT, p_format_template TEXT,
  p_sequence_width SMALLINT, p_reset_period TEXT, p_start_number BIGINT,
  p_is_active BOOLEAN, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_series_key IN ('document_number', 'finance_receipt', 'asset_code', 'inventory_item_code') THEN
    RETURN public.save_tenant_core_extended_naming_series(p_tenant_id, p_actor_user_id, p_series_key,
      p_format_template, p_sequence_width, p_reset_period, p_start_number, p_is_active, p_client_request_id);
  END IF;
  RETURN public.save_tenant_additional_naming_series(p_tenant_id, p_actor_user_id, p_series_key,
    p_format_template, p_sequence_width, p_reset_period, p_start_number, p_is_active, p_client_request_id);
END;
$$;
REVOKE ALL ON FUNCTION public.save_tenant_extended_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_tenant_extended_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  TO service_role;

-- Internal helper functions are never exposed directly through PostgREST.
REVOKE ALL ON FUNCTION public.allocate_tenant_core_extended_naming_series(UUID, TEXT, DATE, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.allocate_tenant_additional_naming_series(UUID, TEXT, DATE, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_tenant_core_extended_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_tenant_additional_naming_series(UUID, UUID, TEXT, TEXT, SMALLINT, TEXT, BIGINT, BOOLEAN, UUID)
  FROM PUBLIC, anon, authenticated, service_role;

-- Wrap the old CRUD procedures so new identifiers are minted before their idempotency checks.
ALTER FUNCTION public.manage_waqf_asset(UUID, UUID, JSONB) RENAME TO manage_waqf_asset_with_legacy_code;
REVOKE ALL ON FUNCTION public.manage_waqf_asset_with_legacy_code(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.manage_waqf_asset(p_tenant_id UUID, p_actor_user_id UUID, p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_item JSONB := p_item; v_request UUID; v_id UUID; v_code TEXT;
BEGIN
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Data aset wakaf tidak valid' USING ERRCODE = '22023'; END IF;
  IF p_item->>'action' = 'create' THEN
    v_request := NULLIF(p_item->>'clientRequestId', '')::UUID;
    IF v_request IS NULL THEN RAISE EXCEPTION 'ID permintaan aset wakaf tidak valid' USING ERRCODE = '22023'; END IF;
    v_code := public.allocate_tenant_extended_naming_series(p_tenant_id, 'waqf_asset_code', timezone('Asia/Jakarta', now())::DATE, v_request);
    v_item := jsonb_set(p_item, '{assetCode}', to_jsonb(v_code), true);
  ELSIF p_item->>'action' = 'update' THEN
    v_id := NULLIF(p_item->>'id', '')::UUID;
    SELECT asset_code INTO v_code FROM public.waqf_assets WHERE tenant_id = p_tenant_id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Aset wakaf tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    IF NULLIF(btrim(COALESCE(p_item->>'assetCode', '')), '') IS DISTINCT FROM v_code THEN
      RAISE EXCEPTION 'Kode aset wakaf yang telah terbit tidak dapat diubah' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN public.manage_waqf_asset_with_legacy_code(p_tenant_id, p_actor_user_id, v_item);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_waqf_asset(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_waqf_asset(UUID, UUID, JSONB) TO service_role;

ALTER FUNCTION public.manage_cooperative_product(UUID, UUID, JSONB) RENAME TO manage_cooperative_product_with_legacy_sku;
REVOKE ALL ON FUNCTION public.manage_cooperative_product_with_legacy_sku(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.manage_cooperative_product(p_tenant_id UUID, p_actor_user_id UUID, p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_item JSONB := p_item; v_request UUID; v_id UUID; v_sku TEXT;
BEGIN
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Data produk koperasi tidak valid' USING ERRCODE = '22023'; END IF;
  IF p_item->>'action' = 'create' THEN
    v_request := NULLIF(p_item->>'clientRequestId', '')::UUID;
    IF v_request IS NULL THEN RAISE EXCEPTION 'ID permintaan produk tidak valid' USING ERRCODE = '22023'; END IF;
    v_sku := public.allocate_tenant_extended_naming_series(p_tenant_id, 'cooperative_product_sku', timezone('Asia/Jakarta', now())::DATE, v_request);
    v_item := jsonb_set(p_item, '{sku}', to_jsonb(v_sku), true);
  ELSIF p_item->>'action' = 'update' THEN
    v_id := NULLIF(p_item->>'id', '')::UUID;
    SELECT sku INTO v_sku FROM public.cooperative_products WHERE tenant_id = p_tenant_id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk koperasi tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    IF upper(btrim(COALESCE(p_item->>'sku', ''))) IS DISTINCT FROM v_sku THEN
      RAISE EXCEPTION 'Kode produk yang telah terbit tidak dapat diubah' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN public.manage_cooperative_product_with_legacy_sku(p_tenant_id, p_actor_user_id, v_item);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_cooperative_product(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_cooperative_product(UUID, UUID, JSONB) TO service_role;

ALTER FUNCTION public.manage_marketplace_product(UUID, UUID, JSONB) RENAME TO manage_marketplace_product_with_legacy_sku;
REVOKE ALL ON FUNCTION public.manage_marketplace_product_with_legacy_sku(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.manage_marketplace_product(p_tenant_id UUID, p_actor_user_id UUID, p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_item JSONB := p_item; v_request UUID; v_id UUID; v_sku TEXT;
BEGIN
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Data produk marketplace tidak valid' USING ERRCODE = '22023'; END IF;
  IF p_item->>'action' = 'create' THEN
    v_request := NULLIF(p_item->>'clientRequestId', '')::UUID;
    IF v_request IS NULL THEN RAISE EXCEPTION 'ID permintaan produk tidak valid' USING ERRCODE = '22023'; END IF;
    v_sku := public.allocate_tenant_extended_naming_series(p_tenant_id, 'marketplace_product_sku', timezone('Asia/Jakarta', now())::DATE, v_request);
    v_item := jsonb_set(p_item, '{sku}', to_jsonb(v_sku), true);
  ELSIF p_item->>'action' = 'update' THEN
    v_id := NULLIF(p_item->>'id', '')::UUID;
    SELECT sku INTO v_sku FROM public.marketplace_products WHERE tenant_id = p_tenant_id AND id = v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Produk marketplace tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    IF btrim(COALESCE(p_item->>'sku', '')) IS DISTINCT FROM v_sku THEN
      RAISE EXCEPTION 'Kode produk yang telah terbit tidak dapat diubah' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN public.manage_marketplace_product_with_legacy_sku(p_tenant_id, p_actor_user_id, v_item);
END;
$$;
REVOKE ALL ON FUNCTION public.manage_marketplace_product(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.manage_marketplace_product(UUID, UUID, JSONB) TO service_role;

-- Donation receipts now use the tenant's configurable counter, still in the donation transaction.
CREATE OR REPLACE FUNCTION public.record_donation(p_tenant_id UUID, p_actor_user_id UUID, p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_id UUID; v_request UUID; v_donor UUID; v_campaign UUID; v_name TEXT; v_amount NUMERIC;
  v_type TEXT; v_method TEXT; v_received TIMESTAMPTZ; v_note TEXT; v_receipt TEXT;
BEGIN
  PERFORM public.assert_donation_admin(p_tenant_id, p_actor_user_id);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Data donasi tidak valid' USING ERRCODE = '22023'; END IF;
  v_request := NULLIF(p_item->>'clientRequestId', '')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'ID permintaan donasi tidak valid' USING ERRCODE = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT || ':donation-record:' || v_request::TEXT, 0));
  SELECT id, receipt_number INTO v_id, v_receipt FROM public.donations WHERE tenant_id = p_tenant_id AND client_request_id = v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_id, 'receiptNumber', v_receipt, 'replayed', true); END IF;
  v_donor := NULLIF(p_item->>'donorId', '')::UUID;
  v_campaign := NULLIF(p_item->>'campaignId', '')::UUID;
  v_name := btrim(COALESCE(p_item->>'donorName', ''));
  v_amount := NULLIF(p_item->>'amount', '')::NUMERIC;
  v_type := COALESCE(p_item->>'fundType', 'other');
  v_method := COALESCE(p_item->>'paymentMethod', 'other');
  v_received := COALESCE(NULLIF(p_item->>'receivedAt', '')::TIMESTAMPTZ, now());
  v_note := btrim(COALESCE(p_item->>'referenceNote', ''));
  IF length(v_name) NOT BETWEEN 1 AND 180 OR v_amount IS NULL OR v_amount <= 0
    OR v_type NOT IN ('zakat', 'infaq', 'sadaqah', 'waqf', 'education', 'infrastructure', 'other')
    OR v_method NOT IN ('cash', 'bank_transfer', 'qris', 'e_wallet', 'other') OR length(v_note) > 500 THEN
    RAISE EXCEPTION 'Data donasi tidak valid' USING ERRCODE = '22023';
  END IF;
  IF v_donor IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.donation_donors WHERE tenant_id = p_tenant_id AND id = v_donor AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Donatur tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  END IF;
  IF v_campaign IS NOT NULL THEN
    SELECT fund_type INTO v_type FROM public.donation_campaigns WHERE tenant_id = p_tenant_id AND id = v_campaign AND status = 'active' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kampanye tidak tersedia' USING ERRCODE = '23514'; END IF;
  END IF;
  v_receipt := public.allocate_tenant_extended_naming_series(
    p_tenant_id, 'donation_receipt', timezone('Asia/Jakarta', v_received)::DATE, v_request);
  INSERT INTO public.donations (
    tenant_id, donor_id, campaign_id, donor_name_snapshot, amount, fund_type, payment_method,
    received_at, receipt_number, reference_note, client_request_id, created_by
  ) VALUES (
    p_tenant_id, v_donor, v_campaign, v_name, v_amount, v_type, v_method,
    v_received, v_receipt, v_note, v_request, p_actor_user_id
  ) RETURNING id INTO v_id;
  INSERT INTO public.donation_audit_events (tenant_id, entity_type, entity_id, action, client_request_id, actor_user_id, details)
  VALUES (p_tenant_id, 'donation', v_id, 'created', v_request, p_actor_user_id,
    jsonb_build_object('receiptNumber', v_receipt, 'amount', v_amount));
  RETURN jsonb_build_object('id', v_id, 'receiptNumber', v_receipt, 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.record_donation(UUID, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_donation(UUID, UUID, JSONB) TO service_role;

-- Keep laundry request replay stable while using a human-readable tenant series.
CREATE OR REPLACE FUNCTION public.create_tenant_laundry_order(
  p_tenant_id UUID, p_actor_user_id UUID, p_student_id UUID, p_weight_kg NUMERIC,
  p_pieces INTEGER, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_order_id UUID; v_number TEXT; v_student public.students%ROWTYPE;
BEGIN
  PERFORM public.assert_tenant_laundry_admin(p_tenant_id, p_actor_user_id);
  IF p_student_id IS NULL OR p_client_request_id IS NULL OR p_weight_kg IS NULL OR p_weight_kg <= 0 OR p_weight_kg > 100
    OR p_pieces IS NULL OR p_pieces < 0 OR p_pieces > 1000 THEN
    RAISE EXCEPTION 'Data pesanan laundry tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('laundry-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT o.id, o.order_number INTO v_order_id, v_number FROM public.laundry_events e
  JOIN public.laundry_orders o ON o.tenant_id = e.tenant_id AND o.id = e.order_id
  WHERE e.tenant_id = p_tenant_id AND e.client_request_id = p_client_request_id;
  IF v_order_id IS NOT NULL THEN RETURN jsonb_build_object('id', v_order_id, 'orderNumber', v_number, 'replayed', true); END IF;
  SELECT * INTO v_student FROM public.students WHERE tenant_id = p_tenant_id AND id = p_student_id FOR SHARE;
  IF NOT FOUND OR lower(btrim(v_student.status)) IN ('archived', 'inactive', 'alumni', 'graduated', 'nonaktif', 'dikeluarkan') THEN
    RAISE EXCEPTION 'Santri aktif tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  v_order_id := gen_random_uuid();
  v_number := public.allocate_tenant_extended_naming_series(
    p_tenant_id, 'laundry_order_number', timezone('Asia/Jakarta', now())::DATE, p_client_request_id);
  INSERT INTO public.laundry_orders (id, tenant_id, order_number, student_id, weight_kg, pieces, created_by, updated_by)
  VALUES (v_order_id, p_tenant_id, v_number, p_student_id, p_weight_kg, p_pieces, p_actor_user_id, p_actor_user_id);
  INSERT INTO public.laundry_events (tenant_id, order_id, event_type, client_request_id, actor_user_id, details)
  VALUES (p_tenant_id, v_order_id, 'order_received', p_client_request_id, p_actor_user_id,
    jsonb_build_object('status', 'received', 'weightKg', p_weight_kg, 'pieces', p_pieces));
  RETURN jsonb_build_object('id', v_order_id, 'orderNumber', v_number, 'replayed', false);
END;
$$;
REVOKE ALL ON FUNCTION public.create_tenant_laundry_order(UUID, UUID, UUID, NUMERIC, INTEGER, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tenant_laundry_order(UUID, UUID, UUID, NUMERIC, INTEGER, UUID) TO service_role;

COMMENT ON TABLE public.tenant_naming_series IS
  'Fifteen tenant-owned business-number formats. UUID primary keys remain immutable technical identifiers.';
COMMENT ON FUNCTION public.allocate_tenant_extended_naming_series(UUID, TEXT, DATE, UUID) IS
  'Allocates tenant-scoped operational identifiers transactionally; committed numbers are not reused.';

COMMIT;
