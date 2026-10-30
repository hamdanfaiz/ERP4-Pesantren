BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(42);

INSERT INTO public.tenants (id, slug, name, status) VALUES
  ('c1800000-0000-4000-8000-000000000001', 'crm-a-test', 'CRM A Test', 'active'),
  ('c2800000-0000-4000-8000-000000000002', 'crm-b-test', 'CRM B Test', 'active');
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) VALUES
  ('c1800000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-admin-a@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c1800000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-denied@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c1800000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-member@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c2800000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'crm-admin-b@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions) VALUES
  ('c1800000-0000-4000-8000-000000000011', 'c1800000-0000-4000-8000-000000000001', 'crm-admin-a@test.invalid', 'CRM Admin A', 'admin', 'active', '{}'),
  ('c1800000-0000-4000-8000-000000000012', 'c1800000-0000-4000-8000-000000000001', 'crm-denied@test.invalid', 'CRM Denied', 'admin', 'active', '{"crm":false}'),
  ('c1800000-0000-4000-8000-000000000013', 'c1800000-0000-4000-8000-000000000001', 'crm-member@test.invalid', 'CRM Member', 'ustadz', 'active', '{}'),
  ('c2800000-0000-4000-8000-000000000021', 'c2800000-0000-4000-8000-000000000002', 'crm-admin-b@test.invalid', 'CRM Admin B', 'admin', 'active', '{}');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_contacts'::regclass), 'CRM contacts enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.crm_contacts'::regclass), 'CRM contacts force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_interactions'::regclass), 'CRM interactions enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.crm_interactions'::regclass), 'CRM interactions force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_contact_audit_events'::regclass), 'CRM audit events enable RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.crm_contact_audit_events'::regclass), 'CRM audit events force RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.crm_mutation_requests'::regclass), 'CRM idempotency ledger enables RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.crm_mutation_requests'::regclass), 'CRM idempotency ledger forces RLS');
SELECT ok(NOT has_table_privilege('anon', 'public.crm_contacts', 'SELECT'), 'anon cannot read CRM contacts directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.crm_contacts', 'SELECT'), 'browser users cannot read CRM contacts directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.crm_contacts', 'INSERT'), 'browser users cannot create CRM contacts directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.crm_interactions', 'UPDATE'), 'browser users cannot alter CRM interaction history');
SELECT ok(has_table_privilege('service_role', 'public.crm_contacts', 'SELECT,INSERT,UPDATE'), 'server receives only explicit contact privileges');
SELECT ok(has_table_privilege('service_role', 'public.crm_interactions', 'SELECT,INSERT'), 'server can read and append interactions');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.manage_tenant_crm_contact(uuid,uuid,text,uuid,uuid,text,jsonb)'), 'EXECUTE'), 'server can use protected contact mutation RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.record_tenant_crm_interaction(uuid,uuid,text,uuid,uuid,jsonb)'), 'EXECUTE'), 'server can use protected interaction RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.list_tenant_crm_contacts_page(uuid,uuid,text,text,text,text,timestamp with time zone,uuid,integer)'), 'EXECUTE'), 'server can use tenant contact listing RPC');
SELECT ok(has_function_privilege('service_role', to_regprocedure('public.list_tenant_crm_interactions_page(uuid,uuid,text,uuid,timestamp with time zone,uuid,integer)'), 'EXECUTE'), 'server can use tenant interaction listing RPC');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.manage_tenant_crm_contact(uuid,uuid,text,uuid,uuid,text,jsonb)'), 'EXECUTE'), 'browser users cannot call contact mutation RPC');
SELECT ok(NOT has_function_privilege('authenticated', to_regprocedure('public.list_tenant_crm_contacts_page(uuid,uuid,text,text,text,text,timestamp with time zone,uuid,integer)'), 'EXECUTE'), 'browser users cannot call CRM listing RPC');

SET LOCAL ROLE service_role;
SELECT is(public.manage_tenant_crm_contact(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000101', 'c1800000-0000-4000-8000-000000000201', 'create',
  '{"contactType":"prospect","name":"Calon Wali A","organizationName":"Lembaga A","email":"wali.a@example.test","phone":"08123456789","lifecycleStage":"lead","marketingConsent":"unknown","consentSource":null}'::jsonb
)->>'alreadyApplied', 'false', 'Admin creates a tenant contact');
SELECT is(public.manage_tenant_crm_contact(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000101', 'c1800000-0000-4000-8000-000000000202', 'create',
  '{"contactType":"prospect","name":"Calon Wali A","organizationName":"Lembaga A","email":"wali.a@example.test","phone":"08123456789","lifecycleStage":"lead","marketingConsent":"unknown","consentSource":null}'::jsonb
)->>'contactId', 'c1800000-0000-4000-8000-000000000201', 'identical retry returns the original contact even if the request created a new tentative ID');
SELECT throws_ok($$SELECT public.manage_tenant_crm_contact(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000101', 'c1800000-0000-4000-8000-000000000202', 'create',
  '{"contactType":"prospect","name":"Payload Berubah","organizationName":"Lembaga A","email":"wali.a@example.test","phone":"08123456789","lifecycleStage":"lead","marketingConsent":"unknown","consentSource":null}'::jsonb
)$$, '23505', 'ID permintaan CRM telah dipakai untuk payload berbeda', 'request IDs cannot be reused for changed contact data');
SELECT is(public.manage_tenant_crm_contact(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000102', 'c1800000-0000-4000-8000-000000000201', 'update',
  '{"contactType":"prospect","name":"Calon Wali A Revisi","organizationName":"Lembaga A","email":"wali.a@example.test","phone":"08123456789","lifecycleStage":"qualified","marketingConsent":"granted","consentSource":"Formulir tertulis"}'::jsonb
)->>'alreadyApplied', 'false', 'Admin updates contact and records marketing permission evidence');
SELECT is((SELECT array_to_string(changed_fields, ',') FROM public.crm_contact_audit_events
  WHERE tenant_id = 'c1800000-0000-4000-8000-000000000001' AND contact_id = 'c1800000-0000-4000-8000-000000000201' AND event_type = 'consent_changed'),
  'name,lifecycle_stage,marketing_consent', 'audit events store changed field names without duplicating PII values');
SELECT throws_ok($$SELECT public.manage_tenant_crm_contact(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000012', 'admin',
  'c1800000-0000-4000-8000-000000000103', 'c1800000-0000-4000-8000-000000000203', 'create',
  '{"contactType":"prospect","name":"Ditolak","lifecycleStage":"lead","marketingConsent":"unknown"}'::jsonb
)$$, '42501', 'Akses aktif Admin ke CRM diperlukan', 'explicitly denied CRM permission is enforced in database');
SELECT throws_ok($$SELECT public.manage_tenant_crm_contact(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000013', 'ustadz',
  'c1800000-0000-4000-8000-000000000104', 'c1800000-0000-4000-8000-000000000204', 'create',
  '{"contactType":"prospect","name":"Ditolak","lifecycleStage":"lead","marketingConsent":"unknown"}'::jsonb
)$$, '22023', 'Aktor CRM tidak valid', 'non-admin role is rejected');
SELECT throws_ok($$SELECT public.manage_tenant_crm_contact(
  'c2800000-0000-4000-8000-000000000002', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000105', 'c2800000-0000-4000-8000-000000000205', 'create',
  '{"contactType":"prospect","name":"Lintas Tenant","lifecycleStage":"lead","marketingConsent":"unknown"}'::jsonb
)$$, '42501', 'Akses aktif Admin ke CRM diperlukan', 'admin cannot write to a different tenant');
SELECT is(public.manage_tenant_crm_contact(
  'c2800000-0000-4000-8000-000000000002', 'c2800000-0000-4000-8000-000000000021', 'admin',
  'c2800000-0000-4000-8000-000000000106', 'c2800000-0000-4000-8000-000000000206', 'create',
  '{"contactType":"partner","name":"Mitra Tenant B","lifecycleStage":"lead","marketingConsent":"unknown"}'::jsonb
)->>'contactId', 'c2800000-0000-4000-8000-000000000206', 'tenant B admin can write within their own tenant');
SELECT is(public.record_tenant_crm_interaction(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000111', 'c1800000-0000-4000-8000-000000000301',
  '{"contactId":"c1800000-0000-4000-8000-000000000201","interactionType":"meeting","direction":"inbound","subject":"Pertemuan awal","summary":"Pembahasan program pendidikan"}'::jsonb
)->>'alreadyApplied', 'false', 'Admin appends an interaction to their tenant contact');
SELECT is(public.record_tenant_crm_interaction(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000111', 'c1800000-0000-4000-8000-000000000302',
  '{"contactId":"c1800000-0000-4000-8000-000000000201","interactionType":"meeting","direction":"inbound","subject":"Pertemuan awal","summary":"Pembahasan program pendidikan"}'::jsonb
)->>'interactionId', 'c1800000-0000-4000-8000-000000000301', 'interaction retry returns the originally created interaction');
SELECT throws_ok($$SELECT public.record_tenant_crm_interaction(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000112', 'c1800000-0000-4000-8000-000000000303',
  '{"contactId":"c2800000-0000-4000-8000-000000000206","interactionType":"note","direction":"internal","subject":"Lintas tenant"}'::jsonb
)$$, 'P0002', 'Kontak CRM tidak ditemukan pada tenant ini', 'interaction cannot refer to another tenant contact');
SELECT is(jsonb_array_length(public.list_tenant_crm_contacts_page(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin', NULL, NULL, NULL, NULL, NULL, 50
)->'contacts'), 1, 'contact listing is tenant scoped');
SELECT is((public.list_tenant_crm_contacts_page(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin', NULL, NULL, NULL, NULL, NULL, 50
)->'summary'->>'totalContacts'), '1', 'summary counts only this tenant contacts');
SELECT is(jsonb_array_length(public.list_tenant_crm_interactions_page(
  'c1800000-0000-4000-8000-000000000001', 'c1800000-0000-4000-8000-000000000011', 'admin',
  'c1800000-0000-4000-8000-000000000201', NULL, NULL, 50
)->'interactions'), 1, 'interaction listing is scoped to tenant and contact');
RESET ROLE;
SELECT throws_ok($$UPDATE public.crm_interactions SET subject = 'Diubah' WHERE id = 'c1800000-0000-4000-8000-000000000301'$$, '55000', 'Riwayat CRM bersifat append-only', 'interaction history cannot be updated');
SELECT throws_ok($$DELETE FROM public.crm_interactions WHERE id = 'c1800000-0000-4000-8000-000000000301'$$, '55000', 'Riwayat CRM bersifat append-only', 'interaction history cannot be deleted');
SELECT throws_ok($$UPDATE public.crm_contact_audit_events SET changed_fields = ARRAY['email'] WHERE tenant_id = 'c1800000-0000-4000-8000-000000000001'$$, '55000', 'Riwayat CRM bersifat append-only', 'CRM audit history cannot be updated');
SELECT throws_ok($$DELETE FROM public.crm_mutation_requests WHERE tenant_id = 'c1800000-0000-4000-8000-000000000001'$$, '55000', 'Riwayat CRM bersifat append-only', 'idempotency ledger cannot be deleted');
SELECT is((SELECT count(*)::INTEGER FROM public.crm_contact_audit_events WHERE tenant_id = 'c1800000-0000-4000-8000-000000000001'), 3, 'contact and interaction changes each write an audit event');
SELECT is((SELECT count(*)::INTEGER FROM public.crm_contacts WHERE tenant_id = 'c1800000-0000-4000-8000-000000000001'), 1, 'same tenant retry did not duplicate the contact');
SELECT is((SELECT count(*)::INTEGER FROM public.crm_interactions WHERE tenant_id = 'c1800000-0000-4000-8000-000000000001'), 1, 'same tenant retry did not duplicate the interaction');

SELECT * FROM finish();
ROLLBACK;
