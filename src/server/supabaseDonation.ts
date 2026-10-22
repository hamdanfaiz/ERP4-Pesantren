type Row = Record<string, any>;

export class SupabaseDonationError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = "SupabaseDonationError"; this.status = status; }
}

function config() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new SupabaseDonationError(503, "Konfigurasi backend Supabase belum lengkap.");
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
    if (["23505", "23503", "23514"].includes(code) || response.status === 409) throw new SupabaseDonationError(409, body?.message || "Data berubah atau bertentangan. Muat ulang sebelum mencoba lagi.");
    if (["22023", "22P02"].includes(code) || response.status === 400) throw new SupabaseDonationError(400, body?.message || "Data donasi tidak valid.");
    if (code === "P0002" || response.status === 404) throw new SupabaseDonationError(404, body?.message || "Record donasi tidak ditemukan di tenant ini.");
    if (code === "42501" || response.status === 403) throw new SupabaseDonationError(403, "Akses Donasi & Wakaf ditolak oleh role atau tenant.");
    throw new SupabaseDonationError(503, "Layanan Donasi & Wakaf Supabase belum dapat diproses.");
  }
  return body;
}

function uuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

async function activeTenant(value: string) {
  if (!uuid(value)) throw new SupabaseDonationError(403, "Tenant donasi tidak valid.");
  const tenants = await request("/rest/v1/tenants?" + new URLSearchParams({ select: "id,status", id: "eq." + value, limit: "2" }).toString());
  if (!Array.isArray(tenants) || tenants.length !== 1 || tenants[0].status !== "active") throw new SupabaseDonationError(403, "Tenant donasi tidak aktif.");
  return value;
}

async function rows(table: string, tenantId: string, select: string, order: string, max: number) {
  const result: Row[] = [];
  for (let offset = 0; offset <= max; offset += 500) {
    const params = new URLSearchParams({ select, tenant_id: "eq." + tenantId, order, limit: String(Math.min(500, max + 1 - offset)), offset: String(offset) });
    const page = await request("/rest/v1/" + table + "?" + params.toString());
    if (!Array.isArray(page)) throw new SupabaseDonationError(503, "Data donasi belum dapat dimuat.");
    result.push(...page);
    if (result.length > max) throw new SupabaseDonationError(503, "Data donasi melewati batas tampilan aman.");
    if (page.length < Math.min(500, max + 1 - offset)) return result;
  }
  return result;
}

export async function getSupabaseDonationSnapshot(tenantIdentifier: string) {
  const tenantId = await activeTenant(tenantIdentifier);
  const [campaigns, donors, donations, assets] = await Promise.all([
    rows("donation_campaigns", tenantId, "id,title,fund_type,description,target_amount,end_date,status,created_at", "status.asc,end_date.asc.nullslast,title.asc,id.asc", 3000),
    rows("donation_donors", tenantId, "id,full_name,donor_type,email,phone,notes,status,created_at", "status.asc,full_name.asc,id.asc", 5000),
    rows("donations", tenantId, "id,donor_id,campaign_id,donor_name_snapshot,amount,fund_type,payment_method,received_at,receipt_number,reference_note,status,void_reason,created_at", "received_at.desc,id.desc", 10000),
    rows("waqf_assets", tenantId, "id,asset_code,name,asset_type,location,estimated_value,condition_label,wakif_name,acquired_on,status,notes,created_at", "status.asc,name.asc,id.asc", 3000),
  ]);
  const confirmed = donations.filter((row) => row.status === "confirmed");
  const donorTotals = new Map<string, { lifetime: number; lastDonation: string | null; count: number }>();
  for (const donation of confirmed) {
    if (!donation.donor_id) continue;
    const current = donorTotals.get(String(donation.donor_id)) || { lifetime: 0, lastDonation: null, count: 0 };
    current.lifetime += Number(donation.amount || 0); current.count += 1;
    if (!current.lastDonation || String(donation.received_at) > current.lastDonation) current.lastDonation = String(donation.received_at);
    donorTotals.set(String(donation.donor_id), current);
  }
  const campaignTotals = new Map<string, number>();
  for (const donation of confirmed) if (donation.campaign_id) campaignTotals.set(String(donation.campaign_id), (campaignTotals.get(String(donation.campaign_id)) || 0) + Number(donation.amount || 0));
  const monthly = new Map<string, number>();
  for (const donation of confirmed) {
    const month = String(donation.received_at || "").slice(0, 7);
    if (month) monthly.set(month, (monthly.get(month) || 0) + Number(donation.amount || 0));
  }
  return {
    campaigns: campaigns.map((row) => ({ ...row, type: row.fund_type, target: Number(row.target_amount), current: campaignTotals.get(String(row.id)) || 0 })),
    donors: donors.map((row) => ({ ...row, name: row.full_name, type: row.donor_type, ...(donorTotals.get(String(row.id)) || { lifetime: 0, lastDonation: null, count: 0 }) })),
    donations: donations.map((row) => ({ ...row, donorName: row.donor_name_snapshot, campaignTitle: campaigns.find((c) => c.id === row.campaign_id)?.title || "Dana umum", amount: Number(row.amount), method: row.payment_method })),
    waqfAssets: assets.map((row) => ({ ...row, type: row.asset_type, value: Number(row.estimated_value), date: row.acquired_on, condition: row.condition_label, wakif: row.wakif_name })),
    summary: {
      activeCampaigns: campaigns.filter((row) => row.status === "active").length,
      totalConfirmed: confirmed.reduce((sum, row) => sum + Number(row.amount || 0), 0),
      donationCount: confirmed.length,
      donorCount: donors.filter((row) => row.status === "active").length,
      recurringDonorCount: 0,
      waqfAssetCount: assets.filter((row) => row.status !== "disposed").length,
      waqfAssetValue: assets.filter((row) => row.status !== "disposed").reduce((sum, row) => sum + Number(row.estimated_value || 0), 0),
      monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, total]) => ({ month, total })),
    },
  };
}

export async function manageSupabaseDonationCampaign(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseDonationError(400, "Data kampanye tidak valid.");
  return request("/rest/v1/rpc/manage_donation_campaign", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function manageSupabaseDonationDonor(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseDonationError(400, "Data donatur tidak valid.");
  return request("/rest/v1/rpc/manage_donation_donor", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function manageSupabaseWaqfAsset(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseDonationError(400, "Data aset wakaf tidak valid.");
  return request("/rest/v1/rpc/manage_waqf_asset", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function recordSupabaseDonation(tenantId: string, actorId: string, item: Row) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(item?.clientRequestId)) throw new SupabaseDonationError(400, "Data transaksi donasi tidak valid.");
  return request("/rest/v1/rpc/record_donation", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_item: item }) });
}
export async function voidSupabaseDonation(tenantId: string, actorId: string, donationId: string, reason: string, requestId: string) {
  if (!uuid(tenantId) || !uuid(actorId) || !uuid(donationId) || !uuid(requestId)) throw new SupabaseDonationError(400, "Identitas pembatalan donasi tidak valid.");
  return request("/rest/v1/rpc/void_donation", { method: "POST", body: JSON.stringify({ p_tenant_id: tenantId, p_actor_user_id: actorId, p_donation_id: donationId, p_reason: reason, p_client_request_id: requestId }) });
}
