import type { AllowedAppId } from "./apps";

export type { AllowedAppId } from "./apps";

export type EnforcementMode = "AuditOnly" | "Enabled";
export type BrowserUrlMode = "Unrestricted" | "BlockList" | "AllowListOnly";
export type ProfileCleanupMode = "Off" | "ReportOnly" | "Delete";
export type PresetId =
  | "microlins"
  | "microlins_iniciante"
  | "microlins_intermediario"
  | "microlins_avancado"
  | "school"
  | "company"
  | "kiosk";

export type OperatingMode = "Demo" | "Real";

export interface FirstRunState {
  isCompleted: boolean;
  completedAt?: string;
  configuredPresetId?: PresetId;
  targetStudentUser?: string;
  protectedAdminUser?: string;
  initialBaselineId?: string;
}

export type Config = {
  profileName: string;
  studentUser: string;
  adminUser: string;
  createAccounts: boolean;

  enforcementMode: EnforcementMode;

  blockInstallers: boolean;
  blockStoreApps: boolean;
  blockCmd: boolean;
  blockPowerShell: boolean;
  blockRegedit: boolean;
  allowLocalAccountManagement: boolean;

  blockChromeExtensions: boolean;
  blockChromeGuest: boolean;
  blockChromeNewProfiles: boolean;
  blockChromeIncognito: boolean;
  blockChromePasswordManager: boolean;

  browserUrlMode: BrowserUrlMode;
  blockedUrls: string[];
  allowedUrls: string[];

  blockUsbRead: boolean;
  blockUsbWrite: boolean;
  blockUsbExecute: boolean;

  profileCleanupMode: ProfileCleanupMode;
  profileCleanupDays: number;
  storageWarningFreePercent: number;

  blockWallpaper: boolean;
  blockMousePointers: boolean;
  blockSoundScheme: boolean;
  wallpaperUnlockMinutes: number;

  allowedApps: AllowedAppId[];
  customAllowedPaths: string[];
};

export type ConfigFile = Config & {
  schemaVersion: 1;
};
