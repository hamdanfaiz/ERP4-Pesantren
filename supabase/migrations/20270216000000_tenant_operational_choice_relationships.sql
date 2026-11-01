-- Canonical tenant choices for CBT, LMS grade scope, and HRIS job titles.
-- Existing operational labels are mapped into tenant references. All new manual
-- choices resolve to active tenant references; legacy imports are catalogued as they arrive.
BEGIN;

ALTER TABLE public.tenant_reference_items
  DROP CONSTRAINT tenant_reference_items_domain_check;
ALTER TABLE public.tenant_reference_items
  ADD CONSTRAINT tenant_reference_items_domain_check CHECK (domain IN (
    'academic_subject', 'academic_curriculum', 'academic_assessment_type', 'academic_grade_level',
    'cbt_question_template', 'hris_job_title', 'facility_resource',
    'finance_fee_type', 'finance_expense_category', 'marketplace_product_category',
    'cooperative_product_category', 'cooperative_supplier_category', 'library_book_category',
    'healthcare_medicine_category', 'healthcare_medicine_unit', 'ga_asset_category',
    'ga_inventory_category', 'ga_inventory_unit'
  ));

ALTER TABLE public.cbt_questions
  ADD COLUMN subject_reference_domain TEXT GENERATED ALWAYS AS ('academic_subject') STORED,
  ADD COLUMN subject_reference_id UUID,
  ADD COLUMN grade_level_reference_domain TEXT GENERATED ALWAYS AS ('academic_grade_level') STORED,
  ADD COLUMN grade_level_reference_id UUID,
  ADD COLUMN template_reference_domain TEXT GENERATED ALWAYS AS ('cbt_question_template') STORED,
  ADD COLUMN template_reference_id UUID,
  ADD CONSTRAINT cbt_questions_tenant_subject_reference_fk
    FOREIGN KEY (tenant_id, subject_reference_domain, subject_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT cbt_questions_tenant_grade_reference_fk
    FOREIGN KEY (tenant_id, grade_level_reference_domain, grade_level_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT cbt_questions_tenant_template_reference_fk
    FOREIGN KEY (tenant_id, template_reference_domain, template_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

ALTER TABLE public.cbt_exams
  ADD COLUMN subject_reference_domain TEXT GENERATED ALWAYS AS ('academic_subject') STORED,
  ADD COLUMN subject_reference_id UUID,
  ADD COLUMN grade_level_reference_domain TEXT GENERATED ALWAYS AS ('academic_grade_level') STORED,
  ADD COLUMN grade_level_reference_id UUID,
  ADD CONSTRAINT cbt_exams_tenant_subject_reference_fk
    FOREIGN KEY (tenant_id, subject_reference_domain, subject_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT,
  ADD CONSTRAINT cbt_exams_tenant_grade_reference_fk
    FOREIGN KEY (tenant_id, grade_level_reference_domain, grade_level_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

ALTER TABLE public.lms_courses
  ADD COLUMN grade_level_reference_domain TEXT GENERATED ALWAYS AS ('academic_grade_level') STORED,
  ADD COLUMN grade_level_reference_id UUID,
  ADD CONSTRAINT lms_courses_tenant_grade_reference_fk
    FOREIGN KEY (tenant_id, grade_level_reference_domain, grade_level_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

ALTER TABLE public.hris_employees
  ADD COLUMN job_title_reference_domain TEXT GENERATED ALWAYS AS ('hris_job_title') STORED,
  ADD COLUMN job_title_reference_id UUID,
  ADD CONSTRAINT hris_employees_tenant_job_title_reference_fk
    FOREIGN KEY (tenant_id, job_title_reference_domain, job_title_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

ALTER TABLE public.candidates
  ADD COLUMN grade_level_reference_domain TEXT GENERATED ALWAYS AS ('academic_grade_level') STORED,
  ADD COLUMN grade_level_reference_id UUID,
  ADD COLUMN class_category TEXT GENERATED ALWAYS AS ('Kelas') STORED,
  ADD COLUMN dormitory_category TEXT GENERATED ALWAYS AS ('Gedung') STORED,
  ADD COLUMN room_category TEXT GENERATED ALWAYS AS ('Kamar') STORED,
  ADD CONSTRAINT candidates_tenant_grade_reference_fk
    FOREIGN KEY (tenant_id, grade_level_reference_domain, grade_level_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

ALTER TABLE public.master_data_records
  ADD COLUMN grade_level_reference_domain TEXT GENERATED ALWAYS AS ('academic_grade_level') STORED,
  ADD COLUMN grade_level_reference_id UUID,
  ADD CONSTRAINT master_data_records_tenant_grade_reference_fk
    FOREIGN KEY (tenant_id, grade_level_reference_domain, grade_level_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

ALTER TABLE public.students
  ADD COLUMN grade_level_reference_domain TEXT GENERATED ALWAYS AS ('academic_grade_level') STORED,
  ADD COLUMN grade_level_reference_id UUID,
  ADD CONSTRAINT students_tenant_grade_reference_fk
    FOREIGN KEY (tenant_id, grade_level_reference_domain, grade_level_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

ALTER TABLE public.finance_bills
  ADD COLUMN grade_level_reference_domain TEXT GENERATED ALWAYS AS ('academic_grade_level') STORED,
  ADD COLUMN grade_level_reference_id UUID,
  ADD CONSTRAINT finance_bills_tenant_grade_reference_fk
    FOREIGN KEY (tenant_id, grade_level_reference_domain, grade_level_reference_id)
    REFERENCES public.tenant_reference_items (tenant_id, domain, id) ON DELETE RESTRICT;

-- Historical operational labels become explicit tenant-owned catalog entries.
-- Existing names are preserved; generated descriptions identify why the option exists.
CREATE OR REPLACE FUNCTION public.ensure_tenant_reference_item(
  p_tenant_id UUID, p_domain TEXT, p_name TEXT, p_actor_user_id UUID
)
RETURNS UUID LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v_id UUID; v_name TEXT; v_code TEXT;
BEGIN
  v_name := btrim(COALESCE(p_name, ''));
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_domain IS NULL
    OR p_domain NOT IN ('academic_subject','academic_grade_level','cbt_question_template','hris_job_title')
    OR length(v_name) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Pilihan historis tidak dapat dipetakan ke katalog tenant' USING ERRCODE = '23503';
  END IF;
  SELECT id INTO v_id FROM public.tenant_reference_items
  WHERE tenant_id = p_tenant_id AND domain = p_domain AND lower(btrim(name)) = lower(v_name)
  ORDER BY (status = 'active') DESC, id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_code := 'MIGRASI_' || substr(md5(p_tenant_id::TEXT || ':' || p_domain || ':' || lower(v_name)), 1, 20);
  INSERT INTO public.tenant_reference_items (
    tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
  ) VALUES (
    p_tenant_id, p_domain, v_code, v_name,
    'Pilihan ini dipetakan otomatis dari data operasional yang sudah ada. Admin dapat meninjau dan memperjelas cakupannya.',
    'active', p_actor_user_id, p_actor_user_id
  ) ON CONFLICT DO NOTHING;
  SELECT id INTO v_id FROM public.tenant_reference_items
  WHERE tenant_id = p_tenant_id AND domain = p_domain AND lower(btrim(name)) = lower(v_name)
  ORDER BY (status = 'active') DESC, id LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Katalog tenant gagal membuat pilihan hasil pemetaan' USING ERRCODE = '23503'; END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.ensure_tenant_reference_item(UUID,TEXT,TEXT,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_tenant_reference_item(UUID,TEXT,TEXT,UUID) TO service_role;

WITH raw_options (tenant_id, domain, name, actor_id) AS (
  SELECT tenant_id, 'academic_subject', subject, created_by FROM public.cbt_questions
  UNION ALL SELECT tenant_id, 'academic_subject', subject, created_by FROM public.cbt_exams
  UNION ALL SELECT tenant_id, 'academic_grade_level', grade, created_by FROM public.cbt_questions
  UNION ALL SELECT tenant_id, 'academic_grade_level', grade, created_by FROM public.cbt_exams
  UNION ALL SELECT tenant_id, 'cbt_question_template', template, created_by FROM public.cbt_questions
  UNION ALL SELECT tenant_id, 'academic_grade_level', grade, created_by FROM public.lms_courses WHERE NULLIF(btrim(grade), '') IS NOT NULL
  UNION ALL SELECT tenant_id, 'hris_job_title', job_title, created_by_user_id FROM public.hris_employees
  UNION ALL SELECT tenant_id, 'academic_grade_level', grade, created_by_user_id FROM public.candidates WHERE NULLIF(btrim(grade), '') IS NOT NULL
  UNION ALL SELECT tenant_id, 'academic_grade_level', grade, NULL::UUID FROM public.master_data_records WHERE category = 'Kelas' AND NULLIF(btrim(grade), '') IS NOT NULL
  UNION ALL SELECT tenant_id, 'academic_grade_level', grade, NULL::UUID FROM public.students WHERE NULLIF(btrim(grade), '') IS NOT NULL
  UNION ALL SELECT tenant_id, 'academic_grade_level', grade, created_by_user_id FROM public.finance_bills WHERE NULLIF(btrim(grade), '') IS NOT NULL
), normalized_options AS (
  SELECT tenant_id, domain, btrim(name) AS name, min(actor_id::TEXT)::UUID AS actor_id
  FROM raw_options
  WHERE NULLIF(btrim(name), '') IS NOT NULL AND length(btrim(name)) <= 180
  GROUP BY tenant_id, domain, lower(btrim(name)), btrim(name)
), tenant_actor AS (
  SELECT tenant_id, min(user_id::TEXT)::UUID AS actor_id
  FROM public.profiles
  GROUP BY tenant_id
), resolved_options AS (
  SELECT options.tenant_id, options.domain, options.name, COALESCE(options.actor_id, tenant_actor.actor_id) AS actor_id
  FROM normalized_options options
  LEFT JOIN tenant_actor USING (tenant_id)
)
INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
)
SELECT o.tenant_id, o.domain,
  'MIGRASI_' || substr(md5(o.tenant_id::TEXT || ':' || o.domain || ':' || lower(o.name)), 1, 20),
  o.name,
  'Pilihan ini dipetakan otomatis dari data operasional yang sudah ada. Admin dapat meninjau dan memperjelas cakupannya.',
  'active', o.actor_id, o.actor_id
FROM resolved_options o
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_reference_items r
  WHERE r.tenant_id = o.tenant_id AND r.domain = o.domain AND lower(btrim(r.name)) = lower(o.name)
)
ON CONFLICT DO NOTHING;

UPDATE public.cbt_questions q SET subject_reference_id = r.id, subject = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = q.tenant_id AND r.domain = 'academic_subject'
  AND lower(btrim(r.name)) = lower(btrim(q.subject)) AND q.subject_reference_id IS NULL;
UPDATE public.cbt_questions q SET grade_level_reference_id = r.id, grade = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = q.tenant_id AND r.domain = 'academic_grade_level'
  AND lower(btrim(r.name)) = lower(btrim(q.grade)) AND q.grade_level_reference_id IS NULL;
UPDATE public.cbt_questions q SET template_reference_id = r.id, template = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = q.tenant_id AND r.domain = 'cbt_question_template'
  AND lower(btrim(r.name)) = lower(btrim(q.template)) AND q.template_reference_id IS NULL;
UPDATE public.cbt_exams e SET subject_reference_id = r.id, subject = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = e.tenant_id AND r.domain = 'academic_subject'
  AND lower(btrim(r.name)) = lower(btrim(e.subject)) AND e.subject_reference_id IS NULL;
UPDATE public.cbt_exams e SET grade_level_reference_id = r.id, grade = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = e.tenant_id AND r.domain = 'academic_grade_level'
  AND lower(btrim(r.name)) = lower(btrim(e.grade)) AND e.grade_level_reference_id IS NULL;
UPDATE public.lms_courses c SET grade_level_reference_id = r.id, grade = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = c.tenant_id AND r.domain = 'academic_grade_level'
  AND NULLIF(btrim(c.grade), '') IS NOT NULL AND lower(btrim(r.name)) = lower(btrim(c.grade))
  AND c.grade_level_reference_id IS NULL;
UPDATE public.hris_employees e SET job_title_reference_id = r.id, job_title = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = e.tenant_id AND r.domain = 'hris_job_title'
  AND lower(btrim(r.name)) = lower(btrim(e.job_title)) AND e.job_title_reference_id IS NULL;

UPDATE public.candidates c SET grade_level_reference_id = r.id, grade = r.name
FROM public.tenant_reference_items r
WHERE r.tenant_id = c.tenant_id AND r.domain = 'academic_grade_level'
  AND lower(btrim(r.name)) = lower(btrim(c.grade)) AND c.grade_level_reference_id IS NULL;

-- Resolve legacy PPDB assignment labels to actual tenant structure IDs. A name is
-- mapped only when unique; ambiguous or unknown labels are surfaced by preflight.
WITH labels AS (
  SELECT c.id, c.tenant_id, c.organization_unit_id,
    COALESCE(NULLIF(btrim(c.class_name), ''), NULLIF(btrim(c.class_id), '')) AS label
  FROM public.candidates c
  WHERE NULLIF(btrim(c.class_name), '') IS NOT NULL OR NULLIF(btrim(c.class_id), '') IS NOT NULL
), matches AS (
  SELECT labels.id, min(structure.id) AS structure_id
  FROM labels JOIN public.master_data_records structure ON structure.tenant_id = labels.tenant_id
    AND structure.category = 'Kelas' AND lower(btrim(structure.name)) = lower(btrim(labels.label))
    AND (labels.organization_unit_id IS NULL OR structure.organization_unit_id = labels.organization_unit_id)
  GROUP BY labels.id HAVING count(*) = 1
)
UPDATE public.candidates c SET class_id = matches.structure_id
FROM matches
WHERE c.id = matches.id
  AND NOT EXISTS (SELECT 1 FROM public.master_data_records structure
    WHERE structure.tenant_id = c.tenant_id AND structure.category = 'Kelas' AND structure.id = c.class_id);

WITH labels AS (
  SELECT c.id, c.tenant_id, c.organization_unit_id,
    COALESCE(NULLIF(btrim(c.dormitory), ''), NULLIF(btrim(c.dormitory_id), '')) AS label
  FROM public.candidates c
  WHERE NULLIF(btrim(c.dormitory), '') IS NOT NULL OR NULLIF(btrim(c.dormitory_id), '') IS NOT NULL
), matches AS (
  SELECT labels.id, min(structure.id) AS structure_id
  FROM labels JOIN public.master_data_records structure ON structure.tenant_id = labels.tenant_id
    AND structure.category = 'Gedung' AND lower(btrim(structure.name)) = lower(btrim(labels.label))
    AND (labels.organization_unit_id IS NULL OR structure.organization_unit_id = labels.organization_unit_id)
  GROUP BY labels.id HAVING count(*) = 1
)
UPDATE public.candidates c SET dormitory_id = matches.structure_id
FROM matches
WHERE c.id = matches.id
  AND NOT EXISTS (SELECT 1 FROM public.master_data_records structure
    WHERE structure.tenant_id = c.tenant_id AND structure.category = 'Gedung' AND structure.id = c.dormitory_id);

WITH labels AS (
  SELECT c.id, c.tenant_id, c.dormitory_id,
    COALESCE(NULLIF(btrim(c.room), ''), NULLIF(btrim(c.room_id), '')) AS label
  FROM public.candidates c
  WHERE NULLIF(btrim(c.room), '') IS NOT NULL OR NULLIF(btrim(c.room_id), '') IS NOT NULL
), matches AS (
  SELECT labels.id, min(structure.id) AS structure_id
  FROM labels JOIN public.master_data_records structure ON structure.tenant_id = labels.tenant_id
    AND structure.category = 'Kamar' AND lower(btrim(structure.name)) = lower(btrim(labels.label))
    AND (labels.dormitory_id IS NULL OR structure.parent_id = labels.dormitory_id)
  GROUP BY labels.id HAVING count(*) = 1
)
UPDATE public.candidates c SET room_id = matches.structure_id
FROM matches
WHERE c.id = matches.id
  AND NOT EXISTS (SELECT 1 FROM public.master_data_records structure
    WHERE structure.tenant_id = c.tenant_id AND structure.category = 'Kamar' AND structure.id = c.room_id);

UPDATE public.candidates candidate SET dormitory_id = room.parent_id
FROM public.master_data_records room
WHERE candidate.tenant_id = room.tenant_id AND candidate.room_id = room.id
  AND room.category = 'Kamar' AND candidate.dormitory_id IS NULL;

UPDATE public.candidates candidate SET grade_level_reference_id = class.grade_level_reference_id,
  grade = class.grade
FROM public.master_data_records class
WHERE candidate.class_id = class.id AND candidate.tenant_id = class.tenant_id
  AND class.category = 'Kelas' AND class.grade_level_reference_id IS NOT NULL
  AND candidate.grade_level_reference_id IS NULL;

UPDATE public.candidates
SET class_id = NULLIF(btrim(class_id), ''), dormitory_id = NULLIF(btrim(dormitory_id), ''),
  room_id = NULLIF(btrim(room_id), '');
UPDATE public.master_data_records m SET grade_level_reference_id = r.id, grade = r.name
FROM public.tenant_reference_items r
WHERE m.category = 'Kelas' AND r.tenant_id = m.tenant_id AND r.domain = 'academic_grade_level'
  AND lower(btrim(r.name)) = lower(btrim(m.grade)) AND m.grade_level_reference_id IS NULL;
WITH resolved_students AS (
  SELECT s.id, s.tenant_id,
    COALESCE(candidate.grade_level_reference_id, class_record.grade_level_reference_id, by_name.id) AS reference_id
  FROM public.students s
  LEFT JOIN public.candidates candidate ON candidate.tenant_id = s.tenant_id AND candidate.id = s.source_candidate_id
  LEFT JOIN public.master_data_records class_record ON class_record.tenant_id = s.tenant_id
    AND class_record.category = 'Kelas' AND class_record.id = s.class_id
  LEFT JOIN public.tenant_reference_items by_name ON by_name.tenant_id = s.tenant_id
    AND by_name.domain = 'academic_grade_level' AND lower(btrim(by_name.name)) = lower(btrim(s.grade))
  WHERE s.grade_level_reference_id IS NULL
), canonical_students AS (
  SELECT resolved.id, item.id AS reference_id, item.name
  FROM resolved_students resolved
  JOIN public.tenant_reference_items item ON item.tenant_id = resolved.tenant_id AND item.id = resolved.reference_id
)
UPDATE public.students s SET grade_level_reference_id = canonical.reference_id, grade = canonical.name
FROM canonical_students canonical WHERE s.id = canonical.id;
WITH resolved_bills AS (
  SELECT bill.id, bill.tenant_id,
    COALESCE(student.grade_level_reference_id, candidate_direct.grade_level_reference_id,
      candidate_source.grade_level_reference_id, by_name.id) AS reference_id
  FROM public.finance_bills bill
  LEFT JOIN public.students student ON student.tenant_id = bill.tenant_id AND student.id = bill.student_id
  LEFT JOIN public.candidates candidate_direct ON candidate_direct.tenant_id = bill.tenant_id
    AND candidate_direct.id = bill.candidate_id
  LEFT JOIN public.candidates candidate_source ON candidate_source.tenant_id = bill.tenant_id
    AND candidate_source.id::TEXT = bill.source_candidate_id
  LEFT JOIN public.tenant_reference_items by_name ON by_name.tenant_id = bill.tenant_id
    AND by_name.domain = 'academic_grade_level' AND lower(btrim(by_name.name)) = lower(btrim(bill.grade))
  WHERE bill.grade_level_reference_id IS NULL
), canonical_bills AS (
  SELECT resolved.id, item.id AS reference_id, item.name
  FROM resolved_bills resolved
  JOIN public.tenant_reference_items item ON item.tenant_id = resolved.tenant_id AND item.id = resolved.reference_id
)
UPDATE public.finance_bills bill SET grade_level_reference_id = canonical.reference_id, grade = canonical.name
FROM canonical_bills canonical WHERE bill.id = canonical.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.candidates WHERE NULLIF(btrim(grade), '') IS NOT NULL AND grade_level_reference_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.master_data_records WHERE category = 'Kelas' AND grade_level_reference_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.students WHERE (NULLIF(btrim(grade), '') IS NOT NULL OR class_id IS NOT NULL) AND grade_level_reference_id IS NULL)
    OR EXISTS (SELECT 1 FROM public.finance_bills WHERE grade_level_reference_id IS NULL) THEN
    RAISE EXCEPTION 'Ada jenjang operasional yang belum memiliki relasi katalog tenant; hentikan migrasi dan selesaikan pemetaan lebih dahulu.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.candidates candidate
    WHERE (NULLIF(btrim(candidate.class_id), '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.master_data_records class WHERE class.tenant_id = candidate.tenant_id
          AND class.category = 'Kelas' AND class.id = candidate.class_id))
      OR (NULLIF(btrim(candidate.class_name), '') IS NOT NULL AND NULLIF(btrim(candidate.class_id), '') IS NULL)
      OR (NULLIF(btrim(candidate.dormitory_id), '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.master_data_records building WHERE building.tenant_id = candidate.tenant_id
          AND building.category = 'Gedung' AND building.id = candidate.dormitory_id))
      OR (NULLIF(btrim(candidate.dormitory), '') IS NOT NULL AND NULLIF(btrim(candidate.dormitory_id), '') IS NULL)
      OR (NULLIF(btrim(candidate.room_id), '') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.master_data_records room WHERE room.tenant_id = candidate.tenant_id
          AND room.category = 'Kamar' AND room.id = candidate.room_id))
      OR (NULLIF(btrim(candidate.room), '') IS NOT NULL AND NULLIF(btrim(candidate.room_id), '') IS NULL)
      OR (candidate.class_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.master_data_records class WHERE class.tenant_id = candidate.tenant_id
          AND class.category = 'Kelas' AND class.id = candidate.class_id
          AND class.grade_level_reference_id = candidate.grade_level_reference_id))
      OR (candidate.room_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.master_data_records room JOIN public.master_data_records building
          ON building.tenant_id = room.tenant_id AND building.category = 'Gedung'
          AND building.id = room.parent_id
        WHERE room.tenant_id = candidate.tenant_id AND room.category = 'Kamar'
          AND room.id = candidate.room_id AND building.id = candidate.dormitory_id))
  ) THEN
    RAISE EXCEPTION 'Ada penempatan calon santri yang belum cocok dengan kelas, gedung, kamar, atau jenjang tenant; selesaikan pemetaan sebelum migrasi.';
  END IF;
END;
$$;

ALTER TABLE public.candidates
  ADD CONSTRAINT candidates_tenant_class_assignment_fk
    FOREIGN KEY (tenant_id, class_id, class_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  ADD CONSTRAINT candidates_tenant_dormitory_assignment_fk
    FOREIGN KEY (tenant_id, dormitory_id, dormitory_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT,
  ADD CONSTRAINT candidates_tenant_room_assignment_fk
    FOREIGN KEY (tenant_id, room_id, room_category)
    REFERENCES public.master_data_records (tenant_id, id, category) ON DELETE RESTRICT;

-- Courses created before the category catalog existed are connected to an existing
-- category or a tenant-owned category preserving their original display name.
WITH matched AS (
  SELECT DISTINCT ON (c.tenant_id, c.id)
    c.id AS course_id, category.id AS category_id, category.name AS category_name
  FROM public.lms_courses c
  JOIN public.lms_categories category ON category.tenant_id = c.tenant_id
    AND lower(btrim(category.name)) = lower(btrim(c.category_name))
  WHERE c.category_id IS NULL
  ORDER BY c.tenant_id, c.id, (category.status = 'active') DESC, category.id
)
UPDATE public.lms_courses c SET category_id = matched.category_id, category_name = matched.category_name
FROM matched WHERE c.id = matched.course_id;

WITH missing_categories AS (
  SELECT DISTINCT ON (c.tenant_id, lower(btrim(c.category_name)))
    c.tenant_id, btrim(c.category_name) AS name, min(c.created_by::TEXT)::UUID AS actor_id
  FROM public.lms_courses c
  WHERE c.category_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.lms_categories category WHERE category.tenant_id = c.tenant_id
      AND lower(btrim(category.name)) = lower(btrim(c.category_name)))
  GROUP BY c.tenant_id, lower(btrim(c.category_name)), btrim(c.category_name)
  ORDER BY c.tenant_id, lower(btrim(c.category_name)), min(c.created_at), min(c.id::TEXT)
)
INSERT INTO public.lms_categories (tenant_id, name, description, created_by, updated_by)
SELECT tenant_id, name,
  'Kategori hasil pemetaan otomatis dari kursus yang sudah ada. Admin dapat meninjau dan memperjelas cakupannya.',
  actor_id, actor_id
FROM missing_categories
ON CONFLICT (tenant_id, name) DO NOTHING;

WITH matched AS (
  SELECT DISTINCT ON (c.tenant_id, c.id)
    c.id AS course_id, category.id AS category_id, category.name AS category_name
  FROM public.lms_courses c
  JOIN public.lms_categories category ON category.tenant_id = c.tenant_id
    AND lower(btrim(category.name)) = lower(btrim(c.category_name))
  WHERE c.category_id IS NULL
  ORDER BY c.tenant_id, c.id, (category.status = 'active') DESC, category.id
)
UPDATE public.lms_courses c SET category_id = matched.category_id, category_name = matched.category_name
FROM matched WHERE c.id = matched.course_id;

ALTER TABLE public.lms_courses ALTER COLUMN category_id SET NOT NULL;
UPDATE public.lms_categories
SET description = 'Kategori kursus lama yang dipertahankan. Admin perlu meninjau dan memperjelas cakupan serta penggunaannya.'
WHERE length(btrim(description)) < 8 OR lower(btrim(description)) = lower(btrim(name));
ALTER TABLE public.lms_categories
  ADD CONSTRAINT lms_categories_description_semantic_check
  CHECK (length(btrim(description)) BETWEEN 8 AND 1000 AND lower(btrim(description)) <> lower(btrim(name))) NOT VALID;
ALTER TABLE public.lms_categories VALIDATE CONSTRAINT lms_categories_description_semantic_check;

CREATE OR REPLACE FUNCTION public.normalize_legacy_lms_category_description()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.source_system = 'legacy_firestore'
    AND (length(btrim(NEW.description)) < 8 OR lower(btrim(NEW.description)) = lower(btrim(NEW.name))) THEN
    NEW.description := 'Kategori kursus dari arsip lama. Admin perlu meninjau dan memperjelas cakupan serta penggunaannya.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lms_categories_normalize_legacy_description
  BEFORE INSERT OR UPDATE OF name, description ON public.lms_categories
  FOR EACH ROW EXECUTE FUNCTION public.normalize_legacy_lms_category_description();

CREATE INDEX cbt_questions_reference_scope_idx
  ON public.cbt_questions (tenant_id, subject_reference_id, grade_level_reference_id, template_reference_id, status);
CREATE INDEX cbt_exams_reference_scope_idx
  ON public.cbt_exams (tenant_id, subject_reference_id, grade_level_reference_id, status);
CREATE INDEX lms_courses_grade_reference_idx
  ON public.lms_courses (tenant_id, grade_level_reference_id, status);
CREATE INDEX hris_employees_job_title_reference_idx
  ON public.hris_employees (tenant_id, job_title_reference_id, employment_status);

CREATE OR REPLACE FUNCTION public.link_cbt_question_references()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_item public.tenant_reference_items%ROWTYPE;
BEGIN
  IF NEW.subject_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_subject'
      AND id = NEW.subject_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_subject'
      AND lower(btrim(name)) = lower(btrim(NEW.subject)) AND status = 'active';
  END IF;
  IF FOUND THEN NEW.subject_reference_id := v_item.id; NEW.subject := v_item.name;
  ELSIF NEW.source_system = 'legacy_firestore' AND NULLIF(btrim(NEW.subject), '') IS NOT NULL THEN
    NEW.subject_reference_id := public.ensure_tenant_reference_item(NEW.tenant_id, 'academic_subject', NEW.subject, NEW.created_by);
    SELECT * INTO v_item FROM public.tenant_reference_items WHERE tenant_id = NEW.tenant_id AND id = NEW.subject_reference_id;
    NEW.subject := v_item.name;
  ELSIF NOT (TG_OP = 'UPDATE' AND OLD.subject_reference_id IS NULL
      AND NEW.subject_reference_id IS NULL AND NEW.subject IS NOT DISTINCT FROM OLD.subject)
    AND NEW.source_system <> 'legacy_firestore' THEN
    RAISE EXCEPTION 'Mata pelajaran harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;

  IF NEW.grade_level_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND id = NEW.grade_level_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(btrim(NEW.grade)) AND status = 'active';
  END IF;
  IF FOUND THEN NEW.grade_level_reference_id := v_item.id; NEW.grade := v_item.name;
  ELSIF NEW.source_system = 'legacy_firestore' AND NULLIF(btrim(NEW.grade), '') IS NOT NULL THEN
    NEW.grade_level_reference_id := public.ensure_tenant_reference_item(NEW.tenant_id, 'academic_grade_level', NEW.grade, NEW.created_by);
    SELECT * INTO v_item FROM public.tenant_reference_items WHERE tenant_id = NEW.tenant_id AND id = NEW.grade_level_reference_id;
    NEW.grade := v_item.name;
  ELSIF NOT (TG_OP = 'UPDATE' AND OLD.grade_level_reference_id IS NULL
      AND NEW.grade_level_reference_id IS NULL AND NEW.grade IS NOT DISTINCT FROM OLD.grade)
    AND NEW.source_system <> 'legacy_firestore' THEN
    RAISE EXCEPTION 'Jenjang harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;

  IF NEW.template_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'cbt_question_template'
      AND id = NEW.template_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'cbt_question_template'
      AND lower(btrim(name)) = lower(btrim(NEW.template)) AND status = 'active';
  END IF;
  IF FOUND THEN NEW.template_reference_id := v_item.id; NEW.template := v_item.name;
  ELSIF NEW.source_system = 'legacy_firestore' AND NULLIF(btrim(NEW.template), '') IS NOT NULL THEN
    NEW.template_reference_id := public.ensure_tenant_reference_item(NEW.tenant_id, 'cbt_question_template', NEW.template, NEW.created_by);
    SELECT * INTO v_item FROM public.tenant_reference_items WHERE tenant_id = NEW.tenant_id AND id = NEW.template_reference_id;
    NEW.template := v_item.name;
  ELSIF NOT (TG_OP = 'UPDATE' AND OLD.template_reference_id IS NULL
      AND NEW.template_reference_id IS NULL AND NEW.template IS NOT DISTINCT FROM OLD.template)
    AND NEW.source_system <> 'legacy_firestore' THEN
    RAISE EXCEPTION 'Paket soal harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cbt_questions_link_references
  BEFORE INSERT OR UPDATE OF subject, grade, template, subject_reference_id, grade_level_reference_id, template_reference_id
  ON public.cbt_questions FOR EACH ROW EXECUTE FUNCTION public.link_cbt_question_references();

CREATE OR REPLACE FUNCTION public.link_cbt_exam_references()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item public.tenant_reference_items%ROWTYPE;
BEGIN
  IF NEW.subject_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_subject'
      AND id = NEW.subject_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_subject'
      AND lower(btrim(name)) = lower(btrim(NEW.subject)) AND status = 'active';
  END IF;
  IF FOUND THEN NEW.subject_reference_id := v_item.id; NEW.subject := v_item.name;
  ELSIF NOT (TG_OP = 'UPDATE' AND OLD.subject_reference_id IS NULL
      AND NEW.subject_reference_id IS NULL AND NEW.subject IS NOT DISTINCT FROM OLD.subject) THEN
    RAISE EXCEPTION 'Mata pelajaran ujian harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;

  IF NEW.grade_level_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND id = NEW.grade_level_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(btrim(NEW.grade)) AND status = 'active';
  END IF;
  IF FOUND THEN NEW.grade_level_reference_id := v_item.id; NEW.grade := v_item.name;
  ELSIF NOT (TG_OP = 'UPDATE' AND OLD.grade_level_reference_id IS NULL
      AND NEW.grade_level_reference_id IS NULL AND NEW.grade IS NOT DISTINCT FROM OLD.grade) THEN
    RAISE EXCEPTION 'Jenjang ujian harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cbt_exams_link_references
  BEFORE INSERT OR UPDATE OF subject, grade, subject_reference_id, grade_level_reference_id
  ON public.cbt_exams FOR EACH ROW EXECUTE FUNCTION public.link_cbt_exam_references();

CREATE OR REPLACE FUNCTION public.link_lms_course_grade_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item public.tenant_reference_items%ROWTYPE;
BEGIN
  IF NULLIF(btrim(NEW.grade), '') IS NULL THEN
    NEW.grade := '';
    NEW.grade_level_reference_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.grade_level_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND id = NEW.grade_level_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(btrim(NEW.grade)) AND status = 'active';
  END IF;
  IF FOUND THEN NEW.grade_level_reference_id := v_item.id; NEW.grade := v_item.name;
  ELSIF NEW.source_system = 'legacy_firestore' AND NULLIF(btrim(NEW.grade), '') IS NOT NULL THEN
    NEW.grade_level_reference_id := public.ensure_tenant_reference_item(NEW.tenant_id, 'academic_grade_level', NEW.grade, NEW.created_by);
    SELECT * INTO v_item FROM public.tenant_reference_items WHERE tenant_id = NEW.tenant_id AND id = NEW.grade_level_reference_id;
    NEW.grade := v_item.name;
  ELSIF NEW.source_system = 'legacy_firestore'
    OR (TG_OP = 'UPDATE' AND OLD.grade_level_reference_id IS NULL AND NEW.grade_level_reference_id IS NULL
      AND NEW.grade IS NOT DISTINCT FROM OLD.grade) THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Jenjang kursus harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lms_courses_link_grade_reference
  BEFORE INSERT OR UPDATE OF grade, grade_level_reference_id
  ON public.lms_courses FOR EACH ROW EXECUTE FUNCTION public.link_lms_course_grade_reference();

CREATE OR REPLACE FUNCTION public.link_lms_course_category()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_name TEXT; v_status TEXT;
BEGIN
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'Kategori kursus wajib dipilih dari daftar kategori LMS' USING ERRCODE = '23503';
  END IF;
  SELECT name, status INTO v_name, v_status FROM public.lms_categories
  WHERE tenant_id = NEW.tenant_id AND id = NEW.category_id;
  IF v_name IS NULL OR (v_status <> 'active' AND NEW.source_system <> 'legacy_firestore') THEN
    RAISE EXCEPTION 'Kategori kursus harus aktif pada tenant ini' USING ERRCODE = '23503';
  END IF;
  NEW.category_name := v_name;
  RETURN NEW;
END;
$$;
CREATE TRIGGER lms_courses_require_category
  BEFORE INSERT OR UPDATE OF category_id, category_name
  ON public.lms_courses FOR EACH ROW EXECUTE FUNCTION public.link_lms_course_category();

CREATE OR REPLACE FUNCTION public.link_hris_employee_job_title_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item public.tenant_reference_items%ROWTYPE;
BEGIN
  IF NEW.job_title_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'hris_job_title'
      AND id = NEW.job_title_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'hris_job_title'
      AND lower(btrim(name)) = lower(btrim(NEW.job_title)) AND status = 'active';
  END IF;
  IF FOUND THEN NEW.job_title_reference_id := v_item.id; NEW.job_title := v_item.name;
  ELSIF NEW.source_system = 'legacy_import' AND NULLIF(btrim(NEW.job_title), '') IS NOT NULL THEN
    NEW.job_title_reference_id := public.ensure_tenant_reference_item(NEW.tenant_id, 'hris_job_title', NEW.job_title, NEW.created_by_user_id);
    SELECT * INTO v_item FROM public.tenant_reference_items WHERE tenant_id = NEW.tenant_id AND id = NEW.job_title_reference_id;
    NEW.job_title := v_item.name;
  ELSIF NEW.source_system = 'legacy_import'
    OR (TG_OP = 'UPDATE' AND OLD.job_title_reference_id IS NULL AND NEW.job_title_reference_id IS NULL
      AND NEW.job_title IS NOT DISTINCT FROM OLD.job_title) THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Jabatan harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hris_employees_link_job_title_reference
  BEFORE INSERT OR UPDATE OF job_title, job_title_reference_id
  ON public.hris_employees FOR EACH ROW EXECUTE FUNCTION public.link_hris_employee_job_title_reference();

CREATE OR REPLACE FUNCTION public.link_candidate_grade_level_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_item public.tenant_reference_items%ROWTYPE;
  v_class public.master_data_records%ROWTYPE;
  v_room public.master_data_records%ROWTYPE;
  v_building public.master_data_records%ROWTYPE;
BEGIN
  NEW.class_id := NULLIF(btrim(NEW.class_id), '');
  NEW.dormitory_id := NULLIF(btrim(NEW.dormitory_id), '');
  NEW.room_id := NULLIF(btrim(NEW.room_id), '');

  IF NEW.class_id IS NOT NULL THEN
    SELECT * INTO v_class FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND category = 'Kelas' AND id = NEW.class_id;
    IF NOT FOUND OR (lower(btrim(v_class.status)) <> 'active' AND NOT (TG_OP = 'UPDATE' AND OLD.class_id = NEW.class_id)) THEN
      RAISE EXCEPTION 'Kelas calon santri harus dipilih dari data kelas aktif pada tenant ini' USING ERRCODE = '23503';
    END IF;
    IF v_class.grade_level_reference_id IS NULL THEN
      RAISE EXCEPTION 'Kelas belum memiliki jenjang yang terhubung' USING ERRCODE = '23514';
    END IF;
    IF NEW.grade_level_reference_id IS NOT NULL AND NEW.grade_level_reference_id <> v_class.grade_level_reference_id THEN
      RAISE EXCEPTION 'Jenjang calon santri harus sama dengan jenjang kelas' USING ERRCODE = '23514';
    END IF;
    NEW.grade_level_reference_id := v_class.grade_level_reference_id;
    NEW.grade := v_class.grade;
    NEW.class_name := v_class.name;
  ELSIF NULLIF(btrim(NEW.class_name), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Pilih kelas dari data kelas tenant; nama kelas bebas tidak diterima' USING ERRCODE = '23503';
  ELSE
    NEW.class_name := NULL;
  END IF;

  IF NEW.room_id IS NOT NULL THEN
    SELECT * INTO v_room FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND category = 'Kamar' AND id = NEW.room_id;
    IF NOT FOUND OR (lower(btrim(v_room.status)) <> 'active' AND NOT (TG_OP = 'UPDATE' AND OLD.room_id = NEW.room_id)) THEN
      RAISE EXCEPTION 'Kamar calon santri harus dipilih dari data kamar aktif pada tenant ini' USING ERRCODE = '23503';
    END IF;
    IF v_room.parent_id IS NULL THEN
      RAISE EXCEPTION 'Kamar belum terhubung ke gedung asrama' USING ERRCODE = '23514';
    END IF;
    IF NEW.dormitory_id IS NOT NULL AND NEW.dormitory_id <> v_room.parent_id THEN
      RAISE EXCEPTION 'Gedung asrama tidak sesuai dengan kamar yang dipilih' USING ERRCODE = '23514';
    END IF;
    NEW.dormitory_id := v_room.parent_id;
    NEW.room := v_room.name;
  ELSIF NULLIF(btrim(NEW.room), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Pilih kamar dari data kamar tenant; nama kamar bebas tidak diterima' USING ERRCODE = '23503';
  ELSE
    NEW.room := NULL;
  END IF;

  IF NEW.dormitory_id IS NOT NULL THEN
    SELECT * INTO v_building FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND category = 'Gedung' AND id = NEW.dormitory_id;
    IF NOT FOUND OR (lower(btrim(v_building.status)) <> 'active' AND NOT (TG_OP = 'UPDATE' AND OLD.dormitory_id = NEW.dormitory_id)) THEN
      RAISE EXCEPTION 'Gedung asrama harus dipilih dari data gedung aktif pada tenant ini' USING ERRCODE = '23503';
    END IF;
    NEW.dormitory := v_building.name;
  ELSIF NULLIF(btrim(NEW.dormitory), '') IS NOT NULL THEN
    RAISE EXCEPTION 'Pilih gedung asrama dari data struktur tenant; nama bebas tidak diterima' USING ERRCODE = '23503';
  ELSE
    NEW.dormitory := NULL;
  END IF;

  IF NEW.grade_level_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND id = NEW.grade_level_reference_id;
    IF FOUND AND v_item.status <> 'active'
      AND NOT (TG_OP = 'UPDATE' AND OLD.grade_level_reference_id = NEW.grade_level_reference_id) THEN
      RAISE EXCEPTION 'Jenjang calon santri harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
    END IF;
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(btrim(NEW.grade)) AND status = 'active';
  END IF;
  IF FOUND THEN
    IF NEW.grade_level_reference_id IS NOT NULL AND NEW.grade_level_reference_id <> v_item.id THEN
      RAISE EXCEPTION 'Jenjang calon santri tidak sesuai dengan referensi yang dipilih' USING ERRCODE = '23514';
    END IF;
    NEW.grade_level_reference_id := v_item.id;
    NEW.grade := v_item.name;
  ELSIF TG_OP = 'UPDATE' AND OLD.grade_level_reference_id IS NULL
    AND NEW.grade_level_reference_id IS NULL AND NEW.grade IS NOT DISTINCT FROM OLD.grade
    AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Jenjang calon santri harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER candidates_link_grade_level_reference
  BEFORE INSERT OR UPDATE OF tenant_id, grade, grade_level_reference_id, class_id, class_name,
    dormitory_id, dormitory, room_id, room
  ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.link_candidate_grade_level_reference();

UPDATE public.candidates
SET grade = grade, grade_level_reference_id = grade_level_reference_id,
  class_id = class_id, class_name = class_name,
  dormitory_id = dormitory_id, dormitory = dormitory, room_id = room_id, room = room;

CREATE OR REPLACE FUNCTION public.link_class_grade_level_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_item public.tenant_reference_items%ROWTYPE;
BEGIN
  IF NEW.category <> 'Kelas' THEN
    NEW.grade_level_reference_id := NULL;
    RETURN NEW;
  END IF;
  IF NEW.grade_level_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND id = NEW.grade_level_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(btrim(NEW.grade)) AND status = 'active';
  END IF;
  IF FOUND THEN
    NEW.grade_level_reference_id := v_item.id;
    NEW.grade := v_item.name;
  ELSIF TG_OP = 'UPDATE' AND OLD.grade_level_reference_id IS NULL
    AND NEW.grade_level_reference_id IS NULL AND NEW.grade IS NOT DISTINCT FROM OLD.grade THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Jenjang kelas harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER master_data_records_link_class_grade_level
  BEFORE INSERT OR UPDATE OF tenant_id, category, grade, grade_level_reference_id
  ON public.master_data_records FOR EACH ROW EXECUTE FUNCTION public.link_class_grade_level_reference();

CREATE OR REPLACE FUNCTION public.link_student_grade_level_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_item public.tenant_reference_items%ROWTYPE;
  v_candidate_reference_id UUID;
  v_class_reference_id UUID;
BEGIN
  IF NEW.source_candidate_id IS NOT NULL THEN
    SELECT grade_level_reference_id INTO v_candidate_reference_id FROM public.candidates
    WHERE tenant_id = NEW.tenant_id AND id = NEW.source_candidate_id;
  END IF;
  IF NEW.class_id IS NOT NULL THEN
    SELECT grade_level_reference_id INTO v_class_reference_id FROM public.master_data_records
    WHERE tenant_id = NEW.tenant_id AND category = 'Kelas' AND id = NEW.class_id;
    IF v_class_reference_id IS NULL THEN
      RAISE EXCEPTION 'Kelas harus memiliki jenjang aktif sebelum dapat dihubungkan ke santri' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_candidate_reference_id IS NOT NULL THEN
    IF NEW.class_id IS NOT NULL AND v_class_reference_id IS NULL THEN
      RAISE EXCEPTION 'Kelas harus memiliki jenjang aktif sebelum calon santri ditempatkan' USING ERRCODE = '23514';
    END IF;
    IF v_class_reference_id IS NOT NULL AND v_class_reference_id <> v_candidate_reference_id THEN
      RAISE EXCEPTION 'Kelas yang dipilih tidak sesuai dengan jenjang pendaftaran calon santri' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_item FROM public.tenant_reference_items
      WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
        AND id = v_candidate_reference_id AND status = 'active';
  ELSIF v_class_reference_id IS NOT NULL THEN
    IF NEW.grade_level_reference_id IS NOT NULL AND NEW.grade_level_reference_id <> v_class_reference_id THEN
      RAISE EXCEPTION 'Jenjang santri harus sama dengan jenjang kelas yang dipilih' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO v_item FROM public.tenant_reference_items
      WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
        AND id = v_class_reference_id AND status = 'active';
  ELSIF NEW.grade_level_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND id = NEW.grade_level_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(btrim(NEW.grade)) AND status = 'active';
  END IF;

  IF v_item.id IS NOT NULL THEN
    IF NEW.grade_level_reference_id IS NOT NULL AND NEW.grade_level_reference_id <> v_item.id THEN
      RAISE EXCEPTION 'Jenjang santri harus sesuai dengan kelas atau pendaftaran' USING ERRCODE = '23514';
    END IF;
    NEW.grade_level_reference_id := v_item.id;
    NEW.grade := v_item.name;
  ELSIF NULLIF(btrim(NEW.grade), '') IS NULL AND NEW.grade_level_reference_id IS NULL THEN
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND OLD.grade_level_reference_id IS NULL
    AND NEW.grade_level_reference_id IS NULL AND NEW.grade IS NOT DISTINCT FROM OLD.grade
    AND NEW.class_id IS NOT DISTINCT FROM OLD.class_id THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Jenjang santri harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER students_link_grade_level_reference
  BEFORE INSERT OR UPDATE OF tenant_id, grade, grade_level_reference_id, class_id, source_candidate_id
  ON public.students FOR EACH ROW EXECUTE FUNCTION public.link_student_grade_level_reference();

CREATE OR REPLACE FUNCTION public.link_finance_bill_grade_level_reference()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_item public.tenant_reference_items%ROWTYPE;
  v_reference_id UUID;
  v_related_grade BOOLEAN := FALSE;
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    SELECT grade_level_reference_id INTO v_reference_id FROM public.students
    WHERE tenant_id = NEW.tenant_id AND id = NEW.student_id;
    v_related_grade := FOUND;
  END IF;
  IF NOT v_related_grade AND NEW.candidate_id IS NOT NULL THEN
    SELECT grade_level_reference_id INTO v_reference_id FROM public.candidates
    WHERE tenant_id = NEW.tenant_id AND id = NEW.candidate_id;
    v_related_grade := FOUND;
  END IF;
  IF NOT v_related_grade AND NULLIF(btrim(NEW.source_candidate_id), '') IS NOT NULL THEN
    SELECT grade_level_reference_id INTO v_reference_id FROM public.candidates
    WHERE tenant_id = NEW.tenant_id AND id::TEXT = btrim(NEW.source_candidate_id);
    v_related_grade := FOUND;
  END IF;

  IF v_related_grade AND v_reference_id IS NULL THEN
    RAISE EXCEPTION 'Santri atau calon santri harus memiliki jenjang aktif sebelum tagihan dibuat' USING ERRCODE = '23514';
  ELSIF v_related_grade THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level' AND id = v_reference_id;
  ELSIF NEW.grade_level_reference_id IS NOT NULL THEN
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND id = NEW.grade_level_reference_id AND status = 'active';
  ELSE
    SELECT * INTO v_item FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'academic_grade_level'
      AND lower(btrim(name)) = lower(btrim(NEW.grade)) AND status = 'active';
  END IF;

  IF v_item.id IS NOT NULL THEN
    IF NEW.grade_level_reference_id IS NOT NULL AND NEW.grade_level_reference_id <> v_item.id THEN
      RAISE EXCEPTION 'Jenjang tagihan harus sesuai dengan santri atau calon santri' USING ERRCODE = '23514';
    END IF;
    NEW.grade_level_reference_id := v_item.id;
    NEW.grade := v_item.name;
  ELSIF TG_OP = 'UPDATE' AND OLD.grade_level_reference_id IS NULL
    AND NEW.grade_level_reference_id IS NULL AND NEW.grade IS NOT DISTINCT FROM OLD.grade
    AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id
    AND NEW.candidate_id IS NOT DISTINCT FROM OLD.candidate_id
    AND NEW.source_candidate_id IS NOT DISTINCT FROM OLD.source_candidate_id THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'Jenjang tagihan harus dipilih dari katalog tenant yang aktif' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_bills_link_grade_level_reference
  BEFORE INSERT OR UPDATE OF tenant_id, grade, grade_level_reference_id, student_id, candidate_id, source_candidate_id
  ON public.finance_bills FOR EACH ROW EXECUTE FUNCTION public.link_finance_bill_grade_level_reference();

CREATE INDEX candidates_tenant_grade_reference_idx ON public.candidates (tenant_id, grade_level_reference_id, stage);
CREATE INDEX master_data_records_tenant_grade_reference_idx ON public.master_data_records (tenant_id, grade_level_reference_id, id) WHERE category = 'Kelas';
CREATE INDEX students_tenant_grade_reference_idx ON public.students (tenant_id, grade_level_reference_id, status, id);
CREATE INDEX finance_bills_tenant_grade_reference_idx ON public.finance_bills (tenant_id, grade_level_reference_id, status, id);

COMMENT ON COLUMN public.cbt_questions.subject_reference_id IS 'Canonical tenant subject used by Academic and CBT.';
COMMENT ON COLUMN public.cbt_questions.grade_level_reference_id IS 'Canonical tenant grade level shared with LMS and CBT.';
COMMENT ON COLUMN public.cbt_questions.template_reference_id IS 'Canonical tenant CBT question package/template.';
COMMENT ON COLUMN public.cbt_exams.subject_reference_id IS 'Canonical tenant subject used by Academic and CBT.';
COMMENT ON COLUMN public.cbt_exams.grade_level_reference_id IS 'Canonical tenant grade level shared with LMS and CBT.';
COMMENT ON COLUMN public.lms_courses.grade_level_reference_id IS 'Optional canonical target level; NULL means all tenant grade levels.';
COMMENT ON COLUMN public.hris_employees.job_title_reference_id IS 'Canonical tenant job title; legacy unmatched titles remain displayable.';
COMMENT ON COLUMN public.candidates.grade_level_reference_id IS 'Canonical tenant admission target grade shared with class placement and academic modules.';
COMMENT ON COLUMN public.master_data_records.grade_level_reference_id IS 'Canonical tenant grade level assigned to a class structure.';
COMMENT ON COLUMN public.students.grade_level_reference_id IS 'Canonical tenant grade inherited from the candidate or assigned class.';
COMMENT ON COLUMN public.finance_bills.grade_level_reference_id IS 'Canonical tenant grade inherited from the related student or PPDB candidate.';

COMMIT;
