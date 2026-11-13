-- Operational sample data for Pendidikan & Asrama menus on an existing tenant.
-- Idempotent: skips rows that already exist for the same natural keys.
BEGIN;

-- 1) Link kamar to gedung so room assignment and asrama snapshot resolve buildings.
WITH numbered_rooms AS (
  SELECT
    r.tenant_id,
    r.id AS room_id,
    row_number() OVER (PARTITION BY r.tenant_id ORDER BY r.name, r.id) AS room_ord
  FROM public.master_data_records r
  WHERE r.category = 'Kamar' AND r.status = 'Active' AND r.parent_id IS NULL
),
numbered_buildings AS (
  SELECT
    b.tenant_id,
    b.id AS building_id,
    row_number() OVER (PARTITION BY b.tenant_id ORDER BY b.name, b.id) AS building_ord,
    count(*) OVER (PARTITION BY b.tenant_id) AS building_count
  FROM public.master_data_records b
  WHERE b.category = 'Gedung' AND b.status = 'Active'
)
UPDATE public.master_data_records AS room
SET parent_id = nb.building_id
FROM numbered_rooms nr
JOIN numbered_buildings nb
  ON nb.tenant_id = nr.tenant_id
 AND nb.building_ord = ((nr.room_ord - 1) % nb.building_count) + 1
WHERE room.tenant_id = nr.tenant_id
  AND room.id = nr.room_id
  AND room.category = 'Kamar'
  AND room.parent_id IS NULL;

-- Mark half of the buildings L and half P, then inherit onto linked rooms.
WITH numbered_buildings AS (
  SELECT
    b.ctid AS row_ctid,
    row_number() OVER (PARTITION BY b.tenant_id ORDER BY b.name, b.id) AS building_ord,
    count(*) OVER (PARTITION BY b.tenant_id) AS building_count
  FROM public.master_data_records b
  WHERE b.category = 'Gedung' AND b.status = 'Active' AND b.gender_code IS NULL
)
UPDATE public.master_data_records AS building
SET gender_code = CASE
  WHEN nb.building_ord <= ceil(nb.building_count / 2.0) THEN 'L'
  ELSE 'P'
END::public.gender_type
FROM numbered_buildings nb
WHERE building.ctid = nb.row_ctid;

UPDATE public.master_data_records AS room
SET gender_code = building.gender_code
FROM public.master_data_records AS building
WHERE room.category = 'Kamar'
  AND room.status = 'Active'
  AND room.parent_id IS NOT NULL
  AND room.gender_code IS NULL
  AND building.tenant_id = room.tenant_id
  AND building.category = 'Gedung'
  AND building.id = room.parent_id
  AND building.gender_code IS NOT NULL;

-- 2) Place active students into class + room + building (gender-matched).
WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
active_students AS (
  SELECT
    s.tenant_id,
    s.id AS student_id,
    s.grade,
    s.gender,
    row_number() OVER (PARTITION BY s.tenant_id, s.gender ORDER BY s.name, s.id) AS student_ord
  FROM public.students s
  WHERE lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  AND s.room_id IS NULL
  AND s.gender IN ('L', 'P')
),
room_pick AS (
  SELECT
    r.tenant_id,
    r.id AS room_id,
    r.parent_id AS building_id,
    r.gender_code AS gender,
    row_number() OVER (PARTITION BY r.tenant_id, r.gender_code ORDER BY r.name, r.id) AS room_ord,
    count(*) OVER (PARTITION BY r.tenant_id, r.gender_code) AS room_count
  FROM public.master_data_records r
  WHERE r.category = 'Kamar'
    AND r.status = 'Active'
    AND r.parent_id IS NOT NULL
    AND r.gender_code IN ('L', 'P')
),
placements AS (
  SELECT
    a.tenant_id,
    a.student_id,
    rp.room_id,
    rp.building_id,
    act.user_id AS actor_user_id
  FROM active_students a
  JOIN room_pick rp
    ON rp.tenant_id = a.tenant_id
   AND rp.gender = a.gender
   AND rp.room_ord = ((a.student_ord - 1) % rp.room_count) + 1
  JOIN actor act ON act.tenant_id = a.tenant_id
)
SELECT public.assign_student_to_room_audited(
  p.tenant_id,
  p.student_id,
  p.room_id,
  p.building_id,
  p.actor_user_id
)
FROM placements p;

UPDATE public.students AS s
SET class_id = p.class_id,
    class_category = 'Kelas'
FROM (
  WITH active_students AS (
    SELECT
      st.tenant_id,
      st.id AS student_id,
      st.grade,
      row_number() OVER (PARTITION BY st.tenant_id ORDER BY st.name, st.id) AS student_ord
    FROM public.students st
    WHERE lower(COALESCE(st.status, '')) NOT IN (
      'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
    )
    AND st.class_id IS NULL
  ),
  class_pick AS (
    SELECT
      c.tenant_id,
      c.id AS class_id,
      c.grade,
      row_number() OVER (PARTITION BY c.tenant_id, c.grade ORDER BY c.name, c.id) AS class_ord
    FROM public.master_data_records c
    WHERE c.category = 'Kelas' AND c.status = 'Active'
  )
  SELECT
    a.tenant_id,
    a.student_id,
    COALESCE(
      (
        SELECT cp.class_id FROM class_pick cp
        WHERE cp.tenant_id = a.tenant_id AND cp.grade = a.grade
        ORDER BY cp.class_ord LIMIT 1
      ),
      (
        SELECT cp.class_id FROM class_pick cp
        WHERE cp.tenant_id = a.tenant_id
        ORDER BY cp.class_ord LIMIT 1
      )
    ) AS class_id
  FROM active_students a
) AS p
WHERE s.tenant_id = p.tenant_id
  AND s.id = p.student_id
  AND p.class_id IS NOT NULL
  AND s.class_id IS NULL;

-- 3) Reference catalog for CBT templates.
INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
)
SELECT actor.tenant_id, sample.domain, sample.code, sample.name, sample.description, 'active',
  actor.user_id, actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor
CROSS JOIN (VALUES
  ('cbt_question_template', 'PG_STANDAR', 'Pilihan Ganda Standar', 'Template soal pilihan ganda standar untuk bank CBT.'),
  ('cbt_question_template', 'PG_TAHFIDZ', 'Pilihan Ganda Tahfidz', 'Template soal pilihan ganda berbasis materi tahfidz.')
) AS sample(domain, code, name, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_reference_items existing
  WHERE existing.tenant_id = actor.tenant_id
    AND existing.domain = sample.domain
    AND (existing.code = sample.code OR lower(btrim(existing.name)) = lower(sample.name))
);

-- 4) CBT settings and sample records use active, tenant-owned catalog choices.
-- If a tenant has no active grade, its CBT sample questions and exam are skipped;
-- migrations never create a free-text grade to satisfy the sample data.
INSERT INTO public.cbt_tenant_settings (
  tenant_id, subjects, grades, templates, auto_grading, shuffle_questions,
  correct_points, wrong_points, blank_points, source_system, created_by, updated_by
)
SELECT
  actor.tenant_id,
  ARRAY(
    SELECT item.name FROM public.tenant_reference_items item
    WHERE item.tenant_id = actor.tenant_id AND item.domain = 'academic_subject' AND item.status = 'active'
    ORDER BY item.code, item.name, item.id LIMIT 100
  ),
  ARRAY(
    SELECT item.name FROM public.tenant_reference_items item
    WHERE item.tenant_id = actor.tenant_id AND item.domain = 'academic_grade_level' AND item.status = 'active'
    ORDER BY item.code, item.name, item.id LIMIT 100
  ),
  ARRAY(
    SELECT item.name FROM public.tenant_reference_items item
    WHERE item.tenant_id = actor.tenant_id AND item.domain = 'cbt_question_template' AND item.status = 'active'
    ORDER BY item.code, item.name, item.id LIMIT 100
  ),
  true, false, 1, 0, 0, 'supabase_runtime', actor.user_id, actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor
WHERE NOT EXISTS (
  SELECT 1 FROM public.cbt_tenant_settings settings WHERE settings.tenant_id = actor.tenant_id
);

WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
seed_questions AS (
  SELECT * FROM (VALUES
    ('Fiqih', 'Pilihan Ganda Standar', '<p>Berapa rakaat shalat Subuh?</p>',
      '["1","2","3","4"]'::jsonb, 1::smallint, 'Easy',
      'a1111111-1111-4111-8111-111111111101'::uuid),
    ('Fiqih', 'Pilihan Ganda Standar', '<p>Apa rukun wudhu yang pertama?</p>',
      '["Niat","Membasuh muka","Membasuh tangan","Mengusap kepala"]'::jsonb, 0::smallint, 'Medium',
      'a1111111-1111-4111-8111-111111111102'::uuid),
    ('Matematika', 'Pilihan Ganda Standar', '<p>Hasil dari 12 + 8 adalah?</p>',
      '["18","19","20","21"]'::jsonb, 2::smallint, 'Easy',
      'a1111111-1111-4111-8111-111111111103'::uuid),
    ('Bahasa Arab', 'Pilihan Ganda Standar', '<p>Arti kata kitabun adalah?</p>',
      '["Pulpen","Buku","Meja","Kursi"]'::jsonb, 1::smallint, 'Easy',
      'a1111111-1111-4111-8111-111111111104'::uuid),
    ('Fiqih', 'Pilihan Ganda Tahfidz', '<p>Surah Al-Fatihah memiliki berapa ayat?</p>',
      '["5","6","7","8"]'::jsonb, 2::smallint, 'Medium',
      'a1111111-1111-4111-8111-111111111105'::uuid)
  ) AS q(subject_name, template_name, question_html, options, correct_answer, difficulty, client_request_id)
)
INSERT INTO public.cbt_questions (
  tenant_id, subject, grade, template, question_html, options, correct_answer, explanation,
  difficulty, tags, status, source_system, client_request_id, created_by, updated_by
)
SELECT
  actor.tenant_id, subject_ref.name, grade_ref.name, template_ref.name, q.question_html, q.options,
  q.correct_answer, '', q.difficulty, ARRAY['seed']::text[], 'active', 'supabase_runtime',
  q.client_request_id, actor.user_id, actor.user_id
FROM actor
CROSS JOIN seed_questions q
JOIN LATERAL (
  SELECT item.name
  FROM public.tenant_reference_items item
  WHERE item.tenant_id = actor.tenant_id
    AND item.domain = 'academic_subject'
    AND item.status = 'active'
    AND lower(btrim(item.name)) = lower(btrim(q.subject_name))
  ORDER BY item.code, item.id
  LIMIT 1
) AS subject_ref ON true
JOIN LATERAL (
  SELECT item.name
  FROM public.tenant_reference_items item
  WHERE item.tenant_id = actor.tenant_id
    AND item.domain = 'academic_grade_level'
    AND item.status = 'active'
  ORDER BY item.code, item.name, item.id
  LIMIT 1
) AS grade_ref ON true
JOIN LATERAL (
  SELECT item.name
  FROM public.tenant_reference_items item
  WHERE item.tenant_id = actor.tenant_id
    AND item.domain = 'cbt_question_template'
    AND item.status = 'active'
    AND lower(btrim(item.name)) = lower(btrim(q.template_name))
  ORDER BY item.code, item.id
  LIMIT 1
) AS template_ref ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.cbt_questions existing
  WHERE existing.tenant_id = actor.tenant_id AND existing.client_request_id = q.client_request_id
);

WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
)
INSERT INTO public.cbt_exams (
  tenant_id, title, subject, grade, starts_at, ends_at, duration_minutes, passing_score,
  correct_points, wrong_points, blank_points, shuffle_questions, status, client_request_id,
  created_by, updated_by
)
SELECT
  actor.tenant_id,
  'Ujian Sampel Fiqih Semester Ganjil',
  subject_ref.name,
  grade_ref.name,
  now() - interval '1 day',
  now() + interval '30 days',
  45,
  70,
  1, 0, 0, false, 'published',
  'a1111111-1111-4111-8111-111111111201'::uuid,
  actor.user_id, actor.user_id
FROM actor
JOIN LATERAL (
  SELECT item.name
  FROM public.tenant_reference_items item
  WHERE item.tenant_id = actor.tenant_id
    AND item.domain = 'academic_subject'
    AND item.status = 'active'
    AND lower(btrim(item.name)) = 'fiqih'
  ORDER BY item.code, item.id
  LIMIT 1
) AS subject_ref ON true
JOIN LATERAL (
  SELECT item.name
  FROM public.tenant_reference_items item
  WHERE item.tenant_id = actor.tenant_id
    AND item.domain = 'academic_grade_level'
    AND item.status = 'active'
  ORDER BY item.code, item.name, item.id
  LIMIT 1
) AS grade_ref ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.cbt_exams existing
  WHERE existing.tenant_id = actor.tenant_id
    AND existing.client_request_id = 'a1111111-1111-4111-8111-111111111201'::uuid
);

INSERT INTO public.cbt_exam_questions (tenant_id, exam_id, question_id, display_order)
SELECT q.tenant_id, e.id, q.id, row_number() OVER (PARTITION BY q.tenant_id ORDER BY q.created_at, q.id) - 1
FROM public.cbt_exams e
JOIN public.cbt_questions q
  ON q.tenant_id = e.tenant_id
 AND q.subject = e.subject
 AND q.grade = e.grade
 AND q.status = 'active'
WHERE e.client_request_id = 'a1111111-1111-4111-8111-111111111201'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM public.cbt_exam_questions eq
    WHERE eq.tenant_id = e.tenant_id AND eq.exam_id = e.id AND eq.question_id = q.id
  );

INSERT INTO public.cbt_exam_assignments (
  tenant_id, exam_id, student_id, status, assigned_by
)
SELECT e.tenant_id, e.id, s.id, 'assigned', e.created_by
FROM public.cbt_exams e
JOIN public.students s
  ON s.tenant_id = e.tenant_id
 AND s.grade_level_reference_id = e.grade_level_reference_id
WHERE e.client_request_id = 'a1111111-1111-4111-8111-111111111201'::uuid
  AND lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.cbt_exam_assignments a
    WHERE a.tenant_id = e.tenant_id AND a.exam_id = e.id AND a.student_id = s.id
  );

-- 5) Tahfidz: assign ustadz, memberships, targets, sample records.
UPDATE public.tahfidz_halaqahs AS h
SET ustadz_user_id = actor.user_id,
    ustadz_name = COALESCE(NULLIF(btrim(actor.email), ''), 'Admin Tenant')
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, email
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor
WHERE h.tenant_id = actor.tenant_id
  AND h.status = 'active'
  AND h.ustadz_user_id IS NULL
  AND h.name IN ('Halaqah 1', 'Halaqah 2', 'Halaqah 3', 'Halaqah 4', 'Halaqah 5');

WITH ranked_students AS (
  SELECT
    s.tenant_id,
    s.id AS student_id,
    row_number() OVER (PARTITION BY s.tenant_id ORDER BY s.name, s.id) AS student_ord
  FROM public.students s
  WHERE lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
),
ranked_halaqahs AS (
  SELECT
    h.tenant_id,
    h.id AS halaqah_id,
    row_number() OVER (PARTITION BY h.tenant_id ORDER BY h.name, h.id) AS halaqah_ord,
    count(*) OVER (PARTITION BY h.tenant_id) AS halaqah_count
  FROM public.tahfidz_halaqahs h
  WHERE h.status = 'active'
)
INSERT INTO public.tahfidz_memberships (
  tenant_id, halaqah_id, student_id, starts_on, status, source_system
)
SELECT
  rs.tenant_id,
  rh.halaqah_id,
  rs.student_id,
  CURRENT_DATE,
  'active',
  'manual'
FROM ranked_students rs
JOIN ranked_halaqahs rh
  ON rh.tenant_id = rs.tenant_id
 AND rh.halaqah_ord = ((rs.student_ord - 1) % rh.halaqah_count) + 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.tahfidz_memberships m
  WHERE m.tenant_id = rs.tenant_id AND m.student_id = rs.student_id AND m.status = 'active'
);

INSERT INTO public.tahfidz_targets (
  tenant_id, student_id, period_start, ziyadah_pages_per_day, murojaah_pages_per_day,
  target_policy, status, notes, created_by_user_id
)
SELECT
  m.tenant_id,
  m.student_id,
  date_trunc('month', CURRENT_DATE)::date,
  1.0,
  0.5,
  'standard',
  'active',
  'Target operasional sampel',
  actor.user_id
FROM public.tahfidz_memberships m
JOIN (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor ON actor.tenant_id = m.tenant_id
WHERE m.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.tahfidz_targets t
    WHERE t.tenant_id = m.tenant_id AND t.student_id = m.student_id AND t.status = 'active'
  );

INSERT INTO public.tahfidz_records (
  tenant_id, student_id, halaqah_id, activity_type, surah_name, ayah_start, ayah_end,
  fluency_grade, tajweed_grade, notes, performed_at, recorded_by_user_id, recorded_by_name,
  client_request_id
)
SELECT
  m.tenant_id,
  m.student_id,
  m.halaqah_id,
  'Ziyadah',
  'Al-Fatihah',
  1,
  7,
  'A',
  'A-',
  'Setoran sampel operasional',
  now() - ((row_number() OVER (PARTITION BY m.tenant_id ORDER BY m.student_id)) * interval '1 hour'),
  actor.user_id,
  COALESCE(NULLIF(btrim(actor.email), ''), 'Admin Tenant'),
  ('b1111111-1111-4111-8111-11111111' || lpad((row_number() OVER (PARTITION BY m.tenant_id ORDER BY m.student_id))::text, 4, '0'))::uuid
FROM public.tahfidz_memberships m
JOIN (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id, email
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor ON actor.tenant_id = m.tenant_id
WHERE m.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.tahfidz_records r
    WHERE r.tenant_id = m.tenant_id AND r.student_id = m.student_id
  );

-- 6) LMS sample course tree + enrollments.
WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
ins_cat AS (
  INSERT INTO public.lms_categories (
    tenant_id, name, description, status, source_system, created_by, updated_by
  )
  SELECT actor.tenant_id, 'Kurikulum Formal', 'Kategori sampel LMS operasional', 'active',
    'supabase_runtime', actor.user_id, actor.user_id
  FROM actor
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lms_categories c
    WHERE c.tenant_id = actor.tenant_id AND lower(btrim(c.name)) = 'kurikulum formal'
  )
  RETURNING tenant_id, id
),
cat AS (
  SELECT * FROM ins_cat
  UNION
  SELECT c.tenant_id, c.id
  FROM public.lms_categories c
  JOIN actor ON actor.tenant_id = c.tenant_id
  WHERE lower(btrim(c.name)) = 'kurikulum formal'
),
ins_course AS (
  INSERT INTO public.lms_courses (
    tenant_id, category_id, category_name, title, description, grade, instructor_user_id,
    status, color, source_system, client_request_id, created_by, updated_by
  )
  SELECT
    actor.tenant_id, cat.id, 'Kurikulum Formal',
    'Pengantar Fiqih Ibadah',
    'Kursus sampel untuk runtime LMS operasional.',
    'X-A',
    actor.user_id,
    'published',
    'emerald',
    'supabase_runtime',
    'c1111111-1111-4111-8111-111111111301'::uuid,
    actor.user_id, actor.user_id
  FROM actor
  JOIN cat ON cat.tenant_id = actor.tenant_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lms_courses existing
    WHERE existing.tenant_id = actor.tenant_id
      AND existing.client_request_id = 'c1111111-1111-4111-8111-111111111301'::uuid
  )
  RETURNING tenant_id, id
),
course AS (
  SELECT * FROM ins_course
  UNION
  SELECT c.tenant_id, c.id
  FROM public.lms_courses c
  WHERE c.client_request_id = 'c1111111-1111-4111-8111-111111111301'::uuid
),
ins_module AS (
  INSERT INTO public.lms_course_modules (
    tenant_id, course_id, title, description, display_order, client_request_id,
    source_system, created_by, updated_by
  )
  SELECT
    course.tenant_id, course.id, 'Modul 1: Thaharah', 'Materi dasar bersuci.', 0,
    'c1111111-1111-4111-8111-111111111302'::uuid, 'supabase_runtime',
    actor.user_id, actor.user_id
  FROM course
  JOIN actor ON actor.tenant_id = course.tenant_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.lms_course_modules m
    WHERE m.tenant_id = course.tenant_id
      AND m.client_request_id = 'c1111111-1111-4111-8111-111111111302'::uuid
  )
  RETURNING tenant_id, id
),
module AS (
  SELECT * FROM ins_module
  UNION
  SELECT m.tenant_id, m.id
  FROM public.lms_course_modules m
  WHERE m.client_request_id = 'c1111111-1111-4111-8111-111111111302'::uuid
)
INSERT INTO public.lms_materials (
  tenant_id, module_id, title, material_type, resource_url, body, display_order,
  client_request_id, source_system, created_by, updated_by
)
SELECT
  module.tenant_id, module.id, 'Ringkasan Thaharah', 'text', '',
  'Materi ringkas tentang wudhu, mandi, dan tayammum untuk santri tingkat awal.',
  0, 'c1111111-1111-4111-8111-111111111303'::uuid, 'supabase_runtime',
  actor.user_id, actor.user_id
FROM module
JOIN actor ON actor.tenant_id = module.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.lms_materials mat
  WHERE mat.tenant_id = module.tenant_id
    AND mat.client_request_id = 'c1111111-1111-4111-8111-111111111303'::uuid
);

INSERT INTO public.lms_enrollments (
  tenant_id, course_id, student_id, status, enrolled_by
)
SELECT c.tenant_id, c.id, s.id, 'active', c.created_by
FROM public.lms_courses c
JOIN public.students s ON s.tenant_id = c.tenant_id
WHERE c.client_request_id = 'c1111111-1111-4111-8111-111111111301'::uuid
  AND lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.lms_enrollments e
    WHERE e.tenant_id = c.tenant_id AND e.course_id = c.id AND e.student_id = s.id
  );

-- 7) Library sample books tied to reference categories.
INSERT INTO public.library_books (
  tenant_id, title, author, category, category_reference_id, isbn, total_copies, shelf,
  status, source_system, created_by_user_id
)
SELECT
  actor.tenant_id,
  sample.title,
  sample.author,
  cat.name,
  cat.id,
  sample.isbn,
  sample.copies,
  sample.shelf,
  'active',
  'manual',
  actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor
JOIN public.tenant_reference_items cat
  ON cat.tenant_id = actor.tenant_id
 AND cat.domain = 'library_book_category'
 AND cat.status = 'active'
JOIN (VALUES
  ('UMUM', 'Pengantar Manajemen Pesantren', 'Tim Kurikulum', '9786020000001', 5, 'A-01'),
  ('FIKIH', 'Fiqih Ibadah untuk Santri', 'Ustadz Sample', '9786020000002', 8, 'B-02'),
  ('TAFSIR_HADIS', 'Tafsir Ringkas Juz 30', 'Lembaga Tahfidz', '9786020000003', 4, 'C-03'),
  ('AKIDAH_AKHLAK', 'Akhlak Santri Modern', 'Dewan Asatidz', '9786020000004', 6, 'D-04'),
  ('BAHASA', 'Kamus Arab-Indonesia Ringkas', 'Tim Bahasa', '9786020000005', 10, 'E-05')
) AS sample(code, title, author, isbn, copies, shelf)
  ON cat.code = sample.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.library_books b
  WHERE b.tenant_id = actor.tenant_id AND b.isbn = sample.isbn AND b.status = 'active'
);

-- 8) Sample organization unit + map asrama locations (staff assignment needs Ustadz + unit).
INSERT INTO public.organization_units (
  tenant_id, code, name, unit_type, location, status, created_by_user_id, updated_by_user_id
)
SELECT
  actor.tenant_id,
  'ASRAMA_PUSAT',
  'Unit Asrama Pusat',
  'pesantren',
  'Kampus Utama',
  'active',
  actor.user_id,
  actor.user_id
FROM (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_units u
  WHERE u.tenant_id = actor.tenant_id AND u.code = 'ASRAMA_PUSAT'
);

UPDATE public.master_data_records AS loc
SET organization_unit_id = u.id
FROM public.organization_units u
WHERE u.code = 'ASRAMA_PUSAT'
  AND u.status = 'active'
  AND loc.tenant_id = u.tenant_id
  AND loc.category IN ('Gedung', 'Kamar')
  AND loc.organization_unit_id IS NULL;

UPDATE public.students AS s
SET organization_unit_id = u.id
FROM public.organization_units u
WHERE u.code = 'ASRAMA_PUSAT'
  AND u.status = 'active'
  AND s.tenant_id = u.tenant_id
  AND s.organization_unit_id IS NULL
  AND lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  );

INSERT INTO public.boarding_permits (
  tenant_id, student_id, room_id, room_name_snapshot, permit_type, reason,
  start_date, end_date, status, requested_by_user_id, client_request_id, source_system
)
SELECT
  s.tenant_id,
  s.id,
  s.room_id,
  room.name,
  'Keluar Area',
  'Izin sampel operasional untuk keperluan administrasi.',
  CURRENT_DATE,
  CURRENT_DATE + 1,
  'Pending Musyrif',
  actor.user_id,
  'd1111111-1111-4111-8111-111111111401'::uuid,
  'manual'
FROM public.students s
JOIN (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor ON actor.tenant_id = s.tenant_id
LEFT JOIN public.master_data_records room
  ON room.tenant_id = s.tenant_id AND room.id = s.room_id AND room.category = 'Kamar'
WHERE s.room_id IS NOT NULL
  AND lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.boarding_permits p
    WHERE p.tenant_id = s.tenant_id
      AND p.client_request_id = 'd1111111-1111-4111-8111-111111111401'::uuid
  )
ORDER BY s.name, s.id
LIMIT 1;

INSERT INTO public.boarding_discipline_incidents (
  tenant_id, student_id, room_id, room_name_snapshot, offense, category, points,
  incident_date, resolved, created_by_user_id, client_request_id, source_system
)
SELECT
  s.tenant_id,
  s.id,
  s.room_id,
  room.name,
  'Terlambat kembali ke asrama setelah kegiatan malam.',
  'Ringan',
  5,
  CURRENT_DATE,
  false,
  actor.user_id,
  'd1111111-1111-4111-8111-111111111402'::uuid,
  'manual'
FROM public.students s
JOIN (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
) AS actor ON actor.tenant_id = s.tenant_id
LEFT JOIN public.master_data_records room
  ON room.tenant_id = s.tenant_id AND room.id = s.room_id AND room.category = 'Kamar'
WHERE s.room_id IS NOT NULL
  AND lower(COALESCE(s.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.boarding_discipline_incidents i
    WHERE i.tenant_id = s.tenant_id
      AND i.client_request_id = 'd1111111-1111-4111-8111-111111111402'::uuid
  )
ORDER BY s.name, s.id
LIMIT 1;

WITH actor AS (
  SELECT DISTINCT ON (tenant_id) tenant_id, user_id
  FROM public.profiles
  WHERE status = 'active' AND lower(role) IN ('admin', 'super_admin')
  ORDER BY tenant_id, CASE lower(role) WHEN 'admin' THEN 0 ELSE 1 END, created_at, user_id
),
ins_session AS (
  INSERT INTO public.boarding_attendance_sessions (
    tenant_id, attendance_date, session_type, created_by_user_id
  )
  SELECT actor.tenant_id, CURRENT_DATE, 'nightly_curfew', actor.user_id
  FROM actor
  WHERE NOT EXISTS (
    SELECT 1 FROM public.boarding_attendance_sessions s
    WHERE s.tenant_id = actor.tenant_id
      AND s.attendance_date = CURRENT_DATE
      AND s.session_type = 'nightly_curfew'
  )
  RETURNING tenant_id, id
),
session AS (
  SELECT * FROM ins_session
  UNION
  SELECT s.tenant_id, s.id
  FROM public.boarding_attendance_sessions s
  JOIN actor ON actor.tenant_id = s.tenant_id
  WHERE s.attendance_date = CURRENT_DATE AND s.session_type = 'nightly_curfew'
)
INSERT INTO public.boarding_attendance_records (
  tenant_id, session_id, student_id, room_id, room_name_snapshot, status,
  marked_by_user_id, source_system
)
SELECT
  session.tenant_id,
  session.id,
  st.id,
  st.room_id,
  room.name,
  'Hadir',
  actor.user_id,
  'manual'
FROM session
JOIN actor ON actor.tenant_id = session.tenant_id
JOIN public.students st ON st.tenant_id = session.tenant_id
LEFT JOIN public.master_data_records room
  ON room.tenant_id = st.tenant_id AND room.id = st.room_id AND room.category = 'Kamar'
WHERE st.room_id IS NOT NULL
  AND lower(COALESCE(st.status, '')) NOT IN (
    'archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'tidak aktif', 'disabled', 'dikeluarkan'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.boarding_attendance_records r
    WHERE r.tenant_id = session.tenant_id
      AND r.session_id = session.id
      AND r.student_id = st.id
  );

COMMIT;
