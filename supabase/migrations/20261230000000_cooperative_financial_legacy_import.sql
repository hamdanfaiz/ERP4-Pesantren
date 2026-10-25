-- Atomically import reconciled legacy cooperative balances and sales.
-- Imported sales preserve source dates; stock is not decremented because catalog stock is the current snapshot.
BEGIN;

-- Historical cost is not present in the archive. Keep that fact explicit instead of inventing a cost.
ALTER TABLE public.cooperative_sale_items
  ALTER COLUMN cost_price DROP NOT NULL,
  ADD COLUMN cost_snapshot_known BOOLEAN NOT NULL DEFAULT true,
  ADD CONSTRAINT cooperative_sale_items_cost_snapshot_known_check
    CHECK ((cost_snapshot_known AND cost_price IS NOT NULL) OR (NOT cost_snapshot_known AND cost_price IS NULL));

ALTER TABLE public.cooperative_wallet_ledger
  ADD COLUMN entry_sequence BIGINT GENERATED ALWAYS AS IDENTITY;
CREATE UNIQUE INDEX cooperative_wallet_ledger_wallet_sequence_uq
  ON public.cooperative_wallet_ledger(tenant_id,wallet_id,entry_sequence);
ALTER TABLE public.cooperative_wallet_ledger
  DROP CONSTRAINT IF EXISTS cooperative_wallet_ledger_entry_type_check,
  DROP CONSTRAINT IF EXISTS cooperative_wallet_ledger_check,
  ADD CONSTRAINT cooperative_wallet_ledger_entry_type_check
    CHECK (entry_type IN ('top_up','purchase','adjustment','opening_balance')),
  ADD CONSTRAINT cooperative_wallet_ledger_type_sign_check
    CHECK (
      (entry_type IN ('top_up','opening_balance') AND amount_delta > 0 AND sale_id IS NULL)
      OR (entry_type='purchase' AND amount_delta < 0 AND sale_id IS NOT NULL)
      OR (entry_type='adjustment' AND sale_id IS NULL)
    );

CREATE TABLE public.cooperative_financial_import_batches (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  snapshot_fingerprint TEXT NOT NULL CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  payload_fingerprint TEXT NOT NULL CHECK (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  wallet_count INTEGER NOT NULL CHECK (wallet_count BETWEEN 0 AND 1000),
  sale_count INTEGER NOT NULL CHECK (sale_count BETWEEN 0 AND 1000),
  item_count INTEGER NOT NULL CHECK (item_count BETWEEN 0 AND 5000),
  imported_by_user_id UUID NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,snapshot_fingerprint),
  FOREIGN KEY (tenant_id,imported_by_user_id)
    REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

CREATE TABLE public.cooperative_financial_import_records (
  tenant_id UUID NOT NULL,
  snapshot_fingerprint TEXT NOT NULL,
  record_kind TEXT NOT NULL CHECK (record_kind IN ('wallet_opening','sale')),
  source_ref TEXT NOT NULL CHECK (source_ref ~ '^[0-9a-f]{64}$'),
  source_fingerprint TEXT NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  target_record_id UUID NOT NULL,
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,record_kind,source_ref),
  FOREIGN KEY (tenant_id,snapshot_fingerprint)
    REFERENCES public.cooperative_financial_import_batches(tenant_id,snapshot_fingerprint) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id,created_by_user_id)
    REFERENCES public.profiles(tenant_id,user_id) ON DELETE RESTRICT
);

ALTER TABLE public.cooperative_financial_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_financial_import_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_financial_import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cooperative_financial_import_records FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cooperative_financial_import_batches FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.cooperative_financial_import_records FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON TABLE public.cooperative_financial_import_batches TO service_role;
GRANT SELECT,INSERT ON TABLE public.cooperative_financial_import_records TO service_role;
CREATE TRIGGER cooperative_financial_import_batches_immutable
  BEFORE UPDATE OR DELETE ON public.cooperative_financial_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cooperative_history_mutation();
CREATE TRIGGER cooperative_financial_import_records_immutable
  BEFORE UPDATE OR DELETE ON public.cooperative_financial_import_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cooperative_history_mutation();

CREATE OR REPLACE FUNCTION public.validate_finance_cooperative_wallet_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,pg_temp
AS $$
DECLARE
  v_wallet_entry public.cooperative_wallet_ledger%ROWTYPE;
  v_sale public.cooperative_sales%ROWTYPE;
BEGIN
  IF NEW.source_type='cooperative_wallet' THEN
    SELECT * INTO v_wallet_entry FROM public.cooperative_wallet_ledger
      WHERE tenant_id=NEW.tenant_id AND id=NEW.source_id;
    IF NOT FOUND
      OR v_wallet_entry.entry_type NOT IN ('top_up','opening_balance')
      OR NEW.entry_type<>'custodial_inflow'
      OR NEW.amount<>v_wallet_entry.amount_delta
      OR NEW.actor_user_id<>v_wallet_entry.created_by
      OR (v_wallet_entry.entry_type='top_up' AND NEW.receipt_no IS DISTINCT FROM v_wallet_entry.reference)
      OR (v_wallet_entry.entry_type='opening_balance' AND NEW.receipt_no IS NOT NULL) THEN
      RAISE EXCEPTION 'Finance entry does not match its cooperative wallet inflow' USING ERRCODE='23514';
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
REVOKE ALL ON FUNCTION public.validate_finance_cooperative_wallet_source() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.apply_cooperative_legacy_financial_history(
  p_tenant_id UUID,
  p_actor_user_id UUID,
  p_snapshot_fingerprint TEXT,
  p_payload_fingerprint TEXT,
  p_confirm_complete_history BOOLEAN,
  p_wallets JSONB,
  p_transactions JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,pg_temp
AS $$
DECLARE
  v_previous public.cooperative_financial_import_batches%ROWTYPE;
  v_wallet_json JSONB;
  v_transaction JSONB;
  v_item JSONB;
  v_wallet public.cooperative_wallets%ROWTYPE;
  v_product public.cooperative_products%ROWTYPE;
  v_control public.finance_controls%ROWTYPE;
  v_wallet_count INTEGER;
  v_sale_count INTEGER;
  v_item_count INTEGER;
  v_seen_items INTEGER:=0;
  v_wallet_id UUID;
  v_student_id UUID;
  v_sale_id UUID;
  v_ledger_id UUID;
  v_opening_ledger_id UUID;
  v_source_ref TEXT;
  v_source_fingerprint TEXT;
  v_target_wallet_id UUID;
  v_product_id UUID;
  v_request_id UUID;
  v_created_at TIMESTAMPTZ;
  v_opening_at TIMESTAMPTZ;
  v_earliest_at TIMESTAMPTZ;
  v_time_zone TEXT;
  v_opening NUMERIC(16,2);
  v_expected_closing NUMERIC(16,2);
  v_declared_sales NUMERIC(16,2);
  v_actual_sales NUMERIC(16,2);
  v_balance NUMERIC(16,2);
  v_sale_total NUMERIC(16,2);
  v_line_total NUMERIC(16,2);
  v_price NUMERIC(16,2);
  v_quantity INTEGER;
  v_line_count INTEGER;
  v_imported_sales INTEGER:=0;
  v_imported_items INTEGER:=0;
  v_reference TEXT;
BEGIN
  PERFORM public.assert_cooperative_actor(p_tenant_id,p_actor_user_id,true);
  IF p_snapshot_fingerprint IS NULL OR p_snapshot_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_payload_fingerprint IS NULL OR p_payload_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_confirm_complete_history IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Invalid or unconfirmed cooperative financial import' USING ERRCODE='22023';
  END IF;
  IF jsonb_typeof(p_wallets) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_transactions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Cooperative import rows must be arrays' USING ERRCODE='22023';
  END IF;
  v_wallet_count:=jsonb_array_length(p_wallets);
  v_sale_count:=jsonb_array_length(p_transactions);
  IF v_wallet_count NOT BETWEEN 0 AND 1000 OR v_sale_count NOT BETWEEN 0 AND 1000
    OR (v_wallet_count=0 AND v_sale_count=0) THEN
    RAISE EXCEPTION 'Cooperative financial import row limit exceeded' USING ERRCODE='22023';
  END IF;

  PERFORM pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'cooperative-financial-import:'||p_tenant_id::TEXT||':'||p_snapshot_fingerprint,0
  ));
  SELECT * INTO v_previous FROM public.cooperative_financial_import_batches
    WHERE tenant_id=p_tenant_id AND snapshot_fingerprint=p_snapshot_fingerprint;
  IF FOUND THEN
    IF v_previous.payload_fingerprint IS DISTINCT FROM p_payload_fingerprint THEN
      RAISE EXCEPTION 'This archive snapshot was already applied with different mappings' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object(
      'alreadyApplied',true,
      'wallets',v_previous.wallet_count,
      'sales',v_previous.sale_count,
      'items',v_previous.item_count,
      'snapshotFingerprint',v_previous.snapshot_fingerprint
    );
  END IF;

  SELECT COALESCE(sum(CASE WHEN jsonb_typeof(row_value->'items')='array'
    THEN jsonb_array_length(row_value->'items') ELSE 0 END),0)::INTEGER
    INTO v_item_count
    FROM jsonb_array_elements(p_transactions) AS rows(row_value);
  IF v_item_count NOT BETWEEN 0 AND 5000 OR (v_sale_count>0 AND v_item_count=0) THEN
    RAISE EXCEPTION 'Cooperative financial import item limit exceeded' USING ERRCODE='22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_wallets) AS rows(item)
    GROUP BY item->>'source_ref' HAVING count(*)>1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_wallets) AS rows(item)
    GROUP BY item->>'target_wallet_id' HAVING count(*)>1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_wallets) AS rows(item)
    GROUP BY item->>'client_request_id' HAVING count(*)>1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_transactions) AS rows(item)
    GROUP BY item->>'source_ref' HAVING count(*)>1
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_transactions) AS rows(item)
    GROUP BY item->>'client_request_id' HAVING count(*)>1
  ) THEN
    RAISE EXCEPTION 'Duplicate cooperative financial import reference' USING ERRCODE='23505';
  END IF;

  FOR v_wallet_json IN SELECT value FROM jsonb_array_elements(p_wallets) AS rows(value) LOOP
    IF COALESCE(v_wallet_json->>'source_ref','') !~ '^[0-9a-f]{64}$'
      OR COALESCE(v_wallet_json->>'source_fingerprint','') !~ '^[0-9a-f]{64}$'
      OR COALESCE(v_wallet_json->>'target_wallet_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(v_wallet_json->>'client_request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR (v_wallet_json->>'opening_balance') IS NULL
      OR (v_wallet_json->>'closing_balance') IS NULL
      OR (v_wallet_json->>'sales_total') IS NULL THEN
      RAISE EXCEPTION 'Invalid cooperative wallet import fields' USING ERRCODE='22023';
    END IF;
    v_opening:=(v_wallet_json->>'opening_balance')::NUMERIC;
    v_expected_closing:=(v_wallet_json->>'closing_balance')::NUMERIC;
    v_declared_sales:=(v_wallet_json->>'sales_total')::NUMERIC;
    IF v_opening<0 OR v_opening>999999999999 OR v_opening<>trunc(v_opening)
      OR v_expected_closing<0 OR v_expected_closing>999999999999 OR v_expected_closing<>trunc(v_expected_closing)
      OR v_declared_sales<0 OR v_declared_sales>999999999999 OR v_declared_sales<>trunc(v_declared_sales) THEN
      RAISE EXCEPTION 'Cooperative wallet balance is outside the supported range' USING ERRCODE='22023';
    END IF;
  END LOOP;

  FOR v_transaction IN SELECT value FROM jsonb_array_elements(p_transactions) AS rows(value) LOOP
    IF COALESCE(v_transaction->>'source_ref','') !~ '^[0-9a-f]{64}$'
      OR COALESCE(v_transaction->>'source_fingerprint','') !~ '^[0-9a-f]{64}$'
      OR COALESCE(v_transaction->>'client_request_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR COALESCE(v_transaction->>'source_wallet_ref','') !~ '^[0-9a-f]{64}$'
      OR lower(COALESCE(v_transaction->>'status',''))<>'success'
      OR COALESCE(v_transaction->>'created_at','') !~* '^\d{4}-\d{2}-\d{2}t.*(?:z|[+-]\d{2}:\d{2})$'
      OR (v_transaction->>'total') IS NULL
      OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_wallets) AS wallet(value)
        WHERE wallet.value->>'source_ref'=v_transaction->>'source_wallet_ref') THEN
      RAISE EXCEPTION 'Invalid cooperative historical transaction' USING ERRCODE='22023';
    END IF;
    v_sale_total:=(v_transaction->>'total')::NUMERIC;
    IF v_sale_total<=0 OR v_sale_total>999999999999 OR v_sale_total<>trunc(v_sale_total) THEN
      RAISE EXCEPTION 'Cooperative sale total is outside the supported Finance range' USING ERRCODE='22023';
    END IF;
    v_line_count:=jsonb_array_length(v_transaction->'items');
    IF v_line_count NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'Invalid number of cooperative historical sale items' USING ERRCODE='22023';
    END IF;
    v_line_total:=0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_transaction->'items') AS items(value) LOOP
      IF COALESCE(v_item->>'product_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR length(btrim(COALESCE(v_item->>'name',''))) NOT BETWEEN 1 AND 180
        OR COALESCE(v_item->>'cost_snapshot_known','true')<>'false'
        OR NULLIF(v_item->>'cost_price','') IS NOT NULL
        OR (v_item->>'quantity') IS NULL OR (v_item->>'unit_price') IS NULL OR (v_item->>'line_total') IS NULL THEN
        RAISE EXCEPTION 'Invalid or fabricated cost in cooperative historical sale item' USING ERRCODE='22023';
      END IF;
      v_quantity:=(v_item->>'quantity')::INTEGER;
      v_price:=(v_item->>'unit_price')::NUMERIC;
      v_line_total:=(v_item->>'line_total')::NUMERIC;
      IF v_quantity NOT BETWEEN 1 AND 500 OR v_price<0 OR v_price>999999999999
        OR v_price<>trunc(v_price) OR v_line_total<>v_price*v_quantity THEN
        RAISE EXCEPTION 'Invalid cooperative historical sale item amount' USING ERRCODE='22023';
      END IF;
      v_seen_items:=v_seen_items+1;
    END LOOP;
    IF v_line_total IS NULL THEN RAISE EXCEPTION 'Invalid cooperative sale line total' USING ERRCODE='22023'; END IF;
  END LOOP;

  SELECT time_zone INTO v_time_zone FROM public.tenants
    WHERE id=p_tenant_id AND status='active' FOR SHARE;
  IF NOT FOUND OR v_time_zone IS NULL OR length(v_time_zone)>80 THEN
    RAISE EXCEPTION 'Active tenant time zone is required for financial import' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.finance_controls(tenant_id,finance_locked,updated_by_user_id)
    VALUES(p_tenant_id,false,p_actor_user_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_control FROM public.finance_controls WHERE tenant_id=p_tenant_id FOR SHARE;
  IF v_control.finance_locked THEN
    RAISE EXCEPTION 'Buku keuangan tenant sedang ditutup' USING ERRCODE='55000';
  END IF;

  -- Lock target wallets and mapped products in stable order. A competing import
  -- or runtime sale cannot sneak history into a wallet after the preflight check.
  FOR v_wallet_json IN
    SELECT value FROM jsonb_array_elements(p_wallets) AS rows(value)
    ORDER BY value->>'target_wallet_id'
  LOOP
    v_target_wallet_id:=(v_wallet_json->>'target_wallet_id')::UUID;
    SELECT * INTO v_wallet FROM public.cooperative_wallets
      WHERE tenant_id=p_tenant_id AND id=v_target_wallet_id FOR UPDATE;
    IF NOT FOUND OR v_wallet.balance<>0
      OR EXISTS (SELECT 1 FROM public.cooperative_wallet_ledger WHERE tenant_id=p_tenant_id AND wallet_id=v_target_wallet_id)
      OR EXISTS (SELECT 1 FROM public.cooperative_sales WHERE tenant_id=p_tenant_id AND wallet_id=v_target_wallet_id) THEN
      RAISE EXCEPTION 'Target wallet must be empty and unused before import' USING ERRCODE='23514';
    END IF;
  END LOOP;

  FOR v_product_id IN
    SELECT DISTINCT (items.item->>'product_id')::UUID
    FROM jsonb_array_elements(p_transactions) AS transactions(value)
    CROSS JOIN LATERAL jsonb_array_elements(transactions.value->'items') AS items(item)
    ORDER BY 1
  LOOP
    PERFORM 1 FROM public.cooperative_products
      WHERE tenant_id=p_tenant_id AND id=v_product_id FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Mapped cooperative product is not in this tenant' USING ERRCODE='23503'; END IF;
  END LOOP;

  INSERT INTO public.cooperative_financial_import_batches(
    tenant_id,snapshot_fingerprint,payload_fingerprint,wallet_count,sale_count,item_count,imported_by_user_id
  ) VALUES(
    p_tenant_id,p_snapshot_fingerprint,p_payload_fingerprint,v_wallet_count,v_sale_count,v_item_count,p_actor_user_id
  );

  FOR v_wallet_json IN
    SELECT value FROM jsonb_array_elements(p_wallets) AS rows(value)
    ORDER BY value->>'target_wallet_id'
  LOOP
    v_source_ref:=v_wallet_json->>'source_ref';
    v_source_fingerprint:=v_wallet_json->>'source_fingerprint';
    v_target_wallet_id:=(v_wallet_json->>'target_wallet_id')::UUID;
    v_request_id:=(v_wallet_json->>'client_request_id')::UUID;
    v_opening:=(v_wallet_json->>'opening_balance')::NUMERIC;
    v_expected_closing:=(v_wallet_json->>'closing_balance')::NUMERIC;
    v_declared_sales:=(v_wallet_json->>'sales_total')::NUMERIC;
    SELECT COALESCE(sum((transaction.value->>'total')::NUMERIC),0)
      INTO v_actual_sales
      FROM jsonb_array_elements(p_transactions) AS transaction(value)
      WHERE transaction.value->>'source_wallet_ref'=v_source_ref;
    IF v_actual_sales<>v_declared_sales OR v_opening-v_actual_sales<>v_expected_closing THEN
      RAISE EXCEPTION 'Opening balance does not reconcile to archived sales and closing balance' USING ERRCODE='23514';
    END IF;

    SELECT * INTO v_wallet FROM public.cooperative_wallets
      WHERE tenant_id=p_tenant_id AND id=v_target_wallet_id;
    v_student_id:=v_wallet.student_id;
    SELECT min((transaction.value->>'created_at')::TIMESTAMPTZ)
      INTO v_earliest_at FROM jsonb_array_elements(p_transactions) AS transaction(value)
      WHERE transaction.value->>'source_wallet_ref'=v_source_ref;
    IF v_earliest_at IS NULL THEN
      v_opening_at:=now();
    ELSE
      v_opening_at:=date_trunc('day',v_earliest_at AT TIME ZONE v_time_zone) AT TIME ZONE v_time_zone;
    END IF;

    IF v_opening>0 THEN
      v_reference:='Saldo pembuka migrasi '||left(p_snapshot_fingerprint,12);
      UPDATE public.cooperative_wallets SET balance=v_opening,updated_by=p_actor_user_id,updated_at=now()
        WHERE tenant_id=p_tenant_id AND id=v_target_wallet_id;
      INSERT INTO public.cooperative_wallet_ledger(
        tenant_id,wallet_id,student_id,entry_type,amount_delta,balance_after,reference,client_request_id,created_by,created_at
      ) VALUES(
        p_tenant_id,v_target_wallet_id,v_student_id,'opening_balance',v_opening,v_opening,
        v_reference,v_request_id,p_actor_user_id,v_opening_at
      ) RETURNING id INTO v_opening_ledger_id;
      INSERT INTO public.finance_ledger(
        tenant_id,entry_type,source_type,source_id,description,amount,payment_method,receipt_no,actor_user_id,posted_at
      ) VALUES(
        p_tenant_id,'custodial_inflow','cooperative_wallet',v_opening_ledger_id,
        'Saldo pembuka arsip dompet Koperasi',v_opening,'Koperasi - saldo pembuka',NULL,p_actor_user_id,v_opening_at
      );
    ELSE
      v_opening_ledger_id:=NULL;
      UPDATE public.cooperative_wallets SET updated_by=p_actor_user_id,updated_at=now()
        WHERE tenant_id=p_tenant_id AND id=v_target_wallet_id;
    END IF;
    v_balance:=v_opening;

    INSERT INTO public.cooperative_financial_import_records(
      tenant_id,snapshot_fingerprint,record_kind,source_ref,source_fingerprint,target_record_id,created_by_user_id
    ) VALUES(
      p_tenant_id,p_snapshot_fingerprint,'wallet_opening',v_source_ref,v_source_fingerprint,
      COALESCE(v_opening_ledger_id,v_target_wallet_id),p_actor_user_id
    );

    FOR v_transaction IN
      SELECT value FROM jsonb_array_elements(p_transactions) AS transactions(value)
      WHERE value->>'source_wallet_ref'=v_source_ref
      ORDER BY (value->>'created_at')::TIMESTAMPTZ,value->>'source_ref'
    LOOP
      v_created_at:=(v_transaction->>'created_at')::TIMESTAMPTZ;
      v_sale_total:=(v_transaction->>'total')::NUMERIC;
      IF v_balance<v_sale_total THEN
        RAISE EXCEPTION 'Reconciled wallet balance would become negative during archived history' USING ERRCODE='23514';
      END IF;
      v_request_id:=(v_transaction->>'client_request_id')::UUID;
      INSERT INTO public.cooperative_sales(
        tenant_id,wallet_id,student_id,total_amount,client_request_id,created_by,created_at
      ) VALUES(
        p_tenant_id,v_target_wallet_id,v_student_id,v_sale_total,v_request_id,p_actor_user_id,v_created_at
      ) RETURNING id INTO v_sale_id;

      v_line_total:=0;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_transaction->'items') AS items(value) LOOP
        SELECT * INTO v_product FROM public.cooperative_products
          WHERE tenant_id=p_tenant_id AND id=(v_item->>'product_id')::UUID FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION 'Mapped cooperative product disappeared during import' USING ERRCODE='23503'; END IF;
        v_price:=(v_item->>'unit_price')::NUMERIC;
        v_quantity:=(v_item->>'quantity')::INTEGER;
        v_line_total:=v_line_total+(v_price*v_quantity);
        INSERT INTO public.cooperative_sale_items(
          tenant_id,sale_id,product_id,sku_snapshot,name_snapshot,quantity,cost_price,cost_snapshot_known,unit_price,line_total,created_at
        ) VALUES(
          p_tenant_id,v_sale_id,v_product.id,v_product.sku,btrim(v_item->>'name'),v_quantity,
          NULL,false,v_price,v_price*v_quantity,v_created_at
        );
        v_imported_items:=v_imported_items+1;
      END LOOP;
      IF v_line_total<>v_sale_total THEN
        RAISE EXCEPTION 'Transaction total does not equal its historical items' USING ERRCODE='23514';
      END IF;

      v_balance:=v_balance-v_sale_total;
      INSERT INTO public.cooperative_wallet_ledger(
        tenant_id,wallet_id,student_id,sale_id,entry_type,amount_delta,balance_after,reference,client_request_id,created_by,created_at
      ) VALUES(
        p_tenant_id,v_target_wallet_id,v_student_id,v_sale_id,'purchase',-v_sale_total,v_balance,
        'Penjualan arsip '||left(v_transaction->>'source_ref',12),v_request_id,p_actor_user_id,v_created_at
      );
      INSERT INTO public.finance_ledger(
        tenant_id,entry_type,source_type,source_id,description,amount,payment_method,receipt_no,actor_user_id,posted_at
      ) VALUES(
        p_tenant_id,'custodial_release','cooperative_sale',v_sale_id,
        'Penjualan koperasi historis dari arsip',v_sale_total,'Saldo dompet',NULL,p_actor_user_id,v_created_at
      );
      INSERT INTO public.cooperative_financial_import_records(
        tenant_id,snapshot_fingerprint,record_kind,source_ref,source_fingerprint,target_record_id,created_by_user_id
      ) VALUES(
        p_tenant_id,p_snapshot_fingerprint,'sale',v_transaction->>'source_ref',
        v_transaction->>'source_fingerprint',v_sale_id,p_actor_user_id
      );
      v_imported_sales:=v_imported_sales+1;
    END LOOP;

    IF v_balance<>v_expected_closing THEN
      RAISE EXCEPTION 'Imported wallet balance does not match the archived closing balance' USING ERRCODE='23514';
    END IF;
    UPDATE public.cooperative_wallets SET balance=v_balance,updated_by=p_actor_user_id,updated_at=now()
      WHERE tenant_id=p_tenant_id AND id=v_target_wallet_id;
  END LOOP;

  RETURN jsonb_build_object(
    'alreadyApplied',false,
    'wallets',v_wallet_count,
    'sales',v_imported_sales,
    'items',v_imported_items,
    'snapshotFingerprint',p_snapshot_fingerprint
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_cooperative_legacy_financial_history(UUID,UUID,TEXT,TEXT,BOOLEAN,JSONB,JSONB)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_cooperative_legacy_financial_history(UUID,UUID,TEXT,TEXT,BOOLEAN,JSONB,JSONB)
  TO service_role;

COMMENT ON FUNCTION public.apply_cooperative_legacy_financial_history(UUID,UUID,TEXT,TEXT,BOOLEAN,JSONB,JSONB) IS
  'Atomically imports tenant-scoped legacy cooperative opening balances and historical sales after source and target reconciliation.';

COMMIT;
