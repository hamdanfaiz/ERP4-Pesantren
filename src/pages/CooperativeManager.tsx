import React, { Suspense } from "react";

const SupabaseCooperativeManager = React.lazy(() => import("./SupabaseCooperativeManager").then((module) => ({ default: module.SupabaseCooperativeManager })));

export function CooperativeManager() {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul Koperasi…</div>}><SupabaseCooperativeManager /></Suspense>;
}
