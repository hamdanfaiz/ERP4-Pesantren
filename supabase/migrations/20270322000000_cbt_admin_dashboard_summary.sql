-- Tenant-scoped CBT dashboard aggregates without loading full operational collections.
BEGIN;

CREATE INDEX IF NOT EXISTS cbt_assignments_tenant_exam_status_summary_idx
  ON public.cbt_exam_assignments (tenant_id, exam_id, status);

CREATE INDEX IF NOT EXISTS cbt_attempts_tenant_submitted_summary_idx
  ON public.cbt_attempts (tenant_id, submitted_at DESC, id)
  WHERE submitted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_cbt_admin_dashboard_summary(
  p_tenant_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_now TIMESTAMPTZ := statement_timestamp();
  v_summary JSONB;
BEGIN
  IF p_tenant_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant CBT tidak tersedia' USING ERRCODE = '42501';
  END IF;

  WITH assignment_summary AS (
    SELECT
      count(*) AS total_count,
      count(*) FILTER (WHERE lower(status) IN ('completed', 'submitted', 'graded')) AS completed_count,
      count(*) FILTER (WHERE status = 'assigned') AS assigned_status_count,
      count(*) FILTER (WHERE status = 'in_progress') AS in_progress_status_count,
      count(*) FILTER (WHERE status = 'completed') AS completed_status_count,
      count(*) FILTER (WHERE status = 'missed') AS missed_status_count
    FROM public.cbt_exam_assignments
    WHERE tenant_id = p_tenant_id
  ),
  attempt_summary AS (
    SELECT
      count(*) FILTER (WHERE score IS NOT NULL) AS scored_count,
      round(avg(score) FILTER (WHERE score IS NOT NULL), 1) AS average_score,
      count(*) FILTER (WHERE passed IS NOT NULL) AS decided_count,
      count(*) FILTER (WHERE passed IS TRUE) AS passed_count
    FROM public.cbt_attempts
    WHERE tenant_id = p_tenant_id
  ),
  assignment_counts AS (
    SELECT
      tenant_id,
      exam_id,
      count(*) AS assigned_count,
      count(*) FILTER (WHERE status = 'completed') AS completed_count
    FROM public.cbt_exam_assignments
    WHERE tenant_id = p_tenant_id
    GROUP BY tenant_id, exam_id
  ),
  published_exams AS (
    SELECT id, tenant_id, title, subject, grade, starts_at, ends_at, duration_minutes, status
    FROM public.cbt_exams
    WHERE tenant_id = p_tenant_id
      AND status IN ('active', 'published')
  ),
  latest_results AS (
    SELECT
      assignment.id AS assignment_id,
      assignment.status,
      attempt.score,
      attempt.passed,
      attempt.submitted_at,
      CASE
        WHEN student.id IS NULL OR lower(COALESCE(student.status, '')) IN
          ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
          THEN 'Santri diarsipkan'
        ELSE COALESCE(student.name, 'Santri diarsipkan')
      END AS student_name,
      CASE
        WHEN student.id IS NULL OR lower(COALESCE(student.status, '')) IN
          ('archived', 'alumni', 'graduated', 'inactive', 'nonaktif', 'dikeluarkan')
          OR lower(COALESCE(class_record.status, '')) IN ('inactive', 'nonaktif', 'disabled', 'arsip')
          THEN ''
        ELSE COALESCE(class_record.name, '')
      END AS class_name,
      exam.title AS exam_title
    FROM public.cbt_attempts AS attempt
    JOIN public.cbt_exam_assignments AS assignment
      ON assignment.tenant_id = p_tenant_id
      AND assignment.tenant_id = attempt.tenant_id
      AND assignment.id = attempt.assignment_id
    JOIN public.cbt_exams AS exam
      ON exam.tenant_id = p_tenant_id
      AND exam.tenant_id = assignment.tenant_id
      AND exam.id = assignment.exam_id
    LEFT JOIN public.students AS student
      ON student.tenant_id = p_tenant_id
      AND student.tenant_id = assignment.tenant_id
      AND student.id = assignment.student_id
    LEFT JOIN public.master_data_records AS class_record
      ON class_record.tenant_id = p_tenant_id
      AND class_record.tenant_id = student.tenant_id
      AND class_record.category = 'Kelas'
      AND class_record.id = student.class_id
    WHERE attempt.tenant_id = p_tenant_id
      AND attempt.submitted_at IS NOT NULL
    ORDER BY attempt.submitted_at DESC, assignment.id ASC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    'activeQuestions', (
      SELECT count(*) FROM public.cbt_questions
      WHERE tenant_id = p_tenant_id AND status = 'active'
    ),
    'totalExams', (
      SELECT count(*) FROM public.cbt_exams
      WHERE tenant_id = p_tenant_id
    ),
    'ongoingSessions', (
      SELECT count(*) FROM published_exams
      WHERE starts_at <= v_now AND ends_at > v_now
    ),
    'upcomingSessions', (
      SELECT count(*) FROM published_exams
      WHERE starts_at > v_now
    ),
    'totalAssignments', (SELECT total_count FROM assignment_summary),
    'completedAssignments', (SELECT completed_count FROM assignment_summary),
    'assignmentStatusCounts', (
      SELECT jsonb_build_object(
        'assigned', assigned_status_count,
        'in_progress', in_progress_status_count,
        'completed', completed_status_count,
        'missed', missed_status_count
      )
      FROM assignment_summary
    ),
    'completionRate', (
      SELECT CASE WHEN total_count = 0 THEN NULL
        ELSE round(100.0 * completed_count / total_count, 1)
      END
      FROM assignment_summary
    ),
    'scoredAssignments', (SELECT scored_count FROM attempt_summary),
    'averageScore', (SELECT average_score FROM attempt_summary),
    'passRate', (
      SELECT CASE WHEN decided_count = 0 THEN NULL
        ELSE round(100.0 * passed_count / decided_count, 1)
      END
      FROM attempt_summary
    ),
    'upcomingExams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', upcoming.id,
        'title', upcoming.title,
        'subject', upcoming.subject,
        'grade', upcoming.grade,
        'startsAt', upcoming.starts_at,
        'endsAt', upcoming.ends_at,
        'durationMinutes', upcoming.duration_minutes,
        'status', upcoming.status,
        'assignedCount', COALESCE(counts.assigned_count, 0),
        'completedCount', COALESCE(counts.completed_count, 0)
      ) ORDER BY upcoming.starts_at ASC, upcoming.id ASC)
      FROM (
        SELECT * FROM published_exams
        WHERE starts_at > v_now
        ORDER BY starts_at ASC, id ASC
        LIMIT 5
      ) AS upcoming
      LEFT JOIN assignment_counts AS counts
        ON counts.tenant_id = upcoming.tenant_id
        AND counts.exam_id = upcoming.id
    ), '[]'::JSONB),
    'latestResults', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'assignmentId', result.assignment_id,
        'examTitle', COALESCE(result.exam_title, 'Ujian'),
        'studentName', result.student_name,
        'className', result.class_name,
        'status', result.status,
        'score', result.score,
        'passed', result.passed,
        'submittedAt', result.submitted_at
      ) ORDER BY result.submitted_at DESC, result.assignment_id ASC)
      FROM latest_results AS result
    ), '[]'::JSONB),
    'asOf', v_now
  )
  INTO v_summary;

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cbt_admin_dashboard_summary(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cbt_admin_dashboard_summary(UUID)
  TO service_role;

COMMIT;
