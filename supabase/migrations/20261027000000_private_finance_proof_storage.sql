-- Private bucket for payment proofs. Supabase owns the storage schema; do not
-- ALTER storage.objects or manage its policies from application migrations.
-- Application traffic uses the trusted server/service key. Without an explicit
-- browser policy for this bucket, the default Storage RLS behavior denies access.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'erp4-private-finance-proofs',
  'erp4-private-finance-proofs',
  false,
  3145728,
  ARRAY['image/png', 'image/jpeg', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;
