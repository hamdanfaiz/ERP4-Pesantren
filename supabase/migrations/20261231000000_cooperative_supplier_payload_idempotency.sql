-- Bind supplier retries to their tenant, actor, operation, and full JSON payload.
BEGIN;

CREATE TABLE public.cooperative_supplier_mutation_requests (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create','update','deactivate','legacy')),
  payload_fingerprint TEXT,
  response JSONB NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, client_request_id),
  FOREIGN KEY (tenant_id, actor_user_id)
    REFERENCES public.profiles (tenant_id, user_id) ON DELETE RESTRICT,
  CHECK (
    (operation = 'legacy' AND payload_fingerprint IS NULL)
    OR (operation IN ('create','update','deactivate')
      AND payload_fingerprint IS NOT NULL
      AND payload_fingerprint ~ '^[0-9a-f]{64}$')
  )
);

ALTER TABLE public.cooperative_supplier_mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_supplier_mutation_requests FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cooperative_supplier_mutation_requests
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_cooperative_supplier_request_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Ledger idempotensi pemasok bersifat permanen' USING ERRCODE = '55000';
END;
$$;

REVOKE ALL ON FUNCTION public.reject_cooperative_supplier_request_mutation()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER cooperative_supplier_requests_immutable
  BEFORE UPDATE OR DELETE ON public.cooperative_supplier_mutation_requests
  FOR EACH ROW EXECUTE FUNCTION public.reject_cooperative_supplier_request_mutation();

-- Reserve the latest request key retained on each supplier. Its original payload
-- is unavailable, so it is rejected on reuse instead of receiving a false replay.
INSERT INTO public.cooperative_supplier_mutation_requests
  (tenant_id, client_request_id, actor_user_id, operation, payload_fingerprint, response, created_at)
SELECT tenant_id, client_request_id, COALESCE(updated_by, created_by), 'legacy', NULL,
  jsonb_build_object('id', id, 'replayed', true), created_at
FROM public.cooperative_suppliers
WHERE client_request_id IS NOT NULL
ON CONFLICT (tenant_id, client_request_id) DO NOTHING;

ALTER FUNCTION public.manage_cooperative_supplier(UUID, UUID, JSONB)
  RENAME TO manage_cooperative_supplier_pre_payload_guard;

REVOKE ALL ON FUNCTION public.manage_cooperative_supplier_pre_payload_guard(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.manage_cooperative_supplier(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_item JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions, pg_temp
AS $$
DECLARE
  v_operation TEXT;
  v_request_id UUID;
  v_fingerprint TEXT;
  v_previous public.cooperative_supplier_mutation_requests%ROWTYPE;
  v_response JSONB;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id, p_actor_user_id, false);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Payload pemasok tidak valid' USING ERRCODE = '22023';
  END IF;

  v_operation := COALESCE(p_item->>'action', '');
  IF v_operation NOT IN ('create','update','deactivate') THEN
    RAISE EXCEPTION 'Tindakan pemasok tidak didukung' USING ERRCODE = '22023';
  END IF;
  v_request_id := NULLIF(p_item->>'clientRequestId', '')::UUID;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'ID permintaan wajib diisi' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    p_tenant_id::TEXT || ':cooperative-supplier:' || v_request_id::TEXT, 0
  ));
  v_fingerprint := encode(
    extensions.digest(convert_to(p_item::TEXT, 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT * INTO v_previous
  FROM public.cooperative_supplier_mutation_requests
  WHERE tenant_id = p_tenant_id AND client_request_id = v_request_id;

  IF FOUND THEN
    IF v_previous.actor_user_id IS DISTINCT FROM p_actor_user_id
      OR v_previous.operation IS DISTINCT FROM v_operation
      OR v_previous.payload_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'ID permintaan pemasok sudah digunakan untuk perubahan berbeda'
        USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_set(v_previous.response, '{replayed}', 'true'::jsonb, true);
  END IF;

  v_response := public.manage_cooperative_supplier_pre_payload_guard(
    p_tenant_id, p_actor_user_id, p_item
  );

  INSERT INTO public.cooperative_supplier_mutation_requests (
    tenant_id, client_request_id, actor_user_id, operation, payload_fingerprint, response
  ) VALUES (
    p_tenant_id, v_request_id, p_actor_user_id, v_operation, v_fingerprint, v_response
  );

  RETURN v_response;
END;
$$;

REVOKE ALL ON FUNCTION public.manage_cooperative_supplier(UUID, UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_cooperative_supplier(UUID, UUID, JSONB)
  TO service_role;

COMMENT ON TABLE public.cooperative_supplier_mutation_requests IS
  'Tenant-scoped immutable request ledger preventing duplicate or conflicting supplier mutations.';

COMMIT;
