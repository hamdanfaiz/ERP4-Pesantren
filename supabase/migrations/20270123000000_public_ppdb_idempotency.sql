-- Public PPDB retries reuse one tenant-scoped submission ID and replace only its own document pointers.
-- Request payload fingerprints are keyed HMACs; raw applicant fields are not stored by this idempotency layer.
BEGIN;

ALTER TABLE public.candidates
  ADD COLUMN public_submission_fingerprint BYTEA,
  ADD CONSTRAINT candidates_public_submission_fingerprint_length
    CHECK (public_submission_fingerprint IS NULL OR octet_length(public_submission_fingerprint) = 32);

COMMENT ON COLUMN public.candidates.public_submission_fingerprint IS
  'Keyed HMAC of normalized public PPDB fields and document digests, used to accept a same-payload retry without storing raw data again.';

CREATE OR REPLACE FUNCTION public.submit_public_ppdb_idempotent(
  p_tenant_id UUID,
  p_candidate_id UUID,
  p_admission_year SMALLINT,
  p_candidate JSONB,
  p_document_paths JSONB,
  p_request_fingerprint_hex TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_registration_id TEXT;
  v_request_fingerprint BYTEA;
  v_date_applied DATE;
  v_documents public.candidate_documents%ROWTYPE;
  v_previous_paths JSONB := '[]'::JSONB;
  v_result JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_candidate_id IS NULL
    OR p_admission_year IS NULL OR p_admission_year NOT BETWEEN 2000 AND 2200
    OR jsonb_typeof(p_candidate) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_document_paths) IS DISTINCT FROM 'object'
    OR p_request_fingerprint_hex IS NULL
    OR p_request_fingerprint_hex !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid idempotent PPDB request' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = p_tenant_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  IF NOT (p_document_paths ? 'kk')
    OR NOT (p_document_paths ? 'birthCertificate')
    OR NOT (p_document_paths ? 'reportCards')
    OR NOT (p_document_paths ? 'pasPhoto')
    OR EXISTS (
      SELECT 1
      FROM jsonb_each_text(p_document_paths) AS item(key, value)
      WHERE item.key NOT IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')
        OR item.value IS NULL
        OR btrim(item.value) = ''
        OR item.value NOT LIKE p_tenant_id::TEXT || '/' || p_candidate_id::TEXT || '/%'
    ) THEN
    RAISE EXCEPTION 'Invalid PPDB document paths' USING ERRCODE = '22023';
  END IF;

  -- A repeat with the same tenant and candidate UUID waits for the first transaction before reading it.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('public-ppdb-submit:' || p_tenant_id::TEXT || ':' || p_candidate_id::TEXT, 0)
  );

  SELECT registration_id, public_submission_fingerprint, date_applied
    INTO v_registration_id, v_request_fingerprint, v_date_applied
  FROM public.candidates
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_request_fingerprint IS NULL
      OR v_request_fingerprint IS DISTINCT FROM decode(p_request_fingerprint_hex, 'hex') THEN
      RAISE EXCEPTION 'PPDB idempotency key was reused with different data'
        USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO v_documents
    FROM public.candidate_documents
    WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PPDB candidate has no document metadata' USING ERRCODE = 'P0002';
    END IF;

    v_previous_paths := to_jsonb(array_remove(ARRAY[
      v_documents.kk_path,
      v_documents.birth_certificate_path,
      v_documents.report_cards_path,
      v_documents.ijazah_path,
      v_documents.skhun_path,
      v_documents.pas_photo_path
    ]::TEXT[], NULL::TEXT));

    UPDATE public.candidate_documents
    SET kk = true,
        birth_certificate = true,
        report_cards = p_document_paths ? 'reportCards',
        ijazah = p_document_paths ? 'ijazah',
        skhun = p_document_paths ? 'skhun',
        pas_photo = true,
        kk_path = p_document_paths->>'kk',
        birth_certificate_path = p_document_paths->>'birthCertificate',
        report_cards_path = p_document_paths->>'reportCards',
        ijazah_path = p_document_paths->>'ijazah',
        skhun_path = p_document_paths->>'skhun',
        pas_photo_path = p_document_paths->>'pasPhoto'
    WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id;

    RETURN jsonb_build_object(
      'id', p_candidate_id,
      'registrationId', v_registration_id,
      'dateApplied', v_date_applied::TEXT,
      'alreadyApplied', true,
      'previousDocumentPaths', v_previous_paths
    );
  END IF;

  v_result := public.submit_public_ppdb(
    p_tenant_id,
    p_candidate_id,
    p_admission_year,
    p_candidate,
    p_document_paths
  );

  UPDATE public.candidates
  SET public_submission_fingerprint = decode(p_request_fingerprint_hex, 'hex')
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PPDB submission fingerprint could not be stored' USING ERRCODE = 'P0002';
  END IF;

  SELECT date_applied INTO v_date_applied
  FROM public.candidates
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id;

  RETURN v_result || jsonb_build_object(
    'dateApplied', v_date_applied::TEXT,
    'alreadyApplied', false,
    'previousDocumentPaths', '[]'::JSONB
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_public_ppdb_idempotent(UUID, UUID, SMALLINT, JSONB, JSONB, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_public_ppdb_idempotent(UUID, UUID, SMALLINT, JSONB, JSONB, TEXT)
  TO service_role;

COMMIT;
