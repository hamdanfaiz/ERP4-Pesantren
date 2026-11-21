BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(50);

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('c3900000-0000-4000-8000-000000000001', 'crm-broadcast-a-test', 'CRM Broadcast A Test', 'active'),
  ('c4900000-0000-4000-8000-000000000002', 'crm-broadcast-b-test', 'CRM Broadcast B Test', 'active');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c3900000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-broadcast-admin-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c3900000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-broadcast-denied@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c4900000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-broadcast-admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('c3900000-0000-4000-8000-000000000011', 'c3900000-0000-4000-8000-000000000001', 'crm-broadcast-admin-a@test.invalid', 'CRM Broadcast Admin A', 'admin', 'active', '{}'),
  ('c3900000-0000-4000-8000-000000000012', 'c3900000-0000-4000-8000-000000000001', 'crm-broadcast-denied@test.invalid', 'CRM Broadcast Denied', 'admin', 'active', '{"crm":false}'),
  ('c4900000-0000-4000-8000-000000000021', 'c4900000-0000-4000-8000-000000000002', 'crm-broadcast-admin-b@test.invalid', 'CRM Broadcast Admin B', 'admin', 'active', '{}');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_broadcast_requests'::regclass), 'broadcast requests enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.crm_broadcast_requests'::regclass), 'broadcast requests force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_broadcast_recipients'::regclass), 'broadcast recipients enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.crm_broadcast_recipients'::regclass), 'broadcast recipients force RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.crm_broadcast_requests', 'SELECT'), 'anon cannot read broadcast requests');
SELECT ok(NOT has_table_privilege('authenticated', 'public.crm_broadcast_recipients', 'SELECT'), 'browser users cannot read recipients directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.crm_broadcast_requests', 'INSERT'), 'browser users cannot create broadcast requests');
SELECT ok(has_table_privilege('service_role', 'public.crm_broadcast_requests', 'SELECT,INSERT,UPDATE'), 'server receives explicit request privileges');
SELECT ok(has_table_privilege('service_role', 'public.crm_broadcast_recipients', 'SELECT,INSERT,UPDATE'), 'server receives explicit recipient privileges');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.reserve_tenant_crm_broadcast(uuid,uuid,text,uuid,bytea,uuid[])'), 'EXECUTE'), 'server can reserve a broadcast');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.get_tenant_crm_broadcast_status(uuid,uuid,text,uuid)'), 'EXECUTE'), 'server can read its tenant broadcast status');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.reserve_tenant_crm_broadcast(uuid,uuid,text,uuid,bytea,uuid[])'), 'EXECUTE'), 'browser users cannot reserve a broadcast');
SELECT ok(NOT has_function_privilege('anon', to_regprocedure('public.get_tenant_crm_broadcast_status(uuid,uuid,text,uuid)'), 'EXECUTE'), 'anonymous users cannot read broadcast status');

SET LOCAL ROLE service_role;
SELECT is(public.manage_tenant_crm_contact(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000301', 'c3900000-0000-4000-8000-000000000101', 'create',
  '{"contactType":"prospect","name":"Calon Wali Broadcast A","email":"broadcast-a@example.test","phone":"08123456789","lifecycleStage":"lead","marketingConsent":"granted","consentSource":"Formulir uji"}'::jsonb
)->>'alreadyApplied', 'false', 'Admin creates a marketing-consented tenant contact');
SELECT is(public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', decode(repeat('a', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)->>'created', 'true', 'first request reserves the campaign before external send');
SELECT is(public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', decode(repeat('a', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)->>'created', 'false', 'retry cannot reserve or send an existing campaign again');
SELECT is(public.get_tenant_crm_broadcast_status(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401'
)->>'status', 'processing', 'reserved campaign status is visible to its actor');
SELECT throws_ok($$SELECT public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', decode(repeat('f', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)$$, '23505', 'ID permintaan siaran telah dipakai untuk payload berbeda', 'request id cannot be reused with a different payload');
SELECT throws_ok($$SELECT public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000499', decode(repeat('b', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101','c3900000-0000-4000-8000-000000000101']::UUID[]
)$$, '22023', 'Penerima siaran CRM duplikat', 'duplicate recipients are rejected');

SELECT is(public.claim_tenant_crm_broadcast_recipient(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', 'c3900000-0000-4000-8000-000000000101'
)->>'claimed', 'true', 'only the first worker claims a pending recipient');
SELECT is(public.claim_tenant_crm_broadcast_recipient(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', 'c3900000-0000-4000-8000-000000000101'
)->>'claimed', 'false', 'a duplicate worker cannot claim an in-flight recipient');
SELECT is(public.finish_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401'
)->>'status', 'processing', 'in-flight campaigns remain resumable instead of finalizing early');
SELECT is(public.record_tenant_crm_broadcast_delivery(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', 'c3900000-0000-4000-8000-000000000101',
  'sent', 'openwa-message-001', NULL
)->>'alreadyApplied', 'false', 'provider acceptance is persisted');
SELECT is(public.mark_tenant_crm_broadcast_interaction_logged(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', 'c3900000-0000-4000-8000-000000000101', TRUE
)->>'interactionLogged', 'true', 'successful delivery audit is recorded');
SELECT is(public.finish_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401'
)->>'status', 'completed', 'fully resolved campaign is completed');
SELECT is(public.get_tenant_crm_broadcast_status(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401'
)->>'sent', '1', 'status includes persisted delivery totals');
SELECT is(public.claim_tenant_crm_broadcast_recipient(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000401', 'c3900000-0000-4000-8000-000000000101'
)->>'claimed', 'false', 'completed campaigns cannot be resent');
SELECT throws_ok($$DELETE FROM public.crm_broadcast_recipients
  WHERE tenant_id = 'c3900000-0000-4000-8000-000000000001'
    AND client_request_id = 'c3900000-0000-4000-8000-000000000401'$$,
  '55000', 'Riwayat penerima siaran CRM tidak dapat dihapus', 'recipient history is append-only');
SELECT throws_ok($$DELETE FROM public.crm_broadcast_requests
  WHERE tenant_id = 'c3900000-0000-4000-8000-000000000001'
    AND client_request_id = 'c3900000-0000-4000-8000-000000000401'$$,
  '55000', 'Riwayat siaran CRM tidak dapat dihapus', 'campaign history is append-only');

SELECT is(public.manage_tenant_crm_contact(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000302', 'c3900000-0000-4000-8000-000000000102', 'create',
  '{"contactType":"prospect","name":"Calon Wali Broadcast B","email":"broadcast-b@example.test","phone":"08123456780","lifecycleStage":"lead","marketingConsent":"granted","consentSource":"Formulir uji"}'::jsonb
)->>'alreadyApplied', 'false', 'second marketing-consented contact is available for revocation test');
SELECT is(public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000402', decode(repeat('b', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000102']::UUID[]
)->>'created', 'true', 'second request reserves before consent is checked again');
SELECT is(public.manage_tenant_crm_contact(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000303', 'c3900000-0000-4000-8000-000000000102', 'update',
  '{"contactType":"prospect","name":"Calon Wali Broadcast B","email":"broadcast-b@example.test","phone":"08123456780","lifecycleStage":"lead","marketingConsent":"revoked","consentSource":"Pencabutan uji"}'::jsonb
)->>'alreadyApplied', 'false', 'recipient withdraws marketing consent');
SELECT is(public.claim_tenant_crm_broadcast_recipient(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000402', 'c3900000-0000-4000-8000-000000000102'
)->>'status', 'failed', 'revoked consent prevents sending at claim time');
SELECT is(public.finish_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000402'
)->>'status', 'completed', 'consent rejection is a resolved recipient outcome');
SELECT is(public.manage_tenant_crm_contact(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000304', 'c3900000-0000-4000-8000-000000000103', 'create',
  '{"contactType":"prospect","name":"Kontak Tanpa WhatsApp","email":"broadcast-c@example.test","phone":"nophone","lifecycleStage":"lead","marketingConsent":"granted","consentSource":"Formulir uji"}'::jsonb
)->>'alreadyApplied', 'false', 'contact with invalid phone remains a valid CRM record');
SELECT is(public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000406', decode(repeat('f', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000103']::UUID[]
)->>'created', 'true', 'invalid phone recipient can be recorded without sending');
SELECT is(public.claim_tenant_crm_broadcast_recipient(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000406', 'c3900000-0000-4000-8000-000000000103'
)->>'claimed', 'true', 'invalid phone recipient gets a durable claim');
SELECT is(public.record_tenant_crm_broadcast_delivery(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000406', 'c3900000-0000-4000-8000-000000000103',
  'failed', NULL, 'invalid_recipient'
)->>'status', 'failed', 'invalid phone is recorded as a resolved no-send outcome');
SELECT is(public.finish_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000406'
)->>'status', 'completed', 'invalid phone does not block campaign completion');

SELECT throws_ok($SELECT public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000012', 'admin',
  'c3900000-0000-4000-8000-000000000404', decode(repeat('d', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)$, '42501', 'Akses aktif Admin ke CRM diperlukan', 'explicitly denied CRM permission is enforced');
SELECT throws_ok($$SELECT public.reserve_tenant_crm_broadcast(
  'c4900000-0000-4000-8000-000000000002', 'c4900000-0000-4000-8000-000000000021', 'admin',
  'c4900000-0000-4000-8000-000000000405', decode(repeat('e', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)$$, '42501', 'Sebagian kontak tidak berada pada tenant ini atau tidak menyetujui pemasaran', 'cross-tenant contacts cannot be reserved');
SELECT throws_ok($$SELECT public.get_tenant_crm_broadcast_status(
  'c4900000-0000-4000-8000-000000000002', 'c4900000-0000-4000-8000-000000000021', 'admin',
  'c3900000-0000-4000-8000-000000000401'
)$$, 'P0002', 'Permintaan siaran CRM tidak ditemukan', 'tenant B cannot inspect tenant A campaign');

SELECT is(public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000403', decode(repeat('c', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)->>'created', 'true', 'third request reserves for ambiguous delivery test');
SELECT is(public.claim_tenant_crm_broadcast_recipient(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000403', 'c3900000-0000-4000-8000-000000000101'
)->>'claimed', 'true', 'ambiguous request is claimed exactly once');
SELECT is(public.record_tenant_crm_broadcast_delivery(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000403', 'c3900000-0000-4000-8000-000000000101',
  'unknown', NULL, 'delivery_unknown'
)->>'status', 'unknown', 'ambiguous provider response is recorded as unknown');
SELECT is(public.finish_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000403'
)->>'status', 'uncertain', 'campaign with ambiguous delivery is not marked complete');
SELECT is(public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000403', decode(repeat('c', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)->>'created', 'false', 'uncertain requests are still idempotent and never resent');
SELECT is(public.get_tenant_crm_broadcast_status(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000403'
)->>'unknown', '1', 'status preserves the unknown recipient outcome');
SELECT is(public.claim_tenant_crm_broadcast_recipient(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000011', 'admin',
  'c3900000-0000-4000-8000-000000000403', 'c3900000-0000-4000-8000-000000000101'
)->>'claimed', 'false', 'uncertain campaign cannot retry external delivery');
SELECT throws_ok($$SELECT public.reserve_tenant_crm_broadcast(
  'c3900000-0000-4000-8000-000000000001', 'c3900000-0000-4000-8000-000000000012', 'admin',
  'c3900000-0000-4000-8000-000000000403', decode(repeat('c', 64), 'hex'),
  ARRAY['c3900000-0000-4000-8000-000000000101']::UUID[]
)$$, '23505', 'ID permintaan siaran telah dipakai untuk payload berbeda', 'a different actor cannot reuse the campaign request');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
