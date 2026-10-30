-- Text-only, same-halaqah peer reviews: tenant isolation, idempotency and Ustadz moderation.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SET LOCAL TIME ZONE 'UTC';
SELECT plan(33);

INSERT INTO public.tenants (id, slug, name, status, time_zone)
VALUES
  ('d3800000-0000-4000-8000-000000000009', 'peer-review-test', 'Peer Review Test', 'active', 'UTC'),
  ('d4800000-0000-4000-8000-000000000009', 'peer-review-other', 'Other Peer Review Tenant', 'active', 'UTC');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('d3800000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'peer-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d3800000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'peer-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d3800000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'peer-c@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d3800000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'peer-ustadz-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d3800000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'peer-ustadz-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d3800000-0000-4000-8000-000000000016', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'peer-denied@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions, linked_santri_id)
VALUES
  ('d3800000-0000-4000-8000-000000000011', 'd3800000-0000-4000-8000-000000000009', 'peer-a@test.invalid', 'Santri A', 'santri', 'active', '{}', 'd3800000-0000-4000-8000-000000000101'),
  ('d3800000-0000-4000-8000-000000000012', 'd3800000-0000-4000-8000-000000000009', 'peer-b@test.invalid', 'Santri B', 'santri', 'active', '{}', 'd3800000-0000-4000-8000-000000000102'),
  ('d3800000-0000-4000-8000-000000000013', 'd3800000-0000-4000-8000-000000000009', 'peer-c@test.invalid', 'Santri C', 'santri', 'active', '{}', 'd3800000-0000-4000-8000-000000000103'),
  ('d3800000-0000-4000-8000-000000000014', 'd3800000-0000-4000-8000-000000000009', 'peer-ustadz-a@test.invalid', 'Ustadz A', 'ustadz', 'active', '{}', NULL),
  ('d3800000-0000-4000-8000-000000000015', 'd3800000-0000-4000-8000-000000000009', 'peer-ustadz-b@test.invalid', 'Ustadz B', 'ustadz', 'active', '{}', NULL),
  ('d3800000-0000-4000-8000-000000000016', 'd3800000-0000-4000-8000-000000000009', 'peer-denied@test.invalid', 'Santri Ditolak', 'santri', 'active', '{"tahfidz":false}', 'd3800000-0000-4000-8000-000000000104');

INSERT INTO public.students (id, tenant_id, nis, name, gender, grade, nik_ciphertext, nik_fingerprint, status)
VALUES
  ('d3800000-0000-4000-8000-000000000101', 'd3800000-0000-4000-8000-000000000009', '9380000001', 'Santri A', 'L', 'VII', decode(repeat('11', 44), 'hex'), decode(repeat('21', 32), 'hex'), 'active'),
  ('d3800000-0000-4000-8000-000000000102', 'd3800000-0000-4000-8000-000000000009', '9380000002', 'Santri B', 'L', 'VII', decode(repeat('12', 44), 'hex'), decode(repeat('22', 32), 'hex'), 'active'),
  ('d3800000-0000-4000-8000-000000000103', 'd3800000-0000-4000-8000-000000000009', '9380000003', 'Santri C', 'L', 'VII', decode(repeat('13', 44), 'hex'), decode(repeat('23', 32), 'hex'), 'active'),
  ('d3800000-0000-4000-8000-000000000104', 'd3800000-0000-4000-8000-000000000009', '9380000004', 'Santri Ditolak', 'L', 'VII', decode(repeat('14', 44), 'hex'), decode(repeat('24', 32), 'hex'), 'active');

INSERT INTO public.tahfidz_halaqahs (id, tenant_id, name, ustadz_user_id, ustadz_name, status)
VALUES
  ('d3800000-0000-4000-8000-000000000201', 'd3800000-0000-4000-8000-000000000009', 'Halaqah A', 'd3800000-0000-4000-8000-000000000014', 'Ustadz A', 'active'),
  ('d3800000-0000-4000-8000-000000000202', 'd3800000-0000-4000-8000-000000000009', 'Halaqah B', 'd3800000-0000-4000-8000-000000000015', 'Ustadz B', 'active');
INSERT INTO public.tahfidz_memberships (tenant_id, halaqah_id, student_id, starts_on, status)
VALUES
  ('d3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000201', 'd3800000-0000-4000-8000-000000000101', CURRENT_DATE - 2, 'active'),
  ('d3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000201', 'd3800000-0000-4000-8000-000000000102', CURRENT_DATE - 2, 'active'),
  ('d3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000202', 'd3800000-0000-4000-8000-000000000103', CURRENT_DATE - 2, 'active'),
  ('d3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000202', 'd3800000-0000-4000-8000-000000000104', CURRENT_DATE - 2, 'active');

INSERT INTO public.tahfidz_records (
  id, tenant_id, student_id, halaqah_id, activity_type, surah_name, ayah_start, ayah_end,
  performed_at, recorded_by_user_id, recorded_by_name, client_request_id
) VALUES
  ('d3800000-0000-4000-8000-000000000401', 'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000102', 'd3800000-0000-4000-8000-000000000201', 'Ziyadah', 'Al-Baqarah', 1, 5, now() - interval '2 hours', 'd3800000-0000-4000-8000-000000000014', 'Ustadz A', 'd3800000-0000-4000-8000-000000000501'),
  ('d3800000-0000-4000-8000-000000000402', 'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000102', 'd3800000-0000-4000-8000-000000000201', 'Muroja''ah', 'Al-Baqarah', 6, 10, now() - interval '1 hour', 'd3800000-0000-4000-8000-000000000014', 'Ustadz A', 'd3800000-0000-4000-8000-000000000502'),
  ('d3800000-0000-4000-8000-000000000403', 'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000101', 'd3800000-0000-4000-8000-000000000201', 'Ziyadah', 'An-Naba', 1, 4, now(), 'd3800000-0000-4000-8000-000000000014', 'Ustadz A', 'd3800000-0000-4000-8000-000000000503'),
  ('d3800000-0000-4000-8000-000000000404', 'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000103', 'd3800000-0000-4000-8000-000000000202', 'Ziyadah', 'Al-Fatihah', 1, 7, now(), 'd3800000-0000-4000-8000-000000000015', 'Ustadz B', 'd3800000-0000-4000-8000-000000000504');

SELECT ok(NOT has_table_privilege('anon', 'public.tahfidz_peer_reviews', 'SELECT'), 'anon cannot read peer-review rows directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.tahfidz_peer_reviews', 'SELECT'), 'authenticated cannot read peer-review rows directly');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tahfidz_peer_reviews'::regclass), 'peer-review table has row-level security enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.tahfidz_peer_reviews'::regclass), 'peer-review table forces row-level security');
SELECT ok(NOT has_function_privilege('anon', 'public.submit_tenant_tahfidz_peer_review(uuid,uuid,text,uuid,text,uuid)', 'EXECUTE'), 'anon cannot call review submit RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.submit_tenant_tahfidz_peer_review(uuid,uuid,text,uuid,text,uuid)', 'EXECUTE'), 'authenticated cannot call review submit RPC directly');

SET LOCAL ROLE service_role;

UPDATE public.tahfidz_memberships SET starts_on = CURRENT_DATE + 1
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000101' AND status = 'active';
SELECT is((public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
)->>'canSubmit'), 'false', 'future-dated reviewer membership does not grant peer-review access');
SELECT is(jsonb_array_length(public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
)->'reviewableRecords'), 0, 'future-dated reviewer membership exposes no reviewable records');
UPDATE public.tahfidz_memberships SET starts_on = CURRENT_DATE - 2
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000101' AND status = 'active';

UPDATE public.tahfidz_memberships SET ends_on = CURRENT_DATE - 1
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000101' AND status = 'active';
SELECT is((public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
)->>'canSubmit'), 'false', 'ended reviewer membership does not grant peer-review access');
SELECT is(jsonb_array_length(public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
)->'reviewableRecords'), 0, 'ended reviewer membership exposes no reviewable records');
UPDATE public.tahfidz_memberships SET ends_on = NULL
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000101' AND status = 'active';

SELECT is(public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
)->>'canSubmit', 'true', 'active Santri in a halaqah may submit');
SELECT throws_ok($$SELECT public.get_tenant_tahfidz_peer_review_snapshot(
  'd4800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
)$$, '42501', 'Akun tidak cocok dengan profil Tahfidz aktif pada tenant ini', 'a user cannot read peer reviews from another tenant');
SELECT is(jsonb_array_length(public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
)->'reviewableRecords'), 2, 'reviewer sees only other students records in the same halaqah');
UPDATE public.tahfidz_memberships SET starts_on = CURRENT_DATE + 1
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000102' AND status = 'active';
SELECT throws_ok($$SELECT public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000401', 'Setoran ini belum punya anggota aktif.', 'd3800000-0000-4000-8000-000000000606'
)$$, '42501', 'Penilaian hanya dapat dikirim dalam halaqah aktif yang sama', 'a future-dated target membership cannot receive reviews');
UPDATE public.tahfidz_memberships SET starts_on = CURRENT_DATE - 2
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000102' AND status = 'active';
UPDATE public.tahfidz_memberships SET ends_on = CURRENT_DATE - 1
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000102' AND status = 'active';
SELECT throws_ok($$SELECT public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000401', 'Setoran ini sudah tidak aktif.', 'd3800000-0000-4000-8000-000000000607'
)$$, '42501', 'Penilaian hanya dapat dikirim dalam halaqah aktif yang sama', 'an ended target membership cannot receive reviews');
UPDATE public.tahfidz_memberships SET ends_on = NULL
WHERE tenant_id = 'd3800000-0000-4000-8000-000000000009'
  AND student_id = 'd3800000-0000-4000-8000-000000000102' AND status = 'active';
SELECT is((public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000401', 'Bacaan sudah jelas dan rapi.', 'd3800000-0000-4000-8000-000000000601'
)->>'alreadyApplied'), 'false', 'Santri can submit text for another active member in their halaqah');
SELECT is((SELECT status FROM public.tahfidz_peer_reviews WHERE client_request_id = 'd3800000-0000-4000-8000-000000000601'), 'pending', 'new review is hidden pending Ustadz moderation');
SELECT is((public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000401', 'Bacaan sudah jelas dan rapi.', 'd3800000-0000-4000-8000-000000000601'
)->>'alreadyApplied'), 'true', 'identical client retry returns the stored review');
SELECT throws_ok($$SELECT public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000401', 'Isi berbeda untuk kunci yang sama.', 'd3800000-0000-4000-8000-000000000601'
)$$, '23505', 'Kunci permintaan penilaian telah dipakai untuk data berbeda', 'a request ID cannot be reused for different text');
SELECT is((public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000401', 'Bacaan sudah jelas dan rapi.', 'd3800000-0000-4000-8000-000000000602'
)->>'alreadyApplied'), 'true', 'a second identical submission cannot create a duplicate review');
SELECT is((public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000402', 'Mohon perhatikan kembali panjang bacaan.', 'd3800000-0000-4000-8000-000000000603'
)->>'alreadyApplied'), 'false', 'a different record can receive a separate review');
SELECT throws_ok($$SELECT public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000403', 'Saya menilai setoran saya sendiri.', 'd3800000-0000-4000-8000-000000000604'
)$$, '42501', 'Santri tidak dapat menilai setoran sendiri', 'self-review is rejected');
SELECT throws_ok($$SELECT public.submit_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri',
  'd3800000-0000-4000-8000-000000000404', 'Penilaian lintas kelompok tidak diperbolehkan.', 'd3800000-0000-4000-8000-000000000605'
)$$, '42501', 'Penilaian hanya dapat dikirim dalam halaqah aktif yang sama', 'cross-halaqah review is rejected');
SELECT throws_ok($$SELECT public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000016', 'santri'
)$$, '42501', 'Akses modul Tahfidz tidak diberikan kepada akun ini', 'explicitly denied Tahfidz module permission is enforced');
SELECT is((public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000014', 'ustadz'
)->>'canModerate'), 'true', 'assigned Ustadz can moderate their halaqah');
SELECT throws_ok($$SELECT public.moderate_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000015', 'ustadz',
  (SELECT id FROM public.tahfidz_peer_reviews WHERE client_request_id = 'd3800000-0000-4000-8000-000000000601'),
  'approved', NULL
)$$, '42501', 'Ustadz hanya dapat memoderasi halaqah tugasnya', 'another halaqah Ustadz cannot moderate this review');
SELECT is((public.moderate_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000014', 'ustadz',
  (SELECT id FROM public.tahfidz_peer_reviews WHERE client_request_id = 'd3800000-0000-4000-8000-000000000601'),
  'approved', NULL
)->>'status'), 'approved', 'assigned Ustadz can approve a pending review');
SELECT is((SELECT count(*)::INTEGER FROM public.tahfidz_peer_reviews WHERE status = 'approved'), 1, 'approved review is persisted');
SELECT is(jsonb_array_length(public.get_tenant_tahfidz_peer_review_snapshot(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000012', 'santri'
)->'reviews'), 1, 'approved feedback is visible to members of the same halaqah');
SELECT throws_ok($$SELECT public.moderate_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000014', 'ustadz',
  (SELECT id FROM public.tahfidz_peer_reviews WHERE client_request_id = 'd3800000-0000-4000-8000-000000000601'),
  'rejected', 'Catatan berbeda setelah keputusan.'
)$$, '23514', 'Penilaian sudah dimoderasi dan tidak dapat diubah', 'final moderation decisions cannot be changed');
SELECT is((public.moderate_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000014', 'ustadz',
  (SELECT id FROM public.tahfidz_peer_reviews WHERE client_request_id = 'd3800000-0000-4000-8000-000000000603'),
  'rejected', 'Mohon gunakan masukan yang lebih santun.'
)->>'status'), 'rejected', 'Ustadz can reject a review with a constructive note');
SELECT is((
  SELECT review_item->>'moderationNote'
  FROM jsonb_array_elements(public.get_tenant_tahfidz_peer_review_snapshot(
    'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000011', 'santri'
  )->'reviews') AS items(review_item)
  WHERE review_item->>'id' = (SELECT id::TEXT FROM public.tahfidz_peer_reviews WHERE client_request_id = 'd3800000-0000-4000-8000-000000000603')
), 'Mohon gunakan masukan yang lebih santun.', 'rejected author can read the Ustadz note');
SELECT throws_ok($$SELECT public.moderate_tenant_tahfidz_peer_review(
  'd3800000-0000-4000-8000-000000000009', 'd3800000-0000-4000-8000-000000000014', 'ustadz',
  (SELECT id FROM public.tahfidz_peer_reviews WHERE client_request_id = 'd3800000-0000-4000-8000-000000000603'),
  'rejected', 'x'
)$$, '22023', 'Keputusan moderasi tidak valid', 'rejection requires an explanatory note');

SELECT * FROM finish();
ROLLBACK;
