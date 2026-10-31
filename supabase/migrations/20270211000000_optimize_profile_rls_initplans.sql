-- Evaluate stable caller context once per statement rather than per scanned
-- row. This follows Supabase's RLS performance guidance for auth functions.
BEGIN;

ALTER POLICY user_profiles_select_own ON public.user_profiles
  USING ((SELECT auth.uid()) = id);

ALTER POLICY tenants_select_current_tenant ON public.tenants
  USING (id = (SELECT private.current_tenant_id()));

ALTER POLICY profiles_select_self_or_tenant_admin ON public.profiles
  USING (
    user_id = (SELECT auth.uid())
    OR (
      tenant_id = (SELECT private.current_tenant_id())
      AND (SELECT private.is_tenant_admin())
      AND (SELECT private.has_module_access('users'))
    )
  );

ALTER POLICY candidates_select_ppdb_admin ON public.candidates
  USING (
    tenant_id = (SELECT private.current_tenant_id())
    AND (SELECT private.is_tenant_admin())
    AND (SELECT private.has_module_access('ppdb'))
  );

ALTER POLICY candidate_documents_select_ppdb_admin ON public.candidate_documents
  USING (
    tenant_id = (SELECT private.current_tenant_id())
    AND (SELECT private.is_tenant_admin())
    AND (SELECT private.has_module_access('ppdb'))
  );

COMMIT;

