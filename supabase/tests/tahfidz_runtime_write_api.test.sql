-- Verify tenant, role, assignment, validation and retry guarantees for Tahfidz writes.
-- All records are synthetic and the enclosing transaction is rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'UTC';
SELECT plan(62);

INSERT INTO public.tenants (id, slug, name, status, time_zone)
VALUES
  ('d1800000-0000-4000-8000-000000000009', 'tahfidz-write-a', 'Tahfidz Write A', 'active', 'UTC'),
  ('d2800000-0000-4000-8000-000000000009', 'tahfidz-write-b', 'Tahfidz Write B', 'active', 'UTC');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('d1800000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tahfidz-admin-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1800000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tahfidz-ustadz-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1800000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tahfidz-ustadz-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d2800000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tahfidz-admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('d1800000-0000-4000-8000-000000000011', 'd1800000-0000-4000-8000-000000000009', 'tahfidz-admin-a@test.invalid', 'Admin A', 'admin', 'active', '{"tahfidz":true}'),
  ('d1800000-0000-4000-8000-000000000012', 'd1800000-0000-4000-8000-000000000009', 'tahfidz-ustadz-a@test.invalid', 'Ustadz A', 'ustadz', 'active', '{"tahfidz":true}'),
  ('d1800000-0000-4000-8000-000000000013', 'd1800000-0000-4000-8000-000000000009', 'tahfidz-ustadz-b@test.invalid', 'Ustadz B', 'ustadz', 'active', '{"tahfidz":true}'),
  ('d2800000-0000-4000-8000-000000000021', 'd2800000-0000-4000-8000-000000000009', 'tahfidz-admin-b@test.invalid', 'Admin B', 'admin', 'active', '{"tahfidz":true}');

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('d1800000-0000-4000-8000-000000000101', 'd1800000-0000-4000-8000-000000000009', 'TZW-A-001', 'Santri A', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex')),
  ('d2800000-0000-4000-8000-000000000201', 'd2800000-0000-4000-8000-000000000009', 'TZW-B-001', 'Santri B', decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'));
INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, status
)
VALUES
  ('d1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000101', '9180000001', 'Santri A', 'L', 'VII', decode(repeat('34', 44), 'hex'), decode(repeat('56', 32), 'hex'), 'active'),
  ('d2800000-0000-4000-8000-000000000301', 'd2800000-0000-4000-8000-000000000009', 'd2800000-0000-4000-8000-000000000201', '9280000001', 'Santri B', 'L', 'VII', decode(repeat('78', 44), 'hex'), decode(repeat('90', 32), 'hex'), 'active');

INSERT INTO public.tahfidz_halaqahs (id, tenant_id, name, ustadz_user_id, ustadz_name, status)
VALUES
  ('d1800000-0000-4000-8000-000000000401', 'd1800000-0000-4000-8000-000000000009', 'Halaqah A', 'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'active'),
  ('d1800000-0000-4000-8000-000000000402', 'd1800000-0000-4000-8000-000000000009', 'Halaqah B', 'd1800000-0000-4000-8000-000000000013', 'Ustadz B', 'active');
INSERT INTO public.tahfidz_memberships (tenant_id, halaqah_id, student_id, starts_on, status)
VALUES ('d1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000401', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE - 5, 'active');

-- Setoran: valid write, idempotent replay, conflict, assigned-halaqah and tenant guards.
SELECT is((public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  'Ziyadah', 'Al-Baqarah', 1, 5, 'A', 'A', NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'ustadz', 'd1800000-0000-4000-8000-000000000501'
)->>'alreadyRecorded'), 'false', 'assigned Ustadz can record a valid setoran');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_records WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009'), 1, 'one setoran is stored');
SELECT is((public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  'Ziyadah', 'Al-Baqarah', 1, 5, 'A', 'A', NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'ustadz', 'd1800000-0000-4000-8000-000000000501'
)->>'alreadyRecorded'), 'true', 'identical setoran retry returns the committed record');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_records WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009'), 1, 'identical retry does not create another setoran');
SELECT throws_ok($$SELECT public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  'Ziyadah', 'Al-Baqarah', 1, 6, 'A', 'A', NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'ustadz', 'd1800000-0000-4000-8000-000000000501'
)$$, '23505', 'Kunci permintaan setoran telah digunakan untuk data berbeda', 'changed setoran payload cannot reuse a request ID');
SELECT throws_ok($$SELECT public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000402',
  'Ziyadah', 'Al-Baqarah', 1, 5, NULL, NULL, NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'ustadz', 'd1800000-0000-4000-8000-000000000502'
)$$, '42501', 'Ustadz hanya dapat mencatat setoran pada halaqah tugasnya', 'Ustadz cannot write to another Ustadz’s halaqah');
SELECT throws_ok($$SELECT public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  'Ziyadah', 'Al-Baqarah', 1, 5, NULL, NULL, NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000013', 'Ustadz B', 'ustadz', 'd1800000-0000-4000-8000-000000000503'
)$$, '23514', 'Santri belum terdaftar pada halaqah ini', 'setoran requires active student membership');
SELECT throws_ok($$SELECT public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  'Ziyadah', 'Al-Baqarah', 1, 5, NULL, NULL, NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'admin', 'd1800000-0000-4000-8000-000000000504'
)$$, '42501', 'Aktor tidak memiliki izin mencatat setoran Tahfidz', 'caller cannot claim a different role');
SELECT throws_ok($$SELECT public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd2800000-0000-4000-8000-000000000301', 'd1800000-0000-4000-8000-000000000401',
  'Ziyadah', 'Al-Baqarah', 1, 5, NULL, NULL, NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'ustadz', 'd1800000-0000-4000-8000-000000000505'
)$$, 'P0002', 'Santri tidak ditemukan pada tenant ini', 'a student from another tenant is rejected');
SELECT throws_ok($$SELECT public.record_tahfidz_setoran(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  'Ziyadah', 'Al-Baqarah', 5, 4, NULL, NULL, NULL, '2026-10-25 09:00:00+00',
  'd1800000-0000-4000-8000-000000000012', 'Ustadz A', 'ustadz', 'd1800000-0000-4000-8000-000000000506'
)$$, '22023', 'Data setoran Tahfidz tidak valid', 'invalid ayah range is rejected');

-- Halaqah and membership administration: admin-only, tenant checks and retry-safe moves.
SELECT is((public.save_tahfidz_halaqah(
  'd1800000-0000-4000-8000-000000000009', NULL::UUID, 'Halaqah C', 'd1800000-0000-4000-8000-000000000012',
  'Pagi', 'Mushalla', 2.00::NUMERIC, 'active', 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000507'
)->>'alreadyApplied'), 'false', 'Admin can create an active halaqah');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_halaqahs WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND status = 'active'), 3, 'new halaqah is persisted once');
SELECT is((public.save_tahfidz_halaqah(
  'd1800000-0000-4000-8000-000000000009', NULL::UUID, 'Halaqah C', 'd1800000-0000-4000-8000-000000000012',
  'Pagi', 'Mushalla', 2.00::NUMERIC, 'active', 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000507'
)->>'alreadyApplied'), 'true', 'identical halaqah retry returns the original record');
SELECT throws_ok($$SELECT public.save_tahfidz_halaqah(
  'd1800000-0000-4000-8000-000000000009', NULL::UUID, 'Halaqah C Ubah', 'd1800000-0000-4000-8000-000000000012',
  'Pagi', 'Mushalla', 2.00::NUMERIC, 'active', 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000507'
)$$, '23505', 'Kunci permintaan halaqah telah digunakan untuk data berbeda', 'changed halaqah payload cannot reuse a request ID');
SELECT throws_ok($$SELECT public.save_tahfidz_halaqah(
  'd1800000-0000-4000-8000-000000000009', NULL::UUID, 'Halaqah Ditolak', 'd1800000-0000-4000-8000-000000000012',
  NULL, NULL, 1.00::NUMERIC, 'active', 'd1800000-0000-4000-8000-000000000012', 'admin', 'd1800000-0000-4000-8000-000000000508'
)$$, '42501', 'Role akun tidak sesuai dengan profil Supabase aktif', 'Ustadz cannot administer halaqah configuration');
SELECT throws_ok($$SELECT public.save_tahfidz_halaqah(
  'd1800000-0000-4000-8000-000000000009', NULL::UUID, 'Halaqah Ustadz Asing', 'd2800000-0000-4000-8000-000000000021',
  NULL, NULL, 1.00::NUMERIC, 'active', 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000509'
)$$, '23503', 'Ustadz pengampu tidak aktif atau berbeda tenant', 'halaqah cannot be assigned to a teacher from another tenant');

SELECT is((public.assign_tahfidz_membership(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201',
  (SELECT id FROM public.tahfidz_halaqahs WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND name = 'Halaqah C'),
  CURRENT_DATE, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000510'
)->>'alreadyApplied'), 'false', 'Admin can move a student to a new halaqah');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_memberships WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND student_id = 'd1800000-0000-4000-8000-000000000201' AND status = 'active'), 1, 'student has only one active halaqah');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_memberships WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND student_id = 'd1800000-0000-4000-8000-000000000201'), 2, 'moving a student preserves both membership records');
SELECT is((SELECT ends_on::TEXT FROM public.tahfidz_memberships WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND student_id = 'd1800000-0000-4000-8000-000000000201' AND status = 'ended'), (CURRENT_DATE - 1)::TEXT, 'previous membership ends the day before the new assignment');
SELECT is((public.assign_tahfidz_membership(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201',
  (SELECT id FROM public.tahfidz_halaqahs WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND name = 'Halaqah C'),
  CURRENT_DATE, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000510'
)->>'alreadyApplied'), 'true', 'identical membership retry is detected');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_memberships WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND student_id = 'd1800000-0000-4000-8000-000000000201'), 2, 'membership retry does not duplicate history');
SELECT throws_ok($$SELECT public.assign_tahfidz_membership(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000402',
  CURRENT_DATE, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000510'
)$$, '23505', 'Kunci permintaan penempatan telah digunakan untuk data berbeda', 'changed membership payload cannot reuse a request ID');
SELECT throws_ok($$SELECT public.assign_tahfidz_membership(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  CURRENT_DATE, 'd1800000-0000-4000-8000-000000000012', 'admin', 'd1800000-0000-4000-8000-000000000511'
)$$, '42501', 'Role akun tidak sesuai dengan profil Supabase aktif', 'Ustadz cannot assign student memberships');
SELECT throws_ok($$SELECT public.assign_tahfidz_membership(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  CURRENT_DATE + 1, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000512'
)$$, '22023', 'Tanggal penempatan tidak boleh berada di masa depan', 'future membership start date is rejected');
SELECT throws_ok($$SELECT public.assign_tahfidz_membership(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', 'd1800000-0000-4000-8000-000000000401',
  CURRENT_DATE - 1, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000513'
)$$, '23514', 'Tanggal penempatan tidak boleh mundur dari riwayat aktif', 'membership cannot be moved to a date before its active history');
SELECT throws_ok($$SELECT public.assign_tahfidz_membership(
  'd1800000-0000-4000-8000-000000000009', 'd2800000-0000-4000-8000-000000000301', 'd1800000-0000-4000-8000-000000000401',
  CURRENT_DATE, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000514'
)$$, 'P0002', 'Santri tidak aktif atau tidak ditemukan pada tenant ini', 'membership cannot cross tenant boundaries');

-- Targets: tenant-local dates, role and active-halaqah checks, idempotent writes.
SELECT is((public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE, NULL,
  1.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000515'
)->>'alreadyApplied'), 'false', 'Admin can save a tenant-scoped daily target');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_targets WHERE tenant_id = 'd1800000-0000-4000-8000-000000000009' AND student_id = 'd1800000-0000-4000-8000-000000000201'), 1, 'one target is stored for the student');
SELECT is((public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE, NULL,
  1.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000515'
)->>'alreadyApplied'), 'true', 'identical target retry is detected');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE, NULL,
  2.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000515'
)$$, '23505', 'Kunci permintaan target telah digunakan untuk data berbeda', 'changed target payload cannot reuse a request ID');
SELECT is((public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE, NULL,
  2.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd1800000-0000-4000-8000-000000000012', 'ustadz', 'd1800000-0000-4000-8000-000000000516'
)->>'alreadyApplied'), 'false', 'assigned Ustadz may update the target of a student in their halaqah');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE, NULL,
  3.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd1800000-0000-4000-8000-000000000013', 'ustadz', 'd1800000-0000-4000-8000-000000000517'
)$$, '42501', 'Ustadz hanya dapat mengatur target santri pada halaqah tugasnya', 'Ustadz cannot set targets for a student outside their halaqah');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE, NULL,
  1.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd2800000-0000-4000-8000-000000000021', 'admin', 'd1800000-0000-4000-8000-000000000518'
)$$, '42501', 'Role akun tidak sesuai dengan profil Supabase aktif', 'an administrator from another tenant cannot change targets');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE + 1, NULL,
  1.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000519'
)$$, '22023', 'Target aktif harus berlaku pada hari ini atau sebelumnya dan tidak berakhir di masa lalu', 'future target is rejected');
SELECT throws_ok($$SELECT public.record_tahfidz_daily_target(
  'd1800000-0000-4000-8000-000000000009', 'd1800000-0000-4000-8000-000000000201', CURRENT_DATE - 2, CURRENT_DATE - 1,
  1.00::NUMERIC, 1.00::NUMERIC, 'standard', NULL, 'd1800000-0000-4000-8000-000000000011', 'admin', 'd1800000-0000-4000-8000-000000000520'
)$$, '22023', 'Target aktif harus berlaku pada hari ini atau sebelumnya dan tidak berakhir di masa lalu', 'target that already ended is rejected');

-- Tenant-scoped tables are forced through RLS and browser roles cannot call write RPCs.
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_halaqahs'::regclass), 'halaqahs has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_halaqahs'::regclass), 'halaqahs forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_memberships'::regclass), 'memberships has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_memberships'::regclass), 'memberships forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_records'::regclass), 'records has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_records'::regclass), 'records forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_targets'::regclass), 'targets has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_targets'::regclass), 'targets forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_halaqah_write_requests'::regclass), 'halaqah request ledger has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_halaqah_write_requests'::regclass), 'halaqah request ledger forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_membership_write_requests'::regclass), 'membership request ledger has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_membership_write_requests'::regclass), 'membership request ledger forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_target_write_requests'::regclass), 'target request ledger has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_target_write_requests'::regclass), 'target request ledger forces RLS');
SELECT ok(NOT has_function_privilege('anon', to_regprocedure('public.record_tahfidz_setoran(uuid,uuid,uuid,text,text,integer,integer,text,text,text,timestamptz,uuid,text,text,uuid)'), 'EXECUTE'), 'anon cannot execute setoran RPC');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.record_tahfidz_setoran(uuid,uuid,uuid,text,text,integer,integer,text,text,text,timestamptz,uuid,text,text,uuid)'), 'EXECUTE'), 'authenticated cannot execute setoran RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.record_tahfidz_setoran(uuid,uuid,uuid,text,text,integer,integer,text,text,text,timestamptz,uuid,text,text,uuid)'), 'EXECUTE'), 'service_role can execute setoran RPC');
SELECT ok(NOT has_function_privilege('anon', to_regprocedure('public.save_tahfidz_halaqah(uuid,uuid,text,uuid,text,text,numeric,text,uuid,text,uuid)'), 'EXECUTE'), 'anon cannot execute halaqah RPC');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.save_tahfidz_halaqah(uuid,uuid,text,uuid,text,text,numeric,text,uuid,text,uuid)'), 'EXECUTE'), 'authenticated cannot execute halaqah RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.save_tahfidz_halaqah(uuid,uuid,text,uuid,text,text,numeric,text,uuid,text,uuid)'), 'EXECUTE'), 'service_role can execute halaqah RPC');
SELECT ok(NOT has_function_privilege('anon', to_regprocedure('public.assign_tahfidz_membership(uuid,uuid,uuid,date,uuid,text,uuid)'), 'EXECUTE'), 'anon cannot execute membership RPC');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.assign_tahfidz_membership(uuid,uuid,uuid,date,uuid,text,uuid)'), 'EXECUTE'), 'authenticated cannot execute membership RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.assign_tahfidz_membership(uuid,uuid,uuid,date,uuid,text,uuid)'), 'EXECUTE'), 'service_role can execute membership RPC');
SELECT ok(NOT has_function_privilege('anon', to_regprocedure('public.record_tahfidz_daily_target(uuid,uuid,date,date,numeric,numeric,text,text,uuid,text,uuid)'), 'EXECUTE'), 'anon cannot execute target RPC');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.record_tahfidz_daily_target(uuid,uuid,date,date,numeric,numeric,text,text,uuid,text,uuid)'), 'EXECUTE'), 'authenticated cannot execute target RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.record_tahfidz_daily_target(uuid,uuid,date,date,numeric,numeric,text,text,uuid,text,uuid)'), 'EXECUTE'), 'service_role can execute target RPC');

SELECT * FROM finish();
ROLLBACK;

