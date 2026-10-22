-- Post cooperative wallet top-ups and wallet-funded sales to the tenant Finance cashbook atomically.
-- Custodial movements are not income/expense; full double-entry accounting remains a separate domain.
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cooperative_wallet_ledger WHERE entry_type='top_up')
    OR EXISTS (SELECT 1 FROM public.cooperative_sales) THEN
    RAISE EXCEPTION 'Cooperative transactions already exist; reconcile their Finance subledger before applying this migration';
  END IF;
END;
$$;

ALTER TABLE public.finance_ledger
  DROP CONSTRAINT IF EXISTS finance_ledger_entry_type_check,
  DROP CONSTRAINT IF EXISTS finance_ledger_source_type_check,
  DROP CONSTRAINT IF EXISTS finance_ledger_check;

ALTER TABLE public.finance_ledger
  ADD CONSTRAINT finance_ledger_entry_type_check
    CHECK (entry_type IN ('income','expense','custodial_inflow','custodial_release')),
  ADD CONSTRAINT finance_ledger_source_type_check
    CHECK (source_type IN ('bill','expense','cooperative_wallet','cooperative_sale')),
  ADD CONSTRAINT finance_ledger_source_entry_pair_check
    CHECK ((entry_type='income' AND source_type='bill')
        OR (entry_type='expense' AND source_type='expense')
        OR (entry_type='custodial_inflow' AND source_type='cooperative_wallet')
        OR (entry_type='custodial_release' AND source_type='cooperative_sale'));

CREATE OR REPLACE FUNCTION public.validate_finance_cooperative_wallet_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE v_top_up public.cooperative_wallet_ledger%ROWTYPE; v_sale public.cooperative_sales%ROWTYPE;
BEGIN
  IF NEW.source_type='cooperative_wallet' THEN
    SELECT * INTO v_top_up FROM public.cooperative_wallet_ledger
      WHERE tenant_id=NEW.tenant_id AND id=NEW.source_id;
    IF NOT FOUND OR v_top_up.entry_type<>'top_up' OR NEW.entry_type<>'custodial_inflow'
      OR NEW.amount<>v_top_up.amount_delta OR NEW.actor_user_id<>v_top_up.created_by
      OR NEW.receipt_no IS DISTINCT FROM v_top_up.reference THEN
      RAISE EXCEPTION 'Finance entry does not match its cooperative wallet top-up' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.source_type='cooperative_sale' THEN
    SELECT * INTO v_sale FROM public.cooperative_sales
      WHERE tenant_id=NEW.tenant_id AND id=NEW.source_id;
    IF NOT FOUND OR NEW.entry_type<>'custodial_release'
      OR NEW.amount<>v_sale.total_amount OR NEW.actor_user_id<>v_sale.created_by
      OR NEW.receipt_no IS NOT NULL THEN
      RAISE EXCEPTION 'Finance entry does not match its cooperative sale' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_ledger_validate_cooperative_wallet_source
  BEFORE INSERT ON public.finance_ledger
  FOR EACH ROW EXECUTE FUNCTION public.validate_finance_cooperative_wallet_source();
REVOKE ALL ON FUNCTION public.validate_finance_cooperative_wallet_source() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.top_up_cooperative_wallet(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_wallet_id UUID,
  p_amount NUMERIC,
  p_reference TEXT,
  p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_wallet public.cooperative_wallets%ROWTYPE;
  v_existing public.cooperative_wallet_ledger%ROWTYPE;
  v_control public.finance_controls%ROWTYPE;
  v_ledger UUID;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,true);

  IF p_wallet_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>100000000
    OR p_amount<>trunc(p_amount) OR p_request_id IS NULL
    OR length(btrim(COALESCE(p_reference,''))) NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'Invalid wallet top-up' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-wallet:'||p_request_id::TEXT,0));
  SELECT * INTO v_existing FROM public.cooperative_wallet_ledger
    WHERE tenant_id=p_tenant_id AND client_request_id=p_request_id;
  IF FOUND THEN
    IF v_existing.entry_type<>'top_up' OR v_existing.wallet_id<>p_wallet_id
      OR v_existing.amount_delta<>p_amount OR v_existing.reference<>btrim(p_reference)
      OR v_existing.created_by<>p_actor_user_id THEN
      RAISE EXCEPTION 'Request ID was already used for different wallet top-up data' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('id',v_existing.id,'balanceAfter',v_existing.balance_after,'replayed',true);
  END IF;

  INSERT INTO public.finance_controls(tenant_id,finance_locked,updated_by_user_id)
    VALUES(p_tenant_id,false,p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id=p_tenant_id FOR SHARE;
  IF v_control.finance_locked THEN RAISE EXCEPTION 'Buku keuangan tenant sedang ditutup' USING ERRCODE='55000'; END IF;

  SELECT * INTO v_wallet FROM public.cooperative_wallets
    WHERE tenant_id=p_tenant_id AND id=p_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE='P0002'; END IF;
  IF v_wallet.status<>'active' THEN RAISE EXCEPTION 'Wallet is blocked' USING ERRCODE='23514'; END IF;

  UPDATE public.cooperative_wallets SET balance=balance+p_amount,updated_by=p_actor_user_id,updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=p_wallet_id;
  INSERT INTO public.cooperative_wallet_ledger(
    tenant_id,wallet_id,student_id,entry_type,amount_delta,balance_after,reference,client_request_id,created_by
  ) VALUES(
    p_tenant_id,p_wallet_id,v_wallet.student_id,'top_up',p_amount,v_wallet.balance+p_amount,
    btrim(p_reference),p_request_id,p_actor_user_id
  ) RETURNING id INTO v_ledger;

  INSERT INTO public.finance_ledger(
    tenant_id,entry_type,source_type,source_id,description,amount,payment_method,receipt_no,actor_user_id
  ) VALUES(
    p_tenant_id,'custodial_inflow','cooperative_wallet',v_ledger,
    'Top-up dompet santri - '||btrim(p_reference),p_amount,'Koperasi',btrim(p_reference),p_actor_user_id
  );

  RETURN jsonb_build_object('id',v_ledger,'balanceAfter',v_wallet.balance+p_amount,'replayed',false);
END;
$$;

REVOKE ALL ON FUNCTION public.top_up_cooperative_wallet(UUID,UUID,UUID,NUMERIC,TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.top_up_cooperative_wallet(UUID,UUID,UUID,NUMERIC,TEXT,UUID) TO service_role;

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
  v_day_start TIMESTAMPTZ;
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

  v_day_start:=date_trunc('day',now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta';
  SELECT COALESCE(sum(-amount_delta),0) INTO v_daily_spent FROM public.cooperative_wallet_ledger
    WHERE tenant_id=p_tenant_id AND wallet_id=p_wallet_id AND entry_type='purchase' AND created_at>=v_day_start;
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

COMMENT ON CONSTRAINT finance_ledger_source_type_check ON public.finance_ledger IS
  'Finance sources include settled bills, approved expenses, student wallet deposits, and wallet-funded cooperative sales.';
COMMENT ON TABLE public.finance_ledger IS
  'Tenant-scoped cashbook and cooperative custodial subledger. custodial_inflow/release describe student wallet liabilities and are not income/expense totals.';

COMMIT;
