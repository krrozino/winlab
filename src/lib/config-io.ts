import { ALLOWED_APP_IDS } from "./apps";
import { defaultConfig } from "./default-config";
import type {
  BrowserUrlMode,
  Config,
  ConfigFile,
  EnforcementMode,
  ProfileCleanupMode
} from "./types";

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

function browserUrlMode(value: unknown, fallback: BrowserUrlMode): BrowserUrlMode {
  return value === "Unrestricted" || value === "BlockList" || value === "AllowListOnly"
    ? value
    : fallback;
}

function profileCleanupMode(
  value: unknown,
  fallback: ProfileCleanupMode
): ProfileCleanupMode {
  return value === "Off" || value === "ReportOnly" || value === "Delete"
    ? value
    : fallback;
}

function stringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : fallback;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;
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

    browserUrlMode: browserUrlMode(
      parsed.browserUrlMode,
      defaultConfig.browserUrlMode
    ),
    blockedUrls: stringArray(parsed.blockedUrls, defaultConfig.blockedUrls),
    allowedUrls: stringArray(parsed.allowedUrls, defaultConfig.allowedUrls),

    blockUsbRead: bool(parsed.blockUsbRead, defaultConfig.blockUsbRead),
    blockUsbWrite: bool(parsed.blockUsbWrite, defaultConfig.blockUsbWrite),
    blockUsbExecute: bool(parsed.blockUsbExecute, defaultConfig.blockUsbExecute),

    profileCleanupMode: profileCleanupMode(
      parsed.profileCleanupMode,
      defaultConfig.profileCleanupMode
    ),
    profileCleanupDays: boundedNumber(
      parsed.profileCleanupDays,
      defaultConfig.profileCleanupDays,
      1,
      3650
    ),
    storageWarningFreePercent: boundedNumber(
      parsed.storageWarningFreePercent,
      defaultConfig.storageWarningFreePercent,
      1,
      99
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
