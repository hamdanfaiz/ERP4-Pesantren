-- Assign legacy PPDB candidates and students to tenant-owned organization units.
-- Existing rows remain unmapped until an Admin explicitly reconciles them.
BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN organization_unit_id UUID,
  ADD CONSTRAINT candidates_tenant_organization_unit_fkey
    FOREIGN KEY (tenant_id, organization_unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE public.students
  ADD COLUMN organization_unit_id UUID,
  ADD CONSTRAINT students_tenant_organization_unit_fkey
    FOREIGN KEY (tenant_id, organization_unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX candidates_tenant_unit_onboarding_idx
  ON public.candidates (tenant_id, organization_unit_id, stage, created_at DESC, id DESC)
  WHERE organization_unit_id IS NOT NULL;
CREATE INDEX students_tenant_unit_grade_idx
  ON public.students (tenant_id, organization_unit_id, grade, id)
  WHERE organization_unit_id IS NOT NULL;

ALTER TABLE public.finance_bills
  ADD COLUMN organization_unit_id UUID,
  ADD CONSTRAINT finance_bills_tenant_organization_unit_fkey
    FOREIGN KEY (tenant_id, organization_unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT;

CREATE INDEX finance_bills_tenant_unit_date_idx
  ON public.finance_bills (tenant_id, organization_unit_id, bill_date DESC, id DESC)
  WHERE organization_unit_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_master_data_unit_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.organization_unit_id IS NOT NULL
     AND NEW.organization_unit_id IS DISTINCT FROM OLD.organization_unit_id THEN
    RAISE EXCEPTION 'Unit data tidak dapat dipindahkan setelah ditetapkan' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_master_data_unit_reassignment() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER candidates_prevent_unit_reassignment
  BEFORE UPDATE OF organization_unit_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_master_data_unit_reassignment();
CREATE TRIGGER students_prevent_unit_reassignment
  BEFORE UPDATE OF organization_unit_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.prevent_master_data_unit_reassignment();

CREATE OR REPLACE FUNCTION public.inherit_candidate_organization_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate_unit_id UUID;
BEGIN
  IF NEW.source_candidate_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.organization_unit_id INTO v_candidate_unit_id
  FROM public.candidates AS c
  WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.source_candidate_id
  FOR SHARE;
  IF v_candidate_unit_id IS NOT NULL THEN
    IF NEW.organization_unit_id IS NOT NULL
       AND NEW.organization_unit_id IS DISTINCT FROM v_candidate_unit_id THEN
      RAISE EXCEPTION 'Unit calon santri dan santri tertaut tidak cocok' USING ERRCODE = '23514';
    END IF;
    NEW.organization_unit_id := v_candidate_unit_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER students_inherit_candidate_organization_unit
  BEFORE INSERT OR UPDATE OF organization_unit_id, source_candidate_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.inherit_candidate_organization_unit();

CREATE OR REPLACE FUNCTION public.sync_candidate_organization_unit_to_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student_unit_id UUID;
BEGIN
  IF NEW.organization_unit_id IS NULL
     OR NEW.organization_unit_id IS NOT DISTINCT FROM OLD.organization_unit_id
     OR NEW.master_student_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.organization_unit_id INTO v_student_unit_id
  FROM public.students AS s
  WHERE s.tenant_id = NEW.tenant_id AND s.id = NEW.master_student_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Santri tertaut tidak ditemukan pada tenant ini' USING ERRCODE = '23503';
  END IF;
  IF v_student_unit_id IS NOT NULL
     AND v_student_unit_id IS DISTINCT FROM NEW.organization_unit_id THEN
    RAISE EXCEPTION 'Unit calon santri dan santri tertaut tidak cocok' USING ERRCODE = '23514';
  END IF;

  UPDATE public.students
  SET organization_unit_id = NEW.organization_unit_id, updated_at = now()
  WHERE tenant_id = NEW.tenant_id AND id = NEW.master_student_id
    AND organization_unit_id IS NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_sync_organization_unit_to_student
  AFTER UPDATE OF organization_unit_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.sync_candidate_organization_unit_to_student();

CREATE OR REPLACE FUNCTION public.inherit_finance_bill_organization_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate_unit_id UUID;
  v_student_unit_id UUID;
  v_linked_unit_id UUID;
BEGIN
  IF NEW.candidate_id IS NOT NULL THEN
    SELECT c.organization_unit_id INTO v_candidate_unit_id
    FROM public.candidates AS c
    WHERE c.tenant_id = NEW.tenant_id AND c.id = NEW.candidate_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Calon santri tagihan tidak ditemukan pada tenant ini' USING ERRCODE = '23503';
    END IF;
  END IF;
  IF NEW.student_id IS NOT NULL THEN
    SELECT s.organization_unit_id INTO v_student_unit_id
    FROM public.students AS s
    WHERE s.tenant_id = NEW.tenant_id AND s.id = NEW.student_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Santri tagihan tidak ditemukan pada tenant ini' USING ERRCODE = '23503';
    END IF;
  END IF;
  IF v_candidate_unit_id IS NOT NULL AND v_student_unit_id IS NOT NULL
     AND v_candidate_unit_id IS DISTINCT FROM v_student_unit_id THEN
    RAISE EXCEPTION 'Unit calon santri dan santri pada tagihan tidak cocok' USING ERRCODE = '23514';
  END IF;
  v_linked_unit_id := COALESCE(v_candidate_unit_id, v_student_unit_id);
  IF v_linked_unit_id IS NOT NULL THEN
    IF NEW.organization_unit_id IS NOT NULL
       AND NEW.organization_unit_id IS DISTINCT FROM v_linked_unit_id THEN
      RAISE EXCEPTION 'Unit tagihan tidak cocok dengan calon santri atau santri' USING ERRCODE = '23514';
    END IF;
    NEW.organization_unit_id := v_linked_unit_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_bills_inherit_candidate_student_unit
  BEFORE INSERT OR UPDATE OF tenant_id, candidate_id, student_id, organization_unit_id ON public.finance_bills
  FOR EACH ROW EXECUTE FUNCTION public.inherit_finance_bill_organization_unit();
CREATE TRIGGER finance_bills_prevent_unit_reassignment
  BEFORE UPDATE OF organization_unit_id ON public.finance_bills
  FOR EACH ROW EXECUTE FUNCTION public.prevent_master_data_unit_reassignment();

CREATE OR REPLACE FUNCTION public.sync_master_data_unit_to_finance_bills()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_candidate_id UUID;
  v_student_id UUID;
BEGIN
  IF NEW.organization_unit_id IS NULL
     OR NEW.organization_unit_id IS NOT DISTINCT FROM OLD.organization_unit_id THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'candidates' THEN
    v_candidate_id := NEW.id;
    v_student_id := NEW.master_student_id;
  ELSE
    v_student_id := NEW.id;
    v_candidate_id := NEW.source_candidate_id;
  END IF;

  IF v_student_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.finance_bills AS b
    WHERE b.tenant_id = NEW.tenant_id AND b.student_id = v_student_id
      AND b.organization_unit_id IS NOT NULL
      AND b.organization_unit_id IS DISTINCT FROM NEW.organization_unit_id
  ) THEN
    RAISE EXCEPTION 'Unit tagihan lama berbeda dari unit santri; rekonsiliasi diperlukan' USING ERRCODE = '23514';
  END IF;
  IF v_candidate_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.finance_bills AS b
    WHERE b.tenant_id = NEW.tenant_id AND b.candidate_id = v_candidate_id
      AND b.organization_unit_id IS NOT NULL
      AND b.organization_unit_id IS DISTINCT FROM NEW.organization_unit_id
  ) THEN
    RAISE EXCEPTION 'Unit tagihan lama berbeda dari unit calon santri; rekonsiliasi diperlukan' USING ERRCODE = '23514';
  END IF;

  IF v_student_id IS NOT NULL THEN
    UPDATE public.finance_bills
    SET organization_unit_id = NEW.organization_unit_id, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND student_id = v_student_id
      AND organization_unit_id IS NULL;
  END IF;
  IF v_candidate_id IS NOT NULL THEN
    UPDATE public.finance_bills
    SET organization_unit_id = NEW.organization_unit_id, updated_at = now()
    WHERE tenant_id = NEW.tenant_id AND candidate_id = v_candidate_id
      AND organization_unit_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER candidates_sync_organization_unit_to_finance_bills
  AFTER UPDATE OF organization_unit_id ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.sync_master_data_unit_to_finance_bills();
CREATE TRIGGER students_sync_organization_unit_to_finance_bills
  AFTER UPDATE OF organization_unit_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.sync_master_data_unit_to_finance_bills();

REVOKE ALL ON FUNCTION public.inherit_candidate_organization_unit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_candidate_organization_unit_to_student() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.inherit_finance_bill_organization_unit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_master_data_unit_to_finance_bills() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.master_data_unit_assignment_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('candidate', 'student')),
  entity_id UUID NOT NULL,
  unit_id UUID NOT NULL,
  request_payload JSONB NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, unit_id)
    REFERENCES public.organization_units (tenant_id, id) ON DELETE RESTRICT
);

ALTER TABLE public.master_data_unit_assignment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_data_unit_assignment_requests FORCE ROW LEVEL SECURITY;
CREATE INDEX master_data_unit_assignment_actor_idx
  ON public.master_data_unit_assignment_requests (tenant_id, actor_user_id, created_at DESC);
CREATE INDEX master_data_unit_assignment_unit_idx
  ON public.master_data_unit_assignment_requests (tenant_id, unit_id, created_at DESC);
REVOKE ALL ON TABLE public.master_data_unit_assignment_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.master_data_unit_assignment_requests TO service_role;

CREATE OR REPLACE FUNCTION public.assign_tenant_master_data_unit(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_unit_id UUID,
  p_client_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_unit_status TEXT;
  v_request public.master_data_unit_assignment_requests%ROWTYPE;
  v_candidate public.candidates%ROWTYPE;
  v_student public.students%ROWTYPE;
  v_candidate_id UUID;
  v_student_id UUID;
  v_payload JSONB;
  v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_entity_id IS NULL
     OR p_unit_id IS NULL OR p_client_request_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
     OR p_entity_type IS NULL OR p_entity_type NOT IN ('candidate', 'student') THEN
    RAISE EXCEPTION 'Permintaan pemetaan unit data tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin' AND v_permissions ? 'master-data'
     AND NOT (jsonb_typeof(v_permissions -> 'master-data') = 'boolean'
       AND v_permissions ->> 'master-data' = 'true') THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Master Data pada tenant ini' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'unitId', p_unit_id
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('master-data-unit-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.master_data_unit_assignment_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.entity_type IS DISTINCT FROM p_entity_type
       OR v_request.entity_id IS DISTINCT FROM p_entity_id
       OR v_request.unit_id IS DISTINCT FROM p_unit_id
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci permintaan pemetaan unit telah dipakai untuk data berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;

  SELECT u.status INTO v_unit_status
  FROM public.organization_units AS u
  WHERE u.tenant_id = p_tenant_id AND u.id = p_unit_id
  FOR SHARE;
  IF NOT FOUND OR v_unit_status <> 'active' THEN
    RAISE EXCEPTION 'Unit aktif tidak ditemukan pada tenant ini' USING ERRCODE = '42501';
  END IF;

  IF p_entity_type = 'candidate' THEN
    SELECT * INTO v_candidate
    FROM public.candidates
    WHERE tenant_id = p_tenant_id AND id = p_entity_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Calon santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_candidate.organization_unit_id IS NOT NULL
       AND v_candidate.organization_unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Unit data tidak dapat dipindahkan setelah ditetapkan' USING ERRCODE = '23514';
    END IF;
    v_candidate_id := v_candidate.id;
    v_student_id := v_candidate.master_student_id;

    IF v_student_id IS NOT NULL THEN
      SELECT * INTO v_student
      FROM public.students
      WHERE tenant_id = p_tenant_id AND id = v_student_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Santri tertaut tidak ditemukan pada tenant ini' USING ERRCODE = '23503';
      END IF;
      IF v_student.source_candidate_id IS DISTINCT FROM v_candidate_id
         OR (v_student.organization_unit_id IS NOT NULL AND v_student.organization_unit_id IS DISTINCT FROM p_unit_id) THEN
        RAISE EXCEPTION 'Unit calon santri dan santri tertaut tidak cocok' USING ERRCODE = '23514';
      END IF;
      UPDATE public.students
      SET organization_unit_id = p_unit_id, updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = v_student_id
        AND organization_unit_id IS NULL;
    END IF;

    UPDATE public.candidates
    SET organization_unit_id = p_unit_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = v_candidate_id
      AND organization_unit_id IS NULL;
  ELSE
    -- Resolve and lock a linked candidate first so concurrent candidate/student
    -- assignments acquire locks in the same order and cannot deadlock.
    SELECT source_candidate_id INTO v_candidate_id
    FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_entity_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_candidate_id IS NOT NULL THEN
      SELECT * INTO v_candidate
      FROM public.candidates
      WHERE tenant_id = p_tenant_id AND id = v_candidate_id
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Calon santri tertaut tidak ditemukan pada tenant ini' USING ERRCODE = '23503';
      END IF;
      IF v_candidate.master_student_id IS DISTINCT FROM p_entity_id
         OR (v_candidate.organization_unit_id IS NOT NULL AND v_candidate.organization_unit_id IS DISTINCT FROM p_unit_id) THEN
        RAISE EXCEPTION 'Unit calon santri dan santri tertaut tidak cocok' USING ERRCODE = '23514';
      END IF;
    END IF;

    SELECT * INTO v_student
    FROM public.students
    WHERE tenant_id = p_tenant_id AND id = p_entity_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Santri tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
    END IF;
    IF v_student.source_candidate_id IS DISTINCT FROM v_candidate_id THEN
      RAISE EXCEPTION 'Relasi calon santri berubah; muat ulang data dan coba kembali' USING ERRCODE = '40001';
    END IF;
    IF v_student.organization_unit_id IS NOT NULL
       AND v_student.organization_unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'Unit data tidak dapat dipindahkan setelah ditetapkan' USING ERRCODE = '23514';
    END IF;

    IF v_candidate_id IS NOT NULL THEN
      UPDATE public.candidates
      SET organization_unit_id = p_unit_id, updated_at = now()
      WHERE tenant_id = p_tenant_id AND id = v_candidate_id
        AND organization_unit_id IS NULL;
    END IF;
    UPDATE public.students
    SET organization_unit_id = p_unit_id, updated_at = now()
    WHERE tenant_id = p_tenant_id AND id = p_entity_id
      AND organization_unit_id IS NULL;
    v_student_id := p_entity_id;
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'unitId', p_unit_id,
    'candidateId', v_candidate_id,
    'studentId', v_student_id
  );
  INSERT INTO public.master_data_unit_assignment_requests (
    tenant_id, client_request_id, actor_user_id, entity_type, entity_id,
    unit_id, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, p_entity_type,
    p_entity_id, p_unit_id, v_payload, v_result
  );
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_unmapped_master_data_units(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tenant_status TEXT;
  v_role TEXT;
  v_permissions JSONB;
  v_candidates JSONB;
  v_students JSONB;
  v_candidate_count BIGINT;
  v_student_count BIGINT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL
     OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
    RAISE EXCEPTION 'Permintaan daftar data tanpa unit tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT t.status, lower(btrim(p.role::text)), p.module_permissions
    INTO v_tenant_status, v_role, v_permissions
  FROM public.tenants AS t
  JOIN public.profiles AS p ON p.tenant_id = t.id
  WHERE t.id = p_tenant_id AND p.user_id = p_actor_user_id AND p.status = 'active'
  FOR SHARE OF t, p;
  IF NOT FOUND OR lower(btrim(v_tenant_status)) <> 'active'
     OR v_role IS DISTINCT FROM p_expected_role OR v_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Profil Admin tidak aktif pada tenant' USING ERRCODE = '42501';
  END IF;
  IF v_role <> 'super_admin' AND v_permissions ? 'master-data'
     AND NOT (jsonb_typeof(v_permissions -> 'master-data') = 'boolean'
       AND v_permissions ->> 'master-data' = 'true') THEN
    RAISE EXCEPTION 'Profil Admin tidak memiliki akses Master Data pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_candidate_count
  FROM public.candidates AS c
  WHERE c.tenant_id = p_tenant_id AND c.organization_unit_id IS NULL;
  SELECT count(*) INTO v_student_count
  FROM public.students AS s
  WHERE s.tenant_id = p_tenant_id AND s.organization_unit_id IS NULL
    AND s.source_candidate_id IS NULL;

  SELECT COALESCE(jsonb_agg(item ORDER BY created_at NULLS FIRST, id), '[]'::jsonb)
    INTO v_candidates
  FROM (
    SELECT c.id, c.created_at, jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'registrationId', c.registration_id,
      'stage', c.stage,
      'createdAt', c.created_at,
      'hasLinkedStudent', c.master_student_id IS NOT NULL
    ) AS item
    FROM public.candidates AS c
    WHERE c.tenant_id = p_tenant_id AND c.organization_unit_id IS NULL
    ORDER BY c.created_at NULLS FIRST, c.id
    LIMIT p_limit OFFSET p_offset
  ) AS pending_candidates;

  SELECT COALESCE(jsonb_agg(item ORDER BY name, id), '[]'::jsonb)
    INTO v_students
  FROM (
    SELECT s.id, s.name, jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'nis', s.nis,
      'grade', s.grade
    ) AS item
    FROM public.students AS s
    WHERE s.tenant_id = p_tenant_id AND s.organization_unit_id IS NULL
      AND s.source_candidate_id IS NULL
    ORDER BY lower(s.name), s.id
    LIMIT p_limit OFFSET p_offset
  ) AS pending_students;

  RETURN jsonb_build_object(
    'success', true,
    'candidates', v_candidates,
    'candidateCount', v_candidate_count,
    'students', v_students,
    'studentCount', v_student_count,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_tenant_master_data_unit(UUID, UUID, TEXT, TEXT, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_tenant_master_data_unit(UUID, UUID, TEXT, TEXT, UUID, UUID, UUID)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_tenant_unmapped_master_data_units(UUID, UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_unmapped_master_data_units(UUID, UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

COMMENT ON COLUMN public.candidates.organization_unit_id IS
  'Explicit tenant-owned unit assignment for this admission record; legacy NULL rows require Admin mapping before scoped onboarding.';
COMMENT ON COLUMN public.students.organization_unit_id IS
  'Explicit tenant-owned unit assignment for this student; legacy NULL rows require Admin mapping before scoped operations.';
COMMENT ON FUNCTION public.assign_tenant_master_data_unit(UUID, UUID, TEXT, TEXT, UUID, UUID, UUID) IS
  'One-time, idempotent Admin mapping of a candidate/student and its linked record to an active tenant-owned organization unit.';
COMMENT ON FUNCTION public.get_tenant_unmapped_master_data_units(UUID, UUID, TEXT, INTEGER, INTEGER) IS
  'Paginated tenant-scoped queue of legacy candidates and standalone students that require explicit Admin unit mapping.';

COMMIT;
