-- Business-level stale-version conflicts are not PostgreSQL serialization failures.
-- PostgREST 14 retries SQLSTATE 40001 indefinitely; PT409 maps directly to HTTP 409.
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
      RAISE SQLSTATE 'PT409' USING MESSAGE =
        'Pengaturan diubah oleh Admin lain; muat ulang sebelum menyimpan';
    END IF;
    UPDATE public.tenant_settings
    SET settings = p_settings,
        updated_by_user_id = p_actor_user_id,
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_saved;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE =
        'Pengaturan berubah sejak dimuat; muat ulang sebelum menyimpan';
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

COMMENT ON FUNCTION public.save_tenant_system_settings(UUID, UUID, TIMESTAMPTZ, JSONB) IS
  'Saves tenant settings using optimistic concurrency; stale versions raise PT409 (HTTP 409) rather than retryable SQLSTATE 40001.';
