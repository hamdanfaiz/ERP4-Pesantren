-- Synthetic coverage for tenant-safe, value-free Master Data audit events.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(28);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('ad100000-0000-4000-8000-000000000001', 'audit-feed-a-test', 'Audit Feed Tenant A', 'active'),
  ('ad100000-0000-4000-8000-000000000002', 'audit-feed-b-test', 'Audit Feed Tenant B', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('ad100000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('ad100000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'audit-ustadz@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('ad100000-0000-4000-8000-000000000011', 'ad100000-0000-4000-8000-000000000001', 'audit-admin@test.invalid', 'Audit Admin', 'admin', 'active', '{}'),
  ('ad100000-0000-4000-8000-000000000012', 'ad100000-0000-4000-8000-000000000001', 'audit-ustadz@test.invalid', 'Audit Ustadz', 'ustadz', 'active', '{}');

SELECT ok(to_regclass('public.master_data_audit_events') IS NOT NULL, 'audit feed table exists');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.master_data_audit_events'::regclass), 'audit feed enables RLS');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.master_data_audit_events'::regclass), 'audit feed forces RLS');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.master_data_records'::regclass AND tgname = 'master_data_records_audit_event' AND NOT tgisinternal), 'structure changes have an audit trigger');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.students'::regclass AND tgname = 'students_master_data_audit_event' AND NOT tgisinternal), 'student changes have an audit trigger');
SELECT ok(NOT has_table_privilege('anon', 'public.master_data_audit_events', 'SELECT'), 'anonymous callers cannot read audit events');
SELECT ok(NOT has_table_privilege('authenticated', 'public.master_data_audit_events', 'SELECT'), 'browser callers cannot read audit events directly');
SELECT ok(has_table_privilege('service_role', 'public.master_data_audit_events', 'SELECT'), 'trusted server can read audit events');
SELECT ok(NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'INSERT'), 'trusted server cannot forge audit events directly');
SELECT ok(NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'UPDATE'), 'trusted server cannot update audit events');
SELECT ok(NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'DELETE'), 'trusted server cannot delete audit events');
SELECT ok(NOT has_table_privilege('service_role', 'public.master_data_audit_events', 'TRUNCATE'), 'trusted server cannot truncate audit events');
SELECT ok(NOT has_function_privilege('anon', 'public.upsert_master_data_structure_with_actor(uuid,text,text,jsonb,uuid)', 'EXECUTE'), 'anonymous callers cannot use the audited mutation RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.upsert_master_data_structure_with_actor(uuid,text,text,jsonb,uuid)', 'EXECUTE'), 'browser callers cannot use the audited mutation RPC directly');
SELECT ok(has_function_privilege('service_role', 'public.upsert_master_data_structure_with_actor(uuid,text,text,jsonb,uuid)', 'EXECUTE'), 'trusted server can use the audited mutation RPC');
SELECT ok(NOT has_function_privilege('service_role', 'public.upsert_master_data_structure(uuid,text,text,jsonb)', 'EXECUTE'), 'actor-less structure writes are retired');
SELECT ok(NOT has_function_privilege('service_role', 'public.import_legacy_master_data_student(uuid,jsonb,jsonb,boolean)', 'EXECUTE'), 'actor-less student imports are retired');

SET LOCAL ROLE service_role;
SELECT is(
  public.upsert_master_data_structure_with_actor(
    'ad100000-0000-4000-8000-000000000001', 'Gedung', 'audit-building-1',
    '{"id":"audit-building-1","name":"Nama PII Rahasia Tidak Boleh Masuk Log"}'::jsonb,
    'ad100000-0000-4000-8000-000000000011'
  )->>'id',
  'audit-building-1', 'audited write returns its structure ID'
);
SELECT is((SELECT count(*)::int FROM public.master_data_audit_events WHERE tenant_id = 'ad100000-0000-4000-8000-000000000001'), 1, 'insert creates one tenant audit event');
SELECT is((SELECT actor_user_id FROM public.master_data_audit_events WHERE tenant_id = 'ad100000-0000-4000-8000-000000000001'), 'ad100000-0000-4000-8000-000000000011'::uuid, 'event records the authenticated Admin actor');
SELECT ok(
  NOT ((SELECT to_jsonb(event)::text FROM public.master_data_audit_events AS event WHERE tenant_id = 'ad100000-0000-4000-8000-000000000001') LIKE '%Nama PII Rahasia Tidak Boleh Masuk Log%'),
  'audit event stores no record field value'
);
SELECT ok(
  (SELECT changed_fields @> ARRAY['name']::text[] AND action = 'created'
   FROM public.master_data_audit_events WHERE tenant_id = 'ad100000-0000-4000-8000-000000000001'),
  'create event captures a changed field label and action only'
);
SELECT is(
  public.upsert_master_data_structure_with_actor(
    'ad100000-0000-4000-8000-000000000001', 'Gedung', 'audit-building-1',
    '{"id":"audit-building-1","name":"Nama PII Diperbarui"}'::jsonb,
    'ad100000-0000-4000-8000-000000000011'
  )->>'id',
  'audit-building-1', 'audited update succeeds for an active tenant Admin'
);
SELECT ok(
  (SELECT action = 'updated' AND changed_fields = ARRAY['name']::text[]
   FROM public.master_data_audit_events WHERE tenant_id = 'ad100000-0000-4000-8000-000000000001' ORDER BY id DESC LIMIT 1),
  'update event contains only the changed field name'
);
SELECT is(
  public.delete_master_data_structure_with_actor(
    'ad100000-0000-4000-8000-000000000001', 'Gedung', 'audit-building-1',
    'ad100000-0000-4000-8000-000000000011'
  )->>'deleted',
  'true', 'audited delete succeeds for an active tenant Admin'
);
SELECT ok(
  (SELECT action = 'deleted' AND entity_id = 'audit-building-1'
   FROM public.master_data_audit_events WHERE tenant_id = 'ad100000-0000-4000-8000-000000000001' ORDER BY id DESC LIMIT 1),
  'delete event retains only the internal entity ID and action'
);
SELECT throws_ok(
  $$SELECT public.delete_master_data_structure_with_actor('ad100000-0000-4000-8000-000000000001', 'Gedung', 'missing', 'ad100000-0000-4000-8000-000000000012')$$,
  '42501', 'Aktor Admin aktif tidak ditemukan pada tenant ini', 'non-Admin actors cannot mutate through an audited RPC'
);
SELECT throws_ok(
  $$SELECT public.delete_master_data_structure_with_actor('ad100000-0000-4000-8000-000000000002', 'Gedung', 'missing', 'ad100000-0000-4000-8000-000000000011')$$,
  '42501', 'Aktor Admin aktif tidak ditemukan pada tenant ini', 'an Admin cannot mutate another tenant through the audited RPC'
);

SELECT * FROM finish();
ROLLBACK;
