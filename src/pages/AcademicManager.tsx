import React, { Suspense } from "react";

const SupabaseAcademicManager = React.lazy(() => import("./SupabaseAcademicManager").then((module) => ({ default: module.SupabaseAcademicManager })));

export function AcademicManager() {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul Akademik…</div>}><SupabaseAcademicManager /></Suspense>;
}
