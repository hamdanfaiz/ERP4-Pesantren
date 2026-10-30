-- Tenant-owned unit registry. This is a registry foundation only: module data
-- is not unit-scoped until each domain adds and verifies its own unit contract.
BEGIN;

CREATE TABLE public.organization_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  code TEXT NOT NULL CHECK (
    code = upper(btrim(code))
    AND code ~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
  ),
  name TEXT NOT NULL CHECK (
    length(btrim(name)) BETWEEN 2 AND 120
    AND name !~ '[[:cntrl:]]'
  ),
  unit_type TEXT NOT NULL CHECK (
    unit_type IN ('pesantren', 'sekolah', 'klinik', 'usaha', 'yayasan', 'lainnya')
  ),
  location TEXT NOT NULL DEFAULT '' CHECK (
    length(location) <= 240
    AND location !~ '[[:cntrl:]]'
  ),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX organization_units_tenant_code_uidx
  ON public.organization_units (tenant_id, lower(btrim(code)));
CREATE INDEX organization_units_tenant_status_name_idx
  ON public.organization_units (tenant_id, status, lower(name), id);

CREATE TABLE public.organization_unit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  unit_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'set_status')),
  before_state JSONB,
  after_state JSONB NOT NULL CHECK (jsonb_typeof(after_state) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES public.organization_units(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX organization_unit_events_tenant_created_idx
  ON public.organization_unit_events (tenant_id, created_at DESC, id DESC);

CREATE TABLE public.organization_unit_mutation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'set_status')),
  unit_id UUID,
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES public.organization_units(tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.organization_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_units FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_unit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_unit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organization_unit_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_unit_mutation_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_units, public.organization_unit_events,
  public.organization_unit_mutation_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_units TO service_role;
GRANT SELECT, INSERT ON TABLE public.organization_unit_events TO service_role;
GRANT SELECT, INSERT ON TABLE public.organization_unit_mutation_requests TO service_role;

CREATE OR REPLACE FUNCTION public.get_tenant_enterprise_units_snapshot(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_units JSONB;
  v_events JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_expected_role IS NULL
    OR p_expected_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Akun tidak dapat mengelola unit tenant' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.tenants AS t
  WHERE t.id = p_tenant_id AND lower(btrim(t.status)) = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant aktif tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  SELECT lower(btrim(p.role::text)), p.module_permissions
    INTO v_role, v_permissions
  FROM public.profiles AS p
  WHERE p.tenant_id = p_tenant_id
    AND p.user_id = p_actor_user_id
    AND p.status = 'active'
    AND p.role IN ('admin', 'super_admin')
  FOR SHARE;
  IF NOT FOUND OR v_role IS DISTINCT FROM p_expected_role
    OR (v_role <> 'super_admin' AND v_permissions ? 'enterprise'
      AND NOT (jsonb_typeof(v_permissions -> 'enterprise') = 'boolean'
        AND v_permissions ->> 'enterprise' = 'true')) THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Manajemen Multi-Unit pada tenant ini'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'code', u.code,
      'name', u.name,
      'unitType', u.unit_type,
      'location', u.location,
      'status', u.status,
      'createdByUserId', u.created_by_user_id,
      'updatedByUserId', u.updated_by_user_id,
      'createdAt', u.created_at,
      'updatedAt', u.updated_at
    ) ORDER BY lower(u.name), u.code, u.id
  ), '[]'::jsonb)
  INTO v_units
  FROM public.organization_units AS u
  WHERE u.tenant_id = p_tenant_id;

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC, id DESC), '[]'::jsonb)
    INTO v_events
  FROM (
    SELECT e.id, e.created_at, jsonb_build_object(
      'id', e.id,
      'unitId', e.unit_id,
      'actorUserId', e.actor_user_id,
      'action', e.action,
      'before', e.before_state,
      'after', e.after_state,
      'createdAt', e.created_at
    ) AS item
    FROM public.organization_unit_events AS e
    WHERE e.tenant_id = p_tenant_id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT 100
  ) AS recent;

  RETURN jsonb_build_object('success', true, 'units', v_units, 'events', v_events);
END;
$$;

CREATE OR REPLACE FUNCTION public.manage_tenant_enterprise_unit(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_action TEXT,
  p_unit_id UUID,
  p_payload JSONB,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
  v_unit public.organization_units%ROWTYPE;
  v_before JSONB;
  v_after JSONB;
  v_payload JSONB;
  v_result JSONB;
  v_existing public.organization_unit_mutation_requests%ROWTYPE;
  v_code TEXT;
  v_name TEXT;
  v_type TEXT;
  v_location TEXT;
  v_status TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_action IS NULL OR p_action NOT IN ('create', 'update', 'set_status')
    OR p_payload IS NULL THEN
    RAISE EXCEPTION 'Permintaan unit tidak valid' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'Permintaan unit harus berupa objek' USING ERRCODE = '22023';
  END IF;
  IF (p_action = 'create' AND p_unit_id IS NOT NULL)
    OR (p_action <> 'create' AND p_unit_id IS NULL) THEN
    RAISE EXCEPTION 'ID unit tidak cocok dengan tindakan yang diminta' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) AS field
    WHERE field NOT IN ('code', 'name', 'unitType', 'location', 'status')
  ) THEN
    RAISE EXCEPTION 'Permintaan unit berisi kolom yang tidak didukung' USING ERRCODE = '22023';
  END IF;

  SELECT lower(btrim(p.role::text)), p.module_permissions
    INTO v_role, v_permissions
  FROM public.profiles AS p
  JOIN public.tenants AS t ON t.id = p.tenant_id AND t.status = 'active'
  WHERE p.tenant_id = p_tenant_id
    AND p.user_id = p_actor_user_id
    AND p.status = 'active'
    AND p.role IN ('admin', 'super_admin')
  FOR SHARE OF p, t;
  IF NOT FOUND OR v_role IS DISTINCT FROM p_expected_role
    OR (v_role <> 'super_admin' AND v_permissions ? 'enterprise'
      AND NOT (jsonb_typeof(v_permissions -> 'enterprise') = 'boolean'
        AND v_permissions ->> 'enterprise' = 'true')) THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Manajemen Multi-Unit pada tenant ini'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_client_request_id::text, 0));
  SELECT * INTO v_existing
  FROM public.organization_unit_mutation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id = p_actor_user_id
      AND v_existing.action = p_action
      -- Create requests persist the generated unit ID, while the retry correctly sends no unit ID.
      AND (p_action = 'create' OR v_existing.unit_id IS NOT DISTINCT FROM p_unit_id)
      AND v_existing.request_payload = p_payload THEN
      RETURN v_existing.result || jsonb_build_object('alreadyApplied', true);
    END IF;
    RAISE EXCEPTION 'Kunci permintaan unit telah dipakai untuk data berbeda' USING ERRCODE = '23505';
  END IF;

  IF p_action IN ('create', 'update') THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_payload) AS field
      WHERE field NOT IN ('code', 'name', 'unitType', 'location')
    ) OR NOT (p_payload ?& ARRAY['code', 'name', 'unitType', 'location']) THEN
      RAISE EXCEPTION 'Kode, nama, jenis, dan lokasi unit wajib diisi' USING ERRCODE = '22023';
    END IF;
    v_code := upper(btrim(p_payload ->> 'code'));
    v_name := btrim(p_payload ->> 'name');
    v_type := lower(btrim(p_payload ->> 'unitType'));
    v_location := btrim(p_payload ->> 'location');
    IF v_code IS NULL OR v_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$'
      OR v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 120 OR v_name ~ '[[:cntrl:]]'
      OR v_type IS NULL OR v_type NOT IN ('pesantren', 'sekolah', 'klinik', 'usaha', 'yayasan', 'lainnya')
      OR v_location IS NULL OR length(v_location) > 240 OR v_location ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'Data unit tidak valid' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object('code', v_code, 'name', v_name, 'unitType', v_type, 'location', v_location);
  ELSE
    IF NOT (p_payload ? 'status') OR (p_payload - 'status') <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Status unit tidak valid' USING ERRCODE = '22023';
    END IF;
    v_status := lower(btrim(p_payload ->> 'status'));
    IF v_status IS NULL OR v_status NOT IN ('active', 'inactive') THEN
      RAISE EXCEPTION 'Status unit tidak valid' USING ERRCODE = '22023';
    END IF;
    v_payload := jsonb_build_object('status', v_status);
  END IF;

  IF p_action = 'create' THEN
    INSERT INTO public.organization_units (
      tenant_id, code, name, unit_type, location, created_by_user_id, updated_by_user_id
    ) VALUES (
      p_tenant_id, v_code, v_name, v_type, v_location, p_actor_user_id, p_actor_user_id
    ) RETURNING * INTO v_unit;
  ELSE
    SELECT * INTO v_unit
    FROM public.organization_units
    WHERE tenant_id = p_tenant_id AND id = p_unit_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Unit tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    v_before := to_jsonb(v_unit);
    IF p_action = 'update' THEN
      UPDATE public.organization_units
      SET code = v_code,
          name = v_name,
          unit_type = v_type,
          location = v_location,
          updated_by_user_id = p_actor_user_id,
          updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = p_unit_id
      RETURNING * INTO v_unit;
    ELSE
      UPDATE public.organization_units
      SET status = v_status,
          updated_by_user_id = p_actor_user_id,
          updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = p_unit_id
      RETURNING * INTO v_unit;
    END IF;
  END IF;

  v_after := to_jsonb(v_unit);
  INSERT INTO public.organization_unit_events (
    tenant_id, unit_id, actor_user_id, action, before_state, after_state
  ) VALUES (
    p_tenant_id, v_unit.id, p_actor_user_id, p_action, v_before, v_after
  );
  v_result := jsonb_build_object(
    'success', true,
    'alreadyApplied', false,
    'unit', jsonb_build_object(
      'id', v_unit.id,
      'code', v_unit.code,
      'name', v_unit.name,
      'unitType', v_unit.unit_type,
      'location', v_unit.location,
      'status', v_unit.status,
      'createdByUserId', v_unit.created_by_user_id,
      'updatedByUserId', v_unit.updated_by_user_id,
      'createdAt', v_unit.created_at,
      'updatedAt', v_unit.updated_at
    )
  );
  INSERT INTO public.organization_unit_mutation_requests (
    tenant_id, client_request_id, actor_user_id, action, unit_id, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, p_action, v_unit.id, v_payload, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tenant_enterprise_units_snapshot(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_enterprise_units_snapshot(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.manage_tenant_enterprise_unit(UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_tenant_enterprise_unit(UUID, UUID, TEXT, TEXT, UUID, JSONB, UUID)
  TO service_role;

COMMENT ON TABLE public.organization_units IS
  'Tenant-owned organization unit registry. Unit-level data access remains disabled until each domain implements its unit scope.';
COMMENT ON TABLE public.organization_unit_events IS
  'Append-only audit events for changes to tenant organization units.';
COMMENT ON TABLE public.organization_unit_mutation_requests IS
  'Append-only request ledger that makes organization unit mutations safe to retry.';

COMMIT;
