BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('c9100000-0000-4000-8000-000000000001', 'naming-series-test', 'Naming Series Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c9100000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','naming-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('c9100000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','naming-staff@test.invalid','',now(),'{}','{}',now(),now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('c9100000-0000-4000-8000-000000000011','c9100000-0000-4000-8000-000000000001','naming-admin@test.invalid','Admin Naming','admin','active','{"master-data":true,"hris":true,"document":true,"finance":true,"ga":true}'),
  ('c9100000-0000-4000-8000-000000000012','c9100000-0000-4000-8000-000000000001','naming-staff@test.invalid','Staf Naming','ustadz','active','{"master-data":true}');

INSERT INTO public.organization_units (id, tenant_id, code, name, unit_type, created_by_user_id, updated_by_user_id)
VALUES ('c9100000-0000-4000-8000-000000000031','c9100000-0000-4000-8000-000000000001',
  'PONDOK','Pesantren Uji','pesantren','c9100000-0000-4000-8000-000000000011',
  'c9100000-0000-4000-8000-000000000011');
INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
) VALUES (
  'c9100000-0000-4000-8000-000000000001','hris_job_title','STAF_UJI','Staf Uji',
  'Jabatan sintetis untuk menguji pembuatan nomor pegawai otomatis.','active',
  'c9100000-0000-4000-8000-000000000011','c9100000-0000-4000-8000-000000000011'
);
SELECT is((SELECT count(*)::INTEGER FROM public.tenant_naming_series
  WHERE tenant_id='c9100000-0000-4000-8000-000000000001'), 15,
  'tenant baru memperoleh seri identitas untuk seluruh modul operasional');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.tenant_naming_series'::regclass
    AND contype = 'c' AND convalidated
    AND pg_get_constraintdef(oid) ILIKE '%description%'
    AND pg_get_constraintdef(oid) ILIKE '%display_name%'
), 'validasi deskripsi dan nama seri tetap dipertahankan saat daftar seri diperluas');
SELECT ok(EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.tenant_naming_series'::regclass
    AND conname = 'tenant_naming_series_key_module_check' AND convalidated
    AND pg_get_constraintdef(oid) ILIKE '%building_code%'
), 'setiap seri terikat ke modul pemilik yang benar');
SELECT ok((SELECT count(*) = 4 AND bool_and(relrowsecurity AND relforcerowsecurity)
  FROM pg_class WHERE oid = ANY(ARRAY[
    'public.tenant_naming_series'::regclass,
    'public.tenant_naming_series_counters'::regclass,
    'public.tenant_naming_series_allocations'::regclass,
    'public.tenant_naming_series_events'::regclass
  ])), 'semua tabel konfigurasi dan alokasi menerapkan RLS paksa');
SELECT ok(NOT has_table_privilege('anon','public.tenant_naming_series','SELECT'),
  'pengguna anonim tidak dapat membaca aturan nomor');
SELECT ok(NOT has_table_privilege('authenticated','public.tenant_naming_series','SELECT'),
  'klien browser tidak dapat membaca aturan nomor secara langsung');
SELECT ok(NOT has_function_privilege('anon','public.allocate_tenant_naming_series(uuid,text,date,jsonb)','EXECUTE'),
  'pengguna anonim tidak dapat meminta nomor');
SELECT ok(NOT has_function_privilege('authenticated','public.allocate_tenant_naming_series(uuid,text,date,jsonb)','EXECUTE'),
  'klien browser tidak dapat meminta nomor langsung');
SELECT ok(has_function_privilege('service_role','public.allocate_tenant_naming_series(uuid,text,date,jsonb)','EXECUTE'),
  'hanya server tepercaya yang dapat meminta nomor');
SELECT ok(NOT has_function_privilege('anon','public.save_tenant_naming_series(uuid,uuid,text,text,smallint,text,bigint,boolean,uuid)','EXECUTE'),
  'pengguna anonim tidak dapat mengubah Naming Series');
SELECT ok(NOT has_function_privilege('authenticated','public.save_tenant_naming_series(uuid,uuid,text,text,smallint,text,bigint,boolean,uuid)','EXECUTE'),
  'klien browser tidak dapat mengubah Naming Series secara langsung');
SELECT ok(has_function_privilege('service_role','public.save_tenant_naming_series(uuid,uuid,text,text,smallint,text,bigint,boolean,uuid)','EXECUTE'),
  'server tepercaya dapat menyimpan Naming Series setelah validasi Admin');
SELECT ok(has_function_privilege('service_role','public.allocate_tenant_extended_naming_series(uuid,text,date,uuid)','EXECUTE'),
  'server tepercaya dapat meminta nomor semua modul bisnis');
SELECT ok(has_function_privilege('service_role','public.save_tenant_extended_naming_series(uuid,uuid,text,text,smallint,text,bigint,boolean,uuid)','EXECUTE'),
  'server tepercaya dapat mengatur seri tambahan setelah pemeriksaan Admin tenant');
SELECT ok(NOT has_function_privilege('service_role','public.allocate_tenant_additional_naming_series(uuid,text,date,uuid)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.save_tenant_additional_naming_series(uuid,uuid,text,text,smallint,text,bigint,boolean,uuid)','EXECUTE'),
  'helper internal seri tambahan tidak dapat dipanggil langsung melalui Data API');
SELECT ok(has_function_privilege('service_role','public.manage_waqf_asset(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.manage_cooperative_product(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.manage_marketplace_product(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.record_donation(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.create_tenant_laundry_order(uuid,uuid,uuid,numeric,integer,uuid)','EXECUTE'),
  'API operasional menerima operasi penomoran hanya melalui prosedur backend tepercaya');
SELECT ok(has_function_privilege('service_role','public.manage_ga_inventory_item(uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.manage_ga_inventory_item_with_legacy_code(uuid,uuid,jsonb)','EXECUTE'),
  'pencatatan inventaris hanya dapat memakai RPC berlapis penerbit nomor otomatis');
SELECT ok(EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
  AND indexname='document_records_tenant_number_normalized_uq'),
  'nomor dokumen unik walau kapitalisasi dan spasi berbeda');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
  AND indexname='document_records_tenant_document_number_uq'),
  'indeks unik lama yang menduplikasi aturan nomor dokumen sudah dihapus');
SELECT ok((SELECT count(*) = 5 FROM pg_indexes WHERE schemaname='public' AND indexname IN (
  'donations_tenant_receipt_normalized_uq','waqf_assets_tenant_asset_code_normalized_uq',
  'laundry_orders_tenant_order_number_normalized_uq','cooperative_products_tenant_sku_normalized_uq',
  'marketplace_products_tenant_sku_normalized_uq')),
  'kode dan nomor donasi, wakaf, laundry, koperasi, dan marketplace unik setelah normalisasi');
SELECT ok((SELECT count(*) = 6 AND bool_and(convalidated)
  FROM pg_constraint WHERE conname IN (
    'student_room_history_previous_room_fk','student_room_history_room_fk',
    'student_room_history_previous_building_fk','student_room_history_building_fk',
    'student_room_history_changed_by_fk','library_digital_asset_reservation_asset_fk'
  )), 'seluruh relasi riwayat kamar dan aset upload sudah tervalidasi');

SET LOCAL ROLE service_role;

SELECT is(public.allocate_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','nis','2026-11-01','{"grade":"02"}'::JSONB),
  '2026020001','NIS pertama menggabungkan tahun, kode jenjang, dan urutan');
SELECT is(public.allocate_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','nis','2026-11-01','{"grade":"02"}'::JSONB),
  '2026020002','NIS berikutnya memakai urutan atomik tenant dan jenjang yang sama');
SELECT is(public.allocate_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','nis','2026-11-01','{"grade":"03"}'::JSONB),
  '2026030001','jenjang lain memiliki urutan yang terpisah namun tetap unik');
SELECT is(public.allocate_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','ppdb_registration','2026-11-01','{}'::JSONB),
  'PPDB-2026-000001','nomor pendaftar memakai pola tenant yang dapat dikonfigurasi');
SELECT is(public.upsert_hris_employee_with_unit(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  'c9100000-0000-4000-8000-000000000041',NULL,'Pegawai Uji','Staf Uji',
  'c9100000-0000-4000-8000-000000000031',NULL,'081234567890','2026-11-01','active',
  'c9100000-0000-4000-8000-000000000051')->>'employeeNumber',
  'PEG-2026-00001','pembuatan pegawai mengisi nomor dari seri tenant dalam transaksi yang sama');
SELECT is(public.allocate_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','employee_number','2026-11-01','{}'::JSONB),
  'PEG-2026-00002','alokasi selanjutnya tidak mengulang nomor pegawai yang baru disimpan');
SELECT throws_ok(
  $$SELECT public.upsert_hris_employee(
    'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
    'c9100000-0000-4000-8000-000000000042','PEG-MANUAL-01','Pegawai Manual Uji','Staf Uji',
    'Unit Uji',NULL,'081234567899','2026-11-01','active','c9100000-0000-4000-8000-000000000052')$$,
  '22023','Nomor pegawai baru dibuat otomatis oleh Naming Series',
  'pembuatan pegawai menolak nomor manual yang melewati Naming Series');
SELECT throws_ok(
  $$SELECT public.create_admin_ppdb_candidates_batch(
    'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011','admin',
    'c9100000-0000-4000-8000-000000000062',repeat('a',64)::TEXT,
    '[{"candidateId":"c9100000-0000-4000-8000-000000000063","registrationId":"PPDB-MANUAL-01","candidate":{}}]'::JSONB)$$,
  '22023','Nomor pendaftaran dibuat otomatis oleh Naming Series',
  'pembuatan pendaftar menolak nomor manual di luar seri tenant');
SELECT is(public.upsert_master_data_structure_auto_with_actor(
  'c9100000-0000-4000-8000-000000000001','Gedung','',
  '{"name":"Gedung Uji","status":"Active"}'::JSONB,
  'c9100000-0000-4000-8000-000000000011')->>'id',
  'GED-00001','kode gedung baru diterbitkan backend dalam transaksi tenant');
SELECT is(public.allocate_tenant_structure_naming_series(
  'c9100000-0000-4000-8000-000000000001','building_code','2026-11-01'),
  'GED-00002','kode berikutnya bergerak atomik dan tidak mengulang kode gedung tersimpan');
SELECT is(public.register_tenant_document(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011','admin',
  'c9100000-0000-4000-8000-000000000071','c9100000-0000-4000-8000-000000000072',NULL,
  'incoming','Surat uji penomoran',NULL,'Administrator','2026-11-01','Dokumen sintetis untuk pengujian.')
  ->>'documentNumber','DOC/2026/00001','dokumen memperoleh nomor otomatis dari seri tenant');
SELECT is(public.register_tenant_document(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011','admin',
  'c9100000-0000-4000-8000-000000000071','c9100000-0000-4000-8000-000000000073','NOMOR-ABAIKAN',
  'incoming','Surat uji penomoran',NULL,'Administrator','2026-11-01','Dokumen sintetis untuk pengujian.')
  ->>'alreadyApplied','true','pengulangan pendaftaran dokumen mengembalikan nomor lama tanpa alokasi baru');
SELECT is((SELECT count(*)::INTEGER FROM public.tenant_naming_series_allocations
  WHERE tenant_id='c9100000-0000-4000-8000-000000000001' AND series_key='document_number'
    AND client_request_id='c9100000-0000-4000-8000-000000000071'),1,
  'satu ID permintaan dokumen hanya menyimpan satu alokasi');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','finance_receipt','2026-11-01',
  'c9100000-0000-4000-8000-000000000074'),
  'KWT/2026/000001','kuitansi memakai seri tenant dengan penghitung atomik');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','finance_receipt','2026-11-01',
  'c9100000-0000-4000-8000-000000000074'),
  'KWT/2026/000001','pengulangan permintaan kuitansi mengembalikan nomor yang sama');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','donation_receipt','2030-04-05',
  'c9100000-0000-4000-8000-000000000081'),
  'DON/2030/0000001','kuitansi donasi memakai Naming Series tenant');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','donation_receipt','2030-04-05',
  'c9100000-0000-4000-8000-000000000081'),
  'DON/2030/0000001','retry kuitansi donasi idempoten dan tidak memakai nomor lain');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','waqf_asset_code','2030-04-05',
  'c9100000-0000-4000-8000-000000000082'),
  'WAK-00001','aset wakaf memperoleh kode otomatis tenant');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','laundry_order_number','2030-04-05',
  'c9100000-0000-4000-8000-000000000083'),
  'LDY-2030-000001','pesanan laundry memperoleh nomor otomatis tenant');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','cooperative_product_sku','2030-04-05',
  'c9100000-0000-4000-8000-000000000084'),
  'KOP-00001','produk koperasi memperoleh kode otomatis tenant');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','marketplace_product_sku','2030-04-05',
  'c9100000-0000-4000-8000-000000000085'),
  'TOK-00001','produk marketplace memperoleh kode otomatis tenant');
SELECT ok((public.manage_ga_facility(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  '{"action":"create","clientRequestId":"c9100000-0000-4000-8000-000000000075","assetCode":"KODE-MANUAL","name":"Aset Uji","category":"Peralatan","location":"Gudang","condition":"Baik","acquisitionValue":0}'::JSONB)
  ->>'id') IS NOT NULL,
  'pendaftaran aset mengembalikan ID teknis yang dikeluarkan basis data');
SELECT is((SELECT asset_code FROM public.ga_facilities WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
  AND client_request_id='c9100000-0000-4000-8000-000000000075'),
  'AST-00001','kode aset manual diabaikan dan diganti seri otomatis');
SELECT throws_ok(
  $$UPDATE public.ga_facilities SET asset_code='AST-MANUAL'
    WHERE tenant_id='c9100000-0000-4000-8000-000000000001' AND client_request_id='c9100000-0000-4000-8000-000000000075'$$,
  '23514','Kode aset yang sudah diterbitkan tidak dapat diubah','kode aset yang telah terbit tidak dapat diganti');
SELECT ok((public.manage_ga_inventory_item(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  '{"action":"create","clientRequestId":"c9100000-0000-4000-8000-000000000076","itemCode":"BARANG-MANUAL","name":"Barang Uji","category":"Alat Tulis Kantor","initialQuantity":0,"minimumQuantity":0,"unit":"Pcs","unitCost":0,"location":"Gudang"}'::JSONB)
  ->>'id') IS NOT NULL,
  'pencatatan inventaris mengembalikan ID teknis yang dikeluarkan basis data');
SELECT is((SELECT item_code FROM public.ga_inventory_items WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
  AND client_request_id='c9100000-0000-4000-8000-000000000076'),
  'BRG-00001','kode inventaris manual diabaikan dan diganti seri otomatis');
SELECT is((public.manage_ga_inventory_item(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  '{"action":"create","clientRequestId":"c9100000-0000-4000-8000-000000000076","itemCode":"BARANG-MANUAL","name":"Barang Uji","category":"Alat Tulis Kantor","initialQuantity":0,"minimumQuantity":0,"unit":"Pcs","unitCost":0,"location":"Gudang"}'::JSONB)
  ->>'id'),
  (SELECT id::TEXT FROM public.ga_inventory_items WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
    AND client_request_id='c9100000-0000-4000-8000-000000000076'),
  'percobaan ulang pencatatan inventaris mengembalikan ID dan kode yang sama');
SELECT is(public.allocate_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','inventory_item_code','2026-11-01',
  'c9100000-0000-4000-8000-000000000079'),
  'BRG-00002','percobaan ulang inventaris tidak memakan nomor berikutnya');
SELECT throws_ok(
  $$UPDATE public.ga_inventory_items SET item_code='BRG-MANUAL'
    WHERE tenant_id='c9100000-0000-4000-8000-000000000001' AND client_request_id='c9100000-0000-4000-8000-000000000076'$$,
  '23514','Kode inventaris yang sudah diterbitkan tidak dapat diubah','kode inventaris yang sudah terbit bersifat tetap');
SELECT is(public.save_tenant_extended_naming_series(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  'asset_code','ASET-{{YEAR}}-{{SEQ}}',5::SMALLINT,'yearly',1::BIGINT,true,
  'c9100000-0000-4000-8000-000000000077')->>'alreadyApplied',
  'false','Admin dengan akses General Affairs dapat mengatur pola kode aset');
SELECT throws_ok(
  $$SELECT public.save_tenant_extended_naming_series(
    'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000012',
    'finance_receipt','KWT/{{YEAR}}/{{SEQ}}',6::SMALLINT,'yearly',1::BIGINT,true,
    'c9100000-0000-4000-8000-000000000078')$$,
  '42501','Admin tenant dengan akses modul terkait diperlukan',
  'perubahan Naming Series menolak pengguna tanpa role Admin');
INSERT INTO public.tenant_reference_items (
  tenant_id,domain,code,name,description,status,nis_grade_code,created_by_user_id,updated_by_user_id
) VALUES (
  'c9100000-0000-4000-8000-000000000001','academic_grade_level','SMP_UJI','SMP',
  'Jenjang uji untuk pemeriksaan penerbitan NIS santri langsung.','active','02',
  'c9100000-0000-4000-8000-000000000011','c9100000-0000-4000-8000-000000000011'
);
SELECT ok((public.upsert_master_data_student_auto_nis_with_actor(
  'c9100000-0000-4000-8000-000000000001',NULL,'naming-direct-student-01',
  '{"name":"Santri Penomoran","gender":"L","grade":"SMP","status":"Active","details":{}}'::JSONB,
  NULL,NULL,NULL,NULL,'c9100000-0000-4000-8000-000000000011')->>'studentId') IS NOT NULL,
  'santri baru melalui Data Induk memperoleh ID teknis dari backend');
SELECT is((SELECT nis FROM public.students WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
  AND source_record_id='naming-direct-student-01'),
  '2026020003','santri baru langsung mendapat NIS seri tenant yang unik');
SELECT is((public.upsert_master_data_student_auto_nis_with_actor(
  'c9100000-0000-4000-8000-000000000001',NULL,'naming-direct-student-01',
  '{"name":"Santri Penomoran","gender":"L","grade":"SMP","nis":"2026999999","status":"Active","details":{}}'::JSONB,
  NULL,NULL,NULL,NULL,'c9100000-0000-4000-8000-000000000011')->>'studentId'),
  (SELECT id::TEXT FROM public.students WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
    AND source_record_id='naming-direct-student-01'),
  'percobaan ulang dengan ID sumber yang sama mempertahankan UUID teknis santri');
SELECT is((SELECT nis FROM public.students WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
  AND source_record_id='naming-direct-student-01'),
  '2026020003','percobaan ulang tidak mengganti NIS yang sudah diterbitkan');
SELECT is((SELECT last_value FROM public.tenant_naming_series_counters
  WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
    AND series_key='nis' AND period_key='2026:GRADE=02'),
  3::BIGINT,'percobaan ulang tidak mengonsumsi nomor urut baru');
SELECT throws_ok(
  $$UPDATE public.tenant_reference_items SET nis_grade_code='04'
    WHERE tenant_id='c9100000-0000-4000-8000-000000000001' AND code='SMP_UJI'$$,
  '23514','Kode jenjang NIS tidak dapat diubah setelah nomor diterbitkan; nonaktifkan jenjang lama dan buat jenjang baru',
  'kode jenjang tidak berubah setelah NIS terbit');
SELECT ok((public.upsert_master_data_student_auto_nis_with_actor(
  'c9100000-0000-4000-8000-000000000001',
  (SELECT id FROM public.students WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
    AND source_record_id='naming-direct-student-01'),
  'naming-direct-student-01',
  '{"name":"Santri Penomoran","gender":"L","grade":"SMP","nis":"2026999999","status":"Active","details":{}}'::JSONB,
  NULL,NULL,NULL,NULL,'c9100000-0000-4000-8000-000000000011')->>'studentId') IS NOT NULL,
  'pembaruan santri menggunakan identitas teknis yang sama');
SELECT is((SELECT nis FROM public.students WHERE tenant_id='c9100000-0000-4000-8000-000000000001'
  AND source_record_id='naming-direct-student-01'),
  '2026020003','NIS santri yang sudah terbit tidak berubah saat record diperbarui');
SELECT is(public.save_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  'ppdb_registration','REG-{{YEAR}}-{{SEQ}}',6::SMALLINT,'yearly',7::BIGINT,true,
  'c9100000-0000-4000-8000-000000000021')->>'alreadyApplied',
  'false','Admin tenant dapat mengubah pola PPDB dengan validasi database');
SELECT is((SELECT format_template FROM public.tenant_naming_series
  WHERE tenant_id='c9100000-0000-4000-8000-000000000001' AND series_key='ppdb_registration'),
  'REG-{{YEAR}}-{{SEQ}}','pola yang disimpan menjadi konfigurasi kanonis tenant');
SELECT is(public.allocate_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','ppdb_registration','2026-11-01','{}'::JSONB),
  'REG-2026-000007','angka awal baru diterapkan ke penghitung aktif tanpa memakai ulang nomor terbit');
SELECT is(public.save_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  'ppdb_registration','REG-{{YEAR}}-{{SEQ}}',6::SMALLINT,'yearly',7::BIGINT,true,
  'c9100000-0000-4000-8000-000000000021')->>'alreadyApplied',
  'true','permintaan konfigurasi yang sama aman diulang');
SELECT throws_ok(
  $$SELECT public.save_tenant_naming_series(
    'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
    'ppdb_registration','REG-{{YEAR}}-{{SEQ}}',6::SMALLINT,'yearly',8::BIGINT,true,
    'c9100000-0000-4000-8000-000000000021')$$,
  '23505','ID permintaan konfigurasi telah digunakan untuk perubahan lain',
  'kunci idempotensi tidak dapat dipakai untuk payload aturan yang berbeda');
SELECT throws_ok(
  $$SELECT public.save_tenant_naming_series(
    'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
    'nis','{{YEAR}}{{GRADE}}{{SEQ}}',5::SMALLINT,'yearly',1::BIGINT,true,
    'c9100000-0000-4000-8000-000000000022')$$,
  '22023','Aturan NIS harus tetap menghasilkan 10 digit: tahun, kode jenjang, dan 4 digit urut tahunan',
  'NIS tidak dapat diubah menjadi format yang mematahkan kontrak 10 digit');
SELECT throws_ok(
  $$SELECT public.save_tenant_naming_series(
    'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000012',
    'ppdb_registration','REG-{{YEAR}}-{{SEQ}}',6::SMALLINT,'yearly',7::BIGINT,true,
    'c9100000-0000-4000-8000-000000000023')$$,
  '42501','Admin tenant dengan akses Data Induk diperlukan',
  'akun staf tidak dapat mengubah Naming Series');
SELECT is(public.save_tenant_naming_series(
  'c9100000-0000-4000-8000-000000000001','c9100000-0000-4000-8000-000000000011',
  'ppdb_registration','REG-{{YEAR}}-{{SEQ}}',6::SMALLINT,'yearly',7::BIGINT,false,
  'c9100000-0000-4000-8000-000000000024')->>'alreadyApplied',
  'false','Admin dapat menonaktifkan seri dengan perubahan yang diaudit');
SELECT throws_ok(
  $$SELECT public.allocate_tenant_naming_series(
    'c9100000-0000-4000-8000-000000000001','ppdb_registration','2026-11-01','{}'::JSONB)$$,
  '23514','Seri penomoran tidak aktif pada tenant ini',
  'seri nonaktif menghentikan transaksi baru secara fail-closed');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

