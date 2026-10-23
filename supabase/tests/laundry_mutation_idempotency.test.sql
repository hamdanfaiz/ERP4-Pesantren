-- Synthetic checks for Laundry retry identity, payload conflicts, and committed writes.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(18);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('d1500000-0000-4000-8000-000000000009','laundry-idempotency-test','Laundry Idempotency Test','active');

INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES (
  'd1500000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'laundry-idempotency@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
);
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES ('d1500000-0000-4000-8000-000000000011','d1500000-0000-4000-8000-000000000009',
  'laundry-idempotency@test.invalid','Laundry Test Admin','admin','active','{"laundry":true}');

INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES ('d1500000-0000-4000-8000-000000000101','d1500000-0000-4000-8000-000000000009',
  'LID001','Laundry Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'd1500000-0000-4000-8000-000000000201','d1500000-0000-4000-8000-000000000009',
  'd1500000-0000-4000-8000-000000000101','9150000001','Laundry Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);

SELECT ok(to_regclass('public.laundry_mutation_requests') IS NOT NULL,'tenant-scoped Laundry mutation ledger exists');
SELECT ok((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='public.laundry_mutation_requests'::regclass),'Laundry mutation ledger forces RLS');
SELECT ok(has_function_privilege('service_role','public.create_tenant_laundry_order(uuid,uuid,uuid,numeric,integer,uuid)','EXECUTE'),'service role can call guarded create RPC');
SELECT ok(NOT has_function_privilege('service_role','public.create_tenant_laundry_order_pre_payload_guard(uuid,uuid,uuid,numeric,integer,uuid)','EXECUTE'),'service role cannot bypass the guarded create RPC');

CREATE TEMP TABLE laundry_idempotency_order ON COMMIT DROP AS
SELECT public.create_tenant_laundry_order(
  'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
  'd1500000-0000-4000-8000-000000000201',2.5,3,'d1500000-0000-4000-8000-000000000401'
) AS result;
GRANT SELECT ON laundry_idempotency_order TO service_role;
SET LOCAL ROLE service_role;

SELECT is((SELECT result->>'replayed' FROM laundry_idempotency_order),'false','first Laundry order request creates one order');
SELECT is(public.create_tenant_laundry_order(
  'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
  'd1500000-0000-4000-8000-000000000201',2.50,3,'d1500000-0000-4000-8000-000000000401'
)->>'replayed','true','same create request returns its original committed response');
SELECT is((SELECT count(*)::INTEGER FROM public.laundry_orders WHERE tenant_id='d1500000-0000-4000-8000-000000000009'),1,'create replay did not duplicate the order');
SELECT throws_ok(
  $$SELECT public.create_tenant_laundry_order(
    'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
    'd1500000-0000-4000-8000-000000000201',4.0,3,'d1500000-0000-4000-8000-000000000401'
  )$$,'23514','Laundry request ID reused with another actor, operation, or payload','same key cannot create another payload'
);
SELECT throws_ok(
  $$SELECT public.save_tenant_laundry_settings(
    'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
    20,15000,'d1500000-0000-4000-8000-000000000401'
  )$$,'23514','Laundry request ID reused with another actor, operation, or payload','request key cannot cross Laundry operations'
);

CREATE TEMP TABLE laundry_idempotency_transition ON COMMIT DROP AS
SELECT public.transition_tenant_laundry_order(
  'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
  (SELECT (result->>'id')::UUID FROM laundry_idempotency_order),'washing',
  'd1500000-0000-4000-8000-000000000402'
) AS result;
GRANT SELECT ON laundry_idempotency_transition TO service_role;
SELECT is((SELECT result->>'replayed' FROM laundry_idempotency_transition),'false','first transition advances order state');
SELECT is(public.transition_tenant_laundry_order(
  'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
  (SELECT (result->>'id')::UUID FROM laundry_idempotency_order),'washing',
  'd1500000-0000-4000-8000-000000000402'
)->>'replayed','true','same transition request returns original response');
SELECT throws_ok(
  $$SELECT public.transition_tenant_laundry_order(
    'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
    (SELECT (result->>'id')::UUID FROM laundry_idempotency_order),'ready',
    'd1500000-0000-4000-8000-000000000402'
  )$$,'23514','Laundry request ID reused with another actor, operation, or payload','same transition key cannot request another status'
);
SELECT is((SELECT count(*)::INTEGER FROM public.laundry_events
  WHERE tenant_id='d1500000-0000-4000-8000-000000000009' AND event_type='status_changed'),1,'transition replay records one status event');

SELECT is(public.save_tenant_laundry_settings(
  'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
  18,12000,'d1500000-0000-4000-8000-000000000403'
)->>'replayed','false','first settings request applies the policy');
SELECT is(public.save_tenant_laundry_settings(
  'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
  18,12000,'d1500000-0000-4000-8000-000000000403'
)->>'replayed','true','same settings request replays original response');
SELECT throws_ok(
  $$SELECT public.save_tenant_laundry_settings(
    'd1500000-0000-4000-8000-000000000009','d1500000-0000-4000-8000-000000000011',
    22,12000,'d1500000-0000-4000-8000-000000000403'
  )$$,'23514','Laundry request ID reused with another actor, operation, or payload','same settings key cannot overwrite with a new payload'
);
SELECT is((SELECT monthly_quota_kg::TEXT FROM public.laundry_settings WHERE tenant_id='d1500000-0000-4000-8000-000000000009'),
  '18.00','settings retry preserves the original saved value');
SELECT is((SELECT count(*)::INTEGER FROM public.laundry_events
  WHERE tenant_id='d1500000-0000-4000-8000-000000000009' AND event_type='settings_updated'),1,'settings replay records one audit event');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
