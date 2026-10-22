import React, { Suspense, lazy } from "react";

const SupabaseCBTManager = lazy(() => import("./SupabaseCBTManager").then((module) => ({ default: module.SupabaseCBTManager })));

export function CBTManager() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-500">Memuat modul CBT…</div>}><SupabaseCBTManager /></Suspense>;
}
