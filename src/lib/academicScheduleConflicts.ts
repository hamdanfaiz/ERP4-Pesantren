const DAY_ORDER = new Map([
  ["senin", 0], ["monday", 0],
  ["selasa", 1], ["tuesday", 1],
  ["rabu", 2], ["wednesday", 2],
  ["kamis", 3], ["thursday", 3],
  ["jumat", 4], ["friday", 4],
  ["sabtu", 5], ["saturday", 5],
  ["minggu", 6], ["sunday", 6],
]);
const DAY_LABEL = new Map([
  ["senin", "Senin"], ["monday", "Senin"],
  ["selasa", "Selasa"], ["tuesday", "Selasa"],
  ["rabu", "Rabu"], ["wednesday", "Rabu"],
  ["kamis", "Kamis"], ["thursday", "Kamis"],
  ["jumat", "Jumat"], ["friday", "Jumat"],
  ["sabtu", "Sabtu"], ["saturday", "Sabtu"],
  ["minggu", "Minggu"], ["sunday", "Minggu"],
]);
const MAX_VISIBLE_CONFLICTS = 500;

export type ScheduleConflictRecord = {
  id?: unknown;
  day?: string | null;
  time?: string | null;
  subject?: string | null;
  teacherUserId?: string | null;
  teacherName?: string | null;
  className?: string | null;
  room?: string | null;
  organizationUnitId?: string | null;
  organizationUnitName?: string | null;
};

export type AcademicScheduleConflict = {
  first: ScheduleConflictRecord & { id: string };
  second: ScheduleConflictRecord & { id: string };
  day: string;
  overlapStart: string;
  overlapEnd: string;
  reasons: Array<"Pengajar" | "Ruang" | "Kelas">;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("id-ID").replace(/\s+/g, " ");
}

function parseInterval(value: unknown) {
  const match = String(value ?? "").trim().match(/^([01]\d|2[0-3]):([0-5]\d)\s-\s([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  return start < end ? { start, end } : null;
}

function clock(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Detects overlaps using the same teacher/room/class and unit-scope rules as the academic writer. */
export function findAcademicScheduleConflicts(records: readonly ScheduleConflictRecord[]) {
  const invalidRecordIds: string[] = [];
  const valid = records.flatMap((record, index) => {
    const id = String(record.id ?? "").trim();
    const dayKey = normalize(record.day);
    const dayOrder = DAY_ORDER.get(dayKey);
    const interval = parseInterval(record.time);
    if (!id || dayOrder === undefined || !interval) {
      invalidRecordIds.push(id || `baris-${index + 1}`);
      return [];
    }
    return [{ record: record as ScheduleConflictRecord & { id: string }, id, dayKey, start: interval.start, end: interval.end }];
  });

  const conflictsByPair = new Map<string, AcademicScheduleConflict>();
  const resourceBuckets = new Map<string, Map<string, typeof valid>>();
  for (const entry of valid) {
    const resources = [
      ["teacher", normalize(entry.record.teacherUserId)],
      ["room", normalize(entry.record.room)],
      ["class", normalize(entry.record.className)],
    ] as const;
    for (const [kind, value] of resources) {
      if (!value) continue;
      const key = JSON.stringify([entry.dayKey, kind, value]);
      const units = resourceBuckets.get(key) || new Map<string, typeof valid>();
      const unitKey = String(entry.record.organizationUnitId ?? "").trim();
      const unitEntries = units.get(unitKey) || [];
      unitEntries.push(entry);
      units.set(unitKey, unitEntries);
      resourceBuckets.set(key, units);
    }
  }

  let truncated = false;
  const addConflict = (left: (typeof valid)[number], right: (typeof valid)[number], reason: AcademicScheduleConflict["reasons"][number]) => {
    if (left.id === right.id) return true;
    const ordered = left.id.localeCompare(right.id) <= 0 ? [left, right] as const : [right, left] as const;
    const key = `${ordered[0].id}\u0000${ordered[1].id}`;
    const existing = conflictsByPair.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return true;
    }
    if (conflictsByPair.size >= MAX_VISIBLE_CONFLICTS) {
      truncated = true;
      return false;
    }
    const first = ordered[0], second = ordered[1];
    conflictsByPair.set(key, {
      first: first.record,
      second: second.record,
      day: DAY_LABEL.get(first.dayKey) || String(first.record.day || ""),
      overlapStart: clock(Math.max(first.start, second.start)),
      overlapEnd: clock(Math.min(first.end, second.end)),
      reasons: [reason],
    });
    return true;
  };

  const sorted = (entries: typeof valid) => [...entries].sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const compareWithinUnit = (entries: typeof valid, reason: AcademicScheduleConflict["reasons"][number]) => {
    const group = sorted(entries);
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      const left = group[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < group.length && group[rightIndex].start < left.end; rightIndex += 1) {
        if (!addConflict(left, group[rightIndex], reason)) return false;
      }
    }
    return true;
  };
  const compareUnassignedToUnit = (unassigned: typeof valid, assigned: typeof valid, reason: AcademicScheduleConflict["reasons"][number]) => {
    const leftEntries = sorted(unassigned), rightEntries = sorted(assigned);
    for (const left of leftEntries) {
      for (const right of rightEntries) {
        if (right.start >= left.end) break;
        if (right.end <= left.start) continue;
        if (!addConflict(left, right, reason)) return false;
      }
    }
    return true;
  };

  for (const [key, units] of resourceBuckets) {
    const resourceKind = (JSON.parse(key) as string[])[1];
    const reason: AcademicScheduleConflict["reasons"][number] = resourceKind === "teacher" ? "Pengajar" : resourceKind === "room" ? "Ruang" : "Kelas";
    const unassigned = units.get("") || [];
    for (const [unitId, entries] of units) {
      if (unitId && !compareWithinUnit(entries, reason)) break;
    }
    if (truncated) break;
    if (unassigned.length && !compareWithinUnit(unassigned, reason)) break;
    if (truncated) break;
    if (unassigned.length) {
      for (const [unitId, entries] of units) {
        if (unitId && !compareUnassignedToUnit(unassigned, entries, reason)) break;
      }
    }
    if (truncated) break;
  }

  const conflicts = [...conflictsByPair.values()];

  conflicts.sort((a, b) => {
    const dayDifference = (DAY_ORDER.get(normalize(a.day)) ?? 7) - (DAY_ORDER.get(normalize(b.day)) ?? 7);
    if (dayDifference) return dayDifference;
    return a.overlapStart.localeCompare(b.overlapStart) || a.first.id.localeCompare(b.first.id) || a.second.id.localeCompare(b.second.id);
  });
  return { conflicts, invalidRecordIds, truncated };
}

