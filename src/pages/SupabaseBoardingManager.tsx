import { publicRuntimeConfigValue } from "../runtimeConfig";
import React, { useState } from "react";
import { CalendarCheck, ClipboardList, ShieldAlert, UserRoundCog, Wrench } from "lucide-react";
import { SupabaseBoardingDisciplineManager } from "./SupabaseBoardingDisciplineManager";
import { SupabaseBoardingPermitsManager } from "./SupabaseBoardingPermitsManager";
import { SupabaseBoardingAttendanceManager } from "./SupabaseBoardingAttendanceManager";
import { SupabaseBoardingAssignmentsManager } from "./SupabaseBoardingAssignmentsManager";
import { SupabaseBoardingFacilityOpsManager } from "./SupabaseBoardingFacilityOpsManager";
import { supabaseRuntimeEnabled } from "../runtimeBackend";
import { ERPTabs } from "../components/ERPDesignSystem";

const PERMITS_ENABLED = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED"));
const DISCIPLINE_ENABLED = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_DISCIPLINE_RUNTIME_ENABLED"));
const ATTENDANCE_ENABLED = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_ATTENDANCE_RUNTIME_ENABLED"));
const ASSIGNMENTS_ENABLED = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_ASSIGNMENTS_RUNTIME_ENABLED"));
const FACILITY_OPS_ENABLED = supabaseRuntimeEnabled(publicRuntimeConfigValue("VITE_SUPABASE_BOARDING_FACILITY_OPS_RUNTIME_ENABLED"));
type Section = "permits" | "discipline" | "attendance" | "assignments" | "facility-ops";

export function SupabaseBoardingManager() {
  const sections = [
    { id: "permits" as const, label: "Perizinan", icon: <ClipboardList className="h-4 w-4" />, enabled: PERMITS_ENABLED, flag: "SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED" },
    { id: "discipline" as const, label: "Kedisiplinan", icon: <ShieldAlert className="h-4 w-4" />, enabled: DISCIPLINE_ENABLED, flag: "SUPABASE_BOARDING_DISCIPLINE_RUNTIME_ENABLED" },
    { id: "attendance" as const, label: "Kehadiran", icon: <CalendarCheck className="h-4 w-4" />, enabled: ATTENDANCE_ENABLED, flag: "SUPABASE_BOARDING_ATTENDANCE_RUNTIME_ENABLED" },
    { id: "assignments" as const, label: "Penugasan", icon: <UserRoundCog className="h-4 w-4" />, enabled: ASSIGNMENTS_ENABLED, flag: "SUPABASE_BOARDING_ASSIGNMENTS_RUNTIME_ENABLED" },
    { id: "facility-ops" as const, label: "Fasilitas", icon: <Wrench className="h-4 w-4" />, enabled: FACILITY_OPS_ENABLED, flag: "SUPABASE_BOARDING_FACILITY_OPS_RUNTIME_ENABLED" },
  ];
  const [section, setSection] = useState<Section>(sections.find((item) => item.enabled)?.id || "permits");
  const selected = sections.find((item) => item.id === section) || sections[0];
  const tabs = sections.map((item) => ({
    ...item,
    label: <span className="inline-flex items-center gap-2">{item.label}<span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${item.enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200"}`}>{item.enabled ? "Aktif" : "Belum aktif"}</span></span>,
  }));
  return <div className="space-y-5">
    <ERPTabs tabs={tabs} value={selected.id} onChange={(id) => setSection(id as Section)} ariaLabel="Navigasi modul Asrama" />
    {!selected.enabled ? <UnavailableSection label={selected.label} flag={selected.flag} />
      : selected.id === "permits" ? <SupabaseBoardingPermitsManager />
      : selected.id === "discipline" ? <SupabaseBoardingDisciplineManager />
        : selected.id === "attendance" ? <SupabaseBoardingAttendanceManager />
          : selected.id === "assignments" ? <SupabaseBoardingAssignmentsManager />
            : <SupabaseBoardingFacilityOpsManager />}
  </div>;
}

function UnavailableSection({ label, flag }: { label: string; flag: string }) {
  return <section role="status" className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
    <h2 className="font-semibold">{label} belum diaktifkan</h2>
    <p className="mt-2 leading-6">Menu tetap ditampilkan agar cakupan Asrama tidak hilang. Data belum dapat dibaca atau ditulis sebelum API Supabase, migrasi, izin tenant, dan UAT untuk bagian ini siap.</p>
    <p className="mt-3 rounded-lg bg-white/70 px-3 py-2 font-mono text-xs dark:bg-black/20">Gerbang server: {flag}</p>
  </section>;
}
