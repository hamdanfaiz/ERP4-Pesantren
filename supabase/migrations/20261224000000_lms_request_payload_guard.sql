-- Match LMS catalog retries to the original actor and stored entity payload.
BEGIN;
CREATE OR REPLACE FUNCTION public.manage_lms_catalog(p_tenant_id UUID, p_actor_user_id UUID, p_action TEXT, p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_role TEXT; v_teacher UUID; v_student UUID; v_id UUID; v_course_id UUID; v_module_id UUID; v_category_id UUID;
  v_category_name TEXT;
  v_existing_course public.lms_courses%ROWTYPE;
  v_existing_module public.lms_course_modules%ROWTYPE;
  v_existing_material public.lms_materials%ROWTYPE;
  v_existing_assignment public.lms_assignments%ROWTYPE;
  v_request UUID; v_status TEXT; v_name TEXT; v_description TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid LMS request' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN RAISE EXCEPTION 'LMS tenant is unavailable' USING ERRCODE = '42501'; END IF;
  SELECT role, CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN linked_santri_id::UUID ELSE NULL END
    INTO v_role, v_student FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active'
    AND (NOT (module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms','false') = 'true') FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Active LMS profile with permission is required' USING ERRCODE = '42501'; END IF;
  IF p_action IN ('category','course','module','material','assignment','enroll') AND v_role NOT IN ('admin','super_admin','ustadz') THEN
    RAISE EXCEPTION 'LMS catalog management is restricted to tenant educators' USING ERRCODE = '42501';
  END IF;
  IF p_action = 'category' THEN
    IF v_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Only tenant Admin can manage LMS categories' USING ERRCODE = '42501'; END IF;
    v_id := NULLIF(p_item->>'id','')::UUID; v_name := btrim(p_item->>'name'); v_description := COALESCE(p_item->>'description','');
    IF length(v_name) NOT BETWEEN 1 AND 100 OR length(v_description) > 1000 THEN RAISE EXCEPTION 'Invalid LMS category' USING ERRCODE = '22023'; END IF;
    IF v_id IS NULL THEN
      INSERT INTO public.lms_categories(tenant_id,name,description,created_by,updated_by) VALUES (p_tenant_id,v_name,v_description,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    ELSE
      UPDATE public.lms_categories SET name=v_name,description=v_description,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id AND status='active' RETURNING id INTO v_id;
      IF v_id IS NULL THEN RAISE EXCEPTION 'LMS category not found' USING ERRCODE = 'P0002'; END IF;
    END IF;
  ELSIF p_action = 'course' THEN
    v_id := NULLIF(p_item->>'id','')::UUID; v_request := NULLIF(p_item->>'clientRequestId','')::UUID;
    v_teacher := CASE WHEN v_role='ustadz' THEN p_actor_user_id ELSE NULLIF(p_item->>'instructorUserId','')::UUID END;
    v_category_id := NULLIF(p_item->>'categoryId','')::UUID; v_name := btrim(p_item->>'title'); v_description := COALESCE(p_item->>'description','');
    v_category_name := NULLIF(btrim(p_item->>'categoryName'),'');
    v_status := COALESCE(p_item->>'status','draft');
    IF v_request IS NULL OR v_teacher IS NULL OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_description)>5000
      OR length(COALESCE(p_item->>'grade',''))>80 OR v_status NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Invalid LMS course' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=v_teacher AND role='ustadz' AND status='active') THEN RAISE EXCEPTION 'Course instructor is not an active teacher in this tenant' USING ERRCODE = '23503'; END IF;
    IF v_category_id IS NOT NULL THEN
      SELECT name INTO v_category_name FROM public.lms_categories WHERE tenant_id=p_tenant_id AND id=v_category_id AND status='active';
      IF v_category_name IS NULL THEN RAISE EXCEPTION 'LMS category not found' USING ERRCODE = '23503'; END IF;
    ELSE v_category_name := COALESCE(v_category_name,'Umum'); END IF;
    IF length(v_category_name) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'LMS category name is invalid' USING ERRCODE = '22023'; END IF;
    IF v_id IS NULL THEN
      PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lms-course:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
      SELECT * INTO v_existing_course FROM public.lms_courses
      WHERE tenant_id=p_tenant_id AND client_request_id=v_request FOR UPDATE;
      IF FOUND THEN
        IF v_existing_course.created_by IS DISTINCT FROM p_actor_user_id
          OR v_existing_course.category_id IS DISTINCT FROM v_category_id
          OR v_existing_course.category_name IS DISTINCT FROM v_category_name
          OR v_existing_course.title IS DISTINCT FROM v_name
          OR v_existing_course.description IS DISTINCT FROM v_description
          OR v_existing_course.grade IS DISTINCT FROM COALESCE(p_item->>'grade','')
          OR v_existing_course.instructor_user_id IS DISTINCT FROM v_teacher
          OR v_existing_course.status IS DISTINCT FROM v_status
          OR v_existing_course.color IS DISTINCT FROM COALESCE(p_item->>'color','indigo') THEN
          RAISE EXCEPTION 'LMS request ID was already used for a different actor or payload' USING ERRCODE = '23505';
        END IF;
        RETURN jsonb_build_object('id',v_existing_course.id,'alreadyApplied',true);
      END IF;
      INSERT INTO public.lms_courses(tenant_id,category_id,category_name,title,description,grade,instructor_user_id,status,color,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_category_id,v_category_name,v_name,v_description,COALESCE(p_item->>'grade',''),v_teacher,v_status,COALESCE(p_item->>'color','indigo'),v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    ELSE
      UPDATE public.lms_courses SET category_id=v_category_id,category_name=v_category_name,title=v_name,description=v_description,grade=COALESCE(p_item->>'grade',''),
        instructor_user_id=v_teacher,status=v_status,color=COALESCE(p_item->>'color','indigo'),updated_by=p_actor_user_id,updated_at=now()
      WHERE tenant_id=p_tenant_id AND id=v_id AND (v_role IN ('admin','super_admin') OR instructor_user_id=p_actor_user_id) RETURNING id INTO v_id;
      IF v_id IS NULL THEN RAISE EXCEPTION 'Course not found or not assigned to this teacher' USING ERRCODE = 'P0002'; END IF;
    END IF;
  ELSIF p_action IN ('module','material','assignment','enroll') THEN
    v_course_id := NULLIF(p_item->>'courseId','')::UUID;
    IF v_course_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.lms_courses WHERE tenant_id=p_tenant_id AND id=v_course_id
      AND (v_role IN ('admin','super_admin') OR instructor_user_id=p_actor_user_id)) THEN RAISE EXCEPTION 'LMS course not found or not assigned to this teacher' USING ERRCODE = '42501'; END IF;
    IF p_action='module' THEN
      v_module_id := NULLIF(p_item->>'id','')::UUID; v_request := NULLIF(p_item->>'clientRequestId','')::UUID; v_name := btrim(p_item->>'title');
      IF v_request IS NULL OR length(v_name) NOT BETWEEN 1 AND 180 OR length(COALESCE(p_item->>'description',''))>3000 THEN RAISE EXCEPTION 'Invalid LMS module' USING ERRCODE = '22023'; END IF;
      IF v_module_id IS NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lms-module:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
        SELECT * INTO v_existing_module FROM public.lms_course_modules
        WHERE tenant_id=p_tenant_id AND course_id=v_course_id AND client_request_id=v_request FOR UPDATE;
        IF FOUND THEN
          IF v_existing_module.created_by IS DISTINCT FROM p_actor_user_id
            OR v_existing_module.title IS DISTINCT FROM v_name
            OR v_existing_module.description IS DISTINCT FROM COALESCE(p_item->>'description','')
            OR v_existing_module.display_order IS DISTINCT FROM COALESCE((p_item->>'displayOrder')::INTEGER,0) THEN
            RAISE EXCEPTION 'LMS request ID was already used for a different actor or payload' USING ERRCODE = '23505';
          END IF;
          RETURN jsonb_build_object('id',v_existing_module.id,'alreadyApplied',true);
        END IF;
        INSERT INTO public.lms_course_modules(tenant_id,course_id,title,description,display_order,client_request_id,created_by,updated_by)
        VALUES(p_tenant_id,v_course_id,v_name,COALESCE(p_item->>'description',''),COALESCE((p_item->>'displayOrder')::INTEGER,0),v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_module_id;
      ELSE
        UPDATE public.lms_course_modules SET title=v_name,description=COALESCE(p_item->>'description',''),display_order=COALESCE((p_item->>'displayOrder')::INTEGER,display_order),updated_by=p_actor_user_id,updated_at=now()
        WHERE tenant_id=p_tenant_id AND course_id=v_course_id AND id=v_module_id RETURNING id INTO v_module_id;
        IF v_module_id IS NULL THEN RAISE EXCEPTION 'LMS module not found' USING ERRCODE = 'P0002'; END IF;
      END IF;
      v_id := v_module_id;
    ELSIF p_action='material' THEN
      v_module_id := NULLIF(p_item->>'moduleId','')::UUID; v_id := NULLIF(p_item->>'id','')::UUID; v_request := NULLIF(p_item->>'clientRequestId','')::UUID;
      v_name := btrim(p_item->>'title'); v_status := COALESCE(p_item->>'type','link');
      IF v_request IS NULL OR v_module_id IS NULL OR length(v_name) NOT BETWEEN 1 AND 180 OR v_status NOT IN ('video','pdf','link','text') THEN RAISE EXCEPTION 'Invalid LMS material' USING ERRCODE = '22023'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.lms_course_modules WHERE tenant_id=p_tenant_id AND id=v_module_id AND course_id=v_course_id) THEN RAISE EXCEPTION 'LMS module not found' USING ERRCODE = '23503'; END IF;
      IF v_status <> 'text' AND COALESCE(p_item->>'url','') !~ '^https://' THEN RAISE EXCEPTION 'LMS material URL must use HTTPS' USING ERRCODE = '22023'; END IF;
      IF v_id IS NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lms-material:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
        SELECT * INTO v_existing_material FROM public.lms_materials
        WHERE tenant_id=p_tenant_id AND module_id=v_module_id AND client_request_id=v_request FOR UPDATE;
        IF FOUND THEN
          IF v_existing_material.created_by IS DISTINCT FROM p_actor_user_id
            OR v_existing_material.title IS DISTINCT FROM v_name
            OR v_existing_material.material_type IS DISTINCT FROM v_status
            OR v_existing_material.resource_url IS DISTINCT FROM COALESCE(p_item->>'url','')
            OR v_existing_material.body IS DISTINCT FROM COALESCE(p_item->>'body','')
            OR v_existing_material.duration_seconds IS DISTINCT FROM NULLIF(p_item->>'durationSeconds','')::INTEGER
            OR v_existing_material.display_order IS DISTINCT FROM COALESCE((p_item->>'displayOrder')::INTEGER,0) THEN
            RAISE EXCEPTION 'LMS request ID was already used for a different actor or payload' USING ERRCODE = '23505';
          END IF;
          RETURN jsonb_build_object('id',v_existing_material.id,'alreadyApplied',true);
        END IF;
        INSERT INTO public.lms_materials(tenant_id,module_id,title,material_type,resource_url,body,duration_seconds,display_order,client_request_id,created_by,updated_by)
        VALUES(p_tenant_id,v_module_id,v_name,v_status,COALESCE(p_item->>'url',''),COALESCE(p_item->>'body',''),NULLIF(p_item->>'durationSeconds','')::INTEGER,COALESCE((p_item->>'displayOrder')::INTEGER,0),v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
      ELSE
        UPDATE public.lms_materials SET title=v_name,material_type=v_status,resource_url=COALESCE(p_item->>'url',''),body=COALESCE(p_item->>'body',''),duration_seconds=NULLIF(p_item->>'durationSeconds','')::INTEGER,
          display_order=COALESCE((p_item->>'displayOrder')::INTEGER,display_order),updated_by=p_actor_user_id,updated_at=now()
        WHERE tenant_id=p_tenant_id AND module_id=v_module_id AND id=v_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'LMS material not found' USING ERRCODE = 'P0002'; END IF;
      END IF;
    ELSIF p_action='assignment' THEN
      v_id := NULLIF(p_item->>'id','')::UUID; v_request := NULLIF(p_item->>'clientRequestId','')::UUID;
      v_name := btrim(p_item->>'title'); v_status := COALESCE(p_item->>'status','draft'); v_module_id := NULLIF(p_item->>'moduleId','')::UUID;
      IF v_request IS NULL OR length(v_name) NOT BETWEEN 1 AND 180 OR length(COALESCE(p_item->>'instructions',''))>12000 OR v_status NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Invalid LMS assignment' USING ERRCODE = '22023'; END IF;
      IF v_module_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lms_course_modules WHERE tenant_id=p_tenant_id AND id=v_module_id AND course_id=v_course_id) THEN RAISE EXCEPTION 'Assignment module is outside course' USING ERRCODE = '23503'; END IF;
      IF v_id IS NULL THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lms-assignment:'||p_tenant_id::TEXT||':'||v_request::TEXT,0));
        SELECT * INTO v_existing_assignment FROM public.lms_assignments
        WHERE tenant_id=p_tenant_id AND course_id=v_course_id AND client_request_id=v_request FOR UPDATE;
        IF FOUND THEN
          IF v_existing_assignment.created_by IS DISTINCT FROM p_actor_user_id
            OR v_existing_assignment.module_id IS DISTINCT FROM v_module_id
            OR v_existing_assignment.title IS DISTINCT FROM v_name
            OR v_existing_assignment.instructions IS DISTINCT FROM COALESCE(p_item->>'instructions','')
            OR v_existing_assignment.due_at IS DISTINCT FROM NULLIF(p_item->>'dueAt','')::TIMESTAMPTZ
            OR v_existing_assignment.allow_late IS DISTINCT FROM COALESCE((p_item->>'allowLate')::BOOLEAN,false)
            OR v_existing_assignment.max_score IS DISTINCT FROM COALESCE((p_item->>'maxScore')::NUMERIC,100)
            OR v_existing_assignment.status IS DISTINCT FROM v_status THEN
            RAISE EXCEPTION 'LMS request ID was already used for a different actor or payload' USING ERRCODE = '23505';
          END IF;
          RETURN jsonb_build_object('id',v_existing_assignment.id,'alreadyApplied',true);
        END IF;
        INSERT INTO public.lms_assignments(tenant_id,course_id,module_id,title,instructions,due_at,allow_late,max_score,status,client_request_id,created_by,updated_by)
        VALUES(p_tenant_id,v_course_id,v_module_id,v_name,COALESCE(p_item->>'instructions',''),NULLIF(p_item->>'dueAt','')::TIMESTAMPTZ,COALESCE((p_item->>'allowLate')::BOOLEAN,false),COALESCE((p_item->>'maxScore')::NUMERIC,100),v_status,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
      ELSE
        UPDATE public.lms_assignments SET module_id=v_module_id,title=v_name,instructions=COALESCE(p_item->>'instructions',''),due_at=NULLIF(p_item->>'dueAt','')::TIMESTAMPTZ,
          allow_late=COALESCE((p_item->>'allowLate')::BOOLEAN,false),max_score=COALESCE((p_item->>'maxScore')::NUMERIC,100),status=v_status,updated_by=p_actor_user_id,updated_at=now()
        WHERE tenant_id=p_tenant_id AND course_id=v_course_id AND id=v_id RETURNING id INTO v_id;
        IF v_id IS NULL THEN RAISE EXCEPTION 'LMS assignment not found' USING ERRCODE = 'P0002'; END IF;
      END IF;
    ELSE
      v_student := NULLIF(p_item->>'studentId','')::UUID;
      IF v_student IS NULL OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student AND lower(status) NOT IN ('archived','alumni','graduated','inactive','nonaktif','dikeluarkan')) THEN RAISE EXCEPTION 'Active student in this tenant is required' USING ERRCODE = '23503'; END IF;
      INSERT INTO public.lms_enrollments(tenant_id,course_id,student_id,enrolled_by)
      VALUES(p_tenant_id,v_course_id,v_student,p_actor_user_id)
      ON CONFLICT(tenant_id,course_id,student_id) DO UPDATE SET status='active',enrolled_by=EXCLUDED.enrolled_by,updated_at=now() RETURNING id INTO v_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported LMS catalog action' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('id',v_id,'alreadyApplied',false);
END; $$;

COMMIT;
