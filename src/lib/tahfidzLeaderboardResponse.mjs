export function readTahfidzLeaderboardParticipantCount(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;

  if (typeof result.participants === "number"
    && Number.isSafeInteger(result.participants)
    && result.participants >= 0) {
    return result.participants;
  }

  // Older staging functions omitted this field, but an empty complete page
  // still has an unambiguous participant count of zero.
  if (result.participants === undefined
    && Array.isArray(result.students)
    && result.students.length === 0
    && result.hasMore === false) {
    return 0;
  }

  return null;
}

export function normalizeTahfidzLeaderboardResult(result, pageSize) {
  if (!result || typeof result !== "object" || Array.isArray(result)
    || !Array.isArray(result.students)
    || ![5, 20].includes(pageSize)
    || result.students.length > pageSize
    || typeof result.hasMore !== "boolean"
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(result.businessDate || ""))) return null;

  const participants = readTahfidzLeaderboardParticipantCount(result);
  if (participants === null || participants < result.students.length
    || (result.hasMore && participants <= result.students.length)) return null;

  const hasPeriodStart = Object.prototype.hasOwnProperty.call(result, "periodStart");
  if (hasPeriodStart && !/^\d{4}-\d{2}-\d{2}$/.test(String(result.periodStart || ""))) return null;
  const rankingMode = hasPeriodStart ? "monthly_ziyadah" : "lifetime_hafalan";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const students = [];
  for (const [index, source] of result.students.entries()) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return null;
    if (rankingMode === "lifetime_hafalan"
      ? !Object.prototype.hasOwnProperty.call(source, "uniqueMemorizedAyahs")
      : !Object.prototype.hasOwnProperty.call(source, "ziyadahAyahs")) return null;

    const student = {
      rank: Number(source.rank),
      id: String(source.id || ""),
      name: String(source.name || ""),
      grade: String(source.grade || ""),
      halaqah: String(source.halaqah || ""),
      ziyadahRecords: Number(source.ziyadahRecords),
      hafalanAyahs: rankingMode === "lifetime_hafalan" ? Number(source.uniqueMemorizedAyahs) : null,
      ziyadahAyahs: rankingMode === "monthly_ziyadah" ? Number(source.ziyadahAyahs) : null,
      ziyadahActiveDays: Number(source.ziyadahActiveDays),
    };
    const scoreIsValid = rankingMode === "lifetime_hafalan"
      ? Number.isSafeInteger(student.hafalanAyahs) && student.hafalanAyahs >= 0
      : Number.isSafeInteger(student.ziyadahAyahs) && student.ziyadahAyahs >= 1;
    if (!uuidPattern.test(student.id)
      || !student.name.trim()
      || student.rank !== index + 1
      || !Number.isSafeInteger(student.ziyadahRecords) || student.ziyadahRecords < 1
      || !scoreIsValid
      || !Number.isSafeInteger(student.ziyadahActiveDays) || student.ziyadahActiveDays < 1
      || student.ziyadahActiveDays > student.ziyadahRecords) return null;
    students.push(student);
  }

  return {
    rankingMode,
    periodStart: hasPeriodStart ? String(result.periodStart) : null,
    businessDate: String(result.businessDate),
    students,
    hasMore: result.hasMore,
    participants,
  };
}
