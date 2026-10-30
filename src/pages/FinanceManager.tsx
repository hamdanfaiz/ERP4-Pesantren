import React, { Suspense } from "react";

const SupabaseFinanceManager = React.lazy(() => import("./SupabaseFinanceManager").then((module) => ({ default: module.SupabaseFinanceManager })));

export function FinanceManager() {
  return <Suspense fallback={<div className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul Keuangan…</div>}><SupabaseFinanceManager /></Suspense>;
}
