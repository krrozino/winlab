import { Config } from "./types";

export const defaultConfig: Config = {
  profileName: "Laboratório Escolar",
  studentUser: "Aluno",
  adminUser: "MicrolinsAdmin",
  createAccounts: true,

  enforcementMode: "AuditOnly",

  blockInstallers: true,
  blockStoreApps: true,
  blockCmd: true,
  blockPowerShell: true,
  blockRegedit: true,
  allowLocalAccountManagement: false,

  blockChromeExtensions: true,
  blockChromeGuest: true,
  blockChromeNewProfiles: true,
  blockChromeIncognito: true,
  blockChromePasswordManager: true,

  browserUrlMode: "Unrestricted",
  blockedUrls: [],
  allowedUrls: [],

  blockUsbRead: false,
  blockUsbWrite: false,
  blockUsbExecute: true,

  profileCleanupMode: "ReportOnly",
  profileCleanupDays: 30,
  storageWarningFreePercent: 20,

  blockWallpaper: true,
  blockMousePointers: true,
  blockSoundScheme: true,
  wallpaperUnlockMinutes: 90,

  allowedApps: ["chrome", "word", "excel", "powerpoint", "powerbi"],
  customAllowedPaths: []
};
