BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(13);

SELECT ok(to_regclass('public.academic_records_tenant_assessment_type_reference_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.academic_records_tenant_assessment_type_reference_fk_idx'::regclass) ILIKE '%(tenant_id, assessment_type_reference_domain, assessment_type_reference_id)%',
  'academic assessment reference foreign key has a matching tenant index');
SELECT ok(to_regclass('public.academic_records_tenant_class_reference_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.academic_records_tenant_class_reference_fk_idx'::regclass) ILIKE '%(tenant_id, class_reference_category, class_reference_id)%',
  'academic class reference foreign key has a matching tenant index');
SELECT ok(to_regclass('public.academic_records_tenant_curriculum_reference_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.academic_records_tenant_curriculum_reference_fk_idx'::regclass) ILIKE '%(tenant_id, curriculum_reference_domain, curriculum_reference_id)%',
  'academic curriculum reference foreign key has a matching tenant index');
SELECT ok(to_regclass('public.academic_records_tenant_facility_reference_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.academic_records_tenant_facility_reference_fk_idx'::regclass) ILIKE '%(tenant_id, facility_reference_domain, facility_reference_id)%',
  'academic facility reference foreign key has a matching tenant index');
SELECT ok(to_regclass('public.academic_records_tenant_created_by_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.academic_records_tenant_created_by_fk_idx'::regclass) ILIKE '%(tenant_id, created_by)%',
  'academic creator foreign key has a matching tenant index');
SELECT ok(to_regclass('public.academic_records_tenant_updated_by_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.academic_records_tenant_updated_by_fk_idx'::regclass) ILIKE '%(tenant_id, updated_by)%',
  'academic updater foreign key has a matching tenant index');
SELECT ok(to_regclass('public.academic_records_tenant_subject_reference_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.academic_records_tenant_subject_reference_fk_idx'::regclass) ILIKE '%(tenant_id, subject_reference_domain, subject_reference_id)%',
  'academic subject reference foreign key has a matching tenant index');
SELECT ok(to_regclass('public.boarding_attendance_records_tenant_marked_by_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.boarding_attendance_records_tenant_marked_by_fk_idx'::regclass) ILIKE '%(tenant_id, marked_by_user_id)%',
  'attendance marker foreign key has a matching tenant index');
SELECT ok(to_regclass('public.boarding_attendance_records_tenant_room_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.boarding_attendance_records_tenant_room_fk_idx'::regclass) ILIKE '%(tenant_id, room_id, room_category)%',
  'attendance room foreign key has a matching tenant index');
SELECT ok(to_regclass('public.boarding_attendance_records_tenant_student_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.boarding_attendance_records_tenant_student_fk_idx'::regclass) ILIKE '%(tenant_id, student_id)%',
  'attendance student foreign key has a matching tenant index');
SELECT ok(to_regclass('public.students_tenant_building_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.students_tenant_building_fk_idx'::regclass) ILIKE '%(tenant_id, building_id, building_category)%',
  'student building foreign key has a matching tenant index');
SELECT ok(to_regclass('public.students_tenant_class_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.students_tenant_class_fk_idx'::regclass) ILIKE '%(tenant_id, class_id, class_category)%',
  'student class foreign key has a matching tenant index');
SELECT ok(to_regclass('public.students_tenant_room_fk_idx') IS NOT NULL
  AND pg_get_indexdef('public.students_tenant_room_fk_idx'::regclass) ILIKE '%(tenant_id, room_id, room_category)%',
  'student room foreign key has a matching tenant index');

SELECT * FROM finish();
ROLLBACK;

