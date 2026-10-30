import assert from "node:assert/strict";
import { isModuleAccessible, isValidModulePermissions } from "../src/rbac";
import type { ModuleId } from "../src/types";

const retiredModule = "ecosystem" as ModuleId;

assert.equal(isModuleAccessible("SuperAdmin", "settings", { settings: false }), true);
assert.equal(isModuleAccessible("Admin", "settings"), false);
assert.equal(isModuleAccessible("Admin", "finance"), true);
assert.equal(isModuleAccessible("Admin", "finance", { finance: false }), false);
assert.equal(isModuleAccessible("Ustadz", "finance"), false);
assert.equal(isModuleAccessible("Ustadz", "finance", { finance: true }), true);
assert.equal(isModuleAccessible("Admin", "finance", { finance: "false" } as unknown as Record<string, boolean>), false);
assert.equal(isModuleAccessible("SuperAdmin", retiredModule), false);
assert.equal(isModuleAccessible("Admin", retiredModule, { ecosystem: true }), false);
assert.equal(isValidModulePermissions({ finance: true, library: false }), true);
assert.equal(isValidModulePermissions({ finance: "false" }), false);
assert.equal(isValidModulePermissions({ notARealModule: true }), false);
assert.equal(isValidModulePermissions({ ecosystem: true }), false);
assert.equal(isValidModulePermissions([]), false);

console.log("RBAC permissions: 14 cases passed");
