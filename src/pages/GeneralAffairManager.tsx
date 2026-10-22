import React, { lazy, Suspense } from "react";

const SupabaseGeneralAffairs = lazy(() => import("./SupabaseGeneralAffairManager").then((module) => ({ default: module.SupabaseGeneralAffairManager })));

export function GeneralAffairManager() {
  return <Suspense fallback={<div role="status" className="p-8 text-sm text-slate-500">Memuat modul General Affairs…</div>}><SupabaseGeneralAffairs /></Suspense>;
}
