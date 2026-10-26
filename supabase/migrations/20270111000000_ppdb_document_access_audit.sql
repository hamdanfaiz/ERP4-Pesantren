-- Append-only audit of successful reads from the private PPDB document bucket.
BEGIN;

CREATE TABLE public.ppdb_document_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  candidate_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  document_key TEXT NOT NULL CHECK (document_key IN ('kk', 'birthCertificate', 'reportCards', 'ijazah', 'skhun', 'pasPhoto')),
  content_sha256 BYTEA NOT NULL CHECK (octet_length(content_sha256) = 32),
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, candidate_id) REFERENCES public.candidates (tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, actor_user_id) REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX ppdb_document_access_events_tenant_time_idx
  ON public.ppdb_document_access_events (tenant_id, accessed_at DESC, id DESC);
CREATE INDEX ppdb_document_access_events_candidate_idx
  ON public.ppdb_document_access_events (tenant_id, candidate_id, accessed_at DESC, id DESC);

ALTER TABLE public.ppdb_document_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ppdb_document_access_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ppdb_document_access_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.ppdb_document_access_events TO service_role;

COMMENT ON TABLE public.ppdb_document_access_events IS
  'Append-only server record for successful PPDB document downloads; raw file paths and PII are not stored.';

COMMIT;
