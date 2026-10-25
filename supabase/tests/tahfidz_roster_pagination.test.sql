-- Verify tenant- and role-scoped keyset roster pages and aggregate support data.
-- All records are synthetic and rolled back at the end of this test.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(20);

INSERT INTO public.tenants (id, slug, name, status, time_zone)
VALUES
  ('d1900000-0000-4000-8000-000000000009', 'tahfidz-roster-a', 'Tahfidz Roster A', 'active', 'UTC'),
  ('d2900000-0000-4000-8000-000000000009', 'tahfidz-roster-b', 'Tahfidz Roster B', 'active', 'UTC');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('d1900000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roster-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1900000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roster-ustadz@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1900000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roster-santri@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1900000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roster-wali@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1900000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roster-no-permission@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d2900000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'roster-admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions, linked_santri_id)
VALUES
  ('d1900000-0000-4000-8000-000000000011', 'd1900000-0000-4000-8000-000000000009', 'roster-admin@test.invalid', 'Admin Roster', 'admin', 'active', '{"tahfidz":true}', NULL),
  ('d1900000-0000-4000-8000-000000000012', 'd1900000-0000-4000-8000-000000000009', 'roster-ustadz@test.invalid', 'Ustadz Roster', 'ustadz', 'active', '{"tahfidz":true}', NULL),
  ('d1900000-0000-4000-8000-000000000013', 'd1900000-0000-4000-8000-000000000009', 'roster-santri@test.invalid', 'Santri Roster', 'santri', 'active', '{"tahfidz":true}', 'd1900000-0000-4000-8000-000000000203'),
  ('d1900000-0000-4000-8000-000000000014', 'd1900000-0000-4000-8000-000000000009', 'roster-wali@test.invalid', 'Wali Roster', 'wali_santri', 'active', '{"tahfidz":true}', NULL),
  ('d1900000-0000-4000-8000-000000000015', 'd1900000-0000-4000-8000-000000000009', 'roster-no-permission@test.invalid', 'Admin Tanpa Izin', 'admin', 'active', '{"tahfidz":false}', NULL),
  ('d2900000-0000-4000-8000-000000000021', 'd2900000-0000-4000-8000-000000000009', 'roster-admin-b@test.invalid', 'Admin Tenant B', 'admin', 'active', '{"tahfidz":true}', NULL);

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('d1900000-0000-4000-8000-000000000101', 'd1900000-0000-4000-8000-000000000009', 'TR-A-001', 'Santri Alfa', decode(repeat('ab', 44), 'hex'), decode(repeat('11', 32), 'hex')),
  ('d1900000-0000-4000-8000-000000000102', 'd1900000-0000-4000-8000-000000000009', 'TR-A-002', 'Santri Beta', decode(repeat('bc', 44), 'hex'), decode(repeat('22', 32), 'hex')),
  ('d1900000-0000-4000-8000-000000000103', 'd1900000-0000-4000-8000-000000000009', 'TR-A-003', 'Santri Gamma', decode(repeat('cd', 44), 'hex'), decode(repeat('33', 32), 'hex')),
  ('d2900000-0000-4000-8000-000000000201', 'd2900000-0000-4000-8000-000000000009', 'TR-B-001', 'Santri Tenant B', decode(repeat('de', 44), 'hex'), decode(repeat('44', 32), 'hex')),
  ('d1900000-0000-4000-8000-000000000104', 'd1900000-0000-4000-8000-000000000009', 'TR-A-004', 'Wali Santri', decode(repeat('ef', 44), 'hex'), decode(repeat('55', 32), 'hex'));

INSERT INTO public.students (id, tenant_id, source_candidate_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status)
VALUES
  ('d1900000-0000-4000-8000-000000000201', 'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000101', '9190000001', 'Santri Alfa', 'L', 'VII', decode(repeat('21', 44), 'hex'), decode(repeat('61', 32), 'hex'), 'active'),
  ('d1900000-0000-4000-8000-000000000202', 'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000102', '9190000002', 'Santri Beta', 'P', 'VIII', decode(repeat('22', 44), 'hex'), decode(repeat('62', 32), 'hex'), 'Active'),
  ('d1900000-0000-4000-8000-000000000203', 'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000103', '9190000003', 'Santri Gamma', 'L', 'IX', decode(repeat('23', 44), 'hex'), decode(repeat('63', 32), 'hex'), 'active'),
  ('d2900000-0000-4000-8000-000000000301', 'd2900000-0000-4000-8000-000000000009', 'd2900000-0000-4000-8000-000000000201', '9290000001', 'Santri Tenant B', 'L', 'VII', decode(repeat('24', 44), 'hex'), decode(repeat('64', 32), 'hex'), 'active');

INSERT INTO public.tahfidz_halaqahs (id, tenant_id, name, ustadz_user_id, ustadz_name, status)
VALUES ('d1900000-0000-4000-8000-000000000401', 'd1900000-0000-4000-8000-000000000009', 'Halaqah Roster', 'd1900000-0000-4000-8000-000000000012', 'Ustadz Roster', 'active');
INSERT INTO public.tahfidz_memberships (tenant_id, halaqah_id, student_id, starts_on, status)
VALUES
  ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000401', 'd1900000-0000-4000-8000-000000000201', CURRENT_DATE - 5, 'active'),
  ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000401', 'd1900000-0000-4000-8000-000000000202', CURRENT_DATE - 5, 'active');
INSERT INTO public.tahfidz_targets (tenant_id, student_id, period_start, ziyadah_pages_per_day, murojaah_pages_per_day, created_by_user_id)
VALUES ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000201', CURRENT_DATE - 5, 1, 0, 'd1900000-0000-4000-8000-000000000011');

INSERT INTO public.guardians (id, tenant_id, source_candidate_id, name, phone, status)
VALUES ('d1900000-0000-4000-8000-000000000501', 'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000104', 'Wali Santri', '081200000000', 'Active');
INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id, relationship)
VALUES ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000501', 'd1900000-0000-4000-8000-000000000202', 'Ibu');
INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id, status)
VALUES ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000501', 'd1900000-0000-4000-8000-000000000014', 'active');

SELECT has_function('public', 'list_tahfidz_roster_page', ARRAY['uuid','uuid','text','date','uuid','text','integer','boolean'], 'the tenant-scoped roster RPC exists');
SELECT ok(NOT has_function_privilege('anon', 'public.list_tahfidz_roster_page(uuid,uuid,text,date,uuid,text,integer,boolean)', 'EXECUTE'), 'anonymous users cannot execute roster RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.list_tahfidz_roster_page(uuid,uuid,text,date,uuid,text,integer,boolean)', 'EXECUTE'), 'authenticated clients cannot bypass the trusted server for roster RPC');
SELECT ok(has_function_privilege('service_role', 'public.list_tahfidz_roster_page(uuid,uuid,text,date,uuid,text,integer,boolean)', 'EXECUTE'), 'trusted server can execute roster RPC');

SELECT is((public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,NULL,NULL,100,true)->'stats'->>'studentCount'), '3', 'Admin gets exact active tenant student count');
SELECT is((public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,NULL,NULL,100,true)->'stats'->>'studentsWithTarget'), '1', 'target coverage is counted from active targets');
SELECT is((public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,NULL,NULL,100,true)->'stats'->>'studentsWithoutHalaqah'), '1', 'unassigned student count is exact');

SELECT is(jsonb_array_length(public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000012','ustadz',CURRENT_DATE,NULL,NULL,100,false)->'roster'), 2, 'Ustadz sees only students in assigned active halaqahs');
SELECT ok(NOT (public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000012','ustadz',CURRENT_DATE,NULL,NULL,100,false)->'roster') @> '[{"id":"d1900000-0000-4000-8000-000000000203"}]'::jsonb, 'Ustadz cannot see an unassigned student');
SELECT is(jsonb_array_length(public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000013','santri',CURRENT_DATE,NULL,NULL,100,false)->'roster'), 1, 'Santri account sees exactly its linked record');
SELECT is((public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000013','santri',CURRENT_DATE,NULL,NULL,100,false)->'roster'->0->>'id'), 'd1900000-0000-4000-8000-000000000203', 'Santri linked identity is resolved within tenant');
SELECT is(jsonb_array_length(public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000014','wali_santri',CURRENT_DATE,NULL,NULL,100,false)->'roster'), 1, 'Wali sees only linked children');
SELECT is((public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000014','wali_santri',CURRENT_DATE,NULL,NULL,100,false)->'roster'->0->>'id'), 'd1900000-0000-4000-8000-000000000202', 'Wali receives its linked student only');

SELECT is(jsonb_array_length(public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,NULL,'  SANTRI BE  ',100,false)->'roster'), 1, 'prefix search is trimmed and case-insensitive');
SELECT is(jsonb_array_length(public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,NULL,'%',100,false)->'roster'), 0, 'search wildcard is treated as literal input');
SELECT ok(NOT (public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,NULL,NULL,100,false)->'roster') @> '[{"id":"d2900000-0000-4000-8000-000000000301"}]'::jsonb, 'tenant B records never enter tenant A pages');

CREATE TEMP TABLE roster_first_page ON COMMIT DROP AS
SELECT public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,NULL,NULL,1,false) AS page;
SELECT is((SELECT page->'roster'->0->>'id' FROM roster_first_page), 'd1900000-0000-4000-8000-000000000201', 'keyset page starts at first ordered student');
SELECT is((SELECT page->>'hasMore' FROM roster_first_page), 'true', 'lookahead row marks a following page');
SELECT is((public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000011','admin',CURRENT_DATE,(SELECT (page->>'nextCursor')::uuid FROM roster_first_page),NULL,1,false)->'roster'->0->>'id'), 'd1900000-0000-4000-8000-000000000202', 'cursor advances without skipping or repeating students');
SELECT throws_ok(
  $$SELECT public.list_tahfidz_roster_page('d1900000-0000-4000-8000-000000000009','d1900000-0000-4000-8000-000000000015','admin',CURRENT_DATE,NULL,NULL,100,false)$$,
  '42501', 'Profil tenant atau izin Tahfidz tidak aktif', 'explicitly disabled module permission is denied'
);

SELECT * FROM finish();
ROLLBACK;
