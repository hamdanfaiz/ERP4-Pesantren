import React, { Suspense, lazy } from "react";

const SupabaseCBTStudentDashboard = lazy(() => import("./SupabaseCBTStudentDashboard").then((module) => ({ default: module.SupabaseCBTStudentDashboard })));

export function CBTStudentDashboard() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-500">Memuat ujian…</div>}><SupabaseCBTStudentDashboard /></Suspense>;
}
