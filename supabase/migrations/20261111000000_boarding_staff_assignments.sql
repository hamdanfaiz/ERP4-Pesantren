-- Trusted tenant-scoped room/building assignment for boarding staff and Ustadz.
BEGIN;

CREATE TABLE public.boarding_staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL,
  building_id TEXT,
  room_id TEXT,
  building_category TEXT GENERATED ALWAYS AS (CASE WHEN building_id IS NOT NULL THEN 'Gedung'::TEXT END) STORED,
  room_category TEXT GENERATED ALWAYS AS (CASE WHEN room_id IS NOT NULL THEN 'Kamar'::TEXT END) STORED,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((building_id IS NOT NULL AND room_id IS NULL) OR (building_id IS NULL AND room_id IS NOT NULL)),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, building_id, building_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX boarding_staff_assignments_active_building_uq
  ON public.boarding_staff_assignments (tenant_id, user_id, building_id)
  WHERE status = 'active' AND building_id IS NOT NULL;
CREATE UNIQUE INDEX boarding_staff_assignments_active_room_uq
  ON public.boarding_staff_assignments (tenant_id, user_id, room_id)
  WHERE status = 'active' AND room_id IS NOT NULL;
CREATE INDEX boarding_staff_assignments_user_status_idx
  ON public.boarding_staff_assignments (tenant_id, user_id, status);

CREATE TABLE public.boarding_staff_assignment_events (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('assigned', 'revoked')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('active', 'inactive')),
  to_status TEXT NOT NULL CHECK (to_status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, assignment_id) REFERENCES public.boarding_staff_assignments (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, target_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TRIGGER boarding_staff_assignments_set_updated_at
  BEFORE UPDATE ON public.boarding_staff_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
ALTER TABLE public.boarding_staff_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_staff_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_staff_assignment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_staff_assignment_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.boarding_staff_assignments, public.boarding_staff_assignment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.boarding_staff_assignments TO service_role;
GRANT SELECT, INSERT ON TABLE public.boarding_staff_assignment_events TO service_role;

CREATE OR REPLACE FUNCTION public.boarding_user_can_access_student(
  p_tenant_id UUID,
  p_user_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.boarding_staff_assignments a
      ON a.tenant_id = s.tenant_id AND a.user_id = p_user_id AND a.status = 'active'
    WHERE s.tenant_id = p_tenant_id AND s.id = p_student_id
      AND lower(COALESCE(s.status, '')) <> 'archived'
      AND (
        (a.room_id IS NOT NULL AND a.room_id = s.room_id AND EXISTS (
          SELECT 1 FROM public.master_data_records room
          WHERE room.tenant_id = s.tenant_id AND room.id = s.room_id AND room.category = 'Kamar'
            AND lower(COALESCE(room.status, '')) NOT IN ('inactive', 'nonaktif', 'disabled')
        ))
        OR (a.building_id IS NOT NULL AND a.building_id = s.building_id AND EXISTS (
          SELECT 1 FROM public.master_data_records building
          WHERE building.tenant_id = s.tenant_id AND building.id = s.building_id AND building.category = 'Gedung'
            AND lower(COALESCE(building.status, '')) NOT IN ('inactive', 'nonaktif', 'disabled')
        ))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.manage_boarding_staff_assignment(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_assignment_id UUID,
  p_target_user_id UUID,
  p_building_id TEXT,
  p_room_id TEXT,
  p_to_status TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_target_role TEXT;
  v_assignment public.boarding_staff_assignments%ROWTYPE;
  v_event public.boarding_staff_assignment_events%ROWTYPE;
  v_assignment_id UUID;
  v_location_count INTEGER;
  v_event_type TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_target_user_id IS NULL OR p_client_request_id IS NULL
    OR p_to_status NOT IN ('active', 'inactive')
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin')
    OR ((p_building_id IS NOT NULL)::INTEGER + (p_room_id IS NOT NULL)::INTEGER) NOT IN (0, 1) THEN
    RAISE EXCEPTION 'Penugasan petugas asrama tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_to_status IS NULL THEN RAISE EXCEPTION 'Status penugasan wajib diisi' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  IF v_role IS NULL OR v_role <> lower(p_expected_role) OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Hanya Admin aktif tenant yang dapat mengatur penugasan' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role)) INTO v_target_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id AND status = 'active';
  IF v_target_role IS DISTINCT FROM 'ustadz' THEN
    RAISE EXCEPTION 'Petugas tujuan harus merupakan akun Ustadz aktif pada tenant ini' USING ERRCODE = '42501';
  END IF;
  IF p_assignment_id IS NULL AND p_to_status <> 'active' THEN
    RAISE EXCEPTION 'Penugasan baru harus berstatus aktif' USING ERRCODE = '22023';
  END IF;
  IF p_assignment_id IS NULL AND ((p_building_id IS NOT NULL)::INTEGER + (p_room_id IS NOT NULL)::INTEGER) <> 1 THEN
    RAISE EXCEPTION 'Pilih tepat satu gedung atau kamar' USING ERRCODE = '22023';
  END IF;
  IF p_building_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND id = p_building_id AND category = 'Gedung' AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled')) THEN
    RAISE EXCEPTION 'Gedung tidak aktif atau tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF p_room_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND id = p_room_id AND category = 'Kamar' AND lower(status) NOT IN ('inactive', 'nonaktif', 'disabled')) THEN
    RAISE EXCEPTION 'Kamar tidak aktif atau tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'boarding-staff-assignment:' || p_tenant_id::text || ':' || p_target_user_id::text, 0
  ));
  SELECT * INTO v_event FROM public.boarding_staff_assignment_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_event.target_user_id IS DISTINCT FROM p_target_user_id OR v_event.to_status IS DISTINCT FROM p_to_status
      OR (p_assignment_id IS NOT NULL AND v_event.assignment_id IS DISTINCT FROM p_assignment_id)
      OR (p_assignment_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM public.boarding_staff_assignments existing_assignment
        WHERE existing_assignment.tenant_id = p_tenant_id AND existing_assignment.id = v_event.assignment_id
          AND existing_assignment.user_id = p_target_user_id
          AND existing_assignment.building_id IS NOT DISTINCT FROM p_building_id
          AND existing_assignment.room_id IS NOT DISTINCT FROM p_room_id
      )) THEN
      RAISE EXCEPTION 'Kunci permintaan penugasan digunakan untuk perubahan berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'assignmentId', v_event.assignment_id, 'status', v_event.to_status);
  END IF;

  IF p_assignment_id IS NULL THEN
    SELECT * INTO v_assignment FROM public.boarding_staff_assignments
    WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id AND status = 'active'
      AND building_id IS NOT DISTINCT FROM p_building_id AND room_id IS NOT DISTINCT FROM p_room_id
    FOR UPDATE;
    IF FOUND THEN
      v_assignment_id := v_assignment.id;
      v_event_type := 'assigned';
    ELSE
      INSERT INTO public.boarding_staff_assignments (tenant_id, user_id, building_id, room_id, status, created_by_user_id)
      VALUES (p_tenant_id, p_target_user_id, p_building_id, p_room_id, 'active', p_actor_user_id)
      RETURNING id INTO v_assignment_id;
      v_event_type := 'assigned';
    END IF;
    INSERT INTO public.boarding_staff_assignment_events (
      tenant_id, assignment_id, target_user_id, actor_user_id, client_request_id, event_type, from_status, to_status
    ) VALUES (p_tenant_id, v_assignment_id, p_target_user_id, p_actor_user_id, p_client_request_id,
      v_event_type, CASE WHEN v_assignment.id IS NULL THEN NULL ELSE 'active' END, 'active');
    RETURN jsonb_build_object('success', true, 'alreadyApplied', v_assignment.id IS NOT NULL,
      'assignmentId', v_assignment_id, 'status', 'active');
  END IF;

  SELECT * INTO v_assignment FROM public.boarding_staff_assignments
  WHERE tenant_id = p_tenant_id AND id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR v_assignment.user_id IS DISTINCT FROM p_target_user_id THEN
    RAISE EXCEPTION 'Penugasan tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_assignment.status = p_to_status THEN
    v_assignment_id := v_assignment.id;
  ELSE
    UPDATE public.boarding_staff_assignments SET status = p_to_status, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_assignment_id RETURNING id INTO v_assignment_id;
  END IF;
  INSERT INTO public.boarding_staff_assignment_events (
    tenant_id, assignment_id, target_user_id, actor_user_id, client_request_id, event_type, from_status, to_status
  ) VALUES (p_tenant_id, v_assignment_id, p_target_user_id, p_actor_user_id, p_client_request_id,
    CASE WHEN p_to_status = 'inactive' THEN 'revoked' ELSE 'assigned' END, v_assignment.status, p_to_status);
  RETURN jsonb_build_object('success', true, 'alreadyApplied', v_assignment.status = p_to_status,
    'assignmentId', v_assignment_id, 'status', p_to_status);
END;
$$;

REVOKE ALL ON FUNCTION public.boarding_user_can_access_student(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.manage_boarding_staff_assignment(UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boarding_user_can_access_student(UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_boarding_staff_assignment(UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, UUID) TO service_role;

COMMENT ON TABLE public.boarding_staff_assignments IS
  'Admin-managed tenant-scoped location assignments used to scope Ustadz access to boarding records.';
COMMIT;
