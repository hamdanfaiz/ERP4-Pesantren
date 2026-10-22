import React, { Suspense, lazy } from "react";

const SupabaseLMSManager = lazy(() => import("./SupabaseLMSManager").then((module) => ({ default: module.SupabaseLMSManager })));

export function LMSManager() {
  return <Suspense fallback={<div className="p-8 text-sm text-slate-500">Memuat LMS…</div>}><SupabaseLMSManager /></Suspense>;
}
