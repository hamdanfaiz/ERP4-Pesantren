-- Append-only, tenant-scoped metadata audit feed for core Master Data changes.
-- Audit values are deliberately omitted: the feed never stores NIK, NIS, names,
-- contact details, addresses, or JSON payloads.
BEGIN;

CREATE TABLE public.master_data_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('student', 'structure')),
  entity_category TEXT CHECK (entity_category IS NULL OR entity_category IN ('Gedung', 'Kamar', 'Kelas')),
  entity_id TEXT NOT NULL CHECK (length(btrim(entity_id)) BETWEEN 1 AND 160),
  action TEXT NOT NULL CHECK (action IN ('created', 'updated', 'archived', 'deleted')),
  changed_fields TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  change_source TEXT NOT NULL DEFAULT 'system' CHECK (
    change_source IN ('master_data', 'master_data_import', 'ppdb_onboarding', 'boarding_runtime', 'legacy_import', 'system')
  ),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK ((entity_type = 'structure') = (entity_category IS NOT NULL))
);

CREATE INDEX master_data_audit_tenant_id_desc_idx
  ON public.master_data_audit_events (tenant_id, id DESC);
CREATE INDEX master_data_audit_tenant_entity_id_desc_idx
  ON public.master_data_audit_events (tenant_id, entity_type, entity_id, id DESC);

ALTER TABLE public.master_data_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_data_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.master_data_audit_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.master_data_audit_events TO service_role;

CREATE OR REPLACE FUNCTION public.capture_master_data_audit_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_id UUID;
  v_actor_id UUID;
  v_actor_text TEXT;
  v_entity_type TEXT;
  v_entity_category TEXT;
  v_entity_id TEXT;
  v_action TEXT;
  v_fields TEXT[] := ARRAY[]::TEXT[];
  v_source TEXT;
  v_source_text TEXT;
BEGIN
  v_actor_text := NULLIF(current_setting('app.room_assignment_actor_id', true), '');
  IF v_actor_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    v_actor_id := v_actor_text::UUID;
  END IF;

  v_source_text := COALESCE(
    NULLIF(current_setting('app.master_data_audit_source', true), ''),
    NULLIF(current_setting('app.room_assignment_source', true), ''),
    'system'
  );
  IF v_source_text IN ('master_data', 'master_data_import', 'ppdb_onboarding', 'boarding_runtime', 'legacy_import') THEN
    v_source := v_source_text;
  ELSE
    v_source := 'system';
  END IF;

  IF TG_TABLE_NAME = 'master_data_records' THEN
    v_entity_type := 'structure';
    IF TG_OP = 'DELETE' THEN
      v_tenant_id := OLD.tenant_id;
      v_entity_category := OLD.category;
      v_entity_id := OLD.id;
      v_action := 'deleted';
      v_fields := ARRAY['record'];
    ELSIF TG_OP = 'INSERT' THEN
      v_tenant_id := NEW.tenant_id;
      v_entity_category := NEW.category;
      v_entity_id := NEW.id;
      v_action := 'created';
      v_fields := ARRAY['name', 'status', 'parent_id', 'grade', 'capacity', 'occupied', 'gender_code', 'location', 'attributes'];
    ELSE
      v_tenant_id := NEW.tenant_id;
      v_entity_category := NEW.category;
      v_entity_id := NEW.id;
      IF OLD.name IS DISTINCT FROM NEW.name THEN v_fields := array_append(v_fields, 'name'); END IF;
      IF OLD.status IS DISTINCT FROM NEW.status THEN v_fields := array_append(v_fields, 'status'); END IF;
      IF OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN v_fields := array_append(v_fields, 'parent_id'); END IF;
      IF OLD.grade IS DISTINCT FROM NEW.grade THEN v_fields := array_append(v_fields, 'grade'); END IF;
      IF OLD.capacity IS DISTINCT FROM NEW.capacity THEN v_fields := array_append(v_fields, 'capacity'); END IF;
      IF OLD.occupied IS DISTINCT FROM NEW.occupied THEN v_fields := array_append(v_fields, 'occupied'); END IF;
      IF OLD.gender_code IS DISTINCT FROM NEW.gender_code THEN v_fields := array_append(v_fields, 'gender_code'); END IF;
      IF OLD.location IS DISTINCT FROM NEW.location THEN v_fields := array_append(v_fields, 'location'); END IF;
      IF OLD.attributes IS DISTINCT FROM NEW.attributes THEN v_fields := array_append(v_fields, 'attributes'); END IF;
      IF cardinality(v_fields) = 0 THEN RETURN NEW; END IF;
      v_action := 'updated';
    END IF;
  ELSIF TG_TABLE_NAME = 'students' THEN
    v_entity_type := 'student';
    v_entity_category := NULL;
    IF TG_OP = 'DELETE' THEN
      v_tenant_id := OLD.tenant_id;
      v_entity_id := OLD.id::TEXT;
      v_action := 'deleted';
      v_fields := ARRAY['record'];
    ELSIF TG_OP = 'INSERT' THEN
      v_tenant_id := NEW.tenant_id;
      v_entity_id := NEW.id::TEXT;
      v_action := 'created';
      v_fields := ARRAY['name', 'identity', 'gender', 'grade', 'class_id', 'room_id', 'building_id', 'details', 'status'];
    ELSE
      v_tenant_id := NEW.tenant_id;
      v_entity_id := NEW.id::TEXT;
      IF OLD.name IS DISTINCT FROM NEW.name THEN v_fields := array_append(v_fields, 'name'); END IF;
      IF OLD.nis IS DISTINCT FROM NEW.nis
        OR OLD.nik_ciphertext IS DISTINCT FROM NEW.nik_ciphertext
        OR OLD.nik_fingerprint IS DISTINCT FROM NEW.nik_fingerprint
        OR OLD.nisn_ciphertext IS DISTINCT FROM NEW.nisn_ciphertext
        OR OLD.nisn_fingerprint IS DISTINCT FROM NEW.nisn_fingerprint THEN
        v_fields := array_append(v_fields, 'identity');
      END IF;
      IF OLD.gender IS DISTINCT FROM NEW.gender THEN v_fields := array_append(v_fields, 'gender'); END IF;
      IF OLD.grade IS DISTINCT FROM NEW.grade THEN v_fields := array_append(v_fields, 'grade'); END IF;
      IF OLD.class_id IS DISTINCT FROM NEW.class_id THEN v_fields := array_append(v_fields, 'class_id'); END IF;
      IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN v_fields := array_append(v_fields, 'room_id'); END IF;
      IF OLD.building_id IS DISTINCT FROM NEW.building_id THEN v_fields := array_append(v_fields, 'building_id'); END IF;
      IF OLD.details IS DISTINCT FROM NEW.details THEN v_fields := array_append(v_fields, 'details'); END IF;
      IF OLD.status IS DISTINCT FROM NEW.status THEN v_fields := array_append(v_fields, 'status'); END IF;
      IF cardinality(v_fields) = 0 THEN RETURN NEW; END IF;
      v_action := CASE
        WHEN lower(NEW.status) = 'archived' AND lower(OLD.status) <> 'archived' THEN 'archived'
        ELSE 'updated'
      END;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported Master Data audit source table' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.master_data_audit_events (
    tenant_id, actor_user_id, entity_type, entity_category, entity_id, action, changed_fields, change_source
  ) VALUES (
    v_tenant_id, v_actor_id, v_entity_type, v_entity_category, v_entity_id, v_action,
    COALESCE(v_fields, ARRAY[]::TEXT[]), v_source
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER master_data_records_audit_event
  AFTER INSERT OR UPDATE OR DELETE ON public.master_data_records
  FOR EACH ROW EXECUTE FUNCTION public.capture_master_data_audit_event();
CREATE TRIGGER students_master_data_audit_event
  AFTER INSERT OR UPDATE OR DELETE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.capture_master_data_audit_event();

CREATE OR REPLACE FUNCTION public.reject_master_data_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Master Data audit events are append-only' USING ERRCODE = '42501';
END;
$$;

CREATE TRIGGER master_data_audit_events_immutable_rows
  BEFORE UPDATE OR DELETE ON public.master_data_audit_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_master_data_audit_event_mutation();
CREATE TRIGGER master_data_audit_events_immutable_truncate
  BEFORE TRUNCATE ON public.master_data_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_master_data_audit_event_mutation();

CREATE OR REPLACE FUNCTION public.validate_master_data_audit_actor(p_tenant_id UUID, p_actor_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active')
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
        AND lower(status) = 'active' AND lower(role) IN ('admin', 'super_admin')
    ) THEN
    RAISE EXCEPTION 'Aktor Admin aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_master_data_structure_with_actor(
  p_tenant_id UUID, p_category TEXT, p_id TEXT, p_record JSONB, p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.validate_master_data_audit_actor(p_tenant_id, p_actor_user_id);
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.master_data_audit_source', 'master_data', true);
  RETURN public.upsert_master_data_structure(p_tenant_id, p_category, p_id, p_record);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_master_data_structure_if_absent_with_actor(
  p_tenant_id UUID, p_category TEXT, p_id TEXT, p_record JSONB, p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.validate_master_data_audit_actor(p_tenant_id, p_actor_user_id);
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.master_data_audit_source', 'master_data_import', true);
  RETURN public.create_master_data_structure_if_absent(p_tenant_id, p_category, p_id, p_record);
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_master_data_structure_with_actor(
  p_tenant_id UUID, p_category TEXT, p_id TEXT, p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_deleted_id TEXT;
BEGIN
  PERFORM public.validate_master_data_audit_actor(p_tenant_id, p_actor_user_id);
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.master_data_audit_source', 'master_data', true);
  DELETE FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = p_category AND id = p_id
  RETURNING id INTO v_deleted_id;
  RETURN jsonb_build_object('deleted', v_deleted_id IS NOT NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.import_legacy_master_data_student_with_actor(
  p_tenant_id UUID, p_student JSONB, p_guardian JSONB, p_apply BOOLEAN, p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.validate_master_data_audit_actor(p_tenant_id, p_actor_user_id);
  PERFORM set_config('app.room_assignment_actor_id', p_actor_user_id::TEXT, true);
  PERFORM set_config('app.room_assignment_source', 'master_data', true);
  PERFORM set_config(
    'app.master_data_audit_source',
    CASE WHEN p_apply IS TRUE THEN 'master_data_import' ELSE 'master_data' END,
    true
  );
  RETURN public.import_legacy_master_data_student(p_tenant_id, p_student, p_guardian, p_apply);
END;
$$;

REVOKE ALL ON FUNCTION public.capture_master_data_audit_event() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_master_data_audit_event_mutation() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_master_data_audit_actor(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_master_data_structure_with_actor(UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_master_data_structure_if_absent_with_actor(UUID, TEXT, TEXT, JSONB, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.delete_master_data_structure_with_actor(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.import_legacy_master_data_student_with_actor(UUID, JSONB, JSONB, BOOLEAN, UUID) FROM PUBLIC, anon, authenticated, service_role;

-- Retire actor-less mutation RPC access; trusted API callers must use the audited wrappers.
REVOKE ALL ON FUNCTION public.upsert_master_data_structure(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_master_data_structure_if_absent(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.import_legacy_master_data_student(UUID, JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.upsert_master_data_structure_with_actor(UUID, TEXT, TEXT, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_master_data_structure_if_absent_with_actor(UUID, TEXT, TEXT, JSONB, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_master_data_structure_with_actor(UUID, TEXT, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_master_data_student_with_actor(UUID, JSONB, JSONB, BOOLEAN, UUID) TO service_role;

COMMENT ON TABLE public.master_data_audit_events IS
  'Append-only tenant-scoped audit metadata for Master Data students and structures; never stores record values or PII.';
COMMENT ON FUNCTION public.capture_master_data_audit_event() IS
  'Captures changed field names, internal entity ID, actor, and source only; no PII values are written.';

COMMIT;
