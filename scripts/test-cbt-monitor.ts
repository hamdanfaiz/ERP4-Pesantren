import assert from "node:assert/strict";
import { deriveCbtMonitorSummary } from "../src/lib/cbtMonitor";

const assignments = [
  { assignmentId: "waiting-z", examTitle: "Ujian Akhir", studentName: "Zahra", className: "Kelas 2", status: "assigned" },
  { assignmentId: "running-b", examTitle: "Ujian Tengah", studentName: "Bilal", className: "Kelas 1", status: "in_progress" },
  { assignmentId: "running-a", examTitle: "Ujian Tengah", studentName: "Aisyah", className: "Kelas 1", status: "in_progress" },
  { assignmentId: "done", examTitle: "Ujian Awal", studentName: "Hasan", className: "Kelas 3", status: "completed" },
  { assignmentId: "missed", examTitle: "Ujian Lama", studentName: "Salim", className: "Kelas 4", status: "missed" },
];

const summary = deriveCbtMonitorSummary(assignments);
assert.equal(summary.totalAssignments, 5, "all tenant assignments contribute to overall totals");
assert.equal(summary.inProgressCount, 2, "in-progress assignments are counted separately");
assert.equal(summary.waitingCount, 1, "assigned participants are counted as waiting");
assert.equal(summary.completedCount, 1, "completed assignments are counted separately");
assert.equal(summary.missedCount, 1, "missed assignments remain visible as a distinct count");
assert.deepEqual(summary.activeParticipants.map((item) => item.assignmentId), ["running-a", "running-b", "waiting-z"], "active list sorts running participants before waiting participants");

const filtered = deriveCbtMonitorSummary(assignments, "kelas 1");
assert.equal(filtered.totalAssignments, 5, "search does not alter tenant-level totals");
assert.deepEqual(filtered.activeParticipants.map((item) => item.studentName), ["Aisyah", "Bilal"], "search filters only the active participant list");
assert.equal(deriveCbtMonitorSummary([]).activeParticipants.length, 0, "an empty tenant has no synthetic active participants");

console.log("CBT persisted session monitoring: 8 assertions passed");
