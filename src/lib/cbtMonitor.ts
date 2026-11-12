export type CbtMonitorAssignment = {
  assignmentId: string;
  examTitle: string;
  studentName: string;
  className: string;
  status: string;
};

export type CbtMonitorSummary<T extends CbtMonitorAssignment> = {
  totalAssignments: number;
  inProgressCount: number;
  waitingCount: number;
  completedCount: number;
  missedCount: number;
  activeParticipants: T[];
};

const IN_PROGRESS = "in_progress";
const WAITING = "assigned";
const COMPLETED = new Set(["completed", "submitted", "graded"]);

export function deriveCbtMonitorSummary<T extends CbtMonitorAssignment>(assignments: T[], search = ""): CbtMonitorSummary<T> {
  const normalizedSearch = search.trim().toLocaleLowerCase("id-ID");
  const isInProgress = (item: T) => String(item.status || "").trim().toLowerCase() === IN_PROGRESS;
  const isWaiting = (item: T) => String(item.status || "").trim().toLowerCase() === WAITING;
  const matchesSearch = (item: T) => !normalizedSearch ||
    [item.studentName, item.examTitle, item.className].some((value) => String(value || "").toLocaleLowerCase("id-ID").includes(normalizedSearch));

  const activeParticipants = assignments
    .filter((item) => (isInProgress(item) || isWaiting(item)) && matchesSearch(item))
    .sort((left, right) => Number(isWaiting(left)) - Number(isWaiting(right))
      || left.examTitle.localeCompare(right.examTitle, "id")
      || left.studentName.localeCompare(right.studentName, "id")
      || left.assignmentId.localeCompare(right.assignmentId));

  return {
    totalAssignments: assignments.length,
    inProgressCount: assignments.filter(isInProgress).length,
    waitingCount: assignments.filter(isWaiting).length,
    completedCount: assignments.filter((item) => COMPLETED.has(String(item.status || "").trim().toLowerCase())).length,
    missedCount: assignments.filter((item) => String(item.status || "").trim().toLowerCase() === "missed").length,
    activeParticipants,
  };
}
