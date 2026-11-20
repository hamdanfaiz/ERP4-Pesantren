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
