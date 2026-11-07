-- Inventaris metadata baca-saja untuk Supabase PTSAS Production.
-- Pastikan project yang dipilih di SQL Editor adalah ptsasgdvgrbdtgyqieie.
-- Skrip ini hanya membaca metadata skema, ACL, dan Storage bucket; tidak membaca baris operasional.
-- Hasilnya satu result set agar seluruh inventaris dapat diunduh sebagai satu CSV.
-- Jangan sertakan URL koneksi, API key, atau password saat membagikan hasil.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

WITH inventory AS (
  -- Konteks sesi untuk membantu memastikan hasil berasal dari database yang dimaksud.
  SELECT '00_session'::text AS section,
         current_database()::text AS object_name,
         jsonb_build_object(
           'session_role', current_user,
           'server_version', current_setting('server_version'),
           'observed_at', now()
         ) AS details

  UNION ALL
  SELECT '01_migration_ledger', version::text,
         jsonb_build_object(
           'name', name,
           'payload_missing', statements IS NULL OR cardinality(statements) = 0,
           'statement_count', cardinality(statements)
         )
  FROM supabase_migrations.schema_migrations

  UNION ALL
  SELECT '02_public_relations', format('%I.%I', n.nspname, c.relname),
         jsonb_build_object(
           'kind', c.relkind,
           'row_level_security', c.relrowsecurity,
           'force_row_level_security', c.relforcerowsecurity,
           'has_tenant_id', EXISTS (
             SELECT 1 FROM information_schema.columns col
             WHERE col.table_schema = n.nspname
               AND col.table_name = c.relname
               AND col.column_name = 'tenant_id'
           )
         )
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')

  UNION ALL
  SELECT '03_public_columns', format('%I.%I.%I', table_schema, table_name, column_name),
         jsonb_build_object(
           'ordinal_position', ordinal_position,
           'data_type', data_type,
           'udt_name', udt_name,
           'is_nullable', is_nullable,
           'has_default', column_default IS NOT NULL,
           'is_identity', is_identity,
           'is_generated', is_generated
         )
  FROM information_schema.columns
  WHERE table_schema = 'public'

  UNION ALL
  SELECT '04_public_constraints',
         format('%I.%I.%I', n.nspname, rel.relname, con.conname),
         jsonb_build_object(
           'constraint_type', con.contype,
           'validated', con.convalidated,
           'definition', pg_get_constraintdef(con.oid, true)
         )
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = rel.relnamespace
  WHERE n.nspname = 'public'

  UNION ALL
  SELECT '05_public_indexes', format('%I.%I.%I', schemaname, tablename, indexname),
         jsonb_build_object(
           'definition', indexdef,
           'is_valid', i.indisvalid,
           'is_ready', i.indisready
         )
  FROM pg_indexes pi
  JOIN pg_class idx ON idx.relname = pi.indexname
  JOIN pg_namespace idx_ns ON idx_ns.oid = idx.relnamespace
                           AND idx_ns.nspname = pi.schemaname
  JOIN pg_index i ON i.indexrelid = idx.oid
  WHERE pi.schemaname = 'public'

  UNION ALL
  SELECT '06_public_rls_policies',
         format('%I.%I.%I', schemaname, tablename, policyname),
         jsonb_build_object(
           'permissive', permissive,
           'roles', roles,
           'command', cmd,
           'using_expression', qual,
           'check_expression', with_check
         )
  FROM pg_policies
  WHERE schemaname = 'public'

  UNION ALL
  SELECT '07_public_functions', p.oid::regprocedure::text,
         jsonb_build_object(
           'security_definer', p.prosecdef,
           'settings', p.proconfig,
           'anon_can_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
           'authenticated_can_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE'),
           'service_role_can_execute', has_function_privilege('service_role', p.oid, 'EXECUTE')
         )
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'

  UNION ALL
  SELECT '08_public_triggers',
         format('%I.%I.%I', n.nspname, c.relname, t.tgname),
         jsonb_build_object(
           'enabled_state', t.tgenabled,
           'function_signature', t.tgfoid::regprocedure::text
         )
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal AND n.nspname = 'public'

  UNION ALL
  SELECT '09_public_acl', format('%I.%I', n.nspname, c.relname),
         jsonb_build_object(
           'grantee', CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END,
           'privilege', acl.privilege_type,
           'grantable', acl.is_grantable
         )
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
  LEFT JOIN pg_roles gr ON gr.oid = acl.grantee
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (acl.grantee = 0 OR gr.rolname IN ('anon', 'authenticated', 'service_role'))

  UNION ALL
  SELECT '10_storage_buckets', id::text,
         jsonb_build_object(
           'name', name,
           'public', public,
           'file_size_limit', file_size_limit,
           'allowed_mime_types', allowed_mime_types
         )
  FROM storage.buckets

  UNION ALL
  SELECT '11_public_types', format('%I.%I', n.nspname, t.typname),
         jsonb_build_object(
           'type_kind', t.typtype,
           'base_type', CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) END,
           'enum_labels', (
             SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder)
             FROM pg_enum e WHERE e.enumtypid = t.oid
           )
         )
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' AND t.typtype IN ('d', 'e')
)
SELECT section, object_name, details::text AS details
FROM inventory
ORDER BY section, object_name;

-- Akhiri transaksi baca-saja tanpa perubahan.
ROLLBACK;
