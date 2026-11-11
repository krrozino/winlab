import test from "node:test";
import assert from "node:assert/strict";

import { getPreset } from "../../src/lib/presets";
import { getConfigErrors } from "../../src/lib/validation";
import {
  generateSetupScript,
  generateRollbackScript,
  generateUnlockWallpaperScript,
  generateVerifyScript
} from "../../src/lib/generator";
import {
  buildPackageManifest,
  getBasePackageFiles,
  verifyPackageFiles
} from "../../src/lib/package-integrity";
import {
  PolicyEngineSimulator,
  TriStatePolicyRecord,
  DesiredState
} from "./harness";

test("Tier 4 [Scenario 1]: Microlins Lab Setup simulation restricts Aluno while preserving Administrador", async () => {
  // 1. Select Microlins preset
  const config = getPreset("microlins");
  assert.equal(config.profileName, "Microlins Lab");
  assert.equal(config.studentUser, "Aluno");
  assert.equal(config.adminUser, "MicrolinsAdmin");
  assert.equal(config.enforcementMode, "AuditOnly");

  // Validate configuration passes strict validation
  const errors = getConfigErrors(config);
  assert.deepEqual(errors, []);

  // 2. Generate setup script
  const setupScript = generateSetupScript(config);

  // Verifies account setup: Aluno is in Users group, Admin is in Admins group
  assert.match(setupScript, /New-LocalUser -Name \$Admin/);
  assert.match(setupScript, /Add-LocalGroupMember -Group \(Get-AdminsGroup\) -Member \$Admin/);
  assert.match(setupScript, /New-LocalUser -Name \$Aluno/);
  assert.match(setupScript, /Remove-LocalGroupMember -Group \(Get-AdminsGroup\) -Member \$Aluno/);
  assert.match(setupScript, /Add-LocalGroupMember -Group \(Get-UsersGroup\) -Member \$Aluno/);

  // Verifies restricted policies for student:
  assert.match(setupScript, /IncognitoModeAvailability/);
  assert.match(setupScript, /NoChangingWallPaper/);
  assert.match(setupScript, /Deny_Write/);
  assert.match(setupScript, /Deny_Read/);

  // AppLocker rules must allow all executables for Administrators (S-1-5-32-544)
  assert.match(setupScript, /UserOrGroupSid="\$adminsSid" Action="Allow"/);
  assert.match(setupScript, /Administradores - todos executáveis/);

  // 3. Build complete package files and verify SHA-256 integrity
  const baseFiles = getBasePackageFiles(config);
  const manifest = await buildPackageManifest(config, baseFiles, {
    channel: "standard",
    packageId: "microlins-setup-pkg"
  });

  const integrity = await verifyPackageFiles(manifest, baseFiles);
  assert.equal(integrity.ok, true, "Package files must have 100% SHA-256 integrity");
  assert.deepEqual(integrity.failures, []);
});

test("Tier 4 [Scenario 2]: Teacher Maintenance Emergency Rollback restores baselines and unregisters tasks", () => {
  const config = getPreset("microlins");
  const rollbackScript = generateRollbackScript(config);

  // 1. Requires explicit -Apply parameter for safety
  assert.match(rollbackScript, /param\(\[switch\]\$Apply\)/);

  // 2. Restores AppLocker and Registry baselines
  assert.match(rollbackScript, /Restore-AppLockerBaseline -State \$state/);
  assert.match(rollbackScript, /Restore-RegistryBaseline -State \$state/);

  // 3. Removes student restriction keys
  assert.match(rollbackScript, /Remove-StudentPolicies/);

  // 4. Cleans up any scheduled tasks and deferred scripts
  assert.match(rollbackScript, /Unregister-ScheduledTask -TaskName \$DeferredTaskName/);
  assert.match(rollbackScript, /Remove-Item -Path \(Join-Path \$WinLabRoot "setup-deferred\.ps1"\)/);

  // 5. Preserves user accounts
  assert.match(rollbackScript, /Rollback WinLab concluído\. As contas locais foram preservadas\./);

  // 6. Archives state for post-mortem auditing
  assert.match(rollbackScript, /Archive-WinLabState -State \$state/);
  assert.match(rollbackScript, /state-rollback-\$stamp\.json/);

  // Simulate rollback in engine
  const engine = new PolicyEngineSimulator([
    {
      id: "personalization.wallpaper",
      name: "Papel de Parede",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "Blocked",
      effectiveState: "Applied",
      requiresLogoff: true,
      requiresRestart: false
    },
    {
      id: "browser.incognito",
      name: "Modo Anônimo",
      category: "Navegadores",
      desiredState: "Blocked",
      configuredState: "Blocked",
      effectiveState: "Applied",
      requiresLogoff: false,
      requiresRestart: false
    }
  ]);

  const rollbackResult = engine.executeRollback(crypto.randomUUID());
  assert.equal(rollbackResult.success, true);
  assert.equal(rollbackResult.revertedPolicies.length, 2);
  assert.equal(engine.getPolicy("personalization.wallpaper")?.effectiveState, "Reverted");
  assert.equal(engine.getPolicy("browser.incognito")?.effectiveState, "Reverted");
});

test("Tier 4 [Scenario 3]: Offline Clean-Machine Installation & Launch validates self-contained package execution", async () => {
  const config = getPreset("microlins");
  const files = getBasePackageFiles(config);

  // Package must include all necessary administrative and diagnostic scripts
  const fileNames = files.map((f) => f.name);
  assert.ok(fileNames.includes("setup.ps1"), "Must include setup.ps1");
  assert.ok(fileNames.includes("rollback.ps1"), "Must include rollback.ps1");
  assert.ok(fileNames.includes("verify.ps1"), "Must include verify.ps1");
  assert.ok(fileNames.includes("preflight.ps1"), "Must include preflight.ps1");
  assert.ok(fileNames.includes("scan-pc.ps1"), "Must include scan-pc.ps1");
  assert.ok(fileNames.includes("liberar-wallpaper.ps1"), "Must include liberar-wallpaper.ps1");
  assert.ok(fileNames.includes("verify-package.ps1"), "Must include verify-package.ps1");

  // Verify that scripts do not attempt to contact external networks or download remote payloads
  const remoteDownloadPatterns = [
    /Invoke-WebRequest/i,
    /Net\.WebClient/i,
    /Start-BitsTransfer/i,
    /curl\s/i,
    /wget\s/i
  ];

  for (const file of files) {
    for (const pattern of remoteDownloadPatterns) {
      assert.doesNotMatch(
        file.content,
        pattern,
        `Script ${file.name} must not make remote network downloads in offline mode!`
      );
    }
  }
});

test("Tier 4 [Scenario 4]: Temporary Wallpaper Unlock lifecycle manages unlock duration and scheduled auto-relock", () => {
  const config = {
    ...getPreset("microlins"),
    wallpaperUnlockMinutes: 60
  };

  const unlockScript = generateUnlockWallpaperScript(config);

  // 1. Sets unlock duration
  assert.match(unlockScript, /\$Minutos = 60/);

  // 2. Unlocks wallpaper (sets NoChangingWallPaper = 0)
  assert.match(unlockScript, /Set-WallpaperLock -Value 0/);

  // 3. Creates relock script and scheduled task
  assert.match(unlockScript, /Rebloquear-Wallpaper\.ps1/);
  assert.match(unlockScript, /\$taskName = "WinLab-Rebloquear-Wallpaper"/);
  assert.match(unlockScript, /New-ScheduledTaskTrigger -Once -At \$when/);
  assert.match(unlockScript, /NoChangingWallPaper -PropertyType DWord -Value 1/);

  // 4. Verifies sound scheme and pointer locks remain active during wallpaper unlock
  assert.match(unlockScript, /Ponteiro e esquema de sons continuam bloqueados/);

  // Lifecycle state transitions
  interface TemporaryUnlockState {
    status: "Applied" | "TemporarilyUnlocked" | "ReLocked";
    unlockedAt: string;
    expiresAt: string;
    durationMinutes: number;
  }

  const now = new Date();
  const expires = new Date(now.getTime() + 60 * 60 * 1000);

  const unlockState: TemporaryUnlockState = {
    status: "TemporarilyUnlocked",
    unlockedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    durationMinutes: 60
  };

  assert.equal(unlockState.status, "TemporarilyUnlocked");
  assert.equal(unlockState.durationMinutes, 60);

  // Simulate expiration check
  function checkExpiration(state: TemporaryUnlockState, currentTime: Date): TemporaryUnlockState {
    if (currentTime >= new Date(state.expiresAt)) {
      return {
        ...state,
        status: "ReLocked"
      };
    }
    return state;
  }

  // Before expiry: remains TemporarilyUnlocked
  const beforeExpiry = checkExpiration(unlockState, new Date(now.getTime() + 30 * 60 * 1000));
  assert.equal(beforeExpiry.status, "TemporarilyUnlocked");

  // After expiry: transitions to ReLocked
  const afterExpiry = checkExpiration(unlockState, new Date(now.getTime() + 61 * 60 * 1000));
  assert.equal(afterExpiry.status, "ReLocked");
});

test("Tier 4 [Scenario 5]: External Drift Recovery identifies altered policies and generates targeted elevated remediation", () => {
  const policies: TriStatePolicyRecord[] = [
    {
      id: "personalization.wallpaper",
      name: "Papel de Parede",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "Blocked",
      effectiveState: "Applied",
      requiresLogoff: true,
      requiresRestart: false
    },
    {
      id: "system.powershell",
      name: "Bloqueio do PowerShell",
      category: "Sistema",
      desiredState: "Blocked",
      configuredState: "Blocked",
      effectiveState: "Applied",
      requiresLogoff: false,
      requiresRestart: false
    }
  ];

  const engine = new PolicyEngineSimulator(policies);

  // Live state: PowerShell was unlocked by external user
  const liveState = new Map<string, DesiredState>([
    ["personalization.wallpaper", "Blocked"],
    ["system.powershell", "NotConfigured"] // Drifted!
  ]);

  const driftScan = engine.detectDrift(liveState);
  assert.equal(driftScan.driftedCount, 1);
  assert.equal(driftScan.driftedPolicies[0].id, "system.powershell");

  // Remediation: Admin triggers elevated re-apply
  const remediationResult = engine.applyBatch(["system.powershell"]);
  assert.equal(remediationResult.success, true);
  assert.equal(engine.getPolicy("system.powershell")?.effectiveState, "Applied");
  assert.equal(engine.getPolicy("personalization.wallpaper")?.effectiveState, "Applied");
});
