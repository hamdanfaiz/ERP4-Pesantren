import React, { Suspense } from "react";

const SupabaseAlumniManager = React.lazy(() => import("./SupabaseAlumniManager").then((module) => ({ default: module.SupabaseAlumniManager })));

export function AlumniManager() {
  return <Suspense fallback={<div className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul Alumni…</div>}><SupabaseAlumniManager /></Suspense>;
}
