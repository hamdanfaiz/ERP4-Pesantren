-- Enforce tenant-safe references from LMS idempotency records to their source notes/comments.
-- Refuse to proceed if an earlier writer created a cross-tenant association.
BEGIN;

SET LOCAL lock_timeout = '5s';

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.lms_learning_record_requests AS request
    LEFT JOIN public.lms_student_notes AS note
      ON note.tenant_id = request.tenant_id
     AND note.id = request.note_id
    WHERE request.note_id IS NOT NULL
      AND note.id IS NULL
  ) OR EXISTS (
    SELECT 1
    FROM public.lms_learning_record_requests AS request
    LEFT JOIN public.lms_material_comments AS comment
      ON comment.tenant_id = request.tenant_id
     AND comment.id = request.comment_id
    WHERE request.comment_id IS NOT NULL
      AND comment.id IS NULL
  ) THEN
    RAISE EXCEPTION 'LMS learning request ledger contains a cross-tenant note or comment reference'
      USING ERRCODE = '23503';
  END IF;
END;
$migration$;

ALTER TABLE public.lms_student_notes
  ADD CONSTRAINT lms_student_notes_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE public.lms_material_comments
  ADD CONSTRAINT lms_material_comments_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE public.lms_learning_record_requests
  DROP CONSTRAINT lms_learning_record_requests_note_id_fkey,
  DROP CONSTRAINT lms_learning_record_requests_comment_id_fkey,
  ADD CONSTRAINT lms_learning_record_requests_note_tenant_fkey
    FOREIGN KEY (tenant_id, note_id)
    REFERENCES public.lms_student_notes (tenant_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT lms_learning_record_requests_comment_tenant_fkey
    FOREIGN KEY (tenant_id, comment_id)
    REFERENCES public.lms_material_comments (tenant_id, id)
    ON DELETE RESTRICT;

-- Support parent lookups and RESTRICT checks without scanning the full ledger.
CREATE INDEX lms_learning_record_requests_actor_idx
  ON public.lms_learning_record_requests (tenant_id, actor_user_id);
CREATE INDEX lms_learning_record_requests_material_idx
  ON public.lms_learning_record_requests (tenant_id, material_id);
CREATE INDEX lms_learning_record_requests_note_idx
  ON public.lms_learning_record_requests (tenant_id, note_id)
  WHERE note_id IS NOT NULL;
CREATE INDEX lms_learning_record_requests_comment_idx
  ON public.lms_learning_record_requests (tenant_id, comment_id)
  WHERE comment_id IS NOT NULL;

COMMIT;
