-- Private tenant-scoped digital library files. Only the trusted server uses
-- the service key; browsers receive one-time, path-scoped Storage upload tokens.
BEGIN;

CREATE TABLE public.library_digital_asset_upload_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  expected_role TEXT NOT NULL CHECK (expected_role IN ('admin', 'super_admin', 'ustadz')),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  description TEXT CHECK (description IS NULL OR length(description) <= 1200),
  original_file_name TEXT NOT NULL CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 180),
  content_type TEXT NOT NULL CHECK (content_type IN (
    'application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp4'
  )),
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  declared_file_size BIGINT NOT NULL CHECK (declared_file_size BETWEEN 1 AND 26214400),
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, client_request_id),
  UNIQUE (tenant_id, asset_id),
  UNIQUE (storage_path),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK ((status = 'pending' AND completed_at IS NULL) OR (status = 'completed' AND completed_at IS NOT NULL)),
  CHECK (
    position('/' in original_file_name) = 0
    AND position(chr(92) in original_file_name) = 0
    AND original_file_name !~ '[[:cntrl:]]'
  )
);

CREATE TABLE public.library_digital_assets (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 240),
  description TEXT CHECK (description IS NULL OR length(description) <= 1200),
  original_file_name TEXT NOT NULL CHECK (length(btrim(original_file_name)) BETWEEN 1 AND 180),
  content_type TEXT NOT NULL CHECK (content_type IN (
    'application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp4'
  )),
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  file_size BIGINT NOT NULL CHECK (file_size BETWEEN 1 AND 26214400),
  storage_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  uploaded_by_user_id UUID NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, client_request_id)
    REFERENCES public.library_digital_asset_upload_requests (tenant_id, client_request_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, uploaded_by_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX library_digital_assets_tenant_page_idx
  ON public.library_digital_assets (tenant_id, uploaded_at DESC, id DESC)
  WHERE status = 'active';

CREATE TRIGGER library_digital_assets_set_updated_at
  BEFORE UPDATE ON public.library_digital_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.library_digital_asset_upload_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_digital_asset_upload_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.library_digital_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.library_digital_assets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.library_digital_asset_upload_requests, public.library_digital_assets
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.library_digital_asset_upload_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.library_digital_assets TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_tenant_library_digital_asset_upload(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_expected_role TEXT,
  p_client_request_id UUID,
  p_asset_id UUID,
  p_title TEXT,
  p_description TEXT,
  p_original_file_name TEXT,
  p_content_type TEXT,
  p_declared_file_size BIGINT,
  p_content_sha256 TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_role TEXT;
  v_extension TEXT;
  v_path TEXT;
  v_existing public.library_digital_asset_upload_requests%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL OR p_asset_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz')
    OR p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 240
    OR length(COALESCE(p_description, '')) > 1200
    OR p_original_file_name IS NULL OR length(btrim(p_original_file_name)) NOT BETWEEN 1 AND 180
    OR position('/' in p_original_file_name) > 0 OR position(chr(92) in p_original_file_name) > 0
    OR p_original_file_name ~ '[[:cntrl:]]'
    OR p_content_type IS NULL OR p_content_type NOT IN ('application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp4')
    OR p_declared_file_size IS NULL OR p_declared_file_size NOT BETWEEN 1 AND 26214400
    OR p_content_sha256 IS NULL OR p_content_sha256 !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Data aset digital perpustakaan tidak valid' USING ERRCODE = '22023';
  END IF;

  v_extension := CASE p_content_type
    WHEN 'application/pdf' THEN 'pdf'
    WHEN 'application/epub+zip' THEN 'epub'
    WHEN 'audio/mpeg' THEN 'mp3'
    WHEN 'audio/mp4' THEN 'm4a'
  END;
  IF right(lower(btrim(p_original_file_name)), length(v_extension) + 1) <> ('.' || v_extension) THEN
    RAISE EXCEPTION 'Ekstensi berkas tidak sesuai dengan jenisnya' USING ERRCODE = '22023';
  END IF;
  v_path := p_tenant_id::text || '/' || p_asset_id::text || '.' || v_extension;

  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant perpustakaan tidak aktif' USING ERRCODE = '42501'; END IF;

  SELECT lower(btrim(profile.role::text)) INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_actor_user_id AND profile.status = 'active'
    AND lower(btrim(profile.role::text)) = p_expected_role
    AND (
      lower(btrim(profile.role::text)) = 'super_admin'
      OR CASE
        WHEN profile.module_permissions ? 'library' THEN
          jsonb_typeof(profile.module_permissions -> 'library') = 'boolean'
          AND profile.module_permissions ->> 'library' = 'true'
        ELSE lower(btrim(profile.role::text)) IN ('admin', 'ustadz')
      END
    )
  FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Akses aktif ke modul Perpustakaan diperlukan' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-asset-upload:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));

  SELECT * INTO v_existing FROM public.library_digital_asset_upload_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  IF FOUND THEN
    IF v_existing.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_existing.expected_role IS DISTINCT FROM p_expected_role
      OR v_existing.title IS DISTINCT FROM btrim(p_title)
      OR v_existing.description IS DISTINCT FROM NULLIF(btrim(COALESCE(p_description, '')), '')
      OR v_existing.original_file_name IS DISTINCT FROM btrim(p_original_file_name)
      OR v_existing.content_type IS DISTINCT FROM p_content_type
      OR v_existing.declared_file_size IS DISTINCT FROM p_declared_file_size
      OR v_existing.content_sha256 IS DISTINCT FROM decode(p_content_sha256, 'hex') THEN
      RAISE EXCEPTION 'Kunci permintaan upload sudah digunakan untuk berkas berbeda' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'assetId', v_existing.asset_id, 'storagePath', v_existing.storage_path,
      'alreadyCompleted', v_existing.status = 'completed'
    );
  END IF;

  INSERT INTO public.library_digital_asset_upload_requests (
    tenant_id, client_request_id, asset_id, actor_user_id, expected_role,
    title, description, original_file_name, content_type, declared_file_size, content_sha256, storage_path
  ) VALUES (
    p_tenant_id, p_client_request_id, p_asset_id, p_actor_user_id, p_expected_role,
    btrim(p_title), NULLIF(btrim(COALESCE(p_description, '')), ''), btrim(p_original_file_name),
    p_content_type, p_declared_file_size, decode(p_content_sha256, 'hex'), v_path
  );

  RETURN jsonb_build_object('assetId', p_asset_id, 'storagePath', v_path, 'alreadyCompleted', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_tenant_library_digital_asset_upload(
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
  v_role TEXT;
  v_upload public.library_digital_asset_upload_requests%ROWTYPE;
  v_asset public.library_digital_assets%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_client_request_id IS NULL
    OR p_expected_role IS NULL OR p_expected_role NOT IN ('admin', 'super_admin', 'ustadz') THEN
    RAISE EXCEPTION 'Parameter penyelesaian upload tidak valid' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.tenants WHERE id = p_tenant_id AND status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant perpustakaan tidak aktif' USING ERRCODE = '42501'; END IF;

  SELECT lower(btrim(profile.role::text)) INTO v_role
  FROM public.profiles AS profile
  WHERE profile.tenant_id = p_tenant_id AND profile.user_id = p_actor_user_id AND profile.status = 'active'
    AND lower(btrim(profile.role::text)) = p_expected_role
    AND (
      lower(btrim(profile.role::text)) = 'super_admin'
      OR CASE
        WHEN profile.module_permissions ? 'library' THEN
          jsonb_typeof(profile.module_permissions -> 'library') = 'boolean'
          AND profile.module_permissions ->> 'library' = 'true'
        ELSE lower(btrim(profile.role::text)) IN ('admin', 'ustadz')
      END
    )
  FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION 'Akses aktif ke modul Perpustakaan diperlukan' USING ERRCODE = '42501'; END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'library-asset-upload:' || p_tenant_id::text || ':' || p_client_request_id::text, 0
  ));
  SELECT * INTO v_upload FROM public.library_digital_asset_upload_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id FOR UPDATE;
  IF NOT FOUND OR v_upload.actor_user_id <> p_actor_user_id OR v_upload.expected_role <> p_expected_role THEN
    RAISE EXCEPTION 'Permintaan upload tidak ditemukan pada tenant ini' USING ERRCODE = 'P0002';
  END IF;
  IF v_upload.status = 'completed' THEN
    SELECT * INTO v_asset FROM public.library_digital_assets
    WHERE tenant_id = p_tenant_id AND id = v_upload.asset_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Metadata aset tidak konsisten' USING ERRCODE = '23514'; END IF;
    RETURN jsonb_build_object('assetId', v_asset.id, 'alreadyApplied', true);
  END IF;
  IF p_verified_file_size IS NULL OR p_verified_file_size <> v_upload.declared_file_size
    OR p_verified_content_type IS NULL OR p_verified_content_type <> v_upload.content_type
    OR p_verified_content_sha256 IS NULL OR p_verified_content_sha256 !~ '^[0-9a-fA-F]{64}$'
    OR decode(p_verified_content_sha256, 'hex') <> v_upload.content_sha256 THEN
    RAISE EXCEPTION 'Ukuran atau jenis berkas tidak sesuai pratinjau upload' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.library_digital_assets (
    id, tenant_id, client_request_id, title, description, original_file_name,
    content_type, content_sha256, file_size, storage_path, uploaded_by_user_id
  ) VALUES (
    v_upload.asset_id, p_tenant_id, v_upload.client_request_id, v_upload.title, v_upload.description,
    v_upload.original_file_name, v_upload.content_type, v_upload.content_sha256, p_verified_file_size,
    v_upload.storage_path, p_actor_user_id
  );
  UPDATE public.library_digital_asset_upload_requests
  SET status = 'completed', completed_at = now()
  WHERE tenant_id = p_tenant_id AND client_request_id = p_client_request_id;
  RETURN jsonb_build_object('assetId', v_upload.asset_id, 'alreadyApplied', false);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_tenant_library_digital_asset_upload(UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reserve_tenant_library_digital_asset_upload(UUID, UUID, TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION public.finalize_tenant_library_digital_asset_upload(UUID, UUID, TEXT, UUID, BIGINT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_tenant_library_digital_asset_upload(UUID, UUID, TEXT, UUID, BIGINT, TEXT, TEXT)
  TO service_role;

COMMENT ON TABLE public.library_digital_assets IS
  'Tenant-scoped metadata for private Supabase Storage assets. Original bytes are never public and downloads require short-lived signed URLs.';
COMMENT ON TABLE public.library_digital_asset_upload_requests IS
  'Server-only upload reservations used for path-bound signed uploads and idempotent finalization.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'erp4-private-library-assets', 'erp4-private-library-assets', false, 26214400,
  ARRAY['application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp4']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
