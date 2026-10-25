BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(5);

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
    WHERE index_metadata.indrelid = 'public.profiles'::regclass
      AND index_class.relname = 'profiles_tenant_created_user_idx'
      AND access_method.amname = 'btree'
  ),
  'tenant profile pages have a stable tenant and creation order index'
);

SELECT is(
  (
    SELECT count(*)::int
    FROM pg_class AS index_class
    JOIN pg_index AS index_metadata ON index_metadata.indexrelid = index_class.oid
    JOIN pg_am AS access_method ON access_method.oid = index_class.relam
    WHERE index_metadata.indrelid = 'public.profiles'::regclass
      AND index_class.relname IN (
        'profiles_display_name_trgm_idx',
        'profiles_email_trgm_idx',
        'profiles_username_trgm_idx'
      )
      AND access_method.amname = 'gin'
      AND pg_get_indexdef(index_class.oid) ILIKE '%gin_trgm_ops%'
  ),
  3,
  'name, email, and username substring searches have trigram indexes'
);

SELECT * FROM finish();
ROLLBACK;
