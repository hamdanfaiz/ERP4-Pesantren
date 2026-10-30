-- Make LMS notes/comments replay-safe and enforce active enrollment and material timestamp bounds.
BEGIN;

CREATE TABLE public.lms_learning_record_requests (
  tenant_id UUID NOT NULL,
  request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('note', 'comment')),
  material_id UUID NOT NULL,
  student_id UUID NOT NULL,
  note_id UUID,
  comment_id UUID,
  payload_fingerprint BYTEA NOT NULL CHECK (octet_length(payload_fingerprint) = 32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, request_id),
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, material_id) REFERENCES public.lms_materials(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (note_id) REFERENCES public.lms_student_notes(id) ON DELETE RESTRICT,
  FOREIGN KEY (comment_id) REFERENCES public.lms_material_comments(id) ON DELETE RESTRICT,
  CHECK (
    (kind = 'note' AND note_id IS NOT NULL AND comment_id IS NULL)
    OR (kind = 'comment' AND comment_id IS NOT NULL AND note_id IS NULL)
  )
);
CREATE INDEX lms_learning_record_requests_student_idx
  ON public.lms_learning_record_requests(tenant_id, student_id, created_at DESC);

ALTER TABLE public.lms_learning_record_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lms_learning_record_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.lms_learning_record_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.lms_learning_record_requests TO service_role;
CREATE TRIGGER lms_learning_record_requests_immutable
  BEFORE UPDATE OR DELETE ON public.lms_learning_record_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_lms_immutable_ledger_mutation();

DROP FUNCTION IF EXISTS public.add_lms_learning_record(UUID, UUID, TEXT, UUID, INTEGER, TEXT);
CREATE FUNCTION public.add_lms_learning_record(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_request_id UUID,
  p_kind TEXT,
  p_material_id UUID,
  p_timestamp_seconds INTEGER,
  p_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_student UUID;
  v_course UUID;
  v_duration_seconds INTEGER;
  v_record_id UUID;
  v_existing public.lms_learning_record_requests%ROWTYPE;
  v_fingerprint BYTEA;
  v_text TEXT := btrim(COALESCE(p_text, ''));
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_request_id IS NULL OR p_material_id IS NULL
    OR p_kind IS NULL OR p_kind NOT IN ('note', 'comment')
    OR p_timestamp_seconds IS NULL OR p_timestamp_seconds NOT BETWEEN 0 AND 86400
    OR p_text IS NULL OR length(v_text) NOT BETWEEN 1 AND 3000 THEN
    RAISE EXCEPTION 'Invalid LMS learning record' USING ERRCODE = '22023';
  END IF;

  SELECT CASE
    WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN linked_santri_id::UUID ELSE NULL END
  INTO v_student
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id
    AND role = 'santri' AND status = 'active'
    AND (NOT (module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms', 'false') = 'true')
  FOR SHARE;

  IF v_student IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Active LMS student profile and tenant are required' USING ERRCODE = '42501';
  END IF;

  v_fingerprint := extensions.digest(
    convert_to(jsonb_build_object(
      'kind', p_kind,
      'materialId', p_material_id,
      'timestampSeconds', p_timestamp_seconds,
      'text', v_text
    )::TEXT, 'UTF8'),
    'sha256'
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lms-learning-record-request:' || p_tenant_id::TEXT || ':' || p_request_id::TEXT, 0)
  );

  SELECT * INTO v_existing
  FROM public.lms_learning_record_requests
  WHERE tenant_id = p_tenant_id AND request_id = p_request_id;

  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.kind IS DISTINCT FROM p_kind
      OR v_existing.material_id IS DISTINCT FROM p_material_id
      OR v_existing.student_id IS DISTINCT FROM v_student
      OR v_existing.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'LMS learning request ID was already used for a different actor or payload' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'id', COALESCE(v_existing.note_id, v_existing.comment_id),
      'alreadyApplied', true
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.students
    WHERE tenant_id = p_tenant_id AND id = v_student
      AND lower(status) NOT IN ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
  ) THEN
    RAISE EXCEPTION 'Active LMS student record is required' USING ERRCODE = '42501';
  END IF;

  SELECT course.id, material.duration_seconds
  INTO v_course, v_duration_seconds
  FROM public.lms_materials AS material
  JOIN public.lms_course_modules AS module
    ON module.tenant_id = material.tenant_id AND module.id = material.module_id
  JOIN public.lms_courses AS course
    ON course.tenant_id = module.tenant_id AND course.id = module.course_id AND course.status = 'published'
  JOIN public.lms_enrollments AS enrollment
    ON enrollment.tenant_id = course.tenant_id AND enrollment.course_id = course.id
    AND enrollment.student_id = v_student AND enrollment.status = 'active'
  WHERE material.tenant_id = p_tenant_id AND material.id = p_material_id;

  IF v_course IS NULL THEN
    RAISE EXCEPTION 'LMS material is not available to this student' USING ERRCODE = '42501';
  END IF;
  IF v_duration_seconds IS NOT NULL AND p_timestamp_seconds > v_duration_seconds THEN
    RAISE EXCEPTION 'LMS timestamp exceeds the material duration' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'note' THEN
    INSERT INTO public.lms_student_notes(tenant_id, student_id, material_id, timestamp_seconds, note)
    VALUES (p_tenant_id, v_student, p_material_id, p_timestamp_seconds, v_text)
    RETURNING id INTO v_record_id;

    INSERT INTO public.lms_learning_record_requests(
      tenant_id, request_id, actor_user_id, kind, material_id, student_id, note_id, payload_fingerprint
    ) VALUES (
      p_tenant_id, p_request_id, p_actor_user_id, p_kind, p_material_id, v_student, v_record_id, v_fingerprint
    );
  ELSE
    INSERT INTO public.lms_material_comments(tenant_id, student_id, material_id, timestamp_seconds, comment)
    VALUES (p_tenant_id, v_student, p_material_id, p_timestamp_seconds, v_text)
    RETURNING id INTO v_record_id;

    INSERT INTO public.lms_learning_record_requests(
      tenant_id, request_id, actor_user_id, kind, material_id, student_id, comment_id, payload_fingerprint
    ) VALUES (
      p_tenant_id, p_request_id, p_actor_user_id, p_kind, p_material_id, v_student, v_record_id, v_fingerprint
    );
  END IF;

  RETURN jsonb_build_object('id', v_record_id, 'alreadyApplied', false);
END;
$$;

REVOKE ALL ON FUNCTION public.add_lms_learning_record(UUID, UUID, UUID, TEXT, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_lms_learning_record(UUID, UUID, UUID, TEXT, UUID, INTEGER, TEXT) TO service_role;

COMMENT ON TABLE public.lms_learning_record_requests IS
  'Immutable tenant-scoped retry ledger for LMS notes/comments; stores only a payload fingerprint and record reference, never raw note or comment text.';
COMMIT;
