-- Tenant-owned reference catalog and relational links for core workflows.
-- Existing free-text values remain visible as historical data; new runtime writes
-- must resolve to an active tenant reference item.
BEGIN;

CREATE TABLE public.tenant_reference_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  domain TEXT NOT NULL CHECK (domain IN (
    'academic_subject', 'academic_curriculum', 'academic_assessment_type',
    'facility_resource', 'finance_fee_type', 'finance_expense_category',
    'marketplace_product_category', 'cooperative_product_category',
    'cooperative_supplier_category', 'library_book_category',
    'healthcare_medicine_category', 'healthcare_medicine_unit',
    'ga_asset_category', 'ga_inventory_category', 'ga_inventory_unit'
  )),
  code TEXT NOT NULL CHECK (length(btrim(code)) BETWEEN 1 AND 80),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  organization_unit_id UUID,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain, id),
  UNIQUE (tenant_id, domain, code),
  FOREIGN KEY (tenant_id, organization_unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX tenant_reference_items_name_uq
  ON public.tenant_reference_items (tenant_id, domain, lower(btrim(name)));
CREATE INDEX tenant_reference_items_active_lookup_idx
  ON public.tenant_reference_items (tenant_id, domain, status, lower(name), id);
CREATE INDEX tenant_reference_items_unit_idx
  ON public.tenant_reference_items (tenant_id, organization_unit_id, domain, status)
  WHERE organization_unit_id IS NOT NULL;

ALTER TABLE public.tenant_reference_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_reference_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_reference_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.tenant_reference_items TO service_role;

-- Seed only universal labels. Tenant-specific subjects and facilities are set up by
-- the Admin; no sample operational records are generated.
CREATE OR REPLACE FUNCTION public.seed_tenant_reference_defaults_for_admin()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.status = 'active' AND lower(NEW.role) IN ('admin', 'super_admin') THEN
    INSERT INTO public.tenant_reference_items (tenant_id, domain, code, name, description, created_by_user_id, updated_by_user_id)
    VALUES
      (NEW.tenant_id, 'academic_curriculum', 'FORMAL', 'Formal', 'Kurikulum pendidikan formal.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'academic_curriculum', 'KEPESANTRENAN', 'Kepesantrenan', 'Kurikulum pendidikan kepesantrenan.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'academic_assessment_type', 'TUGAS_HARIAN', 'Tugas Harian', 'Penilaian rutin harian.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'academic_assessment_type', 'ULANGAN', 'Ulangan', 'Penilaian berkala.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'academic_assessment_type', 'UJIAN', 'Ujian', 'Penilaian akhir atau ujian.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'finance_fee_type', 'PPDB_REGISTRATION', 'Biaya Pendaftaran PPDB', 'Tagihan pendaftaran calon santri.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'finance_fee_type', 'PPDB_TUITION', 'Uang Pangkal PPDB', 'Tagihan uang pangkal calon santri.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'finance_fee_type', 'SPP_BULANAN', 'SPP Bulanan', 'Tagihan pendidikan bulanan.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'finance_expense_category', 'OPERASIONAL', 'Operasional', 'Pengeluaran operasional umum.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'finance_expense_category', 'PEMELIHARAAN', 'Pemeliharaan', 'Pengeluaran pemeliharaan sarana.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'finance_expense_category', 'KONSUMSI', 'Konsumsi', 'Pengeluaran konsumsi.', NEW.user_id, NEW.user_id),
      (NEW.tenant_id, 'finance_expense_category', 'TRANSPORTASI', 'Transportasi', 'Pengeluaran transportasi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'marketplace_product_category', 'SERAGAM', 'Seragam', 'Pakaian dan atribut resmi pesantren.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'marketplace_product_category', 'BUKU_KITAB', 'Buku dan Kitab', 'Buku pelajaran, kitab, dan bahan bacaan.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'marketplace_product_category', 'PERLENGKAPAN', 'Perlengkapan Santri', 'Perlengkapan belajar dan kebutuhan santri.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'marketplace_product_category', 'MAKANAN_MINUMAN', 'Makanan dan Minuman', 'Produk konsumsi yang dijual melalui marketplace.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'cooperative_product_category', 'KANTIN', 'Makanan dan Minuman', 'Produk konsumsi kantin koperasi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'cooperative_product_category', 'PERLENGKAPAN_SANTRI', 'Perlengkapan Santri', 'Barang kebutuhan harian santri.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'cooperative_product_category', 'BUKU_KITAB', 'Buku dan Kitab', 'Kitab dan buku yang dijual koperasi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'cooperative_supplier_category', 'BARANG_UMUM', 'Pemasok Barang', 'Pemasok barang umum untuk operasional koperasi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'cooperative_supplier_category', 'BAHAN_PANGAN', 'Pemasok Bahan Pangan', 'Pemasok bahan pangan dan konsumsi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'cooperative_supplier_category', 'JASA', 'Penyedia Jasa', 'Penyedia jasa untuk koperasi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'library_book_category', 'AKIDAH_AKHLAK', 'Akidah dan Akhlak', 'Buku akidah, adab, dan pembinaan akhlak.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'library_book_category', 'FIKIH', 'Fikih', 'Buku fikih dan panduan ibadah.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'library_book_category', 'TAFSIR_HADIS', 'Tafsir dan Hadis', 'Buku tafsir Al-Qur’an dan ilmu hadis.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'library_book_category', 'BAHASA', 'Bahasa', 'Buku bahasa Arab, Indonesia, dan bahasa lainnya.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'library_book_category', 'UMUM', 'Umum', 'Bahan bacaan umum dan lintas bidang.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_category', 'ANALGESIK_ANTIPIRETIK', 'Analgesik dan Antipiretik', 'Obat untuk membantu meredakan nyeri atau demam sesuai kewenangan tenaga kesehatan.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_category', 'ANTIBIOTIK', 'Antibiotik', 'Obat antibiotik yang penggunaannya harus mengikuti resep dan arahan tenaga kesehatan.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_category', 'VITAMIN_SUPLEMEN', 'Vitamin dan Suplemen', 'Vitamin atau suplemen yang tersedia di unit kesehatan.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_category', 'OBAT_LUAR', 'Obat Luar', 'Obat yang digunakan pada kulit atau pemakaian luar.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_category', 'PERTOLONGAN_PERTAMA', 'Pertolongan Pertama', 'Perlengkapan atau obat untuk pertolongan pertama di unit kesehatan.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'TABLET', 'Tablet', 'Satuan hitung berbentuk tablet.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'KAPSUL', 'Kapsul', 'Satuan hitung berbentuk kapsul.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'BOTOL', 'Botol', 'Satuan kemasan botol.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'STRIP', 'Strip', 'Satuan kemasan strip.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'TUBE', 'Tube', 'Satuan kemasan tube.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'MILILITER', 'Mililiter', 'Satuan volume dalam mililiter.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'SACHET', 'Sachet', 'Satuan kemasan sachet.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'healthcare_medicine_unit', 'DOSIS', 'Dosis', 'Satuan pemakaian berdasarkan dosis.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_asset_category', 'GEDUNG', 'Gedung', 'Bangunan atau bagian bangunan milik pesantren.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_asset_category', 'KENDARAAN', 'Kendaraan', 'Kendaraan operasional yang terdaftar sebagai aset.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_asset_category', 'ELEKTRONIK', 'Perangkat Elektronik', 'Perangkat elektronik dan teknologi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_asset_category', 'MEUBEL', 'Meubel dan Perabot', 'Meja, kursi, lemari, dan perabot lainnya.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_asset_category', 'PERALATAN', 'Peralatan', 'Peralatan operasional yang tidak termasuk kategori aset lain.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_category', 'ATK', 'Alat Tulis Kantor', 'Alat tulis dan kebutuhan administrasi.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_category', 'KEBERSIHAN', 'Perlengkapan Kebersihan', 'Barang habis pakai untuk kebersihan lingkungan.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_category', 'KONSUMSI', 'Konsumsi', 'Bahan konsumsi untuk kegiatan dan operasional.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_category', 'PERLENGKAPAN', 'Perlengkapan Operasional', 'Barang habis pakai untuk mendukung kegiatan operasional.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_category', 'SUKU_CADANG', 'Suku Cadang', 'Suku cadang untuk perawatan sarana dan peralatan.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'PCS', 'Pcs', 'Satuan hitung per buah.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'UNIT', 'Unit', 'Satuan hitung per unit barang.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'BOX', 'Box', 'Satuan kemasan box.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'PACK', 'Pack', 'Satuan kemasan pack.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'RIM', 'Rim', 'Satuan kertas sebanyak satu rim.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'LITER', 'Liter', 'Satuan volume dalam liter.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'KILOGRAM', 'Kilogram', 'Satuan berat dalam kilogram.', NEW.user_id, NEW.user_id)
      ,(NEW.tenant_id, 'ga_inventory_unit', 'ROLL', 'Roll', 'Satuan gulungan roll.', NEW.user_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER profiles_seed_tenant_reference_defaults
  AFTER INSERT OR UPDATE OF role, status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_tenant_reference_defaults_for_admin();

INSERT INTO public.tenant_reference_items (tenant_id, domain, code, name, description, created_by_user_id, updated_by_user_id)
SELECT t.id, seed.domain, seed.code, seed.name, seed.description, p.user_id, p.user_id
FROM public.tenants AS t
CROSS JOIN (VALUES
  ('academic_curriculum', 'FORMAL', 'Formal', 'Kurikulum pendidikan formal.'),
  ('academic_curriculum', 'KEPESANTRENAN', 'Kepesantrenan', 'Kurikulum pendidikan kepesantrenan.'),
  ('academic_assessment_type', 'TUGAS_HARIAN', 'Tugas Harian', 'Penilaian rutin harian.'),
  ('academic_assessment_type', 'ULANGAN', 'Ulangan', 'Penilaian berkala.'),
  ('academic_assessment_type', 'UJIAN', 'Ujian', 'Penilaian akhir atau ujian.'),
  ('finance_fee_type', 'PPDB_REGISTRATION', 'Biaya Pendaftaran PPDB', 'Tagihan pendaftaran calon santri.'),
  ('finance_fee_type', 'PPDB_TUITION', 'Uang Pangkal PPDB', 'Tagihan uang pangkal calon santri.'),
  ('finance_fee_type', 'SPP_BULANAN', 'SPP Bulanan', 'Tagihan pendidikan bulanan.'),
  ('finance_expense_category', 'OPERASIONAL', 'Operasional', 'Pengeluaran operasional umum.'),
  ('finance_expense_category', 'PEMELIHARAAN', 'Pemeliharaan', 'Pengeluaran pemeliharaan sarana.'),
  ('finance_expense_category', 'KONSUMSI', 'Konsumsi', 'Pengeluaran konsumsi.'),
  ('finance_expense_category', 'TRANSPORTASI', 'Transportasi', 'Pengeluaran transportasi.')
  ,('marketplace_product_category', 'SERAGAM', 'Seragam', 'Pakaian dan atribut resmi pesantren.')
  ,('marketplace_product_category', 'BUKU_KITAB', 'Buku dan Kitab', 'Buku pelajaran, kitab, dan bahan bacaan.')
  ,('marketplace_product_category', 'PERLENGKAPAN', 'Perlengkapan Santri', 'Perlengkapan belajar dan kebutuhan santri.')
  ,('marketplace_product_category', 'MAKANAN_MINUMAN', 'Makanan dan Minuman', 'Produk konsumsi yang dijual melalui marketplace.')
  ,('cooperative_product_category', 'KANTIN', 'Makanan dan Minuman', 'Produk konsumsi kantin koperasi.')
  ,('cooperative_product_category', 'PERLENGKAPAN_SANTRI', 'Perlengkapan Santri', 'Barang kebutuhan harian santri.')
  ,('cooperative_product_category', 'BUKU_KITAB', 'Buku dan Kitab', 'Kitab dan buku yang dijual koperasi.')
  ,('cooperative_supplier_category', 'BARANG_UMUM', 'Pemasok Barang', 'Pemasok barang umum untuk operasional koperasi.')
  ,('cooperative_supplier_category', 'BAHAN_PANGAN', 'Pemasok Bahan Pangan', 'Pemasok bahan pangan dan konsumsi.')
  ,('cooperative_supplier_category', 'JASA', 'Penyedia Jasa', 'Penyedia jasa untuk koperasi.')
  ,('library_book_category', 'AKIDAH_AKHLAK', 'Akidah dan Akhlak', 'Buku akidah, adab, dan pembinaan akhlak.')
  ,('library_book_category', 'FIKIH', 'Fikih', 'Buku fikih dan panduan ibadah.')
  ,('library_book_category', 'TAFSIR_HADIS', 'Tafsir dan Hadis', 'Buku tafsir Al-Qur’an dan ilmu hadis.')
  ,('library_book_category', 'BAHASA', 'Bahasa', 'Buku bahasa Arab, Indonesia, dan bahasa lainnya.')
  ,('library_book_category', 'UMUM', 'Umum', 'Bahan bacaan umum dan lintas bidang.')
  ,('healthcare_medicine_category', 'ANALGESIK_ANTIPIRETIK', 'Analgesik dan Antipiretik', 'Obat untuk membantu meredakan nyeri atau demam sesuai kewenangan tenaga kesehatan.')
  ,('healthcare_medicine_category', 'ANTIBIOTIK', 'Antibiotik', 'Obat antibiotik yang penggunaannya harus mengikuti resep dan arahan tenaga kesehatan.')
  ,('healthcare_medicine_category', 'VITAMIN_SUPLEMEN', 'Vitamin dan Suplemen', 'Vitamin atau suplemen yang tersedia di unit kesehatan.')
  ,('healthcare_medicine_category', 'OBAT_LUAR', 'Obat Luar', 'Obat yang digunakan pada kulit atau pemakaian luar.')
  ,('healthcare_medicine_category', 'PERTOLONGAN_PERTAMA', 'Pertolongan Pertama', 'Perlengkapan atau obat untuk pertolongan pertama di unit kesehatan.')
  ,('healthcare_medicine_unit', 'TABLET', 'Tablet', 'Satuan hitung berbentuk tablet.')
  ,('healthcare_medicine_unit', 'KAPSUL', 'Kapsul', 'Satuan hitung berbentuk kapsul.')
  ,('healthcare_medicine_unit', 'BOTOL', 'Botol', 'Satuan kemasan botol.')
  ,('healthcare_medicine_unit', 'STRIP', 'Strip', 'Satuan kemasan strip.')
  ,('healthcare_medicine_unit', 'TUBE', 'Tube', 'Satuan kemasan tube.')
  ,('healthcare_medicine_unit', 'MILILITER', 'Mililiter', 'Satuan volume dalam mililiter.')
  ,('healthcare_medicine_unit', 'SACHET', 'Sachet', 'Satuan kemasan sachet.')
  ,('healthcare_medicine_unit', 'DOSIS', 'Dosis', 'Satuan pemakaian berdasarkan dosis.')
  ,('ga_asset_category', 'GEDUNG', 'Gedung', 'Bangunan atau bagian bangunan milik pesantren.')
  ,('ga_asset_category', 'KENDARAAN', 'Kendaraan', 'Kendaraan operasional yang terdaftar sebagai aset.')
  ,('ga_asset_category', 'ELEKTRONIK', 'Perangkat Elektronik', 'Perangkat elektronik dan teknologi.')
  ,('ga_asset_category', 'MEUBEL', 'Meubel dan Perabot', 'Meja, kursi, lemari, dan perabot lainnya.')
  ,('ga_asset_category', 'PERALATAN', 'Peralatan', 'Peralatan operasional yang tidak termasuk kategori aset lain.')
  ,('ga_inventory_category', 'ATK', 'Alat Tulis Kantor', 'Alat tulis dan kebutuhan administrasi.')
  ,('ga_inventory_category', 'KEBERSIHAN', 'Perlengkapan Kebersihan', 'Barang habis pakai untuk kebersihan lingkungan.')
  ,('ga_inventory_category', 'KONSUMSI', 'Konsumsi', 'Bahan konsumsi untuk kegiatan dan operasional.')
  ,('ga_inventory_category', 'PERLENGKAPAN', 'Perlengkapan Operasional', 'Barang habis pakai untuk mendukung kegiatan operasional.')
  ,('ga_inventory_category', 'SUKU_CADANG', 'Suku Cadang', 'Suku cadang untuk perawatan sarana dan peralatan.')
  ,('ga_inventory_unit', 'PCS', 'Pcs', 'Satuan hitung per buah.')
  ,('ga_inventory_unit', 'UNIT', 'Unit', 'Satuan hitung per unit barang.')
  ,('ga_inventory_unit', 'BOX', 'Box', 'Satuan kemasan box.')
  ,('ga_inventory_unit', 'PACK', 'Pack', 'Satuan kemasan pack.')
  ,('ga_inventory_unit', 'RIM', 'Rim', 'Satuan kertas sebanyak satu rim.')
  ,('ga_inventory_unit', 'LITER', 'Liter', 'Satuan volume dalam liter.')
  ,('ga_inventory_unit', 'KILOGRAM', 'Kilogram', 'Satuan berat dalam kilogram.')
  ,('ga_inventory_unit', 'ROLL', 'Roll', 'Satuan gulungan roll.')
) AS seed(domain, code, name, description)
JOIN LATERAL (
  SELECT user_id FROM public.profiles
  WHERE tenant_id = t.id AND status = 'active' AND role IN ('admin', 'super_admin')
  ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
  LIMIT 1
) AS p ON true
ON CONFLICT DO NOTHING;

ALTER TABLE public.academic_records
  ADD COLUMN class_reference_category TEXT GENERATED ALWAYS AS ('Kelas') STORED,
  ADD COLUMN class_reference_id TEXT,
  ADD COLUMN subject_reference_domain TEXT GENERATED ALWAYS AS ('academic_subject') STORED,
  ADD COLUMN subject_reference_id UUID,
  ADD COLUMN curriculum_reference_domain TEXT GENERATED ALWAYS AS ('academic_curriculum') STORED,
  ADD COLUMN curriculum_reference_id UUID,
  ADD COLUMN assessment_type_reference_domain TEXT GENERATED ALWAYS AS ('academic_assessment_type') STORED,
  ADD COLUMN assessment_type_reference_id UUID,
  ADD COLUMN facility_reference_domain TEXT GENERATED ALWAYS AS ('facility_resource') STORED,
  ADD COLUMN facility_reference_id UUID,
  ADD CONSTRAINT academic_records_tenant_class_reference_fk
    FOREIGN KEY (tenant_id, class_reference_category, class_reference_id)
    REFERENCES public.master_data_records (tenant_id, category, id) ON DELETE RESTRICT,
  ADD CONSTRAINT academic_records_tenant_subject_reference_fk
    FOREIGN KEY (tenant_id, subject_reference_domain, subject_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT academic_records_tenant_curriculum_reference_fk
    FOREIGN KEY (tenant_id, curriculum_reference_domain, curriculum_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT academic_records_tenant_assessment_type_reference_fk
    FOREIGN KEY (tenant_id, assessment_type_reference_domain, assessment_type_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT academic_records_tenant_facility_reference_fk
    FOREIGN KEY (tenant_id, facility_reference_domain, facility_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

CREATE INDEX academic_records_subject_reference_idx
  ON public.academic_records (tenant_id, subject_reference_id, kind, updated_at DESC)
  WHERE subject_reference_id IS NOT NULL;
CREATE INDEX academic_records_class_reference_idx
  ON public.academic_records (tenant_id, class_reference_id, kind, updated_at DESC)
  WHERE class_reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_academic_record_references()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_class_id TEXT;
  v_class_name TEXT;
  v_subject_id UUID;
  v_subject_name TEXT;
  v_curriculum_id UUID;
  v_curriculum_name TEXT;
  v_assessment_type_id UUID;
  v_assessment_type_name TEXT;
  v_facility_id UUID;
  v_facility_name TEXT;
  v_student_class_id TEXT;
  v_scope_unit UUID;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_system = 'legacy_firestore' AND NEW.source_system = 'legacy_firestore'
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.kind IS NOT DISTINCT FROM OLD.kind
    AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id
    AND NEW.record_data IS NOT DISTINCT FROM OLD.record_data THEN RETURN NEW; END IF;

  v_class_id := NULLIF(btrim(NEW.record_data->>'classReferenceId'), '');
  v_scope_unit := NEW.organization_unit_id;
  IF NEW.kind = 'assessment' THEN
    SELECT class_id, organization_unit_id INTO v_student_class_id, v_scope_unit
    FROM public.students WHERE tenant_id = NEW.tenant_id AND id = NEW.student_id;
    v_class_id := v_student_class_id;
  END IF;
  IF NEW.kind IN ('schedule', 'journal') AND v_class_id IS NULL THEN
    RAISE EXCEPTION 'Pilih kelas dari katalog tenant sebelum menyimpan data akademik' USING ERRCODE = '23503';
  END IF;
  IF v_class_id IS NOT NULL THEN
    SELECT name INTO v_class_name FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND category = 'Kelas' AND id = v_class_id
      AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
      AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM v_scope_unit);
    IF v_class_name IS NULL OR NEW.record_data->>'className' IS DISTINCT FROM v_class_name THEN
      RAISE EXCEPTION 'Kelas harus berasal dari referensi aktif tenant dan nama harus cocok' USING ERRCODE = '23503';
    END IF;
  END IF;

  v_subject_id := NULLIF(NEW.record_data->>'subjectReferenceId', '')::UUID;
  IF v_subject_id IS NULL THEN
    RAISE EXCEPTION 'Mata pelajaran harus dipilih dari referensi tenant' USING ERRCODE = '23503';
  END IF;
  SELECT name INTO v_subject_name FROM public.tenant_reference_items
  WHERE tenant_id = NEW.tenant_id AND domain = 'academic_subject' AND id = v_subject_id AND status = 'active'
    AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM v_scope_unit);
  IF v_subject_name IS NULL OR NEW.record_data->>'subject' IS DISTINCT FROM v_subject_name THEN
    RAISE EXCEPTION 'Mata pelajaran tidak aktif atau nama tidak cocok dengan referensi tenant' USING ERRCODE = '23503';
  END IF;

  IF NEW.kind = 'schedule' THEN
    v_curriculum_id := NULLIF(NEW.record_data->>'curriculumReferenceId', '')::UUID;
    IF v_curriculum_id IS NULL THEN
      RAISE EXCEPTION 'Kurikulum harus dipilih dari referensi tenant' USING ERRCODE = '23503';
    END IF;
    SELECT name INTO v_curriculum_name FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_curriculum' AND id = v_curriculum_id AND status = 'active'
      AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM v_scope_unit);
    IF v_curriculum_name IS NULL OR NEW.record_data->>'curriculum' IS DISTINCT FROM v_curriculum_name THEN
      RAISE EXCEPTION 'Kurikulum tidak aktif atau nama tidak cocok dengan referensi tenant' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW.kind = 'assessment' THEN
    v_assessment_type_id := NULLIF(NEW.record_data->>'assessmentTypeReferenceId', '')::UUID;
    IF v_assessment_type_id IS NULL THEN
      RAISE EXCEPTION 'Jenis penilaian harus dipilih dari referensi tenant' USING ERRCODE = '23503';
    END IF;
    SELECT name INTO v_assessment_type_name FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_assessment_type' AND id = v_assessment_type_id AND status = 'active'
      AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM v_scope_unit);
    IF v_assessment_type_name IS NULL OR NEW.record_data->>'assessmentType' IS DISTINCT FROM v_assessment_type_name THEN
      RAISE EXCEPTION 'Jenis penilaian tidak aktif atau nama tidak cocok dengan referensi tenant' USING ERRCODE = '23503';
    END IF;
    IF v_class_id IS NOT NULL AND NEW.record_data->>'className' IS DISTINCT FROM (
      SELECT name FROM public.master_data_records WHERE tenant_id = NEW.tenant_id AND category = 'Kelas' AND id = v_class_id
        AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM v_scope_unit)
    ) THEN
      RAISE EXCEPTION 'Kelas penilaian harus mengikuti kelas santri yang dipilih' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF NULLIF(btrim(NEW.record_data->>'room'), '') IS NOT NULL THEN
    v_facility_id := NULLIF(NEW.record_data->>'facilityReferenceId', '')::UUID;
    IF v_facility_id IS NULL THEN
      RAISE EXCEPTION 'Ruang harus dipilih dari fasilitas tenant' USING ERRCODE = '23503';
    END IF;
    SELECT name INTO v_facility_name FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'facility_resource' AND id = v_facility_id AND status = 'active'
      AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM v_scope_unit);
    IF v_facility_name IS NULL OR NEW.record_data->>'room' IS DISTINCT FROM v_facility_name THEN
      RAISE EXCEPTION 'Ruang tidak aktif atau nama tidak cocok dengan fasilitas tenant' USING ERRCODE = '23503';
    END IF;
  END IF;

  NEW.class_reference_id := v_class_id;
  NEW.subject_reference_id := v_subject_id;
  NEW.curriculum_reference_id := v_curriculum_id;
  NEW.assessment_type_reference_id := v_assessment_type_id;
  NEW.facility_reference_id := v_facility_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER academic_records_link_references
  BEFORE INSERT OR UPDATE OF tenant_id, kind, student_id, record_data, source_system
  ON public.academic_records
  FOR EACH ROW EXECUTE FUNCTION public.link_academic_record_references();

ALTER TABLE public.facility_bookings
  ADD COLUMN facility_reference_domain TEXT GENERATED ALWAYS AS ('facility_resource') STORED,
  ADD COLUMN facility_reference_id UUID,
  ADD CONSTRAINT facility_bookings_tenant_facility_reference_fk
    FOREIGN KEY (tenant_id, facility_reference_domain, facility_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
CREATE INDEX facility_bookings_tenant_resource_schedule_idx
  ON public.facility_bookings (tenant_id, facility_reference_id, booking_date, start_time, end_time)
  WHERE facility_reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_facility_booking_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_resource public.tenant_reference_items%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.source_system = 'legacy_firestore' AND NEW.source_system = 'legacy_firestore'
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.room_name IS NOT DISTINCT FROM OLD.room_name
    AND OLD.facility_reference_id IS NULL AND NEW.facility_reference_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_resource FROM public.tenant_reference_items
  WHERE tenant_id = NEW.tenant_id AND domain = 'facility_resource'
    AND lower(btrim(name)) = lower(btrim(NEW.room_name)) AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pilih fasilitas aktif dari katalog tenant sebelum membuat pemesanan' USING ERRCODE = '23503';
  END IF;
  NEW.facility_reference_id := v_resource.id;
  NEW.room_name := v_resource.name;
  RETURN NEW;
END;
$$;
CREATE TRIGGER facility_bookings_link_reference
  BEFORE INSERT OR UPDATE OF tenant_id, room_name, facility_reference_id, source_system ON public.facility_bookings
  FOR EACH ROW EXECUTE FUNCTION public.link_facility_booking_reference();

ALTER TABLE public.finance_bills
  ADD COLUMN fee_type_reference_domain TEXT GENERATED ALWAYS AS ('finance_fee_type') STORED,
  ADD COLUMN fee_type_reference_id UUID,
  ADD CONSTRAINT finance_bills_tenant_fee_type_reference_fk
    FOREIGN KEY (tenant_id, fee_type_reference_domain, fee_type_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
CREATE INDEX finance_bills_tenant_fee_type_idx
  ON public.finance_bills (tenant_id, fee_type_reference_id, bill_date DESC)
  WHERE fee_type_reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_finance_bill_fee_type()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_reference public.tenant_reference_items%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.fee_type_reference_id IS NULL AND NEW.fee_type_reference_id IS NULL
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.fee_type IS NOT DISTINCT FROM OLD.fee_type THEN RETURN NEW; END IF;
  SELECT * INTO v_reference FROM public.tenant_reference_items
  WHERE tenant_id = NEW.tenant_id AND domain = 'finance_fee_type'
    AND lower(btrim(name)) = lower(btrim(NEW.fee_type)) AND status = 'active'
    AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM NEW.organization_unit_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Jenis tagihan wajib dipilih dari kategori aktif tenant' USING ERRCODE = '23503'; END IF;
  NEW.fee_type_reference_id := v_reference.id;
  NEW.fee_type := v_reference.name;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_bills_link_fee_type
  BEFORE INSERT OR UPDATE OF tenant_id, fee_type, fee_type_reference_id ON public.finance_bills
  FOR EACH ROW EXECUTE FUNCTION public.link_finance_bill_fee_type();

ALTER TABLE public.finance_expenses
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('finance_expense_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD CONSTRAINT finance_expenses_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
CREATE INDEX finance_expenses_tenant_category_idx
  ON public.finance_expenses (tenant_id, category_reference_id, expense_date DESC)
  WHERE category_reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_finance_expense_category()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_reference public.tenant_reference_items%ROWTYPE; v_unit_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.category_reference_id IS NULL AND NEW.category_reference_id IS NULL
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.category IS NOT DISTINCT FROM OLD.category
    AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
    AND NEW.department IS NOT DISTINCT FROM OLD.department THEN RETURN NEW; END IF;
  SELECT * INTO v_reference FROM public.tenant_reference_items
  WHERE tenant_id = NEW.tenant_id AND domain = 'finance_expense_category'
    AND lower(btrim(name)) = lower(btrim(NEW.category)) AND status = 'active'
    AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM NEW.unit_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Kategori pengeluaran wajib dipilih dari kategori aktif tenant' USING ERRCODE = '23503'; END IF;
  NEW.category_reference_id := v_reference.id;
  NEW.category := v_reference.name;
  IF NEW.unit_id IS NOT NULL THEN
    SELECT name INTO v_unit_name FROM public.organization_units
    WHERE tenant_id = NEW.tenant_id AND id = NEW.unit_id AND status = 'active';
    IF v_unit_name IS NULL THEN RAISE EXCEPTION 'Bagian pengeluaran harus berupa unit aktif milik tenant' USING ERRCODE = '23503'; END IF;
    NEW.department := v_unit_name;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_expenses_link_category
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id, unit_id ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.link_finance_expense_category();

-- Extend the same catalog contract to merchandise, suppliers, the library,
-- healthcare medicine inventory, and General Affairs asset registers.
ALTER TABLE public.marketplace_products
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('marketplace_product_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD CONSTRAINT marketplace_products_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
ALTER TABLE public.cooperative_products
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('cooperative_product_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD CONSTRAINT cooperative_products_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
ALTER TABLE public.cooperative_suppliers
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('cooperative_supplier_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD CONSTRAINT cooperative_suppliers_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
ALTER TABLE public.library_books
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('library_book_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD CONSTRAINT library_books_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
ALTER TABLE public.healthcare_medicines
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('healthcare_medicine_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD COLUMN unit_reference_domain TEXT GENERATED ALWAYS AS ('healthcare_medicine_unit') STORED,
  ADD COLUMN unit_reference_id UUID,
  ADD CONSTRAINT healthcare_medicines_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT healthcare_medicines_tenant_unit_reference_fk
    FOREIGN KEY (tenant_id, unit_reference_domain, unit_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
ALTER TABLE public.ga_facilities
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('ga_asset_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD CONSTRAINT ga_facilities_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;
ALTER TABLE public.ga_inventory_items
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('ga_inventory_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD COLUMN unit_reference_domain TEXT GENERATED ALWAYS AS ('ga_inventory_unit') STORED,
  ADD COLUMN unit_reference_id UUID,
  ADD CONSTRAINT ga_inventory_items_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT ga_inventory_items_tenant_unit_reference_fk
    FOREIGN KEY (tenant_id, unit_reference_domain, unit_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

CREATE INDEX marketplace_products_tenant_category_reference_idx ON public.marketplace_products (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;
CREATE INDEX cooperative_products_tenant_category_reference_idx ON public.cooperative_products (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;
CREATE INDEX cooperative_suppliers_tenant_category_reference_idx ON public.cooperative_suppliers (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;
CREATE INDEX library_books_tenant_category_reference_idx ON public.library_books (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;
CREATE INDEX healthcare_medicines_tenant_category_reference_idx ON public.healthcare_medicines (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;
CREATE INDEX healthcare_medicines_tenant_unit_reference_idx ON public.healthcare_medicines (tenant_id, unit_reference_id) WHERE unit_reference_id IS NOT NULL;
CREATE INDEX ga_facilities_tenant_category_reference_idx ON public.ga_facilities (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;
CREATE INDEX ga_inventory_items_tenant_category_reference_idx ON public.ga_inventory_items (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;
CREATE INDEX ga_inventory_items_tenant_unit_reference_idx ON public.ga_inventory_items (tenant_id, unit_reference_id) WHERE unit_reference_id IS NOT NULL;

-- HRIS departments must be selected from the tenant's organizational units.
ALTER TABLE public.hris_employees
  ADD COLUMN organization_unit_id UUID,
  ADD CONSTRAINT hris_employees_tenant_organization_unit_fk
    FOREIGN KEY (tenant_id, organization_unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX hris_employees_tenant_unit_idx
  ON public.hris_employees (tenant_id, organization_unit_id, employment_status, full_name)
  WHERE organization_unit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_hris_employee_organization_unit()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_unit public.organization_units%ROWTYPE; v_requested_id UUID; v_match_count BIGINT;
BEGIN
  v_requested_id := NULLIF(current_setting('erp.hris_employee_organization_unit_id', true), '')::UUID;
  IF v_requested_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.organization_units
    WHERE tenant_id = NEW.tenant_id AND id = v_requested_id AND status = 'active';
  ELSIF NEW.organization_unit_id IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.organization_units
    WHERE tenant_id = NEW.tenant_id AND id = NEW.organization_unit_id AND status = 'active';
  ELSE
    SELECT count(*), (array_agg(id))[1], (array_agg(name))[1]
      INTO v_match_count, v_unit.id, v_unit.name
    FROM public.organization_units
    WHERE tenant_id = NEW.tenant_id AND lower(btrim(name)) = lower(btrim(NEW.department)) AND status = 'active';
    IF v_match_count = 1 THEN v_unit.tenant_id := NEW.tenant_id; END IF;
  END IF;
  IF v_unit.id IS NULL THEN RAISE EXCEPTION 'Unit kerja harus dipilih dari unit organisasi aktif tenant' USING ERRCODE = '23503'; END IF;
  NEW.organization_unit_id := v_unit.id;
  NEW.department := v_unit.name;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hris_employees_link_organization_unit
  BEFORE INSERT OR UPDATE OF tenant_id, department, organization_unit_id ON public.hris_employees
  FOR EACH ROW EXECUTE FUNCTION public.link_hris_employee_organization_unit();

CREATE OR REPLACE FUNCTION public.upsert_hris_employee_with_unit(
  p_tenant_id UUID, p_actor_user_id UUID, p_employee_id UUID, p_employee_number TEXT,
  p_full_name TEXT, p_job_title TEXT, p_organization_unit_id UUID, p_email TEXT,
  p_phone TEXT, p_hire_date DATE, p_employment_status TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_unit public.organization_units%ROWTYPE; v_result JSONB;
BEGIN
  SELECT * INTO v_unit FROM public.organization_units
  WHERE tenant_id = p_tenant_id AND id = p_organization_unit_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'Unit kerja aktif tidak ditemukan pada tenant ini' USING ERRCODE = '23503'; END IF;
  PERFORM set_config('erp.hris_employee_organization_unit_id', v_unit.id::TEXT, true);
  v_result := public.upsert_hris_employee(
    p_tenant_id, p_actor_user_id, p_employee_id, p_employee_number, p_full_name,
    p_job_title, v_unit.name, p_email, p_phone, p_hire_date, p_employment_status, p_client_request_id
  );
  PERFORM set_config('erp.hris_employee_organization_unit_id', '', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('erp.hris_employee_organization_unit_id', '', true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_hris_employee_with_unit(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hris_employee_with_unit(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, DATE, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.link_operational_catalog_category()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_domain TEXT; v_unit_domain TEXT; v_reference public.tenant_reference_items%ROWTYPE; v_unit_reference public.tenant_reference_items%ROWTYPE;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'marketplace_products' THEN v_domain := 'marketplace_product_category';
    WHEN 'cooperative_products' THEN v_domain := 'cooperative_product_category';
    WHEN 'cooperative_suppliers' THEN v_domain := 'cooperative_supplier_category';
    WHEN 'library_books' THEN v_domain := 'library_book_category';
    WHEN 'healthcare_medicines' THEN v_domain := 'healthcare_medicine_category'; v_unit_domain := 'healthcare_medicine_unit';
    WHEN 'ga_facilities' THEN v_domain := 'ga_asset_category';
    WHEN 'ga_inventory_items' THEN v_domain := 'ga_inventory_category'; v_unit_domain := 'ga_inventory_unit';
    ELSE RAISE EXCEPTION 'Tabel referensi tidak didukung' USING ERRCODE = '22023';
  END CASE;

  -- Keep old imported rows readable when their historical category cannot be
  -- mapped. Any changed category and every new row must resolve to a live item.
  IF TG_OP = 'UPDATE' AND OLD.category_reference_id IS NULL AND NEW.category_reference_id IS NULL
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.category IS NOT DISTINCT FROM OLD.category THEN
    IF v_unit_domain IS NOT NULL THEN
      IF OLD.unit_reference_id IS NULL AND NEW.unit_reference_id IS NULL AND NEW.unit IS NOT DISTINCT FROM OLD.unit THEN
        IF TG_TABLE_NAME IN ('healthcare_medicines', 'ga_facilities', 'ga_inventory_items')
          AND OLD.source_system IN ('legacy_firestore', 'legacy_import')
          AND NEW.source_system IS NOT DISTINCT FROM OLD.source_system THEN RETURN NEW; END IF;
      END IF;
    END IF;
    IF TG_TABLE_NAME = 'marketplace_products' THEN
      IF OLD.source_system = 'legacy_firestore' AND NEW.source_system IS NOT DISTINCT FROM OLD.source_system THEN RETURN NEW; END IF;
    ELSIF TG_TABLE_NAME IN ('library_books', 'healthcare_medicines', 'ga_facilities', 'ga_inventory_items') THEN
      IF (OLD.source_system = 'legacy_import' OR OLD.source_system = 'legacy_firestore')
        AND NEW.source_system IS NOT DISTINCT FROM OLD.source_system THEN RETURN NEW; END IF;
    END IF;
  END IF;

  IF NEW.category_reference_id IS NOT NULL THEN
    SELECT * INTO v_reference FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = v_domain AND id = NEW.category_reference_id AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kategori harus cocok dengan referensi tenant yang aktif' USING ERRCODE = '23503';
    END IF;
    NEW.category := v_reference.name;
  ELSE
    SELECT * INTO v_reference FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = v_domain
      AND lower(btrim(name)) = lower(btrim(NEW.category)) AND status = 'active';
    IF NOT FOUND THEN RAISE EXCEPTION 'Pilih kategori aktif dari katalog tenant' USING ERRCODE = '23503'; END IF;
    NEW.category_reference_id := v_reference.id;
    NEW.category := v_reference.name;
  END IF;
  IF v_unit_domain IS NOT NULL THEN
    IF NEW.unit_reference_id IS NOT NULL THEN
      SELECT * INTO v_unit_reference FROM public.tenant_reference_items
      WHERE tenant_id = NEW.tenant_id AND domain = v_unit_domain AND id = NEW.unit_reference_id AND status = 'active';
      IF NOT FOUND THEN RAISE EXCEPTION 'Satuan harus berasal dari referensi tenant yang aktif' USING ERRCODE = '23503'; END IF;
      NEW.unit := v_unit_reference.name;
    ELSE
      SELECT * INTO v_unit_reference FROM public.tenant_reference_items
      WHERE tenant_id = NEW.tenant_id AND domain = v_unit_domain
        AND lower(btrim(name)) = lower(btrim(NEW.unit)) AND status = 'active';
      IF NOT FOUND THEN RAISE EXCEPTION 'Pilih satuan aktif dari katalog tenant' USING ERRCODE = '23503'; END IF;
      NEW.unit_reference_id := v_unit_reference.id;
      NEW.unit := v_unit_reference.name;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER marketplace_products_link_category
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id, source_system ON public.marketplace_products
  FOR EACH ROW EXECUTE FUNCTION public.link_operational_catalog_category();
CREATE TRIGGER cooperative_products_link_category
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id ON public.cooperative_products
  FOR EACH ROW EXECUTE FUNCTION public.link_operational_catalog_category();
CREATE TRIGGER cooperative_suppliers_link_category
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id ON public.cooperative_suppliers
  FOR EACH ROW EXECUTE FUNCTION public.link_operational_catalog_category();
CREATE TRIGGER library_books_link_category
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id, source_system ON public.library_books
  FOR EACH ROW EXECUTE FUNCTION public.link_operational_catalog_category();
CREATE TRIGGER healthcare_medicines_link_references
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id, unit, unit_reference_id, source_system ON public.healthcare_medicines
  FOR EACH ROW EXECUTE FUNCTION public.link_operational_catalog_category();
CREATE TRIGGER ga_facilities_link_category
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id, source_system ON public.ga_facilities
  FOR EACH ROW EXECUTE FUNCTION public.link_operational_catalog_category();
CREATE TRIGGER ga_inventory_items_link_references
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id, unit, unit_reference_id, source_system ON public.ga_inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.link_operational_catalog_category();

-- Budget allocations use the shared finance category catalog and derive their
-- department from the owning budget plan's organization unit.
ALTER TABLE public.finance_budget_lines
  ADD COLUMN category_reference_domain TEXT GENERATED ALWAYS AS ('finance_expense_category') STORED,
  ADD COLUMN category_reference_id UUID,
  ADD COLUMN organization_unit_id UUID,
  ADD CONSTRAINT finance_budget_lines_tenant_category_reference_fk
    FOREIGN KEY (tenant_id, category_reference_domain, category_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT finance_budget_lines_tenant_unit_fk
    FOREIGN KEY (tenant_id, organization_unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;
CREATE INDEX finance_budget_lines_tenant_category_reference_idx ON public.finance_budget_lines (tenant_id, category_reference_id) WHERE category_reference_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.link_finance_budget_line_references()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_plan_unit UUID; v_unit_name TEXT; v_reference public.tenant_reference_items%ROWTYPE;
BEGIN
  SELECT p.unit_id, u.name INTO v_plan_unit, v_unit_name
  FROM public.finance_budget_plans p
  JOIN public.organization_units u ON u.tenant_id = p.tenant_id AND u.id = p.unit_id AND u.status = 'active'
  WHERE p.tenant_id = NEW.tenant_id AND p.id = NEW.plan_id;
  IF v_plan_unit IS NULL OR v_unit_name IS NULL THEN
    RAISE EXCEPTION 'Rencana anggaran harus terhubung ke unit tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO v_reference FROM public.tenant_reference_items
  WHERE tenant_id = NEW.tenant_id AND domain = 'finance_expense_category'
    AND lower(btrim(name)) = lower(btrim(NEW.category)) AND status = 'active'
    AND (organization_unit_id IS NULL OR organization_unit_id = v_plan_unit);
  IF NOT FOUND THEN RAISE EXCEPTION 'Kategori rincian anggaran harus dipilih dari kategori keuangan aktif' USING ERRCODE = '23503'; END IF;
  NEW.organization_unit_id := v_plan_unit;
  NEW.department := v_unit_name;
  NEW.category_reference_id := v_reference.id;
  NEW.category := v_reference.name;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_budget_lines_link_references
  BEFORE INSERT OR UPDATE OF tenant_id, plan_id, department, category, category_reference_id, organization_unit_id ON public.finance_budget_lines
  FOR EACH ROW EXECUTE FUNCTION public.link_finance_budget_line_references();

-- Backfill only unambiguous historical labels. Unmatched records remain intact and
-- are intentionally not assigned a guessed category.
UPDATE public.academic_records AS a SET
  class_reference_id = (SELECT (array_agg(m.id))[1] FROM public.master_data_records m
    WHERE m.tenant_id = a.tenant_id AND m.category = 'Kelas'
      AND lower(btrim(m.name)) = lower(btrim(a.record_data->>'className')) HAVING count(*) = 1),
  subject_reference_id = (SELECT (array_agg(r.id))[1] FROM public.tenant_reference_items r
    WHERE r.tenant_id = a.tenant_id AND r.domain = 'academic_subject'
      AND lower(btrim(r.name)) = lower(btrim(a.record_data->>'subject')) HAVING count(*) = 1),
  curriculum_reference_id = (SELECT (array_agg(r.id))[1] FROM public.tenant_reference_items r
    WHERE r.tenant_id = a.tenant_id AND r.domain = 'academic_curriculum'
      AND lower(btrim(r.name)) = lower(btrim(a.record_data->>'curriculum')) HAVING count(*) = 1),
  assessment_type_reference_id = (SELECT (array_agg(r.id))[1] FROM public.tenant_reference_items r
    WHERE r.tenant_id = a.tenant_id AND r.domain = 'academic_assessment_type'
      AND lower(btrim(r.name)) = lower(btrim(a.record_data->>'assessmentType')) HAVING count(*) = 1),
  facility_reference_id = (SELECT (array_agg(r.id))[1] FROM public.tenant_reference_items r
    WHERE r.tenant_id = a.tenant_id AND r.domain = 'facility_resource'
      AND lower(btrim(r.name)) = lower(btrim(a.record_data->>'room')) HAVING count(*) = 1)
WHERE a.deleted_at IS NULL
  AND (a.record_data ? 'className' OR a.record_data ? 'subject');

UPDATE public.facility_bookings AS b SET facility_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE b.tenant_id = r.tenant_id AND r.domain = 'facility_resource'
  AND lower(btrim(b.room_name)) = lower(btrim(r.name))
  AND b.facility_reference_id IS NULL;

UPDATE public.finance_bills AS b SET fee_type_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE b.tenant_id = r.tenant_id AND r.domain = 'finance_fee_type'
  AND lower(btrim(b.fee_type)) = lower(btrim(r.name))
  AND b.fee_type_reference_id IS NULL;

UPDATE public.finance_expenses AS e SET category_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE e.tenant_id = r.tenant_id AND r.domain = 'finance_expense_category'
  AND lower(btrim(e.category)) = lower(btrim(r.name))
  AND e.category_reference_id IS NULL;

UPDATE public.marketplace_products AS p SET category_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE p.tenant_id = r.tenant_id AND r.domain = 'marketplace_product_category'
  AND lower(btrim(p.category)) = lower(btrim(r.name)) AND p.category_reference_id IS NULL
  AND p.source_system <> 'legacy_firestore';
UPDATE public.cooperative_products AS p SET category_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE p.tenant_id = r.tenant_id AND r.domain = 'cooperative_product_category'
  AND lower(btrim(p.category)) = lower(btrim(r.name)) AND p.category_reference_id IS NULL;
UPDATE public.cooperative_suppliers AS s SET category_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE s.tenant_id = r.tenant_id AND r.domain = 'cooperative_supplier_category'
  AND lower(btrim(s.category)) = lower(btrim(r.name)) AND s.category_reference_id IS NULL;
UPDATE public.library_books AS b SET category_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE b.tenant_id = r.tenant_id AND r.domain = 'library_book_category'
  AND lower(btrim(b.category)) = lower(btrim(r.name)) AND b.category_reference_id IS NULL;
UPDATE public.healthcare_medicines AS m SET
  category_reference_id = (SELECT r.id FROM public.tenant_reference_items r
    WHERE r.tenant_id = m.tenant_id AND r.domain = 'healthcare_medicine_category'
      AND lower(btrim(m.category)) = lower(btrim(r.name)) AND r.status = 'active' LIMIT 1),
  unit_reference_id = (SELECT r.id FROM public.tenant_reference_items r
    WHERE r.tenant_id = m.tenant_id AND r.domain = 'healthcare_medicine_unit'
      AND lower(btrim(m.unit)) = lower(btrim(r.name)) AND r.status = 'active' LIMIT 1)
WHERE m.category_reference_id IS NULL AND m.unit_reference_id IS NULL
  AND EXISTS (SELECT 1 FROM public.tenant_reference_items r WHERE r.tenant_id = m.tenant_id AND r.domain = 'healthcare_medicine_category' AND lower(btrim(m.category)) = lower(btrim(r.name)) AND r.status = 'active')
  AND EXISTS (SELECT 1 FROM public.tenant_reference_items r WHERE r.tenant_id = m.tenant_id AND r.domain = 'healthcare_medicine_unit' AND lower(btrim(m.unit)) = lower(btrim(r.name)) AND r.status = 'active');
UPDATE public.ga_facilities AS a SET category_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE a.tenant_id = r.tenant_id AND r.domain = 'ga_asset_category'
  AND lower(btrim(a.category)) = lower(btrim(r.name)) AND a.category_reference_id IS NULL;
UPDATE public.ga_inventory_items AS i SET
  category_reference_id = (SELECT r.id FROM public.tenant_reference_items r
    WHERE r.tenant_id = i.tenant_id AND r.domain = 'ga_inventory_category'
      AND lower(btrim(i.category)) = lower(btrim(r.name)) AND r.status = 'active' LIMIT 1),
  unit_reference_id = (SELECT r.id FROM public.tenant_reference_items r
    WHERE r.tenant_id = i.tenant_id AND r.domain = 'ga_inventory_unit'
      AND lower(btrim(i.unit)) = lower(btrim(r.name)) AND r.status = 'active' LIMIT 1)
WHERE i.category_reference_id IS NULL AND i.unit_reference_id IS NULL
  AND EXISTS (SELECT 1 FROM public.tenant_reference_items r WHERE r.tenant_id = i.tenant_id AND r.domain = 'ga_inventory_category' AND lower(btrim(i.category)) = lower(btrim(r.name)) AND r.status = 'active')
  AND EXISTS (SELECT 1 FROM public.tenant_reference_items r WHERE r.tenant_id = i.tenant_id AND r.domain = 'ga_inventory_unit' AND lower(btrim(i.unit)) = lower(btrim(r.name)) AND r.status = 'active');
UPDATE public.finance_budget_lines AS l SET category_reference_id = r.id
FROM public.tenant_reference_items AS r
WHERE l.tenant_id = r.tenant_id AND r.domain = 'finance_expense_category'
  AND lower(btrim(l.category)) = lower(btrim(r.name)) AND l.category_reference_id IS NULL;

UPDATE public.finance_budget_lines AS l SET organization_unit_id = p.unit_id, department = u.name
FROM public.finance_budget_plans AS p
JOIN public.organization_units AS u ON u.tenant_id = p.tenant_id AND u.id = p.unit_id AND u.status = 'active'
WHERE l.tenant_id = p.tenant_id AND l.plan_id = p.id AND l.organization_unit_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.tenant_reference_items r
    WHERE r.tenant_id = l.tenant_id AND r.domain = 'finance_expense_category'
      AND r.id = l.category_reference_id AND r.status = 'active'
  );

UPDATE public.hris_employees AS e SET organization_unit_id = u.id
FROM public.organization_units AS u
WHERE e.tenant_id = u.tenant_id AND lower(btrim(e.department)) = lower(btrim(u.name))
  AND u.status = 'active' AND e.organization_unit_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.organization_units AS other_unit
    WHERE other_unit.tenant_id = u.tenant_id AND other_unit.status = 'active'
      AND lower(btrim(other_unit.name)) = lower(btrim(u.name)) AND other_unit.id <> u.id
  );

REVOKE ALL ON FUNCTION public.link_academic_record_references() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_facility_booking_reference() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_finance_bill_fee_type() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_finance_expense_category() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_operational_catalog_category() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.link_hris_employee_organization_unit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_hris_employee_with_unit(UUID, UUID, UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, DATE, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_finance_budget_line_references() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.seed_tenant_reference_defaults_for_admin() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.tenant_reference_items IS
  'Tenant-owned, categorized reference values. `name` is the selectable label; `description` explains the meaning without duplicating the label.';
COMMENT ON COLUMN public.finance_expenses.department IS
  'Compatibility label derived by a database trigger from the linked organization unit; new user input must use unit_id.';

COMMIT;
