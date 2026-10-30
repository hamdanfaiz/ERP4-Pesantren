import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "src", "utils", "dashboardCashflow.ts");
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: sourcePath,
}).outputText;
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`;
const { calculateDashboardNetCashflow } = await import(moduleUrl);

assert.equal(
  calculateDashboardNetCashflow({
    periodIncome: 1_000_000,
    periodWalletDeposits: 200_000,
    periodWalletRedemptions: 75_000,
    periodExpense: 350_000,
  }),
  850_000,
  "cash flow counts wallet top-ups as cash received and does not double-count wallet-funded cooperative purchases as a cash outflow",
);

assert.equal(
  calculateDashboardNetCashflow({ periodIncome: 100_000, periodExpense: 175_000 }),
  -75_000,
  "cash flow remains negative when posted expenses exceed receipts",
);

assert.equal(
  calculateDashboardNetCashflow({ periodIncome: "not-a-number", periodWalletDeposits: Number.POSITIVE_INFINITY }),
  0,
  "malformed aggregate values do not poison the executive metric with NaN or Infinity",
);

console.log("Dashboard cash-flow accounting passed: wallet liability release is not double-counted as a cash outflow.");
