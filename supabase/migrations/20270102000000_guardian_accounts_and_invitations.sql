-- Secure guardian account invitations and multi-student access mapping.
-- Auth users may be created by Supabase invite links, but receive no ERP profile
-- or tenant access until the invitation is claimed by the exact confirmed email.
BEGIN;

CREATE TABLE public.guardian_user_accounts (
  tenant_id UUID NOT NULL,
  guardian_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, guardian_id),
  UNIQUE (tenant_id, user_id),
  FOREIGN KEY (tenant_id, guardian_id)
    REFERENCES public.guardians (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE CASCADE
);

CREATE INDEX guardian_user_accounts_user_status_idx
  ON public.guardian_user_accounts (tenant_id, user_id, status);

CREATE TABLE public.guardian_account_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  guardian_id UUID NOT NULL,
  email TEXT NOT NULL CHECK (email = lower(email) AND length(btrim(email)) BETWEEN 3 AND 320),
  token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  module_permissions JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(module_permissions) = 'object'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'claimed', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_by_uid UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_user_id UUID,
  claimed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  FOREIGN KEY (tenant_id, guardian_id)
    REFERENCES public.guardians (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_uid)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, claimed_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CONSTRAINT guardian_account_invitations_claim_state_check CHECK (
    (status = 'claimed' AND claimed_at IS NOT NULL AND claimed_user_id IS NOT NULL)
    OR (status <> 'claimed' AND claimed_at IS NULL AND claimed_user_id IS NULL)
  ),
  CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE INDEX guardian_account_invitations_tenant_status_expiry_idx
  ON public.guardian_account_invitations (tenant_id, status, expires_at);
CREATE UNIQUE INDEX guardian_account_invitations_one_pending_per_guardian_idx
  ON public.guardian_account_invitations (tenant_id, guardian_id)
  WHERE status = 'pending';

-- Preserve existing Wali profiles only when their legacy linked student identifies
-- exactly one Master Data guardian. Ambiguous legacy identities remain fail-closed
-- and require an explicit Admin reconciliation through the trusted link operation.
WITH unique_legacy_guardian AS (
  SELECT profile.tenant_id, profile.user_id, min(guardian.id::text)::UUID AS guardian_id
  FROM public.profiles profile
  JOIN public.students student
    ON student.tenant_id = profile.tenant_id
   AND (student.id::text = profile.linked_santri_id OR student.source_record_id = profile.linked_santri_id)
  JOIN public.guardian_students relation
    ON relation.tenant_id = student.tenant_id AND relation.student_id = student.id
  JOIN public.guardians guardian
    ON guardian.tenant_id = relation.tenant_id AND guardian.id = relation.guardian_id
  WHERE profile.role = 'wali_santri'
    AND profile.status = 'active'
    AND profile.linked_santri_id IS NOT NULL
    AND lower(btrim(guardian.status)) IN ('active', 'aktif')
    AND lower(btrim(student.status)) IN ('active', 'aktif')
  GROUP BY profile.tenant_id, profile.user_id
  HAVING count(DISTINCT guardian.id) = 1
)
INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
SELECT tenant_id, guardian_id, user_id
FROM unique_legacy_guardian
ON CONFLICT DO NOTHING;
ALTER TABLE public.guardian_user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_user_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_account_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_account_invitations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guardian_user_accounts, public.guardian_account_invitations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guardian_user_accounts,
  public.guardian_account_invitations TO service_role;

CREATE OR REPLACE FUNCTION public.guardian_can_access_student(
  p_tenant_id UUID,
  p_user_id UUID,
  p_student_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.guardian_user_accounts account
    JOIN public.guardians guardian
      ON guardian.tenant_id = account.tenant_id AND guardian.id = account.guardian_id
    JOIN public.guardian_students relation
      ON relation.tenant_id = guardian.tenant_id AND relation.guardian_id = guardian.id
    JOIN public.students student
      ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
    JOIN public.profiles profile
      ON profile.tenant_id = account.tenant_id AND profile.user_id = account.user_id
    JOIN public.tenants tenant ON tenant.id = account.tenant_id
    WHERE account.tenant_id = p_tenant_id
      AND account.user_id = p_user_id
      AND relation.student_id = p_student_id
      AND account.status = 'active'
      AND lower(btrim(guardian.status)) IN ('active', 'aktif')
      AND lower(btrim(student.status)) IN ('active', 'aktif')
      AND profile.role = 'wali_santri'
      AND profile.status = 'active'
      AND tenant.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.guardian_can_access_student(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_can_access_student(UUID, UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_guardian_account_invitation(
  p_token_hash BYTEA,
  p_user_id UUID,
  p_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_invitation public.guardian_account_invitations%ROWTYPE;
  v_guardian public.guardians%ROWTYPE;
  v_child_count INTEGER;
  v_email TEXT := lower(btrim(COALESCE(p_email, '')));
BEGIN
  IF p_token_hash IS NULL OR octet_length(p_token_hash) <> 32 OR p_user_id IS NULL
     OR v_email = '' OR length(v_email) > 320 THEN
    RAISE EXCEPTION 'Undangan Wali tidak valid' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_invitation
  FROM public.guardian_account_invitations
  WHERE token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND OR v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Undangan tidak valid atau sudah digunakan' USING ERRCODE = '42501';
  END IF;
  IF v_invitation.expires_at <= now() THEN
    UPDATE public.guardian_account_invitations SET status = 'expired'
    WHERE id = v_invitation.id;
    RETURN jsonb_build_object('success', false, 'code', 'INVITATION_EXPIRED');
  END IF;
  IF v_invitation.email <> v_email THEN
    RAISE EXCEPTION 'Email akun tidak sesuai dengan undangan' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id) THEN
    RAISE EXCEPTION 'Akun sudah memiliki profil ERP' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_guardian
  FROM public.guardians
  WHERE tenant_id = v_invitation.tenant_id AND id = v_invitation.guardian_id
    AND lower(btrim(status)) IN ('active', 'aktif')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data Wali tidak aktif' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT student.id)::INTEGER INTO v_child_count
  FROM public.guardian_students relation
  JOIN public.students student
    ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
  WHERE relation.tenant_id = v_invitation.tenant_id
    AND relation.guardian_id = v_invitation.guardian_id
    AND lower(btrim(student.status)) IN ('active', 'aktif');
  IF v_child_count < 1 THEN
    RAISE EXCEPTION 'Wali belum terhubung ke santri aktif' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (
    user_id, tenant_id, email, display_name, username, role, status,
    must_change_password, module_permissions, created_by_uid, created_at, updated_at
  ) VALUES (
    p_user_id, v_invitation.tenant_id, v_email, v_guardian.name,
    split_part(v_email, '@', 1), 'wali_santri', 'active', false,
    v_invitation.module_permissions, v_invitation.created_by_uid, now(), now()
  );

  INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
  VALUES (v_invitation.tenant_id, v_invitation.guardian_id, p_user_id);

  UPDATE public.guardian_account_invitations
  SET status = 'claimed', claimed_user_id = p_user_id, claimed_at = now()
  WHERE id = v_invitation.id;

  RETURN jsonb_build_object(
    'success', true,
    'tenantId', v_invitation.tenant_id,
    'guardianId', v_invitation.guardian_id,
    'linkedStudentCount', v_child_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guardian_account_invitation(BYTEA, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guardian_account_invitation(BYTEA, UUID, TEXT)
  TO service_role;

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
  v_guardian public.guardians%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_child_count INTEGER;
BEGIN
  IF p_tenant_id IS NULL OR p_guardian_id IS NULL OR p_user_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'Pemetaan akun Wali tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.tenant_id = p_tenant_id
      AND actor.user_id = p_actor_user_id
      AND actor.status = 'active'
      AND actor.role IN ('admin', 'super_admin')
      AND actor.module_permissions -> 'users' = 'true'::jsonb
  ) THEN
    RAISE EXCEPTION 'Admin tenant tidak berwenang memetakan akun Wali' USING ERRCODE = '42501';
  END IF;

  SELECT profile.* INTO v_profile
  FROM public.profiles profile
  JOIN auth.users auth_user ON auth_user.id = profile.user_id
  WHERE profile.tenant_id = p_tenant_id
    AND profile.user_id = p_user_id
    AND profile.role = 'wali_santri'
    AND profile.status = 'active'
    AND auth_user.email_confirmed_at IS NOT NULL
    AND lower(auth_user.email) = lower(profile.email)
  FOR UPDATE OF profile;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil Wali aktif dengan email terverifikasi tidak ditemukan' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_guardian
  FROM public.guardians
  WHERE tenant_id = p_tenant_id
    AND id = p_guardian_id
    AND lower(btrim(status)) IN ('active', 'aktif')
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Data Wali tidak aktif pada tenant ini' USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT student.id)::INTEGER INTO v_child_count
  FROM public.guardian_students relation
  JOIN public.students student
    ON student.tenant_id = relation.tenant_id AND student.id = relation.student_id
  WHERE relation.tenant_id = p_tenant_id
    AND relation.guardian_id = p_guardian_id
    AND lower(btrim(student.status)) IN ('active', 'aktif');
  IF v_child_count < 1 THEN
    RAISE EXCEPTION 'Wali belum terhubung ke santri aktif' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.guardian_user_accounts
    WHERE tenant_id = p_tenant_id
      AND (guardian_id = p_guardian_id OR user_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'Akun Wali atau data Wali sudah memiliki pemetaan' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
  VALUES (p_tenant_id, p_guardian_id, p_user_id);
  UPDATE public.guardian_account_invitations
  SET status = 'revoked', revoked_at = now()
  WHERE tenant_id = p_tenant_id AND guardian_id = p_guardian_id AND status = 'pending';
  RETURN jsonb_build_object('success', true, 'linkedStudentCount', v_child_count);
END;
$$;

REVOKE ALL ON FUNCTION public.link_existing_guardian_account(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_existing_guardian_account(UUID, UUID, UUID, UUID)
  TO service_role;
COMMENT ON TABLE public.guardian_user_accounts IS
  'Authoritative tenant-scoped mapping from a wali login to its guardian record; student access is derived from guardian_students.';
COMMENT ON TABLE public.guardian_account_invitations IS
  'Single-use, expiring invitations. Only a SHA-256 token hash is stored; account provisioning is an atomic server-side claim.';

COMMIT;