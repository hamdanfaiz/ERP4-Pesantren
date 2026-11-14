-- Cover child-side composite foreign keys on the busiest core operational tables.
-- These non-unique indexes do not change tenant or row-access semantics.
-- Standard CREATE INDEX can block writes while it builds; review table size and
-- schedule an appropriate deployment window before applying to a live database.
-- Apply on production only after the migration ledger and deployment plan are reviewed.

CREATE INDEX IF NOT EXISTS academic_records_tenant_assessment_type_reference_fk_idx
  ON public.academic_records (tenant_id, assessment_type_reference_domain, assessment_type_reference_id);

CREATE INDEX IF NOT EXISTS academic_records_tenant_class_reference_fk_idx
  ON public.academic_records (tenant_id, class_reference_category, class_reference_id);

CREATE INDEX IF NOT EXISTS academic_records_tenant_curriculum_reference_fk_idx
  ON public.academic_records (tenant_id, curriculum_reference_domain, curriculum_reference_id);

CREATE INDEX IF NOT EXISTS academic_records_tenant_facility_reference_fk_idx
  ON public.academic_records (tenant_id, facility_reference_domain, facility_reference_id);

CREATE INDEX IF NOT EXISTS academic_records_tenant_created_by_fk_idx
  ON public.academic_records (tenant_id, created_by);

CREATE INDEX IF NOT EXISTS academic_records_tenant_updated_by_fk_idx
  ON public.academic_records (tenant_id, updated_by);

CREATE INDEX IF NOT EXISTS academic_records_tenant_subject_reference_fk_idx
  ON public.academic_records (tenant_id, subject_reference_domain, subject_reference_id);

CREATE INDEX IF NOT EXISTS boarding_attendance_records_tenant_marked_by_fk_idx
  ON public.boarding_attendance_records (tenant_id, marked_by_user_id);

CREATE INDEX IF NOT EXISTS boarding_attendance_records_tenant_room_fk_idx
  ON public.boarding_attendance_records (tenant_id, room_id, room_category);

CREATE INDEX IF NOT EXISTS boarding_attendance_records_tenant_student_fk_idx
  ON public.boarding_attendance_records (tenant_id, student_id);

CREATE INDEX IF NOT EXISTS students_tenant_building_fk_idx
  ON public.students (tenant_id, building_id, building_category);

CREATE INDEX IF NOT EXISTS students_tenant_class_fk_idx
  ON public.students (tenant_id, class_id, class_category);

CREATE INDEX IF NOT EXISTS students_tenant_room_fk_idx
  ON public.students (tenant_id, room_id, room_category);

