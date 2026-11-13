import assert from "node:assert/strict";
import { deriveCbtMonitorSummary } from "../src/lib/cbtMonitor";

const assignments = [
  { assignmentId: "waiting-z", examTitle: "Ujian Akhir", studentName: "Zahra", className: "Kelas 1", status: " assigned " },
  { assignmentId: "running-b", examTitle: "Ujian Tengah", studentName: "Bilal", className: "Kelas 1", status: "in_progress" },
  { assignmentId: "running-a", examTitle: "Ujian Tengah", studentName: "Aisyah", className: "Kelas 1", status: "in_progress" },
  { assignmentId: "done", examTitle: "Ujian Awal", studentName: "Hasan", className: "Kelas 2", status: "completed", score: 82 },
  { assignmentId: "submitted", examTitle: "Ujian Awal", studentName: "Salim", className: "Kelas 2", status: "submitted", score: 70 },
  { assignmentId: "graded", examTitle: "Ujian Lama", studentName: "Maryam", className: "Kelas 2", status: "graded", score: 90 },
  { assignmentId: "missed", examTitle: "Ujian Lama", studentName: "Yusuf", className: "Kelas 2", status: "missed" },
  { assignmentId: "other", examTitle: "Draf", studentName: "Nadia", className: "Kelas 2", status: "cancelled" },
];
const originalOrder = assignments.map((item) => item.assignmentId);

const summary = deriveCbtMonitorSummary(assignments);
assert.equal(summary.totalAssignments, 8, "all tenant assignments contribute to the total");
assert.equal(summary.inProgressCount, 2, "in-progress assignments are counted");
assert.equal(summary.waitingCount, 1, "assigned participants are counted as waiting");
assert.equal(summary.completedCount, 3, "completed, submitted, and graded states count as complete");
assert.equal(summary.gradedCount, 3, "graded status or a finite score counts as graded");
assert.equal(summary.missedCount, 1, "missed assignments remain visible separately");
assert.equal(summary.otherCount, 1, "unknown states are not silently classified as waiting");
assert.deepEqual(summary.activeParticipants.map((item) => item.assignmentId), ["running-a", "running-b", "waiting-z"], "active participants sort predictably by state and identity");

const filtered = deriveCbtMonitorSummary(assignments, "  KELAS 1 ");
assert.equal(filtered.totalAssignments, 8, "search does not change tenant-level totals");
assert.deepEqual(filtered.activeParticipants.map((item) => item.studentName), ["Aisyah", "Bilal", "Zahra"], "search matches names, exams, and classes case-insensitively");
assert.deepEqual(assignments.map((item) => item.assignmentId), originalOrder, "sorting does not mutate the source snapshot");
assert.equal(deriveCbtMonitorSummary([]).activeParticipants.length, 0, "an empty tenant has no synthetic active participants");

console.log("CBT session monitoring: 12 assertions passed");
