-- Import the single mapped Firestore CBT configuration without overwriting tenant runtime settings.
BEGIN;

CREATE TABLE public.cbt_tenant_settings (
  tenant_id UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE RESTRICT,
  subjects TEXT[] NOT NULL DEFAULT '{}',
  grades TEXT[] NOT NULL DEFAULT '{}',
  templates TEXT[] NOT NULL DEFAULT '{}',
  auto_grading BOOLEAN NOT NULL DEFAULT true,
  shuffle_questions BOOLEAN NOT NULL DEFAULT false,
  correct_points NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (correct_points BETWEEN 0 AND 100),
  wrong_points NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (wrong_points BETWEEN -100 AND 100),
  blank_points NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (blank_points BETWEEN -100 AND 100),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime'
    CHECK (source_system IN ('supabase_runtime', 'legacy_firestore')),
  source_record_id TEXT,
  source_fingerprint TEXT,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system = 'legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL)
      OR (source_system = 'supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL)),
  CHECK (source_record_id IS NULL OR length(btrim(source_record_id)) BETWEEN 1 AND 300),
  CHECK (source_fingerprint IS NULL OR source_fingerprint ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.cbt_tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cbt_tenant_settings FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cbt_tenant_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cbt_tenant_settings TO service_role;

CREATE OR REPLACE FUNCTION public.import_legacy_cbt_settings(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_source_record_id TEXT,
  p_source_fingerprint TEXT,
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.cbt_tenant_settings%ROWTYPE;
  v_role TEXT;
  v_field TEXT;
  v_values JSONB;
  v_item JSONB;
  -- Keep unrestricted precision until scale/range checks complete; constrained
  -- NUMERIC(6,2) would round before we can reject over-precise source values.
  v_correct_points NUMERIC;
  v_wrong_points NUMERIC;
  v_blank_points NUMERIC;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
    OR p_source_record_id IS NULL OR length(btrim(p_source_record_id)) NOT BETWEEN 1 AND 300
    OR p_source_fingerprint IS NULL OR p_source_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
    OR pg_column_size(p_settings) > 65536 THEN
    RAISE EXCEPTION 'Pengaturan CBT lama tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT (p_settings ?& ARRAY['subjects','grades','templates','autoGrading','shuffleQuestions','correctScore','wrongScore','blankScore'])
    OR (p_settings - ARRAY['subjects','grades','templates','autoGrading','shuffleQuestions','correctScore','wrongScore','blankScore']::TEXT[]) <> '{}'::JSONB THEN
    RAISE EXCEPTION 'Field pengaturan CBT tidak sesuai kontrak' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(p_settings->'autoGrading') IS DISTINCT FROM 'boolean'
    OR (p_settings->>'autoGrading') IS DISTINCT FROM 'true'
    OR jsonb_typeof(p_settings->'shuffleQuestions') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Kebijakan penilaian manual belum didukung oleh runtime CBT Supabase' USING ERRCODE = '22023';
  END IF;

  FOREACH v_field IN ARRAY ARRAY['subjects','grades','templates'] LOOP
    v_values := p_settings->v_field;
    IF jsonb_typeof(v_values) IS DISTINCT FROM 'array' OR jsonb_array_length(v_values) > 100 THEN
      RAISE EXCEPTION 'Daftar % CBT tidak valid atau melebihi batas 100 item', v_field USING ERRCODE = '22023';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_values)
    LOOP
      IF jsonb_typeof(v_item) IS DISTINCT FROM 'string'
        OR length(btrim(v_item #>> '{}')) NOT BETWEEN 1
          AND CASE v_field WHEN 'subjects' THEN 150 WHEN 'grades' THEN 40 ELSE 80 END THEN
        RAISE EXCEPTION 'Item daftar % CBT tidak valid', v_field USING ERRCODE = '22023';
      END IF;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_values) AS list_item(value)
      GROUP BY lower(btrim(list_item.value #>> '{}')) HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Daftar % CBT berisi nilai duplikat', v_field USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF jsonb_typeof(p_settings->'correctScore') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_settings->'wrongScore') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_settings->'blankScore') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Nilai aturan CBT harus berbentuk angka' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_correct_points := (p_settings->>'correctScore')::NUMERIC;
    v_wrong_points := (p_settings->>'wrongScore')::NUMERIC;
    v_blank_points := (p_settings->>'blankScore')::NUMERIC;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Nilai aturan CBT tidak valid' USING ERRCODE = '22023';
  END;
  IF v_correct_points NOT BETWEEN 0 AND 100 OR v_wrong_points NOT BETWEEN -100 AND 100
    OR v_blank_points NOT BETWEEN -100 AND 100 OR scale(v_correct_points) > 2
    OR scale(v_wrong_points) > 2 OR scale(v_blank_points) > 2 THEN
    RAISE EXCEPTION 'Nilai aturan CBT berada di luar batas yang didukung' USING ERRCODE = '22023';
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
    RAISE EXCEPTION 'Impor pengaturan CBT memerlukan Admin tenant yang berwenang' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cbt-settings:' || p_tenant_id::TEXT, 0));
  SELECT * INTO v_existing FROM public.cbt_tenant_settings WHERE tenant_id = p_tenant_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.source_system = 'legacy_firestore'
      AND v_existing.source_record_id = btrim(p_source_record_id)
      AND v_existing.source_fingerprint = p_source_fingerprint THEN
      RETURN jsonb_build_object('imported', false, 'alreadyImported', true);
    END IF;
    RAISE EXCEPTION 'Pengaturan CBT Supabase sudah ada; rekonsiliasi manual diperlukan sebelum impor' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.cbt_tenant_settings (
    tenant_id, subjects, grades, templates, auto_grading, shuffle_questions,
    correct_points, wrong_points, blank_points, source_system,
    source_record_id, source_fingerprint, created_by, updated_by
  ) VALUES (
    p_tenant_id,
    ARRAY(SELECT jsonb_array_elements_text(p_settings->'subjects')),
    ARRAY(SELECT jsonb_array_elements_text(p_settings->'grades')),
    ARRAY(SELECT jsonb_array_elements_text(p_settings->'templates')),
    (p_settings->>'autoGrading')::BOOLEAN, (p_settings->>'shuffleQuestions')::BOOLEAN,
    v_correct_points, v_wrong_points, v_blank_points, 'legacy_firestore',
    btrim(p_source_record_id), p_source_fingerprint, p_actor_user_id, p_actor_user_id
  );
  RETURN jsonb_build_object('imported', true, 'alreadyImported', false);
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_cbt_settings(UUID, UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_cbt_settings(UUID, UUID, TEXT, TEXT, JSONB) TO service_role;

COMMENT ON TABLE public.cbt_tenant_settings IS
  'Tenant-scoped CBT defaults. Browser access is denied; the authenticated server API reads this row.';
COMMENT ON FUNCTION public.import_legacy_cbt_settings(UUID, UUID, TEXT, TEXT, JSONB) IS
  'Imports one reviewed, fingerprinted Firestore CBT configuration without overwriting settings already established in Supabase.';

COMMIT;
