export const DEFAULT_TENANT_TIME_ZONE = "Asia/Jakarta";

type DateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };

export function normalizeTenantTimeZone(value?: string | null): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TENANT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
    return candidate;
  } catch {
    return DEFAULT_TENANT_TIME_ZONE;
  }
}

export function isValidTenantTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

function partsAt(value: Date, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function dateTimeValue(parts: DateTimeParts): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function tenantLocalDateTime(daysAhead: number, timeZone: string): string {
  const now = partsAt(new Date(), normalizeTenantTimeZone(timeZone));
  const calendarDate = new Date(Date.UTC(now.year, now.month - 1, now.day + daysAhead, 13, 0));
  return dateTimeValue({
    year: calendarDate.getUTCFullYear(),
    month: calendarDate.getUTCMonth() + 1,
    day: calendarDate.getUTCDate(),
    hour: 13,
    minute: 0,
  });
}

/** Convert a datetime-local value interpreted in the tenant's timezone to an ISO instant. */
export function tenantLocalDateTimeToIso(value: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Tanggal dan waktu sesi tidak valid.");
  const target: DateTimeParts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]),
  };
  const targetAsUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const normalizedTarget = new Date(targetAsUtc);
  if (normalizedTarget.getUTCFullYear() !== target.year || normalizedTarget.getUTCMonth() + 1 !== target.month
    || normalizedTarget.getUTCDate() !== target.day || target.hour > 23 || target.minute > 59) {
    throw new Error("Tanggal dan waktu sesi tidak valid.");
  }

  const zone = normalizeTenantTimeZone(timeZone);
  let instant = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const represented = partsAt(new Date(instant), zone);
    const representedAsUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute);
    const correction = representedAsUtc - targetAsUtc;
    if (correction === 0) break;
    instant -= correction;
  }
  if (dateTimeValue(partsAt(new Date(instant), zone)) !== value) {
    throw new Error("Waktu tersebut tidak tersedia pada zona waktu pesantren.");
  }
  return new Date(instant).toISOString();
}

export function formatTenantDateTime(value: string, timeZone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Tanggal tidak valid";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: normalizeTenantTimeZone(timeZone),
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function tenantDate(value: Date | string | number, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return dateTimeValue(partsAt(date, normalizeTenantTimeZone(timeZone))).slice(0, 10);
}

export function tenantTime(value: Date | string | number, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return dateTimeValue(partsAt(date, normalizeTenantTimeZone(timeZone))).slice(11, 16);
}
