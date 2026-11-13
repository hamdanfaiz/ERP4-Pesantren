export type CbtMonitorAssignment = {
  assignmentId: string;
  examTitle: string;
  studentName: string;
  className: string;
  status: string;
  score?: number | null;
};

export type CbtMonitorSummary<T extends CbtMonitorAssignment> = {
  totalAssignments: number;
  inProgressCount: number;
  waitingCount: number;
  completedCount: number;
  gradedCount: number;
  missedCount: number;
  otherCount: number;
  activeParticipants: T[];
};

const COMPLETED_STATUSES = new Set(["completed", "submitted", "graded"]);
const ACTIVE_STATUSES = new Set(["assigned", "in_progress"]);

function normalizedStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizedSearch(value: unknown) {
  return String(value || "").trim().toLocaleLowerCase("id-ID");
}

export function deriveCbtMonitorSummary<T extends CbtMonitorAssignment>(
  assignments: T[],
  search = "",
): CbtMonitorSummary<T> {
  const query = normalizedSearch(search);
  const statusOf = (item: T) => normalizedStatus(item.status);
  const inProgressCount = assignments.filter((item) => statusOf(item) === "in_progress").length;
  const waitingCount = assignments.filter((item) => statusOf(item) === "assigned").length;
  const completedCount = assignments.filter((item) => COMPLETED_STATUSES.has(statusOf(item))).length;
  const gradedCount = assignments.filter((item) => statusOf(item) === "graded"
    || (item.score != null && Number.isFinite(Number(item.score)))).length;
  const missedCount = assignments.filter((item) => statusOf(item) === "missed").length;
  const otherCount = assignments.length - inProgressCount - waitingCount - completedCount - missedCount;

  const activeParticipants = assignments
    .filter((item) => ACTIVE_STATUSES.has(statusOf(item)))
    .filter((item) => !query || [item.studentName, item.examTitle, item.className]
      .some((value) => normalizedSearch(value).includes(query)))
    .slice()
    .sort((left, right) => {
      const leftStatus = statusOf(left);
      const rightStatus = statusOf(right);
      return Number(leftStatus === "assigned") - Number(rightStatus === "assigned")
        || left.className.localeCompare(right.className, "id")
        || left.examTitle.localeCompare(right.examTitle, "id")
        || left.studentName.localeCompare(right.studentName, "id")
        || left.assignmentId.localeCompare(right.assignmentId);
    });

  return {
    totalAssignments: assignments.length,
    inProgressCount,
    waitingCount,
    completedCount,
    gradedCount,
    missedCount,
    otherCount,
    activeParticipants,
  };
}
