-- Trusted, atomic bootstrap for a new tenant and its first Admin profile.
-- Authentication invitation is handled by the operator script; this RPC only
-- binds the Auth user to one active tenant and cannot be called by browser roles.

CREATE OR REPLACE FUNCTION public.provision_tenant_with_initial_admin(
  p_tenant_slug TEXT,
  p_tenant_name TEXT,
  p_tenant_type TEXT,
  p_time_zone TEXT,
  p_admin_user_id UUID,
  p_admin_email TEXT,
  p_admin_display_name TEXT,
  p_admin_username TEXT
)
RETURNS TABLE (
  tenant_id UUID,
  admin_user_id UUID,
  already_provisioned BOOLEAN
)
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_slug TEXT := lower(btrim(p_tenant_slug));
  v_name TEXT := btrim(p_tenant_name);
  v_tenant_type TEXT := NULLIF(btrim(COALESCE(p_tenant_type, '')), '');
  v_time_zone TEXT := btrim(p_time_zone);
  v_email TEXT := lower(btrim(p_admin_email));
  v_display_name TEXT := btrim(p_admin_display_name);
  v_username TEXT := btrim(p_admin_username);
  v_tenant_id UUID;
  v_tenant_name TEXT;
  v_existing_tenant_type TEXT;
  v_existing_time_zone TEXT;
  v_existing_profile public.profiles%ROWTYPE;
BEGIN
  IF v_slug !~ '^[a-z0-9-]{1,63}$' THEN
    RAISE EXCEPTION 'Tenant slug must use lowercase letters, numbers, and hyphens.'
      USING ERRCODE = '22023';
  END IF;
  IF length(v_name) < 2 OR length(v_name) > 200 THEN
    RAISE EXCEPTION 'Tenant name must contain between 2 and 200 characters.'
      USING ERRCODE = '22023';
  END IF;
  IF length(v_time_zone) < 1 OR length(v_time_zone) > 100
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_time_zone) THEN
    RAISE EXCEPTION 'Tenant time zone is not recognized.'
      USING ERRCODE = '22023';
  END IF;
  IF p_admin_user_id IS NULL
     OR length(v_email) > 320
     OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Initial Admin identity is invalid.'
      USING ERRCODE = '22023';
  END IF;
  IF length(v_display_name) < 2 OR length(v_display_name) > 160 THEN
    RAISE EXCEPTION 'Initial Admin name must contain between 2 and 160 characters.'
      USING ERRCODE = '22023';
  END IF;
  IF length(v_username) < 1 OR length(v_username) > 100 THEN
    RAISE EXCEPTION 'Initial Admin username must contain between 1 and 100 characters.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenants (slug, name, tenant_type, time_zone, status)
  VALUES (v_slug, v_name, v_tenant_type, v_time_zone, 'active')
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    SELECT tenant.id, tenant.name, tenant.tenant_type, tenant.time_zone
    INTO v_tenant_id, v_tenant_name, v_existing_tenant_type, v_existing_time_zone
    FROM public.tenants AS tenant
    WHERE tenant.slug = v_slug
    FOR UPDATE;

    IF v_tenant_id IS NULL THEN
      RAISE EXCEPTION 'Tenant could not be created or located.'
        USING ERRCODE = '40001';
    END IF;
    IF v_tenant_name IS DISTINCT FROM v_name
       OR v_existing_tenant_type IS DISTINCT FROM v_tenant_type
       OR v_existing_time_zone IS DISTINCT FROM v_time_zone THEN
      RAISE EXCEPTION 'Tenant slug already exists with different settings.'
        USING ERRCODE = '23505';
    END IF;

    SELECT profile.* INTO v_existing_profile
    FROM public.profiles AS profile
    WHERE profile.tenant_id = v_tenant_id
      AND profile.user_id = p_admin_user_id
    FOR UPDATE;

    IF FOUND THEN
      IF v_existing_profile.role = 'admin'
         AND v_existing_profile.status = 'active'
         AND v_existing_profile.email = v_email
         AND v_existing_profile.display_name = v_display_name
         AND v_existing_profile.username = v_username THEN
        RETURN QUERY SELECT v_tenant_id, p_admin_user_id, TRUE;
        RETURN;
      END IF;
      RAISE EXCEPTION 'Existing profile does not match the requested initial Admin.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.profiles AS profile
      WHERE profile.tenant_id = v_tenant_id
    ) THEN
      RAISE EXCEPTION 'Tenant already contains a profile; initial Admin bootstrap is closed.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.user_id = p_admin_user_id
  ) THEN
    RAISE EXCEPTION 'Initial Admin is already assigned to another tenant.'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.profiles (
    user_id,
    tenant_id,
    email,
    display_name,
    username,
    role,
    status,
    must_change_password,
    module_permissions
  ) VALUES (
    p_admin_user_id,
    v_tenant_id,
    v_email,
    v_display_name,
    v_username,
    'admin',
    'active',
    FALSE,
    '{}'::jsonb
  );

  RETURN QUERY SELECT v_tenant_id, p_admin_user_id, FALSE;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_tenant_with_initial_admin(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_tenant_with_initial_admin(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.provision_tenant_with_initial_admin(
  TEXT, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT
) IS
  'Atomically creates an active tenant and its first Admin profile. Browser roles cannot execute it; the operator invitation script supplies a Supabase Auth user ID.';
