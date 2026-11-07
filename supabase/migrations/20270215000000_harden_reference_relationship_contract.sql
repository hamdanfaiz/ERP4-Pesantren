-- Keep category descriptions semantically separate from their selectable name,
-- and ensure every new finance expense is attached to an active organization unit.
BEGIN;

ALTER TABLE public.tenant_reference_items
  ADD CONSTRAINT tenant_reference_items_description_semantic_check
  CHECK (
    length(btrim(description)) BETWEEN 8 AND 2000
    AND lower(btrim(description)) <> lower(btrim(name))
  ) NOT VALID;
ALTER TABLE public.tenant_reference_items
  VALIDATE CONSTRAINT tenant_reference_items_description_semantic_check;

CREATE OR REPLACE FUNCTION public.link_finance_expense_category()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE
  v_reference public.tenant_reference_items%ROWTYPE;
  v_unit_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'Tenant pengeluaran tidak dapat diubah' USING ERRCODE = '23514';
  END IF;

  -- Preserve untouched historical rows that have not yet been mapped.
  IF TG_OP = 'UPDATE'
    AND OLD.category_reference_id IS NULL AND NEW.category_reference_id IS NULL
    AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
    AND NEW.category IS NOT DISTINCT FROM OLD.category
    AND NEW.unit_id IS NOT DISTINCT FROM OLD.unit_id
    AND NEW.department IS NOT DISTINCT FROM OLD.department THEN
    RETURN NEW;
  END IF;

  IF NEW.unit_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Unit pengeluaran wajib berasal dari unit organisasi aktif tenant' USING ERRCODE = '23503';
    ELSIF NEW.department IS DISTINCT FROM OLD.department
      OR NEW.category IS DISTINCT FROM OLD.category
      OR (NEW.category_reference_id IS DISTINCT FROM OLD.category_reference_id
        AND NOT (
          OLD.category_reference_id IS NULL
          AND NEW.category_reference_id IS NOT NULL
          AND NEW.category IS NOT DISTINCT FROM OLD.category
          AND NEW.department IS NOT DISTINCT FROM OLD.department
        )) THEN
      RAISE EXCEPTION 'Unit pengeluaran wajib berasal dari unit organisasi aktif tenant' USING ERRCODE = '23503';
    END IF;
  END IF;

  IF NEW.category_reference_id IS NOT NULL THEN
    SELECT * INTO v_reference FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'finance_expense_category'
      AND id = NEW.category_reference_id AND status = 'active'
      AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM NEW.unit_id);
  ELSE
    SELECT * INTO v_reference FROM public.tenant_reference_items
    WHERE tenant_id = NEW.tenant_id AND domain = 'finance_expense_category'
      AND lower(btrim(name)) = lower(btrim(NEW.category)) AND status = 'active'
      AND (organization_unit_id IS NULL OR organization_unit_id IS NOT DISTINCT FROM NEW.unit_id);
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kategori pengeluaran wajib dipilih dari katalog aktif tenant' USING ERRCODE = '23503'; END IF;

  NEW.category_reference_id := v_reference.id;
  NEW.category := v_reference.name;
  IF NEW.unit_id IS NOT NULL THEN
    SELECT name INTO v_unit_name FROM public.organization_units
    WHERE tenant_id = NEW.tenant_id AND id = NEW.unit_id AND status = 'active';
    IF v_unit_name IS NULL THEN RAISE EXCEPTION 'Bagian pengeluaran harus berupa unit aktif milik tenant' USING ERRCODE = '23503'; END IF;
    NEW.department := v_unit_name;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER finance_expenses_link_category ON public.finance_expenses;
CREATE TRIGGER finance_expenses_link_category
  BEFORE INSERT OR UPDATE OF tenant_id, category, category_reference_id, unit_id, department
  ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.link_finance_expense_category();

COMMENT ON CONSTRAINT tenant_reference_items_description_semantic_check ON public.tenant_reference_items IS
  'A selectable name and its explanatory description must be distinct and the description must be meaningful.';
COMMENT ON FUNCTION public.link_finance_expense_category() IS
  'Resolves tenant expense categories, derives department labels from active units, and preserves only untouched legacy rows.';

COMMIT;
