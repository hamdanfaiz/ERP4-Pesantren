import React, { useState, useEffect, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useAuth } from './contexts/AuthContext';
import { FrontendOverview } from './pages/FrontendOverview';
import { LoginView } from './pages/LoginView';

import { ModulePlaceholder } from './pages/ModulePlaceholder';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';
import { Tenant, ModuleId } from './types';
import { ROLE_MODULES } from './rbac';
import { useSystemSettings } from './hooks/useSystemSettings';
import { SUPABASE_ONLY_RUNTIME } from './runtimeBackend';

// Module pages are loaded on demand to keep the initial bundle small.
const DashboardOverview = React.lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.DashboardOverview })));
const TahfidzManager = React.lazy(() => import('./pages/TahfidzManager').then((module) => ({ default: module.TahfidzManager })));
const MasterDataManager = React.lazy(() => import('./pages/MasterDataManager').then((module) => ({ default: module.MasterDataManager })));
const PPDBManager = React.lazy(() => import('./pages/PPDBManager').then((module) => ({ default: module.PPDBManager })));
const CBTManager = React.lazy(() => import('./pages/CBTManager').then((module) => ({ default: module.CBTManager })));
const CBTStudentDashboard = React.lazy(() => import('./pages/CBTStudentDashboard').then((module) => ({ default: module.CBTStudentDashboard })));
const BoardingManager = React.lazy(() => import('./pages/BoardingManager').then((module) => ({ default: module.BoardingManager })));
const FinanceManager = React.lazy(() => import('./pages/FinanceManager').then((module) => ({ default: module.FinanceManager })));
const CommunicationHub = React.lazy(() => import('./pages/CommunicationHub').then((module) => ({ default: module.CommunicationHub })));
const AcademicManager = React.lazy(() => import('./pages/AcademicManager').then((module) => ({ default: module.AcademicManager })));
const HealthcareManager = React.lazy(() => import('./pages/HealthcareManager').then((module) => ({ default: module.HealthcareManager })));
const CooperativeManager = React.lazy(() => import('./pages/CooperativeManager').then((module) => ({ default: module.CooperativeManager })));
const SupabaseHrisManager = React.lazy(() => import('./pages/SupabaseHrisManager').then((module) => ({ default: module.SupabaseHrisManager })));
const DocumentManager = React.lazy(() => import('./pages/DocumentManager').then((module) => ({ default: module.DocumentManager })));
const LibraryManager = React.lazy(() => import('./pages/LibraryManager').then((module) => ({ default: module.LibraryManager })));
const DonationManager = React.lazy(() => import('./pages/DonationManager').then((module) => ({ default: module.DonationManager })));
const SupabaseLaundryManager = React.lazy(() => import('./pages/SupabaseLaundryManager').then((module) => ({ default: module.SupabaseLaundryManager })));
const SettingsManager = React.lazy(() => import('./pages/SettingsManager').then((module) => ({ default: module.SettingsManager })));
const EnterpriseManager = React.lazy(() => import('./pages/EnterpriseManager').then((module) => ({ default: module.EnterpriseManager })));
const ERPManager = React.lazy(() => import('./pages/ERPManager').then((module) => ({ default: module.ERPManager })));
const GeneralAffairManager = React.lazy(() => import('./pages/GeneralAffairManager').then((module) => ({ default: module.GeneralAffairManager })));
const AlumniManager = React.lazy(() => import('./pages/AlumniManager').then((module) => ({ default: module.AlumniManager })));
const CRMManager = React.lazy(() => import('./pages/CRMManager').then((module) => ({ default: module.CRMManager })));
const LMSManager = React.lazy(() => import('./pages/LMSManager').then((module) => ({ default: module.LMSManager })));
const IntelligenceManager = React.lazy(() => import('./pages/IntelligenceManager').then((module) => ({ default: module.IntelligenceManager })));
const MarketplaceManager = React.lazy(() => import('./pages/MarketplaceManager').then((module) => ({ default: module.MarketplaceManager })));
const EcosystemManager = React.lazy(() => import('./pages/EcosystemManager').then((module) => ({ default: module.EcosystemManager })));
const UserManagementView = React.lazy(() => import('./pages/UserManagementView').then((module) => ({ default: module.UserManagementView })));
export default function App() {
  const { role, user } = useAuth();
  const currentTenant: Tenant = {
    id: user?.tenantId || '',
    name: user?.tenantName || 'Pesantren',
    type: user?.tenantType || 'Pesantren',
  };
  const { getUserAllowedModules, canAccessModule, general, orgInfo } = useSystemSettings();
  const [showLogin, setShowLogin] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleId>('dashboard');
  const [branding, setBranding] = useState({
    logoUrl: '',
    schoolName: 'Pesantren OS'
  });

  useEffect(() => {
    if (role !== 'Public') {
      const allowed = getUserAllowedModules(user, role);
      if (allowed.length > 0 && !allowed.includes(activeModule)) {
        setActiveModule(allowed[0]);
      }
    }
  }, [role, user, activeModule, getUserAllowedModules]);

  useEffect(() => {
    if (!user?.tenantId) {
      document.documentElement.classList.add('dark');
      return;
    }
    let mediaQuery: MediaQueryList | null = null;
    
    const handleSystemThemeChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    const theme = general.theme || 'dark';
    if (theme === 'system') {
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQuery.addEventListener('change', handleSystemThemeChange);
      document.documentElement.classList.toggle('dark', mediaQuery.matches);
    } else {
      document.documentElement.classList.toggle('dark', theme !== 'light');
    }

    const schoolName = orgInfo.schoolName || 'Pesantren OS';
    setBranding({ logoUrl: orgInfo.logoUrl || '', schoolName });
    document.title = orgInfo.pageTitleFormat
      ? orgInfo.pageTitleFormat.replace('{schoolName}', schoolName)
      : `Pesantren OS | ${schoolName}`;

    if (orgInfo.faviconUrl) {
      let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = orgInfo.faviconUrl;
    }

    return () => {
       if (mediaQuery) mediaQuery.removeEventListener('change', handleSystemThemeChange);
    };
  }, [user?.tenantId, general.theme, orgInfo.schoolName, orgInfo.pageTitleFormat, orgInfo.logoUrl, orgInfo.faviconUrl]);

  const renderModule = () => {
    // Route guard: verify module permission for current user
    if (!canAccessModule(user, role, activeModule)) {
      return (
        <div className="p-8 text-center glass-panel rounded-2xl max-w-lg mx-auto mt-12 border border-amber-500/20">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center mx-auto mb-3 text-lg font-bold">
            🔒
          </div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">Akses Modul Dibatasi</h2>
          <p className="text-xs text-slate-400 mt-1">
            Akun Anda tidak memiliki izin akses untuk modul ini. Hubungi Administrator pesantren untuk mendapatkan hak akses.
          </p>
        </div>
      );
    }

    switch (activeModule) {
      case 'dashboard':
        return <DashboardOverview />;
      case 'tahfidz':
        return <TahfidzManager />;
      case 'master-data':
        return <MasterDataManager />;
      case 'users':
        if (role !== 'SuperAdmin' && role !== 'Admin') {
          return <ModulePlaceholder module={activeModule} />;
        }
        return <UserManagementView />;
      case 'ppdb':
        return <PPDBManager />;
      case 'cbt':
        if (role === 'Santri') return <CBTStudentDashboard />;
        return <CBTManager />;
      case 'boarding':
        return <BoardingManager />;
      case 'finance':
        return <FinanceManager />;
      case 'communication':
        return <CommunicationHub />;
      case 'academic':
        return <AcademicManager />;
      case 'healthcare':
        return <HealthcareManager />;
      case 'cooperative':
        return <CooperativeManager />;
      case 'hris':
        return <SupabaseHrisManager />;
      case 'document':
        return SUPABASE_ONLY_RUNTIME
          ? <ModulePlaceholder module={activeModule} supabaseRuntimeUnavailable />
          : <DocumentManager />;
      case 'library':
        return <LibraryManager />;
      case 'donation':
        return <DonationManager />;
      case 'laundry':
        return <SupabaseLaundryManager />;
      case 'settings':
        if (role !== 'SuperAdmin') {
          return (
            <div className="p-8 text-center glass-panel rounded-2xl max-w-lg mx-auto mt-12 border border-red-500/20">
              <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-3 text-lg font-bold">
                🛡️
              </div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Akses Platform SuperAdmin</h2>
              <p className="text-xs text-slate-400 mt-1">
                Pengaturan global sistem dan konfigurasi integrasi platform hanya dapat diakses oleh SuperAdmin.
              </p>
            </div>
          );
        }
        return <SettingsManager />;
      case 'enterprise':
        return SUPABASE_ONLY_RUNTIME
          ? <ModulePlaceholder module={activeModule} supabaseRuntimeUnavailable />
          : <EnterpriseManager />;
      case 'erp':
        return SUPABASE_ONLY_RUNTIME
          ? <ModulePlaceholder module={activeModule} supabaseRuntimeUnavailable />
          : <ERPManager />;
      case 'ga':
        return <GeneralAffairManager />;
      case 'alumni':
        return <AlumniManager />;
      case 'crm':
        return SUPABASE_ONLY_RUNTIME
          ? <ModulePlaceholder module={activeModule} supabaseRuntimeUnavailable />
          : <CRMManager />;
      case 'lms':
        return <LMSManager />;
      case 'intelligence':
        return SUPABASE_ONLY_RUNTIME
          ? <ModulePlaceholder module={activeModule} supabaseRuntimeUnavailable />
          : <IntelligenceManager />;
      case 'marketplace':
        return <MarketplaceManager />;
      case 'ecosystem':
        return SUPABASE_ONLY_RUNTIME
          ? <ModulePlaceholder module={activeModule} supabaseRuntimeUnavailable />
          : <EcosystemManager />;
      default:
        return <ModulePlaceholder module={activeModule} />;
    }
  };

  if (role === 'Public') {
    if (showLogin) {
      return <LoginView onBack={() => setShowLogin(false)} />;
    }
    return <FrontendOverview onLoginClick={() => setShowLogin(true)} branding={branding} />;
  }

  return (
    <div className="flex h-screen bg-transparent font-sans text-slate-700 dark:text-slate-300 overflow-hidden print:h-auto print:overflow-visible">
      <ForcePasswordChangeModal />
      <Sidebar activeModule={activeModule} onNavigate={setActiveModule} branding={branding} />
      
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative bg-transparent print:h-auto print:overflow-visible print:bg-white print:text-black">
        <Header currentTenant={currentTenant} branding={branding} />
        
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 print:p-0 print:overflow-visible">
          <Suspense
            fallback={
              <div className="p-8 text-sm text-slate-500" role="status" aria-live="polite">
                Memuat modul…
              </div>
            }
          >
            {renderModule()}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
