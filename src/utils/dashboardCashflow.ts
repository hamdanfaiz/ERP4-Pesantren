type DashboardCashflowInputs = {
  periodIncome?: unknown;
  periodWalletDeposits?: unknown;
  /** Wallet-funded cooperative sales release a liability already funded at top-up; they are not a second cash outflow. */
  periodWalletRedemptions?: unknown;
  periodExpense?: unknown;
};

function amount(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string" || !value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Cash received from bills and wallet top-ups, less posted cash expenses. */
export function calculateDashboardNetCashflow(finance: DashboardCashflowInputs): number {
  return amount(finance.periodIncome) + amount(finance.periodWalletDeposits) - amount(finance.periodExpense);
}
