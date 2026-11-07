-- Read-only post-deployment verification for migration
-- 20270213000000_master_data_audit_feed.sql.
-- Run only after the migration is applied to VQE. Returns checks, not row data.
WITH checks(check_name, passed) AS (
  SELECT
    'migration_version_recorded',
    EXISTS (
      SELECT 1
      FROM supabase_migrations.schema_migrations
      WHERE version::text = '20270213000000'
    )
  UNION ALL
  SELECT 'audit_table_exists', to_regclass('public.master_data_audit_events') IS NOT NULL
  UNION ALL
  SELECT 'audit_table_enables_rls', EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('public.master_data_audit_events') AND relrowsecurity
  )
  UNION ALL
  SELECT 'audit_table_forces_rls', EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('public.master_data_audit_events') AND relforcerowsecurity
  )
  UNION ALL
  SELECT 'only_service_role_can_read_audit_table',
    CASE WHEN to_regclass('public.master_data_audit_events') IS NULL THEN false
    ELSE has_table_privilege('service_role', 'public.master_data_audit_events', 'SELECT')
      AND NOT has_table_privilege('anon', 'public.master_data_audit_events', 'SELECT')
      AND NOT has_table_privilege('authenticated', 'public.master_data_audit_events', 'SELECT')
    END
  UNION ALL
  SELECT 'service_role_cannot_mutate_audit_table',
    CASE WHEN to_regclass('public.master_data_audit_events') IS NULL THEN false
    ELSE NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'INSERT')
      AND NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'UPDATE')
      AND NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'DELETE')
      AND NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'TRUNCATE')
    END
  UNION ALL
  SELECT 'source_audit_triggers_enabled',
    (SELECT count(*) = 2
     FROM pg_trigger
     WHERE NOT tgisinternal AND tgenabled <> 'D'
       AND ((tgrelid = to_regclass('public.master_data_records') AND tgname = 'master_data_records_audit_event')
         OR (tgrelid = to_regclass('public.students') AND tgname = 'students_master_data_audit_event')))
  UNION ALL
  SELECT 'audit_immutability_triggers_enabled',
    (SELECT count(*) = 2
     FROM pg_trigger
     WHERE tgrelid = to_regclass('public.master_data_audit_events')
       AND NOT tgisinternal AND tgenabled <> 'D'
       AND tgname IN ('master_data_audit_events_immutable_rows', 'master_data_audit_events_immutable_truncate'))
  UNION ALL
  SELECT 'audited_structure_upsert_service_only',
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.upsert_master_data_structure_with_actor(uuid,text,text,jsonb,uuid)')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 'audited_structure_create_only_import_service_only',
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.create_master_data_structure_if_absent_with_actor(uuid,text,text,jsonb,uuid)')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 'audited_structure_delete_service_only',
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.delete_master_data_structure_with_actor(uuid,text,text,uuid)')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 'audited_student_import_service_only',
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.import_legacy_master_data_student_with_actor(uuid,jsonb,jsonb,boolean,uuid)')
        AND has_function_privilege('service_role', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 'actorless_structure_upsert_revoked',
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.upsert_master_data_structure(uuid,text,text,jsonb)')
        AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 'actorless_structure_import_revoked',
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.create_master_data_structure_if_absent(uuid,text,text,jsonb)')
        AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
  UNION ALL
  SELECT 'actorless_student_import_revoked',
    EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid = to_regprocedure('public.import_legacy_master_data_student(uuid,jsonb,jsonb,boolean)')
        AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')
    )
)
SELECT check_name, passed
FROM checks
ORDER BY check_name;
