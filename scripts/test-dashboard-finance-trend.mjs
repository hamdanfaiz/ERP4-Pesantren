import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "utils", "dashboardFinanceTrend.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { getCompletedDashboardFinanceTrend, hasDashboardFinanceActivity } = await import(moduleUrl);
const now = new Date("2026-11-15T01:00:00.000Z");

assert.deepEqual(
  getCompletedDashboardFinanceTrend([
    { month: "2026-09", income: 500, expense: 120, walletDeposits: 80, walletRedemptions: 40 },
    { month: "2026-11", income: 900, expense: 100, walletDeposits: 25 },
    { month: "2026-10", income: 700, expense: 200, walletDeposits: 60, walletRedemptions: 15 },
  ], now),
  [
    { month: "2026-09", income: 500, expense: 120, walletDeposits: 80, walletRedemptions: 40, netCashflow: 460 },
    { month: "2026-10", income: 700, expense: 200, walletDeposits: 60, walletRedemptions: 15, netCashflow: 560 },
  ],
  "closed month trend is chronological and excludes the current partial month",
);

assert.deepEqual(
  getCompletedDashboardFinanceTrend([
    { month: "2026-08", income: "bad", expense: Number.POSITIVE_INFINITY, walletDeposits: "30" },
    { month: "2026-13", income: 10 },
    { month: "2026-07-01", income: 10 },
  ], now),
  [{ month: "2026-08", income: 0, expense: 0, walletDeposits: 30, walletRedemptions: 0, netCashflow: 30 }],
  "malformed month keys and non-finite aggregates are ignored or safely normalized",
);

assert.deepEqual(getCompletedDashboardFinanceTrend([], new Date("invalid")), [], "invalid clock input returns no trend");
assert.equal(hasDashboardFinanceActivity(Array.from({ length: 12 }, (_, index) => ({ month: `2026-${String(index + 1).padStart(2, "0")}`, income: 0, expense: 0, walletDeposits: 0, walletRedemptions: 0 }))), false, "generated empty months do not appear as financial activity");
assert.equal(hasDashboardFinanceActivity([{ month: "2026-10", walletDeposits: 50 }]), true, "wallet receipts count as activity");
assert.equal(hasDashboardFinanceActivity([{ month: "2026-10", income: "NaN", expense: 0 }]), false, "invalid aggregates do not create a false activity chart");

const dashboardPage = fs.readFileSync(path.join(root, "src", "pages", "SupabaseDashboardOverview.tsx"), "utf8");
assert.doesNotMatch(dashboardPage, /from\s+["']recharts["']/, "dashboard overview does not eagerly import the charting library");
assert.match(dashboardPage, /React\.lazy\(\(\)\s*=>\s*import\(["']\.\.\/components\/SupabaseDashboardBarChart["']\)/, "dashboard charts are split into an on-demand component");
assert.equal((dashboardPage.match(/<SupabaseDashboardBarChart\b/g) || []).length, 3, "all three dashboard charts use the deferred chart component");

console.log("Dashboard finance trend checks passed.");

