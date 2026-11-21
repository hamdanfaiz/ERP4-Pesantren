-- Add FK-covering indexes and keep the private projection policy tenant scoped with a statement-level context lookup.
BEGIN;

CREATE INDEX IF NOT EXISTS tahfidz_student_ayah_progress_tenant_halaqah_idx
  ON public.tahfidz_student_ayah_progress (tenant_id, halaqah_id, student_id);
CREATE INDEX IF NOT EXISTS tahfidz_student_ayah_progress_surah_number_idx
  ON public.tahfidz_student_ayah_progress (surah_number);

DROP POLICY IF EXISTS tahfidz_student_ayah_progress_owner_all
  ON public.tahfidz_student_ayah_progress;
DO $policy$
BEGIN
  EXECUTE format(
    'CREATE POLICY tahfidz_student_ayah_progress_owner_all ON public.tahfidz_student_ayah_progress FOR ALL TO %I USING (tenant_id = (SELECT NULLIF(pg_catalog.current_setting(%L, true), %L)::UUID)) WITH CHECK (tenant_id = (SELECT NULLIF(pg_catalog.current_setting(%L, true), %L)::UUID))',
    current_user, 'app.tahfidz_progress_tenant_id', '',
    'app.tahfidz_progress_tenant_id', ''
  );
END
$policy$;

COMMIT;
