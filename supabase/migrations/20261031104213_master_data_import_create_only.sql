-- Create-only RPCs for manual Master Data imports.
-- Imports must never mutate existing tenant records through a CSV race.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_master_data_structure_if_absent(
  p_tenant_id UUID,
  p_category TEXT,
  p_id TEXT,
  p_record JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_name TEXT;
  v_parent_id TEXT;
  v_status TEXT;
  v_grade TEXT;
  v_location TEXT;
  v_capacity INTEGER;
  v_capacity_numeric NUMERIC;
  v_gender public.gender_type;
  v_attributes JSONB;
  v_inserted_id TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_category IS NULL OR p_category NOT IN ('Gedung', 'Kamar', 'Kelas')
    OR p_id IS NULL OR length(btrim(p_id)) NOT BETWEEN 1 AND 160
    OR p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'Data struktur tidak valid' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;

  v_name := NULLIF(btrim(p_record->>'name'), '');
  IF v_name IS NULL OR length(v_name) > 180 THEN
    RAISE EXCEPTION 'Nama struktur wajib diisi dan maksimal 180 karakter' USING ERRCODE = '22023';
  END IF;

  v_parent_id := CASE WHEN p_category = 'Kamar'
    THEN NULLIF(btrim(COALESCE(p_record->>'parentId', p_record->>'parentCode')), '')
    ELSE NULL END;
  v_status := COALESCE(NULLIF(btrim(p_record->>'status'), ''), 'Active');
  v_grade := NULLIF(btrim(p_record->>'grade'), '');
  v_location := NULLIF(btrim(p_record->>'location'), '');

  IF NULLIF(btrim(COALESCE(p_record->>'capacity', '')), '') IS NOT NULL THEN
    IF btrim(p_record->>'capacity') !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'Kapasitas harus berupa bilangan bulat nonnegatif' USING ERRCODE = '22023';
    END IF;
    v_capacity_numeric := btrim(p_record->>'capacity')::NUMERIC;
    IF v_capacity_numeric > 2147483647 THEN
      RAISE EXCEPTION 'Kapasitas melampaui batas bilangan yang didukung' USING ERRCODE = '22023';
    END IF;
    v_capacity := v_capacity_numeric::INTEGER;
  END IF;

  CASE lower(COALESCE(NULLIF(btrim(p_record->>'genderRestriction'), ''), NULLIF(btrim(p_record->>'gender'), '')))
    WHEN 'l' THEN v_gender := 'L';
    WHEN 'm' THEN v_gender := 'L';
    WHEN 'male' THEN v_gender := 'L';
    WHEN 'putra' THEN v_gender := 'L';
    WHEN 'laki-laki' THEN v_gender := 'L';
    WHEN 'p' THEN v_gender := 'P';
    WHEN 'f' THEN v_gender := 'P';
    WHEN 'female' THEN v_gender := 'P';
    WHEN 'putri' THEN v_gender := 'P';
    WHEN 'perempuan' THEN v_gender := 'P';
    ELSE v_gender := NULL;
  END CASE;

  v_attributes := p_record - ARRAY[
    'id', 'category', 'name', 'status', 'tenantId', '_firestoreId', 'createdByUid',
    'parentId', 'parentCode', 'grade', 'location', 'capacity', 'occupied', 'gender', 'genderRestriction'
  ];

  INSERT INTO public.master_data_records (
    tenant_id, category, id, name, status, parent_id, grade, capacity, gender_code, location, attributes
  ) VALUES (
    p_tenant_id, p_category, p_id, v_name, v_status, v_parent_id, v_grade, v_capacity, v_gender, v_location,
    COALESCE(v_attributes, '{}'::jsonb)
  )
  ON CONFLICT (tenant_id, category, id) DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN jsonb_build_object('status', 'already_exists', 'id', p_id, 'category', p_category);
  END IF;

  RETURN jsonb_build_object('status', 'created', 'id', v_inserted_id, 'category', p_category);
END;
$$;

REVOKE ALL ON FUNCTION public.create_master_data_structure_if_absent(UUID, TEXT, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_master_data_structure_if_absent(UUID, TEXT, TEXT, JSONB)
  TO service_role;

COMMIT;
