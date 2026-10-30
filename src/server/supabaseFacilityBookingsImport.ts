import { createHmac, randomUUID } from "node:crypto";
import { applySupabaseLegacyFacilityBookings as applySupabaseLegacyFacilityBookingsRpc, SupabaseFacilityBookingError } from "./supabaseFacilityBookings";

type Row = Record<string, any>;
export type LegacyFacilityBookingSources = Array<{ id: string; data: Row }>;
function stable(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") { const result: Row = {}; for (const key of Object.keys(value).sort()) result[key] = stable(value[key]); return result; }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value === undefined ? null : value;
}
function fingerprint(value: unknown) {
  const key = String(process.env.SUPABASE_LEGACY_FINGERPRINT_KEY || "").trim();
  if (key.length < 32) throw new SupabaseFacilityBookingError(503, "Kunci fingerprint migrasi server belum dikonfigurasi.");
  return createHmac("sha256", key).update(JSON.stringify(stable(value))).digest("hex");
}
function sourceId(id: string) { return fingerprint(`facility-booking\u0000${id}`); }
function reference(id: string) { return sourceId(id).slice(0, 12); }
function text(value: unknown) { return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim(); }
function normalize(value: unknown) { return text(value).replace(/\s+/g, " ").toLocaleLowerCase("id-ID"); }
function dateValue(value: unknown): string | null {
  let input: any = value;
  try { if (input && typeof input.toDate === "function") input = input.toDate(); else if (input && typeof input._seconds === "number") input = new Date(input._seconds * 1000); } catch { return null; }
  const raw = input instanceof Date ? input.toISOString().slice(0, 10) : text(input).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw ? raw : null;
}
function timeValue(value: unknown): string | null {
  const raw = text(value);
  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]), second = Number(match[3] || 0);
  if (hour > 23 || minute > 59 || second > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
function minutes(value: string) { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; }
function mapStatus(value: unknown): "confirmed" | "cancelled" | null {
  const status = normalize(value);
  if (["cancelled", "canceled", "dibatalkan", "batal"].includes(status)) return "cancelled";
  if (["", "confirmed", "booked", "active", "approved", "disetujui", "terkonfirmasi"].includes(status)) return "confirmed";
  return null;
}

export function previewSupabaseLegacyFacilityBookings(sourceRows: LegacyFacilityBookingSources, existingRows: Row[]) {
  const sources = [...(sourceRows || [])].map((row) => ({ id: String(row.id || ""), data: stable(row.data || {}) as Row })).sort((a, b) => a.id.localeCompare(b.id));
  const snapshotFingerprint = fingerprint(sources);
  const counts = { source: sources.length, ready: 0, alreadyImported: 0, invalid: 0, confirmed: 0, cancelled: 0 };
  const issues: Array<{ code: string; recordRef: string }> = [];
  const items: Row[] = [];
  if (sources.length > 6000) return { snapshotFingerprint, counts, issues: [{ code: "record_limit_exceeded", recordRef: "" }], issueCount: 1, blockingCount: 1, canApply: false, items };
  const existingSources = new Map<string, string>();
  const reservations: Array<{ id: string; room: string; date: string; start: number; end: number; sourceId: string }> = [];
  for (const row of existingRows) {
    if (row.source_record_id) existingSources.set(String(row.source_record_id), String(row.source_fingerprint || ""));
    if (row.status === "confirmed") {
      const date = dateValue(row.booking_date), start = timeValue(row.start_time), end = timeValue(row.end_time), room = normalize(row.room_name);
      if (date && start && end && room) reservations.push({ id: String(row.id || ""), room, date, start: minutes(start), end: minutes(end), sourceId: String(row.source_record_id || "") });
    }
  }
  const seen = new Set<string>();
  const addIssue = (code: string, id: string) => { issues.push({ code, recordRef: reference(id) }); counts.invalid += 1; };
  for (const source of sources) {
    const raw = source.data;
    const id = sourceId(source.id);
    const sourceFingerprint = fingerprint(raw);
    if (!source.id || seen.has(id)) { addIssue("duplicate_or_missing_source_id", source.id); continue; }
    seen.add(id);
    const room = text(raw.room), date = dateValue(raw.date), start = timeValue(raw.startTime), end = timeValue(raw.endTime);
    const purpose = text(raw.purpose), booker = text(raw.booker), status = mapStatus(raw.status);
    if (!room || room.length > 180 || !date || !start || !end || minutes(end) <= minutes(start) || !purpose || purpose.length > 500 || !booker || booker.length > 180 || !status) { addIssue("invalid_booking_record", source.id); continue; }
    const prior = existingSources.get(id);
    if (prior && prior !== sourceFingerprint) { addIssue("source_changed_after_import", source.id); continue; }
    if (prior === sourceFingerprint) counts.alreadyImported += 1;
    if (status === "confirmed") {
      const collision = reservations.find((item) => item.sourceId !== id && item.room === normalize(room) && item.date === date && item.start < minutes(end!) && item.end > minutes(start!));
      if (collision) { addIssue("booking_time_conflict", source.id); continue; }
      reservations.push({ id, room: normalize(room), date, start: minutes(start), end: minutes(end), sourceId: id });
      counts.confirmed += 1;
    } else counts.cancelled += 1;
    items.push({ sourceRecordId: id, sourceFingerprint, clientRequestId: randomUUID(), room, date, startTime: start, endTime: end, purpose, booker, status });
  }
  counts.ready = items.length;
  const blockingCount = issues.length;
  const alreadyComplete = sources.length === counts.alreadyImported;
  return { snapshotFingerprint, counts, issues: issues.slice(0, 100), issueCount: issues.length, blockingCount, canApply: blockingCount === 0 && items.length === sources.length && (items.length > 0 || alreadyComplete), items };
}

export async function applySupabaseLegacyFacilityBookings(tenantId: string, actorId: string, sourceRows: LegacyFacilityBookingSources, existingRows: Row[], expectedFingerprint: string) {
  const preview = previewSupabaseLegacyFacilityBookings(sourceRows, existingRows);
  if (!/^[0-9a-f]{64}$/.test(String(expectedFingerprint || "")) || preview.snapshotFingerprint !== expectedFingerprint) throw new SupabaseFacilityBookingError(409, "Snapshot pemesanan fasilitas berubah sejak pratinjau. Buat pratinjau baru sebelum menerapkan impor.");
  if (!preview.canApply) throw new SupabaseFacilityBookingError(409, "Pratinjau pemesanan fasilitas memiliki konflik atau data yang perlu ditinjau.");
  const result = await applySupabaseLegacyFacilityBookingsRpc(tenantId, actorId, preview.snapshotFingerprint, preview.counts.source, preview.items);
  return { snapshotFingerprint: preview.snapshotFingerprint, counts: preview.counts, imported: Number(result?.imported || 0), unchanged: Number(result?.unchanged || 0), alreadyApplied: Boolean(result?.alreadyApplied) };
}
