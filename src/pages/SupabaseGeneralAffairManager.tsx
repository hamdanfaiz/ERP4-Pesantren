import React, { lazy, Suspense, useState } from "react";
import { ERPTabs } from "../components/ERPDesignSystem";
import { Box, CalendarDays, Car, ClipboardList, Coffee, Database, LockKeyhole, ShoppingCart } from "lucide-react";

const AssetsInventory = lazy(() => import("./SupabaseGeneralAffairsAssets").then((module) => ({ default: module.SupabaseGeneralAffairsAssets })));
const FacilityBooking = lazy(() => import("../components/FacilityBooking").then((module) => ({ default: module.FacilityBooking })));
type Tab = "master" | "maintenance" | "assets" | "booking" | "procurement" | "fleet" | "housekeeping" | "kitchen";
const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
  { id: "master", label: "Master Data", icon: <Database className="h-4 w-4" /> },
  { id: "maintenance", label: "Tiket & Pemeliharaan", icon: <ClipboardList className="h-4 w-4" /> },
  { id: "assets", label: "Aset & Inventaris", icon: <Box className="h-4 w-4" /> },
  { id: "booking", label: "Pemesanan Fasilitas", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "procurement", label: "Procurement", icon: <ShoppingCart className="h-4 w-4" /> },
  { id: "fleet", label: "Fleet & Logistik", icon: <Car className="h-4 w-4" /> },
  { id: "housekeeping", label: "Housekeeping", icon: <CalendarDays className="h-4 w-4" /> },
  { id: "kitchen", label: "Kitchen & Catering", icon: <Coffee className="h-4 w-4" /> },
];

export function SupabaseGeneralAffairManager() {
  const [activeTab, setActiveTab] = useState<Tab>("assets");
  const activeLabel = TABS.find((tab) => tab.id === activeTab)?.label || "Sarana & Prasarana";
  return <div className="mx-auto max-w-7xl space-y-6">
    <header className="border-b border-slate-200 pb-5 dark:border-slate-800"><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">Sarana & Prasarana</h1><p className="mt-1 text-sm text-slate-500">{activeLabel} pesantren.</p></header>
    <ERPTabs tabs={TABS} value={activeTab} onChange={(id) => setActiveTab(id as Tab)} ariaLabel="Navigasi Sarana & Prasarana" />
    {activeTab === "assets" ? <Suspense fallback={<div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Memuat data aset…</div>}><AssetsInventory /></Suspense>
      : activeTab === "booking" ? <Suspense fallback={<div role="status" className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-900">Memuat jadwal fasilitas…</div>}><FacilityBooking /></Suspense>
      : <Unavailable label={activeLabel} />}
  </div>;
}

function Unavailable({ label }: { label: string }) {
  return <section className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-white/10 dark:bg-slate-900"><div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/5"><LockKeyhole className="h-5 w-5" /></div><h2 className="text-lg font-semibold text-slate-900 dark:text-white">{label} belum tersedia</h2><p className="mt-2 text-sm leading-6 text-slate-500">Fitur ini belum dapat digunakan. Silakan hubungi administrator pesantren untuk informasi lebih lanjut.</p></section>;
}
