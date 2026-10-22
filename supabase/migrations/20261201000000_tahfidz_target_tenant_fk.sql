-- Reinforce the tenant contract on the Tahfidz target idempotency ledger.
-- Its target reference must be in the same tenant as the request row.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.tahfidz_target_write_requests AS request
    LEFT JOIN public.tahfidz_targets AS target
      ON target.id = request.target_id
    WHERE target.id IS NULL OR target.tenant_id IS DISTINCT FROM request.tenant_id
  ) THEN
    RAISE EXCEPTION 'Tahfidz target write requests contain a missing or cross-tenant target reference';
  END IF;
END;
$$;

ALTER TABLE public.tahfidz_targets
  ADD CONSTRAINT tahfidz_targets_tenant_id_id_key UNIQUE (tenant_id, id);

ALTER TABLE public.tahfidz_target_write_requests
  DROP CONSTRAINT tahfidz_target_write_requests_target_id_fkey;

ALTER TABLE public.tahfidz_target_write_requests
  ADD CONSTRAINT tahfidz_target_write_requests_tenant_target_fkey
  FOREIGN KEY (tenant_id, target_id)
  REFERENCES public.tahfidz_targets (tenant_id, id)
  ON DELETE RESTRICT;

COMMIT;
