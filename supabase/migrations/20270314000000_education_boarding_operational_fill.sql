-- Fill remaining Pendidikan/Asrama operational gaps:
-- NIS for roster validation, academic sample records, boarding facility ops,
-- and Ustadz-linked staff/halaqah/homeroom bindings.
BEGIN;

-- 1) Assign NIS to every student that still lacks one (format YEAR+GRADE+SEQ, max 10 digits).
WITH numbered AS (
  SELECT
    s.ctid AS row_ctid,
    COALESCE(NULLIF(btrim(g.nis_grade_code), ''), '00') AS grade_code,
    row_number() OVER (
      PARTITION BY s.tenant_id, COALESCE(NULLIF(btrim(g.nis_grade_code), ''), '00')
      ORDER BY s.name, s.id
    ) AS seq
  FROM public.students s
  LEFT JOIN public.tenant_reference_items g
    ON g.tenant_id = s.tenant_id
   AND g.id = s.grade_level_reference_id
   AND g.domain = 'academic_grade_level'
  WHERE s.nis IS NULL
)
UPDATE public.students AS s
SET nis = ('2026' || n.grade_code || lpad(n.seq::text, 4, '0'))
FROM numbered n
WHERE s.ctid = n.row_ctid
  AND s.nis IS NULL
  AND length('2026' || n.grade_code || lpad(n.seq::text, 4, '0')) BETWEEN 1 AND 10
  AND ('2026' || n.grade_code || lpad(n.seq::text, 4, '0')) ~ '^[0-9]{1,10}$';

-- 2) Bind active Ustadz to sample halaqahs (created by operator seed script when missing).
UPDATE public.tahfidz_halaqahs AS h
SET ustadz_user_id = u.user_id,
    ustadz_name = u.display_name
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, display_name
  FROM public.profiles
  WHERE status = 'active' AND lower(role) = 'ustadz' AND length(btrim(display_name)) > 0
  ORDER BY tenant_id, created_at, user_id
) AS u
WHERE h.tenant_id = u.tenant_id
  AND h.status = 'active'
  AND h.name IN ('Halaqah 1', 'Halaqah 2', 'Halaqah 3', 'Halaqah 4', 'Halaqah 5');

-- 3) Academic schedules / journals / assessments via save_academic_record (units disabled).
WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
teacher AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, display_name
  FROM public.profiles
  WHERE status = 'active' AND lower(role) = 'ustadz' AND length(btrim(display_name)) > 0
  ORDER BY tenant_id, created_at, user_id
),
subject AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id, name
  FROM public.tenant_reference_items
  WHERE domain = 'academic_subject' AND status = 'active' AND code = 'FIQIH'
  ORDER BY tenant_id, id
),
curriculum AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id, name
  FROM public.tenant_reference_items
  WHERE domain = 'academic_curriculum' AND status = 'active' AND code = 'KEPESANTRENAN'
  ORDER BY tenant_id, id
),
facility AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id, name
  FROM public.tenant_reference_items
  WHERE domain = 'facility_resource' AND status = 'active'
  ORDER BY tenant_id, id
),
assessment_type AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id, name
  FROM public.tenant_reference_items
  WHERE domain = 'academic_assessment_type' AND status = 'active' AND code = 'ULANGAN'
  ORDER BY tenant_id, id
),
class_row AS (
  SELECT DISTINCT ON (s.tenant_id) s.tenant_id, c.id AS class_id, c.name AS class_name
  FROM public.students s
  JOIN public.master_data_records c
    ON c.tenant_id = s.tenant_id AND c.category = 'Kelas' AND c.id = s.class_id
   AND lower(c.status) NOT IN ('inactive', 'nonaktif', 'disabled', 'arsip')
  WHERE lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  ORDER BY s.tenant_id, c.name, c.id
),
student_row AS (
  SELECT DISTINCT ON (s.tenant_id) s.tenant_id, s.id AS student_id, s.name AS student_name, s.class_id, c.name AS class_name
  FROM public.students s
  JOIN public.master_data_records c
    ON c.tenant_id = s.tenant_id AND c.category = 'Kelas' AND c.id = s.class_id
  WHERE lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  ORDER BY s.tenant_id, s.name, s.id
)
SELECT public.save_academic_record(
  actor.tenant_id,
  actor.user_id,
  'schedule',
  NULL,
  'e1111111-1111-4111-8111-111111111501'::uuid,
  jsonb_build_object(
    'day', 'Senin',
    'time', '07:30 - 09:00',
    'subject', subject.name,
    'subjectReferenceId', subject.id,
    'teacherName', teacher.display_name,
    'teacherUserId', teacher.user_id,
    'className', class_row.class_name,
    'classReferenceId', class_row.class_id,
    'room', facility.name,
    'facilityReferenceId', facility.id,
    'curriculum', curriculum.name,
    'curriculumReferenceId', curriculum.id,
    '_unitScopeEnabled', false
  )
)
FROM actor
JOIN teacher ON teacher.tenant_id = actor.tenant_id
JOIN subject ON subject.tenant_id = actor.tenant_id
JOIN curriculum ON curriculum.tenant_id = actor.tenant_id
JOIN facility ON facility.tenant_id = actor.tenant_id
JOIN class_row ON class_row.tenant_id = actor.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_records r
  WHERE r.tenant_id = actor.tenant_id
    AND r.client_request_id = 'e1111111-1111-4111-8111-111111111501'::uuid
);

WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
teacher AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, display_name
  FROM public.profiles
  WHERE status = 'active' AND lower(role) = 'ustadz' AND length(btrim(display_name)) > 0
  ORDER BY tenant_id, created_at, user_id
),
subject AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id, name
  FROM public.tenant_reference_items
  WHERE domain = 'academic_subject' AND status = 'active' AND code = 'FIQIH'
  ORDER BY tenant_id, id
),
class_row AS (
  SELECT DISTINCT ON (s.tenant_id) s.tenant_id, c.id AS class_id, c.name AS class_name
  FROM public.students s
  JOIN public.master_data_records c
    ON c.tenant_id = s.tenant_id AND c.category = 'Kelas' AND c.id = s.class_id
  WHERE lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  ORDER BY s.tenant_id, c.name, c.id
)
SELECT public.save_academic_record(
  actor.tenant_id,
  actor.user_id,
  'journal',
  NULL,
  'e1111111-1111-4111-8111-111111111502'::uuid,
  jsonb_build_object(
    'date', CURRENT_DATE::text,
    'className', class_row.class_name,
    'classReferenceId', class_row.class_id,
    'subject', subject.name,
    'subjectReferenceId', subject.id,
    'topic', 'Thaharah: wudhu dan tata cara bersuci.',
    'competency', 'Santri mampu menjelaskan rukun wudhu.',
    'teacherUserId', teacher.user_id,
    'teacherName', teacher.display_name,
    'attendance', jsonb_build_object('present', 12, 'absent', 1, 'excused', 0),
    'status', 'Completed',
    '_unitScopeEnabled', false
  )
)
FROM actor
JOIN teacher ON teacher.tenant_id = actor.tenant_id
JOIN subject ON subject.tenant_id = actor.tenant_id
JOIN class_row ON class_row.tenant_id = actor.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_records r
  WHERE r.tenant_id = actor.tenant_id
    AND r.client_request_id = 'e1111111-1111-4111-8111-111111111502'::uuid
);

WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
teacher AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, display_name
  FROM public.profiles
  WHERE status = 'active' AND lower(role) = 'ustadz' AND length(btrim(display_name)) > 0
  ORDER BY tenant_id, created_at, user_id
),
subject AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id, name
  FROM public.tenant_reference_items
  WHERE domain = 'academic_subject' AND status = 'active' AND code = 'FIQIH'
  ORDER BY tenant_id, id
),
assessment_type AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, id, name
  FROM public.tenant_reference_items
  WHERE domain = 'academic_assessment_type' AND status = 'active' AND code = 'ULANGAN'
  ORDER BY tenant_id, id
),
student_row AS (
  SELECT s.tenant_id, s.id AS student_id, s.name AS student_name, s.class_id, c.name AS class_name,
    row_number() OVER (PARTITION BY s.tenant_id ORDER BY s.name, s.id) AS ord
  FROM public.students s
  JOIN public.master_data_records c
    ON c.tenant_id = s.tenant_id AND c.category = 'Kelas' AND c.id = s.class_id
  WHERE lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
)
SELECT public.save_academic_record(
  actor.tenant_id,
  actor.user_id,
  'assessment',
  NULL,
  ('e1111111-1111-4111-8111-11111111' || lpad(student_row.ord::text, 4, '0'))::uuid,
  jsonb_build_object(
    'studentId', student_row.student_id,
    'studentName', student_row.student_name,
    'className', student_row.class_name,
    'classReferenceId', student_row.class_id,
    'teacherUserId', teacher.user_id,
    'teacherName', teacher.display_name,
    'subject', subject.name,
    'subjectReferenceId', subject.id,
    'assessmentType', assessment_type.name,
    'assessmentTypeReferenceId', assessment_type.id,
    'category', 'Summative',
    'score', CASE WHEN student_row.ord % 3 = 0 THEN 68 ELSE 82 END,
    'remedialStatus', CASE WHEN student_row.ord % 3 = 0 THEN 'Needed' ELSE 'None' END,
    '_unitScopeEnabled', false
  )
)
FROM actor
JOIN teacher ON teacher.tenant_id = actor.tenant_id
JOIN subject ON subject.tenant_id = actor.tenant_id
JOIN assessment_type ON assessment_type.tenant_id = actor.tenant_id
JOIN student_row ON student_row.tenant_id = actor.tenant_id AND student_row.ord <= 8
WHERE NOT EXISTS (
  SELECT 1 FROM public.academic_records r
  WHERE r.tenant_id = actor.tenant_id
    AND r.client_request_id = ('e1111111-1111-4111-8111-11111111' || lpad(student_row.ord::text, 4, '0'))::uuid
);

-- 4) Homeroom assignments for classes that currently hold active students.
WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
teacher AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) = 'ustadz'
  ORDER BY tenant_id, created_at, user_id
),
classes AS (
  SELECT DISTINCT s.tenant_id, s.class_id
  FROM public.students s
  WHERE s.class_id IS NOT NULL
    AND lower(COALESCE(s.status, '')) NOT IN (
      'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
    )
)
SELECT public.apply_academic_report_action(
  actor.tenant_id,
  actor.user_id,
  'admin',
  'assign_homeroom',
  jsonb_build_object('classId', classes.class_id, 'teacherUserId', teacher.user_id),
  gen_random_uuid()
)
FROM actor
JOIN teacher ON teacher.tenant_id = actor.tenant_id
JOIN classes ON classes.tenant_id = actor.tenant_id;

-- 5) Boarding staff assignment for Ustadz on the first mapped building.
INSERT INTO public.boarding_staff_assignments (
  tenant_id, user_id, building_id, room_id, status, created_by_user_id
)
SELECT
  teacher.tenant_id,
  teacher.user_id,
  building.id,
  NULL,
  'active',
  actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) = 'ustadz' AND organization_unit_id IS NOT NULL
  ORDER BY tenant_id, created_at, user_id
) AS teacher
JOIN (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor ON actor.tenant_id = teacher.tenant_id
JOIN LATERAL (
  SELECT id FROM public.master_data_records
  WHERE tenant_id = teacher.tenant_id
    AND category = 'Gedung'
    AND status = 'Active'
    AND organization_unit_id IS NOT NULL
  ORDER BY name, id
  LIMIT 1
) AS building ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.boarding_staff_assignments a
  WHERE a.tenant_id = teacher.tenant_id
    AND a.user_id = teacher.user_id
    AND a.building_id = building.id
    AND a.status = 'active'
);

-- 6) Facility ops samples.
INSERT INTO public.boarding_cleanliness_audits (
  tenant_id, room_id, audit_date, score, notes, inspector_user_id,
  inspector_name_snapshot, client_request_id, source_system
)
SELECT
  actor.tenant_id,
  room.id,
  CURRENT_DATE,
  88,
  'Pemeriksaan kebersihan sampel operasional.',
  actor.user_id,
  COALESCE(NULLIF(btrim(actor.display_name), ''), actor.email),
  'f1111111-1111-4111-8111-111111111601'::uuid,
  'manual'
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, display_name, email
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor
JOIN LATERAL (
  SELECT id FROM public.master_data_records
  WHERE tenant_id = actor.tenant_id AND category = 'Kamar' AND status = 'Active'
  ORDER BY name, id LIMIT 1
) AS room ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.boarding_cleanliness_audits a
  WHERE a.tenant_id = actor.tenant_id
    AND a.client_request_id = 'f1111111-1111-4111-8111-111111111601'::uuid
);

INSERT INTO public.boarding_facility_tickets (
  tenant_id, room_id, issue, description, priority, status,
  reported_by_user_id, reporter_name_snapshot, client_request_id, source_system
)
SELECT
  actor.tenant_id,
  room.id,
  'Lampu kamar mati',
  'Satu titik lampu utama tidak menyala saat pemeriksaan malam.',
  'Medium',
  'Open',
  actor.user_id,
  COALESCE(NULLIF(btrim(actor.display_name), ''), actor.email),
  'f1111111-1111-4111-8111-111111111602'::uuid,
  'manual'
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, display_name, email
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor
JOIN LATERAL (
  SELECT id FROM public.master_data_records
  WHERE tenant_id = actor.tenant_id AND category = 'Kamar' AND status = 'Active'
  ORDER BY name, id LIMIT 1
) AS room ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.boarding_facility_tickets t
  WHERE t.tenant_id = actor.tenant_id
    AND t.client_request_id = 'f1111111-1111-4111-8111-111111111602'::uuid
);

-- 7) One active library circulation sample.
INSERT INTO public.library_circulations (
  tenant_id, book_id, student_id, borrowed_on, due_on, status,
  recorded_by_user_id, source_system
)
SELECT
  book.tenant_id,
  book.id,
  student.id,
  CURRENT_DATE,
  CURRENT_DATE + 7,
  'active',
  actor.user_id,
  'manual'
FROM public.library_books book
JOIN LATERAL (
  SELECT id FROM public.students
  WHERE tenant_id = book.tenant_id
    AND lower(COALESCE(status, '')) NOT IN (
      'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
    )
  ORDER BY name, id LIMIT 1
) AS student ON true
JOIN (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor ON actor.tenant_id = book.tenant_id
WHERE book.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.library_circulations c
    WHERE c.tenant_id = book.tenant_id AND c.status = 'active'
  )
ORDER BY book.title, book.id
LIMIT 1;

COMMIT;
