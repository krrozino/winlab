import { ALLOWED_APP_IDS } from "./apps";
import { defaultConfig } from "./default-config";
import type { Config, ConfigFile, EnforcementMode } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function enforcement(value: unknown, fallback: EnforcementMode): EnforcementMode {
  return value === "AuditOnly" || value === "Enabled" ? value : fallback;
}

export function parseConfigJson(raw: string): Config {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("O arquivo não contém JSON válido.");
  }

  if (!isRecord(parsed)) {
    throw new Error("O arquivo de configuração precisa conter um objeto JSON.");
  }

  const allowedApps = Array.isArray(parsed.allowedApps)
    ? parsed.allowedApps.filter(
        (value): value is Config["allowedApps"][number] =>
          typeof value === "string" &&
          ALLOWED_APP_IDS.includes(value as Config["allowedApps"][number])
      )
    : defaultConfig.allowedApps;

  const customAllowedPaths = Array.isArray(parsed.customAllowedPaths)
    ? parsed.customAllowedPaths.filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )
    : defaultConfig.customAllowedPaths;

  const unlockMinutes =
    typeof parsed.wallpaperUnlockMinutes === "number" &&
    Number.isFinite(parsed.wallpaperUnlockMinutes)
      ? Math.max(5, Math.min(480, Math.round(parsed.wallpaperUnlockMinutes)))
      : defaultConfig.wallpaperUnlockMinutes;

  return {
    profileName: text(parsed.profileName, defaultConfig.profileName),
    studentUser: text(parsed.studentUser, defaultConfig.studentUser),
    adminUser: text(parsed.adminUser, defaultConfig.adminUser),
    createAccounts: bool(parsed.createAccounts, defaultConfig.createAccounts),

    enforcementMode: enforcement(
      parsed.enforcementMode,
      defaultConfig.enforcementMode
    ),

    blockInstallers: bool(parsed.blockInstallers, defaultConfig.blockInstallers),
    blockStoreApps: bool(parsed.blockStoreApps, defaultConfig.blockStoreApps),
    blockCmd: bool(parsed.blockCmd, defaultConfig.blockCmd),
    blockPowerShell: bool(parsed.blockPowerShell, defaultConfig.blockPowerShell),
    blockRegedit: bool(parsed.blockRegedit, defaultConfig.blockRegedit),
    allowLocalAccountManagement: bool(
      parsed.allowLocalAccountManagement,
      defaultConfig.allowLocalAccountManagement
    ),

    blockChromeExtensions: bool(
      parsed.blockChromeExtensions,
      defaultConfig.blockChromeExtensions
    ),
    blockChromeGuest: bool(parsed.blockChromeGuest, defaultConfig.blockChromeGuest),
    blockChromeNewProfiles: bool(
      parsed.blockChromeNewProfiles,
      defaultConfig.blockChromeNewProfiles
    ),
    blockChromeIncognito: bool(
      parsed.blockChromeIncognito,
      defaultConfig.blockChromeIncognito
    ),
    blockChromePasswordManager: bool(
      parsed.blockChromePasswordManager,
      defaultConfig.blockChromePasswordManager
    ),

    blockWallpaper: bool(parsed.blockWallpaper, defaultConfig.blockWallpaper),
    blockMousePointers: bool(
      parsed.blockMousePointers,
      defaultConfig.blockMousePointers
    ),
    blockSoundScheme: bool(
      parsed.blockSoundScheme,
      defaultConfig.blockSoundScheme
    ),
    wallpaperUnlockMinutes: unlockMinutes,

    allowedApps,
    customAllowedPaths
  };
}

export function serializeConfig(config: Config): string {
  const file: ConfigFile = {
    schemaVersion: 1,
    ...config
  };

  return JSON.stringify(file, null, 2);
}
