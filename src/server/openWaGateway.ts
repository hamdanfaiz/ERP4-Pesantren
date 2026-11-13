import { getTenantSystemSettings } from "./systemSettingsStore";

export class OpenWaGatewayError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "OpenWaGatewayError";
    this.status = status;
  }
}

export type OpenWaConfig = { baseUrl: string; apiKey: string };

export function normalizeOpenWaChatId(phone: unknown): string | null {
  const raw = typeof phone === "string" ? phone.trim() : "";
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8") && digits.length >= 9 && digits.length <= 13) digits = `62${digits}`;
  if (!/^\d{10,15}$/.test(digits)) return null;
  return `${digits}@c.us`;
}

export async function resolveOpenWaConfig(tenantId: string): Promise<OpenWaConfig> {
  const saved = await getTenantSystemSettings(tenantId).catch(() => null);
  const fromSettings = String(saved?.settings?.integrations?.waGatewayEndpoint || "").trim();
  const fromEnv = String(process.env.WA_GATEWAY_ENDPOINT || process.env.OPENWA_BASE_URL || "").trim();
  const baseUrl = (fromSettings || fromEnv).replace(/\/+$/, "");
  const apiKey = String(process.env.WA_GATEWAY_API_KEY || "").trim();
  if (!baseUrl) {
    throw new OpenWaGatewayError(503, "Endpoint OpenWA belum dikonfigurasi. Isi Alamat URL API di Pengaturan atau WA_GATEWAY_ENDPOINT.");
  }
  if (!apiKey) {
    throw new OpenWaGatewayError(503, "Rahasia WA_GATEWAY_API_KEY belum diisi di environment server.");
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new OpenWaGatewayError(400, "Endpoint OpenWA harus berupa URL http(s) yang valid.");
  }
  return { baseUrl, apiKey };
}

export async function getOpenWaStatus(tenantId: string) {
  try {
    const config = await resolveOpenWaConfig(tenantId);
    return {
      configured: true,
      endpoint: config.baseUrl,
      provider: "open-wa",
      sendPath: "/api/messages/sendText",
    };
  } catch (error) {
    if (error instanceof OpenWaGatewayError) {
      return { configured: false, endpoint: null, provider: "open-wa", error: error.message };
    }
    throw error;
  }
}

async function postOpenWa(config: OpenWaConfig, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-API-Key": config.apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const raw = await response.text();
  let payload: any = null;
  if (raw) {
    try { payload = JSON.parse(raw); } catch { payload = { raw }; }
  }
  return { response, payload };
}

/** Kirim teks lewat OpenWA Easy API (open-wa / wa-automate). */
export async function openWaSendText(tenantId: string, phoneOrChatId: string, content: string) {
  const text = String(content || "").trim();
  if (!text || text.length > 4000) throw new OpenWaGatewayError(400, "Isi pesan WhatsApp tidak valid (1–4000 karakter).");
  const chatId = phoneOrChatId.includes("@") ? phoneOrChatId.trim() : normalizeOpenWaChatId(phoneOrChatId);
  if (!chatId) throw new OpenWaGatewayError(400, "Nomor WhatsApp tidak valid untuk OpenWA.");
  const config = await resolveOpenWaConfig(tenantId);

  let attempt = await postOpenWa(config, "/api/messages/sendText", { to: chatId, content: text, options: {} });
  if (attempt.response.status === 404) {
    attempt = await postOpenWa(config, "/api/sendText", { to: chatId, text, content: text });
  }

  const { response, payload } = attempt;
  if (response.status === 401 || response.status === 403) {
    throw new OpenWaGatewayError(503, "OpenWA menolak API key. Periksa WA_GATEWAY_API_KEY dan --api-key pada proses OpenWA.");
  }
  if (!response.ok) {
    const detail = typeof payload?.message === "string" ? payload.message
      : typeof payload?.error === "string" ? payload.error
        : `HTTP ${response.status}`;
    throw new OpenWaGatewayError(502, `OpenWA gagal mengirim: ${detail}`);
  }
  if (payload && payload.success === false) {
    throw new OpenWaGatewayError(502, "OpenWA menolak pengiriman pesan.");
  }
  return {
    chatId,
    messageId: payload?.data == null ? null : (typeof payload.data === "string" ? payload.data : String(payload.data?._serialized || payload.data?.id || "")),
    raw: payload,
  };
}
