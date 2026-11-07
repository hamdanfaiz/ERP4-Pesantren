-- CI-only postcondition for the isolated Production-baseline upgrade rehearsal.
-- Never run this assertion against staging or production.
DO $$
DECLARE
  v_audit_trigger_count INTEGER;
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing rehearsal assertion outside local postgres database';
  END IF;

  IF to_regclass('public.master_data_audit_events') IS NULL
    OR to_regprocedure('public.create_master_data_structure_if_absent(uuid,text,text,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'The two missing Production migration effects were not restored';
  END IF;

  SELECT count(*)
  INTO v_audit_trigger_count
  FROM pg_trigger AS trigger_row
  JOIN pg_class AS relation_row ON relation_row.oid = trigger_row.tgrelid
  JOIN pg_namespace AS namespace_row ON namespace_row.oid = relation_row.relnamespace
  WHERE namespace_row.nspname = 'public'
    AND NOT trigger_row.tgisinternal
    AND trigger_row.tgname IN (
      'master_data_records_audit_event',
      'students_master_data_audit_event',
      'master_data_audit_events_immutable_rows',
      'master_data_audit_events_immutable_truncate'
    );

  IF v_audit_trigger_count <> 4 THEN
    RAISE EXCEPTION 'Expected four audit triggers after replay, got %', v_audit_trigger_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261031104213')
    OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261031225438') THEN
    RAISE EXCEPTION 'Out-of-order migrations were not recorded after replay';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261205000000', '20261206000000')
      AND (name IS NOT NULL OR statements IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'The rehearsal unexpectedly changed existing Production ledger metadata';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version NOT IN ('20261205000000', '20261206000000')
      AND (name IS NULL OR statements IS NULL)
  ) THEN
    RAISE EXCEPTION 'Unexpected migration metadata gap outside the two observed Production rows';
  END IF;
END;
$$;
