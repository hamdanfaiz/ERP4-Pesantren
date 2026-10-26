-- Trusted, tenant-scoped upload path for private documents attached to Admin-created PPDB records.
-- Objects remain private; this migration adds server-only metadata and an append-only audit trail.
BEGIN;

CREATE TABLE public.ppdb_document_upload_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  document_key TEXT NOT NULL CHECK (document_key IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')),
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, candidate_id) REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

ALTER TABLE public.ppdb_document_upload_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppdb_document_upload_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ppdb_document_upload_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.ppdb_document_upload_requests TO service_role;

COMMENT ON TABLE public.ppdb_document_upload_requests IS
  'Server-only idempotency record for Admin uploads; stores a content hash and private object path, never document contents.';

CREATE TABLE public.ppdb_document_upload_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  candidate_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  document_key TEXT NOT NULL CHECK (document_key IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')),
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, candidate_id) REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, client_request_id)
    REFERENCES public.ppdb_document_upload_requests (tenant_id, client_request_id) ON DELETE RESTRICT
);

CREATE INDEX ppdb_document_upload_events_tenant_time_idx
  ON public.ppdb_document_upload_events (tenant_id, uploaded_at DESC, id DESC);
CREATE INDEX ppdb_document_upload_events_candidate_idx
  ON public.ppdb_document_upload_events (tenant_id, candidate_id, uploaded_at DESC, id DESC);

ALTER TABLE public.ppdb_document_upload_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppdb_document_upload_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ppdb_document_upload_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.ppdb_document_upload_events TO service_role;

COMMENT ON TABLE public.ppdb_document_upload_events IS
  'Append-only server audit of Admin PPDB document uploads; stores no file contents or storage paths.';

CREATE OR REPLACE FUNCTION public.register_admin_ppdb_document_upload(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_candidate_id UUID,
  p_document_key TEXT,
  p_client_request_id UUID,
  p_content_sha256 TEXT,
  p_content_type TEXT,
  p_storage_path TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_existing public.ppdb_document_upload_requests%ROWTYPE;
  v_document public.candidate_documents%ROWTYPE;
  v_extension TEXT;
  v_path_pattern TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_candidate_id IS NULL
    OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin')
    OR p_document_key IS NULL OR p_document_key NOT IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')
    OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-fA-F]{64}$'
    OR p_content_type IS NULL OR p_content_type NOT IN ('application/pdf', 'image/jpeg', 'image/png') THEN
    RAISE EXCEPTION 'Invalid PPDB document upload input' USING ERRCODE = '22023';
  END IF;

  v_extension := CASE p_content_type
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'image/jpeg' THEN 'jpg'
    WHEN 'image/png' THEN 'png'
  END;
  v_path_pattern := '^' || p_tenant_id::text || '/' || p_candidate_id::text || '/'
    || p_document_key || '-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.'
    || v_extension || '$';
  IF p_storage_path IS NULL OR p_storage_path !~ v_path_pattern OR p_storage_path LIKE '%..%' THEN
    RAISE EXCEPTION 'Invalid PPDB document path' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.tenants
  WHERE id = p_tenant_id AND status = 'active'
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PPDB tenant is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT profile.role INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id
    AND profile.user_id = p_actor_user_id
    AND profile.status = 'active'
    AND profile.role IN ('admin', 'super_admin')
    AND profile.role = p_expected_role
    AND (
      profile.role = 'super_admin'
      OR NOT (profile.module_permissions ? 'ppdb')
      OR (jsonb_typeof(profile.module_permissions -> 'ppdb') = 'boolean'
        AND profile.module_permissions ->> 'ppdb' = 'true')
    )
  FOR SHARE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Active Admin PPDB permission is required' USING ERRCODE = '42501';
  END IF;

  -- Serialize the candidate row so separate request IDs cannot replace or race the same attachment.
  PERFORM 1 FROM public.candidates
  WHERE tenant_id = p_tenant_id AND id = p_candidate_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PPDB candidate is unavailable' USING ERRCODE = 'P0002';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'ppdb-document-upload:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));

  SELECT * INTO v_existing
  FROM public.ppdb_document_upload_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id
      OR v_existing.candidate_id <> p_candidate_id
      OR v_existing.document_key <> p_document_key
      OR v_existing.content_sha256 <> decode(p_content_sha256, 'hex') THEN
      RAISE EXCEPTION 'PPDB upload request ID was already used for another file' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'alreadyApplied', true,
      'documentKey', v_existing.document_key,
      'storagePath', v_existing.storage_path
    );
  END IF;

  SELECT * INTO v_document
  FROM public.candidate_documents
  WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.candidate_documents (
      tenant_id, candidate_id,
      kk, birth_certificate, report_cards, ijazah, skhun, pas_photo,
      kk_path, birth_certificate_path, report_cards_path, ijazah_path, skhun_path, pas_photo_path
    ) VALUES (
      p_tenant_id, p_candidate_id,
      p_document_key = 'kk', p_document_key = 'birthCertificate', p_document_key = 'reportCards',
      p_document_key = 'ijazah', p_document_key = 'skhun', p_document_key = 'pasPhoto',
      CASE WHEN p_document_key = 'kk' THEN p_storage_path END,
      CASE WHEN p_document_key = 'birthCertificate' THEN p_storage_path END,
      CASE WHEN p_document_key = 'reportCards' THEN p_storage_path END,
      CASE WHEN p_document_key = 'ijazah' THEN p_storage_path END,
      CASE WHEN p_document_key = 'skhun' THEN p_storage_path END,
      CASE WHEN p_document_key = 'pasPhoto' THEN p_storage_path END
    );
  ELSE
    IF CASE p_document_key
      WHEN 'kk' THEN v_document.kk_path
      WHEN 'birthCertificate' THEN v_document.birth_certificate_path
      WHEN 'reportCards' THEN v_document.report_cards_path
      WHEN 'ijazah' THEN v_document.ijazah_path
      WHEN 'skhun' THEN v_document.skhun_path
      WHEN 'pasPhoto' THEN v_document.pas_photo_path
    END IS NOT NULL THEN
      RAISE EXCEPTION 'PPDB document is already attached' USING ERRCODE = '23505';
    END IF;

    UPDATE public.candidate_documents SET
      kk = CASE WHEN p_document_key = 'kk' THEN true ELSE kk END,
      birth_certificate = CASE WHEN p_document_key = 'birthCertificate' THEN true ELSE birth_certificate END,
      report_cards = CASE WHEN p_document_key = 'reportCards' THEN true ELSE report_cards END,
      ijazah = CASE WHEN p_document_key = 'ijazah' THEN true ELSE ijazah END,
      skhun = CASE WHEN p_document_key = 'skhun' THEN true ELSE skhun END,
      pas_photo = CASE WHEN p_document_key = 'pasPhoto' THEN true ELSE pas_photo END,
      kk_path = CASE WHEN p_document_key = 'kk' THEN p_storage_path ELSE kk_path END,
      birth_certificate_path = CASE WHEN p_document_key = 'birthCertificate' THEN p_storage_path ELSE birth_certificate_path END,
      report_cards_path = CASE WHEN p_document_key = 'reportCards' THEN p_storage_path ELSE report_cards_path END,
      ijazah_path = CASE WHEN p_document_key = 'ijazah' THEN p_storage_path ELSE ijazah_path END,
      skhun_path = CASE WHEN p_document_key = 'skhun' THEN p_storage_path ELSE skhun_path END,
      pas_photo_path = CASE WHEN p_document_key = 'pasPhoto' THEN p_storage_path ELSE pas_photo_path END
    WHERE tenant_id = p_tenant_id AND candidate_id = p_candidate_id;
  END IF;

  INSERT INTO public.ppdb_document_upload_requests (
    tenant_id, client_request_id, actor_user_id, candidate_id, document_key, content_sha256, storage_path
  ) VALUES (
    p_tenant_id, p_client_request_id, p_actor_user_id, p_candidate_id,
    p_document_key, decode(p_content_sha256, 'hex'), p_storage_path
  );
  INSERT INTO public.ppdb_document_upload_events (
    tenant_id, client_request_id, candidate_id, actor_user_id, document_key, content_sha256
  ) VALUES (
    p_tenant_id, p_client_request_id, p_candidate_id, p_actor_user_id,
    p_document_key, decode(p_content_sha256, 'hex')
  );

  RETURN jsonb_build_object(
    'alreadyApplied', false,
    'documentKey', p_document_key,
    'storagePath', p_storage_path
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_admin_ppdb_document_upload(UUID, UUID, TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_admin_ppdb_document_upload(UUID, UUID, TEXT, UUID, TEXT, UUID, TEXT, TEXT, TEXT)
  TO service_role;

COMMIT;
