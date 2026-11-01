-- Index the child side of tenant-scoped reference foreign keys. These indexes
-- keep canonical choice joins and FK checks efficient as operational tables grow.
BEGIN;

CREATE INDEX IF NOT EXISTS candidates_grade_level_reference_fk_idx
  ON public.candidates (tenant_id, grade_level_reference_domain, grade_level_reference_id);
CREATE INDEX IF NOT EXISTS candidates_class_assignment_fk_idx
  ON public.candidates (tenant_id, class_id, class_category);
CREATE INDEX IF NOT EXISTS candidates_dormitory_assignment_fk_idx
  ON public.candidates (tenant_id, dormitory_id, dormitory_category);
CREATE INDEX IF NOT EXISTS candidates_room_assignment_fk_idx
  ON public.candidates (tenant_id, room_id, room_category);

CREATE INDEX IF NOT EXISTS master_data_records_grade_level_reference_fk_idx
  ON public.master_data_records (tenant_id, grade_level_reference_domain, grade_level_reference_id);
CREATE INDEX IF NOT EXISTS students_grade_level_reference_fk_idx
  ON public.students (tenant_id, grade_level_reference_domain, grade_level_reference_id);
CREATE INDEX IF NOT EXISTS finance_bills_grade_level_reference_fk_idx
  ON public.finance_bills (tenant_id, grade_level_reference_domain, grade_level_reference_id);

CREATE INDEX IF NOT EXISTS cbt_questions_subject_reference_fk_idx
  ON public.cbt_questions (tenant_id, subject_reference_domain, subject_reference_id);
CREATE INDEX IF NOT EXISTS cbt_questions_grade_reference_fk_idx
  ON public.cbt_questions (tenant_id, grade_level_reference_domain, grade_level_reference_id);
CREATE INDEX IF NOT EXISTS cbt_questions_template_reference_fk_idx
  ON public.cbt_questions (tenant_id, template_reference_domain, template_reference_id);
CREATE INDEX IF NOT EXISTS cbt_exams_subject_reference_fk_idx
  ON public.cbt_exams (tenant_id, subject_reference_domain, subject_reference_id);
CREATE INDEX IF NOT EXISTS cbt_exams_grade_reference_fk_idx
  ON public.cbt_exams (tenant_id, grade_level_reference_domain, grade_level_reference_id);
CREATE INDEX IF NOT EXISTS lms_courses_grade_reference_fk_idx
  ON public.lms_courses (tenant_id, grade_level_reference_domain, grade_level_reference_id);
CREATE INDEX IF NOT EXISTS hris_employees_job_title_reference_fk_idx
  ON public.hris_employees (tenant_id, job_title_reference_domain, job_title_reference_id);

COMMIT;
