-- Synthetic tests for trusted first-tenant / first-Admin provisioning.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(11);

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('ac100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bootstrap-admin@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"name":"Bootstrap Admin"}', now(), now()),
  ('ac100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bootstrap-admin-two@test.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{"name":"Second Admin"}', now(), now());

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.provision_tenant_with_initial_admin(text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  'anonymous users cannot bootstrap tenants or Admins'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.provision_tenant_with_initial_admin(text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  'authenticated browser users cannot bootstrap tenants or Admins'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.provision_tenant_with_initial_admin(text,text,text,text,uuid,text,text,text)',
    'EXECUTE'
  ),
  'trusted server service_role can run bootstrap'
);

SELECT is(
  (SELECT result.already_provisioned
   FROM public.provision_tenant_with_initial_admin(
     'bootstrap-tenant-test', 'Bootstrap Tenant Test', 'pesantren', 'Asia/Jakarta',
     'ac100000-0000-4000-8000-000000000001', 'BOOTSTRAP-ADMIN@test.invalid',
     'Bootstrap Admin', 'bootstrap-admin'
   ) AS result),
  FALSE,
  'first call provisions a new tenant and Admin'
);
SELECT is(
  (SELECT count(*)::INT FROM public.tenants WHERE slug = 'bootstrap-tenant-test'),
  1,
  'bootstrap creates one tenant row'
);
SELECT is(
  (SELECT count(*)::INT FROM public.profiles
   WHERE tenant_id = (SELECT id FROM public.tenants WHERE slug = 'bootstrap-tenant-test')),
  1,
  'bootstrap creates exactly one tenant profile'
);
SELECT is(
  (SELECT role FROM public.profiles WHERE user_id = 'ac100000-0000-4000-8000-000000000001'),
  'admin',
  'the initial profile is always a tenant Admin'
);
SELECT is(
  (SELECT status FROM public.profiles WHERE user_id = 'ac100000-0000-4000-8000-000000000001'),
  'active',
  'the tenant profile is active while Supabase Auth controls sign-in'
);
SELECT is(
  (SELECT module_permissions FROM public.profiles WHERE user_id = 'ac100000-0000-4000-8000-000000000001'),
  '{}'::jsonb,
  'Admin uses the canonical role defaults instead of a copied permissions payload'
);
SELECT is(
  (SELECT result.already_provisioned
   FROM public.provision_tenant_with_initial_admin(
     'bootstrap-tenant-test', 'Bootstrap Tenant Test', 'pesantren', 'Asia/Jakarta',
     'ac100000-0000-4000-8000-000000000001', 'bootstrap-admin@test.invalid',
     'Bootstrap Admin', 'bootstrap-admin'
   ) AS result),
  TRUE,
  'retrying the same bootstrap request is idempotent'
);
SELECT throws_ok(
  $$SELECT * FROM public.provision_tenant_with_initial_admin(
    'bootstrap-tenant-test', 'Bootstrap Tenant Test', 'pesantren', 'Asia/Jakarta',
    'ac100000-0000-4000-8000-000000000002', 'bootstrap-admin-two@test.invalid',
    'Second Admin', 'second-admin'
  )$$,
  '23514',
  'Tenant already contains a profile; initial Admin bootstrap is closed.',
  'bootstrap refuses to add a second initial Admin to an existing tenant'
);

SELECT * FROM finish();
ROLLBACK;
