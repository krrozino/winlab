import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig } from "../src/lib/default-config";
import { parseConfigJson, serializeConfig } from "../src/lib/config-io";
import {
  generateConfigJson,
  generateMaintenanceScript,
  generateRollbackScript,
  generateSetupScript,
  generateVerifyScript
} from "../src/lib/generator";
import { getConfigReview } from "../src/lib/review";
import {
  applyInventorySuggestions,
  parseInventoryJson,
  suggestedAllowedApps
} from "../src/lib/inventory";
import { generateInventoryScannerScript } from "../src/lib/inventory-script";
import { getConfigErrors } from "../src/lib/validation";
import { parsePreflightReportJson, isPreflightReady } from "../src/lib/preflight";
import { generatePreflightScript } from "../src/lib/preflight-script";
import {
  buildPackageManifest,
  buildWinLabPackageFiles,
  getBasePackageFiles,
  sha256Text,
  verifyPackageFiles
} from "../src/lib/package-integrity";

test("imports legacy 0.2 config without schemaVersion", () => {
  const imported = parseConfigJson(
    JSON.stringify({
      ...defaultConfig,
      profileName: "Laboratório Teste",
      enforcementMode: "Enabled"
    })
  );

  assert.equal(imported.profileName, "Laboratório Teste");
  assert.equal(imported.enforcementMode, "Enabled");
});

test("ignores unknown application ids during import", () => {
  const imported = parseConfigJson(
    JSON.stringify({
      ...defaultConfig,
      allowedApps: ["chrome", "programa-inventado"]
    })
  );

  assert.deepEqual(imported.allowedApps, ["chrome"]);
});

test("serializes schemaVersion 1", () => {
  const parsed = JSON.parse(serializeConfig(defaultConfig));
  assert.equal(parsed.schemaVersion, 1);
});

test("generated setup keeps administrator unrestricted and student targeted", () => {
  const script = generateSetupScript(defaultConfig);

  assert.match(script, /S-1-5-32-544/);
  assert.match(script, /Registry::HKEY_USERS/);
  assert.match(script, /AuditOnly/);
  assert.match(script, /MicrolinsAdmin/);
});

test("verify script checks AppLocker and configured executables", () => {
  const script = generateVerifyScript(defaultConfig);

  assert.match(script, /Get-AppLockerPolicy/);
  assert.match(script, /Application Identity/);
  assert.match(script, /chrome\.exe/i);
});

test("review warns about user-writable allowlist paths", () => {
  const review = getConfigReview({
    ...defaultConfig,
    customAllowedPaths: ["C:\\Users\\Aluno\\Downloads\\app.exe"]
  });

  assert.ok(review.some((item) => item.level === "warning"));
});

test("generated config json uses schemaVersion", () => {
  const parsed = JSON.parse(generateConfigJson(defaultConfig));
  assert.equal(parsed.schemaVersion, 1);
});


test("parses pc inventory and suggests detected catalog apps", () => {
  const inventory = parseInventoryJson(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-09-18T00:00:00-03:00",
      computerName: "LAB-01",
      windows: {
        caption: "Microsoft Windows 11 Pro",
        version: "10.0.26100",
        buildNumber: "26100",
        architecture: "64 bits"
      },
      appLocker: {
        available: true,
        applicationIdentityStatus: "Running"
      },
      localUsers: [
        { name: "Aluno", enabled: true, isAdministrator: false },
        { name: "Admin", enabled: true, isAdministrator: true }
      ],
      knownApps: [
        {
          id: "chrome",
          label: "Google Chrome",
          found: true,
          path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        },
        {
          id: "vscode",
          label: "Visual Studio Code",
          found: true,
          path: "C:\\Program Files\\Microsoft VS Code\\Code.exe"
        }
      ],
      installedApps: [
        {
          name: "Google Chrome",
          version: "140.0",
          publisher: "Google LLC",
          installLocation: "C:\\Program Files\\Google\\Chrome"
        }
      ]
    })
  );

  assert.equal(inventory.computerName, "LAB-01");
  assert.equal(inventory.appLocker.available, true);
  assert.deepEqual(suggestedAllowedApps(inventory, defaultConfig), ["vscode"]);
});

test("applies inventory suggestions without removing existing allowlist apps", () => {
  const inventory = parseInventoryJson(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "",
      computerName: "LAB-02",
      windows: {
        caption: "Windows 11 Pro",
        version: "10.0",
        buildNumber: "26100",
        architecture: "64 bits"
      },
      appLocker: {
        available: true,
        applicationIdentityStatus: "Stopped"
      },
      localUsers: [],
      knownApps: [
        { id: "vlc", label: "VLC Media Player", found: true, path: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" }
      ],
      installedApps: []
    })
  );

  const updated = applyInventorySuggestions(defaultConfig, inventory);
  assert.ok(updated.allowedApps.includes("chrome"));
  assert.ok(updated.allowedApps.includes("vlc"));
});

test("inventory scanner avoids personal content and writes portable json", () => {
  const script = generateInventoryScannerScript();

  assert.match(script, /winlab-inventory-/);
  assert.match(script, /CurrentVersion\\Uninstall/);
  assert.match(script, /Get-LocalUser/);
  assert.match(script, /ConvertTo-Json/);
  assert.doesNotMatch(script, /Get-Content .*Documents/i);
  assert.doesNotMatch(script, /password/i);
});


test("local account management is blocked by default for restricted user", () => {
  const script = generateSetupScript(defaultConfig);

  assert.equal(defaultConfig.allowLocalAccountManagement, false);
  assert.match(script, /SettingsPageVisibility/);
  assert.match(script, /hide:otherusers/);
});

test("local account management permission survives config import", () => {
  const imported = parseConfigJson(
    JSON.stringify({
      ...defaultConfig,
      allowLocalAccountManagement: true
    })
  );

  assert.equal(imported.allowLocalAccountManagement, true);
});


test("web URL policies generate Chrome and Edge lists", () => {
  const script = generateSetupScript({
    ...defaultConfig,
    browserUrlMode: "AllowListOnly",
    allowedUrls: ["microlins.com.br", "office.com"]
  });

  assert.match(script, /Google\\Chrome/);
  assert.match(script, /Microsoft\\Edge/);
  assert.match(script, /URLBlocklist/);
  assert.match(script, /URLAllowlist/);
  assert.match(script, /microlins\.com\.br/);
});

test("usb defaults allow files but block execution through AppLocker", () => {
  const script = generateSetupScript(defaultConfig);

  assert.equal(defaultConfig.blockUsbRead, false);
  assert.equal(defaultConfig.blockUsbWrite, false);
  assert.equal(defaultConfig.blockUsbExecute, true);
  assert.match(script, /%HOT%/);
  assert.match(script, /%REMOVABLE%/);
  assert.match(script, /Deny_Read/);
  assert.match(script, /Deny_Write/);
});

test("maintenance defaults to report-only and protects configured users", () => {
  const script = generateMaintenanceScript(defaultConfig);

  assert.equal(defaultConfig.profileCleanupMode, "ReportOnly");
  assert.match(script, /Mode = "ReportOnly"/);
  assert.match(script, /Get-CimInstance Win32_UserProfile/);
  assert.match(script, /protectedSids/);
  assert.match(script, /maintenance-latest\.json/);
});

test("new 0.5 settings survive config import", () => {
  const imported = parseConfigJson(
    JSON.stringify({
      ...defaultConfig,
      browserUrlMode: "BlockList",
      blockedUrls: ["youtube.com"],
      allowedUrls: ["youtube.com/curso"],
      blockUsbWrite: true,
      profileCleanupMode: "Delete",
      profileCleanupDays: 45,
      storageWarningFreePercent: 15
    })
  );

  assert.equal(imported.browserUrlMode, "BlockList");
  assert.deepEqual(imported.blockedUrls, ["youtube.com"]);
  assert.equal(imported.blockUsbWrite, true);
  assert.equal(imported.profileCleanupMode, "Delete");
  assert.equal(imported.profileCleanupDays, 45);
  assert.equal(imported.storageWarningFreePercent, 15);
});

test("inventory parser accepts optional disk storage data", () => {
  const inventory = parseInventoryJson(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "",
      computerName: "LAB-STORAGE",
      windows: {
        caption: "Windows 11 Pro",
        version: "10.0",
        buildNumber: "26100",
        architecture: "64 bits"
      },
      appLocker: {
        available: true,
        applicationIdentityStatus: "Running"
      },
      storage: {
        systemDrive: "C:",
        sizeGB: 238.5,
        freeGB: 51.2,
        freePercent: 21.5
      },
      localUsers: [],
      knownApps: [],
      installedApps: []
    })
  );

  assert.equal(inventory.storage?.systemDrive, "C:");
  assert.equal(inventory.storage?.freePercent, 21.5);
});


test("generated Windows paths keep exact removable-storage and browser registry syntax", () => {
  const script = generateSetupScript(defaultConfig);

  assert.ok(
    script.includes(
      String.raw`Registry::HKEY_USERS\$sid\Software\Policies\Microsoft\Edge`
    )
  );
  assert.ok(
    script.includes(
      String.raw`RemovableStorageDevices\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}`
    )
  );
  assert.ok(script.includes(String.raw`%HOT%\*`));
  assert.ok(script.includes(String.raw`%REMOVABLE%\*`));
});


test("generated setup and rollback require explicit Apply", () => {
  const setup = generateSetupScript(defaultConfig);
  const rollback = generateRollbackScript(defaultConfig);

  assert.ok(setup.includes("param([switch]$Apply, [switch]$UserPoliciesOnly)"));
  assert.ok(setup.includes("if ($Apply)"));
  assert.ok(setup.includes("Nenhuma alteração foi aplicada"));

  assert.ok(rollback.includes("param([switch]$Apply)"));
  assert.ok(rollback.includes("if ($Apply)"));
  assert.ok(rollback.includes("PREVIEW do rollback"));
});

test("profile deletion requires explicit Apply", () => {
  const maintenance = generateMaintenanceScript({
    ...defaultConfig,
    profileCleanupMode: "Delete"
  });

  assert.ok(maintenance.includes('param([switch]$Apply)'));
  assert.ok(maintenance.includes('$Mode -eq "Delete" -and $Apply'));
  assert.ok(maintenance.includes("apenas um PREVIEW"));
});

test("PowerShell parameters are emitted before executable statements", () => {
  const setup = generateSetupScript(defaultConfig);
  const paramIndex = setup.indexOf("param([switch]$Apply, [switch]$UserPoliciesOnly)");
  const errorPreferenceIndex = setup.indexOf('$ErrorActionPreference = "Stop"');

  assert.ok(paramIndex > 0);
  assert.ok(errorPreferenceIndex > paramIndex);
});


test("setup includes fail-fast preflight and first-logon recovery path", () => {
  const setup = generateSetupScript(defaultConfig);

  assert.ok(setup.includes("function Test-WinLabPreflight"));
  assert.ok(setup.includes("Preflight WinLab falhou"));
  assert.ok(setup.includes('$triggerUser = "$env:COMPUTERNAME\\$Aluno"'));
  assert.ok(setup.includes("New-ScheduledTaskTrigger -AtLogOn -User $triggerUser"));
  assert.ok(setup.includes("-Apply -UserPoliciesOnly"));
  assert.ok(setup.includes("Complete-DeferredUserPolicies"));
});

test("setup preserves AppLocker and registry baselines across reapplies", () => {
  const setup = generateSetupScript(defaultConfig);

  assert.ok(setup.includes("AppLocker-Baseline-"));
  assert.ok(setup.includes("baselineAppLockerBackup"));
  assert.ok(setup.includes("Registry-Baseline-"));
  assert.ok(setup.includes("registryBaselineDir"));
  assert.ok(setup.includes("if ($state -and $state.baselineAppLockerBackup)"));
  assert.ok(setup.includes("if ($state -and $state.registryBaselineDir)"));
  assert.ok(setup.includes("schemaVersion = 2"));
});

test("rollback restores baseline instead of clearing AppLocker", () => {
  const rollback = generateRollbackScript(defaultConfig);

  assert.ok(rollback.includes("Get-WinLabRollbackState"));
  assert.ok(rollback.includes("Restore-AppLockerBaseline"));
  assert.ok(rollback.includes("Restore-RegistryBaseline"));
  assert.ok(rollback.includes("Set-AppLockerPolicy -XmlPolicy $baseline"));
  assert.ok(rollback.includes("state.json do WinLab não foi encontrado"));
  assert.equal(rollback.includes("WinLab-AppLocker-Empty.xml"), false);
  assert.equal(rollback.includes('EnforcementMode="NotConfigured"'), false);
});

test("registry baseline covers every user policy family WinLab changes", () => {
  const setup = generateSetupScript(defaultConfig);
  const names = [
    "Chrome",
    "Edge",
    "Personalization",
    "ActiveDesktop",
    "Explorer",
    "RemovableStorage"
  ];

  for (const name of names) {
    assert.ok(setup.includes('Name = "' + name + '"'));
  }

  assert.ok(setup.includes("reg.exe export"));
  assert.ok(generateRollbackScript(defaultConfig).includes("reg.exe import"));
});

test("state records deferred policy completion fields", () => {
  const setup = generateSetupScript(defaultConfig);

  assert.ok(setup.includes("userPoliciesDeferred"));
  assert.ok(setup.includes("userPoliciesAppliedAt"));
  assert.ok(setup.includes("status = $Status"));
  assert.ok(setup.includes('ValidateSet("Applying", "Applied", "RecoveredAfterFailure", "RecoveryFailed")'));
});

test("recovery paths preserve exact registry syntax in generated PowerShell", () => {
  const setup = generateSetupScript(defaultConfig);

  assert.ok(setup.includes('Native = "HKU\\$sid\\Software\\Policies\\Google\\Chrome"'));
  assert.ok(setup.includes('Provider = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Google\\Chrome"'));
  assert.ok(setup.includes('$triggerUser = "$env:COMPUTERNAME\\$Aluno"'));
  assert.ok(setup.includes('Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices\\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}'));
});

test("failed setup has automatic recovery states", () => {
  const setup = generateSetupScript(defaultConfig);

  assert.ok(setup.includes("Recover-FromFailedSetup"));
  assert.ok(setup.includes("RecoveredAfterFailure"));
  assert.ok(setup.includes("RecoveryFailed"));
  assert.ok(setup.includes("Restore-RegistryBaselineForRecovery"));
  assert.ok(setup.includes("Set-AppLockerPolicy -XmlPolicy $BaselineAppLockerBackup"));
});

test("state and rollback are bound to account SIDs", () => {
  const setup = generateSetupScript(defaultConfig);
  const rollback = generateRollbackScript(defaultConfig);

  assert.ok(setup.includes("studentSid = $studentObject.SID.Value"));
  assert.ok(setup.includes("adminSid = $adminObject.SID.Value"));
  assert.ok(setup.includes("foi recriada com outro SID"));
  assert.ok(rollback.includes("SID diferente do registrado pelo WinLab"));
});

test("fatal validation follows Windows local-user naming rules", () => {
  assert.equal(getConfigErrors(defaultConfig).length, 0);

  assert.ok(
    getConfigErrors({ ...defaultConfig, studentUser: "Aluno/Inválido" }).some(
      (error) => error.field === "studentUser"
    )
  );

  assert.ok(
    getConfigErrors({ ...defaultConfig, adminUser: "123456789012345678901" }).some(
      (error) => error.field === "adminUser"
    )
  );

  assert.ok(
    getConfigErrors({ ...defaultConfig, studentUser: "...." }).some(
      (error) => error.field === "studentUser"
    )
  );
});

test("fatal validation rejects equal student and admin accounts", () => {
  const errors = getConfigErrors({
    ...defaultConfig,
    studentUser: "MesmoUsuario",
    adminUser: "mesmousuario"
  });

  assert.ok(errors.some((error) => error.message.includes("nomes diferentes")));
});

test("generated preflight independently validates local-user names", () => {
  const setup = generateSetupScript(defaultConfig);

  assert.ok(setup.includes("function Test-WinLabUserName"));
  assert.ok(setup.includes("Nome inválido para a conta restrita"));
  assert.ok(setup.includes("Value.Length -gt 20"));
  assert.ok(setup.includes("^[.\\s]+$"));
});


test("sha256 implementation matches known vector", async () => {
  assert.equal(
    await sha256Text("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("package manifest hashes every generated file except itself", async () => {
  const baseFiles = getBasePackageFiles(defaultConfig);
  const manifest = await buildPackageManifest(defaultConfig, baseFiles, {
    packageId: "test-package",
    generatedAt: "2026-10-06T00:00:00.000Z"
  });

  assert.equal(manifest.packageId, "test-package");
  assert.equal(manifest.packageVersion, "0.8.0");
  assert.equal(manifest.files.length, baseFiles.length);
  assert.equal(manifest.files.some((file) => file.name === "manifest.json"), false);

  const result = await verifyPackageFiles(manifest, baseFiles);
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test("package verifier detects modified content", async () => {
  const baseFiles = getBasePackageFiles(defaultConfig);
  const manifest = await buildPackageManifest(defaultConfig, baseFiles, {
    packageId: "test-tamper",
    generatedAt: "2026-10-06T00:00:00.000Z"
  });

  const changed = baseFiles.map((file) =>
    file.name === "README.txt"
      ? { ...file, content: file.content + "\nALTERADO" }
      : file
  );

  const result = await verifyPackageFiles(manifest, changed);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.name === "README.txt"));
});

test("complete package contains manifest and verifier", async () => {
  const files = await buildWinLabPackageFiles(defaultConfig, {
    packageId: "test-complete",
    generatedAt: "2026-10-06T00:00:00.000Z"
  });

  assert.ok(files.some((file) => file.name === "manifest.json"));
  assert.ok(files.some((file) => file.name === "verify-package.ps1"));
  assert.ok(files.some((file) => file.name === "setup.ps1"));
});

test("mutating scripts check package integrity before apply", () => {
  const setup = generateSetupScript(defaultConfig);
  const rollback = generateRollbackScript(defaultConfig);

  assert.ok(setup.includes("function Assert-WinLabPackageIntegrity"));
  assert.ok(setup.includes("Integridade do pacote: PASS"));
  assert.ok(rollback.includes("Assert-WinLabPackageIntegrity"));
});


test("preflight report parser preserves readiness summary", () => {
  const report = parsePreflightReportJson(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-10-06T18:00:00-03:00",
      computerName: "LAB-01",
      profileName: "Microlins Lab",
      windows: {
        caption: "Windows 11 Pro",
        version: "10.0.26100",
        buildNumber: "26100",
        architecture: "64 bits"
      },
      status: "WARN",
      summary: {
        score: 88,
        pass: 8,
        warn: 2,
        block: 0
      },
      checks: [
        {
          id: "runtime.admin",
          label: "Execução administrativa",
          status: "PASS",
          message: "OK"
        },
        {
          id: "accounts.profile",
          label: "Perfil",
          status: "WARN",
          message: "Primeiro login pendente"
        }
      ]
    })
  );

  assert.equal(report.summary.score, 88);
  assert.equal(report.status, "WARN");
  assert.equal(isPreflightReady(report), true);
});

test("preflight readiness blocks any BLOCK result", () => {
  const report = parsePreflightReportJson(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "",
      computerName: "LAB-BLOCK",
      profileName: "Teste",
      windows: {
        caption: "Windows",
        version: "10",
        buildNumber: "1",
        architecture: "64 bits"
      },
      status: "BLOCK",
      summary: {
        score: 40,
        pass: 1,
        warn: 0,
        block: 1
      },
      checks: [
        {
          id: "runtime.applocker",
          label: "AppLocker",
          status: "BLOCK",
          message: "Ausente"
        }
      ]
    })
  );

  assert.equal(isPreflightReady(report), false);
});

test("standalone preflight is diagnostic-only", () => {
  const script = generatePreflightScript(defaultConfig);

  assert.match(script, /WINLAB PREFLIGHT/);
  assert.match(script, /winlab-preflight-/);
  assert.match(script, /Readiness/);
  assert.match(script, /package\.integrity/);
  assert.doesNotMatch(script, /New-LocalUser/);
  assert.doesNotMatch(script, /Set-AppLockerPolicy\s+-/);
  assert.doesNotMatch(script, /Register-ScheduledTask\s+-/);
  assert.doesNotMatch(script, /Remove-CimInstance/);
});
