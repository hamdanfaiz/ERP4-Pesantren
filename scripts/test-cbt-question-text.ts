import assert from "node:assert/strict";
import { displayCbtQuestionText } from "../src/utils/cbtQuestionText";

assert.equal(displayCbtQuestionText("<p>Arti kata kitabun adalah?</p>"), "Arti kata kitabun adalah?");
assert.equal(displayCbtQuestionText("<p>Baris pertama</p><p>Baris kedua &amp; ketiga</p>"), "Baris pertama\nBaris kedua & ketiga");
assert.equal(displayCbtQuestionText("<div>Baris A<br/>baris B</div>"), "Baris A\nbaris B");
assert.equal(displayCbtQuestionText("<script>alert(1)</script><style>bad</style><p>Soal aman</p>"), "Soal aman");
assert.equal(displayCbtQuestionText("Nilai x < 10 tetap teks biasa"), "Nilai x < 10 tetap teks biasa");
assert.equal(displayCbtQuestionText(""), "");
assert.equal(displayCbtQuestionText(null), "");
console.log("CBT question text display checks passed.");
