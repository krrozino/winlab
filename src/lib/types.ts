export type AllowedAppId =
  | "chrome"
  | "word"
  | "excel"
  | "powerpoint"
  | "powerbi";

export type Config = {
  profileName: string;
  studentUser: string;
  adminUser: string;

  createAccounts: boolean;

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

  allowedApps: AllowedAppId[];
  customAllowedPaths: string[];
};
