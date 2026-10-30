-- Admin-created PPDB candidate contract. All fixtures are synthetic and rolled back.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(21);

INSERT INTO public.tenants(id, slug, name, status) VALUES
  ('c7100000-0000-4000-8000-000000000001', 'ppdb-admin-create-a-test', 'PPDB Admin Create A', 'active'),
  ('c7100000-0000-4000-8000-000000000002', 'ppdb-admin-create-b-test', 'PPDB Admin Create B', 'active');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c7100000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ppdb-create-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('c7100000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ppdb-create-disabled@test.invalid','',now(),'{}','{}',now(),now()),
  ('c7100000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ppdb-create-wali@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('c7100000-0000-4000-8000-000000000011','c7100000-0000-4000-8000-000000000001','ppdb-create-admin@test.invalid','PPDB Admin','admin','active','{"ppdb":true}'),
  ('c7100000-0000-4000-8000-000000000012','c7100000-0000-4000-8000-000000000001','ppdb-create-disabled@test.invalid','PPDB Admin Disabled','admin','active','{"ppdb":false}'),
  ('c7100000-0000-4000-8000-000000000013','c7100000-0000-4000-8000-000000000001','ppdb-create-wali@test.invalid','PPDB Wali','wali_santri','active','{"ppdb":true}');

SELECT ok(NOT has_function_privilege('anon','public.create_admin_ppdb_candidates_batch(uuid,uuid,text,uuid,text,jsonb)','EXECUTE'), 'anonymous clients cannot invoke the Admin candidate RPC');
SELECT ok(NOT has_function_privilege('authenticated','public.create_admin_ppdb_candidates_batch(uuid,uuid,text,uuid,text,jsonb)','EXECUTE'), 'browser sessions cannot invoke the service-only candidate RPC');
SELECT ok(has_function_privilege('service_role','public.create_admin_ppdb_candidates_batch(uuid,uuid,text,uuid,text,jsonb)','EXECUTE'), 'trusted server can invoke the candidate RPC');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.ppdb_candidate_creation_requests'::regclass), 'request records enforce RLS');
SELECT ok(NOT has_table_privilege('anon','public.ppdb_candidate_creation_requests','SELECT'), 'anonymous clients cannot read request records');
SELECT ok(NOT has_table_privilege('authenticated','public.ppdb_candidate_creation_requests','SELECT'), 'browser clients cannot read request records');
SELECT ok(has_table_privilege('service_role','public.ppdb_candidate_creation_requests','SELECT,INSERT'), 'trusted server can read and append idempotency records');
SELECT ok(NOT has_table_privilege('service_role','public.ppdb_candidate_creation_requests','UPDATE'), 'request records cannot be rewritten by the server role');
SELECT ok(NOT has_table_privilege('service_role','public.ppdb_candidate_creation_requests','DELETE'), 'request records cannot be deleted by the server role');

SET LOCAL ROLE service_role;

SELECT is(
  public.create_admin_ppdb_candidates_batch(
    'c7100000-0000-4000-8000-000000000001','c7100000-0000-4000-8000-000000000011','admin',
    'c7100000-0000-4000-8000-000000000501','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    jsonb_build_array(jsonb_build_object(
      'candidateId','c7100000-0000-4000-8000-000000000101','registrationId','PPDB-A-001',
      'candidate',jsonb_build_object('name','Calon Santri Uji','previousSchool','Sekolah Uji','grade','VII',
        'phone','081234567890','whatsappPhone','081234567890','email','calon@test.invalid',
        'nikCiphertext',repeat('ab',44),'nikFingerprint',repeat('cd',32),'nisnCiphertext',repeat('ef',44),
        'nisnFingerprint',repeat('12',32),'pob','Bandung','dob','2012-01-02','address','Alamat Uji',
        'gender','L','fatherName','Ayah Uji','motherName','Ibu Uji'),
      'workflowData','{}'::jsonb,'documents','{}'::jsonb
    ))
  )->>'alreadyApplied','false','active Admin creates the first candidate');
SELECT is((SELECT created_by_user_id FROM public.candidates WHERE id='c7100000-0000-4000-8000-000000000101'), 'c7100000-0000-4000-8000-000000000011'::uuid, 'candidate records the creating Admin');
SELECT is((SELECT count(*)::int FROM public.identity_claims WHERE tenant_id='c7100000-0000-4000-8000-000000000001' AND entity_id='c7100000-0000-4000-8000-000000000101'), 2, 'NIK and NISN uniqueness claims are created atomically');
SELECT is((SELECT count(*)::int FROM public.ppdb_candidate_creation_requests WHERE tenant_id='c7100000-0000-4000-8000-000000000001'), 1, 'successful write records an idempotency request');
SELECT is(
  public.create_admin_ppdb_candidates_batch(
    'c7100000-0000-4000-8000-000000000001','c7100000-0000-4000-8000-000000000011','admin',
    'c7100000-0000-4000-8000-000000000501','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    jsonb_build_array(jsonb_build_object(
      'candidateId','c7100000-0000-4000-8000-000000000999','registrationId','PPDB-A-001',
      'candidate',jsonb_build_object('name','Calon Santri Uji','previousSchool','Sekolah Uji','grade','VII',
        'phone','081234567890','whatsappPhone','081234567890','email','calon@test.invalid',
        'nikCiphertext',repeat('ab',44),'nikFingerprint',repeat('cd',32),'nisnCiphertext',repeat('ef',44),
        'nisnFingerprint',repeat('12',32),'pob','Bandung','dob','2012-01-02','address','Alamat Uji',
        'gender','L','fatherName','Ayah Uji','motherName','Ibu Uji'),
      'workflowData','{}'::jsonb,'documents','{}'::jsonb
    ))
  )->>'alreadyApplied','true','same actor and payload retry replays the stored result');
SELECT is((SELECT count(*)::int FROM public.candidates WHERE tenant_id='c7100000-0000-4000-8000-000000000001'), 1, 'retry does not create a duplicate candidate');
SELECT throws_ok(
  $$SELECT public.create_admin_ppdb_candidates_batch(
    'c7100000-0000-4000-8000-000000000001','c7100000-0000-4000-8000-000000000011','admin',
    'c7100000-0000-4000-8000-000000000501','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    jsonb_build_array(jsonb_build_object('candidateId','c7100000-0000-4000-8000-000000000999','registrationId','PPDB-A-002',
      'candidate',jsonb_build_object('name','Calon Uji Berbeda'),'workflowData','{}'::jsonb,'documents','{}'::jsonb)))$$,
  '23505','PPDB request ID was already used for a different actor or payload','request key rejects a changed payload');
SELECT throws_ok(
  $$SELECT public.create_admin_ppdb_candidates_batch(
    'c7100000-0000-4000-8000-000000000001','c7100000-0000-4000-8000-000000000012','admin',
    'c7100000-0000-4000-8000-000000000502','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    jsonb_build_array(jsonb_build_object('candidateId','c7100000-0000-4000-8000-000000000190','registrationId','BLOCKED',
      'candidate','{}'::jsonb,'workflowData','{}'::jsonb,'documents','{}'::jsonb)))$$,
  '42501','Active Admin PPDB permission is required','Admin without PPDB permission is rejected');
SELECT throws_ok(
  $$SELECT public.create_admin_ppdb_candidates_batch(
    'c7100000-0000-4000-8000-000000000002','c7100000-0000-4000-8000-000000000011','admin',
    'c7100000-0000-4000-8000-000000000503','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    jsonb_build_array(jsonb_build_object('candidateId','c7100000-0000-4000-8000-000000000190','registrationId','BLOCKED',
      'candidate','{}'::jsonb,'workflowData','{}'::jsonb,'documents','{}'::jsonb)))$$,
  '42501','Active Admin PPDB permission is required','Admin cannot write to another tenant');
SELECT throws_ok(
  $$SELECT public.create_admin_ppdb_candidates_batch(
    'c7100000-0000-4000-8000-000000000001','c7100000-0000-4000-8000-000000000013','admin',
    'c7100000-0000-4000-8000-000000000504','eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    jsonb_build_array(jsonb_build_object('candidateId','c7100000-0000-4000-8000-000000000190','registrationId','BLOCKED',
      'candidate','{}'::jsonb,'workflowData','{}'::jsonb,'documents','{}'::jsonb)))$$,
  '42501','Active Admin PPDB permission is required','Wali role cannot be asserted as Admin');
SELECT throws_ok(
  $$SELECT public.create_admin_ppdb_candidates_batch(
    'c7100000-0000-4000-8000-000000000001','c7100000-0000-4000-8000-000000000011','admin',
    'c7100000-0000-4000-8000-000000000505','ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    jsonb_build_array(
      jsonb_build_object('candidateId','c7100000-0000-4000-8000-000000000102','registrationId','PPDB-A-002',
        'candidate',jsonb_build_object('name','Batch Atomic One','previousSchool','Sekolah Uji','grade','VII','phone','081234567890','whatsappPhone','081234567890','nikCiphertext',repeat('34',44),'nikFingerprint',repeat('56',32),'pob','Bandung','dob','2012-01-02','address','Alamat Uji','gender','P','fatherName','Ayah Uji','motherName','Ibu Uji'),
        'workflowData','{}'::jsonb,'documents','{}'::jsonb),
      jsonb_build_object('candidateId','c7100000-0000-4000-8000-000000000103','registrationId','PPDB-A-003',
        'candidate',jsonb_build_object('name','Batch Atomic Two','previousSchool','Sekolah Uji','grade','VII','phone','081234567891','whatsappPhone','081234567891','nikCiphertext',repeat('78',44),'nikFingerprint',repeat('cd',32),'pob','Bandung','dob','2012-01-03','address','Alamat Uji','gender','L','fatherName','Ayah Uji','motherName','Ibu Uji'),
        'workflowData','{}'::jsonb,'documents','{}'::jsonb)
    ))$$,
  '23505','duplicate key value violates unique constraint "candidates_nik_fingerprint_tenant_uq"','duplicate identity aborts the entire candidate batch');
SELECT is((SELECT count(*)::int FROM public.candidates WHERE tenant_id='c7100000-0000-4000-8000-000000000001'), 1, 'failed batch leaves no partial candidate behind');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
