-- Enable traceable, idempotent import of existing operational records.
-- This migration only changes schema; it does not read Firebase or import live data.
BEGIN;

ALTER TABLE public.students
  ALTER COLUMN source_candidate_id DROP NOT NULL,
  ALTER COLUMN nis DROP NOT NULL,
  ALTER COLUMN gender DROP NOT NULL,
  ALTER COLUMN nik_ciphertext DROP NOT NULL,
  ALTER COLUMN nik_fingerprint DROP NOT NULL,
  ALTER COLUMN class_id DROP NOT NULL,
  ALTER COLUMN room_id DROP NOT NULL,
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'ppdb',
  ADD COLUMN source_record_id TEXT;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_nis_check,
  ADD CONSTRAINT students_legacy_nis_format_check
    CHECK (nis IS NULL OR nis ~ '^[0-9]{1,10}$'),
  ADD CONSTRAINT students_source_origin_check
    CHECK (
      (source_system = 'ppdb' AND source_candidate_id IS NOT NULL AND source_record_id IS NULL)
      OR
      (source_system = 'legacy_import' AND source_candidate_id IS NULL
        AND source_record_id IS NOT NULL AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
    );

CREATE UNIQUE INDEX students_source_record_tenant_uq
  ON public.students (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

ALTER TABLE public.guardians
  ALTER COLUMN source_candidate_id DROP NOT NULL,
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN source_system TEXT NOT NULL DEFAULT 'ppdb',
  ADD COLUMN source_record_id TEXT;

ALTER TABLE public.guardians
  ADD CONSTRAINT guardians_source_origin_check
    CHECK (
      (source_system = 'ppdb' AND source_candidate_id IS NOT NULL AND source_record_id IS NULL)
      OR
      (source_system = 'legacy_import' AND source_candidate_id IS NULL
        AND source_record_id IS NOT NULL AND length(btrim(source_record_id)) BETWEEN 1 AND 1500)
    );

CREATE UNIQUE INDEX guardians_source_record_tenant_uq
  ON public.guardians (tenant_id, source_system, source_record_id)
  WHERE source_record_id IS NOT NULL;

ALTER TABLE public.nis_reservations
  ALTER COLUMN candidate_id DROP NOT NULL;

ALTER TABLE public.nis_reservations
  DROP CONSTRAINT IF EXISTS nis_reservations_nis_check,
  ADD CONSTRAINT nis_reservations_legacy_nis_format_check
    CHECK (nis ~ '^[0-9]{1,10}$'),
  ADD CONSTRAINT nis_reservations_candidate_or_student_check
    CHECK (candidate_id IS NOT NULL OR student_id IS NOT NULL);

COMMIT;
