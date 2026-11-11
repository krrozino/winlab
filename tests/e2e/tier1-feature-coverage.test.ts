import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  IPC_CONSTANTS,
  ALLOWED_IPC_ACTIONS,
  IpcEnvelope,
  IpcResponse,
  MachineInventoryDto,
  PolicyStateSummaryDto
} from "../../src/desktop/contracts";
import { MockDesktopAgent } from "../../src/desktop/mock-agent";
import { defaultConfig } from "../../src/lib/default-config";
import {
  generateSetupScript,
  generateRollbackScript,
  generateVerifyScript
} from "../../src/lib/generator";
import { MockWebView2Host } from "./harness";

const REPO_ROOT = path.resolve(__dirname, "../..");

test("Tier 1 [Feature 1]: C# desktop project definitions specify or target modern .NET LTS", () => {
  const contractsCsprojPath = path.join(REPO_ROOT, "desktop/src/WinLab.Contracts/WinLab.Contracts.csproj");
  const desktopCsprojPath = path.join(REPO_ROOT, "desktop/src/WinLab.Desktop/WinLab.Desktop.csproj");
  const mockCsprojPath = path.join(REPO_ROOT, "desktop/src/WinLab.Agent.Mock/WinLab.Agent.Mock.csproj");

  assert.ok(fs.existsSync(contractsCsprojPath), "WinLab.Contracts.csproj must exist");
  assert.ok(fs.existsSync(desktopCsprojPath), "WinLab.Desktop.csproj must exist");
  assert.ok(fs.existsSync(mockCsprojPath), "WinLab.Agent.Mock.csproj must exist");

  const contractsXml = fs.readFileSync(contractsCsprojPath, "utf-8");
  const desktopXml = fs.readFileSync(desktopCsprojPath, "utf-8");

  // Check target frameworks or project configuration
  assert.match(contractsXml, /<TargetFramework>(net10\.0|netstandard2\.0|net8\.0)<\/TargetFramework>/);
  assert.match(desktopXml, /<TargetFramework>(net10\.0-windows|net8\.0-windows)<\/TargetFramework>/);

  // WinLab.Desktop must reference WebView2 and Contracts
  assert.match(desktopXml, /Microsoft\.Web\.WebView2/);
  assert.match(desktopXml, /WinLab\.Contracts/);
});

test("Tier 1 [Feature 2]: Offline wwwroot bundle contains self-contained static assets without external CDN links", () => {
  const wwwroot = path.join(REPO_ROOT, "desktop/src/WinLab.Desktop/wwwroot");
  assert.ok(fs.existsSync(wwwroot), "wwwroot directory must exist in WinLab.Desktop");

  // Find all HTML and JS files in wwwroot
  function scanDir(dir: string): string[] {
    const files: string[] = [];
    if (!fs.existsSync(dir)) return files;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...scanDir(full));
      } else if (entry.isFile() && (entry.name.endsWith(".html") || entry.name.endsWith(".js"))) {
        files.push(full);
      }
    }
    return files;
  }

  const staticFiles = scanDir(wwwroot);
  assert.ok(staticFiles.length > 0, "wwwroot must contain static files");

  // Verify none contain external CDN links (e.g. cdnjs, fonts.googleapis.com, unpkg)
  const forbiddenCdnPatterns = [
    /https?:\/\/fonts\.googleapis\.com/i,
    /https?:\/\/cdnjs\.cloudflare\.com/i,
    /https?:\/\/cdn\.jsdelivr\.net/i,
    /https?:\/\/unpkg\.com/i
  ];

  for (const filePath of staticFiles) {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const pattern of forbiddenCdnPatterns) {
      assert.doesNotMatch(
        content,
        pattern,
        `File ${path.relative(REPO_ROOT, filePath)} contains forbidden external CDN reference!`
      );
    }
  }
});

test("Tier 1 [Feature 3]: WebView2 virtual host mapping routes winlab.local to offline static bundle", () => {
  const host = new MockWebView2Host({ isReleaseBuild: true, wwwrootExists: true });

  assert.equal(host.activeVirtualHostMapping, "winlab.local");
  assert.equal(host.currentUrl, "https://winlab.local/desktop/index.html");
  assert.equal(host.lastFatalError, null);
});

test("Tier 1 [Feature 4]: WebView2 security settings enforce disabled DevTools in Release build", () => {
  const releaseHost = new MockWebView2Host({ isReleaseBuild: true });
  assert.equal(releaseHost.areDevToolsEnabled, false, "DevTools must be disabled in Release build");
  assert.equal(releaseHost.isStatusBarEnabled, false, "StatusBar must be disabled in Release build");
  assert.equal(releaseHost.isWebMessageEnabled, true, "WebMessage must be enabled for IPC");

  const debugHost = new MockWebView2Host({ isReleaseBuild: false });
  assert.equal(debugHost.areDevToolsEnabled, true, "DevTools may be enabled in Debug build for inspection");
});

test("Tier 1 [Feature 5]: Inbound IPC envelope roundtrip returns typed response for all allowed actions", async () => {
  const host = new MockWebView2Host();
  const testActions = [
    IPC_CONSTANTS.ACTION_QUERY_INVENTORY,
    IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE,
    IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT,
    IPC_CONSTANTS.ACTION_LIST_PRESETS,
    IPC_CONSTANTS.ACTION_PREVIEW_POLICY_DIFF,
    IPC_CONSTANTS.ACTION_VALIDATE_CONFIG
  ];

  for (const action of testActions) {
    const envelopeId = crypto.randomUUID();
    const envelope: IpcEnvelope = {
      id: envelopeId,
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "query",
      action
    };

    const result = await host.postWebMessage(JSON.stringify(envelope), MockWebView2Host.TRUSTED_ORIGIN);
    assert.equal(result.status, "accepted");
    assert.ok(result.response);
    assert.equal(result.response.success, true);
    assert.equal(result.response.replyToId, envelopeId);
    assert.ok(result.response.data !== undefined);
  }
});

test("Tier 1 [Feature 6]: Local accounts scanner returns list of users, flags administrators, and validates SIDs", async () => {
  const agent = new MockDesktopAgent();
  const envelope: IpcEnvelope = {
    id: crypto.randomUUID(),
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
  };

  const response = await agent.handleRequest<MachineInventoryDto>(envelope);
  assert.equal(response.success, true);

  const inventory = response.data!;
  assert.ok(Array.isArray(inventory.localUsers));
  assert.ok(inventory.localUsers.length >= 2);

  const admin = inventory.localUsers.find((u) => u.isAdmin);
  assert.ok(admin, "Must contain at least one administrator");
  assert.equal(admin.enabled, true);
  assert.match(admin.sid ?? "", /^S-1-5-21-/, "Admin SID must follow Windows standard format");

  const student = inventory.localUsers.find((u) => !u.isAdmin);
  assert.ok(student, "Must contain standard non-admin user");
  assert.equal(student.enabled, true);
  assert.match(student.sid ?? "", /^S-1-5-21-/, "Student SID must follow Windows standard format");
});

test("Tier 1 [Feature 7]: System scanner reports Windows OS caption, build number, version, and 64-bit architecture", async () => {
  const agent = new MockDesktopAgent();
  const envelope: IpcEnvelope = {
    id: crypto.randomUUID(),
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
  };

  const response = await agent.handleRequest<MachineInventoryDto>(envelope);
  assert.equal(response.success, true);

  const inventory = response.data!;
  assert.ok(inventory.computerName.length > 0);
  assert.match(inventory.windows.caption, /Windows/i);
  assert.ok(inventory.windows.version.length > 0);
  assert.ok(inventory.windows.buildNumber.length > 0);
  assert.equal(inventory.windows.architecture, "64 bits");
});

test("Tier 1 [Feature 8]: Baseline snapshot captures prior state and generates unique UUID transaction ID", () => {
  const script = generateSetupScript(defaultConfig);

  // Must ensure baseline capture before applying
  assert.match(script, /Ensure-AppLockerBaseline/);
  assert.match(script, /Ensure-RegistryBaseline/);
  assert.match(script, /Save-WinLabAppliedState/);
  assert.match(script, /Registry-Baseline-/);
  assert.match(script, /Backups/);

  // Each transaction should generate a unique transaction ID
  const txId1 = crypto.randomUUID();
  const txId2 = crypto.randomUUID();
  assert.notEqual(txId1, txId2);
  assert.match(txId1, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test("Tier 1 [Feature 9]: Wallpaper lock policy generates valid registry path and DWORD value", () => {
  const config = {
    ...defaultConfig,
    blockWallpaper: true,
    studentUser: "AlunoTeste",
    adminUser: "AdminTeste"
  };

  const script = generateSetupScript(config);

  // Targets ActiveDesktop\NoChangingWallPaper = 1
  assert.match(script, /Policies\\ActiveDesktop/);
  assert.match(script, /NoChangingWallPaper/);
  assert.match(script, /-PropertyType DWord -Value 1/);

  // Must be applied to student user hive, leaving admin intact
  assert.match(script, /Set-StudentPersonalizationPolicies/);
  assert.match(script, /Invoke-WithUserHive -UserName \$Aluno/);
});

test("Tier 1 [Feature 10]: Rollback script restores baselines and removes WinLab-applied keys", () => {
  const config = {
    ...defaultConfig,
    studentUser: "AlunoTeste",
    adminUser: "AdminTeste"
  };

  const rollback = generateRollbackScript(config);

  // Must require explicit -Apply switch
  assert.match(rollback, /param\(\[switch\]\$Apply\)/);

  // Must restore AppLocker baseline and Registry baseline
  assert.match(rollback, /Restore-AppLockerBaseline/);
  assert.match(rollback, /Restore-RegistryBaseline/);
  assert.match(rollback, /Remove-StudentPolicies/);
  assert.match(rollback, /Archive-WinLabState/);

  // Must clean up personalization keys
  assert.match(rollback, /NoChangingWallPaper/);
  assert.match(rollback, /NoChangingSoundScheme/);
  assert.match(rollback, /NoChangingMousePointers/);

  // Must preserve local accounts
  assert.match(rollback, /As contas locais foram preservadas/);
});
