-- Tenant-owned choice catalogs and PPDB assignments stay linked to canonical data.
-- Fixtures are synthetic and rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(9);

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('e9160000-0000-4000-8000-000000000001', 'choice-rel-a', 'Choice Relationship A', 'active'),
  ('e9160000-0000-4000-8000-000000000002', 'choice-rel-b', 'Choice Relationship B', 'active');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('e9160000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'choice-rel-a@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('e9160000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'choice-rel-b@test.invalid', '', now(), '{}', '{}', now(), now());
INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('e9160000-0000-4000-8000-000000000011', 'e9160000-0000-4000-8000-000000000001', 'choice-rel-a@test.invalid', 'Choice Relationship Admin A', 'admin', 'active', '{"master-data":true,"ppdb":true}'),
  ('e9160000-0000-4000-8000-000000000012', 'e9160000-0000-4000-8000-000000000002', 'choice-rel-b@test.invalid', 'Choice Relationship Admin B', 'admin', 'active', '{"master-data":true,"ppdb":true}');

INSERT INTO public.tenant_reference_items (
  id, tenant_id, domain, code, name, description, created_by_user_id, updated_by_user_id
) VALUES
  ('e9160000-0000-4000-8000-000000000101', 'e9160000-0000-4000-8000-000000000001', 'academic_grade_level', 'VII', 'Kelas VII', 'Jenjang pendidikan untuk santri kelas tujuh.', 'e9160000-0000-4000-8000-000000000011', 'e9160000-0000-4000-8000-000000000011'),
  ('e9160000-0000-4000-8000-000000000102', 'e9160000-0000-4000-8000-000000000001', 'academic_grade_level', 'VIII', 'Kelas VIII', 'Jenjang pendidikan untuk santri kelas delapan.', 'e9160000-0000-4000-8000-000000000011', 'e9160000-0000-4000-8000-000000000011'),
  ('e9160000-0000-4000-8000-000000000201', 'e9160000-0000-4000-8000-000000000002', 'academic_grade_level', 'VII', 'Kelas VII', 'Jenjang pendidikan untuk santri kelas tujuh.', 'e9160000-0000-4000-8000-000000000012', 'e9160000-0000-4000-8000-000000000012');

INSERT INTO public.master_data_records (tenant_id, category, id, name, status, grade, grade_level_reference_id)
VALUES
  ('e9160000-0000-4000-8000-000000000001', 'Kelas', 'CLASS-VII-A', 'VII A', 'Active', 'Kelas VII', 'e9160000-0000-4000-8000-000000000101'),
  ('e9160000-0000-4000-8000-000000000001', 'Gedung', 'BUILDING-A', 'Gedung A', 'Active', NULL, NULL),
  ('e9160000-0000-4000-8000-000000000001', 'Gedung', 'BUILDING-B', 'Gedung B', 'Active', NULL, NULL);
INSERT INTO public.master_data_records (tenant_id, category, id, name, status, parent_id, capacity)
VALUES
  ('e9160000-0000-4000-8000-000000000001', 'Kamar', 'ROOM-A1', 'Kamar A1', 'Active', 'BUILDING-A', 2),
  ('e9160000-0000-4000-8000-000000000001', 'Kamar', 'ROOM-B1', 'Kamar B1', 'Active', 'BUILDING-B', 2);

INSERT INTO public.candidates (
  id, tenant_id, registration_id, name, grade, grade_level_reference_id,
  class_id, class_name, dormitory_id, dormitory, room_id, room
) VALUES (
  'e9160000-0000-4000-8000-000000000301', 'e9160000-0000-4000-8000-000000000001',
  'REG-CHOICE-001', 'Santri Uji Relasi', 'Label jenjang lama', 'e9160000-0000-4000-8000-000000000101',
  'CLASS-VII-A', 'Label kelas lama', 'BUILDING-A', 'Label gedung lama', 'ROOM-A1', 'Label kamar lama'
);

SELECT is((SELECT grade FROM public.candidates WHERE id = 'e9160000-0000-4000-8000-000000000301'), 'Kelas VII', 'candidate grade label follows its reference');
SELECT is((SELECT class_name FROM public.candidates WHERE id = 'e9160000-0000-4000-8000-000000000301'), 'VII A', 'candidate class name follows its tenant class');
SELECT is((SELECT dormitory FROM public.candidates WHERE id = 'e9160000-0000-4000-8000-000000000301'), 'Gedung A', 'candidate building name follows its tenant structure');
SELECT is((SELECT room FROM public.candidates WHERE id = 'e9160000-0000-4000-8000-000000000301'), 'Kamar A1', 'candidate room name follows its tenant structure');
SELECT throws_ok($$INSERT INTO public.candidates (tenant_id, registration_id, name, grade, grade_level_reference_id, class_id) VALUES ('e9160000-0000-4000-8000-000000000001', 'REG-CHOICE-002', 'Jenjang Tidak Cocok', 'Kelas VIII', 'e9160000-0000-4000-8000-000000000102', 'CLASS-VII-A')$$, '23514', 'Jenjang calon santri harus sama dengan jenjang kelas', 'candidate cannot use a class from a different grade');
SELECT throws_ok($$INSERT INTO public.candidates (tenant_id, registration_id, name, grade, grade_level_reference_id, class_name) VALUES ('e9160000-0000-4000-8000-000000000001', 'REG-CHOICE-003', 'Kelas Bebas', 'Kelas VII', 'e9160000-0000-4000-8000-000000000101', 'Kelas diketik sendiri')$$, '23503', 'Pilih kelas dari data kelas tenant; nama kelas bebas tidak diterima', 'candidate cannot type an unlinked class');
SELECT throws_ok($$INSERT INTO public.candidates (tenant_id, registration_id, name, grade, grade_level_reference_id, dormitory_id, room_id) VALUES ('e9160000-0000-4000-8000-000000000001', 'REG-CHOICE-004', 'Kamar Tidak Cocok', 'Kelas VII', 'e9160000-0000-4000-8000-000000000101', 'BUILDING-A', 'ROOM-B1')$$, '23514', 'Gedung asrama tidak sesuai dengan kamar yang dipilih', 'candidate room must belong to its selected building');
SELECT throws_ok($$INSERT INTO public.candidates (tenant_id, registration_id, name, grade, grade_level_reference_id) VALUES ('e9160000-0000-4000-8000-000000000001', 'REG-CHOICE-005', 'Referensi Tenant Lain', 'Kelas VII', 'e9160000-0000-4000-8000-000000000201')$$, '23503', 'Jenjang calon santri harus dipilih dari katalog tenant yang aktif', 'candidate cannot use a grade reference from another tenant');
SELECT ok((SELECT count(*) = 3 FROM pg_constraint WHERE conrelid = 'public.candidates'::regclass AND conname IN ('candidates_tenant_class_assignment_fk', 'candidates_tenant_dormitory_assignment_fk', 'candidates_tenant_room_assignment_fk')), 'candidate class, building, and room relations are tenant-scoped foreign keys');

SELECT * FROM finish();
ROLLBACK;
