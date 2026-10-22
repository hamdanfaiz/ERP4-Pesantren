import React, { useState } from "react";
import { CalendarCheck, ClipboardList, ShieldAlert, UserRoundCog, Wrench } from "lucide-react";
import { SupabaseBoardingDisciplineManager } from "./SupabaseBoardingDisciplineManager";
import { SupabaseBoardingPermitsManager } from "./SupabaseBoardingPermitsManager";
import { SupabaseBoardingAttendanceManager } from "./SupabaseBoardingAttendanceManager";
import { SupabaseBoardingAssignmentsManager } from "./SupabaseBoardingAssignmentsManager";
import { SupabaseBoardingFacilityOpsManager } from "./SupabaseBoardingFacilityOpsManager";
import { supabaseRuntimeEnabled } from "../runtimeBackend";

const PERMITS_ENABLED = supabaseRuntimeEnabled(import.meta.env.VITE_SUPABASE_BOARDING_PERMITS_RUNTIME_ENABLED);
const DISCIPLINE_ENABLED = supabaseRuntimeEnabled(import.meta.env.VITE_SUPABASE_BOARDING_DISCIPLINE_RUNTIME_ENABLED);
const ATTENDANCE_ENABLED = supabaseRuntimeEnabled(import.meta.env.VITE_SUPABASE_BOARDING_ATTENDANCE_RUNTIME_ENABLED);
const ASSIGNMENTS_ENABLED = supabaseRuntimeEnabled(import.meta.env.VITE_SUPABASE_BOARDING_ASSIGNMENTS_RUNTIME_ENABLED);
const FACILITY_OPS_ENABLED = supabaseRuntimeEnabled(import.meta.env.VITE_SUPABASE_BOARDING_FACILITY_OPS_RUNTIME_ENABLED);
type Section = "permits" | "discipline" | "attendance" | "assignments" | "facility-ops";

export function SupabaseBoardingManager() {
  const initial: Section = PERMITS_ENABLED ? "permits" : DISCIPLINE_ENABLED ? "discipline" : ATTENDANCE_ENABLED ? "attendance" : "assignments";
  const [section, setSection] = useState<Section>(initial);
  const available = [
    ...(PERMITS_ENABLED ? [{ id: "permits" as const, label: "Perizinan", icon: ClipboardList }] : []),
    ...(DISCIPLINE_ENABLED ? [{ id: "discipline" as const, label: "Kedisiplinan", icon: ShieldAlert }] : []),
    ...(ATTENDANCE_ENABLED ? [{ id: "attendance" as const, label: "Kehadiran", icon: CalendarCheck }] : []),
    ...(ASSIGNMENTS_ENABLED ? [{ id: "assignments" as const, label: "Penugasan", icon: UserRoundCog }] : []),
    ...(FACILITY_OPS_ENABLED ? [{ id: "facility-ops" as const, label: "Fasilitas", icon: Wrench }] : []),
  ];
  if (!available.length) return null;
  const selected = available.some((item) => item.id === section) ? section : available[0].id;
  return <div className="space-y-5">
    {available.length > 1 && <nav aria-label="Modul asrama Supabase" className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-100 p-1">
      {available.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setSection(id)} aria-current={selected === id ? "page" : undefined}
        className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${selected === id ? "bg-white text-emerald-800 shadow-sm" : "text-slate-600 hover:bg-white/70 hover:text-slate-900"}`}>
        <Icon className="h-4 w-4" />{label}
      </button>)}
    </nav>}
    {selected === "permits" && PERMITS_ENABLED ? <SupabaseBoardingPermitsManager />
      : selected === "discipline" && DISCIPLINE_ENABLED ? <SupabaseBoardingDisciplineManager />
        : selected === "attendance" && ATTENDANCE_ENABLED ? <SupabaseBoardingAttendanceManager />
          : selected === "assignments" && ASSIGNMENTS_ENABLED ? <SupabaseBoardingAssignmentsManager />
            : <SupabaseBoardingFacilityOpsManager />}
  </div>;
}
