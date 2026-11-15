import React from 'react';
import { Construction } from 'lucide-react';
import { ModuleId } from '../types';

interface PlaceholderProps {
  module: ModuleId;
  supabaseRuntimeUnavailable?: boolean;
}

export function ModulePlaceholder({ module }: PlaceholderProps) {
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

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center max-w-2xl mx-auto">
      <div className="bg-slate-100 dark:bg-white/5 p-6 rounded-full mb-6 border border-slate-200 dark:border-white/5 shadow-[0_0_30px_rgba(255,255,255,0.02)]">
        <Construction className="w-16 h-16 text-slate-500 dark:text-slate-400" />
      </div>
      <h2 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">{title} belum tersedia</h2>
      <p className="text-slate-500 mb-8 max-w-xl">
        Fitur ini belum dapat digunakan pada versi saat ini. Hubungi administrator pesantren untuk informasi lebih lanjut.
      </p>
    </div>
  );
}
