-- Tenant-scoped LMS catalog, enrollments, assignments, student progress, notes, and review.
BEGIN;

CREATE TABLE public.lms_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 100),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT,
  created_by UUID NOT NULL, updated_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE UNIQUE INDEX lms_categories_legacy_source_uq ON public.lms_categories(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.lms_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  category_id UUID, category_name TEXT NOT NULL DEFAULT 'Umum' CHECK (length(btrim(category_name)) BETWEEN 1 AND 100), title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 5000), grade TEXT NOT NULL DEFAULT '' CHECK (length(grade) <= 80),
  instructor_user_id UUID NOT NULL, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  color TEXT NOT NULL DEFAULT 'indigo' CHECK (color IN ('indigo', 'emerald', 'amber', 'blue', 'rose', 'violet', 'slate')),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT,
  client_request_id UUID NOT NULL, created_by UUID NOT NULL, updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, category_id) REFERENCES public.lms_categories(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, instructor_user_id) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX lms_courses_tenant_status_idx ON public.lms_courses(tenant_id, status, title);
CREATE UNIQUE INDEX lms_courses_legacy_source_uq ON public.lms_courses(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.lms_course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, course_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180), description TEXT NOT NULL DEFAULT '' CHECK (length(description) <= 3000),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0), client_request_id UUID NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT,
  created_by UUID NOT NULL, updated_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, course_id, client_request_id), UNIQUE (tenant_id, course_id, display_order),
  FOREIGN KEY (tenant_id, course_id) REFERENCES public.lms_courses(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE UNIQUE INDEX lms_modules_legacy_source_uq ON public.lms_course_modules(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.lms_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, module_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  material_type TEXT NOT NULL CHECK (material_type IN ('video', 'pdf', 'link', 'text')),
  resource_url TEXT NOT NULL DEFAULT '' CHECK (length(resource_url) <= 2048), body TEXT NOT NULL DEFAULT '' CHECK (length(body) <= 12000),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0), client_request_id UUID NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT,
  created_by UUID NOT NULL, updated_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, module_id, client_request_id), UNIQUE (tenant_id, module_id, display_order),
  FOREIGN KEY (tenant_id, module_id) REFERENCES public.lms_course_modules(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL)),
  CHECK ((material_type = 'text' AND length(btrim(body)) > 0) OR material_type <> 'text'),
  CHECK ((material_type <> 'text' AND resource_url ~ '^https://') OR material_type = 'text')
);
CREATE UNIQUE INDEX lms_materials_legacy_source_uq ON public.lms_materials(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.lms_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, course_id UUID NOT NULL, student_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'withdrawn')),
  enrolled_by UUID NOT NULL, enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, course_id, student_id),
  FOREIGN KEY (tenant_id, course_id) REFERENCES public.lms_courses(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, enrolled_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX lms_enrollments_student_idx ON public.lms_enrollments(tenant_id, student_id, status, enrolled_at DESC);

CREATE TABLE public.lms_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, course_id UUID NOT NULL, module_id UUID,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 180), instructions TEXT NOT NULL DEFAULT '' CHECK (length(instructions) <= 12000),
  due_at TIMESTAMPTZ, allow_late BOOLEAN NOT NULL DEFAULT false, max_score NUMERIC(6,2) NOT NULL DEFAULT 100 CHECK (max_score BETWEEN 0 AND 1000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')), client_request_id UUID NOT NULL,
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT, source_fingerprint TEXT,
  created_by UUID NOT NULL, updated_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, course_id, client_request_id),
  FOREIGN KEY (tenant_id, course_id) REFERENCES public.lms_courses(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, module_id) REFERENCES public.lms_course_modules(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE UNIQUE INDEX lms_assignments_legacy_source_uq ON public.lms_assignments(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.lms_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, assignment_id UUID NOT NULL, student_id UUID NOT NULL,
  response_text TEXT NOT NULL DEFAULT '' CHECK (length(response_text) <= 12000), resource_url TEXT NOT NULL DEFAULT '' CHECK (length(resource_url) <= 2048),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(), score NUMERIC(6,2), feedback TEXT NOT NULL DEFAULT '' CHECK (length(feedback) <= 5000),
  graded_by UUID, graded_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, assignment_id, student_id),
  FOREIGN KEY (tenant_id, assignment_id) REFERENCES public.lms_assignments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, graded_by) REFERENCES public.profiles(tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((score IS NULL AND graded_by IS NULL AND graded_at IS NULL) OR (score BETWEEN 0 AND 1000 AND graded_by IS NOT NULL AND graded_at IS NOT NULL))
);
CREATE INDEX lms_submissions_assignment_idx ON public.lms_submissions(tenant_id, assignment_id, submitted_at DESC);

CREATE TABLE public.lms_material_progress (
  tenant_id UUID NOT NULL, student_id UUID NOT NULL, material_id UUID NOT NULL,
  position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (position_seconds BETWEEN 0 AND 86400),
  completed_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, student_id, material_id),
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, material_id) REFERENCES public.lms_materials(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE public.lms_student_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, student_id UUID NOT NULL, material_id UUID NOT NULL,
  timestamp_seconds INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_seconds BETWEEN 0 AND 86400), note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, material_id) REFERENCES public.lms_materials(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX lms_student_notes_lookup_idx ON public.lms_student_notes(tenant_id, student_id, material_id, created_at DESC);

CREATE TABLE public.lms_material_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL, student_id UUID NOT NULL, material_id UUID NOT NULL,
  timestamp_seconds INTEGER NOT NULL DEFAULT 0 CHECK (timestamp_seconds BETWEEN 0 AND 86400), comment TEXT NOT NULL CHECK (length(btrim(comment)) BETWEEN 1 AND 3000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, student_id) REFERENCES public.students(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, material_id) REFERENCES public.lms_materials(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX lms_material_comments_lookup_idx ON public.lms_material_comments(tenant_id, material_id, created_at);

CREATE TABLE public.lms_legacy_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count >= 0), imported_count INTEGER NOT NULL CHECK (imported_count >= 0),
  skipped_count INTEGER NOT NULL CHECK (skipped_count >= 0), created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,snapshot_fingerprint),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

DO $$ DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['lms_categories','lms_courses','lms_course_modules','lms_materials','lms_enrollments','lms_assignments','lms_submissions','lms_material_progress','lms_student_notes','lms_material_comments','lms_legacy_import_batches'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.manage_lms_catalog(p_tenant_id UUID, p_actor_user_id UUID, p_action TEXT, p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_role TEXT; v_teacher UUID; v_student UUID; v_id UUID; v_course_id UUID; v_module_id UUID; v_category_id UUID;
  v_category_name TEXT;
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
      SELECT id INTO v_id FROM public.lms_courses WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
      IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'alreadyApplied',true); END IF;
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
        SELECT id INTO v_module_id FROM public.lms_course_modules WHERE tenant_id=p_tenant_id AND course_id=v_course_id AND client_request_id=v_request;
        IF v_module_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_module_id,'alreadyApplied',true); END IF;
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
        SELECT id INTO v_id FROM public.lms_materials WHERE tenant_id=p_tenant_id AND module_id=v_module_id AND client_request_id=v_request;
        IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'alreadyApplied',true); END IF;
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
        SELECT id INTO v_id FROM public.lms_assignments WHERE tenant_id=p_tenant_id AND course_id=v_course_id AND client_request_id=v_request;
        IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'alreadyApplied',true); END IF;
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

CREATE OR REPLACE FUNCTION public.import_legacy_lms_catalog(p_tenant_id UUID,p_actor_user_id UUID,p_snapshot_fingerprint TEXT,p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_role TEXT; v_item JSONB; v_kind TEXT; v_id UUID; v_parent UUID; v_module UUID; v_category UUID;
  v_source_id TEXT; v_parent_source_id TEXT; v_module_source_id TEXT; v_fp TEXT; v_existing_fp TEXT;
  v_name TEXT; v_title TEXT; v_description TEXT; v_category_name TEXT; v_teacher UUID; v_status TEXT; v_type TEXT;
  v_imported INTEGER:=0; v_skipped INTEGER:=0; v_source_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_snapshot_fingerprint IS NULL
    OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$' OR p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid legacy LMS import input' USING ERRCODE='22023';
  END IF;
  v_source_count:=jsonb_array_length(p_items);
  IF v_source_count>7000 THEN RAISE EXCEPTION 'LMS import exceeds safe record limit' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'LMS tenant is unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin')
    AND (NOT(module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms','false')='true') FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'LMS legacy import requires an authorized tenant Admin' USING ERRCODE='42501'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('lms-legacy-import:'||p_tenant_id::TEXT,0));
  IF EXISTS(SELECT 1 FROM public.lms_legacy_import_batches WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint) THEN
    RETURN (SELECT jsonb_build_object('imported',imported_count,'skipped',skipped_count,'alreadyApplied',true) FROM public.lms_legacy_import_batches WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint);
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) item GROUP BY item.value->>'kind',item.value->>'sourceRecordId' HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Legacy LMS snapshot contains duplicate source keys' USING ERRCODE='23505';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) ORDER BY CASE value->>'kind' WHEN 'category' THEN 1 WHEN 'course' THEN 2 WHEN 'module' THEN 3 WHEN 'material' THEN 4 WHEN 'assignment' THEN 5 ELSE 99 END
  LOOP
    v_kind:=v_item->>'kind'; v_source_id:=btrim(v_item->>'sourceRecordId'); v_fp:=v_item->>'sourceFingerprint';
    v_parent_source_id:=NULLIF(v_item->>'parentCourseSourceRecordId',''); v_module_source_id:=NULLIF(v_item->>'parentModuleSourceRecordId','');
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' OR v_kind NOT IN ('category','course','module','material','assignment')
      OR v_source_id IS NULL OR length(v_source_id) NOT BETWEEN 1 AND 300 OR v_fp IS NULL OR v_fp !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Legacy LMS record source is invalid' USING ERRCODE='22023';
    END IF;
    v_id:=NULL; v_existing_fp:=NULL;
    IF v_kind='category' THEN SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.lms_categories WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
    ELSIF v_kind='course' THEN SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.lms_courses WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
    ELSIF v_kind='module' THEN SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.lms_course_modules WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
    ELSIF v_kind='material' THEN SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.lms_materials WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
    ELSE SELECT id,source_fingerprint INTO v_id,v_existing_fp FROM public.lms_assignments WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id; END IF;
    IF v_id IS NOT NULL THEN
      IF v_existing_fp IS DISTINCT FROM v_fp THEN RAISE EXCEPTION 'Legacy LMS record changed after import preview' USING ERRCODE='23514'; END IF;
      v_skipped:=v_skipped+1; CONTINUE;
    END IF;

    v_title:=btrim(v_item->>'title'); v_description:=COALESCE(v_item->>'description','');
    IF v_kind='category' THEN
      v_name:=btrim(v_item->>'name'); v_description:=COALESCE(v_item->>'description',''); v_status:=COALESCE(v_item->>'status','active');
      IF length(v_name) NOT BETWEEN 1 AND 100 OR length(v_description)>1000 OR v_status NOT IN ('active','archived') THEN RAISE EXCEPTION 'Invalid legacy LMS category' USING ERRCODE='22023'; END IF;
      INSERT INTO public.lms_categories(tenant_id,name,description,status,source_system,source_record_id,source_fingerprint,created_by,updated_by)
      VALUES(p_tenant_id,v_name,v_description,v_status,'legacy_firestore',v_source_id,v_fp,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    ELSIF v_kind='course' THEN
      v_name:=btrim(v_item->>'title'); v_description:=COALESCE(v_item->>'description',''); v_category_name:=COALESCE(NULLIF(btrim(v_item->>'categoryName'),''),'Umum');
      v_teacher:=NULLIF(v_item->>'instructorUserId','')::UUID; v_status:=COALESCE(v_item->>'status','published');
      IF length(v_name) NOT BETWEEN 1 AND 180 OR length(v_description)>5000 OR length(COALESCE(v_item->>'grade',''))>80
        OR length(v_category_name)>100 OR v_teacher IS NULL OR v_status NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Invalid legacy LMS course' USING ERRCODE='22023'; END IF;
      IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=v_teacher AND role='ustadz' AND status='active') THEN RAISE EXCEPTION 'Legacy course instructor could not be mapped to an active tenant teacher' USING ERRCODE='23503'; END IF;
      v_category:=NULL;
      IF NULLIF(v_item->>'categorySourceRecordId','') IS NOT NULL THEN SELECT id INTO v_category FROM public.lms_categories WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_item->>'categorySourceRecordId';
      ELSE SELECT id INTO v_category FROM public.lms_categories WHERE tenant_id=p_tenant_id AND name=v_category_name AND status='active'; END IF;
      INSERT INTO public.lms_courses(tenant_id,category_id,category_name,title,description,grade,instructor_user_id,status,color,source_system,source_record_id,source_fingerprint,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_category,v_category_name,v_name,v_description,COALESCE(v_item->>'grade',''),v_teacher,v_status,COALESCE(v_item->>'color','indigo'),'legacy_firestore',v_source_id,v_fp,gen_random_uuid(),p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    ELSIF v_kind='module' THEN
      v_parent:=NULL; SELECT id INTO v_parent FROM public.lms_courses WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_parent_source_id;
      IF v_parent IS NULL OR length(v_title) NOT BETWEEN 1 AND 180 OR length(v_description)>3000 THEN RAISE EXCEPTION 'Invalid or unmapped legacy LMS module' USING ERRCODE='23503'; END IF;
      INSERT INTO public.lms_course_modules(tenant_id,course_id,title,description,display_order,client_request_id,source_system,source_record_id,source_fingerprint,created_by,updated_by)
      VALUES(p_tenant_id,v_parent,v_title,v_description,COALESCE((v_item->>'displayOrder')::INTEGER,0),gen_random_uuid(),'legacy_firestore',v_source_id,v_fp,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    ELSIF v_kind='material' THEN
      v_parent:=NULL; SELECT id INTO v_parent FROM public.lms_course_modules WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_module_source_id;
      v_type:=COALESCE(v_item->>'materialType','link');
      IF v_parent IS NULL OR length(v_title) NOT BETWEEN 1 AND 180 OR v_type NOT IN ('video','pdf','link','text') OR length(COALESCE(v_item->>'resourceUrl',''))>2048 OR length(COALESCE(v_item->>'body',''))>12000 THEN RAISE EXCEPTION 'Invalid or unmapped legacy LMS material' USING ERRCODE='22023'; END IF;
      IF (v_type='text' AND length(btrim(COALESCE(v_item->>'body','')))=0) OR (v_type<>'text' AND COALESCE(v_item->>'resourceUrl','') !~ '^https://') THEN RAISE EXCEPTION 'Legacy LMS material is missing safe content' USING ERRCODE='22023'; END IF;
      INSERT INTO public.lms_materials(tenant_id,module_id,title,material_type,resource_url,body,duration_seconds,display_order,client_request_id,source_system,source_record_id,source_fingerprint,created_by,updated_by)
      VALUES(p_tenant_id,v_parent,v_title,v_type,COALESCE(v_item->>'resourceUrl',''),COALESCE(v_item->>'body',''),NULLIF(v_item->>'durationSeconds','')::INTEGER,COALESCE((v_item->>'displayOrder')::INTEGER,0),gen_random_uuid(),'legacy_firestore',v_source_id,v_fp,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    ELSE
      v_parent:=NULL; SELECT id INTO v_parent FROM public.lms_courses WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_parent_source_id;
      v_module:=NULL; IF v_module_source_id IS NOT NULL THEN SELECT id INTO v_module FROM public.lms_course_modules WHERE tenant_id=p_tenant_id AND course_id=v_parent AND source_system='legacy_firestore' AND source_record_id=v_module_source_id; END IF;
      v_status:=COALESCE(v_item->>'status','draft');
      IF v_parent IS NULL OR length(v_title) NOT BETWEEN 1 AND 180 OR length(COALESCE(v_item->>'instructions',''))>12000 OR v_status NOT IN ('draft','published','archived') THEN RAISE EXCEPTION 'Invalid or unmapped legacy LMS assignment' USING ERRCODE='22023'; END IF;
      INSERT INTO public.lms_assignments(tenant_id,course_id,module_id,title,instructions,due_at,allow_late,max_score,status,client_request_id,source_system,source_record_id,source_fingerprint,created_by,updated_by)
      VALUES(p_tenant_id,v_parent,v_module,v_title,COALESCE(v_item->>'instructions',''),NULLIF(v_item->>'dueAt','')::TIMESTAMPTZ,COALESCE((v_item->>'allowLate')::BOOLEAN,false),COALESCE((v_item->>'maxScore')::NUMERIC,100),v_status,gen_random_uuid(),'legacy_firestore',v_source_id,v_fp,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    END IF;
    v_imported:=v_imported+1;
  END LOOP;
  INSERT INTO public.lms_legacy_import_batches(tenant_id,snapshot_fingerprint,source_count,imported_count,skipped_count,created_by)
  VALUES(p_tenant_id,p_snapshot_fingerprint,v_source_count,v_imported,v_skipped,p_actor_user_id);
  RETURN jsonb_build_object('imported',v_imported,'skipped',v_skipped,'alreadyApplied',false);
END; $$;

CREATE OR REPLACE FUNCTION public.save_lms_progress(p_tenant_id UUID,p_actor_user_id UUID,p_material_id UUID,p_position_seconds INTEGER,p_completed BOOLEAN)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_student UUID; v_course UUID;
BEGIN
  SELECT CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN linked_santri_id::UUID ELSE NULL END
  INTO v_student FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND role='santri' AND status='active'
    AND (NOT(module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms','false')='true') FOR SHARE;
  IF v_student IS NULL OR p_position_seconds NOT BETWEEN 0 AND 86400 THEN RAISE EXCEPTION 'Invalid LMS progress profile or position' USING ERRCODE = '22023'; END IF;
  SELECT course.id INTO v_course FROM public.lms_materials material JOIN public.lms_course_modules module ON module.tenant_id=material.tenant_id AND module.id=material.module_id
    JOIN public.lms_courses course ON course.tenant_id=module.tenant_id AND course.id=module.course_id
    JOIN public.lms_enrollments enrollment ON enrollment.tenant_id=course.tenant_id AND enrollment.course_id=course.id AND enrollment.student_id=v_student AND enrollment.status='active'
  WHERE material.tenant_id=p_tenant_id AND material.id=p_material_id AND course.status='published';
  IF v_course IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active')
    OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student AND lower(status) NOT IN ('archived','alumni','graduated','inactive','nonaktif','dikeluarkan')) THEN RAISE EXCEPTION 'LMS material is not available to this student' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.lms_material_progress(tenant_id,student_id,material_id,position_seconds,completed_at,updated_at)
  VALUES(p_tenant_id,v_student,p_material_id,p_position_seconds,CASE WHEN p_completed THEN now() ELSE NULL END,now())
  ON CONFLICT(tenant_id,student_id,material_id) DO UPDATE SET position_seconds=GREATEST(lms_material_progress.position_seconds,EXCLUDED.position_seconds),
    completed_at=COALESCE(lms_material_progress.completed_at,EXCLUDED.completed_at),updated_at=now();
  RETURN jsonb_build_object('saved',true);
END; $$;

CREATE OR REPLACE FUNCTION public.add_lms_learning_record(p_tenant_id UUID,p_actor_user_id UUID,p_kind TEXT,p_material_id UUID,p_timestamp_seconds INTEGER,p_text TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_student UUID; v_course UUID; v_id UUID;
BEGIN
  SELECT CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN linked_santri_id::UUID ELSE NULL END
  INTO v_student FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND role='santri' AND status='active'
    AND (NOT(module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms','false')='true') FOR SHARE;
  IF v_student IS NULL OR p_kind NOT IN ('note','comment') OR p_timestamp_seconds NOT BETWEEN 0 AND 86400 OR length(btrim(p_text)) NOT BETWEEN 1 AND 3000 THEN RAISE EXCEPTION 'Invalid LMS learning record' USING ERRCODE = '22023'; END IF;
  SELECT course.id INTO v_course FROM public.lms_materials material JOIN public.lms_course_modules module ON module.tenant_id=material.tenant_id AND module.id=material.module_id
    JOIN public.lms_courses course ON course.tenant_id=module.tenant_id AND course.id=module.course_id
    JOIN public.lms_enrollments enrollment ON enrollment.tenant_id=course.tenant_id AND enrollment.course_id=course.id AND enrollment.student_id=v_student AND enrollment.status='active'
  WHERE material.tenant_id=p_tenant_id AND material.id=p_material_id AND course.status='published';
  IF v_course IS NULL OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'LMS material is not available to this student' USING ERRCODE = '42501'; END IF;
  IF p_kind='note' THEN INSERT INTO public.lms_student_notes(tenant_id,student_id,material_id,timestamp_seconds,note) VALUES(p_tenant_id,v_student,p_material_id,p_timestamp_seconds,btrim(p_text)) RETURNING id INTO v_id;
  ELSE INSERT INTO public.lms_material_comments(tenant_id,student_id,material_id,timestamp_seconds,comment) VALUES(p_tenant_id,v_student,p_material_id,p_timestamp_seconds,btrim(p_text)) RETURNING id INTO v_id; END IF;
  RETURN jsonb_build_object('id',v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.submit_lms_assignment(p_tenant_id UUID,p_actor_user_id UUID,p_assignment_id UUID,p_text TEXT,p_url TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_student UUID; v_assignment public.lms_assignments%ROWTYPE; v_id UUID;
BEGIN
  SELECT CASE WHEN linked_santri_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN linked_santri_id::UUID ELSE NULL END
  INTO v_student FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND role='santri' AND status='active'
    AND (NOT(module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms','false')='true') FOR SHARE;
  IF v_student IS NULL OR length(COALESCE(p_text,''))>12000 OR length(COALESCE(p_url,''))>2048
    OR (length(btrim(COALESCE(p_text,'')))=0 AND length(btrim(COALESCE(p_url,'')))=0)
    OR (length(btrim(COALESCE(p_url,'')))>0 AND p_url !~ '^https://') THEN RAISE EXCEPTION 'Invalid LMS assignment submission' USING ERRCODE = '22023'; END IF;
  SELECT assignment.* INTO v_assignment FROM public.lms_assignments assignment JOIN public.lms_enrollments enrollment
    ON enrollment.tenant_id=assignment.tenant_id AND enrollment.course_id=assignment.course_id AND enrollment.student_id=v_student AND enrollment.status='active'
    JOIN public.lms_courses course ON course.tenant_id=assignment.tenant_id AND course.id=assignment.course_id AND course.status='published'
  WHERE assignment.tenant_id=p_tenant_id AND assignment.id=p_assignment_id AND assignment.status='published' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.students WHERE tenant_id=p_tenant_id AND id=v_student AND lower(status) NOT IN ('archived','alumni','graduated','inactive','nonaktif','dikeluarkan')) THEN RAISE EXCEPTION 'LMS assignment is not available to this student' USING ERRCODE = '42501'; END IF;
  IF v_assignment.due_at IS NOT NULL AND now()>v_assignment.due_at AND NOT v_assignment.allow_late THEN RAISE EXCEPTION 'LMS assignment deadline has passed' USING ERRCODE = '23514'; END IF;
  INSERT INTO public.lms_submissions(tenant_id,assignment_id,student_id,response_text,resource_url)
  VALUES(p_tenant_id,p_assignment_id,v_student,COALESCE(p_text,''),COALESCE(p_url,''))
  ON CONFLICT(tenant_id,assignment_id,student_id) DO UPDATE SET response_text=EXCLUDED.response_text,resource_url=EXCLUDED.resource_url,submitted_at=now(),updated_at=now()
    WHERE lms_submissions.score IS NULL RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'A graded LMS submission cannot be replaced' USING ERRCODE = '23514'; END IF;
  RETURN jsonb_build_object('id',v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.grade_lms_submission(p_tenant_id UUID,p_actor_user_id UUID,p_submission_id UUID,p_score NUMERIC,p_feedback TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_role TEXT; v_id UUID;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active'
    AND role IN ('admin','super_admin','ustadz') AND (NOT(module_permissions ? 'lms') OR COALESCE(module_permissions->>'lms','false')='true') FOR SHARE;
  IF v_role IS NULL OR length(COALESCE(p_feedback,''))>5000 OR NOT EXISTS(SELECT 1 FROM public.tenants WHERE id=p_tenant_id AND status='active') THEN RAISE EXCEPTION 'LMS grading is not authorized or feedback is invalid' USING ERRCODE = '42501'; END IF;
  UPDATE public.lms_submissions submission SET score=p_score,feedback=COALESCE(p_feedback,''),graded_by=p_actor_user_id,graded_at=now(),updated_at=now()
  FROM public.lms_assignments assignment JOIN public.lms_courses course ON course.tenant_id=assignment.tenant_id AND course.id=assignment.course_id
  WHERE submission.tenant_id=p_tenant_id AND submission.id=p_submission_id AND assignment.tenant_id=submission.tenant_id AND assignment.id=submission.assignment_id
    AND p_score BETWEEN 0 AND assignment.max_score AND (v_role IN ('admin','super_admin') OR course.instructor_user_id=p_actor_user_id)
  RETURNING submission.id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Submission not found or score exceeds the assignment range' USING ERRCODE = 'P0002'; END IF;
  RETURN jsonb_build_object('id',v_id);
END; $$;

REVOKE ALL ON FUNCTION public.manage_lms_catalog(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_lms_catalog(UUID,UUID,TEXT,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.import_legacy_lms_catalog(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_legacy_lms_catalog(UUID,UUID,TEXT,JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.save_lms_progress(UUID,UUID,UUID,INTEGER,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_lms_progress(UUID,UUID,UUID,INTEGER,BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.add_lms_learning_record(UUID,UUID,TEXT,UUID,INTEGER,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_lms_learning_record(UUID,UUID,TEXT,UUID,INTEGER,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.submit_lms_assignment(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_lms_assignment(UUID,UUID,UUID,TEXT,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.grade_lms_submission(UUID,UUID,UUID,NUMERIC,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grade_lms_submission(UUID,UUID,UUID,NUMERIC,TEXT) TO service_role;

COMMENT ON TABLE public.lms_material_progress IS 'Tenant-scoped learning progress keyed by the authenticated profile-linked student; no browser direct table access.';
COMMIT;
