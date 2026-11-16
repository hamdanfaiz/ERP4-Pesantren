-- Persist validated CBT defaults through the authenticated tenant API only.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_cbt_tenant_settings(
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
  v_existing public.cbt_tenant_settings%ROWTYPE;
  v_saved public.cbt_tenant_settings%ROWTYPE;
  v_role TEXT;
  v_correct_points NUMERIC;
  v_wrong_points NUMERIC;
  v_blank_points NUMERIC;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
    OR pg_column_size(p_settings) > 8192
    OR NOT (p_settings ?& ARRAY['autoGrading','shuffleQuestions','correctPoints','wrongPoints','blankPoints'])
    OR (p_settings - ARRAY['autoGrading','shuffleQuestions','correctPoints','wrongPoints','blankPoints']::TEXT[]) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'Pengaturan CBT tidak sesuai format' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_settings->'autoGrading') IS DISTINCT FROM 'boolean'
    OR (p_settings->>'autoGrading') IS DISTINCT FROM 'true'
    OR jsonb_typeof(p_settings->'shuffleQuestions') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_settings->'correctPoints') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_settings->'wrongPoints') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_settings->'blankPoints') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Jenis nilai pengaturan CBT tidak valid atau kebijakan penilaian belum didukung' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_correct_points := (p_settings->>'correctPoints')::NUMERIC;
    v_wrong_points := (p_settings->>'wrongPoints')::NUMERIC;
    v_blank_points := (p_settings->>'blankPoints')::NUMERIC;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Nilai aturan CBT tidak valid' USING ERRCODE = '22023';
  END;
  IF v_correct_points NOT BETWEEN 0 AND 100
    OR v_wrong_points NOT BETWEEN -100 AND 100
    OR v_blank_points NOT BETWEEN -100 AND 100
    OR scale(v_correct_points) > 2 OR scale(v_wrong_points) > 2 OR scale(v_blank_points) > 2 THEN
    RAISE EXCEPTION 'Nilai aturan CBT harus berada pada rentang dan presisi yang didukung' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant CBT tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT role INTO v_role FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    AND role IN ('admin', 'super_admin')
    AND (NOT (module_permissions ? 'cbt') OR COALESCE(module_permissions->>'cbt', 'false') = 'true')
  FOR SHARE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Pengaturan CBT hanya dapat diubah Admin tenant yang berwenang' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cbt-settings:' || p_tenant_id::TEXT, 0));
  SELECT * INTO v_existing FROM public.cbt_tenant_settings WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pengaturan CBT berubah; muat ulang sebelum menyimpan';
    END IF;
    UPDATE public.cbt_tenant_settings
    SET auto_grading = true,
        shuffle_questions = (p_settings->>'shuffleQuestions')::BOOLEAN,
        correct_points = v_correct_points,
        wrong_points = v_wrong_points,
        blank_points = v_blank_points,
        source_system = 'supabase_runtime',
        source_record_id = NULL,
        source_fingerprint = NULL,
        updated_by = p_actor_user_id,
        updated_at = clock_timestamp()
    WHERE tenant_id = p_tenant_id
    RETURNING * INTO v_saved;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN
      RAISE SQLSTATE 'PT409' USING MESSAGE = 'Pengaturan CBT berubah sejak dimuat; muat ulang sebelum menyimpan';
    END IF;
    INSERT INTO public.cbt_tenant_settings (
      tenant_id, auto_grading, shuffle_questions, correct_points, wrong_points, blank_points,
      source_system, created_by, updated_by, updated_at
    ) VALUES (
      p_tenant_id, true, (p_settings->>'shuffleQuestions')::BOOLEAN, v_correct_points, v_wrong_points, v_blank_points,
      'supabase_runtime', p_actor_user_id, p_actor_user_id, clock_timestamp()
    ) RETURNING * INTO v_saved;
  END IF;

  RETURN jsonb_build_object('saved', true, 'updatedAt', v_saved.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.save_cbt_tenant_settings(UUID, UUID, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_cbt_tenant_settings(UUID, UUID, TIMESTAMPTZ, JSONB) TO service_role;

COMMENT ON FUNCTION public.save_cbt_tenant_settings(UUID, UUID, TIMESTAMPTZ, JSONB) IS
  'Saves CBT tenant defaults with strict admin/module checks, bounded scoring values, per-tenant serialization, and optimistic concurrency.';

COMMIT;
