-- Support reverse guardian-to-student lookups and the scoped Tahfidz session
-- page used by Ustadz accounts. These indexes do not change access semantics.
CREATE INDEX IF NOT EXISTS guardian_students_tenant_student_idx
  ON public.guardian_students (tenant_id, student_id, guardian_id);

CREATE INDEX IF NOT EXISTS tahfidz_sessions_tenant_halaqah_kind_schedule_idx
  ON public.tahfidz_sessions (tenant_id, halaqah_id, kind, scheduled_at ASC, id ASC);

COMMENT ON INDEX public.guardian_students_tenant_student_idx IS
  'Supports tenant-scoped guardian lookup by student and the composite student foreign key.';

COMMENT ON INDEX public.tahfidz_sessions_tenant_halaqah_kind_schedule_idx IS
  'Supports tenant-scoped Tahfidz session pages filtered by halaqah and kind, ordered by schedule.';

