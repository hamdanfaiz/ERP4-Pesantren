-- CI-only fixture: recreate the Production migration gaps from the
-- 2026-11-06 read-only inventory inside isolated local Supabase.
-- Never run this fixture against staging or production.
BEGIN;

DO $$
DECLARE
  v_applied_count BIGINT;
  v_latest_version TEXT;
BEGIN
  IF current_database() <> 'postgres' THEN
    RAISE EXCEPTION 'Refusing rehearsal fixture outside local postgres database';
  END IF;

  SELECT count(*), max(version)
  INTO v_applied_count, v_latest_version
  FROM supabase_migrations.schema_migrations;

  IF v_applied_count <> 49 OR v_latest_version <> '20261206000000' THEN
    RAISE EXCEPTION 'Unexpected local baseline: count %, latest %', v_applied_count, v_latest_version;
  END IF;

  IF (
    SELECT count(DISTINCT version)
    FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261031104213', '20261031225438')
  ) <> 2 THEN
    RAISE EXCEPTION 'Expected both out-of-order migrations in the source reset baseline';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS master_data_records_audit_event ON public.master_data_records;
DROP TRIGGER IF EXISTS students_master_data_audit_event ON public.students;
DROP TRIGGER IF EXISTS master_data_audit_events_immutable_rows ON public.master_data_audit_events;
DROP TRIGGER IF EXISTS master_data_audit_events_immutable_truncate ON public.master_data_audit_events;

DROP TABLE public.master_data_audit_events;

DROP FUNCTION public.upsert_master_data_structure_with_actor(UUID, TEXT, TEXT, JSONB, UUID);
DROP FUNCTION public.create_master_data_structure_if_absent_with_actor(UUID, TEXT, TEXT, JSONB, UUID);
DROP FUNCTION public.delete_master_data_structure_with_actor(UUID, TEXT, TEXT, UUID);
DROP FUNCTION public.import_legacy_master_data_student_with_actor(UUID, JSONB, JSONB, BOOLEAN, UUID);
DROP FUNCTION public.validate_master_data_audit_actor(UUID, UUID);
DROP FUNCTION public.capture_master_data_audit_event();
DROP FUNCTION public.reject_master_data_audit_event_mutation();
DROP FUNCTION public.create_master_data_structure_if_absent(UUID, TEXT, TEXT, JSONB);

DELETE FROM supabase_migrations.schema_migrations
WHERE version IN ('20261031104213', '20261031225438');

UPDATE supabase_migrations.schema_migrations
SET name = NULL, statements = NULL
WHERE version IN ('20261205000000', '20261206000000');

DO $$
DECLARE
  v_applied_count BIGINT;
  v_latest_version TEXT;
BEGIN
  SELECT count(*), max(version)
  INTO v_applied_count, v_latest_version
  FROM supabase_migrations.schema_migrations;

  IF v_applied_count <> 47 OR v_latest_version <> '20261206000000' THEN
    RAISE EXCEPTION 'Production rehearsal baseline mismatch: count %, latest %', v_applied_count, v_latest_version;
  END IF;

  IF to_regclass('public.master_data_audit_events') IS NOT NULL
    OR to_regprocedure('public.create_master_data_structure_if_absent(uuid,text,text,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'Missing Production migration effects were not removed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261031104213', '20261031225438')
  ) THEN
    RAISE EXCEPTION 'Out-of-order migrations remain in the rehearsal ledger';
  END IF;

  IF EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version IN ('20261205000000', '20261206000000')
      AND (name IS NOT NULL OR statements IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Expected Production metadata gaps were not recreated';
  END IF;
END;
$$;

COMMIT;
