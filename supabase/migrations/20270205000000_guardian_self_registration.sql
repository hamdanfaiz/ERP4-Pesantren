-- Let a guardian create their own Auth account and link it only to active
-- guardian records whose previously supplied contact email they have verified.
BEGIN;

-- A family email may be recorded on multiple sibling records. One account can
-- therefore link to multiple guardian rows within its single tenant profile.
ALTER TABLE public.guardian_user_accounts
  DROP CONSTRAINT IF EXISTS guardian_user_accounts_tenant_id_user_id_key;

CREATE OR REPLACE FUNCTION public.hydrate_guardian_contact_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NULLIF(btrim(COALESCE(NEW.details ->> 'email', '')), '') IS NOT NULL THEN
    NEW.details := jsonb_set(NEW.details, '{email}', to_jsonb(lower(btrim(NEW.details ->> 'email'))), true);
    RETURN NEW;
  END IF;

  SELECT lower(btrim(candidate.email)) INTO v_email
  FROM public.candidates candidate
  WHERE candidate.tenant_id = NEW.tenant_id
    AND candidate.id = NEW.source_candidate_id;

  IF v_email IS NOT NULL AND length(v_email) <= 254
     AND v_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    NEW.details := jsonb_set(NEW.details, '{email}', to_jsonb(v_email), true);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guardians_hydrate_contact_email
  BEFORE INSERT OR UPDATE OF details, source_candidate_id, tenant_id
  ON public.guardians
  FOR EACH ROW EXECUTE FUNCTION public.hydrate_guardian_contact_email();

-- Backfill only missing guardian email fields. Existing explicitly maintained
-- contact details take precedence over an older PPDB candidate value.
UPDATE public.guardians guardian
SET details = jsonb_set(guardian.details, '{email}', to_jsonb(lower(btrim(candidate.email))), true),
    updated_at = now()
FROM public.candidates candidate
WHERE candidate.tenant_id = guardian.tenant_id
  AND candidate.id = guardian.source_candidate_id
  AND NULLIF(btrim(COALESCE(guardian.details ->> 'email', '')), '') IS NULL
  AND candidate.email IS NOT NULL
  AND length(btrim(candidate.email)) <= 254
  AND lower(btrim(candidate.email)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$';

CREATE OR REPLACE FUNCTION public.link_existing_guardian_account(
  p_tenant_id UUID,
  p_guardian_id UUID,
  p_user_id UUID,
  p_actor_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_guardian public.guardians%ROWTYPE;
  v_child_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_guardian_id IS NULL OR p_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan akun Wali tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.tenant_id = p_tenant_id AND actor.user_id = p_actor_user_id
      AND actor.status = 'active' AND actor.role IN ('admin', 'super_admin')
      AND actor.module_permissions -> 'users' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'Admin tenant tidak berwenang memetakan akun Wali' USING ERRCODE = '42501';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.user_id
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_user_id
    AND profile.role = 'wali_santri' AND profile.status = 'active'
    AND auth_user.email_confirmed_at IS NOT NULL
    AND lower(auth_user.email) = lower(profile.email)
  FOR UPDATE OF profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil Wali aktif dengan email terverifikasi tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_guardian
  FROM public.guardians
  WHERE tenant_id = p_tenant_id AND id = p_guardian_id
    AND lower(btrim(status)) IN ('active', 'aktif')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data Wali tidak aktif pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT student.id)::INTEGER INTO v_child_count
  FROM public.guardian_students relation
  JOIN public.students student
    ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
  WHERE relation.tenant_id = p_tenant_id AND relation.guardian_id = p_guardian_id
    AND lower(btrim(student.status)) IN ('active', 'aktif');
  IF v_child_count < 1 THEN
    RAISE EXCEPTION 'Wali belum terhubung ke santri aktif' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.guardian_user_accounts account
    WHERE account.tenant_id = p_tenant_id AND account.guardian_id = p_guardian_id
      AND (account.user_id <> p_user_id OR account.status <> 'active')
  ) THEN
    RAISE EXCEPTION 'Data Wali telah terhubung ke akun lain' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
  VALUES (p_tenant_id, p_guardian_id, p_user_id)
  ON CONFLICT (tenant_id, guardian_id) DO NOTHING;
  UPDATE public.guardian_account_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE tenant_id = p_tenant_id AND guardian_id = p_guardian_id AND status = 'pending';
  RETURN jsonb_build_object('success', true, 'linkedStudentCount', v_child_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_guardian_account_by_verified_email(
  p_tenant_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_email TEXT;
  v_display_name TEXT;
  v_guardian_ids UUID[];
  v_existing public.profiles%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'LINK_NOT_AVAILABLE');
  END IF;

  SELECT lower(btrim(auth_user.email)) INTO v_email
  FROM auth.users auth_user
  WHERE auth_user.id = p_user_id AND auth_user.email_confirmed_at IS NOT NULL
  FOR SHARE;
  IF v_email IS NULL OR v_email = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'EMAIL_NOT_CONFIRMED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RETURN jsonb_build_object('success', false, 'code', 'LINK_NOT_AVAILABLE');
  END IF;

  -- Serialize signups for the same tenant/email to prevent two accounts racing
  -- to claim the same guardian rows.
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(p_tenant_id::text || ':' || v_email, 0));

  PERFORM guardian.id
  FROM public.guardians guardian
  WHERE guardian.tenant_id = p_tenant_id
    AND lower(btrim(guardian.status)) IN ('active', 'aktif')
    AND lower(btrim(COALESCE(guardian.details ->> 'email', ''))) = v_email
    AND EXISTS (
      SELECT 1
      FROM public.guardian_students relation
      JOIN public.students student
        ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
      WHERE relation.tenant_id = guardian.tenant_id AND relation.guardian_id = guardian.id
        AND lower(btrim(student.status)) IN ('active', 'aktif')
    )
  ORDER BY guardian.id
  FOR UPDATE;

  SELECT array_agg(guardian.id ORDER BY guardian.id), min(guardian.name)
  INTO v_guardian_ids, v_display_name
  FROM public.guardians guardian
  WHERE guardian.tenant_id = p_tenant_id
    AND lower(btrim(guardian.status)) IN ('active', 'aktif')
    AND lower(btrim(COALESCE(guardian.details ->> 'email', ''))) = v_email
    AND EXISTS (
      SELECT 1
      FROM public.guardian_students relation
      JOIN public.students student
        ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
      WHERE relation.tenant_id = guardian.tenant_id AND relation.guardian_id = guardian.id
        AND lower(btrim(student.status)) IN ('active', 'aktif')
    );
  IF COALESCE(cardinality(v_guardian_ids), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'LINK_NOT_AVAILABLE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.guardian_user_accounts account
    WHERE account.tenant_id = p_tenant_id AND account.guardian_id = ANY(v_guardian_ids)
      AND (account.user_id <> p_user_id OR account.status <> 'active')
  ) THEN
    RETURN jsonb_build_object('success', false, 'code', 'LINK_NOT_AVAILABLE');
  END IF;

  SELECT * INTO v_existing FROM public.profiles WHERE user_id = p_user_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.tenant_id <> p_tenant_id OR v_existing.role <> 'wali_santri'
       OR v_existing.status <> 'active' OR lower(v_existing.email) <> v_email THEN
      RETURN jsonb_build_object('success', false, 'code', 'LINK_NOT_AVAILABLE');
    END IF;
  ELSE
    INSERT INTO public.profiles (
      user_id, tenant_id, email, display_name, username, role, status,
      must_change_password, module_permissions, created_by_uid, created_at, updated_at
    ) VALUES (
      p_user_id, p_tenant_id, v_email, COALESCE(NULLIF(btrim(v_display_name), ''), 'Wali Santri'),
      split_part(v_email, '@', 1), 'wali_santri', 'active', false, '{}'::jsonb,
      p_user_id, now(), now()
    );
  END IF;

  INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
  SELECT p_tenant_id, guardian_id, p_user_id
  FROM unnest(v_guardian_ids) AS guardian_id
  ON CONFLICT (tenant_id, guardian_id) DO NOTHING;

  UPDATE public.guardian_account_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE tenant_id = p_tenant_id AND guardian_id = ANY(v_guardian_ids) AND status = 'pending';

  RETURN jsonb_build_object('success', true, 'linkedGuardianCount', cardinality(v_guardian_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guardian_account_by_verified_email(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guardian_account_by_verified_email(UUID, UUID)
  TO service_role;

COMMENT ON FUNCTION public.claim_guardian_account_by_verified_email(UUID, UUID) IS
  'Creates a guardian profile and links all active same-tenant guardian records with the exact verified Auth email; no child identifiers are accepted from the client.';

COMMIT;
