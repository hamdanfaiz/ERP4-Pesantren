import React, { Suspense } from "react";

const SupabaseDonationManager = React.lazy(() => import("./SupabaseDonationManager").then((module) => ({ default: module.SupabaseDonationManager })));

export function DonationManager() {
  return <Suspense fallback={<div role="status" className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul Donasi & Wakaf…</div>}><SupabaseDonationManager /></Suspense>;
}
