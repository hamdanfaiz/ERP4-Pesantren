-- Sample LMS assignment, submission, and progress so Dashboard LMS has live tenant metrics.
BEGIN;

WITH course AS (
  SELECT c.tenant_id, c.id AS course_id, c.created_by, m.id AS module_id, mat.id AS material_id
  FROM public.lms_courses c
  JOIN public.lms_course_modules m
    ON m.tenant_id = c.tenant_id AND m.course_id = c.id
  JOIN public.lms_materials mat
    ON mat.tenant_id = c.tenant_id AND mat.module_id = m.id
  WHERE c.client_request_id = 'c1111111-1111-4111-8111-111111111301'::uuid
  LIMIT 1
),
ins_assignment AS (
  INSERT INTO public.lms_assignments (
    tenant_id, course_id, module_id, title, instructions, due_at, allow_late, max_score, status,
    client_request_id, source_system, created_by, updated_by
  )
  SELECT
    course.tenant_id,
    course.course_id,
    course.module_id,
    'Latihan Thaharah',
    'Jelaskan langkah wudhu secara berurutan dan sebutkan hal yang membatalkannya.',
    now() - interval '2 days',
    true,
    100,
    'published',
    'c1111111-1111-4111-8111-111111111304'::uuid,
    'supabase_runtime',
    course.created_by,
    course.created_by
  FROM course
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lms_assignments a
    WHERE a.tenant_id = course.tenant_id
      AND a.client_request_id = 'c1111111-1111-4111-8111-111111111304'::uuid
  )
  RETURNING tenant_id, id, course_id, created_by
),
assignment AS (
  SELECT * FROM ins_assignment
  UNION
  SELECT a.tenant_id, a.id, a.course_id, a.created_by
  FROM public.lms_assignments a
  WHERE a.client_request_id = 'c1111111-1111-4111-8111-111111111304'::uuid
),
enrolled AS (
  SELECT e.tenant_id, e.student_id, e.course_id,
         row_number() OVER (PARTITION BY e.tenant_id, e.course_id ORDER BY e.enrolled_at, e.student_id) AS rn
  FROM public.lms_enrollments e
  JOIN assignment ON assignment.tenant_id = e.tenant_id AND assignment.course_id = e.course_id
  WHERE e.status = 'active'
)
INSERT INTO public.lms_submissions (
  tenant_id, assignment_id, student_id, response_text, resource_url, submitted_at,
  score, feedback, graded_by, graded_at
)
SELECT
  assignment.tenant_id,
  assignment.id,
  enrolled.student_id,
  CASE enrolled.rn
    WHEN 1 THEN 'Wudhu dimulai dari niat, mencuci wajah, tangan, menyapu kepala, lalu kaki.'
    ELSE 'Santri mengumpulkan ringkasan thaharah sesuai materi modul.'
  END,
  '',
  now() - interval '1 day',
  CASE WHEN enrolled.rn = 1 THEN 88 ELSE NULL END,
  CASE WHEN enrolled.rn = 1 THEN 'Sudah tepat; lengkapi urutan kaki kiri-kanan.' ELSE '' END,
  CASE WHEN enrolled.rn = 1 THEN assignment.created_by ELSE NULL END,
  CASE WHEN enrolled.rn = 1 THEN now() - interval '12 hours' ELSE NULL END
FROM assignment
JOIN enrolled ON enrolled.tenant_id = assignment.tenant_id AND enrolled.course_id = assignment.course_id
WHERE enrolled.rn <= 2
  AND NOT EXISTS (
    SELECT 1 FROM public.lms_submissions s
    WHERE s.tenant_id = assignment.tenant_id
      AND s.assignment_id = assignment.id
      AND s.student_id = enrolled.student_id
  );

WITH course AS (
  SELECT c.tenant_id, mat.id AS material_id
  FROM public.lms_courses c
  JOIN public.lms_course_modules m
    ON m.tenant_id = c.tenant_id AND m.course_id = c.id
  JOIN public.lms_materials mat
    ON mat.tenant_id = c.tenant_id AND mat.module_id = m.id
  WHERE c.client_request_id = 'c1111111-1111-4111-8111-111111111301'::uuid
  LIMIT 1
),
enrolled AS (
  SELECT e.tenant_id, e.student_id,
         row_number() OVER (PARTITION BY e.tenant_id ORDER BY e.enrolled_at, e.student_id) AS rn
  FROM public.lms_enrollments e
  JOIN public.lms_courses c
    ON c.tenant_id = e.tenant_id AND c.id = e.course_id
  WHERE c.client_request_id = 'c1111111-1111-4111-8111-111111111301'::uuid
    AND e.status = 'active'
)
INSERT INTO public.lms_material_progress (
  tenant_id, student_id, material_id, position_seconds, completed_at, updated_at
)
SELECT
  course.tenant_id,
  enrolled.student_id,
  course.material_id,
  CASE WHEN enrolled.rn <= 5 THEN 120 ELSE 30 END,
  CASE WHEN enrolled.rn <= 5 THEN now() - interval '6 hours' ELSE NULL END,
  now()
FROM course
JOIN enrolled ON enrolled.tenant_id = course.tenant_id
WHERE enrolled.rn <= 8
ON CONFLICT (tenant_id, student_id, material_id) DO UPDATE
SET
  position_seconds = EXCLUDED.position_seconds,
  completed_at = COALESCE(public.lms_material_progress.completed_at, EXCLUDED.completed_at),
  updated_at = now();

COMMIT;
