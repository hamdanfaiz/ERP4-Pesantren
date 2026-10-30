-- Finance workflow contract tests using synthetic identities; all changes roll back.
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(74);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('e5000000-0000-4000-8000-000000000005', 'finance-runtime-a-test', 'Finance Runtime A Test', 'active'),
  ('f6000000-0000-4000-8000-000000000006', 'finance-runtime-b-test', 'Finance Runtime B Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('e5000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance-guardian@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('e5000000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance-other-guardian@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('e5000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000005', 'finance-a@test.invalid', 'Finance Maker', 'admin', 'active', '{"finance":true}'),
  ('e5000000-0000-4000-8000-000000000012', 'e5000000-0000-4000-8000-000000000005', 'finance-b@test.invalid', 'Finance Checker', 'admin', 'active', '{"finance":true}'),
  ('e5000000-0000-4000-8000-000000000013', 'e5000000-0000-4000-8000-000000000005', 'finance-guardian@test.invalid', 'Finance Guardian', 'wali_santri', 'active', '{"finance":true}'),
  ('e5000000-0000-4000-8000-000000000014', 'e5000000-0000-4000-8000-000000000005', 'finance-other-guardian@test.invalid', 'Other Guardian', 'wali_santri', 'active', '{"finance":true}');

INSERT INTO public.organization_units (id, tenant_id, code, name, unit_type, status, created_by_user_id, updated_by_user_id)
VALUES (
  'e5000000-0000-4000-8000-000000000701', 'e5000000-0000-4000-8000-000000000005',
  'PUSAT', 'Pusat Finance Test', 'pesantren', 'active',
  'e5000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000011'
);

UPDATE public.profiles
SET linked_santri_id = 'e5000000-0000-4000-8000-000000000201'
WHERE user_id = 'e5000000-0000-4000-8000-000000000013';
UPDATE public.profiles
SET linked_santri_id = 'e5000000-0000-4000-8000-000000000299'
WHERE user_id = 'e5000000-0000-4000-8000-000000000014';

INSERT INTO public.candidates (id, tenant_id, registration_id, name, nik_ciphertext, nik_fingerprint)
VALUES
  ('e5000000-0000-4000-8000-000000000101', 'e5000000-0000-4000-8000-000000000005',
   'FIN-TEST-001', 'Santri Finance Test', decode(repeat('ab', 44), 'hex'), decode(repeat('cd', 32), 'hex')),
  ('e5000000-0000-4000-8000-000000000102', 'e5000000-0000-4000-8000-000000000005',
   'FIN-TEST-002', 'Sibling Finance Test', decode(repeat('ac', 44), 'hex'), decode(repeat('ce', 32), 'hex')),
  ('e5000000-0000-4000-8000-000000000103', 'e5000000-0000-4000-8000-000000000005',
   'FIN-GUARDIAN-001', 'Finance Guardian', decode(repeat('ad', 44), 'hex'), decode(repeat('cf', 32), 'hex')),
  ('e5000000-0000-4000-8000-000000000104', 'e5000000-0000-4000-8000-000000000005',
   'FIN-GUARDIAN-002', 'Other Guardian', decode(repeat('ae', 44), 'hex'), decode(repeat('d0', 32), 'hex'));
INSERT INTO public.master_data_records (tenant_id, category, id, name, capacity)
VALUES
  ('e5000000-0000-4000-8000-000000000005', 'Kelas', 'finance-class-test', 'Kelas Finance Test', NULL),
  ('e5000000-0000-4000-8000-000000000005', 'Kamar', 'finance-room-test', 'Kamar Finance Test', 10);
INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
)
VALUES (
  'e5000000-0000-4000-8000-000000000201', 'e5000000-0000-4000-8000-000000000005',
  'e5000000-0000-4000-8000-000000000101', '1234567890', 'Santri Finance Test', 'L', 'VII',
  decode(repeat('ef', 44), 'hex'), decode(repeat('12', 32), 'hex'), 'finance-class-test', 'finance-room-test'
);

INSERT INTO public.students (
  id, tenant_id, source_candidate_id, nis, name, gender, grade,
  nik_ciphertext, nik_fingerprint, class_id, room_id
) VALUES (
  'e5000000-0000-4000-8000-000000000202', 'e5000000-0000-4000-8000-000000000005',
  'e5000000-0000-4000-8000-000000000102', '1234567891', 'Sibling Finance Test', 'L', 'VIII',
  decode(repeat('f0', 44), 'hex'), decode(repeat('13', 32), 'hex'), 'finance-class-test', 'finance-room-test'
);
INSERT INTO public.guardians (id, tenant_id, source_candidate_id, name, phone)
VALUES
  ('e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000005',
   'e5000000-0000-4000-8000-000000000103', 'Finance Guardian', '081200000001'),
  ('e5000000-0000-4000-8000-000000000302', 'e5000000-0000-4000-8000-000000000005',
   'e5000000-0000-4000-8000-000000000104', 'Other Guardian', '081200000002');
INSERT INTO public.guardian_students (tenant_id, guardian_id, student_id)
VALUES
  ('e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000201'),
  ('e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000202');
INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
VALUES
  ('e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000301', 'e5000000-0000-4000-8000-000000000013'),
  ('e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000302', 'e5000000-0000-4000-8000-000000000014');

SELECT ok(
  public.guardian_can_access_student('e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000013', 'e5000000-0000-4000-8000-000000000202'),
  'guardian account authorizes a second linked child'
);
SELECT ok(NOT has_table_privilege('anon', 'public.finance_expenses', 'SELECT'), 'anon cannot read Finance expenses directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_expenses', 'SELECT'), 'authenticated cannot read Finance expenses directly');
SELECT ok(NOT has_table_privilege('anon', 'public.finance_bills', 'SELECT'), 'anon cannot read Finance bills directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_bills', 'SELECT'), 'authenticated cannot read Finance bills directly');
SELECT ok(NOT has_function_privilege('anon', 'public.create_tenant_finance_expense(uuid,uuid,text,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'anon cannot call Finance write RPC directly');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_tenant_finance_expense(uuid,uuid,text,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'authenticated cannot call Finance write RPC directly');
SELECT ok(NOT has_function_privilege('service_role', 'public.create_tenant_finance_expense(uuid,uuid,text,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'trusted backend must use the unit-scoped Finance write RPC');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_expenses'::regclass), 'finance_expenses has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_expenses'::regclass), 'finance_expenses forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_ledger'::regclass), 'finance_ledger has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_ledger'::regclass), 'finance_ledger forces RLS');

SET LOCAL ROLE service_role;

SELECT is(
  public.create_tenant_finance_expense_for_unit(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000701', 'Utilitas', 'Tagihan listrik Oktober', 'Operasional', 125000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000101'
  )->>'success',
  'true',
  'Admin can create a pending expense request'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_expenses
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND description = 'Tagihan listrik Oktober' AND status = 'pending'),
  1,
  'expense starts pending and is stored in its tenant'
);
SELECT is(
  (public.create_tenant_finance_expense_for_unit(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000701', 'Utilitas', 'Tagihan listrik Oktober', 'Operasional', 125000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000101'
  )->>'expenseId'),
  (SELECT id::text FROM public.finance_expenses
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober'),
  'same request key and payload return the original expense'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_expenses
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober'),
  1,
  'idempotent retry does not duplicate the expense'
);

SELECT throws_ok(
  $$SELECT public.create_tenant_finance_expense_for_unit(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000701', 'Utilitas', 'Payload berubah', 'Operasional', 125000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000101'
  )$$,
  '23505',
  'Kunci permintaan telah dipakai untuk data berbeda',
  'request key cannot be reused with a different payload'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_expenses
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Payload berubah'),
  0,
  'rejected idempotency-key reuse creates no expense'
);
SELECT throws_ok(
  $$SELECT public.create_tenant_finance_expense_for_unit(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'ustadz',
    'e5000000-0000-4000-8000-000000000701', 'Utilitas', 'Role palsu', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000102'
  )$$,
  '42501',
  'Profil aktif tidak sesuai dengan pengaju',
  'RPC rejects a role that does not match the active profile'
);

SELECT throws_ok(
  $$SELECT public.review_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober'),
    'approve', NULL, 'e5000000-0000-4000-8000-000000000201'
  )$$,
  '42501',
  'Pengaju tidak boleh menyetujui atau menolak pengajuannya sendiri',
  'maker cannot approve their own expense'
);
SELECT is(
  (SELECT status FROM public.finance_expenses
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober'),
  'pending',
  'failed self-approval leaves the expense pending'
);

SELECT is(
  public.review_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober'),
    'approve', NULL, 'e5000000-0000-4000-8000-000000000202'
  )->>'status',
  'approved',
  'a different active Admin can approve the expense'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND source_type = 'expense'
     AND source_id = (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober')),
  1,
  'approval posts exactly one ledger entry'
);
SELECT is(
  (SELECT amount FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND source_type = 'expense'
     AND source_id = (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober')),
  125000::numeric,
  'ledger amount matches the approved expense'
);
SELECT is(
  public.review_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober'),
    'approve', NULL, 'e5000000-0000-4000-8000-000000000202'
  )->>'status',
  'approved',
  'retrying the same review key returns the original approval'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND source_type = 'expense'
     AND source_id = (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober')),
  1,
  'idempotent review does not post a second ledger entry'
);
SELECT throws_ok(
  $$SELECT public.review_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tagihan listrik Oktober'),
    'approve', NULL, 'e5000000-0000-4000-8000-000000000203'
  )$$,
  '23514',
  'Pengajuan sudah diproses',
  'a new key cannot approve an already processed expense again'
);

SELECT is(
  public.create_tenant_finance_expense_for_unit(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000701', 'Pengadaan', 'Pembelian alat kelas', 'Pendidikan', 250000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000103'
  )->>'success',
  'true',
  'second expense is available for rejection workflow'
);
SELECT is(
  public.review_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Pembelian alat kelas'),
    'reject', 'Tidak sesuai anggaran', 'e5000000-0000-4000-8000-000000000204'
  )->>'status',
  'rejected',
  'checker can reject an expense with a reason'
);
SELECT is(
  (SELECT rejection_reason FROM public.finance_expenses
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Pembelian alat kelas'),
  'Tidak sesuai anggaran',
  'rejection reason is retained for audit'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND source_id = (SELECT id FROM public.finance_expenses WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Pembelian alat kelas')),
  0,
  'rejected expense is not posted to the ledger'
);

SELECT is(
  public.set_tenant_finance_lock(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin', true,
    'e5000000-0000-4000-8000-000000000301'
  )->>'financeLocked',
  'true',
  'Admin can close the tenant Finance book'
);
SELECT throws_ok(
  $$SELECT public.create_tenant_finance_expense_for_unit(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000701', 'Utilitas', 'Tidak boleh saat tutup buku', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000104'
  )$$,
  '55000',
  'Buku keuangan sedang ditutup',
  'Finance writes are rejected while the book is locked'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_expenses
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND description = 'Tidak boleh saat tutup buku'),
  0,
  'failed write under book lock creates no expense'
);
SELECT is(
  public.set_tenant_finance_lock(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin', false,
    'e5000000-0000-4000-8000-000000000302'
  )->>'financeLocked',
  'false',
  'Admin can reopen the tenant Finance book'
);
SELECT is(
  public.create_tenant_finance_expense_for_unit(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000701', 'Utilitas', 'Setelah tutup buku', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000105'
  )->>'success',
  'true',
  'Finance writes resume after the book is reopened'
);
SELECT throws_ok(
  $$SELECT public.create_tenant_finance_expense_for_unit(
    'f6000000-0000-4000-8000-000000000006', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000701', 'Utilitas', 'Tenant salah', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000106'
  )$$,
  '42501',
  'Profil aktif tidak sesuai dengan pengaju',
  'an actor from tenant A cannot write Finance data to tenant B'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_expenses WHERE tenant_id = 'f6000000-0000-4000-8000-000000000006'),
  0,
  'cross-tenant Finance write leaves tenant B unchanged'
);

SELECT is(
  (public.create_tenant_finance_bills(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    jsonb_build_array(jsonb_build_object(
      'studentId', 'e5000000-0000-4000-8000-000000000201',
      'feeType', 'SPP', 'period', '2026-10', 'amount', 500000
    )),
    'e5000000-0000-4000-8000-000000000401'
  )->>'created'),
  '1',
  'Admin can create a tenant-scoped student bill'
);
SELECT ok(
  (SELECT status = 'unpaid' AND amount = 500000 AND paid_amount = 0 AND receipt_no IS NULL
   FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND student_id = 'e5000000-0000-4000-8000-000000000201' AND fee_type = 'SPP' AND period = '2026-10'),
  'new bill starts unpaid with zero paid and no receipt'
);
SELECT is(
  (public.create_tenant_finance_bills(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    jsonb_build_array(jsonb_build_object(
      'studentId', 'e5000000-0000-4000-8000-000000000201',
      'feeType', 'SPP', 'period', '2026-10', 'amount', 500000
    )),
    'e5000000-0000-4000-8000-000000000401'
  )->>'created'),
  '1',
  'retrying bill creation with the same key returns its original result'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND student_id = 'e5000000-0000-4000-8000-000000000201' AND fee_type = 'SPP' AND period = '2026-10'),
  1,
  'idempotent bill creation does not duplicate a bill'
);
SELECT is(
  (public.create_tenant_finance_bills(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    jsonb_build_array(jsonb_build_object(
      'studentId', 'e5000000-0000-4000-8000-000000000201',
      'feeType', 'SPP', 'period', '2026-10', 'amount', 500000
    )),
    'e5000000-0000-4000-8000-000000000402'
  )->>'created'),
  '0',
  'new idempotency key skips an already-existing bill'
);
SELECT is(
  (public.create_tenant_finance_bills(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    jsonb_build_array(jsonb_build_object(
      'studentId', 'e5000000-0000-4000-8000-000000000201',
      'feeType', 'SPP', 'period', '2026-10', 'amount', 500000
    )),
    'e5000000-0000-4000-8000-000000000402'
  )->>'skipped'),
  '1',
  'duplicate bill result identifies the skipped item'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND student_id = 'e5000000-0000-4000-8000-000000000201' AND fee_type = 'SPP' AND period = '2026-10'),
  1,
  'duplicate bill request leaves a single bill'
);

SELECT ok(NOT has_function_privilege('anon', 'public.create_tenant_ppdb_candidate_bill(uuid,uuid,text,uuid,text,numeric,uuid)', 'EXECUTE'), 'anonymous callers cannot issue PPDB bills directly');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_tenant_ppdb_candidate_bill(uuid,uuid,text,uuid,text,numeric,uuid)', 'EXECUTE'), 'authenticated browser callers cannot issue PPDB bills directly');
SELECT ok(has_function_privilege('service_role', 'public.create_tenant_ppdb_candidate_bill(uuid,uuid,text,uuid,text,numeric,uuid)', 'EXECUTE'), 'trusted server role can issue PPDB bills');
SELECT throws_ok(
  $$SELECT public.create_tenant_ppdb_candidate_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000101', 'tuition', 2500000,
    'e5000000-0000-4000-8000-000000000421'
  )$$,
  '23514',
  'Uang pangkal hanya dapat diterbitkan setelah calon santri diterima',
  'tuition cannot be issued before the candidate is accepted'
);
SELECT is(
  public.create_tenant_ppdb_candidate_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000101', 'registration', 350000,
    'e5000000-0000-4000-8000-000000000422'
  )->>'created',
  '1',
  'Admin can issue a tenant-scoped PPDB registration bill'
);
SELECT ok(
  (SELECT student_id IS NULL AND candidate_id = 'e5000000-0000-4000-8000-000000000101'
      AND payment_type = 'registration' AND amount = 350000 AND status = 'unpaid'
   FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'registration'),
  'candidate registration bill starts unpaid and belongs to its tenant candidate'
);
SELECT is(
  public.create_tenant_ppdb_candidate_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000101', 'registration', 350000,
    'e5000000-0000-4000-8000-000000000422'
  )->>'billId',
  (SELECT id::text FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'registration'),
  'retry with the same request key returns the original candidate bill'
);
SELECT is(
  (public.create_tenant_ppdb_candidate_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000101', 'registration', 350000,
    'e5000000-0000-4000-8000-000000000423'
  )->>'created'),
  '0',
  'a different request key does not duplicate an existing candidate fee'
);
SELECT throws_ok(
  $$SELECT public.create_tenant_ppdb_candidate_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000101', 'registration', 360000,
    'e5000000-0000-4000-8000-000000000422'
  )$$,
  '23505',
  'Kunci permintaan telah dipakai untuk data berbeda',
  'candidate fee idempotency key cannot be reused with a different amount'
);
SELECT throws_ok(
  $$SELECT public.create_tenant_ppdb_candidate_bill(
    'f6000000-0000-4000-8000-000000000006', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000101', 'registration', 350000,
    'e5000000-0000-4000-8000-000000000424'
  )$$,
  '42501',
  'Profil Admin tidak aktif pada tenant',
  'Admin cannot issue a candidate bill across tenant boundaries'
);
UPDATE public.candidates
SET stage = 'Accepted', master_student_id = 'e5000000-0000-4000-8000-000000000201'
WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
  AND id = 'e5000000-0000-4000-8000-000000000101';
SELECT is(
  (SELECT student_id::text FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'registration'),
  'e5000000-0000-4000-8000-000000000201',
  'onboarding attaches an existing candidate bill to the new student'
);
SELECT is(
  public.create_tenant_ppdb_candidate_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'e5000000-0000-4000-8000-000000000101', 'tuition', 2500000,
    'e5000000-0000-4000-8000-000000000425'
  )->>'created',
  '1',
  'accepted candidates can receive an idempotent tuition bill'
);
SELECT is(
  (SELECT student_id::text FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
     AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'tuition'),
  'e5000000-0000-4000-8000-000000000201',
  'a fee created after onboarding is linked to the student immediately'
);
SELECT is(
  public.register_tenant_finance_payment_proof(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000013', 'wali_santri',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
      AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'registration'),
    'financeProofs/e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000201/' ||
      (SELECT id::text FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
        AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'registration') || '/ppdb-proof.pdf',
    'ppdb-proof.pdf', 'BSI', repeat('b', 64), 'e5000000-0000-4000-8000-000000000426'
  )->>'status',
  'verification',
  'linked guardian can submit payment proof for a PPDB candidate bill after onboarding'
);
SELECT is(
  public.review_tenant_finance_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
      AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'registration'),
    'settle', 'BSI', 'e5000000-0000-4000-8000-000000000427'
  )->>'status',
  'paid',
  'Finance Admin can settle the PPDB candidate bill through the existing review workflow'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND source_type = 'bill'
     AND source_id = (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005'
       AND candidate_id = 'e5000000-0000-4000-8000-000000000101' AND payment_type = 'registration')),
  1,
  'settled candidate bill posts exactly one Finance ledger entry'
);

SELECT throws_ok(
  $$SELECT public.register_tenant_finance_payment_proof(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000014', 'wali_santri',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
    'financeProofs/e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000201/' ||
      (SELECT id::text FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10') || '/wrong-guardian.pdf',
    'bukti.pdf', 'BSI', repeat('a', 64), 'e5000000-0000-4000-8000-000000000501'
  )$$,
  '42501',
  'Tagihan tidak terhubung ke akun wali ini',
  'guardian cannot submit proof for a student outside their profile link'
);
SELECT is(
  (SELECT status FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
  'unpaid',
  'rejected guardian proof leaves the bill unpaid'
);

SELECT is(
  public.register_tenant_finance_payment_proof(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000013', 'wali_santri',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
    'financeProofs/e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000201/' ||
      (SELECT id::text FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10') || '/guardian-proof.pdf',
    'bukti.pdf', 'BSI', repeat('a', 64), 'e5000000-0000-4000-8000-000000000502'
  )->>'status',
  'verification',
  'linked guardian can submit proof and the bill enters verification'
);
SELECT ok(
  (SELECT status = 'verification' AND proof_storage_provider = 'supabase'
      AND proof_storage_path LIKE 'financeProofs/%' AND proof_file = 'bukti.pdf'
   FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
  'bill retains private Supabase proof metadata for review'
);
SELECT is(
  public.register_tenant_finance_payment_proof(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000013', 'wali_santri',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
    'financeProofs/e5000000-0000-4000-8000-000000000005/e5000000-0000-4000-8000-000000000201/' ||
      (SELECT id::text FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10') || '/retry-upload.pdf',
    'bukti.pdf', 'BSI', repeat('a', 64), 'e5000000-0000-4000-8000-000000000502'
  )->>'alreadyApplied',
  'true',
  'retrying the same proof request is idempotent despite a new upload path'
);

SELECT is(
  public.review_tenant_finance_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
    'settle', 'BSI', 'e5000000-0000-4000-8000-000000000601'
  )->>'status',
  'paid',
  'checker settles a bill that has an uploaded proof'
);
SELECT ok(
  (SELECT status = 'paid' AND paid_amount = amount AND paid_at IS NOT NULL AND receipt_no IS NOT NULL
   FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
  'settled bill records its full paid amount, date, and receipt'
);
SELECT ok(
  (SELECT receipt_no ~ '^KWT/FIN/[0-9]{4}/[A-F0-9]{10}$'
   FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
  'settlement receipt has the expected format'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND source_type = 'bill'
     AND source_id = (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10')),
  1,
  'settlement posts exactly one income ledger row'
);
SELECT is(
  (SELECT amount FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND source_type = 'bill'
     AND source_id = (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10')),
  500000::numeric,
  'income ledger amount matches the bill settlement'
);
SELECT is(
  public.review_tenant_finance_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
    'settle', 'BSI', 'e5000000-0000-4000-8000-000000000601'
  )->>'receiptNo',
  (SELECT receipt_no FROM public.finance_bills
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
  'retrying settlement returns the same receipt number'
);
SELECT is(
  (SELECT count(*)::int FROM public.finance_ledger
   WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND source_type = 'bill'
     AND source_id = (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10')),
  1,
  'idempotent settlement does not post a second income row'
);
SELECT throws_ok(
  $$SELECT public.review_tenant_finance_bill(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000012', 'admin',
    (SELECT id FROM public.finance_bills WHERE tenant_id = 'e5000000-0000-4000-8000-000000000005' AND fee_type = 'SPP' AND period = '2026-10'),
    'settle', 'BSI', 'e5000000-0000-4000-8000-000000000602'
  )$$,
  '23514',
  'Status tagihan tidak dapat diselesaikan',
  'a new request key cannot settle the same bill twice'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
