-- Finance workflow contract tests using synthetic identities; all changes roll back.
-- Run with: supabase test db

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(34);

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
  ('e5000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'finance-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('e5000000-0000-4000-8000-000000000011', 'e5000000-0000-4000-8000-000000000005', 'finance-a@test.invalid', 'Finance Maker', 'admin', 'active', '{"finance":true}'),
  ('e5000000-0000-4000-8000-000000000012', 'e5000000-0000-4000-8000-000000000005', 'finance-b@test.invalid', 'Finance Checker', 'admin', 'active', '{"finance":true}');

SELECT ok(NOT has_table_privilege('anon', 'public.finance_expenses', 'SELECT'), 'anon cannot read Finance expenses directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.finance_expenses', 'SELECT'), 'authenticated cannot read Finance expenses directly');
SELECT ok(NOT has_function_privilege('anon', 'public.create_tenant_finance_expense(uuid,uuid,text,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'anon cannot call Finance write RPC directly');
SELECT ok(NOT has_function_privilege('authenticated', 'public.create_tenant_finance_expense(uuid,uuid,text,text,text,text,numeric,date,text,uuid)', 'EXECUTE'), 'authenticated cannot call Finance write RPC directly');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_expenses'::regclass), 'finance_expenses has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_expenses'::regclass), 'finance_expenses forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.finance_ledger'::regclass), 'finance_ledger has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.finance_ledger'::regclass), 'finance_ledger forces RLS');

SET LOCAL ROLE service_role;

SELECT is(
  public.create_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'Utilitas', 'Tagihan listrik Oktober', 'Operasional', 125000, DATE '2026-10-22', 'Finance Maker',
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
  (public.create_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'Utilitas', 'Tagihan listrik Oktober', 'Operasional', 125000, DATE '2026-10-22', 'Finance Maker',
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
  $$SELECT public.create_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'Utilitas', 'Payload berubah', 'Operasional', 125000, DATE '2026-10-22', 'Finance Maker',
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
  $$SELECT public.create_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'ustadz',
    'Utilitas', 'Role palsu', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
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
  public.create_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'Pengadaan', 'Pembelian alat kelas', 'Pendidikan', 250000, DATE '2026-10-22', 'Finance Maker',
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
  $$SELECT public.create_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'Utilitas', 'Tidak boleh saat tutup buku', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
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
  public.create_tenant_finance_expense(
    'e5000000-0000-4000-8000-000000000005', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'Utilitas', 'Setelah tutup buku', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
    'e5000000-0000-4000-8000-000000000105'
  )->>'success',
  'true',
  'Finance writes resume after the book is reopened'
);
SELECT throws_ok(
  $$SELECT public.create_tenant_finance_expense(
    'f6000000-0000-4000-8000-000000000006', 'e5000000-0000-4000-8000-000000000011', 'admin',
    'Utilitas', 'Tenant salah', 'Operasional', 1000, DATE '2026-10-22', 'Finance Maker',
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

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
