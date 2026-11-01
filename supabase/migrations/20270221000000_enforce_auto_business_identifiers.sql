-- New operational records must get business identifiers from their tenant's
-- Naming Series. Historical identifiers remain available through import flows.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_admin_ppdb_candidates_batch(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_payload_fingerprint TEXT,
  p_candidates JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_existing public.ppdb_candidate_creation_requests%ROWTYPE;
  v_item JSONB;
  v_candidate_id UUID;
  v_registration_id TEXT;
  v_created JSONB;
  v_results JSONB := '[]'::JSONB;
  v_response JSONB;
  v_row_count BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[0-9a-fA-F]{64}$'
    OR p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array'
    OR jsonb_array_length(p_candidates) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Permintaan pembuatan calon santri tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant PPDB tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT profile.role INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_actor_user_id AND profile.status = 'active'
    AND profile.role IN ('admin', 'super_admin') AND profile.role = p_expected_role
    AND (profile.role = 'super_admin' OR NOT (profile.module_permissions ? 'ppdb')
      OR (jsonb_typeof(profile.module_permissions -> 'ppdb') = 'boolean' AND profile.module_permissions ->> 'ppdb' = 'true'))
  FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Admin aktif dengan akses PPDB diperlukan' USING ERRCODE = '42501'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object'
      OR jsonb_typeof(v_item->'candidate') IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item->'workflowData', '{}'::JSONB)) IS DISTINCT FROM 'object'
      OR jsonb_typeof(COALESCE(v_item->'documents', '{}'::JSONB)) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Data calon santri tidak valid' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(COALESCE(v_item->>'registrationId', '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'Nomor pendaftaran dibuat otomatis oleh Naming Series' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'ppdb-candidate-create:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_existing FROM public.ppdb_candidate_creation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id
      OR v_existing.payload_fingerprint <> decode(p_payload_fingerprint, 'hex') THEN
      RAISE EXCEPTION 'ID permintaan PPDB telah digunakan untuk data lain' USING ERRCODE = '23505';
    END IF;
    RETURN v_existing.response || jsonb_build_object('alreadyApplied', true);
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
    v_candidate_id := (v_item->>'candidateId')::UUID;
    v_registration_id := public.allocate_tenant_naming_series(
      p_tenant_id, 'ppdb_registration', (now() AT TIME ZONE 'Asia/Jakarta')::DATE, '{}'::JSONB
    );
    v_created := public.create_admin_ppdb_candidate(
      p_tenant_id, v_candidate_id, v_registration_id, v_item->'candidate',
      COALESCE(v_item->'workflowData', '{}'::JSONB), COALESCE(v_item->'documents', '{}'::JSONB)
    );
    UPDATE public.candidates SET created_by_user_id = p_actor_user_id
    WHERE tenant_id = p_tenant_id AND id = v_candidate_id;
    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN RAISE EXCEPTION 'Atribusi Admin pendaftar tidak dapat disimpan' USING ERRCODE = '23503'; END IF;
    v_results := v_results || jsonb_build_array(v_created);
  END LOOP;

  v_response := jsonb_build_object(
    'alreadyApplied', false, 'requestId', p_client_request_id, 'candidates', v_results
  );
  INSERT INTO public.ppdb_candidate_creation_requests (
    tenant_id, client_request_id, actor_user_id, payload_fingerprint, response
  ) VALUES (p_tenant_id, p_client_request_id, p_actor_user_id, decode(p_payload_fingerprint, 'hex'), v_response);
  RETURN v_response;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_hris_employee(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_employee_id UUID,
  p_employee_number TEXT,
  p_full_name TEXT,
  p_job_title TEXT,
  p_department TEXT,
  p_email TEXT,
  p_phone TEXT,
  p_hire_date DATE,
  p_employment_status TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_employee_events%ROWTYPE;
  v_employee public.hris_employees%ROWTYPE;
  v_employee_number TEXT;
  v_email TEXT := NULLIF(lower(btrim(p_email)), '');
  v_phone TEXT := NULLIF(btrim(p_phone), '');
  v_existing_found BOOLEAN := false;
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_employee_id IS NULL OR p_client_request_id IS NULL
    OR (NULLIF(btrim(COALESCE(p_employee_number, '')), '') IS NOT NULL
      AND btrim(p_employee_number) !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$')
    OR p_full_name IS NULL OR length(btrim(p_full_name)) NOT BETWEEN 2 AND 180
    OR p_job_title IS NULL OR length(btrim(p_job_title)) NOT BETWEEN 1 AND 120
    OR p_department IS NULL OR length(btrim(p_department)) NOT BETWEEN 1 AND 120
    OR p_employment_status IS NULL OR p_employment_status NOT IN ('active', 'on_leave', 'inactive', 'terminated')
    OR (v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    OR (v_phone IS NOT NULL AND length(v_phone) NOT BETWEEN 5 AND 40) THEN
    RAISE EXCEPTION 'Data pegawai tidak valid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'hris-employee-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0
  ));
  SELECT * INTO v_prior FROM public.hris_employee_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.employee_id <> p_employee_id THEN
      RAISE EXCEPTION 'ID permintaan pegawai telah digunakan untuk operasi lain' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_employee FROM public.hris_employees
    WHERE tenant_id = p_tenant_id AND id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pegawai tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    IF (NULLIF(btrim(COALESCE(p_employee_number, '')), '') IS NOT NULL
        AND v_employee.employee_number IS DISTINCT FROM btrim(p_employee_number))
      OR v_employee.full_name IS DISTINCT FROM btrim(p_full_name)
      OR v_employee.job_title IS DISTINCT FROM btrim(p_job_title)
      OR v_employee.department IS DISTINCT FROM btrim(p_department)
      OR v_employee.email IS DISTINCT FROM v_email
      OR v_employee.phone IS DISTINCT FROM v_phone
      OR v_employee.hire_date IS DISTINCT FROM p_hire_date
      OR v_employee.employment_status IS DISTINCT FROM p_employment_status THEN
      RAISE EXCEPTION 'Pegawai berubah sejak permintaan awal; muat ulang sebelum mencoba lagi' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_employee.id, 'employeeNumber', v_employee.employee_number, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'hris-employee:' || p_tenant_id::TEXT || ':' || p_employee_id::TEXT, 0
  ));
  SELECT * INTO v_employee FROM public.hris_employees
  WHERE tenant_id = p_tenant_id AND id = p_employee_id FOR UPDATE;
  v_existing_found := FOUND;
  IF v_existing_found THEN
    IF NULLIF(btrim(COALESCE(p_employee_number, '')), '') IS NOT NULL
      AND v_employee.employee_number IS DISTINCT FROM btrim(p_employee_number) THEN
      RAISE EXCEPTION 'Nomor pegawai yang telah terbit tidak dapat diubah' USING ERRCODE = '23514';
    END IF;
    v_employee_number := v_employee.employee_number;
  ELSE
    IF NULLIF(btrim(COALESCE(p_employee_number, '')), '') IS NOT NULL THEN
      RAISE EXCEPTION 'Nomor pegawai baru dibuat otomatis oleh Naming Series' USING ERRCODE = '22023';
    END IF;
    v_employee_number := public.allocate_tenant_naming_series(
      p_tenant_id, 'employee_number', COALESCE(p_hire_date, (now() AT TIME ZONE 'Asia/Jakarta')::DATE), '{}'::JSONB
    );
  END IF;

  INSERT INTO public.hris_employees (
    id, tenant_id, employee_number, full_name, job_title, department, email, phone, hire_date,
    employment_status, created_by_user_id, updated_by_user_id
  ) VALUES (
    p_employee_id, p_tenant_id, v_employee_number, btrim(p_full_name), btrim(p_job_title), btrim(p_department),
    v_email, v_phone, p_hire_date, p_employment_status, p_actor_user_id, p_actor_user_id
  )
  ON CONFLICT (tenant_id, id) DO UPDATE SET
    full_name = EXCLUDED.full_name, job_title = EXCLUDED.job_title, department = EXCLUDED.department,
    email = EXCLUDED.email, phone = EXCLUDED.phone, hire_date = EXCLUDED.hire_date,
    employment_status = EXCLUDED.employment_status, updated_by_user_id = p_actor_user_id, updated_at = now()
  RETURNING * INTO v_employee;

  INSERT INTO public.hris_employee_events (tenant_id, employee_id, actor_user_id, client_request_id)
  VALUES (p_tenant_id, v_employee.id, p_actor_user_id, p_client_request_id);
  RETURN jsonb_build_object('id', v_employee.id, 'employeeNumber', v_employee.employee_number, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_ppdb_candidates_batch(UUID,UUID,TEXT,UUID,TEXT,JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_admin_ppdb_candidates_batch(UUID,UUID,TEXT,UUID,TEXT,JSONB)
  TO service_role;
REVOKE ALL ON FUNCTION public.upsert_hris_employee(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_hris_employee(UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,DATE,TEXT,UUID)
  TO service_role;

COMMIT;

