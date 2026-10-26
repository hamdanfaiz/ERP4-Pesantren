BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(9);

SELECT ok(NOT has_table_privilege('anon', 'public.ppdb_document_access_events', 'SELECT'), 'anonymous clients cannot read document access logs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.ppdb_document_access_events', 'SELECT'), 'authenticated clients cannot read document access logs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.ppdb_document_access_events', 'INSERT'), 'authenticated clients cannot forge document access logs');
SELECT ok(has_table_privilege('service_role', 'public.ppdb_document_access_events', 'SELECT'), 'trusted backend can read access logs');
SELECT ok(has_table_privilege('service_role', 'public.ppdb_document_access_events', 'INSERT'), 'trusted backend can append access logs');
SELECT ok(NOT has_table_privilege('service_role', 'public.ppdb_document_access_events', 'UPDATE'), 'trusted backend cannot rewrite access logs');
SELECT ok(NOT has_table_privilege('service_role', 'public.ppdb_document_access_events', 'DELETE'), 'trusted backend cannot delete access logs');
SELECT ok((
  SELECT relrowsecurity AND relforcerowsecurity
  FROM pg_class
  WHERE oid = 'public.ppdb_document_access_events'::regclass
), 'document access logs enforce row-level security');
SELECT is(
  (SELECT public::text FROM storage.buckets WHERE id = 'ppdb-documents'),
  'false',
  'candidate documents remain in a private Storage bucket'
);

SELECT * FROM finish();
ROLLBACK;
