import React, { Suspense } from "react";

const SupabaseFacilityBooking = React.lazy(() => import("./SupabaseFacilityBooking").then((module) => ({ default: module.SupabaseFacilityBooking })));

export function FacilityBooking() {
  return <Suspense fallback={<div role="status" className="p-6 text-sm text-slate-500">Memuat pemesanan fasilitas…</div>}><SupabaseFacilityBooking /></Suspense>;
}
