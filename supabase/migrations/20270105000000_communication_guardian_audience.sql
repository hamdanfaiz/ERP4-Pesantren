-- Resolve communication audiences from canonical tenant-scoped guardian/student links.
-- This keeps invitation-created multi-child Wali accounts consistent across list, count, and acknowledge.
BEGIN;

CREATE OR REPLACE FUNCTION public.communication_announcement_recipient_user_ids(
  p_tenant_id UUID,
  p_target_audience TEXT
)
RETURNS TABLE(user_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT DISTINCT profile.user_id
  FROM public.profiles profile
  JOIN public.tenants tenant ON tenant.id = profile.tenant_id
  WHERE profile.tenant_id = p_tenant_id
    AND profile.status = 'active'
    AND tenant.status = 'active'
    AND (
      (p_target_audience = 'Guru & Musyrif' AND profile.role = 'ustadz')
      OR (p_target_audience = 'Semua Santri' AND profile.role = 'santri')
      OR (
        profile.role = 'wali_santri'
        AND p_target_audience IN ('Semua Wali Santri', 'Wali Santri Kelas VII - A')
        AND EXISTS (
          SELECT 1
          FROM public.guardian_user_accounts account
          JOIN public.guardians guardian
            ON guardian.tenant_id = account.tenant_id AND guardian.id = account.guardian_id
          JOIN public.guardian_students relation
            ON relation.tenant_id = guardian.tenant_id AND relation.guardian_id = guardian.id
          JOIN public.students student
            ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
          LEFT JOIN public.master_data_records class_record
            ON class_record.tenant_id = student.tenant_id
            AND class_record.category = 'Kelas'
            AND class_record.id = student.class_id
          WHERE account.tenant_id = profile.tenant_id
            AND account.user_id = profile.user_id
            AND account.status = 'active'
            AND lower(btrim(guardian.status)) IN ('active', 'aktif')
            AND lower(btrim(student.status)) IN ('active', 'aktif')
            AND (
              p_target_audience = 'Semua Wali Santri'
              OR (
                p_target_audience = 'Wali Santri Kelas VII - A'
                AND (
                  lower(btrim(student.grade)) = 'vii - a'
                  OR lower(btrim(class_record.name)) = 'vii - a'
                )
              )
            )
        )
      )
    )
  ORDER BY profile.user_id;
$$;

REVOKE ALL ON FUNCTION public.communication_announcement_recipient_user_ids(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.communication_announcement_recipient_user_ids(UUID, TEXT)
  TO service_role;
COMMENT ON FUNCTION public.communication_announcement_recipient_user_ids(UUID, TEXT) IS
  'Returns active audience user IDs; Wali membership is derived from canonical guardian/student links, never stale profile snapshots.';

COMMIT;
