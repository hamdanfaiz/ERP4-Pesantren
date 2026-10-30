-- PPDB private document upload contract. Fixtures are synthetic and rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(29);

INSERT INTO public.tenants(id, slug, name, status) VALUES
  ('c7200000-0000-4000-8000-000000000001', 'ppdb-upload-a-test', 'PPDB Upload A', 'active'),
  ('c7200000-0000-4000-8000-000000000002', 'ppdb-upload-b-test', 'PPDB Upload B', 'active');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c7200000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ppdb-upload-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('c7200000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ppdb-upload-disabled@test.invalid','',now(),'{}','{}',now(),now()),
  ('c7200000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ppdb-upload-wali@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('c7200000-0000-4000-8000-000000000011','c7200000-0000-4000-8000-000000000001','ppdb-upload-admin@test.invalid','PPDB Upload Admin','admin','active','{"ppdb":true}'),
  ('c7200000-0000-4000-8000-000000000012','c7200000-0000-4000-8000-000000000001','ppdb-upload-disabled@test.invalid','PPDB Upload Disabled','admin','active','{"ppdb":false}'),
  ('c7200000-0000-4000-8000-000000000013','c7200000-0000-4000-8000-000000000001','ppdb-upload-wali@test.invalid','PPDB Upload Wali','wali_santri','active','{"ppdb":true}');
INSERT INTO public.candidates(id, tenant_id, registration_id, name) VALUES
  ('c7200000-0000-4000-8000-000000000101','c7200000-0000-4000-8000-000000000001','UPLOAD-A-001','Calon Santri Upload'),
  ('c7200000-0000-4000-8000-000000000201','c7200000-0000-4000-8000-000000000002','UPLOAD-B-001','Calon Santri Tenant Lain');

SELECT ok(NOT has_function_privilege('anon','public.register_admin_ppdb_document_upload(uuid,uuid,text,uuid,text,uuid,text,text,text)','EXECUTE'), 'anonymous clients cannot invoke the upload RPC');
SELECT ok(NOT has_function_privilege('authenticated','public.register_admin_ppdb_document_upload(uuid,uuid,text,uuid,text,uuid,text,text,text)','EXECUTE'), 'browser clients cannot invoke the upload RPC');
SELECT ok(has_function_privilege('service_role','public.register_admin_ppdb_document_upload(uuid,uuid,text,uuid,text,uuid,text,text,text)','EXECUTE'), 'trusted server can invoke the upload RPC');

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.ppdb_document_upload_requests'::regclass), 'upload idempotency rows enforce RLS');
SELECT ok(NOT has_table_privilege('anon','public.ppdb_document_upload_requests','SELECT'), 'anonymous clients cannot read upload requests');
SELECT ok(NOT has_table_privilege('authenticated','public.ppdb_document_upload_requests','SELECT'), 'browser clients cannot read upload requests');
SELECT ok(has_table_privilege('service_role','public.ppdb_document_upload_requests','SELECT,INSERT'), 'trusted server can read and append upload requests');
SELECT ok(NOT has_table_privilege('service_role','public.ppdb_document_upload_requests','UPDATE'), 'upload requests cannot be rewritten');
SELECT ok(NOT has_table_privilege('service_role','public.ppdb_document_upload_requests','DELETE'), 'upload requests cannot be deleted');

SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.ppdb_document_upload_events'::regclass), 'upload audit rows enforce RLS');
SELECT ok(NOT has_table_privilege('anon','public.ppdb_document_upload_events','SELECT'), 'anonymous clients cannot read upload audit rows');
SELECT ok(NOT has_table_privilege('authenticated','public.ppdb_document_upload_events','SELECT'), 'browser clients cannot read upload audit rows');
SELECT ok(has_table_privilege('service_role','public.ppdb_document_upload_events','SELECT,INSERT'), 'trusted server can read and append upload audit rows');
SELECT ok(NOT has_table_privilege('service_role','public.ppdb_document_upload_events','UPDATE'), 'upload audit rows cannot be rewritten');
SELECT ok(NOT has_table_privilege('service_role','public.ppdb_document_upload_events','DELETE'), 'upload audit rows cannot be deleted');
SELECT is((SELECT public::text FROM storage.buckets WHERE id='ppdb-documents'), 'false', 'PPDB attachments remain in a private bucket');

SET LOCAL ROLE service_role;

SELECT is(
  public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000011','admin',
    'c7200000-0000-4000-8000-000000000101','kk','c7200000-0000-4000-8000-000000000501',
    repeat('a',64),'application/pdf',
    'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000101/kk-c7200000-0000-4000-8000-000000000601.pdf'
  )->>'alreadyApplied','false','Admin links the first private attachment');
SELECT is((SELECT kk_path FROM public.candidate_documents WHERE tenant_id='c7200000-0000-4000-8000-000000000001' AND candidate_id='c7200000-0000-4000-8000-000000000101'), 'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000101/kk-c7200000-0000-4000-8000-000000000601.pdf', 'document metadata is bound to the same tenant and candidate');
SELECT ok((SELECT kk FROM public.candidate_documents WHERE tenant_id='c7200000-0000-4000-8000-000000000001' AND candidate_id='c7200000-0000-4000-8000-000000000101'), 'the document status is set only with a stored path');
SELECT is((SELECT count(*)::int FROM public.ppdb_document_upload_events WHERE tenant_id='c7200000-0000-4000-8000-000000000001'), 1, 'successful upload creates one audit event');
SELECT is((SELECT actor_user_id FROM public.ppdb_document_upload_events WHERE tenant_id='c7200000-0000-4000-8000-000000000001'), 'c7200000-0000-4000-8000-000000000011'::uuid, 'audit event records the Admin actor');
SELECT is(
  public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000011','admin',
    'c7200000-0000-4000-8000-000000000101','kk','c7200000-0000-4000-8000-000000000501',
    repeat('a',64),'application/pdf',
    'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000101/kk-c7200000-0000-4000-8000-000000000601.pdf'
  )->>'alreadyApplied','true','same request retry returns the committed attachment');
SELECT is((SELECT count(*)::int FROM public.ppdb_document_upload_events WHERE tenant_id='c7200000-0000-4000-8000-000000000001'), 1, 'idempotent retry does not duplicate audit events');

SELECT throws_ok(
  $$SELECT public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000011','admin',
    'c7200000-0000-4000-8000-000000000101','kk','c7200000-0000-4000-8000-000000000501',
    repeat('b',64),'application/pdf',
    'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000101/kk-c7200000-0000-4000-8000-000000000602.pdf')$$,
  '23505','PPDB upload request ID was already used for another file','request ID rejects a changed file');
SELECT throws_ok(
  $$SELECT public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000011','admin',
    'c7200000-0000-4000-8000-000000000101','kk','c7200000-0000-4000-8000-000000000502',
    repeat('b',64),'application/pdf',
    'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000101/kk-c7200000-0000-4000-8000-000000000602.pdf')$$,
  '23505','PPDB document is already attached','a second request cannot silently replace an attachment');
SELECT throws_ok(
  $$SELECT public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000012','admin',
    'c7200000-0000-4000-8000-000000000101','birthCertificate','c7200000-0000-4000-8000-000000000503',
    repeat('c',64),'application/pdf',
    'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000101/birthCertificate-c7200000-0000-4000-8000-000000000601.pdf')$$,
  '42501','Active Admin PPDB permission is required','Admin without PPDB permission cannot attach documents');
SELECT throws_ok(
  $$SELECT public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000013','admin',
    'c7200000-0000-4000-8000-000000000101','birthCertificate','c7200000-0000-4000-8000-000000000504',
    repeat('d',64),'application/pdf',
    'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000101/birthCertificate-c7200000-0000-4000-8000-000000000601.pdf')$$,
  '42501','Active Admin PPDB permission is required','Wali role cannot attach Admin PPDB documents');
SELECT throws_ok(
  $$SELECT public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000011','admin',
    'c7200000-0000-4000-8000-000000000201','birthCertificate','c7200000-0000-4000-8000-000000000505',
    repeat('e',64),'application/pdf',
    'c7200000-0000-4000-8000-000000000001/c7200000-0000-4000-8000-000000000201/birthCertificate-c7200000-0000-4000-8000-000000000601.pdf')$$,
  'P0002','PPDB candidate is unavailable','cross-tenant candidate IDs are rejected');
SELECT throws_ok(
  $$SELECT public.register_admin_ppdb_document_upload(
    'c7200000-0000-4000-8000-000000000001','c7200000-0000-4000-8000-000000000011','admin',
    'c7200000-0000-4000-8000-000000000101','birthCertificate','c7200000-0000-4000-8000-000000000506',
    repeat('f',64),'application/pdf','../other-tenant/file.pdf')$$,
  '22023','Invalid PPDB document path','object paths must match tenant, candidate, document type, and file ID');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
