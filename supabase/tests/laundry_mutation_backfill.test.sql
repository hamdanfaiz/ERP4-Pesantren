-- Confirms the pending Laundry migration preserves legacy request identities without guessing payloads.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions;
SELECT plan(8);

SELECT is(
  (SELECT count(*)::INTEGER FROM public.laundry_mutation_requests
   WHERE tenant_id='e1500000-0000-4000-8000-000000000009'),
  3,
  'all synthetic legacy Laundry events receive one idempotency receipt'
);

SELECT ok(
  (SELECT count(*)=3
     AND count(DISTINCT client_request_id)=3
     AND count(*) FILTER (WHERE
       (client_request_id='e1500000-0000-4000-8000-000000000401' AND operation='create_order')
       OR (client_request_id='e1500000-0000-4000-8000-000000000402' AND operation='transition_order')
       OR (client_request_id='e1500000-0000-4000-8000-000000000403' AND operation='save_settings')
     )=3
   FROM public.laundry_mutation_requests
   WHERE tenant_id='e1500000-0000-4000-8000-000000000009'),
  'historical Laundry event types map to their corresponding guarded operations'
);

SELECT ok(
  (SELECT bool_and(payload_fingerprint IS NULL)
   FROM public.laundry_mutation_requests
   WHERE tenant_id='e1500000-0000-4000-8000-000000000009'),
  'legacy fingerprints remain NULL because their full request payload is unknowable'
);

SELECT ok(
  (SELECT response=jsonb_build_object(
      'id','e1500000-0000-4000-8000-000000000301'::UUID,
      'orderNumber','LDY-BACKFILL-001','replayed',true)
   FROM public.laundry_mutation_requests
   WHERE tenant_id='e1500000-0000-4000-8000-000000000009'
     AND client_request_id='e1500000-0000-4000-8000-000000000401'),
  'order receipt replays the saved order identity and order number'
);

SELECT ok(
  (SELECT response=jsonb_build_object(
      'id','e1500000-0000-4000-8000-000000000301'::UUID,
      'status','washing','replayed',true)
   FROM public.laundry_mutation_requests
   WHERE tenant_id='e1500000-0000-4000-8000-000000000009'
     AND client_request_id='e1500000-0000-4000-8000-000000000402'),
  'status receipt replays the recorded resulting status'
);

SELECT ok(
  (SELECT response=jsonb_build_object('replayed',true)
   FROM public.laundry_mutation_requests
   WHERE tenant_id='e1500000-0000-4000-8000-000000000009'
     AND client_request_id='e1500000-0000-4000-8000-000000000403'),
  'settings receipt is reserved without repeating the settings side effect'
);

SELECT ok(
  (SELECT bool_and(r.actor_user_id=e.actor_user_id)
   FROM public.laundry_mutation_requests r
   JOIN public.laundry_events e
     ON e.tenant_id=r.tenant_id AND e.client_request_id=r.client_request_id
   WHERE r.tenant_id='e1500000-0000-4000-8000-000000000009'),
  'backfill preserves the original Laundry event actors'
);

SELECT ok(
  (SELECT bool_and(r.created_at=e.created_at)
   FROM public.laundry_mutation_requests r
   JOIN public.laundry_events e
     ON e.tenant_id=r.tenant_id AND e.client_request_id=r.client_request_id
   WHERE r.tenant_id='e1500000-0000-4000-8000-000000000009'),
  'backfill preserves the original Laundry event timestamps'
);

SELECT * FROM finish();
ROLLBACK;
