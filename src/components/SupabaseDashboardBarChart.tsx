import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ChartKind = "ppdb-stages" | "finance-monthly" | "finance-completed";
type ChartRow = Record<string, string | number | null | undefined>;

const financeSeries: Record<Exclude<ChartKind, "ppdb-stages">, Array<{ key: string; label: string; color: string }>> = {
  "finance-monthly": [
    { key: "income", label: "Pendapatan", color: "#059669" },
    { key: "walletDeposits", label: "Titipan masuk", color: "#2563eb" },
    { key: "walletRedemptions", label: "Titipan digunakan", color: "#a855f7" },
    { key: "expense", label: "Pengeluaran", color: "#e11d48" },
  ],
  "finance-completed": [
    { key: "income", label: "Pendapatan", color: "#059669" },
    { key: "walletDeposits", label: "Titipan masuk", color: "#2563eb" },
    { key: "expense", label: "Pengeluaran", color: "#e11d48" },
  ],
};

function rupiah(value: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
}

function monthLabel(value: string | number) {
  const date = new Date(`${String(value)}-01T00:00:00.000Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" }).format(date)
    : String(value);
}

export function SupabaseDashboardBarChart({ kind, data }: { kind: ChartKind; data: ChartRow[] }) {
  const isPpdb = kind === "ppdb-stages";
  const series = isPpdb ? [{ key: "jumlah", label: "Calon santri", color: "#2563eb" }] : financeSeries[kind];

  return <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 256 }}>
    <BarChart data={data} margin={{ top: 8, right: 8, left: isPpdb ? -18 : -12, bottom: 8 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" opacity={0.25} vertical={false} />
      <XAxis dataKey={isPpdb ? "stage" : "month"} tickFormatter={isPpdb ? undefined : monthLabel} stroke="#64748b" fontSize={isPpdb ? 11 : 10} tickLine={false} axisLine={false} />
      <YAxis allowDecimals={!isPpdb} tickFormatter={isPpdb ? undefined : (value) => new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0))} stroke="#64748b" fontSize={isPpdb ? 11 : 10} tickLine={false} axisLine={false} />
      <Tooltip labelFormatter={isPpdb ? undefined : monthLabel} formatter={(value) => isPpdb ? String(value ?? 0) : rupiah(Number(value || 0))} />
      {!isPpdb && <Legend />}
      {series.map((item) => <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[4, 4, 0, 0]} />)}
    </BarChart>
  </ResponsiveContainer>;
}

