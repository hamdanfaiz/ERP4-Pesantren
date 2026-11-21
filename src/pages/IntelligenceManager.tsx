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
    <div className="space-y-6 max-w-7xl w-full mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-emerald-500" />
            Pusat Analitik Eksekutif
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Ringkasan analitik untuk membantu pengambilan keputusan pesantren.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm">
             <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
             Analitik
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row gap-6 mt-6">
         <div className="lg:w-64 shrink-0 space-y-1">
            {[
              { id: 'executive', label: 'Ringkasan Eksekutif', icon: Activity },
              { id: 'predictive', label: 'Analisis Prediktif', icon: LineChart },
              { id: 'tahfidz-ai', label: 'Analisis Tahfidz', icon: Mic },
              { id: 'data-warehouse', label: 'Gudang Data', icon: Database },
              { id: 'knowledge', label: 'Pusat Pengetahuan', icon: BookOpen },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all w-full text-left",
                  activeTab === tab.id 
                    ? "bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-slate-700" 
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                )}
              >
                <tab.icon className={cn("w-5 h-5", activeTab === tab.id ? "text-emerald-500" : "")} />
                {tab.label}
              </button>
            ))}
         </div>

         <div className="flex-1 min-w-0">
            {activeTab === 'executive' && <ExecutiveDashboard />}
            {activeTab === 'tahfidz-ai' && <AITahfidzEngine />}
            {activeTab === 'predictive' && <PredictiveAnalytics />}
            {activeTab === 'data-warehouse' && <DataWarehouse />}
            {activeTab === 'knowledge' && <KnowledgeHub />}
         </div>
      </div>
    </div>
  );
}

function ExecutiveDashboard() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/40 dark:to-slate-900 md:col-span-2 p-6 rounded-xl border border-emerald-100 dark:border-emerald-500/20 relative overflow-hidden shadow-sm">
            <Sparkles className="absolute top-4 right-4 w-16 h-16 text-emerald-500/10 dark:text-emerald-500/20" />
            <h3 className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2">
               <BrainCircuit className="w-5 h-5" /> Ringkasan Eksekutif
            </h3>
            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed mt-2 max-w-2xl font-medium">
              "Kondisi keuangan tetap terjaga dengan pertumbuhan pendapatan tahunan 8%. Model analitik memperkirakan risiko tunggakan biaya pendidikan sebesar 24% pada unit SMP dalam 30 hari ke depan. Capaian Tahfidz di unit asrama berada 12% di atas sasaran dasar."
            </p>
         </div>
         <div className="grid grid-rows-2 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
               <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Estimasi Pendapatan Bulanan</p>
               <div className="flex items-end justify-between">
                 <h4 className="text-2xl font-black text-slate-800 dark:text-slate-200">Rp 1.2B</h4>
                 <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center">+4.2%</span>
               </div>
            </div>
            <div className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-center">
               <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5" /> Risiko Santri Tidak Melanjutkan</p>
               <div className="flex items-end justify-between">
                 <h4 className="text-xl font-black text-amber-500">Perlu Perhatian</h4>
                 <span className="text-amber-700 dark:text-amber-400 text-xs font-bold bg-amber-100 dark:bg-amber-500/20 px-2 py-1 rounded">34 Santri</span>
               </div>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
             <AlertTriangle className="w-5 h-5 text-rose-500" />
             Peringatan Perubahan Pola
           </h3>
           <div className="space-y-4">
              {[
                { unit: "Asrama Abu Bakar", alert: "Peningkatan kejadian santri keluar pada malam hari (+14 kejadian).", type: "Keamanan", color: "rose" },
                { unit: "Unit SMP IT", alert: "Perkiraan tunggakan biaya pendidikan kelas 8 melewati ambang 15%.", type: "Keuangan", color: "amber" },
                { unit: "Unit SMA IT", alert: "Kecepatan hafalan Tahfidz 15% di bawah pola historis.", type: "Akademik", color: "blue" }
              ].map((alert, i) => (
                <div key={i} className="flex gap-4 p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 items-start">
                   <div className={cn(
                     "px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider min-w-[80px] text-center mt-0.5",
                     alert.color === 'rose' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400' :
                     alert.color === 'amber' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400' :
                     'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                   )}>
                     {alert.type}
                   </div>
                   <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{alert.unit}</h4>
                      <p className="text-xs text-slate-500 mt-1">{alert.alert}</p>
                   </div>
                </div>
              ))}
           </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
           <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">Indikator Kinerja Utama</h3>
           <div className="space-y-6">
              {[
                { label: 'Indeks Capaian Akademik', val: 88, target: 90 },
                { label: 'Skor Likuiditas Keuangan', val: 94, target: 85 },
                { label: 'Efisiensi Operasional', val: 76, target: 80 }
              ].map((kpi, idx) => (
                <div key={idx}>
                  <div className="flex justify-between text-sm font-medium mb-2">
                    <span className="text-slate-700 dark:text-slate-300">{kpi.label}</span>
                    <span className="text-slate-900 dark:text-white font-bold">{kpi.val}/100</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative">
                    <div 
                      className={cn("h-full rounded-full transition-all", kpi.val >= kpi.target ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${kpi.val}%` }}
                    ></div>
                    <div className="absolute top-0 bottom-0 w-1 bg-slate-900 dark:bg-white z-10" style={{ left: `${kpi.target}%` }} title={`Target: ${kpi.target}`}></div>
                  </div>
                </div>
              ))}
           </div>
        </div>
      </div>
    </div>
  );
}

function AITahfidzEngine() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       <div className="bg-indigo-900 border border-indigo-700 rounded-xl p-8 relative overflow-hidden shadow-lg">
          <div className="absolute top-0 right-0 p-40 bg-indigo-500/20 rounded-full blur-3xl mix-blend-screen"></div>
          <div className="absolute bottom-0 left-0 p-32 bg-purple-500/20 rounded-full blur-3xl mix-blend-screen"></div>
          
          <div className="flex flex-col md:flex-row items-center md:items-start justify-between relative z-10 gap-6">
             <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 bg-indigo-950/50 text-indigo-300 px-3 py-1 rounded-full text-xs font-bold border border-indigo-700/50 mb-4">
                   <Fingerprint className="w-3.5 h-3.5" /> Analisis Suara
                </div>
                <h3 className="font-black text-white text-3xl mb-2">Penilaian Bacaan Langsung</h3>
                <p className="text-indigo-200 text-sm max-w-md">Model analisis menilai tajwid, makhraj, dan kelancaran secara langsung serta memberikan umpan balik.</p>
             </div>
             <button className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-full p-6 shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-all flex items-center justify-center group shrink-0">
                <Mic className="w-8 h-8 group-hover:scale-110 transition-transform" />
             </button>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
             <div className="p-5 bg-black/40 backdrop-blur rounded-xl border border-white/10 text-center">
                <p className="text-xs text-indigo-300 uppercase tracking-widest font-bold mb-2">Ketepatan Tajwid</p>
                <p className="text-4xl font-black text-emerald-400">92%</p>
             </div>
             <div className="p-5 bg-black/40 backdrop-blur rounded-xl border border-white/10 text-center">
                <p className="text-xs text-indigo-300 uppercase tracking-widest font-bold mb-2">Ketepatan Makhraj</p>
                <p className="text-4xl font-black text-blue-400">88%</p>
             </div>
             <div className="p-5 bg-black/40 backdrop-blur rounded-xl border border-white/10 text-center">
                <p className="text-xs text-indigo-300 uppercase tracking-widest font-bold mb-2">Kelancaran dan Irama</p>
                <p className="text-4xl font-black text-emerald-400">95%</p>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
             <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6">Rekomendasi Pengulangan Murajaah</h3>
             <ul className="space-y-4">
               <li className="flex gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                 <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center shrink-0">
                   <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                 </div>
                 <div>
                   <p className="text-slate-800 dark:text-slate-200 font-bold text-sm">Al-Mulk: Verse 12-15</p>
                   <p className="text-xs text-slate-500 mt-1">Frekuensi jeda cukup tinggi. Disarankan untuk diulang hari ini.</p>
                 </div>
               </li>
               <li className="flex gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                 <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0">
                   <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                 </div>
                 <div>
                   <p className="text-slate-800 dark:text-slate-200 font-bold text-sm">Al-Waqi'ah: Verse 1-10</p>
                   <p className="text-xs text-slate-500 mt-1">Mendekati batas pengulangan. Dijadwalkan untuk ditinjau sore ini.</p>
                 </div>
               </li>
             </ul>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-center items-center text-center">
             <div className="w-32 h-32 border-8 border-slate-100 dark:border-slate-800 border-t-emerald-500 rounded-full flex flex-col items-center justify-center mb-6 shadow-inner relative">
                <span className="text-4xl font-black text-slate-800 dark:text-slate-200">18</span>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Juz</span>
             </div>
             <h3 className="font-bold text-slate-800 dark:text-slate-200 text-lg">Perkiraan Capaian</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm">
               Berdasarkan kecepatan hafalan sebelumnya, penyelesaian 30 juz diperkirakan dalam <strong className="text-emerald-600 dark:text-emerald-400">14 bulan</strong>.
             </p>
          </div>
       </div>
    </div>
  );
}

function PredictiveAnalytics() {
  const enrollmentData = [
    { month: 'Jul', actual: 4200, predicted: 4200 },
    { month: 'Aug', actual: 4250, predicted: 4260 },
    { month: 'Sep', actual: 4280, predicted: 4300 },
    { month: 'Oct', actual: null, predicted: 4350 },
    { month: 'Nov', actual: null, predicted: 4400 },
    { month: 'Dec', actual: null, predicted: 4500 },
  ];

  const financialRiskData = [
    { month: 'W1', riskScore: 12 },
    { month: 'W2', riskScore: 15 },
    { month: 'W3', riskScore: 11 },
    { month: 'W4', riskScore: 24 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
         <div className="flex justify-between items-center mb-8 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <h3 className="text-slate-800 dark:text-slate-200 font-bold text-lg">Perkiraan Pendaftaran dan Kapasitas</h3>
              <p className="text-slate-500 text-sm mt-1">Proyeksi enam bulan berdasarkan tren pendaftaran</p>
            </div>
            <span className="px-3 py-1 bg-blue-100/50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 text-xs font-bold rounded-lg border border-blue-200 dark:border-blue-500/20">Keyakinan 92%</span>
         </div>
         <div className="h-80 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={enrollmentData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPredicted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" opacity={0.5} vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} domain={['dataMin - 100', 'dataMax + 100']} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'rgba(15, 23, 42, 0.95)', borderColor: '#334155', color: '#f8fafc', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle" />
                <Area type="monotone" dataKey="actual" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorActual)" name="Pendaftaran Aktual" />
                <Area type="monotone" dataKey="predicted" stroke="#3b82f6" strokeWidth={3} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorPredicted)" name="Perkiraan" />
              </AreaChart>
            </ResponsiveContainer>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">Indeks Risiko Tunggakan 30 Hari ke Depan</h3>
            <div className="h-48 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={financialRiskData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                   <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                   <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', backgroundColor: '#1e293b', color: '#fff' }} />
                   <Bar dataKey="riskScore" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Skor Risiko (%)" />
                 </BarChart>
               </ResponsiveContainer>
            </div>
         </div>
         <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex flex-col justify-center">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-2">Optimalisasi Sumber Daya</h3>
            <p className="text-slate-500 text-sm mb-6">Saran efisiensi operasional berdasarkan pola penggunaan fasilitas dan penugasan staf.</p>
            <div className="space-y-3">
               <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                  <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">Optimalkan pendingin udara asrama</span>
                  <span className="text-xs font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded text-emerald-600 dark:text-emerald-400">Hemat 12%</span>
               </div>
               <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg border border-blue-100 dark:border-blue-500/20">
                  <span className="font-bold text-blue-700 dark:text-blue-400 text-sm">Atur ulang jadwal petugas dapur</span>
                  <span className="text-xs font-bold bg-white dark:bg-slate-800 px-2 py-1 rounded text-blue-600 dark:text-blue-400">Dampak Tinggi</span>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}

function DataWarehouse() {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2"><Server className="w-6 h-6 text-indigo-500" /> Lapisan Data Terpadu</h3>
              <p className="text-slate-500 text-sm mt-1">Pemetaan data dari modul ERP, Akademik, dan Relasi.</p>
            </div>
            <span className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg border border-emerald-200 dark:border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Tersinkron 2 menit lalu
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
             {['Volume Data Masuk (TB)', 'Node Pemrosesan', 'Kueri Aktif / detik'].map((lbl, i) => (
                <div key={i} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{lbl}</p>
                  <p className="text-2xl font-black text-slate-800 dark:text-slate-200 mt-2">
                    {i === 0 ? '14.2' : i === 1 ? '8' : '450'}
                  </p>
                </div>
             ))}
          </div>

          <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
             <div className="bg-slate-950 px-4 py-2 border-b border-slate-800 flex justify-between items-center">
               <span className="text-xs font-mono text-slate-400 flex items-center gap-2"><Code className="w-3.5 h-3.5" /> Contoh Kueri</span>
               <span className="flex items-center gap-1 text-slate-400 text-xs font-bold">Contoh</span>
             </div>
             <div className="p-4 bg-[#0d1117]">
               <pre className="font-mono text-xs leading-relaxed text-blue-300">
                 <span className="text-pink-400">SELECT</span> unit, <span className="text-pink-400">COUNT</span>(student_id) <span className="text-pink-400">AS</span> arrears<br/>
                 <span className="text-pink-400">FROM</span> data_lake.finance.tuition_records<br/>
                 <span className="text-pink-400">WHERE</span> payment_status = <span className="text-amber-300">'OVERDUE'</span> <span className="text-pink-400">AND</span> date &gt; <span className="text-pink-400">CURRENT_DATE</span> - <span className="text-purple-400">INTERVAL</span> <span className="text-amber-300">'30 day'</span><br/>
                 <span className="text-pink-400">GROUP BY</span> unit;
               </pre>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">Alur Pemrosesan Data</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">Data Akademik</p>
                      <p className="text-xs text-slate-500">Sinkronisasi bertahap</p>
                    </div>
                 </div>
                 <span className="text-xs font-bold text-emerald-500">Normal</span>
              </div>
              <div className="flex items-center justify-between">
                 <div className="flex items-center gap-3">
                    <Database className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-200">MongoDB (Catatan Tahfidz)</p>
                      <p className="text-xs text-slate-500">Replikasi langsung</p>
                    </div>
                 </div>
                 <span className="text-xs font-bold text-emerald-500">Normal</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4">Integrasi BigQuery</h3>
            <p className="text-sm text-slate-500 mb-4">Integrasi dengan BigQuery untuk pengolahan data dan tampilan ringkasan.</p>
            <button className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-sm font-bold rounded-lg transition-colors border border-slate-200 dark:border-slate-700 flex justify-center items-center gap-2">
              <Network className="w-4 h-4" /> Status Integrasi
            </button>
          </div>
       </div>
    </div>
  );
}

function KnowledgeHub() {
  const [query, setQuery] = React.useState('');
  const [isSearching, setIsSearching] = React.useState(false);
  const [hasResult, setHasResult] = React.useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setHasResult(false);
    setTimeout(() => {
      setIsSearching(false);
      setHasResult(true);
    }, 1500);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
             <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black border border-indigo-500/30 rounded-2xl p-8 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-32 bg-indigo-500/10 rounded-full blur-3xl mix-blend-screen pointer-events-none"></div>
                <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto mb-8">
                   <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-6 border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                      <Sparkles className="w-8 h-8 text-indigo-400" />
                   </div>
                   <h2 className="text-3xl font-black text-white mb-4 tracking-tight">Pencarian Informasi Terpadu</h2>
                   <p className="text-indigo-200 text-sm leading-relaxed px-4">
                     Cari <strong className="text-white">12,4 juta+</strong> potongan informasi dari SOP pesantren, kebijakan akademik, dan riwayat komunikasi dengan bahasa sehari-hari.
                   </p>
                </div>
                
                <form onSubmit={handleSearch} className="w-full relative shadow-2xl rounded-full z-10">
                  <Search className="w-6 h-6 absolute left-5 top-1/2 -translate-y-1/2 text-indigo-400" />
                  <input 
                    type="text" 
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ajukan pertanyaan, misalnya: Bagaimana prosedur untuk santri yang berulang kali terlambat?"
                    className="w-full pl-14 pr-32 py-5 bg-white/5 backdrop-blur-md border border-indigo-500/30 rounded-full text-base text-white placeholder-indigo-300/50 focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition-all shadow-inner"
                  />
                  <button 
                    type="submit"
                    disabled={isSearching || !query.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:hover:bg-indigo-500 text-white px-6 py-3 rounded-full text-sm font-bold shadow-lg transition-all flex items-center gap-2"
                  >
                    {isSearching ? (
                      <span className="flex items-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> Memproses…
                      </span>
                    ) : 'Cari'}
                  </button>
                </form>
             </div>

             {hasResult && (
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm animate-in slide-in-from-bottom-4 fade-in duration-500">
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                     <div className="w-8 h-8 rounded bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                        <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                     </div>
                     <h3 className="font-bold text-slate-800 dark:text-slate-200">Ringkasan Jawaban</h3>
                     <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 rounded">
                       <CheckCircle2 className="w-3.5 h-3.5" /> Keyakinan Tinggi
                     </span>
                  </div>
                  <div className="prose dark:prose-invert max-w-none text-sm text-slate-700 dark:text-slate-300">
                     <p className="mb-4">
                       Berdasarkan <strong>Panduan Kedisiplinan Santri (v3.2)</strong> dan <strong>Pedoman Operasional SMP IT</strong>, prosedur untuk keterlambatan berulang (tiga kali atau lebih dalam sebulan) adalah sebagai berikut:
                     </p>
                     <ul className="space-y-2 mb-4 list-disc pl-5">
                       <li><strong>Pelanggaran pertama:</strong> Teguran lisan dari wali kelas dan pencatatan dalam jurnal Tahfidz.</li>
                       <li><strong>Pelanggaran kedua:</strong> Pemberitahuan tertulis kepada wali santri melalui portal relasi wali, ditandatangani koordinator kedisiplinan.</li>
                       <li><strong>Pelanggaran ketiga:</strong> Pertemuan wajib dengan wali santri dan pengurangan 15 poin akademik.</li>
                     </ul>
                     <p>
                       Jika keterlambatan mengganggu salat Subuh berjamaah, santri dapat menerima tugas Murajaah tambahan sesuai kebijakan asrama.
                     </p>
                  </div>
                  <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                     <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Sumber Acuan</p>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 cursor-pointer transition-colors">
                           <FileText className="w-5 h-5 text-rose-500 mt-0.5" />
                           <div>
                             <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Panduan_Kedisiplinan_v3.pdf</p>
                             <p className="text-xs text-slate-500">Halaman 42 • Bagian: Tindakan Kedisiplinan</p>
                           </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-indigo-500/50 cursor-pointer transition-colors">
                           <FileText className="w-5 h-5 text-blue-500 mt-0.5" />
                           <div>
                             <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Kebijakan_Asrama_2024.docx</p>
                             <p className="text-xs text-slate-500">Halaman 12 • Aturan Salat Subuh Berjamaah</p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
             )}
          </div>

          <div className="space-y-6">
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
                  <Database className="w-5 h-5 text-indigo-500" /> Metrik Basis Data Vektor
                </h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">Total Data Terindeks</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200">12,430,900</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: '78%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">Rata-rata Waktu Respons P95</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">142ms</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: '15%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-500">Kapasitas Penyimpanan</span>
                      <span className="font-bold text-amber-600 dark:text-amber-400">420GB</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full">
                      <div className="h-full bg-amber-500 rounded-full" style={{ width: '45%' }}></div>
                    </div>
                  </div>
                </div>
             </div>

             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
                <h3 className="font-bold text-slate-800 dark:text-slate-200 mb-4 border-b border-slate-100 dark:border-slate-800 pb-4">Kategori Pengetahuan</h3>
                <div className="space-y-3">
                   {[
                     { title: 'Indeks SOP dan Peraturan', icon: BookOpen, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-500/20', docCount: '2,4 rb dokumen' },
                     { title: 'Materi Kurikulum', icon: GraduationCap, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-500/20', docCount: '1,2 rb dokumen' },
                     { title: 'Riwayat Alumni dan Relasi', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-500/20', docCount: '450 rb percakapan' },
                     { title: 'Keuangan dan Wakaf', icon: Wallet, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-500/20', docCount: '12 rb laporan' },
                   ].map((domain, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                         <div className={`w-10 h-10 rounded-lg ${domain.bg} flex items-center justify-center shrink-0`}>
                           <domain.icon className={`w-5 h-5 ${domain.color}`} />
                         </div>
                         <div className="min-w-0 flex-1">
                           <h4 className="font-bold text-slate-800 dark:text-slate-200 text-sm truncate">{domain.title}</h4>
                           <p className="text-xs text-slate-500">{domain.docCount}</p>
                         </div>
                         <div className="w-2 h-2 rounded-full bg-emerald-500" title="Aktif dan tersinkron"></div>
                      </div>
                   ))}
                </div>
             </div>
          </div>
       </div>
    </div>
  );
}


