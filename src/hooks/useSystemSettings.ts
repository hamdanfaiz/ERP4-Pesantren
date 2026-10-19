import { useAuth } from '../contexts/AuthContext';
import { useState, useEffect, useCallback } from "react";
import {
  systemSettingsService,
  SystemSettings,
  GeneralSettings,
  OrgInfo,
  IntegrationsConfig,
  MobileConfig,
  SYSTEM_ROLES,
  ALL_MODULE_LIST,
} from "../services/systemSettingsService";
import { UserRole, isModuleAccessible, getAllowedModulesForUser } from "../rbac";
import { ModuleId } from "../types";

export function useSystemSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(() =>
    systemSettingsService.getSettings()
  );

  useEffect(() => {
    systemSettingsService.setTenantId(user?.tenantId ?? null);
    setSettings({ ...systemSettingsService.getSettings() });
  }, [user?.tenantId]);

  useEffect(() => {
    const unsub = systemSettingsService.subscribe(() => {
      setSettings({ ...systemSettingsService.getSettings() });
    });
    return unsub;
  }, []);

  const general = settings.generalSettings;
  const orgInfo = settings.orgInfo;
  const integrations = settings.integrations;
  const mobileConfig = settings.mobileConfig;
  const permissions = settings.permissions;

  const academicYear = general.academicYear || "2026/2027";
  const semester = general.semester || "Ganjil";
  const formattedPeriod = `T.A. ${academicYear} Semester ${semester}`;
  const isReportCardLocked = !!general.isReportCardLocked;

  const hasAccess = useCallback(
    (role: UserRole, moduleId: ModuleId) => {
      return isModuleAccessible(role, moduleId);
    },
    []
  );

  const getAllowedModules = useCallback((role: UserRole) => {
    return getAllowedModulesForUser(role, null);
  }, []);

  const getUserAllowedModules = useCallback((user: any, role: UserRole): ModuleId[] => {
    return getAllowedModulesForUser(role, user?.modulePermissions);
  }, []);

  const canAccessModule = useCallback(
    (user: any, role: UserRole, moduleId: ModuleId): boolean => {
      return isModuleAccessible(role, moduleId, user?.modulePermissions);
    },
    []
  );

  const updateSettings = useCallback(
    async (partial: Partial<SystemSettings>) => {
      await systemSettingsService.saveSettings(partial);
    },
    []
  );

  const exportBackup = useCallback(() => {
    return systemSettingsService.exportSystemBackup();
  }, []);

  return {
    settings,
    general,
    orgInfo,
    integrations,
    mobileConfig,
    permissions,
    academicYear,
    semester,
    formattedPeriod,
    isReportCardLocked,
    SYSTEM_ROLES,
    ALL_MODULE_LIST,
    hasAccess,
    getAllowedModules,
    getUserAllowedModules,
    canAccessModule,
    updateSettings,
    exportBackup,
  };
}
