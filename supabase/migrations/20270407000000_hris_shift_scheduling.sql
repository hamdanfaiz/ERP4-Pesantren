-- Tenant-scoped employee shift templates and date-range assignments.
-- Keep the runtime flag closed until this migration is applied and verified in staging.
BEGIN;

CREATE TABLE public.hris_shift_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 2 AND 80),
  weekday_mask SMALLINT NOT NULL CHECK (weekday_mask BETWEEN 1 AND 127),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  break_minutes SMALLINT NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 240),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (starts_at <> ends_at),
  CHECK (break_minutes < extract(epoch FROM (
    CASE WHEN ends_at > starts_at THEN ends_at - starts_at
      ELSE ends_at - starts_at + interval '24 hours' END
  )) / 60)
);
CREATE UNIQUE INDEX hris_shift_templates_tenant_name_uq
  ON public.hris_shift_templates (tenant_id, lower(btrim(name)));
CREATE INDEX hris_shift_templates_tenant_status_name_idx
  ON public.hris_shift_templates (tenant_id, status, name, id);

CREATE TABLE public.hris_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  employee_id UUID NOT NULL,
  shift_template_id UUID NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  created_by_user_id UUID NOT NULL,
  cancelled_by_user_id UUID,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, employee_id) REFERENCES public.hris_employees(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, shift_template_id) REFERENCES public.hris_shift_templates(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, cancelled_by_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (ends_on >= starts_on AND ends_on - starts_on <= 365),
  CHECK ((status = 'active' AND cancelled_by_user_id IS NULL AND cancelled_at IS NULL)
    OR (status = 'cancelled' AND cancelled_by_user_id IS NOT NULL AND cancelled_at IS NOT NULL))
);
CREATE INDEX hris_shift_assignments_tenant_dates_idx
  ON public.hris_shift_assignments (tenant_id, status, starts_on, ends_on, employee_id);
CREATE INDEX hris_shift_assignments_employee_dates_idx
  ON public.hris_shift_assignments (tenant_id, employee_id, starts_on, ends_on)
  WHERE status = 'active';

CREATE TABLE public.hris_shift_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('template_created', 'template_deactivated', 'assignment_created', 'assignment_cancelled')),
  request_payload JSONB NOT NULL,
  shift_template_id UUID,
  shift_assignment_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, shift_template_id) REFERENCES public.hris_shift_templates(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, shift_assignment_id) REFERENCES public.hris_shift_assignments(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((event_type IN ('template_created', 'template_deactivated') AND shift_template_id IS NOT NULL AND shift_assignment_id IS NULL)
    OR (event_type = 'assignment_created' AND shift_template_id IS NOT NULL AND shift_assignment_id IS NOT NULL)
    OR (event_type = 'assignment_cancelled' AND shift_template_id IS NULL AND shift_assignment_id IS NOT NULL))
);
CREATE INDEX hris_shift_events_tenant_created_idx
  ON public.hris_shift_events (tenant_id, created_at DESC, id DESC);

ALTER TABLE public.hris_shift_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_shift_templates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hris_shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_shift_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hris_shift_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hris_shift_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hris_shift_templates, public.hris_shift_assignments, public.hris_shift_events
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.hris_shift_events FROM service_role;
GRANT SELECT ON TABLE public.hris_shift_templates, public.hris_shift_assignments TO service_role;

CREATE OR REPLACE FUNCTION public.create_hris_shift_template(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_shift_template_id UUID,
  p_name TEXT,
  p_weekday_mask SMALLINT,
  p_starts_at TIME,
  p_ends_at TIME,
  p_break_minutes SMALLINT,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_shift_events%ROWTYPE;
  v_template public.hris_shift_templates%ROWTYPE;
  v_payload JSONB;
  v_name TEXT := btrim(COALESCE(p_name, ''));
  v_break SMALLINT := COALESCE(p_break_minutes, 0);
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_shift_template_id IS NULL OR p_client_request_id IS NULL
    OR length(v_name) NOT BETWEEN 2 AND 80
    OR p_weekday_mask IS NULL OR p_weekday_mask NOT BETWEEN 1 AND 127
    OR p_starts_at IS NULL OR p_ends_at IS NULL OR p_starts_at = p_ends_at
    OR v_break NOT BETWEEN 0 AND 240
    OR v_break >= extract(epoch FROM (
      CASE WHEN p_ends_at > p_starts_at THEN p_ends_at - p_starts_at
        ELSE p_ends_at - p_starts_at + interval '24 hours' END
    )) / 60 THEN
    RAISE EXCEPTION 'Jadwal shift tidak valid' USING ERRCODE = '22023';
  END IF;

  v_payload := jsonb_build_object(
    'eventType', 'template_created', 'shiftTemplateId', p_shift_template_id,
    'name', v_name, 'weekdayMask', p_weekday_mask, 'startsAt', p_starts_at,
    'endsAt', p_ends_at, 'breakMinutes', v_break
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_shift_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.event_type <> 'template_created'
      OR v_prior.request_payload IS DISTINCT FROM v_payload
      OR v_prior.shift_template_id IS DISTINCT FROM p_shift_template_id THEN
      RAISE EXCEPTION 'ID permintaan telah digunakan untuk perubahan berbeda' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_template FROM public.hris_shift_templates
    WHERE tenant_id = p_tenant_id AND id = v_prior.shift_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Jadwal shift tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('id', v_template.id, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-tenant:' || p_tenant_id::TEXT, 0));
  INSERT INTO public.hris_shift_templates (
    id, tenant_id, name, weekday_mask, starts_at, ends_at, break_minutes,
    created_by_user_id, updated_by_user_id
  ) VALUES (
    p_shift_template_id, p_tenant_id, v_name, p_weekday_mask, p_starts_at, p_ends_at, v_break,
    p_actor_user_id, p_actor_user_id
  ) RETURNING * INTO v_template;
  INSERT INTO public.hris_shift_events (
    tenant_id, actor_user_id, client_request_id, event_type, request_payload, shift_template_id
  ) VALUES (p_tenant_id, p_actor_user_id, p_client_request_id, 'template_created', v_payload, v_template.id);
  RETURN jsonb_build_object('id', v_template.id, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_hris_shift_template(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_shift_template_id UUID,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_shift_events%ROWTYPE;
  v_template public.hris_shift_templates%ROWTYPE;
  v_payload JSONB;
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_shift_template_id IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Pola shift tidak valid' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('eventType', 'template_deactivated', 'shiftTemplateId', p_shift_template_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_shift_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.event_type <> 'template_deactivated'
      OR v_prior.request_payload IS DISTINCT FROM v_payload
      OR v_prior.shift_template_id IS DISTINCT FROM p_shift_template_id THEN
      RAISE EXCEPTION 'ID permintaan telah digunakan untuk perubahan berbeda' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_template FROM public.hris_shift_templates
    WHERE tenant_id = p_tenant_id AND id = p_shift_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Pola shift tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('id', v_template.id, 'status', v_template.status, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-tenant:' || p_tenant_id::TEXT, 0));
  UPDATE public.hris_shift_templates
  SET status = 'inactive', updated_by_user_id = p_actor_user_id, updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_shift_template_id AND status = 'active'
  RETURNING * INTO v_template;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pola shift aktif tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.hris_shift_events (
    tenant_id, actor_user_id, client_request_id, event_type, request_payload, shift_template_id
  ) VALUES (p_tenant_id, p_actor_user_id, p_client_request_id, 'template_deactivated', v_payload, v_template.id);
  RETURN jsonb_build_object('id', v_template.id, 'status', v_template.status, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_hris_shift(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_employee_id UUID,
  p_shift_template_id UUID,
  p_starts_on DATE,
  p_ends_on DATE,
  p_shift_assignment_id UUID,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_shift_events%ROWTYPE;
  v_assignment public.hris_shift_assignments%ROWTYPE;
  v_template public.hris_shift_templates%ROWTYPE;
  v_payload JSONB;
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_employee_id IS NULL OR p_shift_template_id IS NULL OR p_shift_assignment_id IS NULL
    OR p_client_request_id IS NULL OR p_starts_on IS NULL OR p_ends_on IS NULL
    OR p_ends_on < p_starts_on OR p_ends_on - p_starts_on > 365 THEN
    RAISE EXCEPTION 'Rentang penugasan shift tidak valid' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object(
    'eventType', 'assignment_created', 'employeeId', p_employee_id,
    'shiftTemplateId', p_shift_template_id, 'startsOn', p_starts_on,
    'endsOn', p_ends_on, 'shiftAssignmentId', p_shift_assignment_id
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_shift_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.event_type <> 'assignment_created'
      OR v_prior.request_payload IS DISTINCT FROM v_payload
      OR v_prior.shift_assignment_id IS DISTINCT FROM p_shift_assignment_id THEN
      RAISE EXCEPTION 'ID permintaan telah digunakan untuk perubahan berbeda' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_assignment FROM public.hris_shift_assignments
    WHERE tenant_id = p_tenant_id AND id = v_prior.shift_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Penugasan shift tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('id', v_assignment.id, 'status', v_assignment.status, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-employee:' || p_tenant_id::TEXT || ':' || p_employee_id::TEXT, 0));
  SELECT * INTO v_template FROM public.hris_shift_templates
  WHERE tenant_id = p_tenant_id AND id = p_shift_template_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pola shift aktif tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hris_employees WHERE tenant_id = p_tenant_id AND id = p_employee_id AND employment_status = 'active') THEN
    RAISE EXCEPTION 'Pegawai aktif tidak ditemukan' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM generate_series(p_starts_on::TIMESTAMP, p_ends_on::TIMESTAMP, interval '1 day') AS scheduled_day(day_start)
    WHERE (v_template.weekday_mask & (1 << (extract(isodow FROM scheduled_day.day_start)::INTEGER - 1))) <> 0
  ) THEN
    RAISE EXCEPTION 'Rentang tanggal tidak mencakup hari kerja pada pola shift' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.hris_shift_assignments AS existing
    JOIN public.hris_shift_templates AS existing_template
      ON existing_template.tenant_id = existing.tenant_id AND existing_template.id = existing.shift_template_id
    CROSS JOIN LATERAL generate_series(
      p_starts_on::TIMESTAMP,
      p_ends_on::TIMESTAMP,
      interval '1 day'
    ) AS candidate_day(day_start)
    CROSS JOIN LATERAL generate_series(
      candidate_day.day_start - interval '1 day',
      candidate_day.day_start + interval '1 day',
      interval '1 day'
    ) AS existing_day(day_start)
    WHERE existing.tenant_id = p_tenant_id AND existing.employee_id = p_employee_id AND existing.status = 'active'
      AND candidate_day.day_start::DATE BETWEEN p_starts_on AND p_ends_on
      AND existing_day.day_start::DATE BETWEEN existing.starts_on AND existing.ends_on
      AND (v_template.weekday_mask & (1 << (extract(isodow FROM candidate_day.day_start)::INTEGER - 1))) <> 0
      AND (existing_template.weekday_mask & (1 << (extract(isodow FROM existing_day.day_start)::INTEGER - 1))) <> 0
      AND tsrange(
        candidate_day.day_start::DATE + v_template.starts_at,
        candidate_day.day_start::DATE + v_template.ends_at
          + CASE WHEN v_template.ends_at <= v_template.starts_at THEN interval '1 day' ELSE interval '0' END,
        '[)'
      ) && tsrange(
        existing_day.day_start::DATE + existing_template.starts_at,
        existing_day.day_start::DATE + existing_template.ends_at
          + CASE WHEN existing_template.ends_at <= existing_template.starts_at THEN interval '1 day' ELSE interval '0' END,
        '[)'
      )
  ) THEN
    RAISE EXCEPTION 'Jadwal shift bertabrakan untuk pegawai dan periode tersebut' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.hris_shift_assignments (
    id, tenant_id, employee_id, shift_template_id, starts_on, ends_on, created_by_user_id
  ) VALUES (
    p_shift_assignment_id, p_tenant_id, p_employee_id, p_shift_template_id,
    p_starts_on, p_ends_on, p_actor_user_id
  ) RETURNING * INTO v_assignment;
  INSERT INTO public.hris_shift_events (
    tenant_id, actor_user_id, client_request_id, event_type, request_payload,
    shift_template_id, shift_assignment_id
  ) VALUES (
    p_tenant_id, p_actor_user_id, p_client_request_id, 'assignment_created', v_payload,
    p_shift_template_id, v_assignment.id
  );
  RETURN jsonb_build_object('id', v_assignment.id, 'status', v_assignment.status, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_hris_shift_assignment(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_shift_assignment_id UUID,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_prior public.hris_shift_events%ROWTYPE;
  v_assignment public.hris_shift_assignments%ROWTYPE;
  v_payload JSONB;
BEGIN
  PERFORM public.hris_assert_admin(p_tenant_id, p_actor_user_id);
  IF p_shift_assignment_id IS NULL OR p_client_request_id IS NULL THEN
    RAISE EXCEPTION 'Penugasan shift tidak valid' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object('eventType', 'assignment_cancelled', 'shiftAssignmentId', p_shift_assignment_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-request:' || p_tenant_id::TEXT || ':' || p_client_request_id::TEXT, 0));
  SELECT * INTO v_prior FROM public.hris_shift_events
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_prior.actor_user_id <> p_actor_user_id OR v_prior.event_type <> 'assignment_cancelled'
      OR v_prior.request_payload IS DISTINCT FROM v_payload
      OR v_prior.shift_assignment_id IS DISTINCT FROM p_shift_assignment_id THEN
      RAISE EXCEPTION 'ID permintaan telah digunakan untuk perubahan berbeda' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_assignment FROM public.hris_shift_assignments
    WHERE tenant_id = p_tenant_id AND id = p_shift_assignment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Penugasan shift tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
    RETURN jsonb_build_object('id', v_assignment.id, 'status', v_assignment.status, 'replayed', true);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('hris-shift-assignment:' || p_tenant_id::TEXT || ':' || p_shift_assignment_id::TEXT, 0));
  UPDATE public.hris_shift_assignments
  SET status = 'cancelled', cancelled_by_user_id = p_actor_user_id, cancelled_at = now(), updated_at = now()
  WHERE tenant_id = p_tenant_id AND id = p_shift_assignment_id AND status = 'active'
  RETURNING * INTO v_assignment;
  IF NOT FOUND THEN RAISE EXCEPTION 'Penugasan shift aktif tidak ditemukan' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.hris_shift_events (
    tenant_id, actor_user_id, client_request_id, event_type, request_payload, shift_assignment_id
  ) VALUES (p_tenant_id, p_actor_user_id, p_client_request_id, 'assignment_cancelled', v_payload, v_assignment.id);
  RETURN jsonb_build_object('id', v_assignment.id, 'status', v_assignment.status, 'replayed', false);
END;
$$;

REVOKE ALL ON FUNCTION public.create_hris_shift_template(UUID, UUID, UUID, TEXT, SMALLINT, TIME, TIME, SMALLINT, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deactivate_hris_shift_template(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_hris_shift(UUID, UUID, UUID, UUID, DATE, DATE, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_hris_shift_assignment(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_hris_shift_template(UUID, UUID, UUID, TEXT, SMALLINT, TIME, TIME, SMALLINT, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.deactivate_hris_shift_template(UUID, UUID, UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_hris_shift(UUID, UUID, UUID, UUID, DATE, DATE, UUID, UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_hris_shift_assignment(UUID, UUID, UUID, UUID)
  TO service_role;

COMMENT ON TABLE public.hris_shift_templates IS
  'Tenant-scoped reusable weekly shift patterns; all business writes use guarded Admin RPCs.';
COMMENT ON TABLE public.hris_shift_assignments IS
  'Tenant-scoped date-range employee shift assignments with serialized schedule-conflict checks.';
COMMENT ON TABLE public.hris_shift_events IS
  'Append-only idempotency and audit events for employee shift scheduling.';
COMMENT ON COLUMN public.hris_shift_templates.weekday_mask IS
  'Recurring local weekdays: Monday=1, Tuesday=2, Wednesday=4, Thursday=8, Friday=16, Saturday=32, Sunday=64; combinations are bitwise sums.';
COMMENT ON COLUMN public.hris_shift_templates.starts_at IS
  'Local wall-clock time in the tenant work calendar; not a UTC instant.';
COMMENT ON COLUMN public.hris_shift_templates.ends_at IS
  'Local wall-clock time in the tenant work calendar; an earlier time means the shift ends the following day.';

COMMIT;
