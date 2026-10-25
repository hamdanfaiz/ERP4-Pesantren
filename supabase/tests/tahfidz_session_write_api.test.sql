-- Verify tenant/role checks, slot integrity, retries, and exam completion for session writes.
-- Fixtures are synthetic; all changes are rolled back at the end of this test.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'UTC';
SELECT plan(24);

INSERT INTO public.tenants (id, slug, name, status, time_zone)
VALUES ('d1900000-0000-4000-8000-000000000009', 'tahfidz-session-write-test', 'Tahfidz Session Write Test', 'active', 'UTC');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('d1900000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1900000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-teacher-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d1900000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'session-teacher-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('d1900000-0000-4000-8000-000000000011', 'd1900000-0000-4000-8000-000000000009', 'session-admin@test.invalid', 'Admin Uji', 'admin', 'active', '{"tahfidz":true}'),
  ('d1900000-0000-4000-8000-000000000012', 'd1900000-0000-4000-8000-000000000009', 'session-teacher-a@test.invalid', 'Ustadz A', 'ustadz', 'active', '{"tahfidz":true}'),
  ('d1900000-0000-4000-8000-000000000013', 'd1900000-0000-4000-8000-000000000009', 'session-teacher-b@test.invalid', 'Ustadz B', 'ustadz', 'active', '{"tahfidz":true}');

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('d1900000-0000-4000-8000-000000000101', 'd1900000-0000-4000-8000-000000000009', 'TSW-001', 'Santri A', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex')),
  ('d1900000-0000-4000-8000-000000000102', 'd1900000-0000-4000-8000-000000000009', 'TSW-002', 'Santri B', decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex')),
  ('d1900000-0000-4000-8000-000000000103', 'd1900000-0000-4000-8000-000000000009', 'TSW-003', 'Santri C', decode(repeat('34', 44), 'hex'), decode(repeat('56', 32), 'hex'));

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, status
)
VALUES
  ('d1900000-0000-4000-8000-000000000201', 'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000101', '9190000001', 'Santri A', 'L', 'VII', decode(repeat('78', 44), 'hex'), decode(repeat('90', 32), 'hex'), 'active'),
  ('d1900000-0000-4000-8000-000000000202', 'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000102', '9190000002', 'Santri B', 'L', 'VII', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex'), 'active'),
  ('d1900000-0000-4000-8000-000000000203', 'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000103', '9190000003', 'Santri C', 'L', 'VII', decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'), 'active');

INSERT INTO public.tahfidz_halaqahs (id, tenant_id, name, ustadz_user_id, ustadz_name, status)
VALUES
  ('d1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000009', 'Halaqah A', 'd1900000-0000-4000-8000-000000000012', 'Ustadz A', 'active'),
  ('d1900000-0000-4000-8000-000000000302', 'd1900000-0000-4000-8000-000000000009', 'Halaqah B', 'd1900000-0000-4000-8000-000000000013', 'Ustadz B', 'active');

INSERT INTO public.tahfidz_memberships (tenant_id, halaqah_id, student_id, starts_on, status)
VALUES
  ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000201', CURRENT_DATE - 5, 'active'),
  ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000202', CURRENT_DATE - 5, 'active'),
  ('d1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000302', 'd1900000-0000-4000-8000-000000000203', CURRENT_DATE - 5, 'active');

-- An identical retry is idempotent; a different payload cannot reuse its request key.
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  NULL, 'talaqqi', 'd1900000-0000-4000-8000-000000000201', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000012',
  NULL, NULL, NULL, date_trunc('minute', transaction_timestamp() + interval '2 days'), 30::smallint,
  'Makharij dan kelancaran', 'scheduled', NULL, NULL, NULL, 'd1900000-0000-4000-8000-000000000501'
)->>'alreadyApplied'), 'false', 'Admin dapat membuat jadwal Talaqqi valid');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_sessions WHERE tenant_id = 'd1900000-0000-4000-8000-000000000009'), 1, 'jadwal valid tersimpan satu kali');
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  NULL, 'talaqqi', 'd1900000-0000-4000-8000-000000000201', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000012',
  NULL, NULL, NULL, date_trunc('minute', transaction_timestamp() + interval '2 days'), 30::smallint,
  'Makharij dan kelancaran', 'scheduled', NULL, NULL, NULL, 'd1900000-0000-4000-8000-000000000501'
)->>'alreadyApplied'), 'true', 'retry jadwal yang sama mengembalikan record semula');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_sessions WHERE tenant_id = 'd1900000-0000-4000-8000-000000000009'), 1, 'retry tidak menggandakan jadwal');
SELECT throws_ok($$SELECT public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  NULL, 'talaqqi', 'd1900000-0000-4000-8000-000000000201', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000012',
  NULL, NULL, NULL, date_trunc('minute', transaction_timestamp() + interval '2 days'), 30::smallint,
  'Fokus berbeda', 'scheduled', NULL, NULL, NULL, 'd1900000-0000-4000-8000-000000000501'
)$$, '23505', 'Kunci permintaan sesi sudah dipakai untuk payload berbeda', 'request key tidak boleh digunakan ulang untuk payload berbeda');

-- The same teacher cannot be scheduled for overlapping sessions, including another student.
SELECT throws_ok($$SELECT public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  NULL, 'talaqqi', 'd1900000-0000-4000-8000-000000000202', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000012',
  NULL, NULL, NULL, date_trunc('minute', transaction_timestamp() + interval '2 days'), 30::smallint,
  'Setoran santri B', 'scheduled', NULL, NULL, NULL, 'd1900000-0000-4000-8000-000000000502'
)$$, '23505', 'Pengampu sudah memiliki sesi lain pada rentang waktu tersebut', 'benturan jadwal pengampu ditolak');
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  NULL, 'talaqqi', 'd1900000-0000-4000-8000-000000000201', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000012',
  NULL, NULL, NULL, date_trunc('minute', transaction_timestamp() + interval '2 days') + interval '30 minutes', 30::smallint,
  'Sesi berurutan', 'scheduled', NULL, NULL, NULL, 'd1900000-0000-4000-8000-000000000503'
)->>'alreadyApplied'), 'false', 'sesi yang dimulai tepat setelah sesi sebelumnya diperbolehkan');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_sessions WHERE tenant_id = 'd1900000-0000-4000-8000-000000000009' AND status = 'scheduled'), 2, 'dua sesi tidak berbenturan tersimpan');

-- Teacher B can host an exam; teacher A cannot complete someone else’s session.
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  NULL, 'exam', 'd1900000-0000-4000-8000-000000000203', 'd1900000-0000-4000-8000-000000000302', 'd1900000-0000-4000-8000-000000000013',
  'munaqasyah', 1::smallint, 1::smallint, date_trunc('minute', transaction_timestamp() + interval '2 days'), 45::smallint,
  'Ujian juz 1', 'scheduled', NULL, NULL, NULL, 'd1900000-0000-4000-8000-000000000504'
)->>'alreadyApplied'), 'false', 'Admin dapat membuat jadwal ujian untuk pengampu lain dalam tenant');
SELECT throws_ok($$SELECT public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000012', 'ustadz',
  (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504'),
  'exam', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'completed', 90, 'pass', NULL,
  'd1900000-0000-4000-8000-000000000505'
)$$, '42501', 'Ustadz hanya dapat menutup sesi yang diampu', 'Ustadz tidak dapat menyelesaikan ujian halaqah lain');
SELECT throws_ok($$SELECT public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504'),
  'exam', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'completed', NULL, 'pass', NULL,
  'd1900000-0000-4000-8000-000000000506'
)$$, '22023', 'Nilai dan hasil ujian wajib diisi', 'ujian tidak dapat selesai tanpa nilai');
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504'),
  'exam', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'completed', 88, 'pass', 'Lulus ujian',
  'd1900000-0000-4000-8000-000000000507'
)->>'alreadyApplied'), 'false', 'Admin dapat menyelesaikan ujian dengan nilai dan hasil');
SELECT is((SELECT status FROM public.tahfidz_sessions WHERE id = (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504')), 'completed', 'status ujian berubah menjadi selesai');
SELECT is((SELECT score::NUMERIC FROM public.tahfidz_sessions WHERE id = (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504')), 88::NUMERIC, 'nilai ujian tersimpan');
SELECT is((SELECT outcome FROM public.tahfidz_sessions WHERE id = (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504')), 'pass', 'hasil lulus tersimpan');
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504'),
  'exam', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'completed', 88, 'pass', 'Lulus ujian',
  'd1900000-0000-4000-8000-000000000507'
)->>'alreadyApplied'), 'true', 'retry penyelesaian ujian yang sama bersifat idempotent');
SELECT throws_ok($$SELECT public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000504'),
  'exam', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'completed', 88, 'pass', 'Catatan berubah',
  'd1900000-0000-4000-8000-000000000507'
)$$, '23505', 'Kunci permintaan sesi sudah dipakai untuk payload berbeda', 'retry tidak dapat mengubah hasil/catatan setelah disimpan');

-- Cancellation releases the slot and is also retry-safe.
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000501'),
  'talaqqi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'cancelled', NULL, NULL, 'Jadwal dialihkan',
  'd1900000-0000-4000-8000-000000000508'
)->>'alreadyApplied'), 'false', 'Admin dapat membatalkan sesi terjadwal');
SELECT is((SELECT status FROM public.tahfidz_sessions WHERE id = (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000501')), 'cancelled', 'status sesi berubah menjadi dibatalkan');
SELECT is((public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000011', 'admin',
  (SELECT result_id FROM public.tahfidz_session_write_requests WHERE client_request_id = 'd1900000-0000-4000-8000-000000000501'),
  'talaqqi', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'cancelled', NULL, NULL, 'Jadwal dialihkan',
  'd1900000-0000-4000-8000-000000000508'
)->>'alreadyApplied'), 'true', 'retry pembatalan tidak membuat perubahan kedua');

-- Role mismatches and browser execution remain denied at the database boundary.
SELECT throws_ok($$SELECT public.mutate_tenant_tahfidz_session(
  'd1900000-0000-4000-8000-000000000009', 'd1900000-0000-4000-8000-000000000012', 'admin',
  NULL, 'talaqqi', 'd1900000-0000-4000-8000-000000000201', 'd1900000-0000-4000-8000-000000000301', 'd1900000-0000-4000-8000-000000000012',
  NULL, NULL, NULL, date_trunc('minute', transaction_timestamp() + interval '3 days'), 30::smallint,
  'Jadwal role mismatch', 'scheduled', NULL, NULL, NULL, 'd1900000-0000-4000-8000-000000000509'
)$$, '42501', 'Profil aktif tidak berwenang mengelola sesi Tahfidz', 'pemanggil tidak dapat mengaku sebagai role lain');
SELECT ok(NOT has_function_privilege('anon', to_regprocedure('public.mutate_tenant_tahfidz_session(uuid,uuid,text,uuid,text,uuid,uuid,uuid,text,smallint,smallint,timestamptz,smallint,text,text,numeric,text,text,uuid)'), 'EXECUTE'), 'anon tidak dapat menjalankan RPC sesi');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.mutate_tenant_tahfidz_session(uuid,uuid,text,uuid,text,uuid,uuid,uuid,text,smallint,smallint,timestamptz,smallint,text,text,numeric,text,text,uuid)'), 'EXECUTE'), 'authenticated tidak dapat memanggil RPC sesi langsung');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.mutate_tenant_tahfidz_session(uuid,uuid,text,uuid,text,uuid,uuid,uuid,text,smallint,smallint,timestamptz,smallint,text,text,numeric,text,text,uuid)'), 'EXECUTE'), 'server tepercaya dapat menjalankan RPC sesi');

SELECT * FROM finish();
ROLLBACK;
