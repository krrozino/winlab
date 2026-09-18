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

  blockChromeExtensions: true,
  blockChromeGuest: true,
  blockChromeNewProfiles: true,
  blockChromeIncognito: true,
  blockChromePasswordManager: true,

  blockWallpaper: true,
  blockMousePointers: true,
  blockSoundScheme: true,
  wallpaperUnlockMinutes: 90,

  allowedApps: ["chrome", "word", "excel", "powerpoint", "powerbi"],
  customAllowedPaths: []
};
