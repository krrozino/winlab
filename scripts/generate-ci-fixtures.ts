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
import { generatePreflightScript } from "../src/lib/preflight-script";
import { buildWinLabPackageFiles } from "../src/lib/package-integrity";
import { buildPilotPackageFiles } from "../src/lib/pilot";
import type { PreflightReport } from "../src/lib/preflight-types";
import { presets } from "../src/lib/presets";
import type { Config } from "../src/lib/types";

const root = path.join(process.cwd(), "artifacts", "ci-scripts");
const packageRoot = path.join(process.cwd(), "artifacts", "ci-packages");
const pilotRoot = path.join(process.cwd(), "artifacts", "ci-pilot");

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
    "preflight.ps1": generatePreflightScript(config),
    "maintenance.ps1": generateMaintenanceScript(config),
    "liberar-wallpaper.ps1": generateUnlockWallpaperScript(config)
  };

  await Promise.all(
    Object.entries(files).map(([file, content]) =>
      writeFile(path.join(dir, file), content, "utf8")
    )
  );
}

async function writePackageFixture(name: string, config: Config) {
  const dir = path.join(packageRoot, name);
  await mkdir(dir, { recursive: true });

  const files = await buildWinLabPackageFiles(config, {
    packageId: `ci-${name}`,
    generatedAt: "2026-10-06T00:00:00.000Z"
  });

  await Promise.all(
    files.map((file) => writeFile(path.join(dir, file.name), file.content, "utf8"))
  );
}

async function main() {
  await rm(root, { recursive: true, force: true });
  await rm(packageRoot, { recursive: true, force: true });
  await rm(pilotRoot, { recursive: true, force: true });
  await mkdir(root, { recursive: true });
  await mkdir(packageRoot, { recursive: true });
  await mkdir(pilotRoot, { recursive: true });

  for (const item of configs) {
    await writeFixture(item.name, item.config);
    await writePackageFixture(item.name, item.config);
  }

  await writeFile(
    path.join(root, "scan-pc.ps1"),
    generateInventoryScannerScript(),
    "utf8"
  );

  const pilotReport: PreflightReport = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    computerName: "CI-PILOT",
    profileName: defaultConfig.profileName,
    windows: {
      caption: "Windows 11 Pro",
      version: "10.0.26100",
      buildNumber: "26100",
      architecture: "64 bits"
    },
    status: "PASS",
    summary: {
      score: 100,
      pass: 10,
      warn: 0,
      block: 0
    },
    checks: []
  };

  const pilotFiles = await buildPilotPackageFiles(
    {
      ...defaultConfig,
      enforcementMode: "Enabled",
      profileCleanupMode: "Delete"
    },
    pilotReport
  );

  await Promise.all(
    pilotFiles.map((file) =>
      writeFile(path.join(pilotRoot, file.name), file.content, "utf8")
    )
  );

  console.log(`Generated ${configs.length} WinLab script fixtures in ${root}`);
  console.log(`Generated ${configs.length} WinLab package fixtures in ${packageRoot}`);
  console.log(`Generated WinLab pilot fixture in ${pilotRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
