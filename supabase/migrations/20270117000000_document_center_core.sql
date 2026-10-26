-- Tenant-scoped correspondence register with append-only workflow history and
-- private, server-issued upload/download links for PDF attachments.
BEGIN;

CREATE TABLE public.document_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  document_number TEXT NOT NULL CHECK (length(btrim(document_number)) BETWEEN 1 AND 80),
  direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing', 'internal')),
  subject TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 1 AND 240),
  sender_name TEXT CHECK (sender_name IS NULL OR length(btrim(sender_name)) <= 200),
  recipient_name TEXT CHECK (recipient_name IS NULL OR length(btrim(recipient_name)) <= 200),
  document_date DATE NOT NULL,
  summary TEXT CHECK (summary IS NULL OR length(summary) <= 2000),
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'in_review', 'approved', 'rejected', 'archived')),
  created_by_user_id UUID NOT NULL,
  updated_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, created_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, updated_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    document_number !~ '[[:cntrl:]]'
    AND subject !~ '[[:cntrl:]]'
    AND COALESCE(sender_name, '') !~ '[[:cntrl:]]'
    AND COALESCE(recipient_name, '') !~ '[[:cntrl:]]'
  )
);

CREATE INDEX document_records_tenant_page_idx
  ON public.document_records (tenant_id, created_at DESC, id DESC);
CREATE UNIQUE INDEX document_records_tenant_document_number_uq
  ON public.document_records (tenant_id, lower(btrim(document_number)));
CREATE INDEX document_records_tenant_status_idx
  ON public.document_records (tenant_id, status, document_date DESC);
CREATE TRIGGER document_records_set_updated_at
  BEFORE UPDATE ON public.document_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  document_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('registered', 'status_changed', 'attachment_added')),
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('registered', 'in_review', 'approved', 'rejected', 'archived')),
  next_status TEXT CHECK (next_status IS NULL OR next_status IN ('registered', 'in_review', 'approved', 'rejected', 'archived')),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES public.document_records (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((event_type = 'registered' AND previous_status IS NULL AND next_status = 'registered')
      OR (event_type = 'status_changed' AND previous_status IS NOT NULL AND next_status IS NOT NULL)
      OR (event_type = 'attachment_added' AND previous_status IS NULL AND next_status IS NULL))
);
CREATE INDEX document_workflow_events_tenant_doc_idx
  ON public.document_workflow_events (tenant_id, document_id, created_at DESC, id DESC);

CREATE TABLE public.document_attachment_upload_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  attachment_id UUID NOT NULL,
  document_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  expected_role TEXT NOT NULL CHECK (expected_role IN ('admin', 'super_admin')),
  original_file_name TEXT NOT NULL CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 180),
  content_type TEXT NOT NULL CHECK (content_type = 'application/pdf'),
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  declared_file_size BIGINT NOT NULL CHECK (declared_file_size BETWEEN 1 AND 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, client_request_id),
  UNIQUE (tenant_id, attachment_id),
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES public.document_records (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((status = 'pending' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL)),
  CHECK (
    position('/' in original_file_name) = 0
    AND position(chr(92) in original_file_name) = 0
    AND original_file_name !~ '[[:cntrl:]]'
    AND right(lower(btrim(original_file_name)), 4) = '.pdf'
  )
);

CREATE TABLE public.document_attachments (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  document_id UUID NOT NULL,
  client_request_id UUID NOT NULL,
  original_file_name TEXT NOT NULL CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 180),
  content_type TEXT NOT NULL CHECK (content_type = 'application/pdf'),
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  file_size BIGINT NOT NULL CHECK (file_size BETWEEN 1 AND 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  uploaded_by_user_id UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, document_id)
    REFERENCES public.document_records (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, client_request_id)
    REFERENCES public.document_attachment_upload_requests (tenant_id, client_request_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, uploaded_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);
CREATE INDEX document_attachments_tenant_doc_idx
  ON public.document_attachments (tenant_id, document_id, uploaded_at DESC, id DESC);

ALTER TABLE public.document_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_workflow_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_workflow_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_attachment_upload_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_attachment_upload_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.document_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_attachments FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.document_records, public.document_workflow_events,
  public.document_attachment_upload_requests, public.document_attachments
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.document_records TO service_role;
GRANT SELECT, INSERT ON TABLE public.document_workflow_events TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.document_attachment_upload_requests TO service_role;
GRANT SELECT, INSERT ON TABLE public.document_attachments TO service_role;

CREATE OR REPLACE FUNCTION public.assert_tenant_document_actor(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_expected_role IS NULL
    OR p_expected_role NOT IN ('admin', 'super_admin') THEN
    RAISE EXCEPTION 'Aktor Dokumen Digital tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant Dokumen Digital tidak aktif' USING ERRCODE = '42501'; END IF;
  SELECT lower(btrim(profile.role)) INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_actor_user_id
    AND profile.status = 'active'
    AND lower(btrim(profile.role)) = p_expected_role
    AND (
      lower(btrim(profile.role)) = 'super_admin'
      OR CASE
        WHEN profile.module_permissions ? 'document' THEN
          jsonb_typeof(profile.module_permissions -> 'document') = 'boolean'
          AND profile.module_permissions ->> 'document' = 'true'
        ELSE lower(btrim(profile.role)) = 'admin'
      END
    )
  FOR SHARE;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Akses aktif Admin ke Dokumen Digital diperlukan' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.register_tenant_document(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_document_id UUID,
  p_document_number TEXT,
  p_direction TEXT,
  p_subject TEXT,
  p_sender_name TEXT,
  p_recipient_name TEXT,
  p_document_date DATE,
  p_summary TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_existing public.document_records%ROWTYPE;
  v_document_number TEXT := btrim(COALESCE(p_document_number, ''));
  v_subject TEXT := btrim(COALESCE(p_subject, ''));
  v_sender TEXT := NULLIF(btrim(COALESCE(p_sender_name, '')), '');
  v_recipient TEXT := NULLIF(btrim(COALESCE(p_recipient_name, '')), '');
  v_summary TEXT := NULLIF(btrim(COALESCE(p_summary, '')), '');
BEGIN
  PERFORM public.assert_tenant_document_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_client_request_id IS NULL OR p_document_id IS NULL
    OR length(v_document_number) NOT BETWEEN 1 AND 80 OR v_document_number ~ '[[:cntrl:]]'
    OR p_direction IS NULL OR p_direction NOT IN ('incoming', 'outgoing', 'internal')
    OR length(v_subject) NOT BETWEEN 1 AND 240 OR v_subject ~ '[[:cntrl:]]'
    OR COALESCE(length(v_sender), 0) > 200 OR COALESCE(v_sender, '') ~ '[[:cntrl:]]'
    OR COALESCE(length(v_recipient), 0) > 200 OR COALESCE(v_recipient, '') ~ '[[:cntrl:]]'
    OR p_document_date IS NULL OR COALESCE(length(v_summary), 0) > 2000 THEN
    RAISE EXCEPTION 'Data dokumen tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-register:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing FROM public.document_records
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.created_by_user_id = p_actor_user_id
      AND v_existing.document_number = v_document_number AND v_existing.direction = p_direction
      AND v_existing.subject = v_subject AND v_existing.sender_name IS NOT DISTINCT FROM v_sender
      AND v_existing.recipient_name IS NOT DISTINCT FROM v_recipient
      AND v_existing.document_date = p_document_date AND v_existing.summary IS NOT DISTINCT FROM v_summary THEN
      RETURN jsonb_build_object('documentId', v_existing.id, 'alreadyApplied', true);
    END IF;
    RAISE EXCEPTION 'ID permintaan sudah dipakai untuk isi dokumen lain' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.document_records (
    id, tenant_id, client_request_id, document_number, direction, subject,
    sender_name, recipient_name, document_date, summary, status,
    created_by_user_id, updated_by_user_id
  ) VALUES (
    p_document_id, p_tenant_id, p_client_request_id, v_document_number, p_direction,
    v_subject, v_sender, v_recipient, p_document_date, v_summary, 'registered',
    p_actor_user_id, p_actor_user_id
  );
  INSERT INTO public.document_workflow_events (
    tenant_id, document_id, actor_user_id, event_type, next_status
  ) VALUES (p_tenant_id, p_document_id, p_actor_user_id, 'registered', 'registered');
  RETURN jsonb_build_object('documentId', p_document_id, 'alreadyApplied', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_tenant_document(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_document_id UUID,
  p_next_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_document public.document_records%ROWTYPE;
  v_note TEXT := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_allowed BOOLEAN := false;
BEGIN
  PERFORM public.assert_tenant_document_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_document_id IS NULL OR COALESCE(length(v_note), 0) > 1000 THEN
    RAISE EXCEPTION 'Perubahan status dokumen tidak valid' USING ERRCODE = '22023';
  END IF;
  IF p_next_status IS NULL OR p_next_status NOT IN ('in_review', 'approved', 'rejected', 'archived') THEN
    RAISE EXCEPTION 'Status tujuan dokumen tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_document FROM public.document_records
    WHERE tenant_id = p_tenant_id AND id = p_document_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Dokumen tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002'; END IF;
  IF v_document.status = p_next_status THEN
    RETURN jsonb_build_object('documentId', v_document.id, 'alreadyApplied', true, 'status', v_document.status);
  END IF;
  v_allowed := (v_document.status = 'registered' AND p_next_status IN ('in_review', 'archived'))
    OR (v_document.status = 'in_review' AND p_next_status IN ('approved', 'rejected', 'archived'))
    OR (v_document.status = 'rejected' AND p_next_status IN ('in_review', 'archived'))
    OR (v_document.status = 'approved' AND p_next_status = 'archived');
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Perubahan status dokumen tidak diizinkan dari status saat ini' USING ERRCODE = '23514';
  END IF;
  UPDATE public.document_records SET status = p_next_status, updated_by_user_id = p_actor_user_id
    WHERE tenant_id = p_tenant_id AND id = p_document_id;
  INSERT INTO public.document_workflow_events (
    tenant_id, document_id, actor_user_id, event_type, previous_status, next_status, note
  ) VALUES (
    p_tenant_id, p_document_id, p_actor_user_id, 'status_changed', v_document.status, p_next_status, v_note
  );
  RETURN jsonb_build_object('documentId', p_document_id, 'alreadyApplied', false, 'status', p_next_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_tenant_document_attachment_upload(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_attachment_id UUID,
  p_document_id UUID,
  p_original_file_name TEXT,
  p_declared_file_size BIGINT,
  p_content_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_path TEXT;
  v_existing public.document_attachment_upload_requests%ROWTYPE;
  v_file_name TEXT := btrim(COALESCE(p_original_file_name, ''));
  v_status TEXT;
BEGIN
  PERFORM public.assert_tenant_document_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_client_request_id IS NULL OR p_attachment_id IS NULL OR p_document_id IS NULL
    OR length(v_file_name) NOT BETWEEN 1 AND 180
    OR position('/' in v_file_name) > 0 OR position(chr(92) in v_file_name) > 0
    OR v_file_name ~ '[[:cntrl:]]' OR right(lower(v_file_name), 4) <> '.pdf'
    OR p_declared_file_size IS NULL OR p_declared_file_size NOT BETWEEN 1 AND 26214400
    OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Data lampiran PDF tidak valid' USING ERRCODE = '22023';
  END IF;
  SELECT status INTO v_status FROM public.document_records
    WHERE tenant_id = p_tenant_id AND id = p_document_id FOR UPDATE;
  IF NOT FOUND OR v_status = 'archived' THEN
    RAISE EXCEPTION 'Dokumen tidak tersedia untuk menerima lampiran' USING ERRCODE = 'P0002';
  END IF;
  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'document-attachment-upload:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_existing FROM public.document_attachment_upload_requests
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.actor_user_id <> p_actor_user_id OR v_existing.expected_role <> p_expected_role
      OR v_existing.document_id <> p_document_id OR v_existing.original_file_name <> v_file_name
      OR v_existing.declared_file_size <> p_declared_file_size
      OR v_existing.content_sha256 <> decode(p_content_sha256, 'hex') THEN
      RAISE EXCEPTION 'ID permintaan upload sudah dipakai untuk lampiran lain' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'attachmentId', v_existing.attachment_id, 'storagePath', v_existing.storage_path,
      'alreadyCompleted', v_existing.status = 'completed'
    );
  END IF;
  v_path := p_tenant_id::text || '/' || p_document_id::text || '/' || p_attachment_id::text || '.pdf';
  INSERT INTO public.document_attachment_upload_requests (
    tenant_id, client_request_id, attachment_id, document_id, actor_user_id, expected_role,
    original_file_name, content_type, content_sha256, declared_file_size, storage_path
  ) VALUES (
    p_tenant_id, p_client_request_id, p_attachment_id, p_document_id, p_actor_user_id,
    p_expected_role, v_file_name, 'application/pdf', decode(p_content_sha256, 'hex'),
    p_declared_file_size, v_path
  );
  RETURN jsonb_build_object('attachmentId', p_attachment_id, 'storagePath', v_path, 'alreadyCompleted', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_tenant_document_attachment_upload(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_verified_file_size BIGINT,
  p_verified_content_type TEXT,
  p_verified_content_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_upload public.document_attachment_upload_requests%ROWTYPE;
  v_document_status TEXT;
BEGIN
  PERFORM public.assert_tenant_document_actor(p_tenant_id, p_actor_user_id, p_expected_role);
  IF p_client_request_id IS NULL THEN RAISE EXCEPTION 'ID permintaan upload tidak valid' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_upload FROM public.document_attachment_upload_requests
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF NOT FOUND OR v_upload.actor_user_id <> p_actor_user_id OR v_upload.expected_role <> p_expected_role THEN
    RAISE EXCEPTION 'Permintaan lampiran tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_upload.status = 'completed' THEN
    RETURN jsonb_build_object('attachmentId', v_upload.attachment_id, 'alreadyApplied', true);
  END IF;
  SELECT status INTO v_document_status FROM public.document_records
    WHERE tenant_id = p_tenant_id AND id = v_upload.document_id FOR SHARE;
  IF NOT FOUND OR v_document_status = 'archived' THEN
    RAISE EXCEPTION 'Dokumen tidak tersedia untuk menerima lampiran' USING ERRCODE = 'P0002';
  END IF;
  IF p_verified_file_size IS NULL OR p_verified_file_size <> v_upload.declared_file_size
    OR p_verified_content_type IS DISTINCT FROM 'application/pdf'
    OR p_verified_content_sha256 IS NULL OR p_verified_content_sha256 !~ '^[0-9a-fA-F]{64}$'
    OR decode(p_verified_content_sha256, 'hex') <> v_upload.content_sha256 THEN
    RAISE EXCEPTION 'Ukuran atau isi lampiran tidak sesuai dengan reservasi upload' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.document_attachments (
    id, tenant_id, document_id, client_request_id, original_file_name,
    content_type, content_sha256, file_size, storage_path, uploaded_by_user_id
  ) VALUES (
    v_upload.attachment_id, p_tenant_id, v_upload.document_id, v_upload.client_request_id,
    v_upload.original_file_name, v_upload.content_type, v_upload.content_sha256,
    p_verified_file_size, v_upload.storage_path, p_actor_user_id
  );
  UPDATE public.document_attachment_upload_requests SET status = 'completed', completed_at = now()
    WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  INSERT INTO public.document_workflow_events (tenant_id, document_id, actor_user_id, event_type)
    VALUES (p_tenant_id, v_upload.document_id, p_actor_user_id, 'attachment_added');
  RETURN jsonb_build_object('attachmentId', v_upload.attachment_id, 'alreadyApplied', false);
END;
$$;

REVOKE ALL ON FUNCTION public.assert_tenant_document_actor(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.register_tenant_document(UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.transition_tenant_document(UUID, UUID, TEXT, UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reserve_tenant_document_attachment_upload(UUID, UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.finalize_tenant_document_attachment_upload(UUID, UUID, TEXT, UUID, BIGINT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant_document_actor(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_tenant_document(UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_tenant_document(UUID, UUID, TEXT, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_tenant_document_attachment_upload(UUID, UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_tenant_document_attachment_upload(UUID, UUID, TEXT, UUID, BIGINT, TEXT, TEXT) TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'erp4-private-document-attachments' AND public) THEN
    RAISE EXCEPTION 'Existing document attachment bucket must remain private';
  END IF;
END;
$$;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('erp4-private-document-attachments', 'erp4-private-document-attachments', false, 26214400, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMENT ON TABLE public.document_records IS 'Tenant-scoped incoming, outgoing, and internal correspondence register.';
COMMENT ON TABLE public.document_workflow_events IS 'Append-only audit history for correspondence registration, approval, archival, and attachments.';
COMMENT ON TABLE public.document_attachments IS 'Metadata for PDF files stored only in the private document attachment bucket.';
COMMENT ON FUNCTION public.register_tenant_document(UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT)
  IS 'Idempotently registers a tenant-owned document after checking active Admin module access.';
COMMENT ON FUNCTION public.transition_tenant_document(UUID, UUID, TEXT, UUID, TEXT, TEXT)
  IS 'Applies only allowed correspondence workflow transitions and writes an immutable audit event.';

COMMIT;
