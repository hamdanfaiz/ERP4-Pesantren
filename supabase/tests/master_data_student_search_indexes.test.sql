BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(6);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'),
  'substring search has the pg_trgm extension available'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_class AS index_class
    JOIN pg_index AS index_metadata ON index_metadata.indexrelid = index_class.oid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_metadata.indrelid = 'public.students'::regclass
      AND index_class.relname = 'students_tenant_name_page_idx'
      AND access_method.amname = 'btree'
      AND pg_get_indexdef(index_class.oid) ILIKE '%(tenant_id, name, id)%'
  ),
  'tenant santri pages use a stable tenant/name/id B-tree index'
);

SELECT ok(
  NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.students_tenant_name_idx')),
  'the shorter duplicate tenant/name index is removed'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class AS index_class
    JOIN pg_index AS index_metadata ON index_metadata.indexrelid = index_class.oid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_metadata.indrelid = 'public.students'::regclass
      AND index_class.relname = 'students_name_trgm_idx'
      AND access_method.amname = 'gin'
      AND pg_get_indexdef(index_class.oid) ILIKE '%gin_trgm_ops%'
  ),
  'santri name substring search has a trigram index'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class AS index_class
    JOIN pg_index AS index_metadata ON index_metadata.indexrelid = index_class.oid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_metadata.indrelid = 'public.students'::regclass
      AND index_class.relname = 'students_nis_trgm_idx'
      AND access_method.amname = 'gin'
      AND pg_get_indexdef(index_class.oid) ILIKE '%gin_trgm_ops%'
  ),
  'NIS substring search has a trigram index'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class AS index_class
    JOIN pg_index AS index_metadata ON index_metadata.indexrelid = index_class.oid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_metadata.indrelid = 'public.students'::regclass
      AND index_class.relname = 'students_source_record_id_trgm_idx'
      AND access_method.amname = 'gin'
      AND pg_get_indexdef(index_class.oid) ILIKE '%gin_trgm_ops%'
  ),
  'source record ID substring search has a trigram index'
);

SELECT * FROM finish();
ROLLBACK;
