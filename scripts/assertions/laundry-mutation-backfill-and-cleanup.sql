-- CI-only verification and cleanup for synthetic migration backfills.
-- This script must run only against the isolated local Supabase stack.
BEGIN;

DO $verify_migration_backfills$
DECLARE
  v_tenant UUID := 'e1500000-0000-4000-8000-000000000009';
BEGIN
  IF (SELECT count(*) FROM public.laundry_mutation_requests WHERE tenant_id=v_tenant) <> 3 THEN
    RAISE EXCEPTION 'Expected exactly three synthetic Laundry mutation receipts';
  END IF;

  IF NOT (
    SELECT count(DISTINCT client_request_id)=3
      AND count(*) FILTER (WHERE
        (client_request_id='e1500000-0000-4000-8000-000000000401' AND operation='create_order')
        OR (client_request_id='e1500000-0000-4000-8000-000000000402' AND operation='transition_order')
        OR (client_request_id='e1500000-0000-4000-8000-000000000403' AND operation='save_settings')
      )=3
    FROM public.laundry_mutation_requests
    WHERE tenant_id=v_tenant
  ) THEN
    RAISE EXCEPTION 'Synthetic Laundry event types were not mapped to the expected operations';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.laundry_mutation_requests
    WHERE tenant_id=v_tenant AND payload_fingerprint IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Legacy Laundry payload fingerprints must remain unknown (NULL)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.laundry_mutation_requests
    WHERE tenant_id=v_tenant
      AND client_request_id='e1500000-0000-4000-8000-000000000401'
      AND response=jsonb_build_object(
        'id','e1500000-0000-4000-8000-000000000301'::UUID,
        'orderNumber','LDY-BACKFILL-001','replayed',true
      )
  ) THEN
    RAISE EXCEPTION 'Order receipt response did not preserve the saved order identity';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.laundry_mutation_requests
    WHERE tenant_id=v_tenant
      AND client_request_id='e1500000-0000-4000-8000-000000000402'
      AND response=jsonb_build_object(
        'id','e1500000-0000-4000-8000-000000000301'::UUID,
        'status','washing','replayed',true
      )
  ) THEN
    RAISE EXCEPTION 'Status receipt did not preserve the recorded resulting status';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.laundry_mutation_requests
    WHERE tenant_id=v_tenant
      AND client_request_id='e1500000-0000-4000-8000-000000000403'
      AND response=jsonb_build_object('replayed',true)
  ) THEN
    RAISE EXCEPTION 'Settings receipt did not reserve the legacy request safely';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.laundry_mutation_requests r
    JOIN public.laundry_events e
      ON e.tenant_id=r.tenant_id AND e.client_request_id=r.client_request_id
    WHERE r.tenant_id=v_tenant
      AND (r.actor_user_id IS DISTINCT FROM e.actor_user_id OR r.created_at IS DISTINCT FROM e.created_at)
  ) THEN
    RAISE EXCEPTION 'Laundry backfill did not preserve the original actor and timestamp';
  END IF;

  IF (SELECT count(*) FROM public.donation_mutation_requests WHERE tenant_id=v_tenant) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.donation_mutation_requests
       WHERE tenant_id=v_tenant
         AND client_request_id='e1500000-0000-4000-8000-000000000512'
         AND actor_user_id='e1500000-0000-4000-8000-000000000011'
         AND operation='campaign'
         AND payload_fingerprint IS NULL
         AND response=jsonb_build_object(
           'id','e1500000-0000-4000-8000-000000000511'::UUID,'replayed',true
         )
         AND created_at='2026-01-02 03:34:05+00'::timestamptz
     ) THEN
    RAISE EXCEPTION 'Donation legacy receipt did not preserve actor, operation, response, or timestamp';
  END IF;

  IF (SELECT count(*) FROM public.cooperative_supplier_mutation_requests WHERE tenant_id=v_tenant) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.cooperative_supplier_mutation_requests
       WHERE tenant_id=v_tenant
         AND client_request_id='e1500000-0000-4000-8000-000000000602'
         AND actor_user_id='e1500000-0000-4000-8000-000000000011'
         AND operation='legacy'
         AND payload_fingerprint IS NULL
         AND response=jsonb_build_object(
           'id','e1500000-0000-4000-8000-000000000601'::UUID,'replayed',true
         )
         AND created_at='2026-01-02 03:44:05+00'::timestamptz
     ) THEN
    RAISE EXCEPTION 'Cooperative supplier legacy receipt did not preserve actor, operation, response, or timestamp';
  END IF;

  IF (SELECT count(*) FROM public.guardian_user_accounts WHERE tenant_id=v_tenant) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.guardian_user_accounts
       WHERE tenant_id=v_tenant
         AND guardian_id='e1500000-0000-4000-8000-000000000501'
         AND user_id='e1500000-0000-4000-8000-000000000012'
         AND status='active'
     ) THEN
    RAISE EXCEPTION 'Legacy Wali account was not mapped to its unique guardian';
  END IF;

  IF (SELECT count(*) FROM public.student_room_assignment_history
      WHERE tenant_id=v_tenant AND student_id='e1500000-0000-4000-8000-000000000201'
        AND event_type='baseline_snapshot') <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.student_room_assignment_history
       WHERE tenant_id=v_tenant
         AND student_id='e1500000-0000-4000-8000-000000000201'
         AND event_type='baseline_snapshot'
         AND room_id='LBF-R1' AND room_name='Kamar Backfill'
         AND building_id='LBF-G1' AND building_name='Gedung Backfill'
         AND previous_room_id IS NULL AND previous_building_id IS NULL
         AND changed_by IS NULL
         AND change_source='migration_baseline'
     ) THEN
    RAISE EXCEPTION 'Cutover room baseline did not preserve the assigned room/building without inventing history';
  END IF;
END;
$verify_migration_backfills$;

-- Remove all synthetic Auth/domain rows before tests that exercise the Auth HTTP API.
DELETE FROM public.laundry_mutation_requests
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.donation_mutation_requests
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';

-- The supplier ledger is immutable at runtime. Disable its guard only while
-- cleaning this CI-only fixture on the isolated local database.
ALTER TABLE public.cooperative_supplier_mutation_requests
  DISABLE TRIGGER cooperative_supplier_requests_immutable;
DELETE FROM public.cooperative_supplier_mutation_requests
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
ALTER TABLE public.cooperative_supplier_mutation_requests
  ENABLE TRIGGER cooperative_supplier_requests_immutable;

DELETE FROM public.donation_audit_events
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.cooperative_suppliers
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.laundry_events
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.laundry_orders
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.cooperative_wallets
WHERE tenant_id='e1500000-0000-4000-8000-000000000009'
  AND student_id='e1500000-0000-4000-8000-000000000201';
DELETE FROM public.student_room_assignment_history
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.guardian_user_accounts
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.guardian_students
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.guardians
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.students
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.master_data_records
WHERE tenant_id='e1500000-0000-4000-8000-000000000009' AND category='Kamar';
DELETE FROM public.master_data_records
WHERE tenant_id='e1500000-0000-4000-8000-000000000009' AND category='Gedung';
DELETE FROM public.profiles
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM auth.users
WHERE id IN (
  'e1500000-0000-4000-8000-000000000011',
  'e1500000-0000-4000-8000-000000000012'
);
DELETE FROM public.candidates
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.tenants
WHERE id='e1500000-0000-4000-8000-000000000009';

COMMIT;
