BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(22);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('a1600000-0000-4000-8000-000000000001', 'library-assets-a-test', 'Library Assets A Test', 'active'),
  ('b2600000-0000-4000-8000-000000000002', 'library-assets-b-test', 'Library Assets B Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a1600000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'library-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1600000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'library-no-access@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('a1600000-0000-4000-8000-000000000011', 'a1600000-0000-4000-8000-000000000001', 'library-admin@test.invalid', 'Library Admin', 'admin', 'active', '{}'),
  ('a1600000-0000-4000-8000-000000000012', 'a1600000-0000-4000-8000-000000000001', 'library-no-access@test.invalid', 'Library No Access', 'ustadz', 'active', '{"library":false}');

SELECT ok((SELECT public = false FROM storage.buckets WHERE id = 'erp4-private-library-assets'), 'digital library bucket exists and is private');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.library_digital_assets'::regclass), 'asset metadata has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.library_digital_assets'::regclass), 'asset metadata forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.library_digital_asset_upload_requests'::regclass), 'upload reservations have RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.library_digital_asset_upload_requests'::regclass), 'upload reservations force RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.library_digital_assets', 'SELECT'), 'anon cannot read asset metadata directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.library_digital_assets', 'SELECT'), 'authenticated cannot read asset metadata directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.library_digital_asset_upload_requests', 'INSERT'), 'browser users cannot reserve uploads directly');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.reserve_tenant_library_digital_asset_upload(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text)'), 'EXECUTE'), 'trusted server can reserve a signed upload');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.reserve_tenant_library_digital_asset_upload(uuid,uuid,text,uuid,uuid,text,text,text,text,bigint,text)'), 'EXECUTE'), 'browser users cannot call the reservation RPC');

SET LOCAL ROLE service_role;
SELECT is(
  public.reserve_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000021', 'a1600000-0000-4000-8000-000000000031',
    'Panduan Pesantren', NULL, 'panduan.pdf', 'application/pdf', 8, repeat('ab', 32)
  )->>'assetId', 'a1600000-0000-4000-8000-000000000031', 'server reserves a tenant and actor scoped upload path');
SELECT is(
  public.reserve_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000021', 'a1600000-0000-4000-8000-000000000099',
    'Panduan Pesantren', NULL, 'panduan.pdf', 'application/pdf', 8, repeat('ab', 32)
  )->>'assetId', 'a1600000-0000-4000-8000-000000000031', 'retry reuses the original asset ID and storage path');
SELECT throws_ok(
  $$SELECT public.reserve_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000012', 'ustadz',
    'a1600000-0000-4000-8000-000000000022', 'a1600000-0000-4000-8000-000000000032',
    'Tidak berizin', NULL, 'tidak.pdf', 'application/pdf', 8, repeat('cd', 32)
  )$$,
  '42501', 'Akses aktif ke modul Perpustakaan diperlukan', 'role without library permission is rejected by the database'
);
SELECT throws_ok(
  $$SELECT public.reserve_tenant_library_digital_asset_upload(
    'b2600000-0000-4000-8000-000000000002', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000023', 'a1600000-0000-4000-8000-000000000033',
    'Cross Tenant', NULL, 'cross.pdf', 'application/pdf', 8, repeat('ef', 32)
  )$$,
  '42501', 'Akses aktif ke modul Perpustakaan diperlukan', 'an Admin cannot reserve an asset for another tenant'
);
SELECT throws_ok(
  $$SELECT public.reserve_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000024', 'a1600000-0000-4000-8000-000000000034',
    'Wrong Extension', NULL, 'wrong.epub', 'application/pdf', 8, repeat('ef', 32)
  )$$,
  '22023', 'Ekstensi berkas tidak sesuai dengan jenisnya', 'extension must match the declared file type'
);
SELECT throws_ok(
  $$SELECT public.reserve_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000021', 'a1600000-0000-4000-8000-000000000031',
    'Panduan Pesantren', NULL, 'panduan.pdf', 'application/pdf', 8, repeat('cd', 32)
  )$$,
  '23505', 'Kunci permintaan upload sudah digunakan untuk berkas berbeda', 'idempotency key cannot be reused with another content hash'
);
SELECT throws_ok(
  $$SELECT public.finalize_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000021', 8, 'application/pdf', repeat('cd', 32)
  )$$,
  '22023', 'Ukuran atau jenis berkas tidak sesuai pratinjau upload', 'finalize rejects file hash mismatch'
);
SELECT is(
  public.finalize_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000021', 8, 'application/pdf', repeat('ab', 32)
  )->>'alreadyApplied', 'false', 'verified upload creates its asset metadata exactly once');
SELECT is(
  public.finalize_tenant_library_digital_asset_upload(
    'a1600000-0000-4000-8000-000000000001', 'a1600000-0000-4000-8000-000000000011', 'admin',
    'a1600000-0000-4000-8000-000000000021', 8, 'application/pdf', repeat('ab', 32)
  )->>'alreadyApplied', 'true', 'finalize retry returns the already created asset');
RESET ROLE;

SELECT is((SELECT count(*)::INTEGER FROM public.library_digital_assets WHERE tenant_id = 'a1600000-0000-4000-8000-000000000001'), 1, 'one tenant asset is stored after retry');
SELECT is((SELECT encode(content_sha256, 'hex') FROM public.library_digital_assets WHERE tenant_id = 'a1600000-0000-4000-8000-000000000001'), repeat('ab', 32), 'verified fingerprint is retained with asset metadata');
SELECT is((SELECT count(*)::INTEGER FROM public.library_digital_assets WHERE tenant_id = 'b2600000-0000-4000-8000-000000000002'), 0, 'another tenant receives no asset metadata');
SELECT * FROM finish();
ROLLBACK;
