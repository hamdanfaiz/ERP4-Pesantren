-- Let an Admin explicitly map legacy Academic classes to tenant-owned units.
-- Existing classes remain unmapped until the source is known and an Admin selects a unit.
BEGIN;

CREATE TABLE public.academic_class_unit_assignment_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  class_category TEXT NOT NULL DEFAULT 'Kelas' CHECK (class_category = 'Kelas'),
  class_id TEXT NOT NULL CHECK (length(btrim(class_id)) BETWEEN 1 AND 160),
  unit_id UUID NOT NULL,
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, class_category, class_id)
    REFERENCES public.master_data_records (tenant_id, category, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.academic_class_unit_assignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_class_unit_assignment_requests FORCE ROW LEVEL SECURITY;
CREATE INDEX academic_class_unit_assignment_actor_idx
  ON public.academic_class_unit_assignment_requests (tenant_id, actor_user_id, created_at DESC);
CREATE INDEX academic_class_unit_assignment_unit_idx
  ON public.academic_class_unit_assignment_requests (tenant_id, unit_id, created_at DESC);
REVOKE ALL ON TABLE public.academic_class_unit_assignment_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.academic_class_unit_assignment_requests TO service_role;

-- Once a class is mapped, changes must go through an explicit future correction flow.
CREATE TRIGGER master_data_records_prevent_unit_reassignment
  BEFORE UPDATE OF organization_unit_id ON public.master_data_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_master_data_unit_reassignment();

CREATE OR REPLACE FUNCTION public.assign_tenant_academic_class_unit(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_class_id TEXT,
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
  v_class public.master_data_records%ROWTYPE;
  v_request public.academic_class_unit_assignment_requests%ROWTYPE;
  v_class_id TEXT;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  v_class_id := btrim(COALESCE(p_class_id, ''));
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_unit_id IS NULL
     OR p_client_request_id IS NULL OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
     OR v_class_id = '' OR length(v_class_id) > 160 OR v_class_id ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'Permintaan pemetaan kelas akademik tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin' AND v_permissions ? 'academic'
     AND NOT (jsonb_typeof(v_permissions -> 'academic') = 'boolean'
       AND v_permissions ->> 'academic' = 'true') THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Akademik pada tenant ini' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object('classId', v_class_id, 'unitId', p_unit_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('academic-class-unit-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.academic_class_unit_assignment_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.class_id IS DISTINCT FROM v_class_id
       OR v_request.unit_id IS DISTINCT FROM p_unit_id
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan pemetaan kelas telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;

  SELECT u.status INTO v_unit_status
  FROM public.organization_units AS u
  WHERE u.tenant_id = p_tenant_id AND u.id = p_unit_id
  FOR SHARE;
  IF NOT FOUND OR v_unit_status <> 'active' THEN
    RAISE EXCEPTION 'Unit aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_class
  FROM public.master_data_records
  WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = v_class_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Kelas tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_class.organization_unit_id IS NOT NULL
     AND v_class.organization_unit_id IS DISTINCT FROM p_unit_id THEN
    RAISE EXCEPTION 'Unit kelas sudah ditetapkan dan tidak dapat dipindahkan melalui pemetaan biasa' USING ERRCODE = '23514';
  END IF;

  IF v_class.organization_unit_id IS NULL THEN
    UPDATE public.master_data_records
    SET organization_unit_id = p_unit_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND category = 'Kelas' AND id = v_class_id
      AND organization_unit_id IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Kelas berubah saat pemetaan; muat ulang dan coba kembali' USING ERRCODE = '40001';
    END IF;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'classId', v_class_id,
    'unitId', p_unit_id,
    'alreadyApplied', false
  );
  INSERT INTO public.academic_class_unit_assignment_requests (
    tenant_id, client_request_id, actor_user_id, class_id, unit_id,
    request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, v_class_id, p_unit_id,
    v_payload, v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_unmapped_academic_classes(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
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
  v_classes JSONB;
  v_count BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Permintaan daftar kelas tanpa unit tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin' AND v_permissions ? 'academic'
     AND NOT (jsonb_typeof(v_permissions -> 'academic') = 'boolean'
       AND v_permissions ->> 'academic' = 'true') THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Akademik pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.master_data_records AS m
  WHERE m.tenant_id = p_tenant_id AND m.category = 'Kelas'
    AND m.organization_unit_id IS NULL;
  SELECT COALESCE(jsonb_agg(item ORDER BY lower(name), id), '[]'::jsonb)
    INTO v_classes
  FROM (
    SELECT m.id, m.name, m.status,
      jsonb_build_object('id', m.id, 'name', m.name, 'status', m.status) AS item
    FROM public.master_data_records AS m
    WHERE m.tenant_id = p_tenant_id AND m.category = 'Kelas'
      AND m.organization_unit_id IS NULL
    ORDER BY lower(m.name), m.id
    LIMIT p_limit OFFSET p_offset
  ) AS pending_classes;

  RETURN jsonb_build_object(
    'success', true,
    'classes', v_classes,
    'classCount', v_count,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_tenant_academic_class_unit(UUID, UUID, TEXT, TEXT, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tenant_academic_class_unit(UUID, UUID, TEXT, TEXT, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_tenant_unmapped_academic_classes(UUID, UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_unmapped_academic_classes(UUID, UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON TABLE public.academic_class_unit_assignment_requests IS
  'Immutable idempotency and audit records for Admin mapping of tenant classes to organization units.';
COMMENT ON FUNCTION public.assign_tenant_academic_class_unit(UUID, UUID, TEXT, TEXT, UUID, UUID) IS
  'One-time Admin mapping of an existing tenant class to an active tenant unit; rejects cross-tenant and conflicting reassignment.';
COMMENT ON FUNCTION public.get_tenant_unmapped_academic_classes(UUID, UUID, TEXT, INTEGER, INTEGER) IS
  'Paginated queue of tenant classes that still need explicit organization-unit mapping.';

COMMIT;
