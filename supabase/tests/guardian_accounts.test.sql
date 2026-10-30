-- Synthetic Wali invitation tests. Every fixture is rolled back after the suite.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(30);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('c7000000-0000-4000-8000-000000000007', 'guardian-invite-test', 'Guardian Invite Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c7000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-parent@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-wrong@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7000000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-expired@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c7000000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-legacy@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES ('c7000000-0000-4000-8000-000000000011', 'c7000000-0000-4000-8000-000000000007',
  'guardian-admin@test.invalid', 'Admin Uji', 'admin', 'active', '{"users":true}'),
 ('c7000000-0000-4000-8000-000000000015', 'c7000000-0000-4000-8000-000000000007',
  'guardian-legacy@test.invalid', 'Wali Lama', 'wali_santri', 'active', '{}');

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('c7000000-0000-4000-8000-000000000101', 'c7000000-0000-4000-8000-000000000007', 'G-TEST-001', 'Santri Satu', decode(repeat('a1', 44), 'hex'), decode(repeat('b1', 32), 'hex')),
  ('c7000000-0000-4000-8000-000000000102', 'c7000000-0000-4000-8000-000000000007', 'G-TEST-002', 'Santri Dua', decode(repeat('a2', 44), 'hex'), decode(repeat('b2', 32), 'hex')),
  ('c7000000-0000-4000-8000-000000000103', 'c7000000-0000-4000-8000-000000000007', 'G-TEST-PARENT', 'Wali Uji', decode(repeat('a3', 44), 'hex'), decode(repeat('b3', 32), 'hex')),
  ('c7000000-0000-4000-8000-000000000104', 'c7000000-0000-4000-8000-000000000007', 'G-TEST-PARENT-2', 'Wali Kedua', decode(repeat('a4', 44), 'hex'), decode(repeat('b4', 32), 'hex')),
  ('c7000000-0000-4000-8000-000000000105', 'c7000000-0000-4000-8000-000000000007', 'G-TEST-PARENT-3', 'Wali Ketiga', decode(repeat('a5', 44), 'hex'), decode(repeat('b5', 32), 'hex'));

INSERT INTO public.master_data_records (tenant_id, category, id, name, capacity)
VALUES
  ('c7000000-0000-4000-8000-000000000007', 'Kelas', 'guardian-class-test', 'VII - A', NULL),
  ('c7000000-0000-4000-8000-000000000007', 'Kelas', 'guardian-class-test-2', 'VIII - B', NULL),
  ('c7000000-0000-4000-8000-000000000007', 'Kamar', 'guardian-room-test', 'Kamar Uji', 10);

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
) VALUES
  ('c7000000-0000-4000-8000-000000000201', 'c7000000-0000-4000-8000-000000000007',
   'c7000000-0000-4000-8000-000000000101', '2345678901', 'Santri Satu', 'L', 'VII',
   decode(repeat('c1', 44), 'hex'), decode(repeat('d1', 32), 'hex'), 'guardian-class-test', 'guardian-room-test'),
  ('c7000000-0000-4000-8000-000000000202', 'c7000000-0000-4000-8000-000000000007',
   'c7000000-0000-4000-8000-000000000102', '2345678902', 'Santri Dua', 'L', 'VIII',
   decode(repeat('c2', 44), 'hex'), decode(repeat('d2', 32), 'hex'), 'guardian-class-test-2', 'guardian-room-test');

INSERT INTO public.guardians (id, tenant_id, source_candidate_id, name, phone)
VALUES ('c7000000-0000-4000-8000-000000000301', 'c7000000-0000-4000-8000-000000000007',
  'c7000000-0000-4000-8000-000000000103', 'Wali Uji', '081200000003'),
  ('c7000000-0000-4000-8000-000000000302', 'c7000000-0000-4000-8000-000000000007',
   'c7000000-0000-4000-8000-000000000104', 'Wali Kedua', '081200000004'),
  ('c7000000-0000-4000-8000-000000000303', 'c7000000-0000-4000-8000-000000000007',
   'c7000000-0000-4000-8000-000000000105', 'Wali Ketiga', '081200000005');

INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id)
VALUES
  ('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000301', 'c7000000-0000-4000-8000-000000000201'),
  ('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000301', 'c7000000-0000-4000-8000-000000000202'),
  ('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000302', 'c7000000-0000-4000-8000-000000000202');

INSERT INTO public.guardian_account_invitations (
  tenant_id, guardian_id, email, token_hash, module_permissions, expires_at, created_by_uid
) VALUES
  ('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000301',
   'guardian-parent@test.invalid', decode(repeat('11', 32), 'hex'), '{"finance":true,"tahfidz":true}',
   now() + interval '1 hour', 'c7000000-0000-4000-8000-000000000011'),
  ('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000302',
   'guardian-parent@test.invalid', decode(repeat('22', 32), 'hex'), '{}',
   now() + interval '1 hour', 'c7000000-0000-4000-8000-000000000011'),
  ('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000303',
   'guardian-expired@test.invalid', decode(repeat('33', 32), 'hex'), '{}',
   now() - interval '1 minute', 'c7000000-0000-4000-8000-000000000011');

SELECT ok(NOT has_table_privilege('anon', 'public.guardian_user_accounts', 'SELECT'), 'anon cannot read guardian account links');
SELECT ok(NOT has_table_privilege('authenticated', 'public.guardian_user_accounts', 'SELECT'), 'authenticated cannot read guardian account links');
SELECT ok(NOT has_table_privilege('anon', 'public.guardian_account_invitations', 'SELECT'), 'anon cannot read guardian invitation hashes');
SELECT ok(NOT has_table_privilege('authenticated', 'public.guardian_account_invitations', 'SELECT'), 'authenticated cannot read guardian invitation hashes');
SELECT ok(NOT has_function_privilege('anon', 'public.claim_guardian_account_invitation(bytea,uuid,text)', 'EXECUTE'), 'anon cannot claim guardian invitations');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_guardian_account_invitation(bytea,uuid,text)', 'EXECUTE'), 'authenticated cannot call the trusted invitation claim');
SELECT ok(NOT has_function_privilege('anon', 'public.communication_announcement_recipient_user_ids(uuid,text)', 'EXECUTE'), 'anon cannot enumerate communication recipients');
SELECT ok(NOT has_function_privilege('authenticated', 'public.communication_announcement_recipient_user_ids(uuid,text)', 'EXECUTE'), 'authenticated cannot enumerate communication recipients');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.guardian_user_accounts'::regclass), 'guardian account links have RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.guardian_user_accounts'::regclass), 'guardian account links force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.guardian_account_invitations'::regclass), 'guardian invitations have RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.guardian_account_invitations'::regclass), 'guardian invitations force RLS');

SET LOCAL ROLE service_role;

SELECT throws_ok(
  $$INSERT INTO public.guardian_account_invitations (
    tenant_id, guardian_id, email, token_hash, status, expires_at, created_by_uid, claimed_at
  ) VALUES (
    'c7000000-0000-4000-8000-000000000007',
    'c7000000-0000-4000-8000-000000000303',
    'guardian-expired@test.invalid',
    decode(repeat('44', 32), 'hex'),
    'claimed',
    now() + interval '1 hour',
    'c7000000-0000-4000-8000-000000000011',
    now()
  )$$,
  '23514',
  'new row for relation "guardian_account_invitations" violates check constraint "guardian_account_invitations_claim_state_check"',
  'a claimed invitation must have both claimant and claim timestamp'
);

SELECT is(
  public.claim_guardian_account_invitation(decode(repeat('11', 32), 'hex'), 'c7000000-0000-4000-8000-000000000012', 'guardian-parent@test.invalid')->>'success',
  'true',
  'valid invitation creates the Wali profile atomically'
);
SELECT ok(
  public.guardian_can_access_student('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000012', 'c7000000-0000-4000-8000-000000000201')
  AND public.guardian_can_access_student('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000012', 'c7000000-0000-4000-8000-000000000202'),
  'one Wali login can access every active linked child'
);
SELECT ok(
  NOT public.guardian_can_access_student('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000012', 'c7000000-0000-4000-8000-000000000203'),
  'an unlinked student is not visible to the Wali'
);
SELECT throws_ok(
  $$SELECT public.claim_guardian_account_invitation(decode(repeat('11', 32), 'hex'), 'c7000000-0000-4000-8000-000000000012', 'guardian-parent@test.invalid')$$,
  '42501',
  'Undangan tidak valid atau sudah digunakan',
  'an invitation is single-use'
);
SELECT throws_ok(
  $$SELECT public.claim_guardian_account_invitation(decode(repeat('22', 32), 'hex'), 'c7000000-0000-4000-8000-000000000013', 'guardian-wrong@test.invalid')$$,
  '42501',
  'Email akun tidak sesuai dengan undangan',
  'the invited email must match the authenticated email'
);
SELECT is(
  public.claim_guardian_account_invitation(decode(repeat('33', 32), 'hex'), 'c7000000-0000-4000-8000-000000000014', 'guardian-expired@test.invalid')->>'code',
  'INVITATION_EXPIRED',
  'expired invitations are reported without rolling back their state'
);
SELECT is(
  (SELECT status FROM public.guardian_account_invitations WHERE token_hash = decode(repeat('33', 32), 'hex')),
  'expired',
  'an expired invitation is persistently marked expired'
);
SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE tenant_id = 'c7000000-0000-4000-8000-000000000007' AND user_id IN ('c7000000-0000-4000-8000-000000000013', 'c7000000-0000-4000-8000-000000000014')),
  0,
  'invalid and expired claims leave no orphan ERP profiles'
);

SELECT is(
  public.link_existing_guardian_account('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000302', 'c7000000-0000-4000-8000-000000000015', 'c7000000-0000-4000-8000-000000000011')->>'success',
  'true',
  'an Admin can link a verified legacy Wali profile to its selected guardian record'
);
SELECT ok(
  public.guardian_can_access_student('c7000000-0000-4000-8000-000000000007', 'c7000000-0000-4000-8000-000000000015', 'c7000000-0000-4000-8000-000000000202'),
  'the linked legacy Wali gains access only through the canonical guardian relationship'
);
SELECT is((SELECT count(*)::int FROM public.communication_announcement_recipient_user_ids('c7000000-0000-4000-8000-000000000007', 'Semua Wali Santri')), 2, 'all linked active Wali accounts are included in the audience');
SELECT ok((SELECT array_agg(user_id) @> ARRAY['c7000000-0000-4000-8000-000000000012'::uuid] FROM public.communication_announcement_recipient_user_ids('c7000000-0000-4000-8000-000000000007', 'Wali Santri Kelas VII - A')), 'a Wali is matched through the class of any linked child');
SELECT ok(NOT (SELECT array_agg(user_id) @> ARRAY['c7000000-0000-4000-8000-000000000015'::uuid] FROM public.communication_announcement_recipient_user_ids('c7000000-0000-4000-8000-000000000007', 'Wali Santri Kelas VII - A')), 'a Wali linked only to another class is excluded');
SELECT is((SELECT count(*)::int FROM public.communication_announcement_recipient_user_ids('c7000000-0000-4000-8000-000000000007', 'Target tidak dikenal')), 0, 'unknown announcement targets fail closed');

SELECT is(
  public.create_boarding_facility_ticket(
    'c7000000-0000-4000-8000-000000000007', 'guardian-room-test', 'Lampu rusak', 'Lampu kamar padam', 'Medium',
    'c7000000-0000-4000-8000-000000000011', 'admin', 'Admin Uji', 'c7000000-0000-4000-8000-000000000401'
  )->>'success',
  'true',
  'an active tenant Admin can create a facility ticket'
);
SELECT throws_ok(
  $$SELECT public.create_boarding_facility_ticket(
    'c7000000-0000-4000-8000-000000000007', 'guardian-room-test', 'Lampu rusak', 'Lampu kamar padam', 'Medium',
    'c7000000-0000-4000-8000-000000000011', 'admin', 'Nama pelapor berbeda', 'c7000000-0000-4000-8000-000000000401'
  )$$,
  '23505',
  'Kunci permintaan tiket digunakan untuk data berbeda',
  'a facility-ticket retry rejects a changed reporter snapshot'
);
SELECT is(
  public.create_boarding_facility_ticket(
    'c7000000-0000-4000-8000-000000000007', 'guardian-room-test', 'Lampu rusak', 'Lampu kamar padam', 'Medium',
    'c7000000-0000-4000-8000-000000000011', 'admin', 'Admin Uji', 'c7000000-0000-4000-8000-000000000401'
  )->>'alreadyApplied',
  'true',
  'an identical facility-ticket retry returns the original operation'
);
SELECT * FROM finish();
ROLLBACK;
