-- Verified-email guardian self-registration: exact tenant links only, no child
-- identifiers from the client, and one account can cover sibling records.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(42);

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
  ('c8000000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-other@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c8000000-0000-4000-8000-000000000016', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'guardian-unlinked@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.candidates (
  id, tenant_id, registration_id, name, email, nik_ciphertext, nik_fingerprint
) VALUES
  ('c8000000-0000-4000-8000-000000000101', 'c8000000-0000-4000-8000-000000000001', 'GS-001', 'Santri Satu', 'Guardian-Self@test.invalid', decode(repeat('a1', 44), 'hex'), decode(repeat('b1', 32), 'hex')),
  ('c8000000-0000-4000-8000-000000000102', 'c8000000-0000-4000-8000-000000000001', 'GS-002', 'Santri Dua', 'guardian-self@test.invalid', decode(repeat('a2', 44), 'hex'), decode(repeat('b2', 32), 'hex')),
  ('c8000000-0000-4000-8000-000000000103', 'c8000000-0000-4000-8000-000000000001', 'GS-003', 'Santri Tiga', 'guardian-other@test.invalid', decode(repeat('a3', 44), 'hex'), decode(repeat('b3', 32), 'hex')),
  ('c8000000-0000-4000-8000-000000000104', 'c8000000-0000-4000-8000-000000000001', 'GS-004', 'Santri Empat', 'guardian-self@test.invalid', decode(repeat('a4', 44), 'hex'), decode(repeat('b4', 32), 'hex')),
  ('c8000000-0000-4000-8000-000000000105', 'c8000000-0000-4000-8000-000000000001', 'GS-005', 'Santri Lima', 'guardian-self@test.invalid', decode(repeat('a5', 44), 'hex'), decode(repeat('b5', 32), 'hex'));

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

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES ('c8000000-0000-4000-8000-000000000016', 'c8000000-0000-4000-8000-000000000001',
  'guardian-unlinked@test.invalid', 'Wali Tanpa Tautan', 'wali_santri', 'active', '{}');

INSERT INTO public.finance_bills (
  tenant_id, student_id, candidate_id, student_name, grade, fee_type, period, amount,
  payment_type, created_by_user_id
)
VALUES
  ('c8000000-0000-4000-8000-000000000001', NULL, 'c8000000-0000-4000-8000-000000000101', 'Santri Satu', 'VII', 'Biaya Pendaftaran PPDB', 'GS-001', 100000, 'registration', 'c8000000-0000-4000-8000-000000000012'),
  ('c8000000-0000-4000-8000-000000000001', NULL, 'c8000000-0000-4000-8000-000000000102', 'Santri Dua', 'VII', 'Biaya Pendaftaran PPDB', 'GS-002', 100000, 'registration', 'c8000000-0000-4000-8000-000000000012'),
  ('c8000000-0000-4000-8000-000000000001', NULL, 'c8000000-0000-4000-8000-000000000104', 'Santri Empat', 'VII', 'Biaya Pendaftaran PPDB', 'GS-004', 100000, 'registration', 'c8000000-0000-4000-8000-000000000012');

SELECT ok(NOT has_function_privilege('anon', 'public.claim_guardian_account_by_verified_email(uuid,uuid)', 'EXECUTE'), 'anonymous users cannot claim guardian accounts');
SELECT ok(NOT has_function_privilege('authenticated', 'public.claim_guardian_account_by_verified_email(uuid,uuid)', 'EXECUTE'), 'authenticated users cannot call the trusted claim RPC directly');
SELECT ok(NOT has_table_privilege('anon', 'public.guardian_candidate_accounts', 'SELECT'), 'anonymous users cannot read Wali-candidate mappings');
SELECT ok(NOT has_table_privilege('authenticated', 'public.guardian_candidate_accounts', 'SELECT'), 'authenticated users cannot read Wali-candidate mappings directly');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.guardian_candidate_accounts'::regclass), 'Wali-candidate mappings have RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.guardian_candidate_accounts'::regclass), 'Wali-candidate mappings force RLS');
SELECT ok(NOT has_function_privilege('anon', 'public.guardian_can_access_candidate(uuid,uuid,uuid)', 'EXECUTE'), 'anonymous callers cannot query candidate access decisions');
SELECT ok(NOT has_function_privilege('authenticated', 'public.guardian_can_access_candidate(uuid,uuid,uuid)', 'EXECUTE'), 'browser clients cannot query candidate access decisions directly');
SELECT is((SELECT count(*)::int FROM public.guardians WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND details ->> 'email' = 'guardian-self@test.invalid'), 2, 'guardian email is normalized and copied from the PPDB candidate');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.guardian_user_accounts'::regclass AND conname = 'guardian_user_accounts_tenant_id_user_id_key'), 'one tenant guardian login may link to multiple sibling guardian records');

SET LOCAL ROLE service_role;

SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011')->>'success', 'true', 'a verified matching contact email creates the Wali account');
SELECT is((SELECT role FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000011'), 'wali_santri', 'self-registration can create only the Wali role');
SELECT is((SELECT tenant_id::text FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000011'), 'c8000000-0000-4000-8000-000000000001', 'the account is restricted to the configured tenant');
SELECT is((SELECT count(*)::int FROM public.guardian_user_accounts WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND user_id = 'c8000000-0000-4000-8000-000000000011' AND status = 'active'), 2, 'the account links only the records sharing its verified email');
SELECT is((SELECT count(*)::int FROM public.guardian_candidate_accounts WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND user_id = 'c8000000-0000-4000-8000-000000000011' AND status = 'active'), 3, 'the account links only billed, not-yet-onboarded candidates sharing its verified email');
SELECT is((SELECT module_permissions FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000011'), '{}'::jsonb, 'self-registration cannot grant extra module permissions');
SELECT ok(public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000101'), 'verified Wali can access own pre-onboarding candidate bill');
SELECT ok(public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000104'), 'verified Wali can access another billed sibling candidate');
RESET ROLE;
UPDATE auth.users SET email = 'guardian-updated@test.invalid'
WHERE id = 'c8000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT ok(NOT public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000101'), 'candidate access is denied after the verified Auth email changes');
RESET ROLE;
UPDATE auth.users SET email = 'guardian-self@test.invalid'
WHERE id = 'c8000000-0000-4000-8000-000000000011';
UPDATE auth.users SET email_confirmed_at = NULL
WHERE id = 'c8000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
SELECT ok(NOT public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000101'), 'candidate access requires a currently confirmed Auth email');
RESET ROLE;
UPDATE auth.users SET email_confirmed_at = now()
WHERE id = 'c8000000-0000-4000-8000-000000000011';
SET LOCAL ROLE service_role;
UPDATE public.candidates SET stage = 'Rejected'
WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001'
  AND id = 'c8000000-0000-4000-8000-000000000101';
SELECT ok(NOT public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000101'), 'candidate access is revoked when the PPDB application is rejected');
UPDATE public.candidates SET stage = 'Registered'
WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001'
  AND id = 'c8000000-0000-4000-8000-000000000101';
SELECT ok(NOT public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000103'), 'Wali cannot access a candidate whose email differs');
SELECT ok(NOT public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000016', 'c8000000-0000-4000-8000-000000000104'), 'another active Wali profile without a candidate mapping is denied');
SELECT ok(NOT public.guardian_can_access_candidate('c9000000-0000-4000-8000-000000000009', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000104'), 'candidate access cannot cross tenants');
SELECT is((SELECT count(*)::int FROM public.guardian_candidate_accounts WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND candidate_id = 'c8000000-0000-4000-8000-000000000105'), 0, 'an email match without an issued Finance bill does not create candidate access');
SELECT ok(public.guardian_can_access_student('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000201'), 'the verified Wali can access the first linked child');
SELECT ok(public.guardian_can_access_student('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000202'), 'the verified Wali can access a sibling linked by the same verified email');
SELECT ok(NOT public.guardian_can_access_student('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000203'), 'the Wali cannot access a child with a different contact email');
SELECT is(
  public.register_tenant_finance_payment_proof(
    'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'wali_santri',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND candidate_id = 'c8000000-0000-4000-8000-000000000104'),
    'financeProofs/c8000000-0000-4000-8000-000000000001/candidate-c8000000-0000-4000-8000-000000000104/' ||
      (SELECT id::text FROM public.finance_bills WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND candidate_id = 'c8000000-0000-4000-8000-000000000104') || '/proof.pdf',
    'proof.pdf', 'BSI', repeat('c', 64), 'c8000000-0000-4000-8000-000000000501'
  )->>'status', 'verification', 'verified Wali can submit proof for an own pre-onboarding candidate bill'
);
SELECT is(
  (SELECT status FROM public.finance_bills WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND candidate_id = 'c8000000-0000-4000-8000-000000000104'),
  'verification', 'candidate proof moves only that candidate bill into verification'
);
SELECT throws_ok(
  $$SELECT public.register_tenant_finance_payment_proof(
    'c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000016', 'wali_santri',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND candidate_id = 'c8000000-0000-4000-8000-000000000104'),
    'financeProofs/c8000000-0000-4000-8000-000000000001/candidate-c8000000-0000-4000-8000-000000000104/' ||
      (SELECT id::text FROM public.finance_bills WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND candidate_id = 'c8000000-0000-4000-8000-000000000104') || '/wrong.pdf',
    'wrong.pdf', 'BSI', repeat('d', 64), 'c8000000-0000-4000-8000-000000000502'
  )$$,
  '42501', 'Tagihan tidak terhubung ke akun wali ini',
  'another active Wali cannot submit proof for the candidate bill'
);
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011')->>'success', 'true', 'retries are idempotent for the same verified account');
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000013')->>'code', 'EMAIL_NOT_CONFIRMED', 'email confirmation is required before linking');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000013'), 0, 'an unconfirmed email receives no ERP profile');
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000015')->>'code', 'LINK_NOT_AVAILABLE', 'a second account cannot claim guardian rows already linked to another account');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000015'), 0, 'a conflicting account receives no ERP profile');
SELECT is(public.claim_guardian_account_by_verified_email('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000014')->>'code', 'LINK_NOT_AVAILABLE', 'an email absent from active guardian records cannot be linked');
SELECT is((SELECT count(*)::int FROM public.profiles WHERE user_id = 'c8000000-0000-4000-8000-000000000014'), 0, 'an unmatched email receives no ERP profile');

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
) VALUES (
  'c8000000-0000-4000-8000-000000000204', 'c8000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000104', '2345678904', 'Santri Empat', 'L', 'VII',
  decode(repeat('c4', 44), 'hex'), decode(repeat('d4', 32), 'hex'), 'guardian-self-class', 'guardian-self-room'
);
INSERT INTO public.guardians (id, tenant_id, source_candidate_id, name, phone, details)
VALUES ('c8000000-0000-4000-8000-000000000304', 'c8000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000104', 'Wali Empat', '081200000004', '{}');
INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id)
VALUES ('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000304', 'c8000000-0000-4000-8000-000000000204');
UPDATE public.candidates
SET master_student_id = 'c8000000-0000-4000-8000-000000000204',
    master_guardian_id = 'c8000000-0000-4000-8000-000000000304'
WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001'
  AND id = 'c8000000-0000-4000-8000-000000000104';
SELECT is((SELECT student_id::text FROM public.finance_bills WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND candidate_id = 'c8000000-0000-4000-8000-000000000104'), 'c8000000-0000-4000-8000-000000000204', 'onboarding links candidate invoices to the canonical student');
SELECT is((SELECT count(*)::int FROM public.guardian_user_accounts WHERE tenant_id = 'c8000000-0000-4000-8000-000000000001' AND guardian_id = 'c8000000-0000-4000-8000-000000000304' AND user_id = 'c8000000-0000-4000-8000-000000000011' AND status = 'active'), 1, 'onboarding transfers the candidate account mapping to the new Guardian record');
SELECT ok(NOT public.guardian_can_access_candidate('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000104'), 'candidate-only access ends after onboarding');
SELECT ok(public.guardian_can_access_student('c8000000-0000-4000-8000-000000000001', 'c8000000-0000-4000-8000-000000000011', 'c8000000-0000-4000-8000-000000000204'), 'the same verified account retains access through the canonical student relation');

ROLLBACK;
