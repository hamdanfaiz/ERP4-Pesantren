BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = public, extensions;
SELECT plan(3);

SELECT ok(to_regclass('public.academic_records_tenant_kind_created_id_live_idx') IS NOT NULL,
  'tenant/type history has a live-row cursor index');
SELECT ok(to_regclass('public.academic_records_tenant_teacher_kind_created_id_live_idx') IS NOT NULL,
  'teacher-scoped history has a live-row cursor index');
SELECT ok(to_regclass('public.academic_records_tenant_unit_kind_created_id_live_idx') IS NOT NULL,
  'unit-scoped history has a live-row cursor index');

SELECT * FROM finish();
ROLLBACK;
