import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { defaultConfig } from "../src/lib/default-config";
import {
  generateAuditScript,
  generateMaintenanceScript,
  generateRollbackScript,
  generateSetupScript,
  generateUnlockWallpaperScript,
  generateVerifyScript
} from "../src/lib/generator";
import { generateInventoryScannerScript } from "../src/lib/inventory-script";
import { presets } from "../src/lib/presets";
import type { Config } from "../src/lib/types";

const root = path.join(process.cwd(), "artifacts", "ci-scripts");

const stressConfigs: Array<{ name: string; config: Config }> = [
  {
    name: "stress-locked",
    config: {
      ...defaultConfig,
      profileName: "CI Locked Lab",
      studentUser: "AlunoCI",
      adminUser: "AdminCI",
      enforcementMode: "Enabled",
      browserUrlMode: "AllowListOnly",
      allowedUrls: ["https://microlins.com.br/*", "https://*.office.com/*"],
      blockedUrls: [],
      blockUsbRead: true,
      blockUsbWrite: true,
      blockUsbExecute: true,
      allowLocalAccountManagement: false,
      profileCleanupMode: "Delete",
      profileCleanupDays: 45,
      storageWarningFreePercent: 15,
      customAllowedPaths: ["C:\\Program Files\\Curso Especial\\curso.exe"]
    }
  },
  {
    name: "stress-open",
    config: {
      ...defaultConfig,
      profileName: "CI Open Workstation",
      studentUser: "OperadorCI",
      adminUser: "TIAdminCI",
      createAccounts: false,
      enforcementMode: "AuditOnly",
      browserUrlMode: "BlockList",
      blockedUrls: ["https://*.example.invalid/*"],
      allowedUrls: ["https://aula.example.invalid/*"],
      blockUsbRead: false,
      blockUsbWrite: false,
      blockUsbExecute: false,
      allowLocalAccountManagement: true,
      blockWallpaper: false,
      blockMousePointers: false,
      blockSoundScheme: false,
      profileCleanupMode: "ReportOnly",
      profileCleanupDays: 365,
      storageWarningFreePercent: 10
    }
  }
];

const configs = [
  ...presets.map((preset) => ({ name: `preset-${preset.id}`, config: preset.config })),
  ...stressConfigs
];

async function writeFixture(name: string, config: Config) {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });

  const files: Record<string, string> = {
    "setup.ps1": generateSetupScript(config),
    "rollback.ps1": generateRollbackScript(config),
    "audit.ps1": generateAuditScript(config),
    "verify.ps1": generateVerifyScript(config),
    "maintenance.ps1": generateMaintenanceScript(config),
    "liberar-wallpaper.ps1": generateUnlockWallpaperScript(config)
  };

  await Promise.all(
    Object.entries(files).map(([file, content]) =>
      writeFile(path.join(dir, file), content, "utf8")
    )
  );
}

await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });

for (const item of configs) {
  await writeFixture(item.name, item.config);
}

await writeFile(
  path.join(root, "scan-pc.ps1"),
  generateInventoryScannerScript(),
  "utf8"
);

console.log(`Generated ${configs.length} WinLab fixture sets in ${root}`);
