import React from 'react';
import { Construction } from 'lucide-react';
import { ModuleId } from '../types';

interface PlaceholderProps {
  module: ModuleId;
  supabaseRuntimeUnavailable?: boolean;
}

export function ModulePlaceholder({ module, supabaseRuntimeUnavailable = false }: PlaceholderProps) {
  const titles: Partial<Record<ModuleId, string>> = {
    'master-data': 'Data Induk',
    'ppdb': 'Penerimaan Santri Baru (PPDB)',
    'boarding': 'Asrama',
    'finance': 'Keuangan',
    'communication': 'Komunikasi',
    'dashboard': 'Ringkasan',
    'tahfidz': 'Tahfidz',
    'users': 'Manajemen Pengguna',
    'settings': 'Pengaturan',
    'cbt': 'Ujian Berbasis Komputer (CBT)',
    'academic': 'Akademik',
    'healthcare': 'Kesehatan (UKS)',
    'cooperative': 'Koperasi',
    'hris': 'Sumber Daya Manusia',
    'document': 'Dokumen Digital',
    'library': 'Perpustakaan',
    'donation': 'Donasi dan Wakaf',
    'laundry': 'Laundry',
    'enterprise': 'Manajemen Multi-Unit',
    'erp': 'Keuangan dan Anggaran',
    'ga': 'Sarana dan Prasarana',
    'alumni': 'Data Alumni',
    'crm': 'Relasi Wali dan Donatur',
    'lms': 'LMS Pembelajaran',
    'intelligence': 'Analitik Operasional',
    'marketplace': 'Marketplace'
  };

  const title = titles[module] || module.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

  if (supabaseRuntimeUnavailable) {
    return (
      <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-500/20 dark:bg-amber-950/20">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
          <Construction className="h-6 w-6" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{title} belum tersedia</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Silakan hubungi administrator pesantren jika Anda memerlukan akses ke modul ini.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-2xl mx-auto">
      <div className="bg-slate-100 dark:bg-white/5 p-6 rounded-full mb-6 border border-slate-200 dark:border-white/5 shadow-[0_0_30px_rgba(255,255,255,0.02)]">
        <Construction className="w-16 h-16 text-slate-500 dark:text-slate-400" />
      </div>
      <h2 className="text-2xl font-serif italic text-emerald-500 mb-2">{title}</h2>
      <p className="text-slate-500 mb-8 max-w-xl">Fitur pada modul ini belum tersedia saat ini.</p>
    </div>
  );
}
