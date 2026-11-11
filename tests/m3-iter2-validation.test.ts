import test from "node:test";
import assert from "node:assert/strict";

import { IPC_CONSTANTS, IpcEnvelope } from "../src/desktop/contracts";
import { MockDesktopAgent } from "../src/desktop/mock-agent";

const VALID_USER = {
  targetUserName: "Aluno",
  targetUserSid: "S-1-5-21-999-1002"
};

function applyEnvelope(
  id: string,
  policies: unknown,
  overrides: Record<string, unknown> = {}
): IpcEnvelope {
  return {
    id,
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
    payload: {
      transactionId: `tx-validation-${id}`,
      ...VALID_USER,
      ...(policies === undefined ? {} : { policies }),
      ...overrides
    }
  };
}

async function queryStates(agent: MockDesktopAgent): Promise<any> {
  const res = await agent.handleRequest({
    id: `req-states-${Math.random()}`,
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES
  });
  assert.equal(res.success, true);
  return res.data as any;
}

test("invalid DesiredState values are rejected with zero state mutations (mock/real parity)", async () => {
  const invalidValues = [
    "Restrict",
    "Enforce",
    "Applied",
    "Drifted",
    "PendingLogoff",
    "Reverted",
    "1",
    "2",
    "99",
    1,
    2,
    "BLOCKED!",
    " blocked ",
    "",
    "   ",
    null,
    undefined
  ];

  for (const desired of invalidValues) {
    const agent = new MockDesktopAgent();
    const res = await agent.handleRequest(
      applyEnvelope(`req-invalid-${String(desired)}-${Math.random()}`, [
        { policyId: "personalization.wallpaper", desiredState: desired }
      ])
    );

    assert.equal(res.success, false, `desiredState ${JSON.stringify(desired)} must be rejected`);
    assert.ok(res.error, "controlled failure must carry a message");
    assert.ok(res.errorCode, "controlled failure must carry an error code");

    const states = await queryStates(agent);
    assert.equal(states.appliedCount, 0, `no policy may be applied for ${JSON.stringify(desired)}`);
    assert.equal(states.notConfiguredCount, 5);
  }
});

test("operational states sent as DesiredState are rejected, never converted to Blocked", async () => {
  const operationalStates = ["Applied", "PendingLogoff", "PendingReboot", "Drifted", "Failed", "Reverted"];

  for (const state of operationalStates) {
    const agent = new MockDesktopAgent();
    const res = await agent.handleRequest(
      applyEnvelope(`req-operational-${state}`, [
        { policyId: "personalization.wallpaper", desiredState: state }
      ])
    );

    assert.equal(res.success, false, `operational state ${state} must not be an application intent`);
    const states = await queryStates(agent);
    assert.equal(states.appliedCount, 0);
    const item = states.items.find((i: any) => i.id === "personalization.wallpaper");
    assert.equal(item.desiredState, "NotConfigured", "desired state must remain untouched");
  }
});

test("Allowed DesiredState is fail-closed pending contract decision (mock/real parity)", async () => {
  const agent = new MockDesktopAgent();

  const res = await agent.handleRequest(
    applyEnvelope("req-allowed-1", [
      { policyId: "personalization.wallpaper", desiredState: "Allowed" }
    ])
  );

  assert.equal(res.success, false);
  assert.match(res.error ?? "", /CONTRACT DECISION REQUIRED/);
  assert.equal(res.errorCode, "UNSUPPORTED_DESIRED_STATE");

  const states = await queryStates(agent);
  assert.equal(states.appliedCount, 0);
  assert.equal(states.notConfiguredCount, 5);
});

test("missing, null, empty or malformed policies list is rejected without committing a transaction", async () => {
  const variants: Array<[string, unknown]> = [
    ["missing", undefined],
    ["null", null],
    ["empty", []],
    ["string", "personalization.wallpaper"],
    ["object", { policyId: "personalization.wallpaper" }]
  ];

  for (const [label, policies] of variants) {
    const agent = new MockDesktopAgent();
    const res = await agent.handleRequest(applyEnvelope(`req-list-${label}`, policies));

    assert.equal(res.success, false, `policies list variant '${label}' must be rejected`);
    assert.equal(res.errorCode, "INVALID_POLICY_REQUEST");

    const status = await agent.handleRequest({
      id: `req-status-${label}`,
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "query",
      action: IPC_CONSTANTS.ACTION_QUERY_TRANSACTION_STATUS,
      payload: { transactionId: `tx-validation-req-list-${label}` }
    });
    assert.equal(status.success, false, `no transaction may be committed for variant '${label}'`);
  }
});

test("null or malformed policy items are rejected without partial application", async () => {
  const variants: Array<[string, unknown[]]> = [
    ["null-item", [null]],
    ["non-object-item", ["personalization.wallpaper"]],
    ["missing-policyid", [{ desiredState: "Blocked" }]],
    ["empty-policyid", [{ policyId: "   ", desiredState: "Blocked" }]],
    ["unknown-policyid", [{ policyId: "invalid.policy.id", desiredState: "Blocked" }]]
  ];

  for (const [label, policies] of variants) {
    const agent = new MockDesktopAgent();
    const res = await agent.handleRequest(applyEnvelope(`req-item-${label}`, policies));

    assert.equal(res.success, false, `policy item variant '${label}' must be rejected`);
    assert.equal(res.errorCode, "INVALID_POLICY_REQUEST");

    const states = await queryStates(agent);
    assert.equal(states.appliedCount, 0, `zero mutations expected for variant '${label}'`);
    assert.equal(states.notConfiguredCount, 5);
  }
});

test("mixed list with valid first item and invalid second item applies nothing (atomic validation)", async () => {
  const agent = new MockDesktopAgent();

  const res = await agent.handleRequest(
    applyEnvelope("req-mixed-1", [
      { policyId: "personalization.wallpaper", desiredState: "Blocked" },
      { policyId: "personalization.sounds", desiredState: "Restrict" }
    ])
  );

  assert.equal(res.success, false);
  assert.equal(res.errorCode, "INVALID_POLICY_REQUEST");

  const states = await queryStates(agent);
  assert.equal(states.appliedCount, 0, "first valid item must NOT be applied when a later item is invalid");
  assert.equal(states.notConfiguredCount, 5);
});

test("case-insensitive supported names remain accepted and normalized", async () => {
  const agent = new MockDesktopAgent();

  const res = await agent.handleRequest(
    applyEnvelope("req-case-1", [
      { policyId: "personalization.wallpaper", desiredState: "blocked" },
      { policyId: "personalization.sounds", desiredState: "NOTCONFIGURED" }
    ])
  );

  assert.equal(res.success, true);
  const data = res.data as any;
  assert.equal(data.status, "Committed");
  assert.equal(data.appliedCount, 2);

  const states = await queryStates(agent);
  const wallpaper = states.items.find((i: any) => i.id === "personalization.wallpaper");
  assert.equal(wallpaper.desiredState, "Blocked");
  const sounds = states.items.find((i: any) => i.id === "personalization.sounds");
  assert.equal(sounds.desiredState, "NotConfigured");
});

test("composed enum names are rejected, never parsed into a valid desired state (mock/real parity)", async () => {
  const composedValues = ["Blocked,NotConfigured", "NotConfigured,Blocked", "Blocked,Blocked"];

  for (const desired of composedValues) {
    const agent = new MockDesktopAgent();
    const res = await agent.handleRequest(
      applyEnvelope(`req-composed-${Math.random()}`, [
        { policyId: "personalization.wallpaper", desiredState: desired }
      ])
    );

    assert.equal(res.success, false, `composed desiredState '${desired}' must be rejected`);
    assert.equal(res.errorCode, "INVALID_POLICY_REQUEST");

    const states = await queryStates(agent);
    assert.equal(states.appliedCount, 0, `no policy may be applied for composed desiredState '${desired}'`);
    assert.equal(states.notConfiguredCount, 5);
  }
});

test("padded policyId is rejected without silent trimming (mock/real parity)", async () => {
  const paddedIds = [" personalization.wallpaper", "personalization.wallpaper ", "\tpersonalization.wallpaper"];

  for (const policyId of paddedIds) {
    const agent = new MockDesktopAgent();
    const res = await agent.handleRequest(
      applyEnvelope(`req-padded-${Math.random()}`, [
        { policyId, desiredState: "Blocked" }
      ])
    );

    assert.equal(res.success, false, `padded policyId '${policyId}' must be rejected`);
    assert.equal(res.errorCode, "INVALID_POLICY_REQUEST");
    assert.match(res.error ?? "", /espaços nas extremidades/);

    const states = await queryStates(agent);
    assert.equal(states.appliedCount, 0, `no policy may be applied for padded policyId '${policyId}'`);
    assert.equal(states.notConfiguredCount, 5);
  }
});

test("padded desiredState with otherwise valid name is rejected (mock/real parity)", async () => {
  const agent = new MockDesktopAgent();

  const res = await agent.handleRequest(
    applyEnvelope("req-padded-desired-1", [
      { policyId: "personalization.wallpaper", desiredState: "Blocked " }
    ])
  );

  assert.equal(res.success, false);
  assert.equal(res.errorCode, "INVALID_POLICY_REQUEST");

  const states = await queryStates(agent);
  assert.equal(states.appliedCount, 0);
  assert.equal(states.notConfiguredCount, 5);
});

test("valid request still commits after rejected attempts (no poisoned state)", async () => {
  const agent = new MockDesktopAgent();

  const rejected = await agent.handleRequest(
    applyEnvelope("req-poison-1", [{ policyId: "personalization.wallpaper", desiredState: "Restrict" }])
  );
  assert.equal(rejected.success, false);

  const valid = await agent.handleRequest(
    applyEnvelope("req-poison-2", [{ policyId: "personalization.wallpaper", desiredState: "Blocked" }])
  );
  assert.equal(valid.success, true);

  const states = await queryStates(agent);
  assert.equal(states.appliedCount, 1);
});
