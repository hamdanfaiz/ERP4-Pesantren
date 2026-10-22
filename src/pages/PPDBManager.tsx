import React, { Suspense } from "react";

const SupabasePpdbManager = React.lazy(() => import("./SupabasePpdbManager").then((module) => ({ default: module.SupabasePpdbManager })));

export function PPDBManager() {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul PPDB…</div>}><SupabasePpdbManager /></Suspense>;
}
