import React, { useState, useEffect, Suspense } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { useAuth } from './contexts/AuthContext';
import { FrontendOverview } from './pages/FrontendOverview';
import { LoginView } from './pages/LoginView';
import { GuardianInvitationActivationView } from './pages/GuardianInvitationActivationView';
import { GuardianSelfRegistrationView } from './pages/GuardianSelfRegistrationView';
import { PasswordRecoveryView } from './pages/PasswordRecoveryView';

import { ModulePlaceholder } from './pages/ModulePlaceholder';
import { ForcePasswordChangeModal } from './components/ForcePasswordChangeModal';
import { Tenant, ModuleId } from './types';
import { ROLE_MODULES } from './rbac';
import { useSystemSettings } from './hooks/useSystemSettings';

// Module pages are loaded on demand to keep the initial bundle small.
const SupabaseDashboardOverview = React.lazy(() => import('./pages/SupabaseDashboardOverview').then((module) => ({ default: module.SupabaseDashboardOverview })));
const TahfidzManager = React.lazy(() => import('./pages/TahfidzManager').then((module) => ({ default: module.TahfidzManager })));
const MasterDataManager = React.lazy(() => import('./pages/MasterDataManager').then((module) => ({ default: module.MasterDataManager })));
const SupabasePpdbManager = React.lazy(() => import('./pages/SupabasePpdbManager').then((module) => ({ default: module.SupabasePpdbManager })));
const SupabaseCBTManager = React.lazy(() => import('./pages/SupabaseCBTManager').then((module) => ({ default: module.SupabaseCBTManager })));
const SupabaseCBTStudentDashboard = React.lazy(() => import('./pages/SupabaseCBTStudentDashboard').then((module) => ({ default: module.SupabaseCBTStudentDashboard })));
const SupabaseBoardingManager = React.lazy(() => import('./pages/SupabaseBoardingManager').then((module) => ({ default: module.SupabaseBoardingManager })));
const SupabaseFinanceManager = React.lazy(() => import('./pages/SupabaseFinanceManager').then((module) => ({ default: module.SupabaseFinanceManager })));
const SupabaseFinanceBudgetManager = React.lazy(() => import('./pages/SupabaseFinanceBudgetManager').then((module) => ({ default: module.SupabaseFinanceBudgetManager })));
const SupabaseCommunicationHub = React.lazy(() => import('./pages/SupabaseCommunicationHub').then((module) => ({ default: module.SupabaseCommunicationHub })));
const SupabaseAcademicManager = React.lazy(() => import('./pages/SupabaseAcademicManager').then((module) => ({ default: module.SupabaseAcademicManager })));
const SupabaseHealthcareManager = React.lazy(() => import('./pages/SupabaseHealthcareManager').then((module) => ({ default: module.SupabaseHealthcareManager })));
const SupabaseCooperativeManager = React.lazy(() => import('./pages/SupabaseCooperativeManager').then((module) => ({ default: module.SupabaseCooperativeManager })));
const SupabaseHrisManager = React.lazy(() => import('./pages/SupabaseHrisManager').then((module) => ({ default: module.SupabaseHrisManager })));
const SupabaseDocumentManager = React.lazy(() => import('./pages/SupabaseDocumentManager').then((module) => ({ default: module.SupabaseDocumentManager })));
const SupabaseCrmManager = React.lazy(() => import('./pages/SupabaseCrmManager').then((module) => ({ default: module.SupabaseCrmManager })));
const SupabaseLibraryManager = React.lazy(() => import('./pages/SupabaseLibraryManager').then((module) => ({ default: module.SupabaseLibraryManager })));
const SupabaseDonationManager = React.lazy(() => import('./pages/SupabaseDonationManager').then((module) => ({ default: module.SupabaseDonationManager })));
const SupabaseLaundryManager = React.lazy(() => import('./pages/SupabaseLaundryManager').then((module) => ({ default: module.SupabaseLaundryManager })));
const SettingsManager = React.lazy(() => import('./pages/SettingsManager').then((module) => ({ default: module.SettingsManager })));
const SupabaseGeneralAffairManager = React.lazy(() => import('./pages/SupabaseGeneralAffairManager').then((module) => ({ default: module.SupabaseGeneralAffairManager })));
const SupabaseAlumniManager = React.lazy(() => import('./pages/SupabaseAlumniManager').then((module) => ({ default: module.SupabaseAlumniManager })));
const SupabaseLMSManager = React.lazy(() => import('./pages/SupabaseLMSManager').then((module) => ({ default: module.SupabaseLMSManager })));
const SupabaseMarketplaceManager = React.lazy(() => import('./pages/SupabaseMarketplaceManager').then((module) => ({ default: module.SupabaseMarketplaceManager })));
const SupabaseEnterpriseUnitsManager = React.lazy(() => import('./pages/SupabaseEnterpriseUnitsManager').then((module) => ({ default: module.SupabaseEnterpriseUnitsManager })));
const UserManagementView = React.lazy(() => import('./pages/UserManagementView').then((module) => ({ default: module.UserManagementView })));
export default function App() {
  const { role, user, completeGuardianInvitation, completeGuardianRegistration, completePasswordRecovery } = useAuth();
  const [guardianInviteToken, setGuardianInviteToken] = useState(() => new URLSearchParams(window.location.search).get('guardianInvite') || '');
  const [guardianRegistrationRoute, setGuardianRegistrationRoute] = useState(() => new URLSearchParams(window.location.search).has('guardianRegistration'));
  const [passwordRecoveryRoute, setPasswordRecoveryRoute] = useState(() => new URLSearchParams(window.location.search).has('passwordRecovery'));
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
    schoolName: 'ERP4 Pesantren'
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

    const schoolName = orgInfo.schoolName || 'ERP4 Pesantren';
    setBranding({ logoUrl: orgInfo.logoUrl || '', schoolName });
    document.title = orgInfo.pageTitleFormat
      ? orgInfo.pageTitleFormat.replace('{schoolName}', schoolName)
      : `ERP4 Pesantren | ${schoolName}`;

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
        return <SupabaseDashboardOverview />;
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
        return <SupabasePpdbManager />;
      case 'cbt':
        if (role === 'Santri') return <SupabaseCBTStudentDashboard />;
        return <SupabaseCBTManager />;
      case 'boarding':
        return <SupabaseBoardingManager />;
      case 'finance':
        return <SupabaseFinanceManager />;
      case 'communication':
        return <SupabaseCommunicationHub />;
      case 'academic':
        return <SupabaseAcademicManager />;
      case 'healthcare':
        return <SupabaseHealthcareManager />;
      case 'cooperative':
        return <SupabaseCooperativeManager />;
      case 'hris':
        return <SupabaseHrisManager />;
      case 'document':
        return <SupabaseDocumentManager />;
      case 'library':
        return <SupabaseLibraryManager />;
      case 'donation':
        return <SupabaseDonationManager />;
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
        return <SupabaseEnterpriseUnitsManager />;
      case 'erp':
        return <SupabaseFinanceBudgetManager />;
      case 'ga':
        return <SupabaseGeneralAffairManager />;
      case 'alumni':
        return <SupabaseAlumniManager />;
      case 'crm':
        return <SupabaseCrmManager />;
      case 'lms':
        return <SupabaseLMSManager />;
      case 'intelligence':
        return <SupabaseDashboardOverview surface="intelligence" />;
      case 'marketplace':
        return <SupabaseMarketplaceManager />;
      default:
        return <ModulePlaceholder module={activeModule} />;
    }
  };

  if (guardianInviteToken) {
    return <GuardianInvitationActivationView token={guardianInviteToken} onActivated={() => { completeGuardianInvitation(); setGuardianInviteToken(''); }} />;
  }

  if (guardianRegistrationRoute) {
    return <GuardianSelfRegistrationView callback onActivated={() => {
      completeGuardianRegistration();
      window.history.replaceState(null, '', window.location.pathname);
      setGuardianRegistrationRoute(false);
    }} onBack={() => {
      completeGuardianRegistration();
      window.history.replaceState(null, '', window.location.pathname);
      setGuardianRegistrationRoute(false);
      setShowLogin(true);
    }} />;
  }

  if (passwordRecoveryRoute) {
    const finishPasswordRecovery = () => {
      completePasswordRecovery();
      window.history.replaceState(null, '', window.location.pathname);
      setPasswordRecoveryRoute(false);
      setShowLogin(true);
    };
    return <PasswordRecoveryView onCompleted={finishPasswordRecovery} onBack={finishPasswordRecovery} />;
  }

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

