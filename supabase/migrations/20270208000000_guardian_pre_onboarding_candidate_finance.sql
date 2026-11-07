-- Let a verified Wali see and submit proof for their own PPDB bills before
-- onboarding. Candidate access ends as soon as the student link is created.
BEGIN;

CREATE TABLE public.guardian_candidate_accounts (
  tenant_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, candidate_id),
  FOREIGN KEY (tenant_id, candidate_id)
    REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE CASCADE
);

CREATE INDEX guardian_candidate_accounts_user_status_idx
  ON public.guardian_candidate_accounts (tenant_id, user_id, status, candidate_id);

ALTER TABLE public.guardian_candidate_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardian_candidate_accounts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guardian_candidate_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.guardian_candidate_accounts TO service_role;
CREATE TRIGGER guardian_candidate_accounts_set_updated_at
  BEFORE UPDATE ON public.guardian_candidate_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.guardian_can_access_candidate(
  p_tenant_id UUID,
  p_user_id UUID,
  p_candidate_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.guardian_candidate_accounts account
    JOIN public.candidates candidate
      ON candidate.tenant_id = account.tenant_id AND candidate.id = account.candidate_id
    JOIN public.profiles profile
      ON profile.tenant_id = account.tenant_id AND profile.user_id = account.user_id
    JOIN public.tenants tenant ON tenant.id = account.tenant_id
    JOIN auth.users auth_user ON auth_user.id = account.user_id
    WHERE account.tenant_id = p_tenant_id
      AND account.user_id = p_user_id
      AND account.candidate_id = p_candidate_id
      AND account.status = 'active'
      AND candidate.master_student_id IS NULL
      AND candidate.stage <> 'Rejected'
      AND lower(btrim(COALESCE(candidate.email, ''))) = lower(btrim(auth_user.email))
      AND auth_user.email_confirmed_at IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.finance_bills bill
        WHERE bill.tenant_id = candidate.tenant_id
          AND bill.candidate_id = candidate.id
          AND bill.student_id IS NULL
      )
      AND profile.role = 'wali_santri'
      AND profile.status = 'active'
      AND lower(profile.email) = lower(auth_user.email)
      AND tenant.status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.guardian_can_access_candidate(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guardian_can_access_candidate(UUID, UUID, UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.claim_guardian_account_by_verified_email(
  p_tenant_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_email TEXT;
  v_display_name TEXT;
  v_guardian_ids UUID[];
  v_candidate_ids UUID[];
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

  -- Serialize matching claims so two Auth users cannot race for the same
  -- guardian/candidate contact address.
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

  PERFORM candidate.id
  FROM public.candidates candidate
  WHERE candidate.tenant_id = p_tenant_id
    AND candidate.master_student_id IS NULL
    AND candidate.stage <> 'Rejected'
    AND lower(btrim(COALESCE(candidate.email, ''))) = v_email
    AND EXISTS (
      SELECT 1 FROM public.finance_bills bill
      WHERE bill.tenant_id = candidate.tenant_id
        AND bill.candidate_id = candidate.id
        AND bill.student_id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.guardians guardian
      JOIN public.guardian_user_accounts guardian_account
        ON guardian_account.tenant_id = guardian.tenant_id
       AND guardian_account.guardian_id = guardian.id
      WHERE guardian.tenant_id = candidate.tenant_id
        AND guardian.source_candidate_id = candidate.id
        AND lower(btrim(guardian.status)) IN ('active', 'aktif')
        AND guardian_account.user_id <> p_user_id
    )
  ORDER BY candidate.id
  FOR UPDATE;

  SELECT array_agg(candidate.id ORDER BY candidate.id)
  INTO v_candidate_ids
  FROM public.candidates candidate
  WHERE candidate.tenant_id = p_tenant_id
    AND candidate.master_student_id IS NULL
    AND candidate.stage <> 'Rejected'
    AND lower(btrim(COALESCE(candidate.email, ''))) = v_email
    AND EXISTS (
      SELECT 1 FROM public.finance_bills bill
      WHERE bill.tenant_id = candidate.tenant_id
        AND bill.candidate_id = candidate.id
        AND bill.student_id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.guardians guardian
      JOIN public.guardian_user_accounts guardian_account
        ON guardian_account.tenant_id = guardian.tenant_id
       AND guardian_account.guardian_id = guardian.id
      WHERE guardian.tenant_id = candidate.tenant_id
        AND guardian.source_candidate_id = candidate.id
        AND lower(btrim(guardian.status)) IN ('active', 'aktif')
        AND guardian_account.user_id <> p_user_id
    );

  IF COALESCE(cardinality(v_guardian_ids), 0) = 0
     AND COALESCE(cardinality(v_candidate_ids), 0) = 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'LINK_NOT_AVAILABLE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.guardian_user_accounts account
    WHERE account.tenant_id = p_tenant_id AND account.guardian_id = ANY(v_guardian_ids)
      AND (account.user_id <> p_user_id OR account.status <> 'active')
  ) OR EXISTS (
    SELECT 1 FROM public.guardian_candidate_accounts account
    WHERE account.tenant_id = p_tenant_id AND account.candidate_id = ANY(v_candidate_ids)
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
    IF v_display_name IS NULL THEN
      SELECT min(candidate.name) INTO v_display_name
      FROM public.candidates candidate
      WHERE candidate.tenant_id = p_tenant_id AND candidate.id = ANY(v_candidate_ids);
    END IF;
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
  SELECT p_tenant_id, link.guardian_id, p_user_id
  FROM unnest(COALESCE(v_guardian_ids, ARRAY[]::UUID[])) AS link(guardian_id)
  ON CONFLICT (tenant_id, guardian_id) DO NOTHING;

  INSERT INTO public.guardian_candidate_accounts (tenant_id, candidate_id, user_id)
  SELECT p_tenant_id, link.candidate_id, p_user_id
  FROM unnest(COALESCE(v_candidate_ids, ARRAY[]::UUID[])) AS link(candidate_id)
  ON CONFLICT (tenant_id, candidate_id) DO NOTHING;

  IF v_guardian_ids IS NOT NULL THEN
    UPDATE public.guardian_account_invitations
    SET status = 'revoked', revoked_at = now()
    WHERE tenant_id = p_tenant_id AND guardian_id = ANY(v_guardian_ids) AND status = 'pending';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'linkedGuardianCount', COALESCE(cardinality(v_guardian_ids), 0),
    'linkedCandidateCount', COALESCE(cardinality(v_candidate_ids), 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_guardian_account_by_verified_email(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_guardian_account_by_verified_email(UUID, UUID)
  TO service_role;

COMMENT ON TABLE public.guardian_candidate_accounts IS
  'Private server-side mapping of a confirmed Wali account to pre-onboarding candidates with tenant-owned finance bills.';
COMMENT ON FUNCTION public.guardian_can_access_candidate(UUID, UUID, UUID) IS
  'Authorizes only the verified Wali mapped to a non-rejected, not-yet-onboarded candidate with a candidate finance bill.';
COMMENT ON FUNCTION public.claim_guardian_account_by_verified_email(UUID, UUID) IS
  'Links the confirmed Auth email to active Wali records and/or un-onboarded PPDB candidates with issued finance bills; clients cannot provide guardian or candidate identifiers.';

CREATE OR REPLACE FUNCTION public.link_guardian_candidate_account_after_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  v_mapping RECORD;
BEGIN
  IF NEW.master_student_id IS NULL OR NEW.master_student_id IS NOT DISTINCT FROM OLD.master_student_id
     OR NEW.master_guardian_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.guardians guardian
    WHERE guardian.tenant_id = NEW.tenant_id
      AND guardian.id = NEW.master_guardian_id
      AND guardian.source_candidate_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Data Wali hasil onboarding tidak cocok dengan calon santri' USING ERRCODE = '23503';
  END IF;

  FOR v_mapping IN
    SELECT account.user_id
    FROM public.guardian_candidate_accounts account
    WHERE account.tenant_id = NEW.tenant_id
      AND account.candidate_id = NEW.id
      AND account.status = 'active'
    ORDER BY account.user_id
    FOR UPDATE
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.tenant_id = NEW.tenant_id
        AND profile.user_id = v_mapping.user_id
        AND profile.role = 'wali_santri'
        AND profile.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Akun Wali calon santri tidak aktif' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.guardian_user_accounts (tenant_id, guardian_id, user_id)
    VALUES (NEW.tenant_id, NEW.master_guardian_id, v_mapping.user_id)
    ON CONFLICT (tenant_id, guardian_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM public.guardian_user_accounts account
      WHERE account.tenant_id = NEW.tenant_id
        AND account.guardian_id = NEW.master_guardian_id
        AND account.user_id = v_mapping.user_id
        AND account.status = 'active'
    ) THEN
      RAISE EXCEPTION 'Data Wali hasil onboarding telah tertaut ke akun berbeda' USING ERRCODE = '23505';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.link_guardian_candidate_account_after_onboarding()
  FROM PUBLIC, anon, authenticated;
CREATE TRIGGER candidates_link_guardian_account_after_onboarding
  AFTER UPDATE OF master_student_id ON public.candidates
  FOR EACH ROW
  WHEN (OLD.master_student_id IS DISTINCT FROM NEW.master_student_id AND NEW.master_student_id IS NOT NULL)
  EXECUTE FUNCTION public.link_guardian_candidate_account_after_onboarding();

CREATE OR REPLACE FUNCTION public.register_tenant_finance_payment_proof(
  p_tenant_id UUID, p_actor_user_id UUID, p_expected_role TEXT,
  p_bill_id UUID, p_storage_path TEXT, p_file_name TEXT, p_payment_method TEXT,
  p_file_sha256 TEXT, p_client_request_id UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  v_role TEXT;
  v_profile public.profiles%ROWTYPE;
  v_control public.finance_controls%ROWTYPE;
  v_bill public.finance_bills%ROWTYPE;
  v_request public.finance_write_requests%ROWTYPE;
  v_payload JSONB;
  v_result JSONB;
  v_guardian_bill_access BOOLEAN;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_bill_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('wali_santri', 'admin', 'super_admin')
    OR p_storage_path IS NULL OR length(p_storage_path) > 900 OR p_storage_path NOT LIKE 'financeProofs/%'
    OR position('..' IN p_storage_path) > 0 OR p_file_name IS NULL OR length(p_file_name) NOT BETWEEN 1 AND 120
    OR p_payment_method IS NULL OR p_payment_method NOT IN ('BSI', 'Muamalat', 'MandiriSyariah')
    OR p_file_sha256 IS NULL OR p_file_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Data bukti pembayaran tidak valid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active') THEN
    RAISE EXCEPTION 'Tenant tidak aktif' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id AND status = 'active';
  v_role := lower(btrim(v_profile.role::text));
  IF v_role IS DISTINCT FROM p_expected_role THEN
    RAISE EXCEPTION 'Profil aktif tidak sesuai dengan pengirim bukti' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_bill
  FROM public.finance_bills
  WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'wali_santri' THEN
    v_guardian_bill_access :=
      (v_bill.student_id IS NOT NULL AND public.guardian_can_access_student(p_tenant_id, p_actor_user_id, v_bill.student_id))
      OR (v_bill.student_id IS NULL AND v_bill.candidate_id IS NOT NULL
          AND public.guardian_can_access_candidate(p_tenant_id, p_actor_user_id, v_bill.candidate_id));
    IF NOT COALESCE(v_guardian_bill_access, false) THEN
      RAISE EXCEPTION 'Tagihan tidak terhubung ke akun wali ini' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF position(('/' || replace(p_bill_id::text, '/', '') || '/') IN p_storage_path) = 0 THEN
    RAISE EXCEPTION 'Lokasi bukti tidak cocok dengan tagihan' USING ERRCODE = '22023';
  END IF;
  v_payload := jsonb_build_object(
    'billId', p_bill_id, 'fileName', p_file_name,
    'paymentMethod', p_payment_method, 'fileSha256', lower(p_file_sha256)
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('finance-request:' || p_tenant_id::text || ':' || p_client_request_id::text, 0)
  );
  SELECT * INTO v_request
  FROM public.finance_write_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_request.actor_user_id IS DISTINCT FROM p_actor_user_id
       OR v_request.action IS DISTINCT FROM 'payment_proof'
       OR v_request.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Kunci unggahan telah dipakai untuk berkas berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN v_request.result || jsonb_build_object('alreadyApplied', true);
  END IF;
  INSERT INTO public.finance_controls (tenant_id, finance_locked, updated_by_user_id)
  VALUES (p_tenant_id, false, p_actor_user_id)
  ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control
  FROM public.finance_controls
  WHERE tenant_id = p_tenant_id
  FOR UPDATE;
  IF v_control.finance_locked THEN
    RAISE EXCEPTION 'Buku keuangan sedang ditutup' USING ERRCODE = '55000';
  END IF;
  SELECT * INTO v_bill
  FROM public.finance_bills
  WHERE tenant_id = p_tenant_id AND id = p_bill_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tagihan tidak ditemukan pada tenant' USING ERRCODE = 'P0002';
  END IF;
  IF v_role = 'wali_santri' THEN
    v_guardian_bill_access :=
      (v_bill.student_id IS NOT NULL AND public.guardian_can_access_student(p_tenant_id, p_actor_user_id, v_bill.student_id))
      OR (v_bill.student_id IS NULL AND v_bill.candidate_id IS NOT NULL
          AND public.guardian_can_access_candidate(p_tenant_id, p_actor_user_id, v_bill.candidate_id));
    IF NOT COALESCE(v_guardian_bill_access, false) THEN
      RAISE EXCEPTION 'Tagihan tidak terhubung ke akun wali ini' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF v_bill.status NOT IN ('unpaid', 'partial') THEN
    RAISE EXCEPTION 'Tagihan tidak menerima bukti baru' USING ERRCODE = '23514';
  END IF;
  UPDATE public.finance_bills
  SET status = 'verification',
      payment_method = 'Transfer Manual (' || p_payment_method || ')',
      proof_file = p_file_name,
      proof_storage_path = p_storage_path,
      proof_storage_provider = 'supabase',
      uploaded_at = now(),
      rejection_reason = NULL
  WHERE tenant_id = p_tenant_id AND id = p_bill_id;
  v_result := jsonb_build_object('success', true, 'billId', p_bill_id, 'status', 'verification');
  INSERT INTO public.finance_write_requests (
    tenant_id, client_request_id, actor_user_id, action, request_payload, result
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, 'payment_proof', v_payload, v_result
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.register_tenant_finance_payment_proof(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_tenant_finance_payment_proof(UUID, UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, UUID)
  TO service_role;

COMMIT;
