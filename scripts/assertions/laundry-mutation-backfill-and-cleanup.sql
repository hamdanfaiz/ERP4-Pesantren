-- CI-only verification and cleanup for the synthetic Laundry migration backfill.
-- This script must run only against the isolated local Supabase stack.
BEGIN;

DO $verify_laundry_backfill$
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
END;
$verify_laundry_backfill$;

-- Remove all synthetic Auth/domain rows before tests that exercise the Auth HTTP API.
DELETE FROM public.laundry_mutation_requests
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.laundry_events
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.laundry_orders
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.students
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.candidates
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM public.profiles
WHERE tenant_id='e1500000-0000-4000-8000-000000000009';
DELETE FROM auth.users
WHERE id='e1500000-0000-4000-8000-000000000011';
DELETE FROM public.tenants
WHERE id='e1500000-0000-4000-8000-000000000009';

COMMIT;
