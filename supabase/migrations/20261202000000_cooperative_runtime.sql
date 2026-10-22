-- Tenant-scoped cooperative inventory, student wallets, and POS sales.
-- Synthetic UI fixtures are intentionally not imported.
BEGIN;

CREATE TABLE public.cooperative_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 48),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  category TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 100),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  cost_price NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  unit_price NUMERIC(16,2) NOT NULL CHECK (unit_price >= 0),
  reorder_point INTEGER NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,sku),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX cooperative_products_tenant_status_idx ON public.cooperative_products(tenant_id,status,category,name);

CREATE TABLE public.cooperative_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  category TEXT NOT NULL DEFAULT '' CHECK (length(category) <= 100),
  contact TEXT NOT NULL DEFAULT '' CHECK (length(contact) <= 80),
  pic TEXT NOT NULL DEFAULT '' CHECK (length(pic) <= 120),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX cooperative_suppliers_tenant_status_idx ON public.cooperative_suppliers(tenant_id,status,name);

CREATE TABLE public.cooperative_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL,
  balance NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  daily_limit NUMERIC(16,2) NOT NULL DEFAULT 50000 CHECK (daily_limit >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,student_id),
  FOREIGN KEY (tenant_id,student_id) REFERENCES public.students(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX cooperative_wallets_tenant_status_idx ON public.cooperative_wallets(tenant_id,status,student_id);

CREATE TABLE public.cooperative_wallet_policy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wallet_id UUID NOT NULL,
  previous_daily_limit NUMERIC(16,2) NOT NULL CHECK (previous_daily_limit >= 0),
  next_daily_limit NUMERIC(16,2) NOT NULL CHECK (next_daily_limit >= 0),
  previous_status TEXT NOT NULL CHECK (previous_status IN ('active','blocked')),
  next_status TEXT NOT NULL CHECK (next_status IN ('active','blocked')),
  client_request_id UUID NOT NULL,
  actor_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,wallet_id) REFERENCES public.cooperative_wallets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,actor_user_id) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX cooperative_wallet_policy_events_history_idx ON public.cooperative_wallet_policy_events(tenant_id,wallet_id,created_at DESC);

CREATE TABLE public.cooperative_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  wallet_id UUID NOT NULL,
  student_id UUID NOT NULL,
  total_amount NUMERIC(16,2) NOT NULL CHECK (total_amount > 0),
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status = 'completed'),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,wallet_id) REFERENCES public.cooperative_wallets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,student_id) REFERENCES public.students(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX cooperative_sales_tenant_created_idx ON public.cooperative_sales(tenant_id,created_at DESC,id DESC);
CREATE INDEX cooperative_sales_wallet_created_idx ON public.cooperative_sales(tenant_id,wallet_id,created_at DESC);

CREATE TABLE public.cooperative_sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  sale_id UUID NOT NULL,
  product_id UUID NOT NULL,
  sku_snapshot TEXT NOT NULL,
  name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  cost_price NUMERIC(16,2) NOT NULL CHECK (cost_price >= 0),
  unit_price NUMERIC(16,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(16,2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,sale_id) REFERENCES public.cooperative_sales(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,product_id) REFERENCES public.cooperative_products(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX cooperative_sale_items_sale_idx ON public.cooperative_sale_items(tenant_id,sale_id,created_at,id);

CREATE TABLE public.cooperative_wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  wallet_id UUID NOT NULL,
  student_id UUID NOT NULL,
  sale_id UUID,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('top_up','purchase','adjustment')),
  amount_delta NUMERIC(16,2) NOT NULL CHECK (amount_delta <> 0),
  balance_after NUMERIC(16,2) NOT NULL CHECK (balance_after >= 0),
  reference TEXT NOT NULL CHECK (length(btrim(reference)) BETWEEN 1 AND 180),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,wallet_id) REFERENCES public.cooperative_wallets(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,student_id) REFERENCES public.students(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,sale_id) REFERENCES public.cooperative_sales(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((entry_type = 'top_up' AND amount_delta > 0 AND sale_id IS NULL) OR
         (entry_type = 'purchase' AND amount_delta < 0 AND sale_id IS NOT NULL) OR
         (entry_type = 'adjustment' AND sale_id IS NULL))
);
CREATE INDEX cooperative_wallet_ledger_wallet_created_idx ON public.cooperative_wallet_ledger(tenant_id,wallet_id,created_at DESC,id DESC);

CREATE TABLE public.cooperative_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  sale_id UUID,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 300),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,product_id) REFERENCES public.cooperative_products(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,sale_id) REFERENCES public.cooperative_sales(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX cooperative_stock_movements_product_created_idx ON public.cooperative_stock_movements(tenant_id,product_id,created_at DESC,id DESC);

CREATE OR REPLACE FUNCTION public.prevent_cooperative_history_mutation()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'Cooperative ledger and transaction history is immutable' USING ERRCODE='42501';
END $$;
CREATE TRIGGER cooperative_sales_immutable BEFORE UPDATE OR DELETE ON public.cooperative_sales
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cooperative_history_mutation();
CREATE TRIGGER cooperative_sale_items_immutable BEFORE UPDATE OR DELETE ON public.cooperative_sale_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cooperative_history_mutation();
CREATE TRIGGER cooperative_wallet_ledger_immutable BEFORE UPDATE OR DELETE ON public.cooperative_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cooperative_history_mutation();
CREATE TRIGGER cooperative_stock_movements_immutable BEFORE UPDATE OR DELETE ON public.cooperative_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cooperative_history_mutation();
CREATE TRIGGER cooperative_wallet_policy_events_immutable BEFORE UPDATE OR DELETE ON public.cooperative_wallet_policy_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cooperative_history_mutation();
REVOKE ALL ON FUNCTION public.prevent_cooperative_history_mutation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.assert_cooperative_actor(p_tenant_id UUID,p_actor_user_id UUID,p_require_finance BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_permissions JSONB;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL THEN RAISE EXCEPTION 'Actor and tenant are required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role,module_permissions INTO v_role,v_permissions FROM public.profiles
    WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' FOR SHARE;
  IF NOT FOUND OR v_role NOT IN ('admin','super_admin') THEN RAISE EXCEPTION 'Cooperative admin access required' USING ERRCODE='42501'; END IF;
  IF v_role <> 'super_admin' AND v_permissions ? 'cooperative' AND COALESCE(v_permissions->>'cooperative','false') <> 'true' THEN
    RAISE EXCEPTION 'Cooperative module access required' USING ERRCODE='42501';
  END IF;
  IF p_require_finance AND v_role <> 'super_admin'
    AND (v_permissions ? 'finance' AND COALESCE(v_permissions->>'finance','false') <> 'true') THEN
    RAISE EXCEPTION 'Finance module access required for wallet top-up' USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.manage_cooperative_product(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action TEXT; v_id UUID; v_request UUID; v_sku TEXT; v_name TEXT; v_category TEXT; v_stock INTEGER; v_cost NUMERIC; v_price NUMERIC; v_reorder INTEGER; v_expiry DATE; v_status TEXT;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid product payload' USING ERRCODE='22023'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-product:'||v_request::TEXT,0));
  SELECT id INTO v_id FROM public.cooperative_products WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  IF v_action='create' THEN
    v_sku:=upper(btrim(COALESCE(p_item->>'sku',''))); v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category',''));
    v_stock:=COALESCE(NULLIF(p_item->>'initialStock','')::INTEGER,0); v_cost:=COALESCE(NULLIF(p_item->>'costPrice','')::NUMERIC,0); v_price:=COALESCE(NULLIF(p_item->>'unitPrice','')::NUMERIC,0);
    v_reorder:=COALESCE(NULLIF(p_item->>'reorderPoint','')::INTEGER,0); v_expiry:=NULLIF(p_item->>'expiryDate','')::DATE;
    IF length(v_sku) NOT BETWEEN 1 AND 48 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_stock<0 OR v_cost<0 OR v_cost>1000000000 OR v_cost<>trunc(v_cost) OR v_price<0 OR v_price>1000000000 OR v_price<>trunc(v_price) OR v_reorder<0 THEN RAISE EXCEPTION 'Invalid product fields' USING ERRCODE='22023'; END IF;
    INSERT INTO public.cooperative_products(tenant_id,sku,name,category,stock_quantity,cost_price,unit_price,reorder_point,expiry_date,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_sku,v_name,v_category,v_stock,v_cost,v_price,v_reorder,v_expiry,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    IF v_stock>0 THEN
      INSERT INTO public.cooperative_stock_movements(tenant_id,product_id,quantity_delta,balance_after,reason,client_request_id,created_by)
        VALUES(p_tenant_id,v_id,v_stock,v_stock,'Stok awal produk',gen_random_uuid(),p_actor_user_id);
    END IF;
  ELSIF v_action IN ('update','archive') THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Product ID required' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.cooperative_products WHERE tenant_id=p_tenant_id AND id=v_id AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='P0002'; END IF;
    IF v_action='archive' THEN
      UPDATE public.cooperative_products SET status='archived',client_request_id=v_request,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    ELSE
      v_sku:=upper(btrim(COALESCE(p_item->>'sku',''))); v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category',''));
      v_cost:=COALESCE(NULLIF(p_item->>'costPrice','')::NUMERIC,0); v_price:=COALESCE(NULLIF(p_item->>'unitPrice','')::NUMERIC,0);
      v_reorder:=COALESCE(NULLIF(p_item->>'reorderPoint','')::INTEGER,0); v_expiry:=NULLIF(p_item->>'expiryDate','')::DATE;
      IF length(v_sku) NOT BETWEEN 1 AND 48 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_cost<0 OR v_cost>1000000000 OR v_cost<>trunc(v_cost) OR v_price<0 OR v_price>1000000000 OR v_price<>trunc(v_price) OR v_reorder<0 THEN RAISE EXCEPTION 'Invalid product fields' USING ERRCODE='22023'; END IF;
      UPDATE public.cooperative_products SET sku=v_sku,name=v_name,category=v_category,cost_price=v_cost,unit_price=v_price,reorder_point=v_reorder,expiry_date=v_expiry,client_request_id=v_request,updated_by=p_actor_user_id,updated_at=now()
        WHERE tenant_id=p_tenant_id AND id=v_id;
    END IF;
  ELSE RAISE EXCEPTION 'Unsupported product action' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.adjust_cooperative_stock(p_tenant_id UUID,p_actor_user_id UUID,p_product_id UUID,p_delta INTEGER,p_reason TEXT,p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_product public.cooperative_products%ROWTYPE; v_existing UUID;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);
  IF p_product_id IS NULL OR p_delta IS NULL OR p_delta=0 OR p_delta NOT BETWEEN -1000000 AND 1000000 OR p_request_id IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid stock adjustment' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-stock:'||p_request_id::TEXT,0));
  SELECT id INTO v_existing FROM public.cooperative_stock_movements WHERE tenant_id=p_tenant_id AND client_request_id=p_request_id;
  IF v_existing IS NOT NULL THEN RETURN jsonb_build_object('id',v_existing,'replayed',true); END IF;
  SELECT * INTO v_product FROM public.cooperative_products WHERE tenant_id=p_tenant_id AND id=p_product_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='P0002'; END IF;
  IF v_product.stock_quantity+p_delta<0 THEN RAISE EXCEPTION 'Stock cannot become negative' USING ERRCODE='23514'; END IF;
  UPDATE public.cooperative_products SET stock_quantity=stock_quantity+p_delta,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_product_id;
  INSERT INTO public.cooperative_stock_movements(tenant_id,product_id,quantity_delta,balance_after,reason,client_request_id,created_by)
    VALUES(p_tenant_id,p_product_id,p_delta,v_product.stock_quantity+p_delta,btrim(p_reason),p_request_id,p_actor_user_id) RETURNING id INTO v_existing;
  RETURN jsonb_build_object('id',v_existing,'balanceAfter',v_product.stock_quantity+p_delta,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.manage_cooperative_supplier(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_action TEXT; v_id UUID; v_request UUID; v_name TEXT; v_category TEXT; v_contact TEXT; v_pic TEXT; v_status TEXT;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);
  IF jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid supplier payload' USING ERRCODE='22023'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-supplier:'||v_request::TEXT,0));
  SELECT id INTO v_id FROM public.cooperative_suppliers WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  IF v_action='create' THEN
    v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_contact:=btrim(COALESCE(p_item->>'contact','')); v_pic:=btrim(COALESCE(p_item->>'pic',''));
    IF length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR length(v_contact)>80 OR length(v_pic)>120 THEN RAISE EXCEPTION 'Invalid supplier fields' USING ERRCODE='22023'; END IF;
    INSERT INTO public.cooperative_suppliers(tenant_id,name,category,contact,pic,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_name,v_category,v_contact,v_pic,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
  ELSIF v_action IN ('update','deactivate') THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Supplier ID required' USING ERRCODE='22023'; END IF;
    PERFORM 1 FROM public.cooperative_suppliers WHERE tenant_id=p_tenant_id AND id=v_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Supplier unavailable' USING ERRCODE='P0002'; END IF;
    IF v_action='deactivate' THEN
      UPDATE public.cooperative_suppliers SET status='inactive',client_request_id=v_request,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    ELSE
      v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_contact:=btrim(COALESCE(p_item->>'contact','')); v_pic:=btrim(COALESCE(p_item->>'pic',''));
      IF length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR length(v_contact)>80 OR length(v_pic)>120 THEN RAISE EXCEPTION 'Invalid supplier fields' USING ERRCODE='22023'; END IF;
      UPDATE public.cooperative_suppliers SET name=v_name,category=v_category,contact=v_contact,pic=v_pic,client_request_id=v_request,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    END IF;
  ELSE RAISE EXCEPTION 'Unsupported supplier action' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',v_id,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.set_cooperative_wallet_policy(p_tenant_id UUID,p_actor_user_id UUID,p_wallet_id UUID,p_daily_limit NUMERIC,p_status TEXT,p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_wallet public.cooperative_wallets%ROWTYPE; v_event UUID;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);
  IF p_wallet_id IS NULL OR p_daily_limit IS NULL OR p_daily_limit<0 OR p_daily_limit>10000000 OR p_daily_limit<>trunc(p_daily_limit) OR p_status NOT IN ('active','blocked') OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid wallet policy' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-wallet-policy:'||p_request_id::TEXT,0));
  SELECT id INTO v_event FROM public.cooperative_wallet_policy_events WHERE tenant_id=p_tenant_id AND client_request_id=p_request_id;
  IF v_event IS NOT NULL THEN RETURN jsonb_build_object('id',p_wallet_id,'replayed',true); END IF;
  SELECT * INTO v_wallet FROM public.cooperative_wallets WHERE tenant_id=p_tenant_id AND id=p_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE='P0002'; END IF;
  UPDATE public.cooperative_wallets SET daily_limit=p_daily_limit,status=p_status,updated_by=p_actor_user_id,updated_at=now()
    WHERE tenant_id=p_tenant_id AND id=p_wallet_id;
  INSERT INTO public.cooperative_wallet_policy_events(tenant_id,wallet_id,previous_daily_limit,next_daily_limit,previous_status,next_status,client_request_id,actor_user_id)
    VALUES(p_tenant_id,p_wallet_id,v_wallet.daily_limit,p_daily_limit,v_wallet.status,p_status,p_request_id,p_actor_user_id) RETURNING id INTO v_event;
  RETURN jsonb_build_object('id',v_event,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.top_up_cooperative_wallet(p_tenant_id UUID,p_actor_user_id UUID,p_wallet_id UUID,p_amount NUMERIC,p_reference TEXT,p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_wallet public.cooperative_wallets%ROWTYPE; v_ledger UUID;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,true);
  IF p_wallet_id IS NULL OR p_amount IS NULL OR p_amount<=0 OR p_amount>100000000 OR p_request_id IS NULL OR length(btrim(COALESCE(p_reference,''))) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Invalid wallet top-up' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-wallet:'||p_request_id::TEXT,0));
  SELECT id INTO v_ledger FROM public.cooperative_wallet_ledger WHERE tenant_id=p_tenant_id AND client_request_id=p_request_id;
  IF v_ledger IS NOT NULL THEN RETURN jsonb_build_object('id',v_ledger,'replayed',true); END IF;
  SELECT * INTO v_wallet FROM public.cooperative_wallets WHERE tenant_id=p_tenant_id AND id=p_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet unavailable' USING ERRCODE='P0002'; END IF;
  IF v_wallet.status<>'active' THEN RAISE EXCEPTION 'Wallet is blocked' USING ERRCODE='23514'; END IF;
  UPDATE public.cooperative_wallets SET balance=balance+p_amount,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_wallet_id;
  INSERT INTO public.cooperative_wallet_ledger(tenant_id,wallet_id,student_id,entry_type,amount_delta,balance_after,reference,client_request_id,created_by)
    VALUES(p_tenant_id,p_wallet_id,v_wallet.student_id,'top_up',p_amount,v_wallet.balance+p_amount,btrim(p_reference),p_request_id,p_actor_user_id) RETURNING id INTO v_ledger;
  RETURN jsonb_build_object('id',v_ledger,'balanceAfter',v_wallet.balance+p_amount,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.checkout_cooperative_wallet_sale(p_tenant_id UUID,p_actor_user_id UUID,p_wallet_id UUID,p_items JSONB,p_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_wallet public.cooperative_wallets%ROWTYPE; v_line RECORD; v_product public.cooperative_products%ROWTYPE; v_student_status TEXT; v_total NUMERIC:=0; v_sale UUID; v_item_count INTEGER; v_daily_spent NUMERIC; v_day_start TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,false);
  IF p_wallet_id IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid cooperative sale' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER) WHERE product_id IS NULL OR quantity IS NULL OR quantity<1 OR quantity>500) THEN RAISE EXCEPTION 'Invalid sale item' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_item_count FROM (SELECT x.product_id FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER) GROUP BY x.product_id) q;
  IF v_item_count<>jsonb_array_length(p_items) THEN RAISE EXCEPTION 'Duplicate product in sale' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':cooperative-sale:'||p_request_id::TEXT,0));
  SELECT id INTO v_sale FROM public.cooperative_sales WHERE tenant_id=p_tenant_id AND client_request_id=p_request_id;
  IF v_sale IS NOT NULL THEN RETURN jsonb_build_object('id',v_sale,'replayed',true); END IF;
  SELECT * INTO v_wallet FROM public.cooperative_wallets WHERE tenant_id=p_tenant_id AND id=p_wallet_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.status<>'active' THEN RAISE EXCEPTION 'Active wallet unavailable' USING ERRCODE='P0002'; END IF;
  SELECT status INTO v_student_status FROM public.students WHERE tenant_id=p_tenant_id AND id=v_wallet.student_id FOR SHARE;
  IF NOT FOUND OR lower(COALESCE(v_student_status,''))<>'active' THEN RAISE EXCEPTION 'Active student required' USING ERRCODE='23514'; END IF;
  FOR v_line IN SELECT x.product_id,sum(x.quantity)::INTEGER AS quantity FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER) GROUP BY x.product_id ORDER BY x.product_id LOOP
    SELECT * INTO v_product FROM public.cooperative_products WHERE tenant_id=p_tenant_id AND id=v_line.product_id AND status='active' FOR UPDATE;
    IF NOT FOUND OR v_product.stock_quantity<v_line.quantity THEN RAISE EXCEPTION 'Product unavailable or out of stock' USING ERRCODE='23514'; END IF;
    v_total:=v_total+(v_product.unit_price*v_line.quantity);
  END LOOP;
  IF v_total<=0 THEN RAISE EXCEPTION 'Sale total must be positive' USING ERRCODE='22023'; END IF;
  v_day_start:=date_trunc('day',now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta';
  SELECT COALESCE(sum(-amount_delta),0) INTO v_daily_spent FROM public.cooperative_wallet_ledger
    WHERE tenant_id=p_tenant_id AND wallet_id=p_wallet_id AND entry_type='purchase' AND created_at>=v_day_start;
  IF v_wallet.balance<v_total THEN RAISE EXCEPTION 'Insufficient wallet balance' USING ERRCODE='23514'; END IF;
  IF v_daily_spent+v_total>v_wallet.daily_limit THEN RAISE EXCEPTION 'Daily wallet limit exceeded' USING ERRCODE='23514'; END IF;
  INSERT INTO public.cooperative_sales(tenant_id,wallet_id,student_id,total_amount,client_request_id,created_by)
    VALUES(p_tenant_id,p_wallet_id,v_wallet.student_id,v_total,p_request_id,p_actor_user_id) RETURNING id INTO v_sale;
  FOR v_line IN SELECT x.product_id,sum(x.quantity)::INTEGER AS quantity FROM jsonb_to_recordset(p_items) AS x(product_id UUID,quantity INTEGER) GROUP BY x.product_id ORDER BY x.product_id LOOP
    SELECT * INTO v_product FROM public.cooperative_products WHERE tenant_id=p_tenant_id AND id=v_line.product_id FOR UPDATE;
    INSERT INTO public.cooperative_sale_items(tenant_id,sale_id,product_id,sku_snapshot,name_snapshot,quantity,cost_price,unit_price,line_total)
      VALUES(p_tenant_id,v_sale,v_product.id,v_product.sku,v_product.name,v_line.quantity,v_product.cost_price,v_product.unit_price,v_product.unit_price*v_line.quantity);
    UPDATE public.cooperative_products SET stock_quantity=stock_quantity-v_line.quantity,updated_by=p_actor_user_id,updated_at=now()
      WHERE tenant_id=p_tenant_id AND id=v_product.id;
    INSERT INTO public.cooperative_stock_movements(tenant_id,product_id,sale_id,quantity_delta,balance_after,reason,client_request_id,created_by)
      VALUES(p_tenant_id,v_product.id,v_sale,-v_line.quantity,v_product.stock_quantity-v_line.quantity,'Penjualan koperasi '||v_sale::TEXT,gen_random_uuid(),p_actor_user_id);
  END LOOP;
  UPDATE public.cooperative_wallets SET balance=balance-v_total,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_wallet_id;
  INSERT INTO public.cooperative_wallet_ledger(tenant_id,wallet_id,student_id,sale_id,entry_type,amount_delta,balance_after,reference,client_request_id,created_by)
    VALUES(p_tenant_id,p_wallet_id,v_wallet.student_id,v_sale,'purchase',-v_total,v_wallet.balance-v_total,'Pembelian koperasi '||v_sale::TEXT,p_request_id,p_actor_user_id);
  RETURN jsonb_build_object('id',v_sale,'totalAmount',v_total,'balanceAfter',v_wallet.balance-v_total,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.create_cooperative_wallet_for_student()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF lower(COALESCE(NEW.status,''))='active' THEN
    INSERT INTO public.cooperative_wallets(tenant_id,student_id) VALUES(NEW.tenant_id,NEW.id) ON CONFLICT (tenant_id,student_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER cooperative_student_wallet_after_insert
  AFTER INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.create_cooperative_wallet_for_student();
INSERT INTO public.cooperative_wallets(tenant_id,student_id)
  SELECT tenant_id,id FROM public.students WHERE lower(status)='active' ON CONFLICT (tenant_id,student_id) DO NOTHING;

DO $$ DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['cooperative_products','cooperative_suppliers','cooperative_wallets','cooperative_wallet_policy_events','cooperative_sales','cooperative_sale_items','cooperative_wallet_ledger','cooperative_stock_movements'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',v_table);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON TABLE public.%I TO service_role',v_table);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.assert_cooperative_actor(UUID,UUID,BOOLEAN) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_cooperative_product(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.adjust_cooperative_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.manage_cooperative_supplier(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.set_cooperative_wallet_policy(UUID,UUID,UUID,NUMERIC,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.top_up_cooperative_wallet(UUID,UUID,UUID,NUMERIC,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_cooperative_wallet_for_student() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assert_cooperative_actor(UUID,UUID,BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_cooperative_product(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_cooperative_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_cooperative_supplier(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_cooperative_wallet_policy(UUID,UUID,UUID,NUMERIC,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.top_up_cooperative_wallet(UUID,UUID,UUID,NUMERIC,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkout_cooperative_wallet_sale(UUID,UUID,UUID,JSONB,UUID) TO service_role;

COMMIT;
