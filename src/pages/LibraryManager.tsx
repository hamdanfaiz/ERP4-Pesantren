import React, { Suspense } from "react";

const SupabaseLibraryManager = React.lazy(() => import("./SupabaseLibraryManager").then((module) => ({ default: module.SupabaseLibraryManager })));

export function LibraryManager() {
  return <Suspense fallback={<div className="mx-auto max-w-7xl p-8 text-sm text-slate-500">Memuat modul Perpustakaan…</div>}><SupabaseLibraryManager /></Suspense>;
}
