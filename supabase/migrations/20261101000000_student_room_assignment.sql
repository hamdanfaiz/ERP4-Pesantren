-- Forward-only port following tenant foundation, PPDB workflows, and Master Data onboarding.
-- Transactional tenant-scoped room placement for the Supabase operational cutover.
-- This RPC is called only by the trusted application server using service_role.
BEGIN;

CREATE OR REPLACE FUNCTION public.assign_student_to_room(
  p_tenant_id UUID,
  p_student_id UUID,
  p_room_id TEXT,
  p_building_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student public.students%ROWTYPE;
  v_room public.master_data_records%ROWTYPE;
  v_old_room public.master_data_records%ROWTYPE;
  v_building public.master_data_records%ROWTYPE;
  v_target_room_id TEXT;
  v_building_id TEXT;
  v_room_gender public.gender_type;
  v_room_count INTEGER;
  v_old_room_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL THEN
    RAISE EXCEPTION 'Tenant atau ID santri tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_room_id IS NOT NULL AND (
    length(btrim(p_room_id)) NOT BETWEEN 1 AND 160 OR position('/' in p_room_id) > 0
  ) THEN
    RAISE EXCEPTION 'ID kamar tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_building_id IS NOT NULL AND (
    length(btrim(p_building_id)) NOT BETWEEN 1 AND 160 OR position('/' in p_building_id) > 0
  ) THEN
    RAISE EXCEPTION 'ID gedung tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  v_target_room_id := CASE WHEN p_room_id IS NULL THEN NULL ELSE btrim(p_room_id) END;

  -- Lock old and target rooms in stable order so concurrent moves cannot overbook or deadlock.
  PERFORM id
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id
    AND category = 'Kamar'
    AND id = ANY(ARRAY[v_student.room_id, v_target_room_id]::TEXT[])
  ORDER BY id
  FOR UPDATE;

  IF v_target_room_id IS NULL THEN
    IF v_student.room_id IS NULL THEN
      RETURN jsonb_build_object('success', true, 'alreadyUnassigned', true, 'studentId', v_student.id);
    END IF;

    SELECT * INTO v_old_room
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kamar lama santri tidak ditemukan; rekonsiliasi data terlebih dahulu' USING ERRCODE = '55000';
    END IF;

    SELECT count(*)::INTEGER INTO v_old_room_count
    FROM public.students
    WHERE tenant_id = p_tenant_id AND room_id = v_student.room_id;
    IF v_old_room.occupied <> v_old_room_count THEN
      RAISE EXCEPTION 'Okupansi kamar lama tidak sinkron; rekonsiliasi data sebelum mengubah penempatan' USING ERRCODE = '55000';
    END IF;
    IF v_old_room_count < 1 THEN
      RAISE EXCEPTION 'Okupansi kamar lama tidak valid' USING ERRCODE = '23514';
    END IF;

    UPDATE public.master_data_records
    SET occupied = occupied - 1, updated_at = now()
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;

    UPDATE public.students
    SET room_id = NULL, building_id = NULL, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_student_id;

    RETURN jsonb_build_object(
      'success', true, 'alreadyUnassigned', false, 'studentId', v_student.id,
      'previousRoomId', v_student.room_id, 'roomId', NULL,
      'occupied', v_old_room_count - 1, 'capacity', v_old_room.capacity
    );
  END IF;

  SELECT * INTO v_room
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_target_room_id;
  IF NOT FOUND OR lower(v_room.status) IN ('inactive', 'nonaktif', 'disabled') THEN
    RAISE EXCEPTION 'Kamar tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_room.capacity IS NULL OR v_room.capacity < 1 THEN
    RAISE EXCEPTION 'Kapasitas kamar belum diatur dengan benar' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(btrim(p_building_id), '') IS NOT NULL
    AND v_room.parent_id IS DISTINCT FROM btrim(p_building_id) THEN
    RAISE EXCEPTION 'Gedung tidak sesuai dengan kamar yang dipilih' USING ERRCODE = '22023';
  END IF;
  v_building_id := COALESCE(NULLIF(btrim(p_building_id), ''), v_room.parent_id);
  IF v_building_id IS NOT NULL THEN
    SELECT * INTO v_building
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Gedung' AND id = v_building_id
    FOR KEY SHARE;
    IF NOT FOUND OR lower(v_building.status) IN ('inactive', 'nonaktif', 'disabled') THEN
      RAISE EXCEPTION 'Gedung tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_room.gender_code IS NOT NULL AND v_building.gender_code IS NOT NULL
      AND v_room.gender_code <> v_building.gender_code THEN
      RAISE EXCEPTION 'Konfigurasi gender kamar bertentangan dengan gedung' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_room_gender := COALESCE(v_room.gender_code, v_building.gender_code);
  IF v_room_gender IS NULL OR v_student.gender IS NULL THEN
    RAISE EXCEPTION 'Gender kamar, gedung, atau santri belum dikonfigurasi' USING ERRCODE = '22023';
  END IF;
  IF v_room_gender <> v_student.gender THEN
    RAISE EXCEPTION 'Gender santri tidak sesuai dengan kamar' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::INTEGER INTO v_room_count
  FROM public.students
  WHERE tenant_id = p_tenant_id AND room_id = v_room.id;
  IF v_room.occupied <> v_room_count THEN
    RAISE EXCEPTION 'Okupansi kamar tidak sinkron; rekonsiliasi data sebelum mengubah penempatan' USING ERRCODE = '55000';
  END IF;

  IF v_student.room_id IS NOT DISTINCT FROM v_room.id THEN
    UPDATE public.students
    SET building_id = v_building_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_student_id;
    RETURN jsonb_build_object(
      'success', true, 'alreadyAssigned', true, 'studentId', v_student.id,
      'roomId', v_room.id, 'buildingId', v_building_id,
      'occupied', v_room.occupied, 'capacity', v_room.capacity
    );
  END IF;

  IF v_room_count >= v_room.capacity THEN
    RAISE EXCEPTION 'Kamar sudah penuh (%/%)', v_room_count, v_room.capacity USING ERRCODE = '23514';
  END IF;

  IF v_student.room_id IS NOT NULL THEN
    SELECT * INTO v_old_room
    FROM public.master_data_records
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kamar lama santri tidak ditemukan; rekonsiliasi data terlebih dahulu' USING ERRCODE = '55000';
    END IF;

    SELECT count(*)::INTEGER INTO v_old_room_count
    FROM public.students
    WHERE tenant_id = p_tenant_id AND room_id = v_student.room_id;
    IF v_old_room.occupied <> v_old_room_count OR v_old_room_count < 1 THEN
      RAISE EXCEPTION 'Okupansi kamar lama tidak sinkron; rekonsiliasi data sebelum mengubah penempatan' USING ERRCODE = '55000';
    END IF;

    UPDATE public.master_data_records
    SET occupied = occupied - 1, updated_at = now()
    WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_student.room_id;
  END IF;

  UPDATE public.master_data_records
  SET occupied = occupied + 1, updated_at = now()
  WHERE tenant_id = p_tenant_id AND category = 'Kamar' AND id = v_room.id;

  UPDATE public.students
  SET room_id = v_room.id, building_id = v_building_id, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_student_id;

  RETURN jsonb_build_object(
    'success', true, 'alreadyAssigned', false, 'studentId', v_student.id,
    'previousRoomId', v_student.room_id, 'roomId', v_room.id,
    'buildingId', v_building_id, 'occupied', v_room_count + 1,
    'capacity', v_room.capacity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_student_to_room(UUID, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_student_to_room(UUID, UUID, TEXT, TEXT)
  TO service_role;

COMMIT;
