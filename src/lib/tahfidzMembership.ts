export type TahfidzMembershipPeriod = Record<string, unknown>;

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Keep only the membership periods that are in effect on the tenant's business date. */
export function selectCurrentTahfidzMemberships<T extends TahfidzMembershipPeriod>(memberships: T[], businessDate: string): T[] {
  if (!isCalendarDate(businessDate)) return [];
  return memberships.filter((membership) => {
    const status = String(membership.status || "").trim().toLowerCase();
    const startsOn = membership.starts_on;
    const endsOn = membership.ends_on;
    if (status !== "active") return false;
    if (!isCalendarDate(startsOn) || startsOn > businessDate) return false;
    if (endsOn != null && (!isCalendarDate(endsOn) || endsOn < businessDate)) return false;
    return Boolean(String(membership.student_id || "").trim());
  });
}
