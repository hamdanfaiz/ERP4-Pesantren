-- Healthcare request keys are idempotent only for the same actor and business payload.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(10);

INSERT INTO public.tenants(id,slug,name,status)
VALUES ('e2100000-0000-4000-8000-000000000009','healthcare-idempotency-test','Healthcare Idempotency Test','active');
INSERT INTO auth.users (
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) VALUES
  ('e2100000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'healthcare-admin-one@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('e2100000-0000-4000-8000-000000000012','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
   'healthcare-admin-two@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES
  ('e2100000-0000-4000-8000-000000000011','e2100000-0000-4000-8000-000000000009',
   'healthcare-admin-one@test.invalid','Healthcare Admin One','admin','active','{"healthcare":true}'),
  ('e2100000-0000-4000-8000-000000000012','e2100000-0000-4000-8000-000000000009',
   'healthcare-admin-two@test.invalid','Healthcare Admin Two','admin','active','{"healthcare":true}');
INSERT INTO public.candidates(id,tenant_id,registration_id,name,nik_ciphertext,nik_fingerprint)
VALUES ('e2100000-0000-4000-8000-000000000101','e2100000-0000-4000-8000-000000000009',
  'HID001','Healthcare Test Student',decode(repeat('ab',44),'hex'),decode(repeat('cd',32),'hex'));
INSERT INTO public.students(
  id,tenant_id,source_candidate_id,nis,name,gender,grade,nik_ciphertext,nik_fingerprint,status
) VALUES (
  'e2100000-0000-4000-8000-000000000201','e2100000-0000-4000-8000-000000000009',
  'e2100000-0000-4000-8000-000000000101','9210000001','Healthcare Test Student','L','VII',
  decode(repeat('34',44),'hex'),decode(repeat('56',32),'hex'),'active'
);

SET LOCAL ROLE service_role;

SELECT is(
  public.create_healthcare_medicine(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000011',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000501","name":"Parasetamol","category":"Analgesik","initialStock":10,"minStock":2,"unit":"tablet","expiresOn":"2027-12-31"}'::jsonb
  )->>'alreadyApplied','false','first medicine request creates one inventory item'
);
SELECT is(
  public.adjust_healthcare_stock(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000011',
    (SELECT id FROM public.healthcare_medicines WHERE tenant_id='e2100000-0000-4000-8000-000000000009' AND name='Parasetamol'),
    2,'Penerimaan tambahan','e2100000-0000-4000-8000-000000000502'
  )->>'stockQuantity','12','later stock movement changes the current balance'
);
SELECT is(
  public.create_healthcare_medicine(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000011',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000501","name":"Parasetamol","category":"Analgesik","initialStock":10,"minStock":2,"unit":"tablet","expiresOn":"2027-12-31"}'::jsonb
  )->>'alreadyApplied','true','identical medicine retry remains safe after stock changes'
);
SELECT throws_ok(
  $$SELECT public.create_healthcare_medicine(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000011',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000501","name":"Obat berbeda","category":"Analgesik","initialStock":10,"minStock":2,"unit":"tablet","expiresOn":"2027-12-31"}'::jsonb
  )$$,
  '23505','Healthcare medicine request ID was already used for a different mutation',
  'medicine key cannot be reused with changed fields'
);
SELECT throws_ok(
  $$SELECT public.create_healthcare_medicine(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000012',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000501","name":"Parasetamol","category":"Analgesik","initialStock":10,"minStock":2,"unit":"tablet","expiresOn":"2027-12-31"}'::jsonb
  )$$,
  '23505','Healthcare medicine request ID was already used for a different mutation',
  'another actor cannot replay a medicine creation key'
);

SELECT is(
  public.create_healthcare_visit(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000011',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000503","studentId":"e2100000-0000-4000-8000-000000000201","visitDate":"2026-10-23","visitTime":"10:30","complaint":"Demam","temperatureC":38.2,"diagnosis":"Demam ringan","actionTaken":"Istirahat dan observasi","status":"monitoring"}'::jsonb
  )->>'alreadyApplied','false','first healthcare visit request creates one visit'
);
SELECT is(
  public.create_healthcare_visit(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000011',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000503","studentId":"e2100000-0000-4000-8000-000000000201","visitDate":"2026-10-23","visitTime":"10:30","complaint":"Demam","temperatureC":38.2,"diagnosis":"Demam ringan","actionTaken":"Istirahat dan observasi","status":"monitoring"}'::jsonb
  )->>'alreadyApplied','true','identical healthcare visit retry replays'
);
SELECT throws_ok(
  $$SELECT public.create_healthcare_visit(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000011',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000503","studentId":"e2100000-0000-4000-8000-000000000201","visitDate":"2026-10-23","visitTime":"10:30","complaint":"Keluhan berbeda","temperatureC":38.2,"diagnosis":"Demam ringan","actionTaken":"Istirahat dan observasi","status":"monitoring"}'::jsonb
  )$$,
  '23505','Healthcare visit request ID was already used for a different mutation',
  'visit key cannot be reused with changed clinical data'
);
SELECT throws_ok(
  $$SELECT public.create_healthcare_visit(
    'e2100000-0000-4000-8000-000000000009','e2100000-0000-4000-8000-000000000012',
    '{"clientRequestId":"e2100000-0000-4000-8000-000000000503","studentId":"e2100000-0000-4000-8000-000000000201","visitDate":"2026-10-23","visitTime":"10:30","complaint":"Demam","temperatureC":38.2,"diagnosis":"Demam ringan","actionTaken":"Istirahat dan observasi","status":"monitoring"}'::jsonb
  )$$,
  '23505','Healthcare visit request ID was already used for a different mutation',
  'another actor cannot replay a healthcare visit key'
);
SELECT is(
  (SELECT count(*)::integer FROM public.healthcare_medicines
    WHERE tenant_id='e2100000-0000-4000-8000-000000000009')=1
  AND (SELECT count(*)::integer FROM public.healthcare_visits
    WHERE tenant_id='e2100000-0000-4000-8000-000000000009')=1,
  true,
  'retry conflicts do not create extra medicines or visits'
);

SELECT * FROM finish();
ROLLBACK;
