import test from "node:test";
import assert from "node:assert/strict";

import { IPC_CONSTANTS, IpcEnvelope, IpcResponse, MachineInventoryDto, PolicyStateSummaryDto } from "../src/desktop/contracts";
import { MachineDataSession, PreflightSnapshotWithMessage, createProcessingCounter } from "../src/desktop/machine-data-session";
import { MockDesktopAgent } from "../src/desktop/mock-agent";
import { OperatingMode } from "../src/lib/types";

const ISO = "2026-11-11T12:00:00.000Z";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

interface PendingRequest {
  action: string;
  resolve: (response: IpcResponse<never>) => void;
}

class DeferredTransport {
  public sent: string[] = [];
  private pending: PendingRequest[] = [];

  async handleRequest<T>(envelope: IpcEnvelope): Promise<IpcResponse<T>> {
    this.sent.push(envelope.action);
    return new Promise<IpcResponse<T>>((resolve) => {
      this.pending.push({
        action: envelope.action,
        resolve: resolve as unknown as (response: IpcResponse<never>) => void
      });
    });
  }

  respond(action: string, response: { success: boolean; data?: unknown; error?: string }): void {
    const index = this.pending.findIndex((request) => request.action === action);
    assert.ok(index >= 0, `no pending request for action '${action}' (sent: ${this.sent.join(", ")})`);
    const [request] = this.pending.splice(index, 1);
    request.resolve({
      id: `res-${Math.random().toString(36).slice(2)}`,
      replyToId: "req",
      ...response
    } as IpcResponse<never>);
  }

  pendingActions(): string[] {
    return this.pending.map((request) => request.action);
  }
}

function mockInventory(isMock: boolean): MachineInventoryDto {
  return {
    computerName: isMock ? "LAB-MICROLINS-01" : "REAL-PC",
    scannedAt: ISO,
    ...(isMock ? { isMock: true } : {}),
    windows: { caption: "Windows 11 Pro", version: "10.0.26100", buildNumber: "26100", architecture: "64-bit", ubr: 1742 },
    detectedApps: [],
    installedApps: [],
    localUsers: [{ name: "user", enabled: true, isAdmin: false, sid: "S-1-5-21-1-1001" }],
    disks: [{ device: "C:", totalGb: 100, freeGb: 50, freePercent: 50 }]
  };
}

const policySummary: PolicyStateSummaryDto = { totalPolicies: 5, appliedCount: 3, notConfiguredCount: 2, pendingCount: 0, items: [] };
const preflight: PreflightSnapshotWithMessage = {
  computerName: "PC",
  status: "PASS",
  readinessScore: 92,
  summary: { pass: 8, warn: 2, block: 0 },
  readinessMessage: "ok"
};

type Sender = <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;

function createHarness(sender?: Sender) {
  const state = {
    mode: "Demo" as OperatingMode,
    inventory: null as MachineInventoryDto | null,
    policySummary: null as PolicyStateSummaryDto | null,
    preflight: null as PreflightSnapshotWithMessage | null,
    scanError: null as string | null,
    isScanning: false
  };
  const transport = new DeferredTransport();
  const send: Sender =
    sender ??
    (<T>(action: string, payload?: unknown) =>
      transport.handleRequest<T>({
        id: "req",
        version: IPC_CONSTANTS.PROTOCOL_VERSION,
        timestamp: ISO,
        type: "query",
        action,
        payload
      }));

  const session = new MachineDataSession(send, {
    onModeChange: (mode) => {
      state.mode = mode;
    },
    onInventory: (inventory) => {
      state.inventory = inventory;
    },
    onPolicySummary: (summary) => {
      state.policySummary = summary;
    },
    onPreflight: (snapshot) => {
      state.preflight = snapshot;
    },
    onScanError: (error) => {
      state.scanError = error;
    },
    onScanning: (scanning) => {
      state.isScanning = scanning;
    }
  });

  return { state, transport, session };
}

test("stale initial load never repopulates state after a mode switch", async () => {
  const { state, transport, session } = createHarness();
  const initial = session.loadInitial();
  const switching = session.switchMode("Real");

  assert.equal(state.mode, "Real");
  assert.equal(state.inventory === null, true);
  assert.equal(state.isScanning, true);

  transport.respond(IPC_CONSTANTS.ACTION_QUERY_INVENTORY, { success: true, data: mockInventory(true) });
  await initial;
  assert.equal(state.inventory === null, true, "late Demo inventory from the initial load must be dropped");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Real" } });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_INVENTORY, { success: true, data: mockInventory(false) });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE, { success: true, data: policySummary });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT, { success: true, data: preflight });
  await switching;

  assert.equal(state.mode, "Real");
  assert.equal(state.inventory?.computerName, "REAL-PC");
  assert.equal(state.inventory?.isMock, undefined);
  assert.equal(state.isScanning, false);
  assert.equal(state.scanError, null);
});

test("rapid DEMO to REAL to DEMO toggles keep only the last generation", async () => {
  const { state, transport, session } = createHarness();
  const initial = session.loadInitial();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_INVENTORY, { success: true, data: mockInventory(true) });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE, { success: true, data: policySummary });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT, { success: true, data: preflight });
  await initial;
  assert.equal(state.inventory?.isMock, true);

  const toReal = session.switchMode("Real");
  const toDemo = session.switchMode("Demo");

  assert.equal(state.mode, "Demo");
  assert.equal(state.inventory === null, true, "second toggle purges state synchronously");
  assert.equal(state.isScanning, true);

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Real" } });
  await toReal;
  assert.equal(state.inventory === null, true, "stale REAL generation must not apply data in Demo mode");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Demo" } });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_INVENTORY, { success: true, data: mockInventory(true) });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE, { success: true, data: policySummary });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT, { success: true, data: preflight });
  await toDemo;

  assert.equal(state.mode, "Demo");
  assert.equal(state.inventory?.isMock, true);
  assert.equal(state.policySummary, policySummary);
  assert.equal(state.preflight, preflight);
  assert.equal(state.isScanning, false);
  assert.equal(state.scanError, null);
});

test("responses resolved after a newer toggle started are dropped mid-generation", async () => {
  const { state, transport, session } = createHarness();
  const toReal = session.switchMode("Real");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Real" } });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_INVENTORY, { success: true, data: mockInventory(false) });
  await flush();
  assert.equal(state.inventory?.computerName, "REAL-PC");

  const toDemo = session.switchMode("Demo");
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE, { success: true, data: policySummary });
  await toReal;
  assert.equal(state.policySummary === null, true, "stale REAL policies must not land after the switch to Demo");
  assert.equal(state.inventory === null, true, "purge from the newer toggle is preserved");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Demo" } });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_INVENTORY, { success: true, data: mockInventory(true) });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE, { success: true, data: policySummary });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT, { success: true, data: preflight });
  await toDemo;

  assert.equal(state.mode, "Demo");
  assert.equal(state.inventory?.isMock, true);
  assert.equal(state.isScanning, false);
});

test("mode.set failure is fail-closed: error state, no machine queries, no fake success", async () => {
  const { state, transport, session } = createHarness();
  const switching = session.switchMode("Real");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: false, error: "Host rejeitou a alternância de modo." });
  await switching;

  assert.equal(state.scanError, "Host rejeitou a alternância de modo.");
  assert.deepEqual(transport.sent, [IPC_CONSTANTS.ACTION_SET_MODE], "no machine query may precede a validated mode.set");
  assert.deepEqual(transport.pendingActions(), []);
  assert.equal(state.inventory, null);
  assert.equal(state.policySummary, null);
  assert.equal(state.preflight, null);
  assert.equal(state.isScanning, false);
});

test("mode.set success with a mismatched active mode is rejected", async () => {
  const { state, transport, session } = createHarness();
  const switching = session.switchMode("Real");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Demo" } });
  await switching;

  assert.notEqual(state.scanError, null, "a host stuck in another mode must surface an error, never fake REAL");
  assert.deepEqual(transport.sent, [IPC_CONSTANTS.ACTION_SET_MODE]);
  assert.equal(state.inventory, null);
});

test("mode.set exception (timeout or transport failure) surfaces a controlled error", async () => {
  const failing: Sender = async () => {
    throw new Error("Tempo limite esgotado (10000ms).");
  };
  const { state, session } = createHarness(failing);
  const switching = session.switchMode("Real");

  await switching;
  assert.equal(state.scanError, "Tempo limite esgotado (10000ms).");
  assert.equal(state.inventory, null);
  assert.equal(state.isScanning, false);
});

test("dispose during flight freezes all state updates", async () => {
  const { state, transport, session } = createHarness();
  const switching = session.switchMode("Real");
  session.dispose();

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Real" } });
  await switching;

  assert.deepEqual(transport.sent, [IPC_CONSTANTS.ACTION_SET_MODE], "no machine query may be sent after dispose");
  assert.equal(state.inventory, null, "no response may apply after dispose");
  assert.equal(state.policySummary, null);
  assert.equal(state.preflight, null);
  assert.equal(state.scanError, null);
});

test("three rapid toggles leave exactly one winner with consistent state", async () => {
  const { state, transport, session } = createHarness();
  const first = session.switchMode("Real");
  const second = session.switchMode("Demo");
  const third = session.switchMode("Real");

  assert.equal(state.mode, "Real");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Real" } });
  await first;
  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Demo" } });
  await second;

  assert.equal(state.inventory === null, true, "superseded generations must not apply anything");

  transport.respond(IPC_CONSTANTS.ACTION_SET_MODE, { success: true, data: { mode: "Real" } });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_INVENTORY, { success: true, data: mockInventory(false) });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE, { success: true, data: policySummary });
  await flush();
  transport.respond(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT, { success: true, data: preflight });
  await third;

  assert.equal(state.mode, "Real");
  assert.equal(state.inventory?.isMock, undefined, "no DEMO data may exist in REAL mode");
  assert.equal(state.policySummary, policySummary);
  assert.equal(state.preflight, preflight);
  assert.equal(state.isScanning, false);
  assert.equal(state.scanError, null);
});

test("processing counter stays true while any request is pending", () => {
  let processing = false;
  const counter = createProcessingCounter((value) => {
    processing = value;
  });

  counter.begin();
  counter.begin();
  counter.end();
  assert.equal(processing, true, "one request is still pending");

  counter.end();
  assert.equal(processing, false, "idle only after the last pending request completes");

  counter.end();
  assert.equal(processing, false, "no underflow re-enables processing");
});

test("MockDesktopAgent handles mode.set with C# dispatcher parity", async () => {
  const agent = new MockDesktopAgent();
  const envelope = (action: string, payload?: unknown): IpcEnvelope => ({
    id: "req",
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: ISO,
    type: "query",
    action,
    payload
  });

  const real = await agent.handleRequest<{ mode: string }>(envelope(IPC_CONSTANTS.ACTION_SET_MODE, { mode: "Real" }));
  assert.equal(real.success, true);
  assert.equal(real.data?.mode, "Real");

  const demo = await agent.handleRequest<{ mode: string }>(envelope(IPC_CONSTANTS.ACTION_SET_MODE, { mode: "Demo" }));
  assert.equal(demo.success, true);
  assert.equal(demo.data?.mode, "Demo");

  const unknown = await agent.handleRequest<{ mode: string }>(envelope(IPC_CONSTANTS.ACTION_SET_MODE, { mode: "Bogus" }));
  assert.equal(unknown.success, true, "mock mirrors the C# dispatcher, which defaults unknown modes to Demo");
  assert.equal(unknown.data?.mode, "Demo");
});
