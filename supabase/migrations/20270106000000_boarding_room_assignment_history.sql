-- Preserve tenant-scoped room assignment history for student moves and unassignments.
-- History is written by a database trigger so all trusted write paths are covered.
BEGIN;

CREATE TABLE public.student_room_assignment_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('initial_assignment', 'assigned', 'moved', 'unassigned', 'building_changed')
  ),
  previous_room_id TEXT,
  previous_room_name TEXT,
  room_id TEXT,
  room_name TEXT,
  previous_building_id TEXT,
  previous_building_name TEXT,
  building_id TEXT,
  building_name TEXT,
  changed_by UUID,
  change_source TEXT NOT NULL DEFAULT 'system' CHECK (
    change_source IN ('boarding_runtime', 'master_data', 'legacy_import', 'ppdb_onboarding', 'system')
  ),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  CHECK (
    previous_room_id IS DISTINCT FROM room_id
    OR previous_building_id IS DISTINCT FROM building_id
  )
);

CREATE INDEX student_room_history_tenant_student_time_idx
  ON public.student_room_assignment_history (tenant_id, student_id, changed_at DESC, id DESC);

ALTER TABLE public.student_room_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_room_assignment_history FORCE ROW LEVEL SECURITY;
CREATE POLICY student_room_assignment_history_service_read
  ON public.student_room_assignment_history
  FOR SELECT TO service_role
  USING (true);
CREATE POLICY student_room_assignment_history_service_insert
  ON public.student_room_assignment_history
  FOR INSERT TO service_role
  WITH CHECK (true);
REVOKE ALL ON public.student_room_assignment_history FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.student_room_assignment_history FROM service_role;
GRANT SELECT, INSERT ON public.student_room_assignment_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.student_room_assignment_history_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.capture_student_room_assignment_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_previous_room_id TEXT;
  v_room_id TEXT;
  v_previous_building_id TEXT;
  v_building_id TEXT;
  v_previous_room_name TEXT;
  v_room_name TEXT;
  v_previous_building_name TEXT;
  v_building_name TEXT;
  v_event_type TEXT;
  v_actor_text TEXT;
  v_actor_id UUID;
  v_change_source TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_previous_room_id := NULL;
    v_previous_building_id := NULL;
    v_room_id := NEW.room_id;
    v_building_id := NEW.building_id;
    IF v_room_id IS NULL AND v_building_id IS NULL THEN
      RETURN NEW;
    END IF;
    v_event_type := 'initial_assignment';
  ELSE
    v_previous_room_id := OLD.room_id;
    v_previous_building_id := OLD.building_id;
    v_room_id := NEW.room_id;
    v_building_id := NEW.building_id;
    IF v_previous_room_id IS NOT DISTINCT FROM v_room_id
      AND v_previous_building_id IS NOT DISTINCT FROM v_building_id THEN
      RETURN NEW;
    END IF;
    v_event_type := CASE
      WHEN v_previous_room_id IS NULL AND v_room_id IS NOT NULL THEN 'assigned'
      WHEN v_previous_room_id IS NOT NULL AND v_room_id IS NULL THEN 'unassigned'
      WHEN v_previous_room_id IS DISTINCT FROM v_room_id THEN 'moved'
      ELSE 'building_changed'
    END;
  END IF;

  IF v_previous_room_id IS NOT NULL THEN
    SELECT name INTO v_previous_room_name
    FROM public.master_data_records
    WHERE tenant_id = OLD.tenant_id AND category = 'Kamar' AND id = v_previous_room_id;
  END IF;
  IF v_room_id IS NOT NULL THEN
    SELECT name INTO v_room_name
    FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND category = 'Kamar' AND id = v_room_id;
  END IF;
  IF v_previous_building_id IS NOT NULL THEN
    SELECT name INTO v_previous_building_name
    FROM public.master_data_records
    WHERE tenant_id = OLD.tenant_id AND category = 'Gedung' AND id = v_previous_building_id;
  END IF;
  IF v_building_id IS NOT NULL THEN
    SELECT name INTO v_building_name
    FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND category = 'Gedung' AND id = v_building_id;
  END IF;

  v_actor_text := NULLIF(current_setting('app.room_assignment_actor_id', true), '');
  IF v_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_actor_id := v_actor_text::UUID;
  END IF;

  v_change_source := NULLIF(current_setting('app.room_assignment_source', true), '');
  IF v_change_source NOT IN ('boarding_runtime', 'master_data', 'legacy_import', 'ppdb_onboarding', 'system') THEN
    v_change_source := 'system';
  END IF;

  INSERT INTO public.student_room_assignment_history (
    tenant_id, student_id, event_type,
    previous_room_id, previous_room_name, room_id, room_name,
    previous_building_id, previous_building_name, building_id, building_name,
    changed_by, change_source
  ) VALUES (
    NEW.tenant_id, NEW.id, v_event_type,
    v_previous_room_id, v_previous_room_name, v_room_id, v_room_name,
    v_previous_building_id, v_previous_building_name, v_building_id, v_building_name,
    v_actor_id, COALESCE(v_change_source, 'system')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER students_room_assignment_history
  AFTER INSERT OR UPDATE OF room_id, building_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.capture_student_room_assignment_history();

CREATE OR REPLACE FUNCTION public.assign_student_to_room_audited(
  p_tenant_id UUID,
  p_student_id UUID,
  p_room_id TEXT,
  p_building_id TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
      AND status = 'active' AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Aktor Admin aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'boarding_runtime', true);
  RETURN public.assign_student_to_room(p_tenant_id, p_student_id, p_room_id, p_building_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_master_data_student_with_actor(
  p_tenant_id UUID,
  p_student_id UUID,
  p_source_record_id TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
      AND status = 'active' AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Aktor Admin aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'master_data', true);
  RETURN public.archive_master_data_student(p_tenant_id, p_student_id, p_source_record_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_master_data_student_with_actor(
  p_tenant_id UUID,
  p_student_id UUID,
  p_source_record_id TEXT,
  p_student JSONB,
  p_nik_ciphertext_hex TEXT,
  p_nik_fingerprint_hex TEXT,
  p_nisn_ciphertext_hex TEXT,
  p_nisn_fingerprint_hex TEXT,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_actor_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
      AND status = 'active' AND role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'Aktor Admin aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'master_data', true);
  RETURN public.upsert_master_data_student(
    p_tenant_id, p_student_id, p_source_record_id, p_student,
    p_nik_ciphertext_hex, p_nik_fingerprint_hex,
    p_nisn_ciphertext_hex, p_nisn_fingerprint_hex
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_candidate_id UUID,
  p_nis TEXT,
  p_class_id TEXT,
  p_room_id TEXT,
  p_building_id TEXT,
  p_guardian_name TEXT,
  p_guardian_phone TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'ppdb_onboarding', true);
  RETURN public.onboard_accepted_ppdb_candidate_for_admin(
    p_tenant_id, p_actor_user_id, p_candidate_id, p_nis, p_class_id,
    p_room_id, p_building_id, p_guardian_name, p_guardian_phone, p_client_request_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.capture_student_room_assignment_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_student_room_assignment_history() TO service_role;
REVOKE ALL ON FUNCTION public.assign_student_to_room_audited(UUID, UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.archive_master_data_student_with_actor(UUID, UUID, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_master_data_student_with_actor(UUID, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_student_to_room_audited(UUID, UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.archive_master_data_student_with_actor(UUID, UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_master_data_student_with_actor(UUID, UUID, TEXT, JSONB, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_accepted_ppdb_candidate_with_room_history_actor(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO service_role;

COMMIT;
