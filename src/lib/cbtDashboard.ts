export type CbtDashboardExam = { startsAt: string; endsAt: string; status: string };
export type CbtDashboardAssignment = { status: string; score: number | null; passed: boolean | null; submittedAt: string | null };

export type CbtDashboardSummary<TExam, TAssignment> = {
  ongoingSessions: number;
  upcomingSessions: number;
  totalAssignments: number;
  completedAssignments: number;
  completionRate: number | null;
  scoredAssignments: number;
  averageScore: number | null;
  passRate: number | null;
  upcomingExams: TExam[];
  latestResults: TAssignment[];
};

export type CbtExamAssignmentCounts = { assignedCount: number; completedCount: number };

/** Count assignments in one linear pass instead of repeatedly scanning the full list per exam. */
export function summarizeCbtAssignmentsByExam<T>(
  assignments: readonly T[],
  getExamId: (assignment: T) => string,
  getStatus: (assignment: T) => string,
): Map<string, CbtExamAssignmentCounts> {
  const counts = new Map<string, CbtExamAssignmentCounts>();
  for (const assignment of assignments) {
    const examId = getExamId(assignment);
    const current = counts.get(examId) || { assignedCount: 0, completedCount: 0 };
    current.assignedCount += 1;
    if (getStatus(assignment) === "completed") current.completedCount += 1;
    counts.set(examId, current);
  }
  return counts;
}

const PUBLISHED_SESSION_STATUSES = new Set(["active", "published"]);
const COMPLETED_ASSIGNMENT_STATUSES = new Set(["completed", "submitted", "graded"]);

function isValidInstant(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

export function deriveCbtDashboardSummary<
  TExam extends CbtDashboardExam,
  TAssignment extends CbtDashboardAssignment,
>(exams: TExam[], assignments: TAssignment[], now: Date | number = new Date()): CbtDashboardSummary<TExam, TAssignment> {
  const nowMs = now instanceof Date ? now.getTime() : now;
  const validNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const publishedExams = exams.filter((exam) => PUBLISHED_SESSION_STATUSES.has(String(exam.status || "").toLowerCase()));
  const ongoingSessions = publishedExams.filter((exam) => {
    const start = isValidInstant(exam.startsAt);
    const end = isValidInstant(exam.endsAt);
    return start !== null && end !== null && start <= validNow && validNow < end;
  }).length;
  const allUpcomingExams = publishedExams
    .filter((exam) => {
      const start = isValidInstant(exam.startsAt);
      return start !== null && start > validNow;
    })
    .sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt));
  const upcomingExams = allUpcomingExams.slice(0, 5);
  const completedAssignments = assignments.filter((assignment) => COMPLETED_ASSIGNMENT_STATUSES.has(String(assignment.status || "").toLowerCase())).length;
  const scored = assignments.filter((assignment) => assignment.score !== null && Number.isFinite(Number(assignment.score)));
  const passed = assignments.filter((assignment) => assignment.passed !== null);
  const averageScore = scored.length
    ? Math.round((scored.reduce((sum, assignment) => sum + Number(assignment.score), 0) / scored.length) * 10) / 10
    : null;
  const passedCount = passed.filter((assignment) => assignment.passed === true).length;
  const latestResults = assignments
    .filter((assignment) => isValidInstant(assignment.submittedAt) !== null)
    .sort((left, right) => Date.parse(right.submittedAt!) - Date.parse(left.submittedAt!))
    .slice(0, 5);

  return {
    ongoingSessions,
    upcomingSessions: allUpcomingExams.length,
    totalAssignments: assignments.length,
    completedAssignments,
    completionRate: percent(completedAssignments, assignments.length),
    scoredAssignments: scored.length,
    averageScore,
    passRate: percent(passedCount, passed.length),
    upcomingExams,
    latestResults,
  };
}
