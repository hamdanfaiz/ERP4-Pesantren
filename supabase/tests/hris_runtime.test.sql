-- HRIS runtime contract: employee, attendance, leave, idempotency, and tenant authorization.
-- All fixtures are synthetic and the enclosing transaction rolls back.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;

SELECT plan(43);

INSERT INTO public.tenants (id, slug, name, status)
VALUES
  ('d5000000-0000-4000-8000-000000000001', 'hris-runtime-test', 'HRIS Runtime Test', 'active'),
  ('d5000000-0000-4000-8000-000000000002', 'hris-runtime-other', 'HRIS Runtime Other', 'active');

INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
VALUES
  ('d5000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hris-runtime-admin@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d5000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hris-runtime-denied@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d5000000-0000-4000-8000-000000000021', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'hris-runtime-other-admin@test.invalid', '', now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now());

INSERT INTO public.profiles (user_id, tenant_id, email, display_name, role, status, module_permissions)
VALUES
  ('d5000000-0000-4000-8000-000000000011', 'd5000000-0000-4000-8000-000000000001',
   'hris-runtime-admin@test.invalid', 'Admin HRIS Uji', 'admin', 'active', '{"hris":true}'),
  ('d5000000-0000-4000-8000-000000000012', 'd5000000-0000-4000-8000-000000000001',
   'hris-runtime-denied@test.invalid', 'Admin Tanpa Izin HRIS', 'admin', 'active', '{"hris":false}'),
  ('d5000000-0000-4000-8000-000000000021', 'd5000000-0000-4000-8000-000000000002',
   'hris-runtime-other-admin@test.invalid', 'Admin Tenant Lain', 'admin', 'active', '{"hris":true}');

INSERT INTO public.organization_units (
  id, tenant_id, code, name, unit_type, status, created_by_user_id, updated_by_user_id
)
VALUES
  ('d5000000-0000-4000-8000-000000000031', 'd5000000-0000-4000-8000-000000000001',
   'PERPUSTAKAAN', 'Perpustakaan', 'lainnya', 'active',
   'd5000000-0000-4000-8000-000000000011', 'd5000000-0000-4000-8000-000000000011'),
  ('d5000000-0000-4000-8000-000000000032', 'd5000000-0000-4000-8000-000000000001',
   'LAYANAN', 'Layanan', 'lainnya', 'active',
   'd5000000-0000-4000-8000-000000000011', 'd5000000-0000-4000-8000-000000000011');

INSERT INTO public.tenant_reference_items (
  tenant_id, domain, code, name, description, status, created_by_user_id, updated_by_user_id
)
VALUES (
  'd5000000-0000-4000-8000-000000000001', 'hris_job_title', 'PENGELOLA_PERPUSTAKAAN',
  'Pengelola Perpustakaan', 'Jabatan sintetis untuk pengujian alur pegawai HRIS.',
  'active', 'd5000000-0000-4000-8000-000000000011', 'd5000000-0000-4000-8000-000000000011'
);

SELECT ok(to_regprocedure('public.upsert_hris_employee(uuid,uuid,uuid,text,text,text,text,text,text,date,text,uuid)') IS NOT NULL,
  'employee upsert RPC exists with the expected signature');
SELECT ok(to_regprocedure('public.record_hris_attendance(uuid,uuid,uuid,date,text,timestamptz,timestamptz,uuid)') IS NOT NULL,
  'attendance RPC exists with the expected signature');
SELECT ok(to_regprocedure('public.request_hris_leave(uuid,uuid,uuid,text,date,date,text,uuid)') IS NOT NULL,
  'leave request RPC exists with the expected signature');
SELECT ok(to_regprocedure('public.review_hris_leave(uuid,uuid,uuid,text,text,uuid)') IS NOT NULL,
  'leave review RPC exists with the expected signature');
SELECT ok(
  has_function_privilege('service_role', 'public.upsert_hris_employee(uuid,uuid,uuid,text,text,text,text,text,text,date,text,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.record_hris_attendance(uuid,uuid,uuid,date,text,timestamptz,timestamptz,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.request_hris_leave(uuid,uuid,uuid,text,date,date,text,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.review_hris_leave(uuid,uuid,uuid,text,text,uuid)', 'EXECUTE'),
  'trusted server role can execute all HRIS write RPCs');
SELECT ok(NOT has_function_privilege('anon', 'public.upsert_hris_employee(uuid,uuid,uuid,text,text,text,text,text,text,date,text,uuid)', 'EXECUTE'),
  'anonymous role cannot execute the employee RPC');
SELECT ok(NOT has_function_privilege('authenticated', 'public.upsert_hris_employee(uuid,uuid,uuid,text,text,text,text,text,text,date,text,uuid)', 'EXECUTE'),
  'browser-authenticated role cannot execute the employee RPC directly');
SELECT ok(NOT has_table_privilege('authenticated', 'public.hris_employees', 'SELECT'),
  'browser-authenticated role cannot read the HRIS employee table directly');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hris_employees'::regclass),
  'employee table has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.hris_employees'::regclass),
  'employee table forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hris_attendance'::regclass),
  'attendance table has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.hris_attendance'::regclass),
  'attendance table forces RLS');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.hris_leave_requests'::regclass),
  'leave request table has RLS enabled');
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.hris_leave_requests'::regclass),
  'leave request table forces RLS');

SELECT is(
  public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    NULL, 'Pegawai Uji', 'Pengelola Perpustakaan', 'Perpustakaan',
    'pegawai-001@test.invalid', '+6281234567890', DATE '2024-01-15', 'active',
    'd5000000-0000-4000-8000-000000000191'
  )->>'replayed',
  'false',
  'tenant Admin can create an employee'
);
SELECT is(
  (SELECT employee_number || '|' || full_name || '|' || employment_status
   FROM public.hris_employees
   WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND id = 'd5000000-0000-4000-8000-000000000101'),
  'PEG-2024-00001|Pegawai Uji|active',
  'employee details are persisted in the tenant'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.hris_employee_events
   WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND employee_id = 'd5000000-0000-4000-8000-000000000101'),
  1,
  'employee create is recorded in the audit event stream'
);
SELECT is(
  public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    NULL, 'Pegawai Uji', 'Pengelola Perpustakaan', 'Perpustakaan',
    'pegawai-001@test.invalid', '+6281234567890', DATE '2024-01-15', 'active',
    'd5000000-0000-4000-8000-000000000191'
  )->>'replayed',
  'true',
  'retrying the same employee request is idempotent'
);
SELECT throws_ok(
  $$SELECT public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    NULL, 'Nama Berubah', 'Pengelola Perpustakaan', 'Perpustakaan',
    'pegawai-001@test.invalid', '+6281234567890', DATE '2024-01-15', 'active',
    'd5000000-0000-4000-8000-000000000191'
  )$$,
  '23505',
  'Pegawai berubah setelah permintaan awal; muat ulang sebelum mencoba lagi',
  'an idempotency key cannot replay a changed employee payload'
);
SELECT throws_ok(
  $SELECT public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000102',
    'EMP-MANUAL', 'Pegawai Dengan Nomor Manual', 'Staf', 'Umum',
    'pegawai-002@test.invalid', NULL, DATE '2024-02-01', 'active',
    'd5000000-0000-4000-8000-000000000192'
  )$,
  '22023',
  'Nomor pegawai baru dibuat otomatis oleh Naming Series',
  'new employee numbers must be allocated by Naming Series'
);
SELECT throws_ok(
  $$SELECT public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000102',
    NULL, 'Pegawai Duplikat Email', 'Staf', 'Umum',
    'pegawai-001@test.invalid', NULL, DATE '2024-02-01', 'active',
    'd5000000-0000-4000-8000-000000000192'
  )$$,
  '23505',
  'duplicate key value violates unique constraint "hris_employees_tenant_email_uq"',
  'employee email is unique inside a tenant'
);
SELECT is(
  public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    NULL, 'Pegawai Uji Diperbarui', 'Pengelola Perpustakaan', 'Layanan',
    'pegawai-001@test.invalid', '+6281234567890', DATE '2024-01-15', 'active',
    'd5000000-0000-4000-8000-000000000193'
  )->>'replayed',
  'false',
  'a new request can update an existing employee'
);
SELECT is(
  (SELECT full_name || '|' || department
   FROM public.hris_employees
   WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND id = 'd5000000-0000-4000-8000-000000000101'),
  'Pegawai Uji Diperbarui|Layanan',
  'employee update persists the new values'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.hris_employee_events
   WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND employee_id = 'd5000000-0000-4000-8000-000000000101'),
  2,
  'employee update appends a second audit event'
);
SELECT throws_ok(
  $$SELECT public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000012',
    'd5000000-0000-4000-8000-000000000103',
    'EMP-DENIED', 'Admin Tanpa Izin', 'Staf', 'Umum',
    NULL, NULL, NULL, 'active', 'd5000000-0000-4000-8000-000000000194'
  )$$,
  '42501',
  'Admin tenant dengan izin HRIS diperlukan',
  'Admin without HRIS permission cannot create employees'
);
SELECT throws_ok(
  $$SELECT public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000002',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000104',
    'EMP-CROSS', 'Lintas Tenant', 'Staf', 'Umum',
    NULL, NULL, NULL, 'active', 'd5000000-0000-4000-8000-000000000195'
  )$$,
  '42501',
  'Admin tenant dengan izin HRIS diperlukan',
  'Admin cannot write HRIS data into another tenant'
);
SELECT throws_ok(
  $$SELECT public.upsert_hris_employee(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000105',
    NULL, 'Pegawai Tidak Valid', 'Staf', 'Umum',
    NULL, NULL, NULL, 'unknown', 'd5000000-0000-4000-8000-000000000196'
  )$$,
  '22023',
  'Data pegawai tidak valid',
  'invalid employee status is rejected'
);

SELECT is(
  public.record_hris_attendance(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    DATE '2026-11-24', 'present',
    TIMESTAMPTZ '2026-11-24 08:00:00+07', TIMESTAMPTZ '2026-11-24 16:00:00+07',
    'd5000000-0000-4000-8000-000000000201'
  )->>'replayed',
  'false',
  'Admin can record attendance for an active employee'
);
SELECT is(
  (SELECT attendance_status || '|' || check_in_at::DATE::TEXT
   FROM public.hris_attendance
   WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND employee_id = 'd5000000-0000-4000-8000-000000000101'
     AND work_date = DATE '2026-11-24'),
  'present|2026-11-24',
  'attendance persists for the employee and work date'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.hris_attendance_events
   WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND employee_id = 'd5000000-0000-4000-8000-000000000101'
     AND work_date = DATE '2026-11-24'),
  1,
  'attendance create appends an audit event'
);
SELECT is(
  public.record_hris_attendance(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    DATE '2026-11-24', 'present',
    TIMESTAMPTZ '2026-11-24 08:00:00+07', TIMESTAMPTZ '2026-11-24 16:00:00+07',
    'd5000000-0000-4000-8000-000000000201'
  )->>'replayed',
  'true',
  'retrying the same attendance request is idempotent'
);
SELECT throws_ok(
  $$SELECT public.record_hris_attendance(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    DATE '2026-11-24', 'late',
    TIMESTAMPTZ '2026-11-24 08:30:00+07', TIMESTAMPTZ '2026-11-24 16:00:00+07',
    'd5000000-0000-4000-8000-000000000201'
  )$$,
  '23505',
  'ID permintaan kehadiran telah digunakan untuk data berbeda',
  'an idempotency key cannot replay changed attendance data'
);
SELECT throws_ok(
  $$SELECT public.record_hris_attendance(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    DATE '2026-11-25', 'absent',
    TIMESTAMPTZ '2026-11-25 08:00:00+07', NULL,
    'd5000000-0000-4000-8000-000000000202'
  )$$,
  '22023',
  'Data kehadiran tidak valid',
  'absent attendance cannot include check-in data'
);

SELECT is(
  public.request_hris_leave(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    'annual', DATE '2026-12-01', DATE '2026-12-03',
    'Keperluan keluarga', 'd5000000-0000-4000-8000-000000000301'
  )->>'status',
  'pending',
  'Admin can submit a leave request for an active employee'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.hris_leave_events e
   JOIN public.hris_leave_requests r
     ON r.tenant_id = e.tenant_id AND r.id = e.leave_request_id
   WHERE e.tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND r.employee_id = 'd5000000-0000-4000-8000-000000000101'
     AND r.starts_on = DATE '2026-12-01'),
  1,
  'leave request creation is audited'
);
SELECT is(
  public.request_hris_leave(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    'annual', DATE '2026-12-01', DATE '2026-12-03',
    'Keperluan keluarga', 'd5000000-0000-4000-8000-000000000301'
  )->>'replayed',
  'true',
  'retrying the same leave request is idempotent'
);
SELECT throws_ok(
  $$SELECT public.request_hris_leave(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    'd5000000-0000-4000-8000-000000000101',
    'personal', DATE '2026-12-02', DATE '2026-12-04',
    'Perlu urusan pribadi', 'd5000000-0000-4000-8000-000000000302'
  )$$,
  '23505',
  'Tanggal cuti bertabrakan dengan permintaan pending atau cuti yang disetujui',
  'overlapping pending leave requests are rejected'
);

SELECT is(
  public.review_hris_leave(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    (SELECT id FROM public.hris_leave_requests
     WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
       AND employee_id = 'd5000000-0000-4000-8000-000000000101'
       AND starts_on = DATE '2026-12-01'),
    'approved', 'Disetujui', 'd5000000-0000-4000-8000-000000000303'
  )->>'status',
  'approved',
  'Admin can approve a pending leave request'
);
SELECT is(
  (SELECT status || '|' || review_note
   FROM public.hris_leave_requests
   WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND employee_id = 'd5000000-0000-4000-8000-000000000101'
     AND starts_on = DATE '2026-12-01'),
  'approved|Disetujui',
  'leave decision and review note are persisted'
);
SELECT is(
  public.review_hris_leave(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    (SELECT id FROM public.hris_leave_requests
     WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
       AND employee_id = 'd5000000-0000-4000-8000-000000000101'
       AND starts_on = DATE '2026-12-01'),
    'approved', 'Disetujui', 'd5000000-0000-4000-8000-000000000303'
  )->>'replayed',
  'true',
  'retrying the same leave decision is idempotent'
);
SELECT is(
  (SELECT count(*)::INTEGER FROM public.hris_leave_events e
   JOIN public.hris_leave_requests r
     ON r.tenant_id = e.tenant_id AND r.id = e.leave_request_id
   WHERE e.tenant_id = 'd5000000-0000-4000-8000-000000000001'
     AND r.employee_id = 'd5000000-0000-4000-8000-000000000101'
     AND r.starts_on = DATE '2026-12-01'),
  2,
  'leave approval appends a second audit event'
);
SELECT throws_ok(
  $$SELECT public.review_hris_leave(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000011',
    (SELECT id FROM public.hris_leave_requests
     WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
       AND employee_id = 'd5000000-0000-4000-8000-000000000101'
       AND starts_on = DATE '2026-12-01'),
    'rejected', NULL, 'd5000000-0000-4000-8000-000000000304'
  )$$,
  '22023',
  'Keputusan cuti tidak valid',
  'a rejected leave request requires a review note'
);
SELECT throws_ok(
  $$SELECT public.review_hris_leave(
    'd5000000-0000-4000-8000-000000000001',
    'd5000000-0000-4000-8000-000000000021',
    (SELECT id FROM public.hris_leave_requests
     WHERE tenant_id = 'd5000000-0000-4000-8000-000000000001'
       AND employee_id = 'd5000000-0000-4000-8000-000000000101'
       AND starts_on = DATE '2026-12-01'),
    'approved', 'Tidak berwenang', 'd5000000-0000-4000-8000-000000000305'
  )$$,
  '42501',
  'Admin tenant dengan izin HRIS diperlukan',
  'an administrator from another tenant cannot review leave'
);

SELECT * FROM finish();
ROLLBACK;
