-- Enforce unit boundaries for Asrama reads and writes performed by Ustadz.
-- Unmapped historical locations and students stay Admin-only until explicitly mapped.
BEGIN;

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
    JOIN public.profiles p
      ON p.tenant_id = s.tenant_id AND p.user_id = p_user_id
      AND p.role = 'ustadz' AND p.status = 'active'
    JOIN public.organization_units u
      ON u.tenant_id = p.tenant_id AND u.id = p.organization_unit_id AND u.status = 'active'
    JOIN public.boarding_staff_assignments a
      ON a.tenant_id = s.tenant_id AND a.user_id = p_user_id AND a.status = 'active'
    LEFT JOIN public.master_data_records room
      ON room.tenant_id = s.tenant_id AND room.id = s.room_id AND room.category = 'Kamar'
    LEFT JOIN public.master_data_records room_parent
      ON room_parent.tenant_id = s.tenant_id AND room_parent.id = room.parent_id AND room_parent.category = 'Gedung'
    LEFT JOIN public.master_data_records building
      ON building.tenant_id = s.tenant_id AND building.id = s.building_id AND building.category = 'Gedung'
    WHERE s.tenant_id = p_tenant_id AND s.id = p_student_id
      AND lower(COALESCE(s.status, '')) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan')
      AND s.organization_unit_id = p.organization_unit_id
      AND (room.id IS NULL OR lower(COALESCE(room.status, '')) NOT IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled'))
      AND (building.id IS NULL OR lower(COALESCE(building.status, '')) NOT IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled'))
      AND (
        (s.room_id IS NOT NULL AND room.id IS NOT NULL
          AND room.organization_unit_id = p.organization_unit_id
          AND (room.parent_id IS NULL OR (room_parent.id IS NOT NULL
            AND room_parent.organization_unit_id = p.organization_unit_id
            AND lower(COALESCE(room_parent.status, '')) NOT IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled')))
          AND (s.building_id IS NULL OR room.parent_id IS NULL OR s.building_id = room.parent_id)
          AND (s.building_id IS NULL OR building.organization_unit_id = p.organization_unit_id))
        OR (s.room_id IS NULL AND s.building_id IS NOT NULL AND building.id IS NOT NULL
          AND building.organization_unit_id = p.organization_unit_id)
      )
      AND (
        (a.room_id IS NOT NULL AND a.room_id = s.room_id AND room.id IS NOT NULL)
        OR (a.building_id IS NOT NULL AND a.building_id = s.building_id AND building.id IS NOT NULL)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.boarding_user_can_access_student(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boarding_user_can_access_student(UUID, UUID, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.boarding_user_can_access_room(
  p_tenant_id UUID,
  p_user_id UUID,
  p_room_id TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.master_data_records room
    JOIN public.profiles p
      ON p.tenant_id = room.tenant_id AND p.user_id = p_user_id
      AND p.role = 'ustadz' AND p.status = 'active'
    JOIN public.organization_units u
      ON u.tenant_id = p.tenant_id AND u.id = p.organization_unit_id AND u.status = 'active'
    JOIN public.boarding_staff_assignments a
      ON a.tenant_id = room.tenant_id AND a.user_id = p_user_id AND a.status = 'active'
    LEFT JOIN public.master_data_records building
      ON building.tenant_id = room.tenant_id AND building.id = room.parent_id AND building.category = 'Gedung'
    WHERE room.tenant_id = p_tenant_id AND room.id = p_room_id AND room.category = 'Kamar'
      AND lower(COALESCE(room.status, '')) NOT IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled')
      AND lower(COALESCE(p.status, '')) = 'active'
      AND room.organization_unit_id = p.organization_unit_id
      AND (room.parent_id IS NULL OR building.id IS NOT NULL)
      AND (building.id IS NULL OR lower(COALESCE(building.status, '')) NOT IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled'))
      AND (room.parent_id IS NULL OR building.organization_unit_id = p.organization_unit_id)
      AND (
        a.room_id = room.id
        OR (a.building_id IS NOT NULL AND a.building_id = room.parent_id AND building.id IS NOT NULL)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.boarding_user_can_access_room(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.boarding_user_can_access_room(UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_boarding_staff_assignment_unit_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_unit_id UUID;
  v_location_unit_id UUID;
  v_parent_unit_id UUID;
  v_parent_status TEXT;
BEGIN
  IF NEW.status = 'inactive' THEN
    RETURN NEW;
  END IF;
  SELECT p.organization_unit_id INTO v_unit_id
  FROM public.profiles p
  JOIN public.organization_units u
    ON u.tenant_id = p.tenant_id AND u.id = p.organization_unit_id AND u.status = 'active'
  WHERE p.tenant_id = NEW.tenant_id AND p.user_id = NEW.user_id
    AND p.role = 'ustadz' AND p.status = 'active';
  IF v_unit_id IS NULL THEN
    RAISE EXCEPTION 'Petugas asrama harus memiliki unit organisasi aktif' USING ERRCODE = '42501';
  END IF;

  IF NEW.room_id IS NOT NULL THEN
    SELECT room.organization_unit_id, building.organization_unit_id, building.status
      INTO v_location_unit_id, v_parent_unit_id, v_parent_status
    FROM public.master_data_records room
    LEFT JOIN public.master_data_records building
      ON building.tenant_id = room.tenant_id AND building.id = room.parent_id AND building.category = 'Gedung'
    WHERE room.tenant_id = NEW.tenant_id AND room.id = NEW.room_id AND room.category = 'Kamar'
      AND lower(COALESCE(room.status, '')) NOT IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kamar aktif tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_parent_status IS NOT NULL AND lower(COALESCE(v_parent_status, '')) NOT IN ('active', 'aktif') THEN
      RAISE EXCEPTION 'Gedung induk kamar tidak aktif' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.master_data_records room
      WHERE room.tenant_id = NEW.tenant_id AND room.id = NEW.room_id AND room.parent_id IS NOT NULL)
       AND v_parent_status IS NULL THEN
      RAISE EXCEPTION 'Gedung induk kamar tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_location_unit_id IS DISTINCT FROM v_unit_id
       OR (v_parent_status IS NOT NULL AND v_parent_unit_id IS DISTINCT FROM v_unit_id) THEN
      RAISE EXCEPTION 'Kamar berada di luar unit petugas' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT organization_unit_id INTO v_location_unit_id
    FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND id = NEW.building_id AND category = 'Gedung'
      AND lower(COALESCE(status, '')) NOT IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled');
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Gedung aktif tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
    END IF;
    IF v_location_unit_id IS DISTINCT FROM v_unit_id THEN
      RAISE EXCEPTION 'Gedung berada di luar unit petugas' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_boarding_staff_assignment_unit_scope() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS boarding_staff_assignments_enforce_unit_scope ON public.boarding_staff_assignments;
CREATE TRIGGER boarding_staff_assignments_enforce_unit_scope
  BEFORE INSERT OR UPDATE OF tenant_id, user_id, building_id, room_id, status
  ON public.boarding_staff_assignments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_boarding_staff_assignment_unit_scope();

COMMENT ON FUNCTION public.boarding_user_can_access_student(UUID, UUID, UUID) IS
  'Ustadz can access only active students in their active organization unit and assigned active locations.';
COMMENT ON FUNCTION public.boarding_user_can_access_room(UUID, UUID, TEXT) IS
  'Ustadz can access only assigned active rooms and parent buildings mapped to their active organization unit.';

CREATE TABLE public.boarding_location_unit_assignment_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  location_category TEXT NOT NULL CHECK (location_category IN ('Gedung', 'Kamar')),
  location_id TEXT NOT NULL CHECK (length(btrim(location_id)) BETWEEN 1 AND 160),
  unit_id UUID NOT NULL,
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, location_category, location_id)
    REFERENCES public.master_data_records (tenant_id, category, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.boarding_location_unit_assignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boarding_location_unit_assignment_requests FORCE ROW LEVEL SECURITY;
CREATE INDEX boarding_location_unit_requests_actor_idx
  ON public.boarding_location_unit_assignment_requests (tenant_id, actor_user_id, created_at DESC);
REVOKE ALL ON TABLE public.boarding_location_unit_assignment_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.boarding_location_unit_assignment_requests TO service_role;

CREATE OR REPLACE FUNCTION public.assign_tenant_boarding_location_unit(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_location_category TEXT,
  p_location_id TEXT,
  p_unit_id UUID,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_unit_status TEXT;
  v_location public.master_data_records%ROWTYPE;
  v_parent_unit_id UUID;
  v_parent_status TEXT;
  v_request public.boarding_location_unit_assignment_requests%ROWTYPE;
  v_location_id TEXT;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  v_location_id := btrim(COALESCE(p_location_id, ''));
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_unit_id IS NULL OR p_client_request_id IS NULL
     OR p_expected_role IS NULL OR p_location_category IS NULL
     OR p_expected_role NOT IN ('admin', 'super_admin')
     OR p_location_category NOT IN ('Gedung', 'Kamar')
     OR v_location_id = '' OR length(v_location_id) > 160 OR v_location_id ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Permintaan pemetaan unit lokasi Asrama tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants t
  JOIN public.profiles p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin' AND (v_permissions -> 'boarding') IS DISTINCT FROM 'true'::jsonb THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Asrama pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_unit_status FROM public.organization_units
  WHERE tenant_id = p_tenant_id AND id = p_unit_id FOR SHARE;
  IF NOT FOUND OR v_unit_status <> 'active' THEN
    RAISE EXCEPTION 'Unit aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object('category', p_location_category, 'locationId', v_location_id, 'unitId', p_unit_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'boarding-location-unit-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_request FROM public.boarding_location_unit_assignment_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.location_category IS DISTINCT FROM p_location_category
       OR v_request.location_id IS DISTINCT FROM v_location_id
       OR v_request.unit_id IS DISTINCT FROM p_unit_id
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'ID permintaan pemetaan sudah dipakai untuk lokasi atau unit berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'boarding-location-unit:' || p_tenant_id::text || ':' || p_location_category || ':' || v_location_id, 0
  ));
  SELECT * INTO v_location FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = p_location_category AND id = v_location_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Gedung atau kamar tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF lower(COALESCE(v_location.status, '')) IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled') THEN
    RAISE EXCEPTION 'Lokasi nonaktif tidak dapat dipetakan untuk operasional Asrama' USING ERRCODE = '23514';
  END IF;
  IF v_location.organization_unit_id IS NOT NULL
     AND v_location.organization_unit_id IS DISTINCT FROM p_unit_id THEN
    RAISE EXCEPTION 'Lokasi sudah dipetakan ke unit lain dan tidak dapat dipindahkan' USING ERRCODE = '23514';
  END IF;

  IF p_location_category = 'Kamar' AND v_location.parent_id IS NOT NULL THEN
    SELECT organization_unit_id, status INTO v_parent_unit_id, v_parent_status
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = v_location.parent_id
    FOR SHARE;
    IF NOT FOUND OR lower(COALESCE(v_parent_status, '')) IN ('inactive', 'nonaktif', 'tidak aktif', 'disabled') THEN
      RAISE EXCEPTION 'Gedung induk aktif belum ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_parent_unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Petakan gedung induk ke unit yang sama sebelum memetakan kamar' USING ERRCODE = '23514';
    END IF;
  ELSIF p_location_category = 'Gedung' AND EXISTS (
    SELECT 1 FROM public.master_data_records room
    WHERE room.tenant_id = p_tenant_id AND room.category = 'Kamar' AND room.parent_id = v_location_id
      AND room.organization_unit_id IS NOT NULL AND room.organization_unit_id IS DISTINCT FROM p_unit_id
  ) THEN
    RAISE EXCEPTION 'Gedung memiliki kamar yang sudah ditetapkan ke unit lain' USING ERRCODE = '23514';
  END IF;

  IF v_location.organization_unit_id IS NULL THEN
    UPDATE public.master_data_records SET organization_unit_id = p_unit_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND category = p_location_category AND id = v_location_id
      AND organization_unit_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lokasi berubah saat pemetaan; muat ulang dan coba kembali' USING ERRCODE = '40001';
    END IF;
  END IF;

  v_result := jsonb_build_object('success', true, 'category', p_location_category,
    'locationId', v_location_id, 'unitId', p_unit_id, 'alreadyApplied', false);
  INSERT INTO public.boarding_location_unit_assignment_requests (
    tenant_id, client_request_id, actor_user_id, location_category, location_id, unit_id, request_payload, result
  ) VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, p_location_category, v_location_id, p_unit_id, v_payload, v_result);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_tenant_boarding_location_unit(UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tenant_boarding_location_unit(UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID)
  TO service_role;
COMMENT ON FUNCTION public.assign_tenant_boarding_location_unit(UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID) IS
  'Admin-only, tenant-scoped, idempotent unit mapping for existing boarding buildings and rooms.';

COMMIT;
