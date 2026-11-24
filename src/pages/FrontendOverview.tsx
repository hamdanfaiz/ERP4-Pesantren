import React, { useState } from 'react';
import { LogIn, GraduationCap, Users, CalendarDays, Heart } from 'lucide-react';
const PublicRegistrationForm = React.lazy(() => import('../components/PublicRegistrationForm').then((module) => ({ default: module.PublicRegistrationForm })));

interface FrontendProps {
  onLoginClick: () => void;
  branding: { logoUrl: string; schoolName: string; };
}

export function FrontendOverview({ onLoginClick, branding }: FrontendProps) {
  const [activeView, setActiveView] = useState<'home' | 'ppdb'>('home');
  const showHomeSection = (id: string) => {
    setActiveView('home');
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0a0a0a] text-slate-700 dark:text-slate-300 erp-public-landing">
      {/* Public Header */}
      <header className="glass-panel sticky top-0 z-50 px-6 py-4 flex items-center justify-between border-t-0 border-x-0 rounded-none bg-white/60 dark:bg-black/60 border-b border-slate-200/50 dark:border-white/10">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveView('home')}>
          {branding?.logoUrl ? (
             <img src={branding.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-transparent" />
          ) : (
             <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold">
               {branding.schoolName.charAt(0)}
             </div>
          )}
          <span className="font-bold text-lg text-slate-800 dark:text-slate-200">{branding?.schoolName}</span>
        </div>
        
        <nav className="hidden md:flex items-center gap-8">
          <button onClick={() => { setActiveView('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className={`text-sm font-medium ${activeView === 'home' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:text-emerald-500'}`}>Beranda</button>
          <button onClick={() => showHomeSection('program')} className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-500">Program</button>
          <button onClick={() => setActiveView('ppdb')} className={`text-sm font-medium ${activeView === 'ppdb' ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400 hover:text-emerald-500'}`}>PPDB</button>
          <button onClick={() => showHomeSection('donasi')} className="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-emerald-500">Donasi</button>
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={onLoginClick} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-500/20">
            <LogIn className="w-4 h-4" />
            Masuk ke Sistem
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeView === 'home' && (
          <div className="space-y-16 py-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Hero Section */}
            <div className="text-center max-w-3xl mx-auto space-y-6 erp-landing-hero">
              <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Membangun Generasi <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-teal-400">Rabbani</span>
              </h1>
              <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
                Sistem Informasi Terpadu {branding?.schoolName} memudahkan akses informasi pendaftaran, kegiatan akademik, tahfidz, dan layanan pesantren lainnya.
              </p>
              <div className="flex items-center justify-center gap-4 pt-4">
                <button onClick={() => setActiveView('ppdb')} className="px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-emerald-500/20 hover:scale-105">
                  Daftar Sekarang
                </button>
                <button onClick={() => showHomeSection('program')} className="px-8 py-3 glass-card text-slate-800 dark:text-slate-200 hover:bg-white/50 dark:hover:bg-white/5 rounded-xl font-medium transition-all flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" />
                  Lihat Program
                </button>
              </div>
            </div>

            {/* Quick Features */}
            <div id="program" className="scroll-mt-24 grid grid-cols-1 md:grid-cols-4 gap-6 pt-12 erp-landing-grid">
              {[
                { icon: GraduationCap, title: 'Akademik', desc: 'Kurikulum terpadu nasional dan kepesantrenan.' },
                { icon: Users, title: 'PPDB Online', desc: 'Pendaftaran calon santri baru lebih mudah dan transparan.' },
                { icon: CalendarDays, title: 'Tahfidz', desc: 'Pemantauan hafalan harian secara real-time.' },
                { icon: Heart, title: 'Donasi', desc: 'Mari bergabung dalam program wakaf dan infaq.' },
              ].map((f, idx) => (
                <div id={f.title === 'Donasi' ? 'donasi' : undefined} key={idx} className="scroll-mt-24 glass-panel p-6 text-center space-y-4 hover:-translate-y-1 transition-all duration-300">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                    <f.icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-200">{f.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeView === 'ppdb' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="mb-8 p-6 glass-panel flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Pendaftaran Peserta Didik Baru</h2>
                  <p className="text-slate-600 dark:text-slate-400 mt-2">Silakan lengkapi formulir di bawah ini dengan data yang valid.</p>
                </div>
                <button onClick={() => setActiveView('home')} className="px-4 py-2 glass-card text-sm font-medium hover:bg-white/50 dark:hover:bg-white/5 transition-colors">
                  Kembali ke Beranda
                </button>
             </div>
             <React.Suspense fallback={<div role="status" className="glass-panel rounded-xl p-8 text-center text-sm text-slate-500">Memuat formulir pendaftaran...</div>}>
               <PublicRegistrationForm onClose={() => setActiveView('home')} />
             </React.Suspense>
          </div>
        )}
      </main>
      
      <footer className="border-t border-slate-200 dark:border-white/10 mt-20 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
        &copy; {new Date().getFullYear()} {branding?.schoolName}. Hak Cipta Dilindungi Undang-Undang.
      </footer>
    </div>
  );
}
