-- Enforce active student and media bounds on LMS progress while preserving monotonic progress.
BEGIN;

CREATE OR REPLACE FUNCTION public.save_lms_progress(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_material_id UUID,
  p_position_seconds INTEGER,
  p_completed BOOLEAN
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
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_material_id IS NULL
    OR p_position_seconds IS NULL OR p_position_seconds NOT BETWEEN 0 AND 86400
    OR p_completed IS NULL THEN
    RAISE EXCEPTION 'Invalid LMS progress profile or position' USING ERRCODE = '22023';
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
  IF v_duration_seconds IS NOT NULL AND p_position_seconds > v_duration_seconds THEN
    RAISE EXCEPTION 'LMS progress exceeds the material duration' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.lms_material_progress(
    tenant_id, student_id, material_id, position_seconds, completed_at, updated_at
  )
  VALUES (
    p_tenant_id, v_student, p_material_id, p_position_seconds,
    CASE WHEN p_completed THEN now() ELSE NULL END, now()
  )
  ON CONFLICT (tenant_id, student_id, material_id) DO UPDATE SET
    position_seconds = GREATEST(public.lms_material_progress.position_seconds, EXCLUDED.position_seconds),
    completed_at = COALESCE(public.lms_material_progress.completed_at, EXCLUDED.completed_at),
    updated_at = now();

  RETURN jsonb_build_object('saved', true);
END;
$$;

REVOKE ALL ON FUNCTION public.save_lms_progress(UUID, UUID, UUID, INTEGER, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_lms_progress(UUID, UUID, UUID, INTEGER, BOOLEAN) TO service_role;

COMMENT ON TABLE public.lms_material_progress IS
  'Tenant-scoped monotonic learning progress. Positions cannot exceed a known material duration, and completion is retained once achieved.';
COMMIT;
