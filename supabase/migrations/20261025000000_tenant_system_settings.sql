-- Tenant system settings move from tenants/{tenant}/settings/global in Firestore.
-- Browser users access this data only through the authenticated application API.
BEGIN;

CREATE TABLE public.tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  legacy_source_fingerprint TEXT CHECK (
    legacy_source_fingerprint IS NULL OR legacy_source_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  legacy_imported_at TIMESTAMPTZ,
  updated_by_user_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((legacy_source_fingerprint IS NULL) = (legacy_imported_at IS NULL))
);

CREATE OR REPLACE FUNCTION public.import_legacy_tenant_settings(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_source_fingerprint TEXT,
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.tenant_settings%ROWTYPE;
  v_time_zone TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_source_fingerprint IS NULL OR p_source_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
    OR pg_column_size(p_settings) > 131072 THEN
    RAISE EXCEPTION 'Snapshot pengaturan tenant tidak valid' USING ERRCODE = '22023';
  END IF;
  v_time_zone := COALESCE(NULLIF(btrim(p_settings #>> '{generalSettings,timezone}'), ''), 'Asia/Jakarta');
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_time_zone) THEN
    RAISE EXCEPTION 'Zona waktu tenant tidak dikenal' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
      AND status = 'active' AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Aktor impor bukan SuperAdmin tenant aktif' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tenant-settings:' || p_tenant_id::text, 0
  ));
  SELECT * INTO v_existing
  FROM public.tenant_settings
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.legacy_source_fingerprint = p_source_fingerprint THEN
      RETURN jsonb_build_object('success', true, 'alreadyImported', true);
    END IF;
    RAISE EXCEPTION 'Pengaturan sudah memiliki data Supabase; rekonsiliasi manual diperlukan sebelum impor' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.tenant_settings (
    tenant_id, settings, legacy_source_fingerprint, legacy_imported_at,
    updated_by_user_id, updated_at
  ) VALUES (
    p_tenant_id, p_settings, p_source_fingerprint, now(), p_actor_user_id, now()
  );
  UPDATE public.tenants SET time_zone = v_time_zone WHERE id = p_tenant_id;
  RETURN jsonb_build_object('success', true, 'alreadyImported', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_tenant_system_settings(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_updated_at TIMESTAMPTZ,
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.tenant_settings%ROWTYPE;
  v_saved public.tenant_settings%ROWTYPE;
  v_time_zone TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
    OR pg_column_size(p_settings) > 131072 THEN
    RAISE EXCEPTION 'Pengaturan tenant tidak valid' USING ERRCODE = '22023';
  END IF;
  v_time_zone := COALESCE(NULLIF(btrim(p_settings #>> '{generalSettings,timezone}'), ''), 'Asia/Jakarta');
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_time_zone) THEN
    RAISE EXCEPTION 'Zona waktu tenant tidak dikenal' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
  ) OR NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
      AND status = 'active' AND role = 'super_admin'
  ) THEN
    RAISE EXCEPTION 'Aktor bukan SuperAdmin aktif pada tenant ini' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'tenant-settings:' || p_tenant_id::text, 0
  ));
  SELECT * INTO v_existing
  FROM public.tenant_settings
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;

  IF FOUND THEN
    IF p_expected_updated_at IS NULL
      OR v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Pengaturan diubah oleh Admin lain; muat ulang sebelum menyimpan' USING ERRCODE = '40001';
    END IF;
    UPDATE public.tenant_settings
    SET settings = p_settings,
        updated_by_user_id = p_actor_user_id,
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_saved;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE EXCEPTION 'Pengaturan berubah sejak dimuat; muat ulang sebelum menyimpan' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.tenant_settings (
      tenant_id, settings, updated_by_user_id, updated_at
    ) VALUES (
      p_tenant_id, p_settings, p_actor_user_id, clock_timestamp()
    ) RETURNING * INTO v_saved;
  END IF;

  UPDATE public.tenants SET time_zone = v_time_zone WHERE id = p_tenant_id;

  RETURN jsonb_build_object(
    'settings', v_saved.settings,
    'updatedAt', v_saved.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_tenant_settings(UUID, UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_tenant_settings(UUID, UUID, TEXT, JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION public.save_tenant_system_settings(UUID, UUID, TIMESTAMPTZ, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_tenant_system_settings(UUID, UUID, TIMESTAMPTZ, JSONB)
  TO service_role;

ALTER TABLE public.tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.tenant_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.tenant_settings TO service_role;

COMMENT ON TABLE public.tenant_settings IS
  'Tenant configuration without browser-readable integration secrets; read and write through the authenticated server API.';
COMMENT ON FUNCTION public.import_legacy_tenant_settings(UUID, UUID, TEXT, JSONB) IS
  'Idempotently imports one reviewed legacy tenant settings snapshot and refuses to overwrite existing Supabase settings.';
COMMENT ON FUNCTION public.save_tenant_system_settings(UUID, UUID, TIMESTAMPTZ, JSONB) IS
  'Saves tenant settings only when the caller supplies the version it last read, preventing concurrent administrators from silently overwriting each other.';

COMMIT;
