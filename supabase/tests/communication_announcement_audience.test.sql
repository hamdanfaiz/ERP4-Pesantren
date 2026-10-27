-- Synthetic communication importer and canonical audience regression tests.
-- All fixture changes are rolled back at the end of the file.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(29);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('c7100000-0000-4000-8000-000000000007', 'communication-audience-test', 'Communication Audience Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c7100000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communication-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7100000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communication-wali-current@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7100000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communication-wali-stale@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7100000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communication-wali-suspended@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7100000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communication-ustadz@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7100000-0000-4000-8000-000000000016', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'communication-santri@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (
  user_id, tenant_id, email, display_name, role, status, module_permissions, linked_santri_class
) VALUES
  ('c7100000-0000-4000-8000-000000000011', 'c7100000-0000-4000-8000-000000000007', 'communication-admin@test.invalid', 'Admin Uji', 'admin', 'active', '{}', NULL),
  ('c7100000-0000-4000-8000-000000000012', 'c7100000-0000-4000-8000-000000000007', 'communication-wali-current@test.invalid', 'Wali Kanonis', 'wali_santri', 'active', '{}', NULL),
  ('c7100000-0000-4000-8000-000000000013', 'c7100000-0000-4000-8000-000000000007', 'communication-wali-stale@test.invalid', 'Wali Snapshot Usang', 'wali_santri', 'active', '{}', 'VII - A'),
  ('c7100000-0000-4000-8000-000000000014', 'c7100000-0000-4000-8000-000000000007', 'communication-wali-suspended@test.invalid', 'Wali Tersuspensi', 'wali_santri', 'active', '{}', 'VII - A'),
  ('c7100000-0000-4000-8000-000000000015', 'c7100000-0000-4000-8000-000000000007', 'communication-ustadz@test.invalid', 'Ustadz Uji', 'ustadz', 'active', '{}', NULL),
  ('c7100000-0000-4000-8000-000000000016', 'c7100000-0000-4000-8000-000000000007', 'communication-santri@test.invalid', 'Santri Uji', 'santri', 'active', '{}', NULL);

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('c7100000-0000-4000-8000-000000000101', 'c7100000-0000-4000-8000-000000000007', 'COMM-STUDENT-1', 'Santri VII A', decode(repeat('a1', 44), 'hex'), decode(repeat('b1', 32), 'hex')),
  ('c7100000-0000-4000-8000-000000000102', 'c7100000-0000-4000-8000-000000000007', 'COMM-STUDENT-2', 'Santri VIII B', decode(repeat('a2', 44), 'hex'), decode(repeat('b2', 32), 'hex')),
  ('c7100000-0000-4000-8000-000000000103', 'c7100000-0000-4000-8000-000000000007', 'COMM-GUARDIAN-1', 'Wali Kanonis', decode(repeat('a3', 44), 'hex'), decode(repeat('b3', 32), 'hex')),
  ('c7100000-0000-4000-8000-000000000104', 'c7100000-0000-4000-8000-000000000007', 'COMM-GUARDIAN-2', 'Wali Snapshot Usang', decode(repeat('a4', 44), 'hex'), decode(repeat('b4', 32), 'hex')),
  ('c7100000-0000-4000-8000-000000000105', 'c7100000-0000-4000-8000-000000000007', 'COMM-GUARDIAN-3', 'Wali Tersuspensi', decode(repeat('a5', 44), 'hex'), decode(repeat('b5', 32), 'hex'));

INSERT INTO public.master_data_records (tenant_id, category, id, name, capacity)
VALUES
  ('c7100000-0000-4000-8000-000000000007', 'Kelas', 'communication-class-vii-a', 'VII - A', NULL),
  ('c7100000-0000-4000-8000-000000000007', 'Kelas', 'communication-class-viii-b', 'VIII - B', NULL),
  ('c7100000-0000-4000-8000-000000000007', 'Kamar', 'communication-room', 'Kamar Uji', 10);

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
) VALUES
  ('c7100000-0000-4000-8000-000000000201', 'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000101', '3456789011', 'Santri VII A', 'L', 'VII', decode(repeat('c1', 44), 'hex'), decode(repeat('d1', 32), 'hex'), 'communication-class-vii-a', 'communication-room'),
  ('c7100000-0000-4000-8000-000000000202', 'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000102', '3456789012', 'Santri VIII B', 'L', 'VIII', decode(repeat('c2', 44), 'hex'), decode(repeat('d2', 32), 'hex'), 'communication-class-viii-b', 'communication-room');

INSERT INTO public.guardians (id, tenant_id, source_candidate_id, name, phone)
VALUES
  ('c7100000-0000-4000-8000-000000000301', 'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000103', 'Wali Kanonis', '081200000031'),
  ('c7100000-0000-4000-8000-000000000302', 'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000104', 'Wali Snapshot Usang', '081200000032'),
  ('c7100000-0000-4000-8000-000000000303', 'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000105', 'Wali Tersuspensi', '081200000033');

INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id)
VALUES
  ('c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000301', 'c7100000-0000-4000-8000-000000000201'),
  ('c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000301', 'c7100000-0000-4000-8000-000000000202'),
  ('c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000302', 'c7100000-0000-4000-8000-000000000202'),
  ('c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000303', 'c7100000-0000-4000-8000-000000000201');

INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id, status)
VALUES
  ('c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000301', 'c7100000-0000-4000-8000-000000000012', 'active'),
  ('c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000302', 'c7100000-0000-4000-8000-000000000013', 'active'),
  ('c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000303', 'c7100000-0000-4000-8000-000000000014', 'suspended');

SELECT ok(NOT has_function_privilege('anon', 'public.communication_announcement_recipient_user_ids(uuid,text)', 'EXECUTE'), 'anon cannot enumerate recipients');
SELECT ok(NOT has_function_privilege('authenticated', 'public.communication_announcement_recipient_user_ids(uuid,text)', 'EXECUTE'), 'authenticated cannot enumerate recipients');
SELECT ok(NOT has_function_privilege('anon', 'public.import_communication_announcements(uuid,uuid,jsonb,text)', 'EXECUTE'), 'anon cannot run legacy imports');
SELECT ok(NOT has_function_privilege('authenticated', 'public.import_communication_announcements(uuid,uuid,jsonb,text)', 'EXECUTE'), 'authenticated cannot run legacy imports');
SELECT ok(NOT has_table_privilege('anon', 'public.communication_announcements', 'SELECT'), 'anon cannot read announcements directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.communication_announcements', 'SELECT'), 'authenticated cannot read announcements directly');
SELECT ok(NOT has_table_privilege('anon', 'public.communication_announcement_reads', 'SELECT'), 'anon cannot read receipts directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.communication_announcement_reads', 'SELECT'), 'authenticated cannot read receipts directly');

SELECT is((SELECT count(*)::int FROM public.communication_announcement_recipient_user_ids('c7100000-0000-4000-8000-000000000007', 'Wali Santri Kelas VII - A')), 1, 'class audience deduplicates a Wali linked to multiple children');
SELECT ok((SELECT array_agg(user_id) @> ARRAY['c7100000-0000-4000-8000-000000000012'::uuid] FROM public.communication_announcement_recipient_user_ids('c7100000-0000-4000-8000-000000000007', 'Wali Santri Kelas VII - A')), 'canonical VII-A child includes a Wali with no profile class snapshot');
SELECT ok(NOT (SELECT array_agg(user_id) @> ARRAY['c7100000-0000-4000-8000-000000000013'::uuid] FROM public.communication_announcement_recipient_user_ids('c7100000-0000-4000-8000-000000000007', 'Wali Santri Kelas VII - A')), 'stale VII-A profile snapshot does not override the linked VIII-B child');
SELECT ok(NOT (SELECT array_agg(user_id) @> ARRAY['c7100000-0000-4000-8000-000000000014'::uuid] FROM public.communication_announcement_recipient_user_ids('c7100000-0000-4000-8000-000000000007', 'Wali Santri Kelas VII - A')), 'suspended Wali account is excluded');
SELECT is((SELECT count(*)::int FROM public.communication_announcement_recipient_user_ids('c7100000-0000-4000-8000-000000000007', 'Semua Wali Santri')), 2, 'all-Wali audience contains only active canonical accounts');

SET LOCAL ROLE service_role;

SELECT is((public.import_communication_announcements(
  'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000011',
  jsonb_build_array(jsonb_build_object(
    'legacy_source_id', 'communication-valid-class-ack', 'title', 'Pengumuman kelas VII-A',
    'body', 'Isi pengumuman uji', 'target_audience', 'Wali Santri Kelas VII - A',
    'status', 'sent', 'is_urgent', false, 'legacy_read_count', 0,
    'acknowledged_user_ids', jsonb_build_array('c7100000-0000-4000-8000-000000000012', 'c7100000-0000-4000-8000-000000000012')
  )), repeat('a', 64)
)->>'imported')::int, 1, 'import accepts a canonical class recipient despite a missing profile snapshot');
SELECT is((SELECT count(*)::int FROM public.communication_announcement_reads reads JOIN public.communication_announcements announcements ON announcements.id = reads.announcement_id WHERE announcements.legacy_source_id = 'communication-valid-class-ack'), 1, 'duplicate acknowledgement IDs create one receipt');
SELECT is((SELECT read_count FROM public.communication_announcements WHERE legacy_source_id = 'communication-valid-class-ack'), 1, 'receipt trigger increments read count once');

SELECT throws_ok(
  $$SELECT public.import_communication_announcements(
    'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000011',
    jsonb_build_array(jsonb_build_object(
      'legacy_source_id', 'communication-stale-class-ack', 'title', 'Pengumuman kelas VII-A',
      'body', 'Isi pengumuman uji', 'target_audience', 'Wali Santri Kelas VII - A',
      'status', 'sent', 'is_urgent', false, 'legacy_read_count', 0,
      'acknowledged_user_ids', jsonb_build_array('c7100000-0000-4000-8000-000000000013')
    )), repeat('b', 64)
  )$$,
  '23514', 'Konfirmasi baca legacy tidak cocok dengan penerima aktif pada audiens ini',
  'import rejects stale class snapshots when the linked child is in another class'
);
SELECT is((SELECT count(*)::int FROM public.communication_announcements WHERE legacy_source_id = 'communication-stale-class-ack'), 0, 'rejected imports do not leave a partial announcement');

SELECT throws_ok(
  $$SELECT public.import_communication_announcements(
    'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000011',
    jsonb_build_array(jsonb_build_object(
      'legacy_source_id', 'communication-suspended-wali-ack', 'title', 'Pengumuman kelas VII-A',
      'body', 'Isi pengumuman uji', 'target_audience', 'Wali Santri Kelas VII - A',
      'status', 'sent', 'is_urgent', false, 'legacy_read_count', 0,
      'acknowledged_user_ids', jsonb_build_array('c7100000-0000-4000-8000-000000000014')
    )), repeat('c', 64)
  )$$,
  '23514', 'Konfirmasi baca legacy tidak cocok dengan penerima aktif pada audiens ini',
  'import rejects suspended guardian account acknowledgements'
);
SELECT is((SELECT count(*)::int FROM public.communication_announcements WHERE legacy_source_id = 'communication-suspended-wali-ack'), 0, 'suspended acknowledgement import leaves no announcement');

SELECT is((public.import_communication_announcements(
  'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000011',
  jsonb_build_array(jsonb_build_object(
    'legacy_source_id', 'communication-valid-class-ack', 'title', 'Pengumuman kelas VII-A',
    'body', 'Isi pengumuman uji', 'target_audience', 'Wali Santri Kelas VII - A',
    'status', 'sent', 'is_urgent', false, 'legacy_read_count', 0,
    'acknowledged_user_ids', jsonb_build_array('c7100000-0000-4000-8000-000000000012')
  )), repeat('d', 64)
)->>'alreadyImported')::int, 1, 'retry recognizes the existing legacy source row');
SELECT is((SELECT count(*)::int FROM public.communication_announcement_reads reads JOIN public.communication_announcements announcements ON announcements.id = reads.announcement_id WHERE announcements.legacy_source_id = 'communication-valid-class-ack'), 1, 'retry does not duplicate acknowledgement receipts');
SELECT is((SELECT read_count FROM public.communication_announcements WHERE legacy_source_id = 'communication-valid-class-ack'), 1, 'retry does not increment read count again');

SELECT is((SELECT count(*)::int FROM public.communication_announcement_recipient_user_ids('c7100000-0000-4000-8000-000000000007', 'Guru & Musyrif')), 1, 'Guru & Musyrif resolver includes the active Ustadz');
SELECT is((public.import_communication_announcements(
  'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000011',
  jsonb_build_array(jsonb_build_object(
    'legacy_source_id', 'communication-valid-ustadz-ack', 'title', 'Pengumuman pengajar',
    'body', 'Isi pengumuman uji', 'target_audience', 'Guru & Musyrif',
    'status', 'sent', 'is_urgent', false, 'legacy_read_count', 0,
    'acknowledged_user_ids', jsonb_build_array('c7100000-0000-4000-8000-000000000015')
  )), repeat('e', 64)
)->>'imported')::int, 1, 'import accepts acknowledgements from the resolved Ustadz audience');
SELECT is((SELECT count(*)::int FROM public.communication_announcement_reads reads JOIN public.communication_announcements announcements ON announcements.id = reads.announcement_id WHERE announcements.legacy_source_id = 'communication-valid-ustadz-ack'), 1, 'Ustadz acknowledgement is persisted');

SELECT is((SELECT count(*)::int FROM public.communication_announcement_recipient_user_ids('c7100000-0000-4000-8000-000000000007', 'Semua Santri')), 1, 'Semua Santri resolver includes the active Santri');
SELECT is((public.import_communication_announcements(
  'c7100000-0000-4000-8000-000000000007', 'c7100000-0000-4000-8000-000000000011',
  jsonb_build_array(jsonb_build_object(
    'legacy_source_id', 'communication-valid-santri-ack', 'title', 'Pengumuman santri',
    'body', 'Isi pengumuman uji', 'target_audience', 'Semua Santri',
    'status', 'sent', 'is_urgent', false, 'legacy_read_count', 0,
    'acknowledged_user_ids', jsonb_build_array('c7100000-0000-4000-8000-000000000016')
  )), repeat('f', 64)
)->>'imported')::int, 1, 'import accepts acknowledgements from the resolved Santri audience');
SELECT is((SELECT count(*)::int FROM public.communication_announcement_reads reads JOIN public.communication_announcements announcements ON announcements.id = reads.announcement_id WHERE announcements.legacy_source_id = 'communication-valid-santri-ack'), 1, 'Santri acknowledgement is persisted');

SELECT * FROM finish();
ROLLBACK;

