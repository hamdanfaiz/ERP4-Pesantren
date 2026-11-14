-- Tenant admins can save CBT defaults through a service-only, optimistic-concurrency RPC.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(21);

INSERT INTO public.tenants(id,slug,name,status) VALUES
  ('e2500000-0000-4000-8000-000000000009','cbt-write-one','CBT Write One','active'),
  ('e2500000-0000-4000-8000-000000000019','cbt-write-two','CBT Write Two','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2500000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-write-admin@test.invalid','',now(),'{}','{}',now(),now()),
  ('e2500000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-write-teacher@test.invalid','',now(),'{}','{}',now(),now()),
  ('e2500000-0000-4000-8000-000000000013','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-write-no-module@test.invalid','',now(),'{}','{}',now(),now()),
  ('e2500000-0000-4000-8000-000000000021','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cbt-write-other@test.invalid','',now(),'{}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2500000-0000-4000-8000-000000000011','e2500000-0000-4000-8000-000000000009','cbt-write-admin@test.invalid','CBT Write Admin','admin','active','{"cbt":true}'),
  ('e2500000-0000-4000-8000-000000000012','e2500000-0000-4000-8000-000000000009','cbt-write-teacher@test.invalid','CBT Write Teacher','ustadz','active','{"cbt":true}'),
  ('e2500000-0000-4000-8000-000000000013','e2500000-0000-4000-8000-000000000009','cbt-write-no-module@test.invalid','CBT No Module','admin','active','{"cbt":false}'),
  ('e2500000-0000-4000-8000-000000000021','e2500000-0000-4000-8000-000000000019','cbt-write-other@test.invalid','Other Tenant Admin','admin','active','{"cbt":true}');

CREATE TEMP TABLE cbt_write_payload AS SELECT jsonb_build_object(
  'autoGrading',true,'shuffleQuestions',true,'correctPoints',1.5,'wrongPoints',-0.25,'blankPoints',0
) AS payload;
GRANT SELECT ON cbt_write_payload TO service_role;
SET LOCAL ROLE service_role;

SELECT is(public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',NULL,
  (SELECT payload FROM cbt_write_payload)
)->>'saved','true','first settings save inserts tenant defaults');
SELECT is((SELECT shuffle_questions FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),true,'shuffle default is persisted');
SELECT is((SELECT correct_points FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),1.5::NUMERIC,'correct score is persisted');
SELECT is((SELECT wrong_points FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),-0.25::NUMERIC,'negative wrong score is persisted');
SELECT is((SELECT blank_points FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),0::NUMERIC,'blank score is persisted');
SELECT is((SELECT auto_grading FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),true,'unsupported manual grading remains disabled');
SELECT is((SELECT updated_by FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),'e2500000-0000-4000-8000-000000000011'::UUID,'actor is recorded');

CREATE TEMP TABLE cbt_first_stamp AS SELECT updated_at FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009';
GRANT SELECT ON cbt_first_stamp TO service_role;
SELECT is(public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
  (SELECT updated_at FROM cbt_first_stamp),
  jsonb_set((SELECT payload FROM cbt_write_payload),'{shuffleQuestions}','false')
)->>'saved','true','current timestamp allows a deliberate update');
SELECT is((SELECT shuffle_questions FROM public.cbt_tenant_settings WHERE tenant_id='e2500000-0000-4000-8000-000000000009'),false,'updated setting is stored');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',
  (SELECT updated_at FROM cbt_first_stamp),(SELECT payload FROM cbt_write_payload)
)$$,'PT409','Pengaturan CBT berubah; muat ulang sebelum menyimpan','stale settings cannot overwrite a newer admin change');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000019','e2500000-0000-4000-8000-000000000021',
  (SELECT updated_at FROM cbt_first_stamp),(SELECT payload FROM cbt_write_payload)
)$$,'PT409','Pengaturan CBT berubah sejak dimuat; muat ulang sebelum menyimpan','expected timestamp cannot create a missing row');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000021',NULL,
  (SELECT payload FROM cbt_write_payload)
)$$,'42501','Pengaturan CBT hanya dapat diubah Admin tenant yang berwenang','cross-tenant actor is rejected');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000012',NULL,
  (SELECT payload FROM cbt_write_payload)
)$$,'42501','Pengaturan CBT hanya dapat diubah Admin tenant yang berwenang','non-admin actor is rejected');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000013',NULL,
  (SELECT payload FROM cbt_write_payload)
)$$,'42501','Pengaturan CBT hanya dapat diubah Admin tenant yang berwenang','admin without CBT permission is rejected');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',NULL,
  jsonb_set((SELECT payload FROM cbt_write_payload),'{autoGrading}','false')
)$$,'22023','Jenis nilai pengaturan CBT tidak valid atau kebijakan penilaian belum didukung','manual grading cannot be enabled before its runtime exists');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',NULL,
  jsonb_set((SELECT payload FROM cbt_write_payload),'{correctPoints}','1.001')
)$$,'22023','Nilai aturan CBT harus berada pada rentang dan presisi yang didukung','score precision is validated before numeric column rounding');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',NULL,
  jsonb_set((SELECT payload FROM cbt_write_payload),'{wrongPoints}','-101')
)$$,'22023','Nilai aturan CBT harus berada pada rentang dan presisi yang didukung','out-of-range score is rejected');
SELECT throws_ok($$SELECT public.save_cbt_tenant_settings(
  'e2500000-0000-4000-8000-000000000009','e2500000-0000-4000-8000-000000000011',NULL,
  (SELECT payload FROM cbt_write_payload) || '{"subjects":[]}'::JSONB
)$$,'22023','Pengaturan CBT tidak sesuai format','unexpected client fields are rejected');

SELECT ok(NOT has_function_privilege('anon','public.save_cbt_tenant_settings(uuid,uuid,timestamptz,jsonb)','EXECUTE'),'anon cannot execute the settings RPC');
SELECT ok(NOT has_function_privilege('authenticated','public.save_cbt_tenant_settings(uuid,uuid,timestamptz,jsonb)','EXECUTE'),'authenticated cannot execute the settings RPC directly');
SELECT ok(has_function_privilege('service_role','public.save_cbt_tenant_settings(uuid,uuid,timestamptz,jsonb)','EXECUTE'),'server service role can execute the settings RPC');

SELECT * FROM finish();
ROLLBACK;
