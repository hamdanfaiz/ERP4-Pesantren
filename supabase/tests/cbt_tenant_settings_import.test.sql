-- CBT settings import stays tenant-scoped, immutable on retry, and server-only.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(16);

INSERT INTO public.tenants(id,slug,name,status) VALUES
  ('e2400000-0000-4000-8000-000000000009','cbt-settings-one','CBT Settings One','active'),
  ('e2400000-0000-4000-8000-000000000019','cbt-settings-two','CBT Settings Two','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2400000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'cbt-settings-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('e2400000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'cbt-settings-teacher@test.invalid','',now(),'{}','{}',now(),now()),
  ('e2400000-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'cbt-settings-other-tenant@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2400000-0000-4000-8000-000000000011','e2400000-0000-4000-8000-000000000009',
   'cbt-settings-admin@test.invalid','CBT Settings Admin','admin','active','{"cbt":true}'),
  ('e2400000-0000-4000-8000-000000000012','e2400000-0000-4000-8000-000000000009',
   'cbt-settings-teacher@test.invalid','CBT Settings Teacher','ustadz','active','{"cbt":true}'),
  ('e2400000-0000-4000-8000-000000000021','e2400000-0000-4000-8000-000000000019',
   'cbt-settings-other-tenant@test.invalid','Other Tenant Admin','admin','active','{"cbt":true}');

CREATE TEMP TABLE cbt_settings_payload AS
SELECT jsonb_build_object(
  'subjects',jsonb_build_array('Matematika','Bahasa Indonesia'),
  'grades',jsonb_build_array('VII','VIII'),
  'templates',jsonb_build_array('Paket A','Paket B'),
  'autoGrading',true,'shuffleQuestions',false,
  'correctScore',1,'wrongScore',-0.25,'blankScore',0
) AS payload;
GRANT SELECT ON cbt_settings_payload TO service_role;
SET LOCAL ROLE service_role;

SELECT is(public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'pesantren-digital',repeat('a',64),(SELECT payload FROM cbt_settings_payload)
)->>'imported','true','first tenant settings snapshot imports');
SELECT is((SELECT subjects FROM public.cbt_tenant_settings WHERE tenant_id='e2400000-0000-4000-8000-000000000009'),
  ARRAY['Matematika','Bahasa Indonesia']::TEXT[],'subject list is preserved');
SELECT is((SELECT grades FROM public.cbt_tenant_settings WHERE tenant_id='e2400000-0000-4000-8000-000000000009'),
  ARRAY['VII','VIII']::TEXT[],'grade list is preserved');
SELECT is((SELECT wrong_points FROM public.cbt_tenant_settings WHERE tenant_id='e2400000-0000-4000-8000-000000000009'),
  -0.25::NUMERIC,'negative wrong-answer score is preserved exactly');
SELECT is(public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'pesantren-digital',repeat('a',64),(SELECT payload FROM cbt_settings_payload)
)->>'alreadyImported','true','identical retry returns the prior import');
SELECT throws_ok($$SELECT public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'pesantren-digital',repeat('b',64),(SELECT payload FROM cbt_settings_payload)
)$$,'23505','Pengaturan CBT Supabase sudah ada; rekonsiliasi manual diperlukan sebelum impor',
  'changed source cannot overwrite established tenant settings');
SELECT throws_ok($$SELECT public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'pesantren-digital',repeat('c',64),jsonb_set((SELECT payload FROM cbt_settings_payload),'{autoGrading}','false')
)$$,'22023','Kebijakan penilaian manual belum didukung oleh runtime CBT Supabase',
  'manual grading policy is blocked until its runtime exists');
SELECT throws_ok($$SELECT public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'pesantren-digital',repeat('d',64),jsonb_set((SELECT payload FROM cbt_settings_payload),'{subjects}','["Matematika","matematika"]')
)$$,'22023','Daftar subjects CBT berisi nilai duplikat','duplicate labels are rejected');
SELECT throws_ok($$SELECT public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000011',
  'pesantren-digital',repeat('1',64),jsonb_set((SELECT payload FROM cbt_settings_payload),'{correctScore}','1.001')
)$$,'22023','Nilai aturan CBT berada di luar batas yang didukung',
  'score precision is checked before numeric storage rounds it');
SELECT throws_ok($$SELECT public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000012',
  'pesantren-digital',repeat('e',64),(SELECT payload FROM cbt_settings_payload)
)$$,'42501','Impor pengaturan CBT memerlukan Admin tenant yang berwenang',
  'non-admin cannot import CBT configuration');
SELECT throws_ok($$SELECT public.import_legacy_cbt_settings(
  'e2400000-0000-4000-8000-000000000009','e2400000-0000-4000-8000-000000000021',
  'pesantren-digital',repeat('f',64),(SELECT payload FROM cbt_settings_payload)
)$$,'42501','Impor pengaturan CBT memerlukan Admin tenant yang berwenang',
  'admin from another tenant cannot import CBT settings');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.cbt_tenant_settings'::regclass),
  'CBT settings table forces row-level security');
SELECT ok(NOT has_table_privilege('anon','public.cbt_tenant_settings','SELECT'),
  'anonymous clients cannot read CBT settings');
SELECT ok(NOT has_table_privilege('authenticated','public.cbt_tenant_settings','UPDATE'),
  'authenticated clients cannot update CBT settings');
SELECT ok(NOT has_function_privilege('anon',
  'public.import_legacy_cbt_settings(uuid,uuid,text,text,jsonb)','EXECUTE'),
  'anonymous clients cannot invoke the import RPC');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.import_legacy_cbt_settings(uuid,uuid,text,text,jsonb)','EXECUTE'),
  'authenticated clients cannot invoke the import RPC');

SELECT * FROM finish();
ROLLBACK;
