-- Tenant-scoped cooperative marketplace with server-side stock reservation.
-- Staged only; reconcile the remote migration history before applying.
BEGIN;

CREATE TABLE public.marketplace_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL CHECK (length(btrim(sku)) BETWEEN 1 AND 40),
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 180),
  category TEXT NOT NULL DEFAULT '' CHECK (length(category)<=100),
  unit_price NUMERIC(16,2) NOT NULL CHECK (unit_price>=0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity>=0),
  seller TEXT NOT NULL DEFAULT '' CHECK (length(seller)<=120),
  image_label TEXT NOT NULL DEFAULT '' CHECK (length(image_label)<=80),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT,
  source_fingerprint TEXT,
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,sku),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX marketplace_products_tenant_status_idx ON public.marketplace_products(tenant_id,status,category,name);
CREATE UNIQUE INDEX marketplace_products_legacy_source_uq ON public.marketplace_products(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.marketplace_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  customer_name TEXT NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 160),
  customer_type TEXT NOT NULL CHECK (customer_type IN ('Parent','Alumni','Public','Internal')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready_to_ship','delivered','cancelled')),
  item_count INTEGER NOT NULL CHECK (item_count>0),
  total_amount NUMERIC(16,2) NOT NULL CHECK (total_amount>=0),
  source_system TEXT NOT NULL DEFAULT 'supabase_runtime' CHECK (source_system IN ('supabase_runtime','legacy_firestore')),
  source_record_id TEXT,
  source_fingerprint TEXT,
  legacy_date_known BOOLEAN NOT NULL DEFAULT true,
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,updated_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT,
  CHECK ((source_system='legacy_firestore' AND source_record_id IS NOT NULL AND source_fingerprint IS NOT NULL AND source_fingerprint ~ '^[0-9a-f]{64}$') OR (source_system='supabase_runtime' AND source_record_id IS NULL AND source_fingerprint IS NULL))
);
CREATE INDEX marketplace_orders_tenant_created_idx ON public.marketplace_orders(tenant_id,created_at DESC,id DESC);
CREATE UNIQUE INDEX marketplace_orders_legacy_source_uq ON public.marketplace_orders(tenant_id,source_record_id) WHERE source_system='legacy_firestore';

CREATE TABLE public.marketplace_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  product_id UUID,
  product_sku_snapshot TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity>0),
  unit_price NUMERIC(16,2) NOT NULL CHECK (unit_price>=0),
  line_total NUMERIC(16,2) NOT NULL CHECK (line_total>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id,order_id) REFERENCES public.marketplace_orders(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,product_id) REFERENCES public.marketplace_products(tenant_id,id) ON DELETE RESTRICT
);
CREATE INDEX marketplace_order_items_order_idx ON public.marketplace_order_items(tenant_id,order_id,created_at,id);

CREATE TABLE public.marketplace_stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  order_id UUID,
  quantity_delta INTEGER NOT NULL CHECK (quantity_delta<>0),
  balance_after INTEGER NOT NULL CHECK (balance_after>=0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,id),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,product_id) REFERENCES public.marketplace_products(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,order_id) REFERENCES public.marketplace_orders(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);
CREATE INDEX marketplace_stock_movements_history_idx ON public.marketplace_stock_movements(tenant_id,product_id,created_at DESC);

CREATE TABLE public.marketplace_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  order_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created','status_changed')),
  before_status TEXT,
  after_status TEXT NOT NULL,
  client_request_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,client_request_id),
  FOREIGN KEY (tenant_id,order_id) REFERENCES public.marketplace_orders(tenant_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

CREATE TABLE public.marketplace_legacy_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  source_count INTEGER NOT NULL CHECK (source_count>=0),
  imported_products INTEGER NOT NULL CHECK (imported_products>=0),
  imported_orders INTEGER NOT NULL CHECK (imported_orders>=0),
  skipped_count INTEGER NOT NULL CHECK (skipped_count>=0),
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,snapshot_fingerprint),
  FOREIGN KEY (tenant_id,created_by) REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

DO $$ DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['marketplace_products','marketplace_orders','marketplace_order_items','marketplace_stock_movements','marketplace_order_events','marketplace_legacy_import_batches'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated',v_table);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role',v_table);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.manage_marketplace_product(p_tenant_id UUID,p_actor_user_id UUID,p_item JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_action TEXT; v_id UUID; v_request UUID; v_before JSONB; v_after JSONB; v_sku TEXT; v_name TEXT; v_category TEXT; v_price NUMERIC; v_stock INTEGER; v_seller TEXT; v_image TEXT;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR jsonb_typeof(p_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid marketplace product' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'marketplace',false) OR COALESCE(module_permissions->>'marketplace','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace permission required' USING ERRCODE='42501'; END IF;
  v_action:=COALESCE(p_item->>'action',''); v_request:=NULLIF(p_item->>'clientRequestId','')::UUID;
  IF v_request IS NULL THEN RAISE EXCEPTION 'Request ID required' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-product:'||v_request::TEXT,0));
  SELECT id INTO v_id FROM public.marketplace_products WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_id,'replayed',true); END IF;
  IF v_action='create' THEN
    v_sku:=btrim(COALESCE(p_item->>'sku','')); v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_price:=COALESCE(NULLIF(p_item->>'unitPrice','')::NUMERIC,0); v_stock:=COALESCE(NULLIF(p_item->>'initialStock','')::INTEGER,0); v_seller:=btrim(COALESCE(p_item->>'seller','')); v_image:=btrim(COALESCE(p_item->>'imageLabel',''));
    IF length(v_sku) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_price<0 OR v_stock<0 OR length(v_seller)>120 OR length(v_image)>80 THEN RAISE EXCEPTION 'Invalid marketplace product fields' USING ERRCODE='22023'; END IF;
    INSERT INTO public.marketplace_products(tenant_id,sku,name,category,unit_price,stock_quantity,seller,image_label,client_request_id,created_by,updated_by)
      VALUES(p_tenant_id,v_sku,v_name,v_category,v_price,v_stock,v_seller,v_image,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
    IF v_stock>0 THEN INSERT INTO public.marketplace_stock_movements(tenant_id,product_id,quantity_delta,balance_after,reason,client_request_id,created_by) VALUES(p_tenant_id,v_id,v_stock,v_stock,'Stok awal produk',v_request,p_actor_user_id); END IF;
  ELSIF v_action IN ('update','archive') THEN
    v_id:=NULLIF(p_item->>'id','')::UUID;
    SELECT to_jsonb(p) INTO v_before FROM public.marketplace_products p WHERE p.tenant_id=p_tenant_id AND p.id=v_id AND p.status='active' FOR UPDATE;
    IF v_before IS NULL THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='P0002'; END IF;
    IF v_action='update' THEN
      v_sku:=btrim(COALESCE(p_item->>'sku','')); v_name:=btrim(COALESCE(p_item->>'name','')); v_category:=btrim(COALESCE(p_item->>'category','')); v_price:=COALESCE(NULLIF(p_item->>'unitPrice','')::NUMERIC,0); v_seller:=btrim(COALESCE(p_item->>'seller','')); v_image:=btrim(COALESCE(p_item->>'imageLabel',''));
      IF length(v_sku) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_price<0 OR length(v_seller)>120 OR length(v_image)>80 THEN RAISE EXCEPTION 'Invalid marketplace product fields' USING ERRCODE='22023'; END IF;
      UPDATE public.marketplace_products SET sku=v_sku,name=v_name,category=v_category,unit_price=v_price,seller=v_seller,image_label=v_image,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    ELSE
      IF (v_before->>'stock_quantity')::INTEGER<>0 THEN RAISE EXCEPTION 'Product must have zero stock before archiving' USING ERRCODE='23514'; END IF;
      UPDATE public.marketplace_products SET status='archived',updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_id;
    END IF;
  ELSE RAISE EXCEPTION 'Unsupported marketplace product action' USING ERRCODE='22023'; END IF;
  SELECT to_jsonb(p) INTO v_after FROM (SELECT sku,name,category,unit_price,stock_quantity,seller,image_label,status FROM public.marketplace_products p WHERE p.tenant_id=p_tenant_id AND p.id=v_id) p;
  RETURN jsonb_build_object('id',v_id,'replayed',false,'product',v_after);
END $$;

CREATE OR REPLACE FUNCTION public.adjust_marketplace_stock(p_tenant_id UUID,p_actor_user_id UUID,p_product_id UUID,p_delta INTEGER,p_reason TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_product public.marketplace_products%ROWTYPE; v_movement UUID;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_product_id IS NULL OR p_delta=0 OR p_client_request_id IS NULL OR length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Invalid marketplace stock adjustment' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'marketplace',false) OR COALESCE(module_permissions->>'marketplace','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace permission required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-stock:'||p_client_request_id::TEXT,0));
  SELECT id INTO v_movement FROM public.marketplace_stock_movements WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id;
  IF v_movement IS NOT NULL THEN RETURN jsonb_build_object('id',v_movement,'replayed',true); END IF;
  SELECT * INTO v_product FROM public.marketplace_products WHERE tenant_id=p_tenant_id AND id=p_product_id AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product not found' USING ERRCODE='P0002'; END IF;
  IF v_product.stock_quantity+p_delta<0 THEN RAISE EXCEPTION 'Stock cannot become negative' USING ERRCODE='23514'; END IF;
  INSERT INTO public.marketplace_stock_movements(tenant_id,product_id,quantity_delta,balance_after,reason,client_request_id,created_by)
    VALUES(p_tenant_id,p_product_id,p_delta,v_product.stock_quantity+p_delta,btrim(p_reason),p_client_request_id,p_actor_user_id) RETURNING id INTO v_movement;
  UPDATE public.marketplace_products SET stock_quantity=v_product.stock_quantity+p_delta,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_product_id;
  RETURN jsonb_build_object('id',v_movement,'balance',v_product.stock_quantity+p_delta,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.create_marketplace_order(p_tenant_id UUID,p_actor_user_id UUID,p_order JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_request UUID; v_order_id UUID; v_customer TEXT; v_type TEXT; v_item JSONB; v_line RECORD; v_product public.marketplace_products%ROWTYPE; v_count INTEGER; v_total NUMERIC:=0; v_item_count INTEGER:=0;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR jsonb_typeof(p_order) IS DISTINCT FROM 'object' OR jsonb_typeof(p_order->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_order->'items') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid marketplace order' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'marketplace',false) OR COALESCE(module_permissions->>'marketplace','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace permission required' USING ERRCODE='42501'; END IF;
  v_request:=NULLIF(p_order->>'clientRequestId','')::UUID; v_customer:=btrim(COALESCE(p_order->>'customerName','')); v_type:=COALESCE(p_order->>'customerType','');
  IF v_request IS NULL OR length(v_customer) NOT BETWEEN 1 AND 160 OR v_type NOT IN ('Parent','Alumni','Public','Internal') THEN RAISE EXCEPTION 'Invalid marketplace customer fields' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-order:'||v_request::TEXT,0));
  SELECT id INTO v_order_id FROM public.marketplace_orders WHERE tenant_id=p_tenant_id AND client_request_id=v_request;
  IF v_order_id IS NOT NULL THEN RETURN jsonb_build_object('id',v_order_id,'replayed',true); END IF;
  IF EXISTS (SELECT 1 FROM jsonb_to_recordset(p_order->'items') AS x(product_id UUID,quantity INTEGER) WHERE product_id IS NULL OR quantity IS NULL OR quantity<1 OR quantity>100000) THEN RAISE EXCEPTION 'Invalid marketplace order lines' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_count FROM (SELECT x.product_id FROM jsonb_to_recordset(p_order->'items') AS x(product_id UUID,quantity INTEGER) GROUP BY x.product_id) q;
  IF v_count<>jsonb_array_length(p_order->'items') THEN RAISE EXCEPTION 'Duplicate product in order lines' USING ERRCODE='22023'; END IF;
  FOR v_line IN SELECT x.product_id,sum(x.quantity)::INTEGER AS quantity FROM jsonb_to_recordset(p_order->'items') AS x(product_id UUID,quantity INTEGER) GROUP BY x.product_id ORDER BY x.product_id LOOP
    SELECT * INTO v_product FROM public.marketplace_products WHERE tenant_id=p_tenant_id AND id=v_line.product_id AND status='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not available' USING ERRCODE='P0002'; END IF;
    IF v_product.stock_quantity<v_line.quantity THEN RAISE EXCEPTION 'Insufficient marketplace stock' USING ERRCODE='23514'; END IF;
    v_total:=v_total+(v_product.unit_price*v_line.quantity); v_item_count:=v_item_count+v_line.quantity;
  END LOOP;
  INSERT INTO public.marketplace_orders(tenant_id,customer_name,customer_type,status,item_count,total_amount,client_request_id,created_by,updated_by)
    VALUES(p_tenant_id,v_customer,v_type,'pending',v_item_count,v_total,v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_order_id;
  FOR v_line IN SELECT x.product_id,sum(x.quantity)::INTEGER AS quantity FROM jsonb_to_recordset(p_order->'items') AS x(product_id UUID,quantity INTEGER) GROUP BY x.product_id ORDER BY x.product_id LOOP
    SELECT * INTO v_product FROM public.marketplace_products WHERE tenant_id=p_tenant_id AND id=v_line.product_id;
    INSERT INTO public.marketplace_order_items(tenant_id,order_id,product_id,product_sku_snapshot,product_name_snapshot,quantity,unit_price,line_total)
      VALUES(p_tenant_id,v_order_id,v_product.id,v_product.sku,v_product.name,v_line.quantity,v_product.unit_price,v_product.unit_price*v_line.quantity);
    UPDATE public.marketplace_products SET stock_quantity=stock_quantity-v_line.quantity,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_product.id;
    INSERT INTO public.marketplace_stock_movements(tenant_id,product_id,order_id,quantity_delta,balance_after,reason,client_request_id,created_by)
      VALUES(p_tenant_id,v_product.id,v_order_id,-v_line.quantity,v_product.stock_quantity-v_line.quantity,'Reservasi pesanan '||v_order_id::TEXT,gen_random_uuid(),p_actor_user_id);
  END LOOP;
  INSERT INTO public.marketplace_order_events(tenant_id,order_id,event_type,after_status,client_request_id,created_by) VALUES(p_tenant_id,v_order_id,'created','pending',v_request,p_actor_user_id);
  RETURN jsonb_build_object('id',v_order_id,'totalAmount',v_total,'itemCount',v_item_count,'status','pending','replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.transition_marketplace_order(p_tenant_id UUID,p_actor_user_id UUID,p_order_id UUID,p_status TEXT,p_client_request_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_order public.marketplace_orders%ROWTYPE; v_event UUID; v_line RECORD; v_product public.marketplace_products%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_order_id IS NULL OR p_client_request_id IS NULL OR p_status NOT IN ('processing','ready_to_ship','delivered','cancelled') THEN RAISE EXCEPTION 'Invalid marketplace order transition' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'marketplace',false) OR COALESCE(module_permissions->>'marketplace','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace permission required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-order-status:'||p_client_request_id::TEXT,0));
  SELECT id INTO v_event FROM public.marketplace_order_events WHERE tenant_id=p_tenant_id AND client_request_id=p_client_request_id;
  IF v_event IS NOT NULL THEN RETURN jsonb_build_object('id',p_order_id,'replayed',true); END IF;
  SELECT * INTO v_order FROM public.marketplace_orders WHERE tenant_id=p_tenant_id AND id=p_order_id AND source_system='supabase_runtime' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace order not found' USING ERRCODE='P0002'; END IF;
  IF NOT ((v_order.status='pending' AND p_status IN ('processing','cancelled')) OR (v_order.status='processing' AND p_status IN ('ready_to_ship','cancelled')) OR (v_order.status='ready_to_ship' AND p_status='delivered')) THEN RAISE EXCEPTION 'Invalid marketplace order status transition' USING ERRCODE='23514'; END IF;
  IF p_status='cancelled' THEN
    FOR v_line IN SELECT product_id,quantity FROM public.marketplace_order_items WHERE tenant_id=p_tenant_id AND order_id=p_order_id AND product_id IS NOT NULL ORDER BY product_id LOOP
      SELECT * INTO v_product FROM public.marketplace_products WHERE tenant_id=p_tenant_id AND id=v_line.product_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.marketplace_products SET stock_quantity=stock_quantity+v_line.quantity,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=v_product.id;
        INSERT INTO public.marketplace_stock_movements(tenant_id,product_id,order_id,quantity_delta,balance_after,reason,client_request_id,created_by)
          VALUES(p_tenant_id,v_product.id,p_order_id,v_line.quantity,v_product.stock_quantity+v_line.quantity,'Pembatalan pesanan '||p_order_id::TEXT,gen_random_uuid(),p_actor_user_id);
      END IF;
    END LOOP;
  END IF;
  UPDATE public.marketplace_orders SET status=p_status,updated_by=p_actor_user_id,updated_at=now() WHERE tenant_id=p_tenant_id AND id=p_order_id;
  INSERT INTO public.marketplace_order_events(tenant_id,order_id,event_type,before_status,after_status,client_request_id,created_by) VALUES(p_tenant_id,p_order_id,'status_changed',v_order.status,p_status,p_client_request_id,p_actor_user_id) RETURNING id INTO v_event;
  RETURN jsonb_build_object('id',p_order_id,'status',p_status,'replayed',false);
END $$;

CREATE OR REPLACE FUNCTION public.import_legacy_marketplace(p_tenant_id UUID,p_actor_user_id UUID,p_snapshot_fingerprint TEXT,p_source_count INTEGER,p_items JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_role TEXT; v_batch public.marketplace_legacy_import_batches%ROWTYPE; v_item JSONB; v_kind TEXT; v_source_id TEXT; v_fingerprint TEXT; v_id UUID; v_request UUID; v_products INTEGER:=0; v_orders INTEGER:=0; v_skipped INTEGER:=0; v_sku TEXT; v_name TEXT; v_category TEXT; v_price NUMERIC; v_stock INTEGER; v_seller TEXT; v_image TEXT; v_status TEXT; v_customer TEXT; v_customer_type TEXT; v_item_count INTEGER; v_total NUMERIC; v_date TIMESTAMPTZ; v_date_known BOOLEAN;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_user_id IS NULL OR p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$' OR p_source_count IS NULL OR p_source_count<0 OR p_source_count>6000 OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items)>6000 THEN RAISE EXCEPTION 'Invalid marketplace legacy import' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.tenants WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tenant unavailable' USING ERRCODE='42501'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE tenant_id=p_tenant_id AND user_id=p_actor_user_id AND status='active' AND role IN ('admin','super_admin') AND (NOT COALESCE(module_permissions ? 'marketplace',false) OR COALESCE(module_permissions->>'marketplace','false')='true') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketplace permission required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::TEXT||':marketplace-import:'||p_snapshot_fingerprint,0));
  SELECT * INTO v_batch FROM public.marketplace_legacy_import_batches WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint;
  IF FOUND THEN RETURN jsonb_build_object('products',v_batch.imported_products,'orders',v_batch.imported_orders,'skipped',v_batch.skipped_count,'alreadyApplied',true); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid marketplace legacy item' USING ERRCODE='22023'; END IF;
    v_kind:=COALESCE(v_item->>'kind',''); v_source_id:=COALESCE(v_item->>'sourceRecordId',''); v_fingerprint:=COALESCE(v_item->>'sourceFingerprint','');
    IF v_source_id !~ '^[a-f0-9]{64}$' OR v_fingerprint !~ '^[a-f0-9]{64}$' OR v_kind NOT IN ('product','order') THEN RAISE EXCEPTION 'Invalid marketplace legacy reference' USING ERRCODE='22023'; END IF;
    IF v_kind='product' THEN
      SELECT id,source_fingerprint INTO v_id,v_fingerprint FROM public.marketplace_products WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
      IF v_id IS NOT NULL THEN
        IF v_fingerprint<>v_item->>'sourceFingerprint' THEN RAISE EXCEPTION 'Legacy marketplace product changed after import' USING ERRCODE='23505'; END IF;
        v_skipped:=v_skipped+1; CONTINUE;
      END IF;
      v_sku:=btrim(COALESCE(v_item->>'sku','')); v_name:=btrim(COALESCE(v_item->>'name','')); v_category:=btrim(COALESCE(v_item->>'category','')); v_price:=COALESCE(NULLIF(v_item->>'unitPrice','')::NUMERIC,0); v_stock:=COALESCE(NULLIF(v_item->>'stockQuantity','')::INTEGER,0); v_seller:=btrim(COALESCE(v_item->>'seller','')); v_image:=btrim(COALESCE(v_item->>'imageLabel','')); v_status:=COALESCE(v_item->>'status','active');
      IF length(v_sku) NOT BETWEEN 1 AND 40 OR length(v_name) NOT BETWEEN 1 AND 180 OR length(v_category)>100 OR v_price<0 OR v_stock<0 OR length(v_seller)>120 OR length(v_image)>80 OR v_status NOT IN ('active','archived') THEN RAISE EXCEPTION 'Invalid legacy marketplace product fields' USING ERRCODE='22023'; END IF;
      v_request:=gen_random_uuid();
      INSERT INTO public.marketplace_products(tenant_id,sku,name,category,unit_price,stock_quantity,seller,image_label,status,source_system,source_record_id,source_fingerprint,client_request_id,created_by,updated_by)
        VALUES(p_tenant_id,v_sku,v_name,v_category,v_price,v_stock,v_seller,v_image,v_status,'legacy_firestore',v_source_id,v_item->>'sourceFingerprint',v_request,p_actor_user_id,p_actor_user_id) RETURNING id INTO v_id;
      IF v_stock>0 THEN INSERT INTO public.marketplace_stock_movements(tenant_id,product_id,quantity_delta,balance_after,reason,client_request_id,created_by) VALUES(p_tenant_id,v_id,v_stock,v_stock,'Saldo awal impor Firestore',gen_random_uuid(),p_actor_user_id); END IF;
      v_products:=v_products+1;
    ELSE
      SELECT id,source_fingerprint INTO v_id,v_fingerprint FROM public.marketplace_orders WHERE tenant_id=p_tenant_id AND source_system='legacy_firestore' AND source_record_id=v_source_id;
      IF v_id IS NOT NULL THEN
        IF v_fingerprint<>v_item->>'sourceFingerprint' THEN RAISE EXCEPTION 'Legacy marketplace order changed after import' USING ERRCODE='23505'; END IF;
        v_skipped:=v_skipped+1; CONTINUE;
      END IF;
      v_customer:=btrim(COALESCE(v_item->>'customerName','')); v_customer_type:=COALESCE(v_item->>'customerType',''); v_status:=COALESCE(v_item->>'status',''); v_item_count:=COALESCE(NULLIF(v_item->>'itemCount','')::INTEGER,0); v_total:=COALESCE(NULLIF(v_item->>'totalAmount','')::NUMERIC,0); v_date:=NULLIF(v_item->>'createdAt','')::TIMESTAMPTZ; v_date_known:=v_date IS NOT NULL;
      IF length(v_customer) NOT BETWEEN 1 AND 160 OR v_customer_type NOT IN ('Parent','Alumni','Public','Internal') OR v_status NOT IN ('pending','processing','ready_to_ship','delivered','cancelled') OR v_item_count<1 OR v_total<0 THEN RAISE EXCEPTION 'Invalid legacy marketplace order fields' USING ERRCODE='22023'; END IF;
      v_request:=gen_random_uuid();
      INSERT INTO public.marketplace_orders(tenant_id,customer_name,customer_type,status,item_count,total_amount,source_system,source_record_id,source_fingerprint,legacy_date_known,client_request_id,created_by,updated_by,created_at,updated_at)
        VALUES(p_tenant_id,v_customer,v_customer_type,v_status,v_item_count,v_total,'legacy_firestore',v_source_id,v_item->>'sourceFingerprint',v_date_known,v_request,p_actor_user_id,p_actor_user_id,COALESCE(v_date,now()),COALESCE(v_date,now())) RETURNING id INTO v_id;
      INSERT INTO public.marketplace_order_events(tenant_id,order_id,event_type,after_status,client_request_id,created_by) VALUES(p_tenant_id,v_id,'created',v_status,gen_random_uuid(),p_actor_user_id);
      v_orders:=v_orders+1;
    END IF;
  END LOOP;
  INSERT INTO public.marketplace_legacy_import_batches(tenant_id,snapshot_fingerprint,source_count,imported_products,imported_orders,skipped_count,created_by)
    VALUES(p_tenant_id,p_snapshot_fingerprint,p_source_count,v_products,v_orders,v_skipped,p_actor_user_id);
  RETURN jsonb_build_object('products',v_products,'orders',v_orders,'skipped',v_skipped,'alreadyApplied',false);
END $$;

REVOKE ALL ON FUNCTION public.manage_marketplace_product(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.adjust_marketplace_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.create_marketplace_order(UUID,UUID,JSONB) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.transition_marketplace_order(UUID,UUID,UUID,TEXT,UUID) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.import_legacy_marketplace(UUID,UUID,TEXT,INTEGER,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.manage_marketplace_product(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_marketplace_stock(UUID,UUID,UUID,INTEGER,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_marketplace_order(UUID,UUID,JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_marketplace_order(UUID,UUID,UUID,TEXT,UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_marketplace(UUID,UUID,TEXT,INTEGER,JSONB) TO service_role;

COMMENT ON TABLE public.marketplace_stock_movements IS 'Append-only tenant-scoped stock ledger for marketplace products and reservations.';
COMMENT ON TABLE public.marketplace_order_events IS 'Append-only status history for tenant marketplace orders.';
COMMENT ON TABLE public.marketplace_legacy_import_batches IS 'Admin-reviewed idempotency marker for legacy Firestore Marketplace snapshots.';
COMMIT;
