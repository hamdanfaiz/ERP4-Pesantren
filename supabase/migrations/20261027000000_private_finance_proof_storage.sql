-- Private bucket for payment proofs; browser roles cannot read or write its objects.
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

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp4_finance_proofs_deny_browser ON storage.objects;
CREATE POLICY erp4_finance_proofs_deny_browser
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (bucket_id <> 'erp4-private-finance-proofs')
  WITH CHECK (bucket_id <> 'erp4-private-finance-proofs');

DROP POLICY IF EXISTS erp4_finance_proofs_service_role ON storage.objects;
CREATE POLICY erp4_finance_proofs_service_role
  ON storage.objects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (bucket_id = 'erp4-private-finance-proofs')
  WITH CHECK (bucket_id = 'erp4-private-finance-proofs');

COMMENT ON POLICY erp4_finance_proofs_deny_browser ON storage.objects IS
  'Blocks direct browser access to payment proof objects; trusted server APIs use the Supabase secret key.';
COMMENT ON POLICY erp4_finance_proofs_service_role ON storage.objects IS
  'Grants the trusted server role access only to the private finance proof bucket.';

COMMIT;
