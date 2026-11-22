BEGIN;

-- Keep SQL-side permission fallbacks aligned with src/rbac.ts:
-- absent module keys inherit the role baseline; explicit false still denies.
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
  IF v_role <> 'super_admin' AND v_permissions ? 'boarding'
     AND (v_permissions -> 'boarding') IS DISTINCT FROM 'true'::jsonb THEN
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
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_tenant_boarding_location_unit(UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID)
  TO service_role;
COMMENT ON FUNCTION public.assign_tenant_boarding_location_unit(UUID, UUID, TEXT, TEXT, TEXT, UUID, UUID) IS
  'Admin-only, tenant-scoped, idempotent unit mapping for existing boarding buildings and rooms.';

CREATE OR REPLACE FUNCTION public.link_existing_guardian_account(
  p_tenant_id UUID,
  p_guardian_id UUID,
  p_user_id UUID,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_guardian public.guardians%ROWTYPE;
  v_child_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_guardian_id IS NULL OR p_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan akun Wali tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.tenant_id = p_tenant_id AND actor.user_id = p_actor_user_id
      AND actor.status = 'active' AND actor.role IN ('admin', 'super_admin')
      AND (
        actor.role = 'super_admin'
        OR CASE
          WHEN actor.module_permissions ? 'users' THEN
            jsonb_typeof(actor.module_permissions -> 'users') = 'boolean'
            AND actor.module_permissions ->> 'users' = 'true'
          ELSE actor.role = 'admin'
        END
      )
  ) THEN
    RAISE EXCEPTION 'Admin tenant tidak berwenang memetakan akun Wali' USING ERRCODE = '42501';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.user_id
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_user_id
    AND profile.role = 'wali_santri' AND profile.status = 'active'
    AND auth_user.email_confirmed_at IS NOT NULL
    AND lower(auth_user.email) = lower(profile.email)
  FOR UPDATE OF profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil Wali aktif dengan email terverifikasi tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_guardian
  FROM public.guardians
  WHERE tenant_id = p_tenant_id AND id = p_guardian_id
    AND lower(btrim(status)) IN ('active', 'aktif')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data Wali tidak aktif pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT student.id)::INTEGER INTO v_child_count
  FROM public.guardian_students relation
  JOIN public.students student
    ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
  WHERE relation.tenant_id = p_tenant_id AND relation.guardian_id = p_guardian_id
    AND lower(btrim(student.status)) IN ('active', 'aktif');
  IF v_child_count < 1 THEN
    RAISE EXCEPTION 'Wali belum terhubung ke santri aktif' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.guardian_user_accounts account
    WHERE account.tenant_id = p_tenant_id AND account.guardian_id = p_guardian_id
      AND (account.user_id <> p_user_id OR account.status <> 'active')
  ) THEN
    RAISE EXCEPTION 'Data Wali telah terhubung ke akun lain' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
  VALUES (p_tenant_id, p_guardian_id, p_user_id)
  ON CONFLICT (tenant_id, guardian_id) DO NOTHING;
  UPDATE public.guardian_account_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE tenant_id = p_tenant_id AND guardian_id = p_guardian_id AND status = 'pending';
  RETURN jsonb_build_object('success', true, 'linkedStudentCount', v_child_count);
END;
$$;

REVOKE ALL ON FUNCTION public.link_existing_guardian_account(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_existing_guardian_account(UUID, UUID, UUID, UUID)
  TO service_role;

COMMIT;
