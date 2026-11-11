import test from "node:test";
import assert from "node:assert/strict";

import { IPC_CONSTANTS, IpcEnvelope } from "../src/desktop/contracts";
import { MockDesktopAgent } from "../src/desktop/mock-agent";
import { MILESTONE_3_POLICIES, getPolicyDefinition } from "../src/lib/policies";

test("Milestone 3 Policy Catalog defines exactly 5 core policies with full metadata", () => {
  assert.equal(MILESTONE_3_POLICIES.length, 5);

  const expectedIds = [
    "personalization.wallpaper",
    "personalization.sounds",
    "personalization.mouse_pointers",
    "browser.chrome.incognito",
    "browser.chrome.guest"
  ];

  for (const id of expectedIds) {
    const policy = getPolicyDefinition(id);
    assert.ok(policy, `Policy ${id} must exist in catalog`);
    assert.equal(policy.id, id);
    assert.equal(policy.riskLevel, "Low");
    assert.equal(policy.reversible, true);
    assert.ok(policy.name.length > 0);
    assert.ok(policy.description.length > 0);
  }

  // Feature 18: Wallpaper lock requires logoff
  const wallpaper = getPolicyDefinition("personalization.wallpaper")!;
  assert.equal(wallpaper.scope, "User");
  assert.equal(wallpaper.requiresLogoff, true);
  assert.equal(wallpaper.requiresAppRestart, false);
  assert.equal(wallpaper.primaryProbe.valueName, "NoChangingWallPaper");
  assert.equal(wallpaper.primaryProbe.expectedValue, 1);

  // Feature 19: Sounds lock
  const sounds = getPolicyDefinition("personalization.sounds")!;
  assert.equal(sounds.scope, "User");
  assert.equal(sounds.requiresLogoff, false);
  assert.equal(sounds.requiresAppRestart, false);
  assert.equal(sounds.primaryProbe.valueName, "NoChangingSoundScheme");
  assert.equal(sounds.primaryProbe.expectedValue, 1);

  // Feature 20: Mouse pointers lock
  const mouse = getPolicyDefinition("personalization.mouse_pointers")!;
  assert.equal(mouse.scope, "User");
  assert.equal(mouse.requiresLogoff, false);
  assert.equal(mouse.requiresAppRestart, false);
  assert.equal(mouse.primaryProbe.valueName, "NoChangingMousePointers");
  assert.equal(mouse.primaryProbe.expectedValue, 1);

  // Feature 21: Chrome incognito lock requires app restart and covers Chrome & Edge
  const incognito = getPolicyDefinition("browser.chrome.incognito")!;
  assert.equal(incognito.scope, "Machine");
  assert.equal(incognito.requiresAppRestart, true);
  assert.equal(incognito.primaryProbe.valueName, "IncognitoModeAvailability");
  assert.equal(incognito.primaryProbe.expectedValue, 1);
  assert.ok(incognito.counterpartProbe);
  assert.equal(incognito.counterpartProbe.valueName, "InPrivateModeAvailability");
  assert.equal(incognito.counterpartProbe.expectedValue, 1);

  // Feature 22: Chrome guest mode lock requires app restart and covers Chrome & Edge
  const guest = getPolicyDefinition("browser.chrome.guest")!;
  assert.equal(guest.scope, "Machine");
  assert.equal(guest.requiresAppRestart, true);
  assert.equal(guest.primaryProbe.valueName, "BrowserGuestModeEnabled");
  assert.equal(guest.primaryProbe.expectedValue, 0);
  assert.ok(guest.counterpartProbe);
  assert.equal(guest.counterpartProbe.valueName, "BrowserGuestModeEnabled");
  assert.equal(guest.counterpartProbe.expectedValue, 0);
});

test("MockDesktopAgent responds to policy.query_catalog with 5 policies", async () => {
  const agent = new MockDesktopAgent();
  const envelope: IpcEnvelope = {
    id: "req-cat-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_POLICY_CATALOG
  };

  const res = await agent.handleRequest(envelope);
  assert.equal(res.success, true);
  assert.equal(res.replyToId, "req-cat-1");

  const catalog = res.data as any[];
  assert.equal(catalog.length, 5);
  assert.ok(catalog.some((p) => p.id === "personalization.wallpaper"));
  assert.ok(catalog.some((p) => p.id === "browser.chrome.incognito"));
});

test("MockDesktopAgent responds to policy.query_states with initial NotConfigured states", async () => {
  const agent = new MockDesktopAgent();
  const envelope: IpcEnvelope = {
    id: "req-states-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES
  };

  const res = await agent.handleRequest(envelope);
  assert.equal(res.success, true);

  const summary = res.data as any;
  assert.equal(summary.totalPolicies, 5);
  assert.equal(summary.appliedCount, 0);
  assert.equal(summary.notConfiguredCount, 5);
  assert.equal(summary.pendingCount, 0);
  assert.equal(summary.items.length, 5);
});

test("MockDesktopAgent executes apply_transaction and rollback_transaction cycle", async () => {
  const agent = new MockDesktopAgent();

  // 1. Apply transaction
  const txId = "tx-m3-test-1001";
  const applyEnvelope: IpcEnvelope = {
    id: "req-apply-tx-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
    payload: {
      transactionId: txId,
      targetUserName: "Aluno",
      targetUserSid: "S-1-5-21-123456789-1002",
      policies: [
        { policyId: "personalization.wallpaper", desiredState: "Blocked" },
        { policyId: "browser.chrome.incognito", desiredState: "Blocked" }
      ]
    }
  };

  const applyRes = await agent.handleRequest(applyEnvelope);
  assert.equal(applyRes.success, true);
  const applyData = applyRes.data as any;
  assert.equal(applyData.transactionId, txId);
  assert.equal(applyData.status, "Committed");
  assert.equal(applyData.appliedCount, 2);

  // 2. Query states reflects applied policies
  const queryEnvelope: IpcEnvelope = {
    id: "req-states-2",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES
  };

  const statesRes = await agent.handleRequest(queryEnvelope);
  const statesData = statesRes.data as any;
  assert.equal(statesData.appliedCount, 2);
  assert.equal(statesData.notConfiguredCount, 3);

  // 3. Query transaction status
  const statusEnvelope: IpcEnvelope = {
    id: "req-status-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_TRANSACTION_STATUS,
    payload: { transactionId: txId }
  };

  const statusRes = await agent.handleRequest(statusEnvelope);
  assert.equal(statusRes.success, true);
  const statusData = statusRes.data as any;
  assert.equal(statusData.status, "Committed");

  // 4. Rollback transaction
  const rollbackEnvelope: IpcEnvelope = {
    id: "req-rollback-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_ROLLBACK_TRANSACTION,
    payload: { transactionId: txId }
  };

  const rollbackRes = await agent.handleRequest(rollbackEnvelope);
  assert.equal(rollbackRes.success, true);
  const rollbackData = rollbackRes.data as any;
  assert.equal(rollbackData.status, "RolledBack");
  assert.equal(rollbackData.restoredCount, 2);

  // 5. Query states confirms restoration to NotConfigured
  const afterRollbackStates = await agent.handleRequest(queryEnvelope);
  const afterData = afterRollbackStates.data as any;
  assert.equal(afterData.appliedCount, 0);
  assert.equal(afterData.notConfiguredCount, 5);
});

test("MockDesktopAgent enforces Administrator Immunity Guard on apply_transaction", async () => {
  const agent = new MockDesktopAgent();

  const adminEnvelope: IpcEnvelope = {
    id: "req-admin-immunity-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
    payload: {
      transactionId: "tx-admin-reject",
      targetUserName: "Administrador",
      targetUserSid: "S-1-5-32-544",
      policies: [{ policyId: "personalization.wallpaper", desiredState: "Blocked" }]
    }
  };

  const res = await agent.handleRequest(adminEnvelope);
  assert.equal(res.success, false);
  assert.equal(res.errorCode, "ADMIN_IMMUNITY_VIOLATION");
  assert.match(res.error ?? "", /Contas de Administrador possuem imunidade/);

  // Whitespace-padded administrator name and RID 500
  const paddedAdminRes = await agent.handleRequest({
    ...adminEnvelope,
    id: "req-admin-padded",
    payload: {
      targetUserName: "  Administrator  ",
      policies: [{ policyId: "personalization.wallpaper", desiredState: "Blocked" }]
    }
  });
  assert.equal(paddedAdminRes.success, false);
  assert.equal(paddedAdminRes.errorCode, "ADMIN_IMMUNITY_VIOLATION");

  const rid500Res = await agent.handleRequest({
    ...adminEnvelope,
    id: "req-admin-rid500",
    payload: {
      targetUserSid: "  S-1-5-21-123456789-500  ",
      policies: [{ policyId: "personalization.wallpaper", desiredState: "Blocked" }]
    }
  });
  assert.equal(rid500Res.success, false);
  assert.equal(rid500Res.errorCode, "ADMIN_IMMUNITY_VIOLATION");

  // Non-existent transaction query returns TRANSACTION_NOT_FOUND
  const notFoundRes = await agent.handleRequest({
    id: "req-tx-not-found",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_TRANSACTION_STATUS,
    payload: { transactionId: "non-existent-uuid" }
  });
  assert.equal(notFoundRes.success, false);
  assert.equal(notFoundRes.errorCode, "TRANSACTION_NOT_FOUND");
});

test("MockDesktopAgent browser process detection lifecycle: PendingAppRestart -> Applied", async () => {
  const agent = new MockDesktopAgent();

  // 1. Simulate browser process is running (chrome.exe / msedge.exe)
  agent.setBrowserRunning(true);

  // 2. Apply transaction with browser policies to Aluno
  const applyRes = await agent.handleRequest({
    id: "req-apply-browser-1",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
    payload: {
      transactionId: "tx-browser-restart-lifecycle",
      targetUserName: "Aluno",
      targetUserSid: "S-1-5-21-999-1002",
      policies: [
        { policyId: "browser.chrome.incognito", desiredState: "Blocked" },
        { policyId: "browser.chrome.guest", desiredState: "Blocked" }
      ]
    }
  });
  assert.equal(applyRes.success, true);

  // 3. Query states: browser policies must report PendingAppRestart, not Applied
  const statesWhileRunning = await agent.handleRequest({
    id: "req-states-running",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES
  });
  assert.equal(statesWhileRunning.success, true);
  const dataWhileRunning = statesWhileRunning.data as any;

  const incognitoItem = dataWhileRunning.items.find((i: any) => i.id === "browser.chrome.incognito");
  assert.ok(incognitoItem);
  assert.equal(incognitoItem.effectiveState, "PendingAppRestart");

  const guestItem = dataWhileRunning.items.find((i: any) => i.id === "browser.chrome.guest");
  assert.ok(guestItem);
  assert.equal(guestItem.effectiveState, "PendingAppRestart");

  // 4. Simulate browser processes terminating (browser closed)
  agent.setBrowserRunning(false);

  // 5. Query states: browser policies transition to Applied
  const statesAfterClose = await agent.handleRequest({
    id: "req-states-closed",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES
  });
  assert.equal(statesAfterClose.success, true);
  const dataAfterClose = statesAfterClose.data as any;

  const incognitoAfter = dataAfterClose.items.find((i: any) => i.id === "browser.chrome.incognito");
  assert.equal(incognitoAfter.effectiveState, "Applied");

  const guestAfter = dataAfterClose.items.find((i: any) => i.id === "browser.chrome.guest");
  assert.equal(guestAfter.effectiveState, "Applied");
});

test("MockDesktopAgent handles adversarial unexpected inputs and malformed payloads", async () => {
  const agent = new MockDesktopAgent();

  // 1. Completely empty object
  const emptyRes = await agent.handleRequest({} as any);
  assert.equal(emptyRes.success, false);
  assert.equal(emptyRes.errorCode, "INVALID_ENVELOPE_ID");

  // 2. Null payload on apply transaction
  const nullPayloadRes = await agent.handleRequest({
    id: "req-null-payload",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
    payload: null
  });
  assert.equal(nullPayloadRes.success, true); // Safely handles empty/null payload as 0 policies

  // 3. Payload containing forbidden command property
  const forbiddenFieldRes = await agent.handleRequest({
    id: "req-forbidden-field",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
    payload: {
      script: "Get-Process",
      policies: []
    }
  });
  assert.equal(forbiddenFieldRes.success, false);
  assert.equal(forbiddenFieldRes.errorCode, "FORBIDDEN_COMMAND_FIELD");

  // 4. Unknown IPC action
  const unknownActionRes = await agent.handleRequest({
    id: "req-unknown-action",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: "policy.destroy_everything"
  });
  assert.equal(unknownActionRes.success, false);
  assert.equal(unknownActionRes.errorCode, "UNAUTHORIZED_ACTION");
});
