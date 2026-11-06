-- Synthetic coverage for tenant-linked student CSV imports and room assignment.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(21);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('e1900000-0000-4000-8000-000000000001', 'student-import-rel-test', 'Student Import Relations Test', 'active');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES (
  'e1900000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'student-import-admin@test.invalid', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES (
  'e1900000-0000-4000-8000-000000000011', 'e1900000-0000-4000-8000-000000000001',
  'student-import-admin@test.invalid', 'Admin Import Uji', 'admin', 'active', '{"master-data":true}'
);
INSERT INTO public.tenant_reference_items (
  id, tenant_id, domain, code, name, description, status, nis_grade_code, created_by_user_id, updated_by_user_id
) VALUES
  ('e1900000-0000-4000-8000-000000000101', 'e1900000-0000-4000-8000-000000000001', 'academic_grade_level', 'GRADE_VII', 'VII', 'Jenjang tujuh untuk uji impor santri.', 'active', '07', 'e1900000-0000-4000-8000-000000000011', 'e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-000000000102', 'e1900000-0000-4000-8000-000000000001', 'academic_grade_level', 'GRADE_VIII', 'VIII', 'Jenjang delapan untuk uji impor santri.', 'active', '08', 'e1900000-0000-4000-8000-000000000011', 'e1900000-0000-4000-8000-000000000011'),
  ('e1900000-0000-4000-8000-000000000103', 'e1900000-0000-4000-8000-000000000001', 'academic_grade_level', 'GRADE_INACTIVE', 'Jenjang Nonaktif', 'Jenjang nonaktif untuk uji impor santri.', 'inactive', NULL, 'e1900000-0000-4000-8000-000000000011', 'e1900000-0000-4000-8000-000000000011');

INSERT INTO public.master_data_records (tenant_id, category, id, name, status, gender_code)
VALUES
  ('e1900000-0000-4000-8000-000000000001', 'Gedung', 'IMPORT-BUILDING-A', 'Asrama A', 'Active', 'L'),
  ('e1900000-0000-4000-8000-000000000001', 'Gedung', 'IMPORT-BUILDING-B', 'Asrama B', 'Active', 'P'),
  ('e1900000-0000-4000-8000-000000000001', 'Gedung', 'IMPORT-BUILDING-OFF', 'Asrama Nonaktif', 'Inactive', 'L');
INSERT INTO public.master_data_records (tenant_id, category, id, name, status, grade)
VALUES
  ('e1900000-0000-4000-8000-000000000001', 'Kelas', 'IMPORT-CLASS-VII', 'VII A', 'Active', 'VII'),
  ('e1900000-0000-4000-8000-000000000001', 'Kelas', 'IMPORT-CLASS-VIII', 'VIII A', 'Active', 'VIII'),
  ('e1900000-0000-4000-8000-000000000001', 'Kelas', 'IMPORT-CLASS-OFF', 'Kelas Nonaktif', 'Inactive', 'VII');
INSERT INTO public.master_data_records (tenant_id, category, id, name, status, parent_id, capacity, occupied, gender_code)
VALUES
  ('e1900000-0000-4000-8000-000000000001', 'Kamar', 'IMPORT-ROOM-A', 'Kamar A', 'Active', 'IMPORT-BUILDING-A', 5, 0, NULL),
  ('e1900000-0000-4000-8000-000000000001', 'Kamar', 'IMPORT-ROOM-FULL', 'Kamar Penuh', 'Active', 'IMPORT-BUILDING-A', 1, 1, 'L'),
  ('e1900000-0000-4000-8000-000000000001', 'Kamar', 'IMPORT-ROOM-OFF', 'Kamar Nonaktif', 'Inactive', 'IMPORT-BUILDING-A', 2, 0, 'L');

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, source_system, source_record_id, name, gender, grade,
  class_id, room_id, building_id, status
) VALUES (
  'e1900000-0000-4000-8000-000000000021', 'e1900000-0000-4000-8000-000000000001', NULL,
  'legacy_import', 'preexisting-full-room', 'Santri Ruang Penuh', 'L', 'VII',
  'IMPORT-CLASS-VII', 'IMPORT-ROOM-FULL', 'IMPORT-BUILDING-A', 'Active'
);

SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001',
  '{"sourceRecordId":"planned-valid","grade":"VII","classId":"IMPORT-CLASS-VII","gender":"L","roomId":"IMPORT-ROOM-A","buildingId":"IMPORT-BUILDING-A"}'::jsonb
)->>'status', 'planned', 'active grade, class, building, room, and gender relations pass preflight');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"free-grade","grade":"Jenjang Bebas"}'::jsonb
)->>'status', 'conflict', 'free-typed grade is rejected');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"wrong-class-grade","grade":"VII","classId":"IMPORT-CLASS-VIII"}'::jsonb
)->>'status', 'conflict', 'class must match the selected grade');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"inactive-class","grade":"VII","classId":"IMPORT-CLASS-OFF"}'::jsonb
)->>'status', 'conflict', 'inactive classes are rejected');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"wrong-building","gender":"L","roomId":"IMPORT-ROOM-A","buildingId":"IMPORT-BUILDING-B"}'::jsonb
)->>'status', 'conflict', 'room must belong to the selected building');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"inactive-room","gender":"L","roomId":"IMPORT-ROOM-OFF"}'::jsonb
)->>'status', 'conflict', 'inactive rooms are rejected');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"inactive-building","buildingId":"IMPORT-BUILDING-OFF"}'::jsonb
)->>'status', 'conflict', 'inactive buildings are rejected');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"wrong-gender","gender":"P","roomId":"IMPORT-ROOM-A"}'::jsonb
)->>'status', 'conflict', 'room placement enforces the room/building gender restriction');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"full-room","gender":"L","roomId":"IMPORT-ROOM-FULL"}'::jsonb
)->>'status', 'conflict', 'a full room is rejected during preview');
SELECT is(public.validate_legacy_master_data_student_relationships(
  'e1900000-0000-4000-8000-000000000001', '{"sourceRecordId":"derive-building","gender":"L","roomId":"IMPORT-ROOM-A"}'::jsonb
)->>'buildingId', 'IMPORT-BUILDING-A', 'building is derived from its selected room');
SELECT ok(NOT has_function_privilege('anon', 'public.validate_legacy_master_data_student_relationships(uuid,jsonb)', 'EXECUTE'), 'anonymous callers cannot execute the private preflight helper');
SELECT ok(NOT has_function_privilege('authenticated', 'public.validate_legacy_master_data_student_relationships(uuid,jsonb)', 'EXECUTE'), 'browser callers cannot execute the private preflight helper');
SELECT ok(NOT has_function_privilege('service_role', 'public.validate_legacy_master_data_student_relationships(uuid,jsonb)', 'EXECUTE'), 'service callers must use the audited import wrapper');
SELECT ok(has_function_privilege('service_role', 'public.import_legacy_master_data_student_with_actor(uuid,jsonb,jsonb,boolean,uuid)', 'EXECUTE'), 'trusted server can use the audited import wrapper');
SELECT ok(NOT has_function_privilege('anon', 'public.import_legacy_master_data_student_with_actor(uuid,jsonb,jsonb,boolean,uuid)', 'EXECUTE'), 'anonymous callers cannot import students');
SELECT ok(NOT has_function_privilege('authenticated', 'public.import_legacy_master_data_student_with_actor(uuid,jsonb,jsonb,boolean,uuid)', 'EXECUTE'), 'browser callers cannot import students directly');

SET LOCAL ROLE service_role;
SELECT is(public.import_legacy_master_data_student_with_actor(
  'e1900000-0000-4000-8000-000000000001',
  '{"sourceRecordId":"imported-with-room","name":"Santri Impor","gender":"L","grade":"VII","classId":"IMPORT-CLASS-VII","roomId":"IMPORT-ROOM-A","buildingId":"IMPORT-BUILDING-A","status":"Active"}'::jsonb,
  NULL, TRUE, 'e1900000-0000-4000-8000-000000000011'
)->>'status', 'imported', 'audited import creates a student and delegates placement to the room RPC');
RESET ROLE;
SELECT is((SELECT room_id FROM public.students WHERE tenant_id='e1900000-0000-4000-8000-000000000001' AND source_record_id='imported-with-room'), 'IMPORT-ROOM-A', 'imported student is assigned to the selected room');
SELECT is((SELECT building_id FROM public.students WHERE tenant_id='e1900000-0000-4000-8000-000000000001' AND source_record_id='imported-with-room'), 'IMPORT-BUILDING-A', 'imported student stores the matching parent building');
SELECT is((SELECT occupied FROM public.master_data_records WHERE tenant_id='e1900000-0000-4000-8000-000000000001' AND category='Kamar' AND id='IMPORT-ROOM-A'), 1, 'room occupancy is incremented transactionally');
SELECT is((SELECT changed_by::TEXT FROM public.student_room_assignment_history WHERE tenant_id='e1900000-0000-4000-8000-000000000001' AND student_id=(SELECT id FROM public.students WHERE source_record_id='imported-with-room') ORDER BY id DESC LIMIT 1), 'e1900000-0000-4000-8000-000000000011', 'room history records the Admin who imported the student');
SELECT * FROM finish();
ROLLBACK;
