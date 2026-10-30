-- Admin PPDB search and cursor pages stay tenant-scoped and server-only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(16);

INSERT INTO public.tenants(id, slug, name, status) VALUES
  ('c7200000-0000-4000-8000-000000000001', 'ppdb-search-a-test', 'PPDB Search A', 'active'),
  ('c7200000-0000-4000-8000-000000000002', 'ppdb-search-b-test', 'PPDB Search B', 'active');

INSERT INTO public.candidates(id, tenant_id, registration_id, name, previous_school, phone, stage, created_at)
VALUES
  ('c7200000-0000-4000-8000-000000000101', 'c7200000-0000-4000-8000-000000000001', 'SRCH-001', 'Ayu Calon', 'Sekolah A_100% Sukses', '081200000001', 'Accepted', '2026-10-04 10:00:00+00'),
  ('c7200000-0000-4000-8000-000000000102', 'c7200000-0000-4000-8000-000000000001', 'SRCH-002', 'Bima Calon', 'Sekolah Beta', '081200000002', 'Registered', '2026-10-04 10:00:00+00'),
  ('c7200000-0000-4000-8000-000000000103', 'c7200000-0000-4000-8000-000000000001', 'SRCH-003', 'Calon Alpha', 'Madrasah Alpha', '081200000003', 'Interview', '2026-10-03 10:00:00+00'),
  ('c7200000-0000-4000-8000-000000000104', 'c7200000-0000-4000-8000-000000000001', 'SRCH-004', 'Calon Tambahan', 'Ab100% School', '081200000004', 'Rejected', '2026-10-02 10:00:00+00'),
  ('c7200000-0000-4000-8000-000000000201', 'c7200000-0000-4000-8000-000000000002', 'SRCH-201', 'Rahasia Tenant Lain', 'Sekolah Rahasia', '081200000201', 'Registered', '2026-10-05 10:00:00+00');

SELECT ok(NOT has_function_privilege('anon', 'public.list_admin_ppdb_candidates_page(uuid,text,text,timestamp with time zone,uuid,integer)', 'EXECUTE'), 'anonymous clients cannot call the PPDB candidate page RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.list_admin_ppdb_candidates_page(uuid,text,text,timestamp with time zone,uuid,integer)', 'EXECUTE'), 'browser sessions cannot call the PPDB candidate page RPC');
SELECT ok(has_function_privilege('service_role', 'public.list_admin_ppdb_candidates_page(uuid,text,text,timestamp with time zone,uuid,integer)', 'EXECUTE'), 'trusted server role can call the PPDB candidate page RPC');

SET LOCAL ROLE service_role;

SELECT is(
  public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, 3)->>'hasMore',
  'true',
  'first page reports additional tenant results'
);
SELECT is(
  public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, 3)->'candidates'->0->>'id',
  'c7200000-0000-4000-8000-000000000102',
  'same-time rows are ordered by descending candidate ID'
);
SELECT is(
  public.list_admin_ppdb_candidates_page(
    'c7200000-0000-4000-8000-000000000001', NULL, NULL,
    (public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, 3)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, 3)->'nextCursor'->>'id')::uuid,
    3
  )->'candidates'->0->>'id',
  'c7200000-0000-4000-8000-000000000104',
  'cursor returns the next row without repeating rows from the first page'
);
SELECT is(
  public.list_admin_ppdb_candidates_page(
    'c7200000-0000-4000-8000-000000000001', NULL, NULL,
    (public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, 3)->'nextCursor'->>'createdAt')::timestamptz,
    (public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, 3)->'nextCursor'->>'id')::uuid,
    3
  )->>'hasMore',
  'false',
  'last page reports no additional results'
);
SELECT is(
  public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, 'Accepted', NULL, NULL, 10)->'candidates'->0->>'id',
  'c7200000-0000-4000-8000-000000000101',
  'stage filter returns only the requested stage'
);
SELECT is(
  jsonb_array_length(public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', 'ALPHA', NULL, NULL, NULL, 10)->'candidates'),
  1,
  'search is case-insensitive across candidate and school names'
);
SELECT is(
  jsonb_array_length(public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', '100%', NULL, NULL, NULL, 10)->'candidates'),
  2,
  'percent is treated as a literal search character'
);
SELECT is(
  jsonb_array_length(public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', 'a_100%', NULL, NULL, NULL, 10)->'candidates'),
  1,
  'underscore is treated as a literal search character'
);
SELECT is(
  jsonb_array_length(public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', 'Rahasia', NULL, NULL, NULL, 10)->'candidates'),
  0,
  'search never returns a matching candidate from another tenant'
);
SELECT throws_ok(
  $$SELECT public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', 'ab', NULL, NULL, NULL, 10)$$,
  '22023',
  'Pencarian PPDB harus berisi minimal 3 karakter',
  'short search terms are rejected'
);
SELECT throws_ok(
  $$SELECT public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, now(), NULL, 10)$$,
  '22023',
  'Parameter halaman PPDB tidak valid',
  'partial cursor pairs are rejected'
);
SELECT throws_ok(
  $$SELECT public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, 'Unknown Stage', NULL, NULL, 10)$$,
  '22023',
  'Tahap PPDB tidak valid',
  'unknown stage filters are rejected'
);
SELECT throws_ok(
  $$SELECT public.list_admin_ppdb_candidates_page('c7200000-0000-4000-8000-000000000001', NULL, NULL, NULL, NULL, 251)$$,
  '22023',
  'Parameter halaman PPDB tidak valid',
  'page size is bounded to 250 rows'
);

SELECT * FROM finish();
ROLLBACK;
