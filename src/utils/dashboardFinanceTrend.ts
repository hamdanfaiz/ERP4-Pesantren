export type DashboardFinanceTrendInput = {
  month: string;
  income?: unknown;
  expense?: unknown;
  walletDeposits?: unknown;
  walletRedemptions?: unknown;
};

export type DashboardFinanceTrendPoint = {
  month: string;
  income: number;
  expense: number;
  walletDeposits: number;
  walletRedemptions: number;
  netCashflow: number;
};

function finiteAmount(value: unknown): number {
  const amount = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : 0;
  return Number.isFinite(amount) ? amount : 0;
}

export function hasDashboardFinanceActivity(rows: DashboardFinanceTrendInput[] | undefined): boolean {
  return Array.isArray(rows) && rows.some((row) =>
    [row?.income, row?.expense, row?.walletDeposits, row?.walletRedemptions].some((value) => finiteAmount(value) !== 0),
  );
}

/** Returns closed UTC months only, so a partial current month is not compared as if complete. */
export function getCompletedDashboardFinanceTrend(
  rows: DashboardFinanceTrendInput[],
  now: Date = new Date(),
): DashboardFinanceTrendPoint[] {
  if (!Array.isArray(rows) || !Number.isFinite(now.getTime())) return [];

  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return rows
    .filter((row) => typeof row?.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) && row.month < currentMonth)
    .sort((left, right) => left.month.localeCompare(right.month))
    .slice(-12)
    .map((row) => {
      const income = finiteAmount(row.income);
      const expense = finiteAmount(row.expense);
      const walletDeposits = finiteAmount(row.walletDeposits);
      const walletRedemptions = finiteAmount(row.walletRedemptions);
      return {
        month: row.month,
        income,
        expense,
        walletDeposits,
        walletRedemptions,
        // Wallet top-ups are cash received; spending from an already-funded wallet is not counted twice.
        netCashflow: income + walletDeposits - expense,
      };
    });
}

