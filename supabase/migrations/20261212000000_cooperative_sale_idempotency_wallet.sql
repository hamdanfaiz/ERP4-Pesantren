-- Keep an idempotent cooperative sale bound to the wallet used by its first attempt.
-- The wrapper takes the same transaction advisory lock as the existing checkout RPC
-- before checking the saved sale, so concurrent retries cannot bypass this guard.
BEGIN;

ALTER FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID)
  RENAME TO checkout_cooperative_wallet_sale_pre_wallet_guard;

REVOKE ALL ON FUNCTION public.checkout_cooperative_wallet_sale_pre_wallet_guard(UUID,UUID,UUID,JSONB,UUID)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.checkout_cooperative_wallet_sale(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_wallet_id UUID,
  p_items JSONB,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_existing_sale public.cooperative_sales%ROWTYPE;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);

  IF p_wallet_id IS NULL OR p_request_id IS NULL THEN
    RETURN public.checkout_cooperative_wallet_sale_pre_wallet_guard(
      p_tenant_id,p_actor_user_id,p_wallet_id,p_items,p_request_id
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_tenant_id::TEXT||':cooperative-sale:'||p_request_id::TEXT,0)
  );
  SELECT * INTO v_existing_sale FROM public.cooperative_sales
    WHERE tenant_id=p_tenant_id AND client_request_id=p_request_id;
  IF FOUND AND v_existing_sale.wallet_id IS DISTINCT FROM p_wallet_id THEN
    RAISE EXCEPTION 'Request ID was already used for different sale data' USING ERRCODE='23505';
  END IF;

  RETURN public.checkout_cooperative_wallet_sale_pre_wallet_guard(
    p_tenant_id,p_actor_user_id,p_wallet_id,p_items,p_request_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID)
  TO service_role;

COMMENT ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID) IS
  'Atomically performs a wallet sale and rejects reuse of an idempotency key for another wallet.';

COMMIT;
