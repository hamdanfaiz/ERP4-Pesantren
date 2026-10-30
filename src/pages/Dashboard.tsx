import React, { Suspense } from "react";

const SupabaseDashboardOverview = React.lazy(() => import("./SupabaseDashboardOverview").then((module) => ({ default: module.SupabaseDashboardOverview })));

export function DashboardOverview() {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat dasbor…</div>}><SupabaseDashboardOverview /></Suspense>;
}
