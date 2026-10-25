-- Capture the current room placement at cutover without presenting it as a
-- historical move. Earlier placement events cannot be reconstructed reliably.
BEGIN;

ALTER TABLE public.student_room_assignment_history
  DROP CONSTRAINT student_room_assignment_history_event_type_check,
  ADD CONSTRAINT student_room_assignment_history_event_type_check CHECK (
    event_type IN ('baseline_snapshot', 'initial_assignment', 'assigned', 'moved', 'unassigned', 'building_changed')
  );

ALTER TABLE public.student_room_assignment_history
  DROP CONSTRAINT student_room_assignment_history_change_source_check,
  ADD CONSTRAINT student_room_assignment_history_change_source_check CHECK (
    change_source IN ('boarding_runtime', 'master_data', 'legacy_import', 'ppdb_onboarding', 'system', 'migration_baseline')
  );

CREATE UNIQUE INDEX student_room_history_one_baseline_per_student_idx
  ON public.student_room_assignment_history (tenant_id, student_id)
  WHERE event_type = 'baseline_snapshot';

CREATE OR REPLACE FUNCTION public.backfill_student_room_assignment_history_baseline()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_inserted INTEGER;
BEGIN
  INSERT INTO public.student_room_assignment_history (
    tenant_id, student_id, event_type,
    previous_room_id, previous_room_name, room_id, room_name,
    previous_building_id, previous_building_name, building_id, building_name,
    changed_by, change_source, changed_at
  )
  SELECT
    student.tenant_id,
    student.id,
    'baseline_snapshot',
    NULL,
    NULL,
    student.room_id,
    room.name,
    NULL,
    NULL,
    student.building_id,
    building.name,
    NULL,
    'migration_baseline',
    now()
  FROM public.students AS student
  LEFT JOIN public.master_data_records AS room
    ON room.tenant_id = student.tenant_id
   AND room.category = 'Kamar'
   AND room.id = student.room_id
  LEFT JOIN public.master_data_records AS building
    ON building.tenant_id = student.tenant_id
   AND building.category = 'Gedung'
   AND building.id = student.building_id
  WHERE student.room_id IS NOT NULL OR student.building_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_student_room_assignment_history_baseline()
  FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.backfill_student_room_assignment_history_baseline() IS
  'Records the cutover-time room snapshot for existing assignments; it does not claim to reconstruct earlier moves.';

SELECT public.backfill_student_room_assignment_history_baseline();

COMMIT;
