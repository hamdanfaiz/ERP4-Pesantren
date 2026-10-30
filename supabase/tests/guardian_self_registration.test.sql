-- Verified-email guardian self-registration: exact tenant links only, no child
-- identifiers from the client, and one account can cover sibling records.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(19);

INSERT INTO public.tenants (id, slug, name, status)
VALUES ('c8000000-0000-4000-8000-000000000001', 'guardian-self-test', 'Guardian Self Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c8000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-self@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c8000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-existing@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c8000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-unverified@test.invalid', '', NULL, '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c8000000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-no-match@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c8000000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-other@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.candidates (
  id, tenant_id, registration_id, name, email, nik_ciphertext, nik_fingerprint
) VALUES
  ('c8000000-0000-4000-8000-000000000101', 'c8000000-0000-4000-8000-000000000001', 'GS-001', 'Santri Satu', 'Guardian-Self@test.invalid', decode(repeat('a1', 44), 'hex'), decode(repeat('b1', 32), 'hex')),
  ('c8000000-0000-4000-8000-000000000102', 'c8000000-0000-4000-8000-000000000001', 'GS-002', 'Santri Dua', 'guardian-self@test.invalid', decode(repeat('a2', 44), 'hex'), decode(repeat('b2', 32), 'hex')),
  ('c8000000-0000-4000-8000-000000000103', 'c8000000-0000-4000-8000-000000000001', 'GS-003', 'Santri Tiga', 'guardian-other@test.invalid', decode(repeat('a3', 44), 'hex'), decode(repeat('b3', 32), 'hex'));

INSERT INTO public.master_data_records (tenant_id, category, id, name, capacity)
VALUES
  ('c8000000-0000-4000-8000-000000000001', 'Kelas', 'guardian-self-class', 'VII - A', NULL),
  ('c8000000-0000-4000-8000-000000000001', 'Kamar', 'guardian-self-room', 'Kamar Uji', 10);

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
) VALUES
  ('c8000000-0000-4000-8000-000000000201', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000101', '2345678901', 'Santri Satu', 'L', 'VII', decode(repeat('c1', 44), 'hex'), decode(repeat('d1', 32), 'hex'), 'guardian-self-class', 'guardian-self-room'),
  ('c8000000-0000-4000-8000-000000000202', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000102', '2345678902', 'Santri Dua', 'L', 'VII', decode(repeat('c2', 44), 'hex'), decode(repeat('d2', 32), 'hex'), 'guardian-self-class', 'guardian-self-room'),
  ('c8000000-0000-4000-8000-000000000203', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000103', '2345678903', 'Santri Tiga', 'L', 'VII', decode(repeat('c3', 44), 'hex'), decode(repeat('d3', 32), 'hex'), 'guardian-self-class', 'guardian-self-room');

INSERT INTO public.guardians (id, tenant_id, source_candidate_id, name, phone, details)
VALUES
  ('c8000000-0000-4000-8000-000000000301', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000101', 'Wali Satu', '081200000001', '{}'),
  ('c8000000-0000-4000-8000-000000000302', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000102', 'Wali Satu', '081200000001', '{}'),
  ('c8000000-0000-4000-8000-000000000303', 'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000103', 'Wali Tiga', '081200000003', '{}');

INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id)
VALUES
  ('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000301', 'c8000000-0000-4000-8000-000000000201'),
  ('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000302', 'c8000000-0000-4000-8000-000000000202'),
  ('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000303', 'c8000000-0000-4000-8000-000000000203');

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES ('c8000000-0000-4000-8000-000000000012', 'c8000000-0000-4000-8000-000000000001',
  'guardian-existing@test.invalid', 'Wali Eksisting', 'wali_santri', 'active', '{}');
INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
VALUES ('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000303', 'c8000000-0000-4000-8000-000000000012');

SELECT ok(NOT has_function_privilege('anon', 'public.claim_guardian_account_by_verified_email(uuid,uuid)', 'EXECUTE'), 'anonymous users cannot claim guardian accounts');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_guardian_account_by_verified_email(uuid,uuid)', 'EXECUTE'), 'authenticated users cannot call the trusted claim RPC directly');
SELECT is((SELECT count(*)::int FROM public.guardians WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND details ->> 'email' = 'guardian-self@test.invalid'), 2, 'guardian email is normalized and copied from the PPDB candidate');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.guardian_user_accounts'::regclass AND conname = 'guardian_user_accounts_tenant_id_user_id_key'), 'one tenant guardian login may link to multiple sibling guardian records');

SET LOCAL ROLE service_role;

SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011')->>'success', 'true', 'a verified matching contact email creates the Wali account');
SELECT is((SELECT role FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000011'), 'wali_santri', 'self-registration can create only the Wali role');
SELECT is((SELECT tenant_id::text FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000011'), 'c8000000-0000-4000-8000-000000000001', 'the account is restricted to the configured tenant');
SELECT is((SELECT count(*)::int FROM public.guardian_user_accounts WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND user_id = 'c8000000-0000-4000-8000-000000000011' AND status = 'active'), 2, 'the account links only the records sharing its verified email');
SELECT is((SELECT module_permissions FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000011'), '{}'::jsonb, 'self-registration cannot grant extra module permissions');
SELECT ok(public.guardian_can_access_student('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000201'), 'the verified Wali can access the first linked child');
SELECT ok(public.guardian_can_access_student('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000202'), 'the verified Wali can access a sibling linked by the same verified email');
SELECT ok(NOT public.guardian_can_access_student('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000203'), 'the Wali cannot access a child with a different contact email');
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011')->>'success', 'true', 'retries are idempotent for the same verified account');
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000013')->>'code', 'EMAIL_NOT_CONFIRMED', 'email confirmation is required before linking');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000013'), 0, 'an unconfirmed email receives no ERP profile');
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000015')->>'code', 'LINK_NOT_AVAILABLE', 'a second account cannot claim guardian rows already linked to another account');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000015'), 0, 'a conflicting account receives no ERP profile');
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000014')->>'code', 'LINK_NOT_AVAILABLE', 'an email absent from active guardian records cannot be linked');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000014'), 0, 'an unmatched email receives no ERP profile');

ROLLBACK;
