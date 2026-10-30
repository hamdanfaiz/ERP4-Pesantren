-- Enforce cooperative daily wallet limits using each tenant's configured calendar.
BEGIN;

CREATE OR REPLACE FUNCTION public.checkout_cooperative_wallet_sale(
  p_tenant_id UUID,p_actor_user_id UUID,p_wallet_id UUID,p_items JSONB,p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_wallet public.cooperative_wallets%ROWTYPE;
  v_control public.finance_controls%ROWTYPE;
  v_line RECORD;
  v_existing_sale public.cooperative_sales%ROWTYPE;
  v_product public.cooperative_products%ROWTYPE;
  v_student_status TEXT;
  v_total NUMERIC:=0;
  v_sale UUID;
  v_item_count INTEGER;
  v_daily_spent NUMERIC;
  v_tenant_time_zone TEXT;
  v_local_day DATE;
  v_day_start TIMESTAMPTZ;
  v_day_end TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);
  IF p_wallet_id IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'Invalid cooperative sale' USING ERRCODE='22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER)
    WHERE product_id IS NULL OR quantity IS NULL OR quantity<1 OR quantity>500
  ) THEN
    RAISE EXCEPTION 'Invalid sale item' USING ERRCODE='22023';
  END IF;
  SELECT count(*) INTO v_item_count FROM (
    SELECT x.product_id FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER) GROUP BY x.product_id
  ) q;
  IF v_item_count<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'Duplicate product in sale' USING ERRCODE='22023'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-sale:'||p_request_id::TEXT,0));
  SELECT * INTO v_existing_sale FROM public.cooperative_sales
    WHERE tenant_id=p_tenant_id AND client_request_id=p_request_id;
  IF FOUND THEN
    IF v_existing_sale.created_by<>p_actor_user_id OR EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_items) AS requested(product_id UUID,quantity INTEGER)
      FULL OUTER JOIN public.cooperative_sale_items AS saved
        ON saved.tenant_id=p_tenant_id
        AND saved.sale_id=v_existing_sale.id
        AND saved.product_id=requested.product_id
      WHERE requested.product_id IS NULL
        OR saved.product_id IS NULL
        OR requested.quantity IS DISTINCT FROM saved.quantity
    ) THEN
      RAISE EXCEPTION 'Request ID was already used for different sale data' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing_sale.id,'totalAmount',v_existing_sale.total_amount,'replayed',true);
  END IF;

  INSERT INTO public.finance_controls(tenant_id,finance_locked,updated_by_user_id)
    VALUES(p_tenant_id,false,p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id=p_tenant_id FOR SHARE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan tenant sedang ditutup' USING ERRCODE='55000'; END IF;

  SELECT * INTO v_wallet FROM public.cooperative_wallets
    WHERE tenant_id=p_tenant_id AND id=p_wallet_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.status<>'active' THEN RAISE EXCEPTION 'Active wallet unavailable' USING ERRCODE='P0002'; END IF;
  SELECT status INTO v_student_status FROM public.students
    WHERE tenant_id=p_tenant_id AND id=v_wallet.student_id FOR SHARE;
  IF NOT FOUND OR lower(COALESCE(v_student_status,''))<>'active' THEN RAISE EXCEPTION 'Active student required' USING ERRCODE='23514'; END IF;

  FOR v_line IN
    SELECT x.product_id,sum(x.quantity)::INTEGER AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER)
    GROUP BY x.product_id ORDER BY x.product_id
  LOOP
    SELECT * INTO v_product FROM public.cooperative_products
      WHERE tenant_id=p_tenant_id AND id=v_line.product_id AND status='active' FOR UPDATE;
    IF NOT FOUND OR v_product.stock_quantity<v_line.quantity THEN
      RAISE EXCEPTION 'Product unavailable or out of stock' USING ERRCODE='23514';
    END IF;
    v_total:=v_total+(v_product.unit_price*v_line.quantity);
  END LOOP;
  IF v_total<=0 OR v_total>999999999999 THEN
    RAISE EXCEPTION 'Sale total is outside the Finance ledger amount range' USING ERRCODE='22023';
  END IF;

  SELECT time_zone INTO v_tenant_time_zone FROM public.tenants
    WHERE id=p_tenant_id AND status='active';
  IF NOT FOUND OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name=v_tenant_time_zone
  ) THEN
    RAISE EXCEPTION 'Tenant time zone is invalid' USING ERRCODE='22023';
  END IF;
  v_local_day:=(now() AT TIME ZONE v_tenant_time_zone)::DATE;
  v_day_start:=v_local_day::TIMESTAMP AT TIME ZONE v_tenant_time_zone;
  v_day_end:=(v_local_day+1)::TIMESTAMP AT TIME ZONE v_tenant_time_zone;
  SELECT COALESCE(sum(-amount_delta),0) INTO v_daily_spent FROM public.cooperative_wallet_ledger
    WHERE tenant_id=p_tenant_id AND wallet_id=p_wallet_id AND entry_type='purchase'
      AND created_at>=v_day_start AND created_at<v_day_end;
  IF v_wallet.balance<v_total THEN RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE='23514'; END IF;
  IF v_daily_spent+v_total>v_wallet.daily_limit THEN RAISE EXCEPTION 'Daily wallet limit exceeded' USING ERRCODE='23514'; END IF;

  INSERT INTO public.cooperative_sales(tenant_id,wallet_id,student_id,total_amount,client_request_id,created_by)
    VALUES(p_tenant_id,p_wallet_id,v_wallet.student_id,v_total,p_request_id,p_actor_user_id) RETURNING id INTO v_sale;
  FOR v_line IN
    SELECT x.product_id,sum(x.quantity)::INTEGER AS quantity
    FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER)
    GROUP BY x.product_id ORDER BY x.product_id
  LOOP
    SELECT * INTO v_product FROM public.cooperative_products
      WHERE tenant_id=p_tenant_id AND id=v_line.product_id FOR UPDATE;
    INSERT INTO public.cooperative_sale_items(
      tenant_id,sale_id,product_id,sku_snapshot,name_snapshot,quantity,cost_price,unit_price,line_total
    ) VALUES(
      p_tenant_id,v_sale,v_product.id,v_product.sku,v_product.name,v_line.quantity,
      v_product.cost_price,v_product.unit_price,v_product.unit_price*v_line.quantity
    );
    UPDATE public.cooperative_products SET stock_quantity=stock_quantity-v_line.quantity,
      updated_by=p_actor_user_id,updated_at=now()
      WHERE tenant_id=p_tenant_id AND id=v_product.id;
    INSERT INTO public.cooperative_stock_movements(
      tenant_id,product_id,sale_id,quantity_delta,balance_after,reason,client_request_id,created_by
    ) VALUES(
      p_tenant_id,v_product.id,v_sale,-v_line.quantity,v_product.stock_quantity-v_line.quantity,
      'Penjualan koperasi '||v_sale::TEXT,gen_random_uuid(),p_actor_user_id
    );
  END LOOP;

  UPDATE public.cooperative_wallets SET balance=balance-v_total,updated_by=p_actor_user_id,updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=p_wallet_id;
  INSERT INTO public.cooperative_wallet_ledger(
    tenant_id,wallet_id,student_id,sale_id,entry_type,amount_delta,balance_after,reference,client_request_id,created_by
  ) VALUES(
    p_tenant_id,p_wallet_id,v_wallet.student_id,v_sale,'purchase',-v_total,v_wallet.balance-v_total,
    'Pembelian koperasi '||v_sale::TEXT,p_request_id,p_actor_user_id
  );
  INSERT INTO public.finance_ledger(
    tenant_id,entry_type,source_type,source_id,description,amount,payment_method,actor_user_id
  ) VALUES(
    p_tenant_id,'custodial_release','cooperative_sale',v_sale,
    'Saldo titipan santri digunakan pada penjualan koperasi '||v_sale::TEXT,v_total,'Saldo dompet',p_actor_user_id
  );
  RETURN jsonb_build_object('id',v_sale,'totalAmount',v_total,'balanceAfter',v_wallet.balance-v_total,'replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID) TO service_role;

COMMENT ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID) IS
  'Atomically charges student wallet, posts sales and stock ledgers, and enforces the daily limit in the tenant time zone.';

COMMIT;

