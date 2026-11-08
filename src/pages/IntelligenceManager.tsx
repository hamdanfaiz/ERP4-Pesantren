import React, { useState } from 'react';
import { Activity, BrainCircuit, Database, LineChart, Mic, BookOpen, type LucideIcon } from 'lucide-react';
import { ERPFeatureStatus, ERPPageContainer, ERPTabs } from '../components/ERPDesignSystem';

type InsightSection = {
  id: string;
  label: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

const INSIGHT_SECTIONS: InsightSection[] = [
  {
    id: 'executive',
    label: 'Ringkasan eksekutif',
    icon: Activity,
    title: 'Analisis lintas modul',
    description: 'Ringkasan operasional tersedia pada Dashboard utama. Analisis lanjutan yang menggabungkan data akademik, keuangan, dan asrama belum tersedia.',
  },
  {
    id: 'predictive',
    label: 'Analisis prediktif',
    icon: LineChart,
    title: 'Prediksi dan rekomendasi',
    description: 'Prediksi penerimaan santri, risiko tunggakan, dan rekomendasi operasional belum tersedia.',
  },
  {
    id: 'tahfidz-ai',
    label: 'Analitik Tahfidz',
    icon: Mic,
    title: 'Analisis hafalan otomatis',
    description: 'Pencatatan target dan setoran tersedia di modul Tahfidz. Penilaian bacaan otomatis dan prediksi capaian belum tersedia.',
  },
  {
    id: 'data-warehouse',
    label: 'Laporan lintas modul',
    icon: Database,
    title: 'Analisis data gabungan',
    description: 'Analisis gabungan dari berbagai modul belum tersedia. Gunakan laporan pada modul terkait untuk melihat data operasional.',
  },
  {
    id: 'knowledge',
    label: 'Pencarian dokumen',
    icon: BookOpen,
    title: 'Pencarian dokumen cerdas',
    description: 'Pencarian berbasis pertanyaan pada dokumen belum tersedia. Pengelolaan arsip tetap tersedia di modul Dokumen Digital.',
  },
];

export function IntelligenceManager() {
  const [activeTab, setActiveTab] = useState(INSIGHT_SECTIONS[0].id);
  const activeSection = INSIGHT_SECTIONS.find((section) => section.id === activeTab) || INSIGHT_SECTIONS[0];
  const ActiveIcon = activeSection.icon;

  return (
    <ERPPageContainer className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
            <BrainCircuit className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="erp-page-title">Analitik dan Wawasan</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Ringkasan dan analisis untuk membantu pengambilan keputusan pesantren.</p>
          </div>
        </div>
      </header>

      <ERPTabs
        tabs={INSIGHT_SECTIONS.map(({ id, label, icon: Icon }) => ({ id, label, icon: <Icon className="h-4 w-4" aria-hidden="true" /> }))}
        value={activeTab}
        onChange={setActiveTab}
        ariaLabel="Jenis analitik"
      />

      <section className="space-y-4" aria-labelledby="insight-section-title">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300">
            <ActiveIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="insight-section-title" className="text-base font-semibold text-slate-900 dark:text-white">{activeSection.title}</h2>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{activeSection.label}</p>
          </div>
        </div>
        <ERPFeatureStatus
          title="Status layanan"
          status="Belum tersedia"
          description={activeSection.description}
          tone="warning"
        />
      </section>
    </ERPPageContainer>
  );
}
