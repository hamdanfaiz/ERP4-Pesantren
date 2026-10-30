-- PPDB legacy import schema and privilege contract checks.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(9);

SELECT has_column('public', 'candidates', 'source_system', 'candidate source system is tracked');
SELECT has_column('public', 'candidates', 'source_record_id', 'legacy source record ID is tracked');
SELECT has_column('public', 'candidates', 'source_fingerprint', 'keyed source fingerprint is tracked');
SELECT has_table('public', 'ppdb_legacy_import_batches', 'PPDB import ledger exists');
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid = 'public.ppdb_legacy_import_batches'::regclass),
  'PPDB import ledger enables and forces row-level security'
);
SELECT ok(
  to_regclass('public.candidates_legacy_source_record_uq') IS NOT NULL,
  'legacy candidate source IDs are unique per tenant'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.import_legacy_ppdb_candidates(uuid,uuid,text,text,text,integer,jsonb)',
    'EXECUTE'
  ),
  'trusted backend role can call the atomic import function'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.import_legacy_ppdb_candidates(uuid,uuid,text,text,text,integer,jsonb)',
    'EXECUTE'
  ),
  'browser-authenticated users cannot call the service import function directly'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.import_legacy_ppdb_candidates(uuid,uuid,text,text,text,integer,jsonb)',
    'EXECUTE'
  ),
  'anonymous users cannot call the service import function'
);

SELECT * FROM finish();
ROLLBACK;
