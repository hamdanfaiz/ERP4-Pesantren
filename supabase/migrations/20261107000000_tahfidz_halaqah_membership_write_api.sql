-- Forward-only port for direct Supabase Auth profiles; Firebase identity bridge is intentionally omitted.
-- Admin-managed tenant-scoped Tahfidz halaqah and membership writes.
-- This migration remains staged; it is not applied to any live Supabase project.
BEGIN;

CREATE TABLE public.tahfidz_halaqah_write_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  requested_halaqah_id UUID,
  halaqah_id UUID NOT NULL,
  name TEXT NOT NULL,
  ustadz_user_id UUID,
  ustadz_name TEXT NOT NULL,
  schedule_text TEXT,
  room_text TEXT,
  daily_target_pages NUMERIC(6,2) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CHECK (length(btrim(ustadz_name)) BETWEEN 1 AND 180),
  CHECK (schedule_text IS NULL OR length(schedule_text) <= 500),
  CHECK (room_text IS NULL OR length(room_text) <= 180),
  CHECK (daily_target_pages BETWEEN 0 AND 100),
  CHECK (status IN ('active', 'inactive', 'archived')),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, halaqah_id)
    REFERENCES public.tahfidz_halaqahs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, ustadz_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.tahfidz_membership_write_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  student_id UUID NOT NULL,
  halaqah_id UUID NOT NULL,
  starts_on DATE NOT NULL,
  membership_id UUID NOT NULL,
  already_assigned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id)
    REFERENCES public.students (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, halaqah_id)
    REFERENCES public.tahfidz_halaqahs (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, membership_id)
    REFERENCES public.tahfidz_memberships (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.tahfidz_halaqah_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_halaqah_write_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_membership_write_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tahfidz_membership_write_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tahfidz_halaqah_write_requests, public.tahfidz_membership_write_requests
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.tahfidz_halaqah_write_requests, public.tahfidz_membership_write_requests
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_tahfidz_halaqah(
  p_tenant_id UUID,
  p_halaqah_id UUID,
  p_name TEXT,
  p_ustadz_user_id UUID,
  p_schedule_text TEXT,
  p_room_text TEXT,
  p_daily_target_pages NUMERIC,
  p_status TEXT,
  p_created_by_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor_role TEXT;
  v_ustadz_name TEXT;
  v_status TEXT;
  v_name TEXT;
  v_schedule TEXT;
  v_room TEXT;
  v_existing public.tahfidz_halaqah_write_requests%ROWTYPE;
  v_halaqah public.tahfidz_halaqahs%ROWTYPE;
  v_halaqah_id UUID;
BEGIN
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  v_schedule := NULLIF(btrim(COALESCE(p_schedule_text, '')), '');
  v_room := NULLIF(btrim(COALESCE(p_room_text, '')), '');
  v_status := lower(btrim(COALESCE(p_status, '')));
  IF p_tenant_id IS NULL OR p_created_by_user_id IS NULL OR p_client_request_id IS NULL
    OR v_name IS NULL OR length(v_name) > 120
    OR length(COALESCE(p_schedule_text, '')) > 500
    OR length(COALESCE(p_room_text, '')) > 180
    OR p_daily_target_pages IS NULL OR p_daily_target_pages < 0 OR p_daily_target_pages > 100
    OR p_daily_target_pages <> round(p_daily_target_pages, 2)
    OR v_status NOT IN ('active', 'inactive', 'archived')
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Data halaqah Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_halaqah_id IS NOT NULL AND p_halaqah_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION 'ID halaqah tidak valid' USING ERRCODE = '22023';
  END IF;
  IF v_status = 'active' AND p_ustadz_user_id IS NULL THEN
    RAISE EXCEPTION 'Halaqah aktif harus memiliki Ustadz pengampu' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(role::text))
  INTO v_actor_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_created_by_user_id AND status = 'active';
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'super_admin')
    OR v_actor_role <> lower(p_expected_role) THEN
    RAISE EXCEPTION 'Role akun tidak sesuai dengan profil Supabase aktif' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tahfidz-halaqah:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing
  FROM public.tahfidz_halaqah_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.created_by_user_id IS DISTINCT FROM p_created_by_user_id
      OR v_existing.requested_halaqah_id IS DISTINCT FROM p_halaqah_id
      OR v_existing.name IS DISTINCT FROM v_name
      OR v_existing.ustadz_user_id IS DISTINCT FROM p_ustadz_user_id
      OR v_existing.schedule_text IS DISTINCT FROM v_schedule
      OR v_existing.room_text IS DISTINCT FROM v_room
      OR v_existing.daily_target_pages IS DISTINCT FROM p_daily_target_pages
      OR v_existing.status IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'Kunci permintaan halaqah telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'halaqahId', v_existing.halaqah_id);
  END IF;

  IF p_ustadz_user_id IS NOT NULL THEN
    SELECT display_name INTO v_ustadz_name
    FROM public.profiles
    WHERE tenant_id = p_tenant_id
      AND user_id = p_ustadz_user_id
      AND role = 'ustadz'
      AND status = 'active';
    IF v_ustadz_name IS NULL THEN
      RAISE EXCEPTION 'Ustadz pengampu tidak aktif atau berbeda tenant' USING ERRCODE = '23503';
    END IF;
  ELSE
    v_ustadz_name := 'Belum ditentukan';
  END IF;

  IF p_halaqah_id IS NULL THEN
    INSERT INTO public.tahfidz_halaqahs (
      tenant_id, name, ustadz_user_id, ustadz_name, schedule_text, room_text,
      daily_target_pages, status
    ) VALUES (
      p_tenant_id, v_name, p_ustadz_user_id, v_ustadz_name, v_schedule, v_room,
      p_daily_target_pages, v_status
    ) RETURNING id INTO v_halaqah_id;
  ELSE
    SELECT * INTO v_halaqah
    FROM public.tahfidz_halaqahs
    WHERE tenant_id = p_tenant_id AND id = p_halaqah_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Halaqah tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_status <> 'active' AND EXISTS (
      SELECT 1 FROM public.tahfidz_memberships
      WHERE tenant_id = p_tenant_id AND halaqah_id = p_halaqah_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'Pindahkan santri aktif sebelum menonaktifkan atau mengarsipkan halaqah' USING ERRCODE = '23514';
    END IF;
    UPDATE public.tahfidz_halaqahs
    SET name = v_name,
        ustadz_user_id = p_ustadz_user_id,
        ustadz_name = v_ustadz_name,
        schedule_text = v_schedule,
        room_text = v_room,
        daily_target_pages = p_daily_target_pages,
        status = v_status
    WHERE tenant_id = p_tenant_id AND id = p_halaqah_id
    RETURNING id INTO v_halaqah_id;
  END IF;

  INSERT INTO public.tahfidz_halaqah_write_requests (
    tenant_id, client_request_id, created_by_user_id, requested_halaqah_id,
    halaqah_id, name, ustadz_user_id, ustadz_name, schedule_text, room_text,
    daily_target_pages, status
  ) VALUES (
    p_tenant_id, p_client_request_id, p_created_by_user_id, p_halaqah_id,
    v_halaqah_id, v_name, p_ustadz_user_id, v_ustadz_name, v_schedule, v_room,
    p_daily_target_pages, v_status
  );

  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'halaqahId', v_halaqah_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_tahfidz_membership(
  p_tenant_id UUID,
  p_student_id UUID,
  p_halaqah_id UUID,
  p_starts_on DATE,
  p_created_by_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_student_status TEXT;
  v_halaqah_status TEXT;
  v_latest_start DATE;
  v_existing public.tahfidz_memberships%ROWTYPE;
  v_request public.tahfidz_membership_write_requests%ROWTYPE;
  v_membership_id UUID;
  v_already_assigned BOOLEAN := false;
BEGIN
  IF p_tenant_id IS NULL OR p_student_id IS NULL OR p_halaqah_id IS NULL
    OR p_starts_on IS NULL OR p_created_by_user_id IS NULL OR p_client_request_id IS NULL
    OR lower(COALESCE(p_expected_role, '')) NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Data penempatan santri Tahfidz tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT lower(btrim(role::text)) INTO v_role
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_created_by_user_id AND status = 'active';
  IF v_role IS NULL OR v_role NOT IN ('admin', 'super_admin') OR v_role <> lower(p_expected_role) THEN
    RAISE EXCEPTION 'Role akun tidak sesuai dengan profil Supabase aktif' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tahfidz-membership:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_request
  FROM public.tahfidz_membership_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.created_by_user_id IS DISTINCT FROM p_created_by_user_id
      OR v_request.student_id IS DISTINCT FROM p_student_id
      OR v_request.halaqah_id IS DISTINCT FROM p_halaqah_id
      OR v_request.starts_on IS DISTINCT FROM p_starts_on THEN
      RAISE EXCEPTION 'Kunci permintaan penempatan telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('success', true, 'alreadyApplied', true, 'alreadyAssigned', v_request.already_assigned, 'membershipId', v_request.membership_id);
  END IF;

  IF p_starts_on > CURRENT_DATE THEN
    RAISE EXCEPTION 'Tanggal penempatan tidak boleh berada di masa depan' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_student_status
  FROM public.students
  WHERE tenant_id = p_tenant_id AND id = p_student_id
  FOR UPDATE;
  IF NOT FOUND OR lower(COALESCE(v_student_status, '')) IN ('archived', 'inactive', 'nonaktif', 'tidak aktif') THEN
    RAISE EXCEPTION 'Santri tidak aktif atau tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  SELECT status INTO v_halaqah_status
  FROM public.tahfidz_halaqahs
  WHERE tenant_id = p_tenant_id AND id = p_halaqah_id
  FOR UPDATE;
  IF NOT FOUND OR v_halaqah_status <> 'active' THEN
    RAISE EXCEPTION 'Halaqah aktif tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_existing
  FROM public.tahfidz_memberships
  WHERE tenant_id = p_tenant_id AND student_id = p_student_id AND status = 'active'
  FOR UPDATE;

  IF FOUND AND v_existing.halaqah_id = p_halaqah_id THEN
    v_membership_id := v_existing.id;
    v_already_assigned := true;
  ELSIF FOUND AND p_starts_on < v_existing.starts_on THEN
    RAISE EXCEPTION 'Tanggal penempatan tidak boleh mundur dari riwayat aktif' USING ERRCODE = '23514';
  ELSIF FOUND AND p_starts_on = v_existing.starts_on THEN
    UPDATE public.tahfidz_memberships
    SET halaqah_id = p_halaqah_id
    WHERE tenant_id = p_tenant_id AND id = v_existing.id;
    v_membership_id := v_existing.id;
  ELSIF FOUND THEN
    UPDATE public.tahfidz_memberships
    SET status = 'ended', ends_on = p_starts_on - 1
    WHERE tenant_id = p_tenant_id AND id = v_existing.id;
  ELSE
    SELECT max(starts_on) INTO v_latest_start
    FROM public.tahfidz_memberships
    WHERE tenant_id = p_tenant_id AND student_id = p_student_id;
    IF v_latest_start IS NOT NULL AND p_starts_on < v_latest_start THEN
      RAISE EXCEPTION 'Tanggal penempatan tidak boleh mendahului riwayat halaqah' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NOT v_already_assigned AND EXISTS (
    SELECT 1
    FROM public.tahfidz_memberships
    WHERE tenant_id = p_tenant_id
      AND student_id = p_student_id
      AND (ends_on IS NULL OR ends_on >= p_starts_on)
      AND (v_membership_id IS NULL OR id <> v_membership_id)
  ) THEN
    RAISE EXCEPTION 'Santri memiliki penempatan aktif lain pada tanggal tersebut' USING ERRCODE = '23514';
  END IF;

  IF v_membership_id IS NULL OR NOT v_already_assigned THEN
    IF v_membership_id IS NULL THEN
      INSERT INTO public.tahfidz_memberships (tenant_id, halaqah_id, student_id, starts_on, status)
      VALUES (p_tenant_id, p_halaqah_id, p_student_id, p_starts_on, 'active')
      RETURNING id INTO v_membership_id;
    END IF;
  END IF;

  INSERT INTO public.tahfidz_membership_write_requests (
    tenant_id, client_request_id, created_by_user_id, student_id, halaqah_id,
    starts_on, membership_id, already_assigned
  ) VALUES (
    p_tenant_id, p_client_request_id, p_created_by_user_id, p_student_id, p_halaqah_id,
    p_starts_on, v_membership_id, v_already_assigned
  );
  RETURN jsonb_build_object('success', true, 'alreadyApplied', false, 'alreadyAssigned', v_already_assigned, 'membershipId', v_membership_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_tahfidz_halaqah(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_tahfidz_halaqah(
  UUID, UUID, TEXT, UUID, TEXT, TEXT, NUMERIC, TEXT, UUID, TEXT, UUID
) TO service_role;

REVOKE ALL ON FUNCTION public.assign_tahfidz_membership(
  UUID, UUID, UUID, DATE, UUID, TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tahfidz_membership(
  UUID, UUID, UUID, DATE, UUID, TEXT, UUID
) TO service_role;

COMMENT ON TABLE public.tahfidz_halaqah_write_requests IS
  'Private audit and retry ledger for Admin-managed Tahfidz halaqah writes.';
COMMENT ON TABLE public.tahfidz_membership_write_requests IS
  'Private audit and retry ledger for transactional Tahfidz student placement changes.';

COMMIT;
