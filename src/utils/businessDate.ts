export const DEFAULT_TENANT_TIME_ZONE = "Asia/Jakarta";

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function tenantBusinessDate(now = new Date(), timeZone = DEFAULT_TENANT_TIME_ZONE): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(now).map(({ type, value }) => [type, value]));
  const result = `${parts.year}-${parts.month}-${parts.day}`;
  if (!isCalendarDate(result)) throw new RangeError("Tenant time zone did not produce a valid calendar date.");
  return result;
}

export function businessDateForInstant(instant: Date | string, timeZone = DEFAULT_TENANT_TIME_ZONE): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Instant must be a valid date.");
  return tenantBusinessDate(date, timeZone);
}

export function addCalendarDays(value: string, days: number): string {
  if (!isCalendarDate(value) || !Number.isSafeInteger(days)) throw new RangeError("Invalid calendar date or offset.");
  const result = new Date(`${value}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

