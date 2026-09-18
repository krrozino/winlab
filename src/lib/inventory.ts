import { ALLOWED_APP_IDS, APP_CATALOG } from "./apps";
import type { AllowedAppId } from "./apps";
import type { Config } from "./types";
import type {
  InventoryInstalledApp,
  InventoryKnownApp,
  InventoryUser,
  PcInventory
} from "./inventory-types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseUser(value: unknown): InventoryUser | null {
  if (!record(value)) return null;
  const name = stringValue(value.name).trim();
  if (!name) return null;

  return {
    name,
    enabled: booleanValue(value.enabled),
    isAdministrator: booleanValue(value.isAdministrator)
  };
}

function parseKnownApp(value: unknown): InventoryKnownApp | null {
  if (!record(value)) return null;
  const id = stringValue(value.id) as AllowedAppId;

  if (!ALLOWED_APP_IDS.includes(id)) return null;

  return {
    id,
    label: stringValue(value.label, APP_CATALOG[id].label),
    found: booleanValue(value.found),
    path: nullableString(value.path)
  };
}

function parseInstalledApp(value: unknown): InventoryInstalledApp | null {
  if (!record(value)) return null;
  const name = stringValue(value.name).trim();
  if (!name) return null;

  return {
    name,
    version: nullableString(value.version),
    publisher: nullableString(value.publisher),
    installLocation: nullableString(value.installLocation)
  };
}

export function parseInventoryJson(raw: string): PcInventory {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("O inventário não contém JSON válido.");
  }

  if (!record(parsed)) {
    throw new Error("O inventário precisa conter um objeto JSON.");
  }

  if (parsed.schemaVersion !== 1) {
    throw new Error("Versão de inventário não suportada.");
  }

  if (!record(parsed.windows) || !record(parsed.appLocker)) {
    throw new Error("Inventário incompleto: Windows ou AppLocker ausente.");
  }

  const computerName = stringValue(parsed.computerName).trim();
  if (!computerName) {
    throw new Error("Inventário sem nome do computador.");
  }

  return {
    schemaVersion: 1,
    generatedAt: stringValue(parsed.generatedAt),
    computerName,
    windows: {
      caption: stringValue(parsed.windows.caption),
      version: stringValue(parsed.windows.version),
      buildNumber: stringValue(parsed.windows.buildNumber),
      architecture: stringValue(parsed.windows.architecture)
    },
    appLocker: {
      available: booleanValue(parsed.appLocker.available),
      applicationIdentityStatus: nullableString(
        parsed.appLocker.applicationIdentityStatus
      )
    },
    storage: record(parsed.storage)
      ? {
          systemDrive: stringValue(parsed.storage.systemDrive),
          sizeGB: numberValue(parsed.storage.sizeGB),
          freeGB: numberValue(parsed.storage.freeGB),
          freePercent: numberValue(parsed.storage.freePercent)
        }
      : null,
    localUsers: Array.isArray(parsed.localUsers)
      ? parsed.localUsers.map(parseUser).filter((item): item is InventoryUser => !!item)
      : [],
    knownApps: Array.isArray(parsed.knownApps)
      ? parsed.knownApps
          .map(parseKnownApp)
          .filter((item): item is InventoryKnownApp => !!item)
      : [],
    installedApps: Array.isArray(parsed.installedApps)
      ? parsed.installedApps
          .map(parseInstalledApp)
          .filter((item): item is InventoryInstalledApp => !!item)
      : []
  };
}

export function detectedKnownApps(inventory: PcInventory): InventoryKnownApp[] {
  return inventory.knownApps.filter((app) => app.found);
}

export function suggestedAllowedApps(
  inventory: PcInventory,
  config: Config
): AllowedAppId[] {
  return detectedKnownApps(inventory)
    .map((app) => app.id)
    .filter((id) => !config.allowedApps.includes(id));
}

export function applyInventorySuggestions(
  config: Config,
  inventory: PcInventory
): Config {
  const additions = suggestedAllowedApps(inventory, config);

  return {
    ...config,
    allowedApps: [...config.allowedApps, ...additions]
  };
}

export function findPotentiallyRelevantInstalledApps(
  inventory: PcInventory,
  query: string
): InventoryInstalledApp[] {
  const needle = query.trim().toLowerCase();

  if (!needle) return inventory.installedApps.slice(0, 40);

  return inventory.installedApps
    .filter((app) =>
      [app.name, app.publisher, app.installLocation]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    )
    .slice(0, 40);
}
