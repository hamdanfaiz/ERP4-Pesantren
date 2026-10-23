-- Synthetic retry and changed-payload coverage for Donation/Waqf financial writes.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(25);

INSERT INTO public.tenants(id,slug,name,status)
VALUES('d9400000-0000-4000-8000-000000000009','donation-idempotency-test','Donation Idempotency Test','active');
INSERT INTO auth.users(
  id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
)
VALUES(
  'd9400000-0000-4000-8000-000000000011','00000000-0000-0000-0000-000000000000','authenticated','authenticated',
  'donation-idempotency@test.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()
);
INSERT INTO public.profiles(user_id,tenant_id,email,display_name,role,status,module_permissions)
VALUES(
  'd9400000-0000-4000-8000-000000000011','d9400000-0000-4000-8000-000000000009',
  'donation-idempotency@test.invalid','Donation Idempotency Admin','admin','active','{"donation":true}'
);

SET LOCAL ROLE service_role;

SELECT ok(
  has_function_privilege('service_role','public.manage_donation_campaign(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.manage_donation_donor(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.manage_waqf_asset(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.record_donation(uuid,uuid,jsonb)','EXECUTE')
  AND has_function_privilege('service_role','public.void_donation(uuid,uuid,uuid,text,uuid)','EXECUTE'),
  'service_role can call the payload-guarded donation RPCs'
);
SELECT ok(
  NOT has_function_privilege('service_role','public.record_donation_pre_payload_guard(uuid,uuid,jsonb)','EXECUTE')
  AND NOT has_function_privilege('service_role','public.void_donation_pre_payload_guard(uuid,uuid,uuid,text,uuid)','EXECUTE'),
  'service_role cannot bypass the donation idempotency wrappers'
);

SELECT set_config(
  'erp4.donation_campaign_result',
  public.manage_donation_campaign(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","title":"Beasiswa Santri","fundType":"infaq","description":"Bantuan pendidikan","targetAmount":1000000,"endDate":null,"status":"active","clientRequestId":"d9400000-0000-4000-8000-000000000501"}'::jsonb
  )::text,
  true
);
SELECT is(current_setting('erp4.donation_campaign_result')::jsonb->>'replayed','false','campaign creation commits a new request');
SELECT is(
  (public.manage_donation_campaign(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","title":"Beasiswa Santri","fundType":"infaq","description":"Bantuan pendidikan","targetAmount":1000000,"endDate":null,"status":"active","clientRequestId":"d9400000-0000-4000-8000-000000000501"}'::jsonb
  )->>'replayed'),
  'true',
  'identical campaign request replays its result'
);
SELECT throws_ok(
  $$SELECT public.manage_donation_campaign(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","title":"Payload Berbeda","fundType":"infaq","description":"Bantuan pendidikan","targetAmount":1000000,"endDate":null,"status":"active","clientRequestId":"d9400000-0000-4000-8000-000000000501"}'::jsonb
  )$$,
  '23505','Donation request ID was already used for a different mutation',
  'a campaign request key cannot be reused with changed content'
);
SELECT is((SELECT count(*)::int FROM public.donation_campaigns WHERE tenant_id='d9400000-0000-4000-8000-000000000009'),1,'campaign retry does not create a duplicate');

SELECT set_config(
  'erp4.donation_donor_result',
  public.manage_donation_donor(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","fullName":"Wali Santri","donorType":"parent","email":null,"phone":null,"notes":"","status":"active","clientRequestId":"d9400000-0000-4000-8000-000000000502"}'::jsonb
  )::text,
  true
);
SELECT is(current_setting('erp4.donation_donor_result')::jsonb->>'replayed','false','donor creation commits a new request');
SELECT is(
  (public.manage_donation_donor(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","fullName":"Wali Santri","donorType":"parent","email":null,"phone":null,"notes":"","status":"active","clientRequestId":"d9400000-0000-4000-8000-000000000502"}'::jsonb
  )->>'replayed'),
  'true',
  'identical donor request replays its result'
);
SELECT throws_ok(
  $$SELECT public.manage_donation_donor(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","fullName":"Donatur Berbeda","donorType":"parent","email":null,"phone":null,"notes":"","status":"active","clientRequestId":"d9400000-0000-4000-8000-000000000502"}'::jsonb
  )$$,
  '23505','Donation request ID was already used for a different mutation',
  'a donor request key cannot be reused with changed content'
);
SELECT is((SELECT count(*)::int FROM public.donation_donors WHERE tenant_id='d9400000-0000-4000-8000-000000000009'),1,'donor retry does not create a duplicate');

SELECT set_config(
  'erp4.donation_asset_result',
  public.manage_waqf_asset(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","assetCode":"WAF-001","name":"Tanah Wakaf","assetType":"land","location":"Pesantren","estimatedValue":50000000,"conditionLabel":"Baik","wakifName":"Hamba Allah","acquiredOn":"2026-10-23","status":"active","notes":"","clientRequestId":"d9400000-0000-4000-8000-000000000503"}'::jsonb
  )::text,
  true
);
SELECT is(current_setting('erp4.donation_asset_result')::jsonb->>'replayed','false','waqf asset creation commits a new request');
SELECT is(
  (public.manage_waqf_asset(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","assetCode":"WAF-001","name":"Tanah Wakaf","assetType":"land","location":"Pesantren","estimatedValue":50000000,"conditionLabel":"Baik","wakifName":"Hamba Allah","acquiredOn":"2026-10-23","status":"active","notes":"","clientRequestId":"d9400000-0000-4000-8000-000000000503"}'::jsonb
  )->>'replayed'),
  'true',
  'identical waqf request replays its result'
);
SELECT throws_ok(
  $$SELECT public.manage_waqf_asset(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"action":"create","assetCode":"WAF-001","name":"Tanah Wakaf","assetType":"land","location":"Pesantren","estimatedValue":60000000,"conditionLabel":"Baik","wakifName":"Hamba Allah","acquiredOn":"2026-10-23","status":"active","notes":"","clientRequestId":"d9400000-0000-4000-8000-000000000503"}'::jsonb
  )$$,
  '23505','Donation request ID was already used for a different mutation',
  'a waqf request key cannot be reused with changed content'
);
SELECT is((SELECT count(*)::int FROM public.waqf_assets WHERE tenant_id='d9400000-0000-4000-8000-000000000009'),1,'waqf retry does not create a duplicate asset');

SELECT set_config(
  'erp4.donation_record_result',
  public.record_donation(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"donorId":null,"donorName":"Donatur Umum","campaignId":null,"amount":100,"fundType":"infaq","paymentMethod":"cash","receivedAt":"2026-10-23T10:00:00Z","referenceNote":"","clientRequestId":"d9400000-0000-4000-8000-000000000504"}'::jsonb
  )::text,
  true
);
SELECT is(current_setting('erp4.donation_record_result')::jsonb->>'replayed','false','recording a donation allocates a new receipt');
SELECT is(
  (public.record_donation(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"donorId":null,"donorName":"Donatur Umum","campaignId":null,"amount":100,"fundType":"infaq","paymentMethod":"cash","receivedAt":"2026-10-23T10:00:00Z","referenceNote":"","clientRequestId":"d9400000-0000-4000-8000-000000000504"}'::jsonb
  )->>'replayed'),
  'true',
  'identical donation request replays the original receipt'
);
SELECT throws_ok(
  $$SELECT public.record_donation(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    '{"donorId":null,"donorName":"Donatur Umum","campaignId":null,"amount":200,"fundType":"infaq","paymentMethod":"cash","receivedAt":"2026-10-23T10:00:00Z","referenceNote":"","clientRequestId":"d9400000-0000-4000-8000-000000000504"}'::jsonb
  )$$,
  '23505','Donation request ID was already used for a different mutation',
  'a donation request key cannot be replayed with a different amount'
);
SELECT is((SELECT count(*)::int FROM public.donations WHERE tenant_id='d9400000-0000-4000-8000-000000000009'),1,'same receipt key records only one donation');
SELECT is(
  (SELECT last_number FROM public.donation_receipt_counters WHERE tenant_id='d9400000-0000-4000-8000-000000000009' AND receipt_year=2026),
  1::BIGINT,
  'retry does not consume a second receipt number'
);

SELECT set_config(
  'erp4.donation_void_result',
  public.void_donation(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    (current_setting('erp4.donation_record_result')::jsonb->>'id')::uuid,'Salah input','d9400000-0000-4000-8000-000000000505'
  )::text,
  true
);
SELECT is(current_setting('erp4.donation_void_result')::jsonb->>'replayed','false','voiding records a new audit event');
SELECT is(
  (public.void_donation(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    (current_setting('erp4.donation_record_result')::jsonb->>'id')::uuid,'Salah input','d9400000-0000-4000-8000-000000000505'
  )->>'replayed'),
  'true',
  'identical void request replays the original audit result'
);
SELECT throws_ok(
  $$SELECT public.void_donation(
    'd9400000-0000-4000-8000-000000000009','d9400000-0000-4000-8000-000000000011',
    (current_setting('erp4.donation_record_result')::jsonb->>'id')::uuid,'Alasan berbeda','d9400000-0000-4000-8000-000000000505'
  )$$,
  '23505','Donation request ID was already used for a different mutation',
  'a void request key cannot be reused with a changed cancellation reason'
);
SELECT is(
  (SELECT status FROM public.donations WHERE id=(current_setting('erp4.donation_record_result')::jsonb->>'id')::uuid),
  'voided',
  'void retry leaves donation in the already-voided state'
);
SELECT is(
  (SELECT count(*)::int FROM public.donation_audit_events WHERE tenant_id='d9400000-0000-4000-8000-000000000009' AND entity_type='donation'),
  2,
  'one creation and one void event are retained'
);
SELECT is(
  (SELECT count(*)::int FROM public.donation_mutation_requests WHERE tenant_id='d9400000-0000-4000-8000-000000000009'),
  5,
  'each Donation/Waqf mutation has one durable request receipt'
);

SELECT * FROM finish();
ROLLBACK;
