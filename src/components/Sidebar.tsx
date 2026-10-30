import React from 'react';
import { 
  Building2, 
  LayoutDashboard, 
  Users, 
  FileText, 
  BookOpen, 
  Home, 
  Wallet, 
  MessageSquare,
  Settings,
  BrainCircuit,
  GraduationCap,
  Stethoscope,
  Store,
  Briefcase,
  FileBox,
  Library,
  HeartHandshake,
  Shirt,
  PieChart,
  ShieldCheck,
  ShoppingCart,
  MonitorPlay,
  ShoppingBag,
  CreditCard,
  Gift,
  LogOut
} from 'lucide-react';
import { Wrench } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModuleId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_MODULES } from '../rbac';
import { useSystemSettings } from '../hooks/useSystemSettings';

interface SidebarProps {
  activeModule: ModuleId;
  onNavigate: (mod: ModuleId) => void;
  branding?: {
    logoUrl?: string;
    schoolName?: string;
  };
}

const MENU_GROUPS = [
  {
     label: "Sistem Inti",
     items: [
       { id: 'dashboard', label: 'Ringkasan', icon: LayoutDashboard },
       { id: 'master-data', label: 'Data Induk', icon: Users },
       { id: 'users', label: 'Manajemen Pengguna', icon: ShieldCheck },
       { id: 'settings', label: 'Pengaturan', icon: Settings },
     ]
  },
  {
     label: "Pendidikan & Asrama",
     items: [
       { id: 'ppdb', label: 'Penerimaan Santri (PPDB)', icon: FileText },
       { id: 'cbt', label: 'Ujian Berbasis Komputer (CBT)', icon: MonitorPlay },
       { id: 'tahfidz', label: 'Tahfidz', icon: BookOpen },
       { id: 'boarding', label: 'Asrama', icon: Home },
       { id: 'academic', label: 'Akademik Formal', icon: GraduationCap },
       { id: 'lms', label: 'LMS Pembelajaran', icon: MonitorPlay },
       { id: 'library', label: 'Perpustakaan', icon: Library },
     ]
  },
  {
     label: "Operasional Santri",
     items: [
       { id: 'finance', label: 'Keuangan & Tagihan', icon: Wallet },
       { id: 'communication', label: 'Pusat Komunikasi', icon: MessageSquare },
       { id: 'healthcare', label: 'Kesehatan (UKS)', icon: Stethoscope },
       { id: 'cooperative', label: 'Koperasi & Kantin', icon: Store },
       { id: 'laundry', label: 'Laundry', icon: Shirt },
     ]
  },
  {
     label: "Manajemen & Sumber Daya",
     items: [
        { id: 'enterprise', label: 'Manajemen Multi-Unit', icon: Building2 },
        { id: 'erp', label: 'Keuangan & Anggaran (ERP)', icon: PieChart },
        { id: 'hris', label: 'Sumber Daya Manusia (HCM)', icon: Briefcase },
        { id: 'ga', label: 'Sarana & Prasarana', icon: Wrench },
        { id: 'document', label: 'Dokumen Digital', icon: FileBox },
     ]
  },
  {
     label: "Relasi & Ekosistem",
     items: [
        { id: 'alumni', label: 'Data Alumni', icon: GraduationCap },
        { id: 'crm', label: 'Relasi Wali & Donatur', icon: HeartHandshake },
        { id: 'donation', label: 'Donasi & Wakaf', icon: Gift },
        { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
        { id: 'ecosystem', label: 'PPOB & Layanan', icon: CreditCard },
     ]
  }
];

export function Sidebar({ activeModule, onNavigate, branding }: SidebarProps) {
  const { user, role, logout } = useAuth();
  const { getUserAllowedModules } = useSystemSettings();
  const allowedModules = getUserAllowedModules(user, role);

  return (
    <div className="flex flex-col w-64 glass-panel h-screen shadow-2xl print:hidden sticky top-0 left-0 border-y-0 border-l-0 rounded-none border-r border-slate-200/50 dark:border-white/10 erp-shell-sidebar">
      <div className="p-6 shrink-0">
        <div className="flex items-center gap-3 mb-1">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="w-8 h-8 object-contain rounded-lg bg-slate-100 dark:bg-white/5" />
          ) : (
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center font-bold text-white">
              P
            </div>
          )}
          <h1 className="text-xl font-serif italic text-emerald-500 tracking-tight line-clamp-1">{branding?.schoolName ? branding.schoolName.substring(0, 15) : 'Pesantren OS'}</h1>
        </div>
        <p className="text-[10px] uppercase tracking-[0.2em] opacity-40">Sistem Terpadu v4.0</p>
      </div>
      
      <div className="flex-1 py-2 flex flex-col gap-6 px-3 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {MENU_GROUPS.map((group, gIdx) => {
          const visibleItems = group.items.filter(item => allowedModules.includes(item.id as ModuleId));
          if (visibleItems.length === 0) return null;

          return (
            <div key={gIdx} className="flex flex-col gap-1">
              <div className="px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest shrink-0">
                {group.label}
              </div>
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onNavigate(item.id as ModuleId)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors w-full text-left",
                      isActive 
                        ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/30" 
                        : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-300 opacity-70 hover:opacity-100"
                    )}
                  >
                    <Icon className={cn("w-5 h-5", isActive ? "text-emerald-400" : "text-slate-500 dark:text-slate-400")} />
                    {item.label}
                    {isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}

        {allowedModules.includes('intelligence') && (
          <>
            <div className="mt-2 px-3 pb-2 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">
              Analitik
            </div>
            <button 
              onClick={() => onNavigate('intelligence')}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors w-full text-left",
                activeModule === 'intelligence'
                  ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/30" 
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-slate-300 opacity-70 hover:opacity-100"
              )}
            >
               <BrainCircuit className={cn("w-5 h-5", activeModule === 'intelligence' ? "text-emerald-400" : "text-emerald-500")} />
               Pusat Data Analitik
            </button>
          </>
        )}
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-white/5 bg-black/5 dark:bg-black/20 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full border border-emerald-500/20 bg-emerald-950 p-0.5">
              <div className="w-full h-full rounded-full bg-gradient-to-tr from-emerald-800 to-slate-900 flex items-center justify-center text-xs font-bold text-white">
                {role.substring(0, 2).toUpperCase()}
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-white">{user?.name || user?.email || "Pengguna"}</div>
              <div className="text-[10px] text-slate-500">{({ SuperAdmin: "Superadmin Yayasan", Admin: "Administrator", Ustadz: "Ustadz", Santri: "Santri", Walisantri: "Wali Santri" } as Record<string, string>)[role] || role}</div>
            </div>
          </div>
          <button onClick={logout} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Keluar" aria-label="Keluar dari sistem">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
