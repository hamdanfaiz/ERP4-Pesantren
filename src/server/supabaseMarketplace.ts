type Row = Record<string, any>;

export class SupabaseMarketplaceError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SupabaseMarketplaceError"; this.status = status; }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseMarketplaceError(503, "Konfigurasi backend Supabase belum lengkap.");
  return { url, key };
}
async function request(path: string, init: RequestInit = {}) {
  const { url, key } = config();
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  if (key.startsWith("sb_secret_")) headers.delete("Authorization"); else headers.set("Authorization", "Bearer " + key);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url + path, { ...init, headers, cache: "no-store" });
  const raw = await response.text(); let body: any = null;
  if (raw) { try { body = JSON.parse(raw); } catch { body = null; } }
  if (!response.ok) {
    const code = String(body?.code || "");
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) throw new SupabaseMarketplaceError(409, body?.message || "Pesanan atau stok marketplace berubah. Segarkan data sebelum mencoba lagi.");
    if (["22023", "22P02"].includes(code) || response.status === 400) throw new SupabaseMarketplaceError(400, body?.message || "Data marketplace tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseMarketplaceError(404, body?.message || "Record marketplace tidak ditemukan di tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseMarketplaceError(403, "Akses marketplace ditolak oleh role atau tenant.");
    throw new SupabaseMarketplaceError(503, "Layanan marketplace Supabase belum dapat diproses.");
  }
  return body;
}
function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
async function tenantIdFrom(value: string) {
  if (!uuid(value)) throw new SupabaseMarketplaceError(403, "Tenant marketplace tidak valid.");
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" }).toString());
  if (!Array.isArray(tenants) || tenants.length !== 1 || tenants[0].status !== "active") throw new SupabaseMarketplaceError(403, "Tenant marketplace tidak aktif.");
  return value;
}
async function rows(table: string, tenantId: string, select: string, order: string, max: number) {
  const result: Row[] = [];
  for (let offset = 0; offset <= max; offset += 500) {
    const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: String(Math.min(500, max + 1 - offset)), offset: String(offset) });
    const page = await request("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(page)) throw new SupabaseMarketplaceError(503, "Data marketplace belum dapat dimuat.");
    result.push(...page);
    if (result.length > max) throw new SupabaseMarketplaceError(503, "Data marketplace melewati batas tampilan aman.");
    if (page.length < Math.min(500, max + 1 - offset)) return result;
  }
  return result;
}
export async function getSupabaseMarketplaceSnapshot(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const [products, orders, items, movements] = await Promise.all([
    rows("marketplace_products", tenantId, "id,sku,name,category,unit_price,stock_quantity,seller,image_label,status,created_at,updated_at", "status.asc,name.asc,id.asc", 3000),
    rows("marketplace_orders", tenantId, "id,customer_name,customer_type,status,item_count,total_amount,created_at,updated_at,source_system,legacy_date_known", "created_at.desc,id.desc", 5000),
    rows("marketplace_order_items", tenantId, "id,order_id,product_id,product_sku_snapshot,product_name_snapshot,quantity,unit_price,line_total,created_at", "created_at.asc,id.asc", 20000),
    rows("marketplace_stock_movements", tenantId, "id,product_id,order_id,quantity_delta,balance_after,reason,created_at", "created_at.desc,id.desc", 1000),
  ]);
  const productsById = new Map<string, Row>(products.map((row): [string, Row] => [String(row.id), row]));
  const itemsByOrder = new Map<string, Row[]>();
  for (const item of items) itemsByOrder.set(String(item.order_id), [...(itemsByOrder.get(String(item.order_id)) || []), item]);
  return {
    products: products.filter((row) => row.status === "active").map((row) => ({ ...row, price: Number(row.unit_price), stock: Number(row.stock_quantity), image: String(row.image_label || "📦") })),
    orders: orders.map((row) => ({ ...row, customer: row.customer_name, type: row.customer_type, total: Number(row.total_amount), items: Number(row.item_count), date: String(row.created_at || ""), lines: itemsByOrder.get(String(row.id)) || [] })),
    movements: movements.map((row) => ({ ...row, productName: productsById.get(String(row.product_id))?.name || "Produk diarsipkan" })),
  };
}
export async function manageSupabaseMarketplaceProduct(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseMarketplaceError(400, "Data produk marketplace tidak valid.");
  return request("/rest/v1/rpc/manage_marketplace_product", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function adjustSupabaseMarketplaceStock(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.productId) || !uuid(item?.clientRequestId) || !Number.isInteger(item?.delta) || typeof item?.reason !== "string") throw new SupabaseMarketplaceError(400, "Mutasi stok marketplace tidak valid.");
  return request("/rest/v1/rpc/adjust_marketplace_stock", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_product_id: item.productId, p_delta: item.delta, p_reason: item.reason, p_client_request_id: item.clientRequestId }) });
}
export async function createSupabaseMarketplaceOrder(tenantId: string, actorId: string, order: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(order?.clientRequestId) || !Array.isArray(order?.items)) throw new SupabaseMarketplaceError(400, "Data pesanan marketplace tidak valid.");
  const normalizedOrder = { ...order, items: order.items.map((item: Row) => ({ product_id: item.productId, quantity: item.quantity })) };
  return request("/rest/v1/rpc/create_marketplace_order", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_order: normalizedOrder }) });
}
export async function transitionSupabaseMarketplaceOrder(tenantId: string, actorId: string, orderId: string, status: string, requestId: string) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(orderId) || !uuid(requestId)) throw new SupabaseMarketplaceError(400, "Identitas perubahan pesanan tidak valid.");
  return request("/rest/v1/rpc/transition_marketplace_order", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_order_id: orderId, p_status: status, p_client_request_id: requestId }) });
}

export async function getSupabaseMarketplaceImportContext(tenantIdentifier: string) {
  const tenantId = await tenantIdFrom(tenantIdentifier);
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,legacy_tenant_key", id: "eq." + tenantId, limit: "2" }).toString());
  const legacyTenantKey = Array.isArray(tenants) ? String(tenants[0]?.legacy_tenant_key || "").trim() : "";
  const [products, orders, skus] = await Promise.all([
    rows("marketplace_products", tenantId, "source_record_id,source_fingerprint", "name.asc,id.asc", 6000),
    rows("marketplace_orders", tenantId, "source_record_id,source_fingerprint", "created_at.asc,id.asc", 6000),
    rows("marketplace_products", tenantId, "sku,source_record_id", "sku.asc,id.asc", 6000),
  ]);
  return { tenantId, legacyTenantKey, existingRows: [
    ...products.map((row) => ({ ...row, kind: "product" })),
    ...orders.map((row) => ({ ...row, kind: "order" })),
  ], skus };
}

export async function applySupabaseLegacyMarketplaceImport(tenantId: string, actorId: string, snapshotFingerprint: string, sourceCount: number, items: Row[]) {
  if (!uuid(tenantId) || !uuid(actorId) || !/^[0-9a-f]{64}$/.test(snapshotFingerprint) || !Number.isInteger(sourceCount) || sourceCount<0 || sourceCount>6000 || !Array.isArray(items) || items.length>6000) throw new SupabaseMarketplaceError(400, "Snapshot impor Marketplace tidak valid.");
  return request("/rest/v1/rpc/import_legacy_marketplace", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_snapshot_fingerprint: snapshotFingerprint, p_source_count: sourceCount, p_items: items }) });
}
