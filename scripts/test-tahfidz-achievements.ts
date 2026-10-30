import assert from "node:assert/strict";
import { getTahfidzAchievementProgress, TAHFIDZ_ACHIEVEMENTS } from "../src/lib/tahfidzAchievements";

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
console.log("Tahfidz achievement progress tests passed.");
