import React, { lazy, Suspense } from "react";

const SupabaseMarketplace = lazy(() => import("./SupabaseMarketplaceManager").then((module) => ({ default: module.SupabaseMarketplaceManager })));

export function MarketplaceManager() {
  return <Suspense fallback={<div role="status" className="p-8 text-sm text-slate-500">Memuat Marketplace…</div>}><SupabaseMarketplace /></Suspense>;
}
