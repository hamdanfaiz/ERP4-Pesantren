-- Close SQL NULL semantics gap for completed Munaqasyah/Tasmi outcomes.
-- Forward-only and fail-safe: pre-existing incomplete completed exams stop validation.
BEGIN;

ALTER TABLE public.tahfidz_sessions
  ADD CONSTRAINT tahfidz_sessions_exam_completion_result_required
  CHECK (
    kind <> 'exam'
    OR status <> 'completed'
    OR (
      score IS NOT NULL
      AND score BETWEEN 0 AND 100
      AND outcome IS NOT NULL
      AND outcome IN ('pass','retest')
    )
  ) NOT VALID;

ALTER TABLE public.tahfidz_sessions
  VALIDATE CONSTRAINT tahfidz_sessions_exam_completion_result_required;

COMMENT ON CONSTRAINT tahfidz_sessions_exam_completion_result_required
  ON public.tahfidz_sessions IS
  'A completed exam must persist both a non-null score and a pass/retest outcome.';

COMMIT;
