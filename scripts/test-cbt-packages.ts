import assert from "node:assert/strict";
import { deriveCbtPackageSummaries } from "../src/lib/cbtPackages";

const summaries = deriveCbtPackageSummaries([
  { id: "template-b", name: "Ujian Akhir", description: "Evaluasi semester" },
  { id: "template-a", name: "Latihan", description: "Penguatan materi" },
  { id: "empty", name: "Paket Kosong", description: "" },
], [
  { templateReferenceId: "template-a", subject: "Fiqih", grade: "Kelas 1", status: "active" },
  { templateReferenceId: "template-a", subject: "Fiqih", grade: "Kelas 2", status: "active" },
  { templateReferenceId: "template-a", subject: "Akidah", grade: "Kelas 2", status: "archived" },
  { templateReferenceId: "template-b", subject: "Bahasa Arab", grade: "Kelas 3", status: "active" },
  { templateReferenceId: "missing-template", subject: "Tidak terpetakan", grade: "Kelas 4", status: "active" },
]);

assert.deepEqual(summaries.map((item) => item.id), ["template-a", "empty", "template-b"], "templates sort predictably by name and remain tenant-reference driven");
assert.equal(summaries.length, 3, "templates without questions remain visible");
assert.equal(summaries[0].totalQuestions, 3, "questions are counted only in their referenced package");
assert.equal(summaries[0].activeQuestions, 2, "only active questions count as available");
assert.deepEqual(summaries[0].subjects, ["Akidah", "Fiqih"], "subjects are unique and sorted");
assert.deepEqual(summaries[0].gradeLevels, ["Kelas 1", "Kelas 2"], "grade levels are unique and sorted");
assert.equal(summaries[1].totalQuestions, 0, "an empty package has zero persisted questions");
assert.equal(summaries[2].activeQuestions, 1, "active count is isolated to the matching reference id");

const scaleTemplates = Array.from({ length: 100 }, (_, index) => ({ id: `scale-${index}`, name: `Paket ${index}`, description: "" }));
const scaleQuestions = Array.from({ length: 10_000 }, (_, index) => ({
  templateReferenceId: `scale-${index % 100}`,
  subject: `Mapel ${index % 8}`,
  grade: `Kelas ${index % 12}`,
  status: Math.floor(index / 100) % 2 ? "active" : "archived",
}));
const scaleSummaries = deriveCbtPackageSummaries(scaleTemplates, scaleQuestions);
assert.equal(scaleSummaries.length, 100, "large tenant retains every configured package");
const firstScalePackage = scaleSummaries.find((item) => item.id === "scale-0");
assert.equal(firstScalePackage?.totalQuestions, 100, "large tenant questions are grouped to the correct package");
assert.equal(firstScalePackage?.activeQuestions, 50, "active counts remain accurate at tenant scale");

console.log("CBT tenant package summaries: 11 assertions passed");
