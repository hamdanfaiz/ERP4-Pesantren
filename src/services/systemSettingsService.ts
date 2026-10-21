import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { getAccessToken, getAuthSession } from "../authSession";
import { db } from "../firebase";
import { ModuleId } from "../types";
import { UserRole, ROLE_MODULES, isModuleAccessible, getAllowedModulesForUser } from "../rbac";

export interface GeneralSettings {
  academicYear: string;
  semester: "Ganjil" | "Genap";
  language: "id" | "en" | "ar";
  timezone: "Asia/Jakarta" | "Asia/Makassar" | "Asia/Jayapura";
  theme: "dark" | "light" | "system";
  isReportCardLocked?: boolean;
}

export interface OrgInfo {
  schoolName: string;
  address: string;
  phone: string;
  email: string;
  principalName: string;
  website: string;
  logoUrl: string;
  faviconUrl: string;
  pageTitleFormat: string;
}

export interface IntegrationsConfig {
  waGatewayEndpoint?: string;
  paymentGatewayProvider?: "midtrans" | "xendit";
  smtpHost: string;
  smtpPort: string;
  smtpUser?: string;
}

export interface MobileConfig {
  showDetailedGrades: boolean;
  allowLeaveRequests: boolean;
  pushNotifications: boolean;
  supportWhatsapp: string;
}

export interface SystemSettings {
  tenantId?: string;
  generalSettings: GeneralSettings;
  orgInfo: OrgInfo;
  integrations: IntegrationsConfig;
  mobileConfig: MobileConfig;
  permissions: Record<string, Record<string, boolean>>;
  updatedAt?: string;
}

export const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  academicYear: "2026/2027",
  semester: "Ganjil",
  language: "id",
  timezone: "Asia/Jakarta",
  theme: "dark",
  isReportCardLocked: false,
};

export const DEFAULT_ORG_INFO: OrgInfo = {
  schoolName: "Pesantren Modern AI Studio",
  address: "Jl. AI Studio No. 1, Jakarta Selatan",
  phone: "+62 812 3456 7890",
  email: "info@pesantrenaistudio.edu",
  principalName: "Dr. Fulan bin Fulan",
  website: "https://pesantrenaistudio.edu",
  logoUrl: "",
  faviconUrl: "",
  pageTitleFormat: "Pesantren OS | {schoolName}",
};

export const DEFAULT_INTEGRATIONS: IntegrationsConfig = {
  waGatewayEndpoint: "https://api.wagw.example.com/v1/send",
  paymentGatewayProvider: "midtrans",
  smtpHost: "smtp.gmail.com",
  smtpPort: "587",
  smtpUser: "noreply@pesantrenaistudio.edu",
};

export const DEFAULT_MOBILE_CONFIG: MobileConfig = {
  showDetailedGrades: true,
  allowLeaveRequests: true,
  pushNotifications: true,
  supportWhatsapp: "+62 812 3456 7890",
};

export const SYSTEM_ROLES: UserRole[] = ["SuperAdmin", "Admin", "Ustadz", "Santri", "Walisantri"];

export const ALL_MODULE_LIST: { id: ModuleId; name: string; category: string }[] = [
  { id: "dashboard", name: "Overview Dashboard", category: "Core" },
  { id: "master-data", name: "Master Data Management", category: "Core" },
  { id: "users", name: "User Management (RBAC)", category: "Core" },
  { id: "settings", name: "Settings & Configuration", category: "Core" },
  { id: "ppdb", name: "PPDB Digital", category: "Academic" },
  { id: "cbt", name: "Exams & Computer Based Test", category: "Academic" },
  { id: "tahfidz", name: "Tahfidz & Al-Qur'an", category: "Academic" },
  { id: "boarding", name: "Boarding & Asrama", category: "Academic" },
  { id: "academic", name: "Academic & Formal", category: "Academic" },
  { id: "lms", name: "Digital LMS", category: "Academic" },
  { id: "library", name: "Library & E-Perpus", category: "Academic" },
  { id: "finance", name: "Finance & SPP Billing", category: "Finance" },
  { id: "communication", name: "Communication & Perizinan", category: "Operations" },
  { id: "healthcare", name: "Healthcare & UKS", category: "Operations" },
  { id: "cooperative", name: "Koperasi & Kantin", category: "Operations" },
  { id: "laundry", name: "Laundry Santri", category: "Operations" },
  { id: "enterprise", name: "Multi-Unit Enterprise", category: "Enterprise" },
  { id: "erp", name: "ERP Finance & Budget", category: "Enterprise" },
  { id: "hris", name: "Human Capital (HRIS)", category: "Enterprise" },
  { id: "ga", name: "General Affair (Sarpras)", category: "Enterprise" },
  { id: "document", name: "E-Document & Arsip", category: "Enterprise" },
  { id: "alumni", name: "Alumni Directory", category: "Ecosystem" },
  { id: "crm", name: "Parent CRM & Donatur", category: "Ecosystem" },
  { id: "donation", name: "Wakaf & Infaq Donation", category: "Ecosystem" },
  { id: "marketplace", name: "Marketplace Santri", category: "Ecosystem" },
  { id: "ecosystem", name: "PPOB & Layanan Ekosistem", category: "Ecosystem" },
  { id: "intelligence", name: "AI Analytics & Intelligence", category: "Core" },
];

const CACHE_KEY = "pesantren_system_settings_cache";

function settingsCacheKey(tenantId: string): string {
  return `${CACHE_KEY}:${encodeURIComponent(tenantId)}`;
}

function sanitizeIntegrations(value: unknown): IntegrationsConfig {
  const safe = value && typeof value === "object" ? { ...(value as Record<string, any>) } : {};
  delete safe.waGatewayKey;
  delete safe.paymentGatewayKey;
  delete safe.smtpPassword;
  delete safe.smtpPass;
  return { ...DEFAULT_INTEGRATIONS, ...safe };
}

function scrubLegacySettingsCache(): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith(CACHE_KEY)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || "{}");
        if (!parsed || typeof parsed !== "object") { localStorage.removeItem(key); continue; }
        const sanitized = { ...parsed, integrations: sanitizeIntegrations(parsed.integrations) };
        localStorage.setItem(key, JSON.stringify(sanitized));
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch { /* Browser storage is optional. */ }
}

function persistSettingsCache(tenantId: string, settings: SystemSettings): void {
  try {
    const safeSettings = { ...settings, integrations: sanitizeIntegrations(settings.integrations) };
    localStorage.setItem(settingsCacheKey(tenantId), JSON.stringify(safeSettings));
  } catch { /* Browser storage is optional. */ }
}

class SystemSettingsService {
  private listeners: Set<(settings: SystemSettings) => void> = new Set();
  private settings: SystemSettings;
  private unsubscribeSnapshot: (() => void) | null = null;
  private activeTenantId: string | null = null;

  constructor() {
    this.settings = this.defaultSettings();
  }

  private defaultSettings(): SystemSettings {
    return {
      generalSettings: { ...DEFAULT_GENERAL_SETTINGS },
      orgInfo: { ...DEFAULT_ORG_INFO },
      integrations: { ...DEFAULT_INTEGRATIONS },
      mobileConfig: { ...DEFAULT_MOBILE_CONFIG },
      permissions: this.getDefaultPermissions(),
    };
  }

  private getDefaultPermissions(): Record<string, Record<string, boolean>> {
    const perm: Record<string, Record<string, boolean>> = {};
    SYSTEM_ROLES.forEach((role) => {
      perm[role] = {};
      const allowed = ROLE_MODULES[role] || [];
      ALL_MODULE_LIST.forEach((mod) => {
        perm[role][mod.id] = allowed.includes(mod.id);
      });
    });
    return perm;
  }

  private loadFromCache(tenantId: string): SystemSettings {
    try {
      scrubLegacySettingsCache();
      const cached = localStorage.getItem(settingsCacheKey(tenantId));
      if (cached) {
        const parsed = JSON.parse(cached);
        return {
          tenantId,
          generalSettings: { ...DEFAULT_GENERAL_SETTINGS, ...parsed.generalSettings },
          orgInfo: { ...DEFAULT_ORG_INFO, ...parsed.orgInfo },
          integrations: sanitizeIntegrations(parsed.integrations),
          mobileConfig: { ...DEFAULT_MOBILE_CONFIG, ...parsed.mobileConfig },
          permissions: parsed.permissions || this.getDefaultPermissions(),
          updatedAt: parsed.updatedAt,
        };
      }
    } catch (e) {
      console.warn("Failed to read settings cache", e);
    }

    return this.defaultSettings();
  }

  public setTenantId(tenantId: string | null | undefined): void {
    const normalizedTenantId = typeof tenantId === "string" ? tenantId.trim() : "";
    const nextTenantId = normalizedTenantId || null;
    if (nextTenantId === this.activeTenantId) return;

    this.unsubscribeSnapshot?.();
    this.unsubscribeSnapshot = null;
    this.activeTenantId = nextTenantId;
    this.settings = nextTenantId ? this.loadFromCache(nextTenantId) : this.defaultSettings();
    this.notify();
    if (nextTenantId) this.initRealtimeSync(nextTenantId);
  }

  private initRealtimeSync(tenantId: string) {
    void this.startRealtimeSyncAfterSanitizing(tenantId);
  }

  private async startRealtimeSyncAfterSanitizing(tenantId: string): Promise<void> {
    try {
      const currentUser = getAuthSession();
      if (!currentUser) return;
      const token = await getAccessToken();
      const response = await fetch("/api/system/settings/prepare", {
        method: "POST",
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Server belum dapat mengamankan field integrasi lama.");
      if (this.activeTenantId !== tenantId) return;
      this.subscribeRealtimeSettings(tenantId);
    } catch (error) {
      console.warn("Realtime settings sync ditunda sampai secret legacy dibersihkan backend.", error);
    }
  }

  private subscribeRealtimeSettings(tenantId: string) {
    try {
      const docRef = doc(db, "tenants", tenantId, "settings", "global");
      this.unsubscribeSnapshot = onSnapshot(
        docRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            if (data.tenantId !== tenantId || this.activeTenantId !== tenantId) return;
            this.settings = {
              tenantId,
              generalSettings: { ...DEFAULT_GENERAL_SETTINGS, ...data.generalSettings },
              orgInfo: { ...DEFAULT_ORG_INFO, ...data.orgInfo },
              integrations: sanitizeIntegrations(data.integrations),
              mobileConfig: { ...DEFAULT_MOBILE_CONFIG, ...data.mobileConfig },
              permissions: data.permissions || this.getDefaultPermissions(),
              updatedAt: data.updatedAt,
            };
            this.settings.permissions["SuperAdmin"] = ALL_MODULE_LIST.reduce(
              (acc, m) => ({ ...acc, [m.id]: true }),
              {}
            );
            persistSettingsCache(tenantId, this.settings);
            this.notify();
          }
        },
        (err) => {
          console.warn("Realtime settings sync error:", err);
        }
      );
    } catch (e) {
      console.warn("Failed to subscribe to settings document:", e);
    }
  }

  public subscribe(listener: (settings: SystemSettings) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l(this.settings));
  }

  public getSettings(): SystemSettings {
    return this.settings;
  }

  public getGeneral(): GeneralSettings {
    return this.settings.generalSettings;
  }

  public getOrgInfo(): OrgInfo {
    return this.settings.orgInfo;
  }

  public getIntegrations(): IntegrationsConfig {
    return this.settings.integrations;
  }

  public getMobileConfig(): MobileConfig {
    return this.settings.mobileConfig;
  }

  public getPermissions(): Record<string, Record<string, boolean>> {
    return this.settings.permissions;
  }

  public getAllowedModules(role: UserRole): ModuleId[] {
    return getAllowedModulesForUser(role, null);
  }

  public hasAccess(role: UserRole, moduleId: ModuleId): boolean {
    return isModuleAccessible(role, moduleId, null);
  }

  public async saveSettings(partial: Partial<SystemSettings>): Promise<void> {
    const tenantId = this.activeTenantId;
    if (!tenantId) throw new Error("Tenant aktif wajib tersedia sebelum pengaturan disimpan.");
    const updated: SystemSettings = {
      ...this.settings,
      ...partial,
      integrations: sanitizeIntegrations(partial.integrations ?? this.settings.integrations),
      tenantId,
      updatedAt: new Date().toISOString(),
    };

    // Ensure SuperAdmin is never locked out and platform-only settings remain SuperAdmin-only
    if (updated.permissions) {
      updated.permissions["SuperAdmin"] = ALL_MODULE_LIST.reduce(
        (acc, m) => ({ ...acc, [m.id]: true }),
        {}
      );
      SYSTEM_ROLES.forEach((r) => {
        if (r !== "SuperAdmin" && updated.permissions?.[r]) {
          updated.permissions[r]["settings"] = false;
        }
      });
    }

    const docRef = doc(db, "tenants", tenantId, "settings", "global");
    await setDoc(docRef, updated, { merge: true });
    this.settings = updated;
    try {
      persistSettingsCache(tenantId, updated);
    } catch (e) {
      // Ignore cache write error
    }
    this.notify();
  }

  public exportSystemBackup() {
    return {
      exportDate: new Date().toISOString(),
      app: "ERP4 Pesantren",
      version: "2.5.0",
      settings: this.settings,
    };
  }
}

export const systemSettingsService = new SystemSettingsService();
