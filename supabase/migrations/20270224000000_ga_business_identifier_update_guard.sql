-- Avoid referencing record fields that do not exist on the other trigger table.
-- Boolean AND is not a safe guard for dynamic NEW/OLD records in PL/pgSQL.
CREATE OR REPLACE FUNCTION public.protect_ga_business_codes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'ga_facilities' THEN
    IF NEW.asset_code IS DISTINCT FROM OLD.asset_code THEN
      RAISE EXCEPTION 'Kode aset yang sudah diterbitkan tidak dapat diubah' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'ga_inventory_items' THEN
    IF NEW.item_code IS DISTINCT FROM OLD.item_code THEN
      RAISE EXCEPTION 'Kode inventaris yang sudah diterbitkan tidak dapat diubah' USING ERRCODE = '23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'Tabel kode bisnis tidak didukung' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
