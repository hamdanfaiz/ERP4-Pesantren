import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { businessDateForInstant, DEFAULT_TENANT_TIME_ZONE, tenantBusinessDate } from "../utils/businessDate";

type Row = Record<string, any>;

export class SupabaseCooperativeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SupabaseCooperativeError";
    this.status = status;
  }
}

let adminClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(process.env.SUPABASE_SECRET_KEY || "").trim();
  if (!url || !key) throw new SupabaseCooperativeError(503, "Konfigurasi backend Supabase belum lengkap.");
  if (!adminClient) adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new SupabaseCooperativeError(400, `${label} tidak valid.`);
  }
}

function mapStoreError(error: any): never {
  const code = String(error?.code || "");
  if (["23505", "23503", "23514"].includes(code)) throw new SupabaseCooperativeError(409, error?.message || "Transaksi koperasi bertentangan dengan data tenant.");
  if (["22023", "22P02"].includes(code)) throw new SupabaseCooperativeError(400, error?.message || "Data koperasi tidak valid.");
  if (code === "55000") throw new SupabaseCooperativeError(409, "Buku keuangan tenant sedang ditutup.");
  if (code === "P0002") throw new SupabaseCooperativeError(404, error?.message || "Data koperasi tidak ditemukan.");
  if (code === "42501") throw new SupabaseCooperativeError(403, "Operasi koperasi ditolak oleh role atau tenant.");
  throw new SupabaseCooperativeError(503, "Layanan koperasi Supabase belum dapat diproses.");
}

async function rows(table: string, tenantId: string, select: string, order: string, limit = 5000): Promise<Row[]> {
  const { data, error } = await client().from(table).select(select).eq("tenant_id", tenantId).order(order.split(".")[0], { ascending: order.endsWith(".asc") }).limit(limit);
  if (error) mapStoreError(error);
  return (data || []) as Row[];
}

async function callRpc<T = any>(name: string, args: Row): Promise<T> {
  const { data, error } = await client().rpc(name, args);
  if (error) mapStoreError(error);
  return data as T;
}

export async function getSupabaseCooperativeSnapshot(tenantId: string) {
  assertUuid(tenantId, "Tenant");
  const [tenantResult, products, suppliers, wallets, sales, saleItems, ledger] = await Promise.all([
    client().from("tenants").select("time_zone").eq("id", tenantId).eq("status", "active").maybeSingle(),
    rows("cooperative_products", tenantId, "id,sku,name,category,stock_quantity,cost_price,unit_price,reorder_point,expiry_date,status,updated_at", "name.asc"),
    rows("cooperative_suppliers", tenantId, "id,name,category,contact,pic,status,updated_at", "name.asc"),
    rows("cooperative_wallets", tenantId, "id,student_id,balance,daily_limit,status,updated_at", "student_id.asc"),
    rows("cooperative_sales", tenantId, "id,wallet_id,student_id,total_amount,status,client_request_id,created_at", "created_at.desc", 1000),
    rows("cooperative_sale_items", tenantId, "id,sale_id,product_id,sku_snapshot,name_snapshot,quantity,cost_price,unit_price,line_total,created_at", "created_at.asc", 20000),
    rows("cooperative_wallet_ledger", tenantId, "id,wallet_id,student_id,sale_id,entry_type,amount_delta,balance_after,reference,created_at", "created_at.desc", 5000),
  ]);
  if (tenantResult.error) mapStoreError(tenantResult.error);
  if (!tenantResult.data) throw new SupabaseCooperativeError(403, "Tenant aktif tidak ditemukan.");
  const timeZone = String(tenantResult.data.time_zone || DEFAULT_TENANT_TIME_ZONE);
  let businessDate: string;
  try {
    businessDate = tenantBusinessDate(new Date(), timeZone);
  } catch {
    throw new SupabaseCooperativeError(503, "Zona waktu tenant tidak valid untuk ringkasan koperasi.");
  }

  const studentIds = [...new Set(wallets.map((wallet) => String(wallet.student_id || "")).filter(Boolean))];
  const studentById = new Map<string, Row>();
  if (studentIds.length) {
    const { data, error } = await client().from("students")
      .select("id,name,nis,grade,class_id,status")
      .eq("tenant_id", tenantId)
      .in("id", studentIds)
      .limit(5000);
    if (error) mapStoreError(error);
    for (const student of data || []) studentById.set(String(student.id), student as Row);
  }

  const itemsBySale = new Map<string, Row[]>();
  for (const item of saleItems) {
    const saleId = String(item.sale_id);
    itemsBySale.set(saleId, [...(itemsBySale.get(saleId) || []), {
      id: item.id,
      productId: item.product_id,
      sku: item.sku_snapshot,
      name: item.name_snapshot,
      quantity: Number(item.quantity),
      costPrice: Number(item.cost_price),
      price: Number(item.unit_price),
      lineTotal: Number(item.line_total),
    }]);
  }
  const walletById = new Map(wallets.map((wallet) => [String(wallet.id), wallet]));

  return {
    timeZone,
    businessDate,
    products: products.map((item) => ({ ...item, stock: Number(item.stock_quantity), costPrice: Number(item.cost_price), price: Number(item.unit_price), reorderPoint: Number(item.reorder_point), expiryDate: item.expiry_date || "" })),
    suppliers,
    wallets: wallets.map((wallet) => {
      const student = studentById.get(String(wallet.student_id));
      return {
        id: wallet.id,
        studentId: wallet.student_id,
        student: student?.name || "Santri tidak aktif",
        nis: student?.nis || "",
        grade: student?.grade || student?.class_id || "",
        balance: Number(wallet.balance),
        limit: Number(wallet.daily_limit),
        status: wallet.status === "active" && String(student?.status || "").toLowerCase() === "active" ? "Active" : "Blocked",
      };
    }),
    sales: sales.map((sale) => {
      const wallet = walletById.get(String(sale.wallet_id));
      const student = studentById.get(String(sale.student_id));
      return {
        id: sale.id,
        walletId: sale.wallet_id,
        studentId: sale.student_id,
        studentName: student?.name || "Santri tidak aktif",
        grade: student?.grade || student?.class_id || "",
        date: sale.created_at,
        businessDate: businessDateForInstant(String(sale.created_at), timeZone),
        total: Number(sale.total_amount),
        status: "Success",
        items: itemsBySale.get(String(sale.id)) || [],
        balance: wallet ? Number(wallet.balance) : null,
      };
    }),
    walletLedger: ledger.map((item) => ({
      id: item.id,
      walletId: item.wallet_id,
      studentId: item.student_id,
      saleId: item.sale_id,
      type: item.entry_type,
      amount: Number(item.amount_delta),
      balanceAfter: Number(item.balance_after),
      reference: item.reference,
      createdAt: item.created_at,
    })),
  };
}

export async function manageSupabaseCooperativeProduct(tenantId: string, actorId: string, item: Row) {
  assertUuid(tenantId, "Tenant"); assertUuid(actorId, "Aktor"); assertUuid(item?.clientRequestId, "Request ID");
  if (item?.id != null) assertUuid(item.id, "Produk");
  return callRpc("manage_cooperative_product", { p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item });
}

export async function adjustSupabaseCooperativeStock(tenantId: string, actorId: string, input: Row) {
  assertUuid(tenantId, "Tenant"); assertUuid(actorId, "Aktor"); assertUuid(input?.productId, "Produk"); assertUuid(input?.clientRequestId, "Request ID");
  if (!Number.isInteger(input?.delta) || typeof input?.reason !== "string") throw new SupabaseCooperativeError(400, "Data penyesuaian stok tidak valid.");
  return callRpc("adjust_cooperative_stock", { p_tenant_id: tenantId, p_actor_user_id: actorId, p_product_id: input.productId, p_delta: input.delta, p_reason: input.reason, p_request_id: input.clientRequestId });
}

export async function manageSupabaseCooperativeSupplier(tenantId: string, actorId: string, item: Row) {
  assertUuid(tenantId, "Tenant"); assertUuid(actorId, "Aktor"); assertUuid(item?.clientRequestId, "Request ID");
  if (item?.id != null) assertUuid(item.id, "Pemasok");
  return callRpc("manage_cooperative_supplier", { p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item });
}

export async function setSupabaseCooperativeWalletPolicy(tenantId: string, actorId: string, input: Row) {
  assertUuid(tenantId, "Tenant"); assertUuid(actorId, "Aktor"); assertUuid(input?.walletId, "Dompet"); assertUuid(input?.clientRequestId, "Request ID");
  if (!Number.isFinite(input?.dailyLimit) || !["active", "blocked"].includes(input?.status)) throw new SupabaseCooperativeError(400, "Kebijakan dompet tidak valid.");
  return callRpc("set_cooperative_wallet_policy", { p_tenant_id: tenantId, p_actor_user_id: actorId, p_wallet_id: input.walletId, p_daily_limit: input.dailyLimit, p_status: input.status, p_request_id: input.clientRequestId });
}

export async function topUpSupabaseCooperativeWallet(tenantId: string, actorId: string, input: Row) {
  assertUuid(tenantId, "Tenant"); assertUuid(actorId, "Aktor"); assertUuid(input?.walletId, "Dompet"); assertUuid(input?.clientRequestId, "Request ID");
  if (!Number.isFinite(input?.amount) || typeof input?.reference !== "string") throw new SupabaseCooperativeError(400, "Data top-up tidak valid.");
  return callRpc("top_up_cooperative_wallet", { p_tenant_id: tenantId, p_actor_user_id: actorId, p_wallet_id: input.walletId, p_amount: input.amount, p_reference: input.reference, p_request_id: input.clientRequestId });
}

export async function checkoutSupabaseCooperativeSale(tenantId: string, actorId: string, input: Row) {
  assertUuid(tenantId, "Tenant"); assertUuid(actorId, "Aktor"); assertUuid(input?.walletId, "Dompet"); assertUuid(input?.clientRequestId, "Request ID");
  if (!Array.isArray(input?.items)) throw new SupabaseCooperativeError(400, "Daftar barang tidak valid.");
  for (const line of input.items) {
    assertUuid(line?.productId, "Produk");
    if (!Number.isInteger(line?.quantity)) throw new SupabaseCooperativeError(400, "Jumlah barang tidak valid.");
  }
  return callRpc("checkout_cooperative_wallet_sale", { p_tenant_id: tenantId, p_actor_user_id: actorId, p_wallet_id: input.walletId, p_items: input.items.map((line: Row) => ({ product_id: line.productId, quantity: line.quantity })), p_request_id: input.clientRequestId });
}

