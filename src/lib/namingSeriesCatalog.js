/** @typedef {"nis" | "ppdb_registration" | "employee_number" | "building_code" | "room_code" | "class_code" | "document_number" | "finance_receipt" | "asset_code" | "inventory_item_code" | "donation_receipt" | "waqf_asset_code" | "laundry_order_number" | "cooperative_product_sku" | "marketplace_product_sku"} TenantNamingSeriesCatalogKey */

/** @type {readonly TenantNamingSeriesCatalogKey[]} */
export const TENANT_NAMING_SERIES_KEYS = Object.freeze([
  "nis",
  "ppdb_registration",
  "employee_number",
  "building_code",
  "room_code",
  "class_code",
  "document_number",
  "finance_receipt",
  "asset_code",
  "inventory_item_code",
  "donation_receipt",
  "waqf_asset_code",
  "laundry_order_number",
  "cooperative_product_sku",
  "marketplace_product_sku",
]);

/** @param {readonly { seriesKey: TenantNamingSeriesCatalogKey }[] | null | undefined} records */
export function isCompleteTenantNamingSeriesCatalog(records) {
  if (!Array.isArray(records) || records.length !== TENANT_NAMING_SERIES_KEYS.length) return false;
  const received = new Set(records.map((record) => record.seriesKey));
  return received.size === TENANT_NAMING_SERIES_KEYS.length
    && TENANT_NAMING_SERIES_KEYS.every((key) => received.has(key));
}
