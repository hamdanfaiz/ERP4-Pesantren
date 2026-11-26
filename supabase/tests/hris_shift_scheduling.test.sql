-- HRIS shift scheduling contract: access, tenant safety, idempotency, overlap rules, and audit.
-- Fixtures are synthetic and the test transaction is rolled back.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(30);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('d5200000-0000-4000-8000-000000000001', 'hris-shifts-test', 'HRIS Shift Test', 'active'),
  ('d5200000-0000-4000-8000-000000000002', 'hris-shifts-other', 'HRIS Shift Other', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('d5200000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hris-shift-admin@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d5200000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hris-shift-denied@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d5200000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hris-shift-other@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('d5200000-0000-4000-8000-000000000011', 'd5200000-0000-4000-8000-000000000001',
   'hris-shift-admin@test.invalid', 'Admin Jadwal Uji', 'admin', 'active', '{"hris":true}'),
  ('d5200000-0000-4000-8000-000000000012', 'd5200000-0000-4000-8000-000000000001',
   'hris-shift-denied@test.invalid', 'Admin Tanpa Izin HRIS', 'admin', 'active', '{"hris":false}'),
  ('d5200000-0000-4000-8000-000000000021', 'd5200000-0000-4000-8000-000000000002',
   'hris-shift-other@test.invalid', 'Admin Pesantren Lain', 'admin', 'active', '{"hris":true}');

INSERT INTO public.organization_units (
  id, tenant_id, code, name, unit_type, status, created_by_user_id, updated_by_user_id
)
VALUES (
  'd5200000-0000-4000-8000-000000000111', 'd5200000-0000-4000-8000-000000000001',
  'LAYANAN', 'Layanan', 'lainnya', 'active',
  'd5200000-0000-4000-8000-000000000011', 'd5200000-0000-4000-8000-000000000011'
);

INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
)
VALUES (
  'd5200000-0000-4000-8000-000000000001', 'hris_job_title', 'STAF_LAYANAN',
  'Staf Layanan', 'Jabatan sintetis untuk pengujian jadwal pegawai.',
  'active', 'd5200000-0000-4000-8000-000000000011', 'd5200000-0000-4000-8000-000000000011'
);

SELECT public.upsert_hris_employee(
  'd5200000-0000-4000-8000-000000000001',
  'd5200000-0000-4000-8000-000000000011',
  'd5200000-0000-4000-8000-000000000101',
  NULL, 'Pegawai Jadwal Uji', 'Staf Layanan', 'Layanan',
  'pegawai-shift@test.invalid', NULL, DATE '2024-01-15', 'active',
  'd5200000-0000-4000-8000-000000000191'
);

SELECT ok(
  (SELECT bool_and(relrowsecurity AND relforcerowsecurity)
   FROM pg_class
   WHERE oid = ANY (ARRAY[
     'public.hris_shift_templates'::regclass,
     'public.hris_shift_assignments'::regclass,
     'public.hris_shift_events'::regclass
   ])),
  'all shift tables enable and force row-level security'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.hris_shift_templates', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.hris_shift_templates', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.hris_shift_assignments', 'SELECT')
  AND has_table_privilege('service_role', 'public.hris_shift_templates', 'SELECT')
  AND has_table_privilege('service_role', 'public.hris_shift_assignments', 'SELECT')
  AND NOT has_table_privilege('service_role', 'public.hris_shift_events', 'SELECT'),
  'only the trusted server can read shift data and the event ledger stays private'
);
SELECT ok(
  to_regprocedure('public.create_hris_shift_template(uuid,uuid,uuid,text,smallint,time without time zone,time without time zone,smallint,uuid)') IS NOT NULL
  AND to_regprocedure('public.deactivate_hris_shift_template(uuid,uuid,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.assign_hris_shift(uuid,uuid,uuid,uuid,date,date,uuid,uuid)') IS NOT NULL
  AND to_regprocedure('public.cancel_hris_shift_assignment(uuid,uuid,uuid,uuid)') IS NOT NULL,
  'all shift scheduling RPCs are installed'
);
SELECT ok(
  has_function_privilege('service_role', 'public.create_hris_shift_template(uuid,uuid,uuid,text,smallint,time without time zone,time without time zone,smallint,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.deactivate_hris_shift_template(uuid,uuid,uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.assign_hris_shift(uuid,uuid,uuid,uuid,date,date,uuid,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.cancel_hris_shift_assignment(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'the server role can execute shift scheduling RPCs'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.create_hris_shift_template(uuid,uuid,uuid,text,smallint,time without time zone,time without time zone,smallint,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.create_hris_shift_template(uuid,uuid,uuid,text,smallint,time without time zone,time without time zone,smallint,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.deactivate_hris_shift_template(uuid,uuid,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.deactivate_hris_shift_template(uuid,uuid,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.assign_hris_shift(uuid,uuid,uuid,uuid,date,date,uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.cancel_hris_shift_assignment(uuid,uuid,uuid,uuid)', 'EXECUTE'),
  'browser roles cannot call shift write RPCs directly'
);
SELECT ok(
  (SELECT count(*) = 4
   FROM pg_proc
   WHERE oid = ANY (ARRAY[
     'public.create_hris_shift_template(uuid,uuid,uuid,text,smallint,time without time zone,time without time zone,smallint,uuid)'::regprocedure,
     'public.deactivate_hris_shift_template(uuid,uuid,uuid,uuid)'::regprocedure,
     'public.assign_hris_shift(uuid,uuid,uuid,uuid,date,date,uuid,uuid)'::regprocedure,
     'public.cancel_hris_shift_assignment(uuid,uuid,uuid,uuid)'::regprocedure
   ])
   AND prosecdef
   AND proconfig @> ARRAY['search_path=pg_catalog, public']),
  'each privileged RPC has a fixed safe search path'
);

SELECT is(
  public.create_hris_shift_template(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000201', 'Pagi', 8::SMALLINT, TIME '09:00', TIME '17:00', 60::SMALLINT,
    'd5200000-0000-4000-8000-000000000291'
  )->>'replayed', 'false', 'Admin can create a Thursday shift template'
);
SELECT is(
  (SELECT name || '|' || weekday_mask::TEXT || '|' || starts_at::TEXT || '|' || ends_at::TEXT || '|' || break_minutes::TEXT
   FROM public.hris_shift_templates
   WHERE tenant_id = 'd5200000-0000-4000-8000-000000000001'
     AND id = 'd5200000-0000-4000-8000-000000000201'),
  'Pagi|8|09:00:00|17:00:00|60', 'template settings persist with the selected weekdays and break'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.hris_shift_events
   WHERE tenant_id = 'd5200000-0000-4000-8000-000000000001' AND event_type = 'template_created'),
  1, 'template creation is audited once'
);
SELECT is(
  public.create_hris_shift_template(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000201', 'Pagi', 8::SMALLINT, TIME '09:00', TIME '17:00', 60::SMALLINT,
    'd5200000-0000-4000-8000-000000000291'
  )->>'replayed', 'true', 'repeating the template request is idempotent'
);
SELECT throws_ok(
  $$SELECT public.create_hris_shift_template(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000201', 'Pagi', 8::SMALLINT, TIME '10:00', TIME '17:00', 60::SMALLINT,
    'd5200000-0000-4000-8000-000000000291'
  )$$,
  '23505', 'ID permintaan telah digunakan untuk perubahan berbeda',
  'a template idempotency key cannot be reused with changed settings'
);
SELECT throws_ok(
  $$SELECT public.create_hris_shift_template(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000012',
    'd5200000-0000-4000-8000-000000000202', 'Ditolak', 8::SMALLINT, TIME '09:00', TIME '17:00', 0::SMALLINT,
    'd5200000-0000-4000-8000-000000000292'
  )$$,
  '42501', 'Admin tenant dengan izin HRIS diperlukan',
  'an Admin without HRIS permission cannot manage shift templates'
);
SELECT throws_ok(
  $$SELECT public.create_hris_shift_template(
    'd5200000-0000-4000-8000-000000000002', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000203', 'Lintas tenant', 8::SMALLINT, TIME '09:00', TIME '17:00', 0::SMALLINT,
    'd5200000-0000-4000-8000-000000000293'
  )$$,
  '42501', 'Admin tenant dengan izin HRIS diperlukan',
  'an Admin cannot create a shift template in another tenant'
);

SELECT is(
  public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000201',
    DATE '2026-11-26', DATE '2026-11-26', 'd5200000-0000-4000-8000-000000000301',
    'd5200000-0000-4000-8000-000000000391'
  )->>'replayed', 'false', 'Admin can assign a shift to an active tenant employee'
);
SELECT is(
  (SELECT e.employee_number || '|' || t.name || '|' || a.starts_on::TEXT || '|' || a.ends_on::TEXT || '|' || a.status
   FROM public.hris_shift_assignments a
   JOIN public.hris_employees e ON e.tenant_id = a.tenant_id AND e.id = a.employee_id
   JOIN public.hris_shift_templates t ON t.tenant_id = a.tenant_id AND t.id = a.shift_template_id
   WHERE a.tenant_id = 'd5200000-0000-4000-8000-000000000001'
     AND a.id = 'd5200000-0000-4000-8000-000000000301'),
  (SELECT employee_number || '|Pagi|2026-11-26|2026-11-26|active'
   FROM public.hris_employees WHERE tenant_id = 'd5200000-0000-4000-8000-000000000001'
     AND id = 'd5200000-0000-4000-8000-000000000101'),
  'assignment relationships and date range persist within the tenant'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.hris_shift_events
   WHERE tenant_id = 'd5200000-0000-4000-8000-000000000001' AND event_type = 'assignment_created'),
  1, 'assignment creation is recorded in the audit ledger'
);
SELECT is(
  public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000201',
    DATE '2026-11-26', DATE '2026-11-26', 'd5200000-0000-4000-8000-000000000301',
    'd5200000-0000-4000-8000-000000000391'
  )->>'replayed', 'true', 'repeating an identical assignment is idempotent'
);
SELECT throws_ok(
  $$SELECT public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000201',
    DATE '2026-11-27', DATE '2026-11-27', 'd5200000-0000-4000-8000-000000000301',
    'd5200000-0000-4000-8000-000000000391'
  )$$,
  '23505', 'ID permintaan telah digunakan untuk perubahan berbeda',
  'an assignment idempotency key cannot replay changed dates'
);

SELECT public.create_hris_shift_template(
  'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
  'd5200000-0000-4000-8000-000000000202', 'Sore tumpang tindih', 8::SMALLINT, TIME '16:00', TIME '20:00', 0::SMALLINT,
  'd5200000-0000-4000-8000-000000000292'
);
SELECT throws_ok(
  $$SELECT public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000202',
    DATE '2026-11-26', DATE '2026-11-26', 'd5200000-0000-4000-8000-000000000302',
    'd5200000-0000-4000-8000-000000000392'
  )$$,
  '23505', 'Jadwal shift bertabrakan untuk pegawai dan periode tersebut',
  'overlapping shifts for the same employee and day are rejected'
);
SELECT public.create_hris_shift_template(
  'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
  'd5200000-0000-4000-8000-000000000203', 'Sore berurutan', 8::SMALLINT, TIME '17:00', TIME '20:00', 0::SMALLINT,
  'd5200000-0000-4000-8000-000000000293'
);
SELECT is(
  public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000203',
    DATE '2026-11-26', DATE '2026-11-26', 'd5200000-0000-4000-8000-000000000303',
    'd5200000-0000-4000-8000-000000000393'
  )->>'status', 'active', 'back-to-back shifts that meet only at the boundary are allowed'
);
SELECT throws_ok(
  $$SELECT public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000201',
    DATE '2026-11-27', DATE '2026-11-27', 'd5200000-0000-4000-8000-000000000304',
    'd5200000-0000-4000-8000-000000000394'
  )$$,
  '22023', 'Rentang tanggal tidak mencakup hari kerja pada pola shift',
  'assignments cannot use dates that do not match the template weekday mask'
);
SELECT public.create_hris_shift_template(
  'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
  'd5200000-0000-4000-8000-000000000204', 'Jumat pagi', 16::SMALLINT, TIME '09:00', TIME '17:00', 0::SMALLINT,
  'd5200000-0000-4000-8000-000000000294'
);
SELECT is(
  public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000204',
    DATE '2026-11-27', DATE '2026-11-27', 'd5200000-0000-4000-8000-000000000304',
    'd5200000-0000-4000-8000-000000000394'
  )->>'status', 'active', 'the same employee can take a non-overlapping shift on another weekday'
);

SELECT public.create_hris_shift_template(
  'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
  'd5200000-0000-4000-8000-000000000205', 'Piket malam', 8::SMALLINT, TIME '22:00', TIME '06:00', 30::SMALLINT,
  'd5200000-0000-4000-8000-000000000295'
);
SELECT is(
  public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000205',
    DATE '2026-11-26', DATE '2026-11-26', 'd5200000-0000-4000-8000-000000000305',
    'd5200000-0000-4000-8000-000000000395'
  )->>'status', 'active', 'overnight shift assignments are supported'
);
SELECT public.create_hris_shift_template(
  'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
  'd5200000-0000-4000-8000-000000000206', 'Jumat dini hari', 16::SMALLINT, TIME '05:00', TIME '08:00', 0::SMALLINT,
  'd5200000-0000-4000-8000-000000000296'
);
SELECT throws_ok(
  $$SELECT public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000206',
    DATE '2026-11-27', DATE '2026-11-27', 'd5200000-0000-4000-8000-000000000306',
    'd5200000-0000-4000-8000-000000000396'
  )$$,
  '23505', 'Jadwal shift bertabrakan untuk pegawai dan periode tersebut',
  'overlap across midnight is detected'
);

SELECT is(
  public.deactivate_hris_shift_template(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000203', 'd5200000-0000-4000-8000-000000000297'
  )->>'status', 'inactive', 'Admin can deactivate a pattern without deleting its history'
);
SELECT throws_ok(
  $$SELECT public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000203',
    DATE '2026-12-03', DATE '2026-12-03', 'd5200000-0000-4000-8000-000000000307',
    'd5200000-0000-4000-8000-000000000397'
  )$$,
  'P0002', 'Pola shift aktif tidak ditemukan',
  'inactive templates cannot receive new assignments'
);
SELECT is(
  public.cancel_hris_shift_assignment(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000305', 'd5200000-0000-4000-8000-000000000398'
  )->>'status', 'cancelled', 'Admin can cancel an assignment while keeping its history'
);
SELECT is(
  (SELECT status || '|' || (cancelled_by_user_id IS NOT NULL)::TEXT || '|' || (cancelled_at IS NOT NULL)::TEXT
   FROM public.hris_shift_assignments
   WHERE tenant_id = 'd5200000-0000-4000-8000-000000000001'
     AND id = 'd5200000-0000-4000-8000-000000000305'),
  'cancelled|true|true', 'cancellation records actor and timestamp'
);
SELECT is(
  public.cancel_hris_shift_assignment(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000305', 'd5200000-0000-4000-8000-000000000398'
  )->>'replayed', 'true', 'cancellation retries are idempotent'
);
SELECT is(
  public.assign_hris_shift(
    'd5200000-0000-4000-8000-000000000001', 'd5200000-0000-4000-8000-000000000011',
    'd5200000-0000-4000-8000-000000000101', 'd5200000-0000-4000-8000-000000000206',
    DATE '2026-11-27', DATE '2026-11-27', 'd5200000-0000-4000-8000-000000000306',
    'd5200000-0000-4000-8000-000000000399'
  )->>'status', 'active', 'cancelling an overnight shift releases the following morning slot'
);

SELECT * FROM finish();
ROLLBACK;
