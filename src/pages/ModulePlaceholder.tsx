import React from 'react';
import { Construction } from 'lucide-react';
import { ModuleId } from '../types';

interface PlaceholderProps {
  module: ModuleId;
  supabaseRuntimeUnavailable?: boolean;
}

export function ModulePlaceholder({ module, supabaseRuntimeUnavailable = false }: PlaceholderProps) {
  const titles: Partial<Record<ModuleId, string>> = {
    'master-data': 'Master Data Management',
    'ppdb': 'PPDB & Admissions',
    'boarding': 'Boarding (Asrama) Management',
    'finance': 'Finance & Accounting',
    'communication': 'Communication Hub',
    'dashboard': 'Dashboard',
    'tahfidz': 'Tahfidz'
  };

  const title = titles[module] || module.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  if (supabaseRuntimeUnavailable) {
    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-500/20 dark:bg-amber-950/20">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title} belum tersedia di runtime Supabase</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Modul ini belum memiliki alur operasional Supabase yang lengkap. Akses ke data lama tidak dibuka dari runtime aplikasi; modul akan tersedia setelah skema, API tenant, migrasi data, dan hak aksesnya selesai.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-2xl mx-auto">
      <div className="bg-slate-100 dark:bg-white/5 p-6 rounded-full mb-6 border border-slate-200 dark:border-white/5 shadow-[0_0_30px_rgba(255,255,255,0.02)]">
        <Construction className="w-16 h-16 text-slate-500 dark:text-slate-400" />
      </div>
      <h2 className="text-2xl font-serif italic text-emerald-500 mb-2">{title}</h2>
      <p className="text-slate-500 mb-8 max-w-xl">
        This module is currently part of the Phase 1 architecture plan. The user interfaces and backend integrations are being engineered.
      </p>
      
      <div className="bg-white/[0.02] p-6 rounded-2xl border border-slate-200 dark:border-white/5 w-full text-left">
        <h3 className="font-semibold text-slate-500 dark:text-slate-400 mb-4 text-[10px] uppercase tracking-widest">Planned Architecture Dependencies</h3>
        <ul className="space-y-3 text-sm text-slate-700 dark:text-slate-300 font-mono tracking-tight">
          <li className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5">
            <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.6)]"></div>
            <span>Supabase Auth / Tenant Context</span>
          </li>
          <li className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]"></div>
            <span>Postgres Schema with Row Level Security</span>
          </li>
          <li className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/5">
            <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.6)]"></div>
            <span>Cloud Run API Proxies <span className="opacity-50">(If strict external APIs needed)</span></span>
          </li>
        </ul>
      </div>
    </div>
  );
}
