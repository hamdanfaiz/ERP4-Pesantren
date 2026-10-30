import React, { Suspense, lazy } from "react";

const SupabaseHealthcareManager = lazy(() => import("./SupabaseHealthcareManager").then((module) => ({ default: module.SupabaseHealthcareManager })));

export function HealthcareManager() {
  return <Suspense fallback={<div role="status" className="p-8 text-sm text-slate-500">Memuat modul UKS…</div>}><SupabaseHealthcareManager /></Suspense>;
}
