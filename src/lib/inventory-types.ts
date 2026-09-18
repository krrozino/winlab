import type { AllowedAppId } from "./apps";

export type InventoryUser = {
  name: string;
  enabled: boolean;
  isAdministrator: boolean;
};

export type InventoryKnownApp = {
  id: AllowedAppId;
  label: string;
  found: boolean;
  path: string | null;
};

export type InventoryInstalledApp = {
  name: string;
  version: string | null;
  publisher: string | null;
  installLocation: string | null;
};

export type PcInventory = {
  schemaVersion: 1;
  generatedAt: string;
  computerName: string;
  windows: {
    caption: string;
    version: string;
    buildNumber: string;
    architecture: string;
  };
  appLocker: {
    available: boolean;
    applicationIdentityStatus: string | null;
  };
  storage: {
    systemDrive: string;
    sizeGB: number;
    freeGB: number;
    freePercent: number;
  } | null;
  localUsers: InventoryUser[];
  knownApps: InventoryKnownApp[];
  installedApps: InventoryInstalledApp[];
};
