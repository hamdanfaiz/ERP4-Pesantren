BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(41);

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('a1700000-0000-4000-8000-000000000001', 'document-center-a-test', 'Document Center A Test', 'active'),
  ('b2700000-0000-4000-8000-000000000002', 'document-center-b-test', 'Document Center B Test', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('a1700000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'document-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('a1700000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'document-denied@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('a1700000-0000-4000-8000-000000000011', 'a1700000-0000-4000-8000-000000000001', 'document-admin@test.invalid', 'Document Admin', 'admin', 'active', '{}'),
  ('a1700000-0000-4000-8000-000000000012', 'a1700000-0000-4000-8000-000000000001', 'document-denied@test.invalid', 'Document Denied', 'admin', 'active', '{"document":false}');

SELECT ok((SELECT public = false FROM storage.buckets WHERE id = 'erp4-private-document-attachments'), 'document attachment bucket is private');
SELECT ok((SELECT file_size_limit = 26214400 AND allowed_mime_types = ARRAY['application/pdf'] FROM storage.buckets WHERE id = 'erp4-private-document-attachments'), 'document attachment bucket accepts only PDF up to 25 MiB');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.document_records'::regclass), 'document records have RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.document_records'::regclass), 'document records force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.document_workflow_events'::regclass), 'workflow history has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.document_workflow_events'::regclass), 'workflow history forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.document_attachment_upload_requests'::regclass), 'upload reservations have RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.document_attachment_upload_requests'::regclass), 'upload reservations force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.document_attachments'::regclass), 'attachment metadata has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.document_attachments'::regclass), 'attachment metadata forces RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.document_records', 'SELECT'), 'anon cannot read document records directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.document_records', 'SELECT'), 'authenticated cannot read document records directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.document_attachment_upload_requests', 'INSERT'), 'browser users cannot reserve an upload directly');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.register_tenant_document(uuid,uuid,text,uuid,uuid,text,text,text,text,text,date,text)'), 'EXECUTE'), 'trusted server can register a tenant document');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.register_tenant_document(uuid,uuid,text,uuid,uuid,text,text,text,text,text,date,text)'), 'EXECUTE'), 'browser users cannot call document registration RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.reserve_tenant_document_attachment_upload(uuid,uuid,text,uuid,uuid,uuid,text,bigint,text)'), 'EXECUTE'), 'trusted server can reserve a signed document upload');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.finalize_tenant_document_attachment_upload(uuid,uuid,text,uuid,bigint,text,text)'), 'EXECUTE'), 'trusted server can finalize a verified document upload');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.reserve_tenant_document_attachment_upload(uuid,uuid,text,uuid,uuid,uuid,text,bigint,text)'), 'EXECUTE'), 'browser users cannot reserve a signed upload through RPC');

SET LOCAL ROLE service_role;
SELECT is(
  public.register_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000021', 'a1700000-0000-4000-8000-000000000031',
    '012/PP/2027', 'incoming', 'Undangan rapat', 'Kantor Kecamatan', 'Pimpinan Pesantren', '2027-01-17', 'Rapat koordinasi'
  )->>'documentId', 'a1700000-0000-4000-8000-000000000031', 'admin registers a tenant document');
SELECT is(
  public.register_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000021', 'a1700000-0000-4000-8000-000000000099',
    '012/PP/2027', 'incoming', 'Undangan rapat', 'Kantor Kecamatan', 'Pimpinan Pesantren', '2027-01-17', 'Rapat koordinasi'
  )->>'documentId', 'a1700000-0000-4000-8000-000000000031', 'identical retry reuses the original document');
SELECT throws_ok(
  $$SELECT public.register_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000012', 'admin',
    'a1700000-0000-4000-8000-000000000022', 'a1700000-0000-4000-8000-000000000032',
    '013/PP/2027', 'incoming', 'Tidak berizin', NULL, NULL, '2027-01-17', NULL
  )$$, '42501', 'Akses aktif Admin ke Dokumen Digital diperlukan', 'admin explicitly denied the module is rejected in the database'
);
SELECT throws_ok(
  $$SELECT public.register_tenant_document(
    'b2700000-0000-4000-8000-000000000002', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'b2700000-0000-4000-8000-000000000021', 'b2700000-0000-4000-8000-000000000031',
    '001/PP/2027', 'incoming', 'Lintas tenant', NULL, NULL, '2027-01-17', NULL
  )$$, '42501', 'Akses aktif Admin ke Dokumen Digital diperlukan', 'admin cannot register a record in another tenant'
);
SELECT throws_ok(
  $$SELECT public.register_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000023', 'a1700000-0000-4000-8000-000000000033',
    '012/pp/2027', 'outgoing', 'Nomor ganda', NULL, 'Penerima', '2027-01-17', NULL
  )$$, '23505', NULL, 'document numbers are unique within a tenant'
);
SELECT throws_ok(
  $$SELECT public.transition_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000031', 'approved', NULL
  )$$, '23514', 'Perubahan status dokumen tidak diizinkan dari status saat ini', 'workflow rejects skipping review'
);
SELECT is(
  public.transition_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000031', 'in_review', NULL
  )->>'alreadyApplied', 'false', 'registered document can enter review');
SELECT is(
  public.transition_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000031', 'in_review', NULL
  )->>'alreadyApplied', 'true', 'status retry is idempotent');
SELECT is(
  public.transition_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000031', 'approved', 'Sudah ditelaah'
  )->>'status', 'approved', 'reviewed document can be approved');

SELECT is(
  public.reserve_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000041', 'a1700000-0000-4000-8000-000000000051',
    'a1700000-0000-4000-8000-000000000031', 'undangan.pdf', 8, repeat('ab', 32)
  )->>'storagePath', 'a1700000-0000-4000-8000-000000000001/a1700000-0000-4000-8000-000000000031/a1700000-0000-4000-8000-000000000051.pdf', 'server reserves an immutable tenant and document scoped PDF path');
SELECT is(
  public.reserve_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000041', 'a1700000-0000-4000-8000-000000000099',
    'a1700000-0000-4000-8000-000000000031', 'undangan.pdf', 8, repeat('ab', 32)
  )->>'attachmentId', 'a1700000-0000-4000-8000-000000000051', 'upload retry keeps its original attachment ID');
SELECT throws_ok(
  $$SELECT public.finalize_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000041', 8, 'application/pdf', repeat('cd', 32)
  )$$, '22023', 'Ukuran atau isi lampiran tidak sesuai dengan reservasi upload', 'finalize rejects content hash mismatch'
);
SELECT is(
  public.finalize_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000041', 8, 'application/pdf', repeat('ab', 32)
  )->>'alreadyApplied', 'false', 'verified upload creates attachment metadata once');
SELECT is(
  public.finalize_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000041', 8, 'application/pdf', repeat('ab', 32)
  )->>'alreadyApplied', 'true', 'upload finalization retry is idempotent');
SELECT is(
  public.reserve_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000042', 'a1700000-0000-4000-8000-000000000052',
    'a1700000-0000-4000-8000-000000000031', 'lampiran-kedua.pdf', 8, repeat('cd', 32)
  )->>'attachmentId', 'a1700000-0000-4000-8000-000000000052', 'another PDF can be reserved before archival');
SELECT is(
  public.transition_tenant_document(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000031', 'archived', 'Arsip selesai'
  )->>'status', 'archived', 'approved document can be archived');
SELECT throws_ok(
  $$SELECT public.finalize_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000042', 8, 'application/pdf', repeat('cd', 32)
  )$$, 'P0002', 'Dokumen tidak tersedia untuk menerima lampiran', 'an archived document cannot accept a previously reserved upload'
);
SELECT throws_ok(
  $$SELECT public.reserve_tenant_document_attachment_upload(
    'a1700000-0000-4000-8000-000000000001', 'a1700000-0000-4000-8000-000000000011', 'admin',
    'a1700000-0000-4000-8000-000000000043', 'a1700000-0000-4000-8000-000000000053',
    'a1700000-0000-4000-8000-000000000031', 'lampiran-tertutup.pdf', 8, repeat('ef', 32)
  )$$, 'P0002', 'Dokumen tidak tersedia untuk menerima lampiran', 'archived documents reject new upload reservations'
);
RESET ROLE;

SELECT is((SELECT count(*)::INTEGER FROM public.document_records WHERE tenant_id = 'a1700000-0000-4000-8000-000000000001'), 1, 'one tenant document exists');
SELECT is((SELECT count(*)::INTEGER FROM public.document_records WHERE tenant_id = 'b2700000-0000-4000-8000-000000000002'), 0, 'another tenant receives no document data');
SELECT is((SELECT count(*)::INTEGER FROM public.document_attachments WHERE tenant_id = 'a1700000-0000-4000-8000-000000000001'), 1, 'one verified attachment is recorded for the tenant');
SELECT is((SELECT count(*)::INTEGER FROM public.document_attachments WHERE tenant_id = 'b2700000-0000-4000-8000-000000000002'), 0, 'another tenant receives no attachment metadata');
SELECT is((SELECT count(*)::INTEGER FROM public.document_workflow_events WHERE tenant_id = 'a1700000-0000-4000-8000-000000000001' AND document_id = 'a1700000-0000-4000-8000-000000000031'), 5, 'registration, review, approval, attachment, and archive events are retained');

SELECT * FROM finish();
ROLLBACK;
