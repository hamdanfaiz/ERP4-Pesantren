import assert from "node:assert/strict";
import { resolveGuardianStudentId } from "../src/lib/guardianStudentSelection";

const children = [{ id: "student-a" }, { id: "student-b" }];

assert.equal(resolveGuardianStudentId([], "student-a"), "", "empty authorized list has no selection");
assert.equal(resolveGuardianStudentId(children, ""), "student-a", "first linked child is the initial selection");
assert.equal(resolveGuardianStudentId(children, "student-b"), "student-b", "a still-linked child remains selected");
assert.equal(resolveGuardianStudentId([children[0]], "student-b"), "student-a", "a revoked child selection falls back to an authorized child");
assert.equal(resolveGuardianStudentId([{ id: "  " }, children[1]], "missing"), "student-b", "blank identifiers are ignored");
assert.equal(resolveGuardianStudentId(children, " student-b "), "student-b", "selection identifiers are normalized");

console.log("Guardian child selection checks passed (6 assertions).");
