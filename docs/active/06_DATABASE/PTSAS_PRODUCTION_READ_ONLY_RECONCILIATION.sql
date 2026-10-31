-- Inventaris baca-saja untuk project Supabase PTSAS Production.
-- Jalankan hanya setelah memastikan ref project yang dipilih adalah ptsasgdvgrbdtgyqieie.
-- Skrip ini tidak membaca baris data operasional dan tidak mengubah database.
-- Simpan hasilnya sebagai artefak internal; jangan sertakan URL koneksi atau secret.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 1. Konfirmasi project/session dan versi Postgres.
SELECT current_database() AS database_name, current_user AS session_role,
       current_setting('server_version') AS server_version, now() AS observed_at;

-- 2. Ledger migration: versi/nama, duplikasi, dan payload kosong tanpa menampilkan SQL.
SELECT version, name,
       (statements IS NULL OR cardinality(statements) = 0) AS payload_missing,
       cardinality(statements) AS statement_count
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- 3. Tabel public, RLS, FORCE RLS, dan kolom tenant_id.
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS force_rls,
       EXISTS (SELECT 1 FROM information_schema.columns col
               WHERE col.table_schema = 'public'
                 AND col.table_name = c.relname
                 AND col.column_name = 'tenant_id') AS has_tenant_id
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
ORDER BY c.relname;

-- 4. Policy RLS yang terpasang (definisi policy adalah metadata, bukan baris aplikasi).
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 5. Foreign key publik dan kolom pasangan.
SELECT conrelid::regclass AS table_name, conname AS constraint_name,
       pg_get_constraintdef(oid, true) AS definition, convalidated AS validated
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY conrelid::regclass::text, conname;

-- 6. Hak efektif Data API yang diberikan langsung ke PUBLIC, anon, authenticated, service_role.
SELECT n.nspname AS schema_name, c.relname AS object_name,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE gr.rolname END AS grantee,
       acl.privilege_type, acl.is_grantable
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) acl
LEFT JOIN pg_roles gr ON gr.oid = acl.grantee
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  AND (acl.grantee = 0 OR gr.rolname IN ('anon', 'authenticated', 'service_role'))
ORDER BY object_name, grantee, acl.privilege_type;

-- 7. Fungsi public: SECURITY DEFINER dan hak EXECUTE per role.
SELECT p.oid::regprocedure AS function_signature, p.prosecdef AS security_definer,
       p.proconfig AS function_settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
       has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.oid::regprocedure::text;

-- 8. Trigger/function metadata, including disabled triggers.
SELECT t.tgrelid::regclass AS table_name, t.tgname AS trigger_name,
       t.tgenabled AS enabled_state, t.tgfoid::regprocedure AS function_signature
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
ORDER BY table_name::text, trigger_name;

-- 9. Storage bucket names and visibility only; no object names/content.
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY name;

-- Tutup transaksi tanpa mengubah apa pun.
ROLLBACK;
