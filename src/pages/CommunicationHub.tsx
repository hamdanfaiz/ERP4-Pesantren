import React, { Suspense } from "react";

const SupabaseCommunicationHub = React.lazy(() => import("./SupabaseCommunicationHub").then((module) => ({ default: module.SupabaseCommunicationHub })));

export function CommunicationHub() {
  return <Suspense fallback={<div className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul Komunikasi…</div>}><SupabaseCommunicationHub /></Suspense>;
}
