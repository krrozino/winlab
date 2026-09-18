export type AllowedAppId =
  | "chrome"
  | "word"
  | "excel"
  | "powerpoint"
  | "powerbi";

export type EnforcementMode = "AuditOnly" | "Enabled";
export type PresetId = "microlins" | "school" | "company" | "kiosk";

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

  blockChromeExtensions: boolean;
  blockChromeGuest: boolean;
  blockChromeNewProfiles: boolean;
  blockChromeIncognito: boolean;
  blockChromePasswordManager: boolean;

  blockWallpaper: boolean;
  blockMousePointers: boolean;
  blockSoundScheme: boolean;
  wallpaperUnlockMinutes: number;

  allowedApps: AllowedAppId[];
  customAllowedPaths: string[];
};
