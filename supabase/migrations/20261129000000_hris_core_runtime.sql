-- Tenant-scoped HRIS employee directory and attendance runtime.
-- Keep disabled until the canonical profile foundation and migration history are reconciled.
BEGIN;

CREATE TABLE public.hris_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  employee_number TEXT NOT NULL CHECK (employee_number ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'),
  full_name TEXT NOT NULL CHECK (length(btrim(full_name)) BETWEEN 2 AND 180),
  job_title TEXT NOT NULL CHECK (length(btrim(job_title)) BETWEEN 1 AND 120),
  department TEXT NOT NULL CHECK (length(btrim(department)) BETWEEN 1 AND 120),
  email TEXT CHECK (email IS NULL OR (email = lower(email) AND length(email) <= 254)),
  phone TEXT CHECK (phone IS NULL OR length(phone) BETWEEN 5 AND 40),
  hire_date DATE,
  employment_status TEXT NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active', 'on_leave', 'inactive', 'terminated')),
  linked_user_id UUID,
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, employee_number),
  UNIQUE (tenant_id, linked_user_id),
  FOREIGN KEY (tenant_id, linked_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX hris_employees_tenant_email_uq
  ON public.hris_employees (tenant_id, email) WHERE email IS NOT NULL;
CREATE INDEX hris_employees_tenant_status_name_idx
  ON public.hris_employees (tenant_id, employment_status, full_name, id);

CREATE TABLE public.hris_employee_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES public.hris_employees(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE public.hris_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  work_date DATE NOT NULL,
  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('present', 'late', 'absent', 'leave', 'remote')),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  recorded_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, employee_id, work_date),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES public.hris_employees(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, recorded_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (check_out_at IS NULL OR (check_in_at IS NOT NULL AND check_out_at > check_in_at)),
  CHECK (attendance_status NOT IN ('absent', 'leave') OR (check_in_at IS NULL AND check_out_at IS NULL)),
  CHECK (attendance_status NOT IN ('present', 'late', 'remote') OR check_in_at IS NOT NULL)
);
CREATE INDEX hris_attendance_tenant_date_idx
  ON public.hris_attendance (tenant_id, work_date DESC, employee_id);

CREATE TABLE public.hris_attendance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  attendance_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  work_date DATE NOT NULL,
  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('present', 'late', 'absent', 'leave', 'remote')),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, attendance_id) REFERENCES public.hris_attendance(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, employee_id) REFERENCES public.hris_employees(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX hris_attendance_events_tenant_date_idx
  ON public.hris_attendance_events (tenant_id, work_date DESC, created_at DESC);

CREATE TABLE public.hris_leave_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  leave_type TEXT NOT NULL CHECK (leave_type IN ('annual', 'sick', 'personal', 'maternity', 'other')),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by_user_id UUID NOT NULL,
  reviewed_by_user_id UUID,
  review_note TEXT CHECK (review_note IS NULL OR length(review_note) <= 1000),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES public.hris_employees(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, requested_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, reviewed_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (ends_on >= starts_on AND ends_on - starts_on < 120),
  CHECK ((status = 'pending' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
    OR (status IN ('approved', 'rejected') AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX hris_leave_requests_tenant_status_date_idx
  ON public.hris_leave_requests (tenant_id, status, starts_on, ends_on);
CREATE INDEX hris_leave_requests_employee_date_idx
  ON public.hris_leave_requests (tenant_id, employee_id, starts_on, ends_on);

CREATE TABLE public.hris_leave_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  leave_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, leave_request_id) REFERENCES public.hris_leave_requests(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX hris_leave_events_tenant_request_idx
  ON public.hris_leave_events (tenant_id, leave_request_id, created_at DESC);

ALTER TABLE public.hris_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_employees FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hris_employee_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_employee_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hris_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_attendance FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hris_attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_attendance_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hris_leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_leave_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hris_leave_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_leave_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hris_employees, public.hris_employee_events,
  public.hris_attendance, public.hris_attendance_events, public.hris_leave_requests,
  public.hris_leave_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hris_employee_events, public.hris_attendance_events,
  public.hris_leave_events FROM service_role;
GRANT SELECT ON TABLE public.hris_employees, public.hris_attendance, public.hris_leave_requests TO service_role;

CREATE OR REPLACE FUNCTION public.hris_assert_admin(p_tenant_id UUID, p_actor_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_permissions JSONB;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT role::TEXT, module_permissions INTO v_role, v_permissions
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND OR v_role NOT IN ('admin', 'super_admin') OR (
    v_role <> 'super_admin' AND CASE
      WHEN v_permissions ? 'hris' THEN
        CASE WHEN jsonb_typeof(v_permissions -> 'hris') = 'boolean'
          THEN (v_permissions ->> 'hris')::BOOLEAN ELSE false END
      ELSE v_role = 'admin'
    END IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'Admin tenant dengan izin HRIS diperlukan' USING ERRCODE = '42501';
  END IF;
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
  v_email TEXT := NULLIF(lower(btrim(p_email)), '');
  v_phone TEXT := NULLIF(btrim(p_phone), '');
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_employee_id IS NULL OR p_client_request_id IS NULL
    OR p_employee_number IS NULL OR p_employee_number !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$'
    OR p_full_name IS NULL OR length(btrim(p_full_name)) NOT BETWEEN 2 AND 180
    OR p_job_title IS NULL OR length(btrim(p_job_title)) NOT BETWEEN 1 AND 120
    OR p_department IS NULL OR length(btrim(p_department)) NOT BETWEEN 1 AND 120
    OR p_employment_status IS NULL OR p_employment_status NOT IN ('active', 'on_leave', 'inactive', 'terminated')
    OR (v_email IS NOT NULL AND (length(v_email) > 254 OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    OR (v_phone IS NOT NULL AND length(v_phone) NOT BETWEEN 5 AND 40) THEN
    RAISE EXCEPTION 'Data pegawai tidak valid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-employee-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_employee_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.employee_id <> p_employee_id THEN
      RAISE EXCEPTION 'ID permintaan pegawai telah digunakan untuk operasi lain' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_employee FROM public.hris_employees
    WHERE tenant_id = p_tenant_id AND id = p_employee_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pegawai tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    IF v_employee.employee_number IS DISTINCT FROM btrim(p_employee_number)
      OR v_employee.full_name IS DISTINCT FROM btrim(p_full_name)
      OR v_employee.job_title IS DISTINCT FROM btrim(p_job_title)
      OR v_employee.department IS DISTINCT FROM btrim(p_department)
      OR v_employee.email IS DISTINCT FROM v_email
      OR v_employee.phone IS DISTINCT FROM v_phone
      OR v_employee.hire_date IS DISTINCT FROM p_hire_date
      OR v_employee.employment_status IS DISTINCT FROM p_employment_status THEN
      RAISE EXCEPTION 'Pegawai berubah setelah permintaan awal; muat ulang sebelum mencoba lagi' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_employee.id, 'employeeNumber', v_employee.employee_number, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-employee:' || p_tenant_id::TEXT || ':' || p_employee_id::TEXT, 0));
  INSERT INTO public.hris_employees (
    id, tenant_id, employee_number, full_name, job_title, department, email, phone, hire_date,
    employment_status, created_by_user_id, updated_by_user_id
  ) VALUES (
    p_employee_id, p_tenant_id, btrim(p_employee_number), btrim(p_full_name), btrim(p_job_title), btrim(p_department),
    v_email, v_phone, p_hire_date, p_employment_status, p_actor_user_id, p_actor_user_id
  )
  ON CONFLICT (tenant_id, id) DO UPDATE SET
    employee_number = EXCLUDED.employee_number,
    full_name = EXCLUDED.full_name,
    job_title = EXCLUDED.job_title,
    department = EXCLUDED.department,
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    hire_date = EXCLUDED.hire_date,
    employment_status = EXCLUDED.employment_status,
    updated_by_user_id = p_actor_user_id,
    updated_at = now()
  RETURNING * INTO v_employee;
  INSERT INTO public.hris_employee_events (tenant_id, employee_id, actor_user_id, client_request_id)
  VALUES (p_tenant_id, v_employee.id, p_actor_user_id, p_client_request_id);
  RETURN jsonb_build_object('id', v_employee.id, 'employeeNumber', v_employee.employee_number, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_hris_attendance(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_employee_id UUID,
  p_work_date DATE,
  p_attendance_status TEXT,
  p_check_in_at TIMESTAMPTZ,
  p_check_out_at TIMESTAMPTZ,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_attendance_events%ROWTYPE;
  v_attendance public.hris_attendance%ROWTYPE;
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_employee_id IS NULL OR p_work_date IS NULL OR p_client_request_id IS NULL
    OR p_attendance_status IS NULL OR p_attendance_status NOT IN ('present', 'late', 'absent', 'leave', 'remote')
    OR (p_attendance_status IN ('present', 'late', 'remote') AND p_check_in_at IS NULL)
    OR (p_attendance_status IN ('absent', 'leave') AND (p_check_in_at IS NOT NULL OR p_check_out_at IS NOT NULL))
    OR (p_check_out_at IS NOT NULL AND (p_check_in_at IS NULL OR p_check_out_at <= p_check_in_at)) THEN
    RAISE EXCEPTION 'Data kehadiran tidak valid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-attendance-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_attendance_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.employee_id <> p_employee_id
      OR v_prior.work_date <> p_work_date OR v_prior.attendance_status <> p_attendance_status
      OR v_prior.check_in_at IS DISTINCT FROM p_check_in_at
      OR v_prior.check_out_at IS DISTINCT FROM p_check_out_at THEN
      RAISE EXCEPTION 'ID permintaan kehadiran telah digunakan untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_attendance FROM public.hris_attendance
    WHERE tenant_id = p_tenant_id AND id = v_prior.attendance_id;
    RETURN jsonb_build_object('id', v_attendance.id, 'workDate', v_attendance.work_date,
      'status', v_attendance.attendance_status, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-attendance-day:' || p_tenant_id::TEXT || ':' || p_employee_id::TEXT || ':' || p_work_date::TEXT, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.hris_employees
    WHERE tenant_id = p_tenant_id AND id = p_employee_id AND employment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Pegawai aktif tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.hris_attendance (
    tenant_id, employee_id, work_date, attendance_status, check_in_at, check_out_at, recorded_by_user_id
  ) VALUES (
    p_tenant_id, p_employee_id, p_work_date, p_attendance_status, p_check_in_at, p_check_out_at, p_actor_user_id
  )
  ON CONFLICT (tenant_id, employee_id, work_date) DO UPDATE SET
    attendance_status = EXCLUDED.attendance_status,
    check_in_at = EXCLUDED.check_in_at,
    check_out_at = EXCLUDED.check_out_at,
    recorded_by_user_id = p_actor_user_id,
    updated_at = now()
  RETURNING * INTO v_attendance;
  INSERT INTO public.hris_attendance_events (
    tenant_id, attendance_id, employee_id, actor_user_id, client_request_id,
    work_date, attendance_status, check_in_at, check_out_at
  ) VALUES (
    p_tenant_id, v_attendance.id, p_employee_id, p_actor_user_id, p_client_request_id,
    p_work_date, p_attendance_status, p_check_in_at, p_check_out_at
  );
  RETURN jsonb_build_object('id', v_attendance.id, 'workDate', v_attendance.work_date,
    'status', v_attendance.attendance_status, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_hris_leave(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_employee_id UUID,
  p_leave_type TEXT,
  p_starts_on DATE,
  p_ends_on DATE,
  p_reason TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_leave_events%ROWTYPE;
  v_leave public.hris_leave_requests%ROWTYPE;
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_employee_id IS NULL OR p_client_request_id IS NULL OR p_starts_on IS NULL OR p_ends_on IS NULL
    OR p_leave_type IS NULL OR p_leave_type NOT IN ('annual', 'sick', 'personal', 'maternity', 'other')
    OR p_ends_on < p_starts_on OR p_ends_on - p_starts_on >= 120
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 1000 THEN
    RAISE EXCEPTION 'Pengajuan cuti tidak valid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-leave-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_leave_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.event_type <> 'created' THEN
      RAISE EXCEPTION 'ID permintaan cuti telah digunakan untuk operasi lain' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_leave FROM public.hris_leave_requests
    WHERE tenant_id = p_tenant_id AND id = v_prior.leave_request_id;
    IF NOT FOUND OR v_leave.requested_by_user_id <> p_actor_user_id
      OR v_leave.employee_id <> p_employee_id OR v_leave.leave_type <> p_leave_type
      OR v_leave.starts_on <> p_starts_on OR v_leave.ends_on <> p_ends_on OR v_leave.reason <> btrim(p_reason) THEN
      RAISE EXCEPTION 'Permintaan cuti berubah sejak percobaan awal; muat ulang data' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_leave.id, 'status', v_leave.status, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-leave-employee:' || p_tenant_id::TEXT || ':' || p_employee_id::TEXT, 0));
  IF NOT EXISTS (
    SELECT 1 FROM public.hris_employees
    WHERE tenant_id = p_tenant_id AND id = p_employee_id AND employment_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Pegawai aktif tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.hris_leave_requests
    WHERE tenant_id = p_tenant_id AND employee_id = p_employee_id
      AND status IN ('pending', 'approved')
      AND starts_on <= p_ends_on AND ends_on >= p_starts_on
  ) THEN
    RAISE EXCEPTION 'Tanggal cuti bertabrakan dengan permintaan pending atau cuti yang disetujui' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.hris_leave_requests (
    tenant_id, employee_id, leave_type, starts_on, ends_on, reason, requested_by_user_id
  ) VALUES (
    p_tenant_id, p_employee_id, p_leave_type, p_starts_on, p_ends_on, btrim(p_reason), p_actor_user_id
  ) RETURNING * INTO v_leave;
  INSERT INTO public.hris_leave_events (tenant_id, leave_request_id, actor_user_id, client_request_id, event_type)
  VALUES (p_tenant_id, v_leave.id, p_actor_user_id, p_client_request_id, 'created');
  RETURN jsonb_build_object('id', v_leave.id, 'status', v_leave.status, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.review_hris_leave(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_leave_request_id UUID,
  p_target_status TEXT,
  p_review_note TEXT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_leave_events%ROWTYPE;
  v_leave public.hris_leave_requests%ROWTYPE;
  v_event_type TEXT;
  v_note TEXT := NULLIF(btrim(p_review_note), '');
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_leave_request_id IS NULL OR p_client_request_id IS NULL
    OR p_target_status IS NULL OR p_target_status NOT IN ('approved', 'rejected')
    OR (v_note IS NOT NULL AND length(v_note) > 1000)
    OR (p_target_status = 'rejected' AND (v_note IS NULL OR length(v_note) < 3)) THEN
    RAISE EXCEPTION 'Keputusan cuti tidak valid' USING ERRCODE = '22023';
  END IF;
  v_event_type := p_target_status;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-leave-review-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_leave_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.leave_request_id <> p_leave_request_id
      OR v_prior.event_type <> v_event_type THEN
      RAISE EXCEPTION 'ID permintaan review cuti telah dipakai untuk operasi lain' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_leave FROM public.hris_leave_requests
    WHERE tenant_id = p_tenant_id AND id = p_leave_request_id;
    IF NOT FOUND OR v_leave.status <> p_target_status OR v_leave.reviewed_by_user_id <> p_actor_user_id
      OR v_leave.review_note IS DISTINCT FROM v_note THEN
      RAISE EXCEPTION 'Keputusan cuti telah berubah setelah permintaan awal' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object('id', v_leave.id, 'status', v_leave.status, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-leave-record:' || p_tenant_id::TEXT || ':' || p_leave_request_id::TEXT, 0));
  SELECT * INTO v_leave FROM public.hris_leave_requests
  WHERE tenant_id = p_tenant_id AND id = p_leave_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Permintaan cuti tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF v_leave.status <> 'pending' THEN
    RAISE EXCEPTION 'Permintaan cuti sudah diputus dan tidak dapat diubah' USING ERRCODE = '23505';
  END IF;
  IF p_target_status = 'approved' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('hris-leave-employee:' || p_tenant_id::TEXT || ':' || v_leave.employee_id::TEXT, 0));
    IF EXISTS (
      SELECT 1 FROM public.hris_leave_requests other
      WHERE other.tenant_id = p_tenant_id AND other.employee_id = v_leave.employee_id
        AND other.id <> v_leave.id AND other.status = 'approved'
        AND other.starts_on <= v_leave.ends_on AND other.ends_on >= v_leave.starts_on
    ) THEN
      RAISE EXCEPTION 'Persetujuan akan menimbulkan bentrok dengan cuti lain' USING ERRCODE = '23505';
    END IF;
  END IF;
  UPDATE public.hris_leave_requests
  SET status = p_target_status, reviewed_by_user_id = p_actor_user_id,
      review_note = v_note, reviewed_at = now(), updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_leave_request_id
  RETURNING * INTO v_leave;
  INSERT INTO public.hris_leave_events (tenant_id, leave_request_id, actor_user_id, client_request_id, event_type)
  VALUES (p_tenant_id, v_leave.id, p_actor_user_id, p_client_request_id, v_event_type);
  RETURN jsonb_build_object('id', v_leave.id, 'status', v_leave.status, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.hris_assert_admin(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_hris_employee(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_hris_attendance(UUID, UUID, UUID, DATE, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_hris_leave(UUID, UUID, UUID, TEXT, DATE, DATE, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.review_hris_leave(UUID, UUID, UUID, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_hris_employee(UUID, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.record_hris_attendance(UUID, UUID, UUID, DATE, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.request_hris_leave(UUID, UUID, UUID, TEXT, DATE, DATE, TEXT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.review_hris_leave(UUID, UUID, UUID, TEXT, TEXT, UUID)
  TO service_role;

COMMENT ON TABLE public.hris_employees IS
  'Tenant-scoped employee register. Employment records are distinct from Auth accounts; only an explicit profile link connects an employee login.';
COMMENT ON TABLE public.hris_attendance_events IS
  'Append-only attendance write audit with tenant actor and idempotency keys.';
COMMENT ON TABLE public.hris_leave_requests IS
  'Tenant-scoped HR leave records. Reasons are restricted to authorized HR Admins and are not exposed to employee accounts.';

COMMIT;
