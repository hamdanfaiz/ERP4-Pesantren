import assert from "node:assert/strict";
import { deriveCbtDashboardSummary } from "../src/lib/cbtDashboard";

const now = Date.parse("2026-11-12T03:00:00.000Z");
const exams = [
  { id: "later", title: "Ujian Kedua", startsAt: "2026-11-15T03:00:00.000Z", endsAt: "2026-11-15T04:00:00.000Z", status: "published" },
  { id: "ongoing", title: "Ujian Berjalan", startsAt: "2026-11-12T02:30:00.000Z", endsAt: "2026-11-12T03:30:00.000Z", status: "active" },
  { id: "earlier", title: "Ujian Pertama", startsAt: "2026-11-13T03:00:00.000Z", endsAt: "2026-11-13T04:00:00.000Z", status: "published" },
  { id: "draft", title: "Draf", startsAt: "2026-11-12T04:00:00.000Z", endsAt: "2026-11-12T05:00:00.000Z", status: "draft" },
  { id: "cancelled", title: "Batal", startsAt: "2026-11-12T05:00:00.000Z", endsAt: "2026-11-12T06:00:00.000Z", status: "cancelled" },
  { id: "invalid", title: "Waktu tidak valid", startsAt: "invalid", endsAt: "invalid", status: "published" },
];
const assignments = [
  { assignmentId: "pass", status: "completed", score: 90, passed: true, submittedAt: "2026-11-12T02:30:00.000Z" },
  { assignmentId: "fail", status: "graded", score: 60, passed: false, submittedAt: "2026-11-12T02:45:00.000Z" },
  { assignmentId: "progress", status: "in_progress", score: null, passed: null, submittedAt: null },
  { assignmentId: "assigned", status: "assigned", score: null, passed: null, submittedAt: null },
  { assignmentId: "invalid-date", status: "completed", score: 75, passed: true, submittedAt: "invalid" },
];

const summary = deriveCbtDashboardSummary(exams, assignments, now);
assert.equal(summary.ongoingSessions, 1, "only published or active sessions in their time window count as ongoing");
assert.equal(summary.upcomingSessions, 2, "draft, cancelled, invalid, and ongoing sessions are not upcoming");
assert.deepEqual(summary.upcomingExams.map((exam) => exam.id), ["earlier", "later"], "upcoming sessions sort by start time");

const additionalUpcoming = Array.from({ length: 7 }, (_, index) => ({
  id: `future-${index + 1}`,
  title: `Ujian mendatang ${index + 1}`,
  startsAt: new Date(now + (10 + index) * 24 * 60 * 60 * 1000).toISOString(),
  endsAt: new Date(now + (10 + index) * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString(),
  status: "published",
}));
const largeSchedule = deriveCbtDashboardSummary([...exams, ...additionalUpcoming], [], now);
assert.equal(largeSchedule.upcomingSessions, 9, "total upcoming count includes exams beyond the five-item preview");
assert.equal(largeSchedule.upcomingExams.length, 5, "the preview remains bounded to five exams");
assert.equal(summary.totalAssignments, 5, "all assignments in the tenant snapshot are counted");
assert.equal(summary.completedAssignments, 3, "completed, submitted, and graded assignments count as complete");
assert.equal(summary.completionRate, 60, "completion percentage uses the full assignment count");
assert.equal(summary.scoredAssignments, 3, "only finite, non-null scores count in the average");
assert.equal(summary.averageScore, 75, "average score uses scored assignments only");
assert.equal(summary.passRate, 66.7, "pass percentage uses assignments with a pass decision");
assert.deepEqual(summary.latestResults.map((result) => result.assignmentId), ["fail", "pass"], "latest results require a valid submission time and sort newest first");

const empty = deriveCbtDashboardSummary([], [], now);
assert.equal(empty.completionRate, null, "empty tenants do not display a misleading zero completion rate");
assert.equal(empty.averageScore, null, "empty tenants do not display a sample average");
assert.equal(empty.passRate, null, "pass rate is unavailable until a result has a decision");

console.log("CBT decision dashboard: 15 assertions passed");
