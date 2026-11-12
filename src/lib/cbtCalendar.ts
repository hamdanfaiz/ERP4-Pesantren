import { tenantDate } from "./tenantTimeZone";

export type CbtCalendarDay = {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function parseMonthKey(monthKey: string): { year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(monthKey);
  if (!match) throw new RangeError("Bulan kalender CBT tidak valid.");
  const year = Number(match[1]);
  if (year < 1000) throw new RangeError("Tahun kalender CBT tidak valid.");
  return { year, month: Number(match[2]) };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function cbtTenantMonthKey(value: Date | string | number, timeZone: string): string {
  const date = tenantDate(value, timeZone);
  return date ? date.slice(0, 7) : "";
}

export function shiftCbtCalendarMonth(monthKey: string, offset: number): string {
  const { year, month } = parseMonthKey(monthKey);
  if (!Number.isInteger(offset)) throw new RangeError("Perpindahan bulan harus berupa bilangan bulat.");
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  if (shifted.getUTCFullYear() > 9999) throw new RangeError("Tahun kalender CBT di luar jangkauan.");
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}`;
}

/** Build a fixed six-week calendar with Monday as the first day of the week. */
export function buildCbtCalendarGrid(monthKey: string, timeZone: string, now: Date | string | number = new Date()): CbtCalendarDay[] {
  const { year, month } = parseMonthKey(monthKey);
  const firstDay = new Date(Date.UTC(year, month - 1, 1, 12));
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7;
  const gridStart = Date.UTC(year, month - 1, 1 - mondayOffset, 12);
  const today = tenantDate(now, timeZone);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart + index * 86_400_000);
    const key = dateKey(date);
    return {
      date: key,
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() + 1 === month && date.getUTCFullYear() === year,
      isToday: key === today,
    };
  });
}

export type CbtScheduledExam = { startsAt: string; title?: string };

/** Schedules are assigned to the tenant-local day on which the exam starts. */
export function groupCbtExamsByTenantDate<T extends CbtScheduledExam>(exams: T[], timeZone: string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const exam of exams) {
    const date = tenantDate(exam.startsAt, timeZone);
    if (!date) continue;
    const dayExams = grouped.get(date) || [];
    dayExams.push(exam);
    grouped.set(date, dayExams);
  }
  for (const dayExams of grouped.values()) {
    dayExams.sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)
      || String(left.title || "").localeCompare(String(right.title || ""), "id"));
  }
  return grouped;
}
