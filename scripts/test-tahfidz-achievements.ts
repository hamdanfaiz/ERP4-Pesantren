import assert from "node:assert/strict";
import { getTahfidzAchievementProgress, TAHFIDZ_ACHIEVEMENTS } from "../src/lib/tahfidzAchievements";
import { buildTahfidzViewScopeKey, getRowsForTahfidzViewScope, isTahfidzViewScopeCurrent } from "../src/lib/tahfidzViewScope";

const earned = getTahfidzAchievementProgress({
  totalRecords: 100,
  ziyadahRecords: 25,
  murojaahRecords: 25,
  studyDays: 7,
});
assert.equal(TAHFIDZ_ACHIEVEMENTS.length, 6);
assert.ok(earned.every((achievement) => achievement.earned));
assert.equal(earned.find((achievement) => achievement.id === "seven-study-days")?.description.includes("tidak harus berturut-turut"), true);

const belowThreshold = getTahfidzAchievementProgress({
  totalRecords: 9,
  ziyadahRecords: 24,
  murojaahRecords: 0,
  studyDays: 6,
});
assert.equal(belowThreshold.find((achievement) => achievement.id === "ten-records")?.progress, 9);
assert.equal(belowThreshold.find((achievement) => achievement.id === "ten-records")?.earned, false);
assert.equal(belowThreshold.find((achievement) => achievement.id === "ziyadah-25")?.progress, 24);
assert.equal(belowThreshold.find((achievement) => achievement.id === "ziyadah-25")?.earned, false);
assert.equal(belowThreshold.find((achievement) => achievement.id === "murojaah-25")?.progress, 0);
assert.equal(belowThreshold.find((achievement) => achievement.id === "seven-study-days")?.earned, false);

const zero = getTahfidzAchievementProgress({
  totalRecords: 0,
  ziyadahRecords: 0,
  murojaahRecords: 0,
  studyDays: 0,
});
assert.ok(zero.every((achievement) => !achievement.earned && achievement.progress === 0));

const invalid = getTahfidzAchievementProgress({
  totalRecords: Number.NaN,
  ziyadahRecords: -1,
  murojaahRecords: Number.POSITIVE_INFINITY,
  studyDays: 1.5,
});
assert.ok(invalid.every((achievement) => !achievement.earned && achievement.progress === 0));

const tenantAScope = buildTahfidzViewScopeKey({
  tenantId: "tenant-a",
  userId: "admin-a",
  role: "Admin",
  modulePermission: true,
});
assert.ok(tenantAScope.length > 0);
assert.equal(isTahfidzViewScopeCurrent(tenantAScope, tenantAScope), true);
assert.equal(isTahfidzViewScopeCurrent(tenantAScope, ""), false);
assert.equal(isTahfidzViewScopeCurrent("", tenantAScope), false);
assert.equal(isTahfidzViewScopeCurrent(tenantAScope, buildTahfidzViewScopeKey({
  tenantId: "tenant-b", userId: "admin-a", role: "Admin", modulePermission: true,
})), false);
assert.equal(isTahfidzViewScopeCurrent(tenantAScope, buildTahfidzViewScopeKey({
  tenantId: "tenant-a", userId: "wali-a", role: "Walisantri", modulePermission: true,
})), false);
assert.deepEqual(getRowsForTahfidzViewScope(["data tenant A"], tenantAScope, ""), []);
assert.deepEqual(getRowsForTahfidzViewScope(["data tenant A"], tenantAScope, tenantAScope), ["data tenant A"]);
assert.equal(buildTahfidzViewScopeKey({ tenantId: "", userId: "admin-a", role: "Admin" }), "");

console.log("Tahfidz achievement and view-scope tests passed.");
