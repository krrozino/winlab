import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildValidatedTransactionRequest,
  computePolicyDriftSummary,
  computePolicyVisualModel,
  computeSavedProfileDiff,
  getEligibleTargetUsers,
  isPolicyCurrentlyEnabled,
  togglePolicyPendingState,
  transitionTargetUserContext
} from "../src/desktop/policy-state-machine";
import { MockDesktopAgent } from "../src/desktop/mock-agent";
import {
  ApplyTransactionResultDto,
  IPC_CONSTANTS,
  IpcEnvelope,
  IpcResponse,
  LocalUserDto,
  MachineInventoryDto,
  NetworkShareEnvironmentDto,
  PolicyItemDto,
  PolicyStateSummaryDto,
  RollbackResultDto,
  UpdateStatusDto
} from "../src/desktop/contracts";
import { MachineDataSession } from "../src/desktop/machine-data-session";
import { DesktopControlCenter } from "../src/desktop/DesktopControlCenter";
import { defaultConfig } from "../src/lib/default-config";

function makeEnvelope(action: string, payload?: unknown, type: "query" | "command" = "query"): IpcEnvelope {
  return {
    id: crypto.randomUUID(),
    version: IPC_CONSTANTS.PROTOCOL_VERSION,
    timestamp: new Date().toISOString(),
    type,
    action,
    payload
  };
}

function makePolicy(overrides: Partial<PolicyItemDto> = {}): PolicyItemDto {
  return {
    id: "personalization.wallpaper",
    category: "Personalização",
    title: "Bloquear alteração do papel de parede",
    description: "Impede que o usuário comum altere o plano de fundo.",
    desiredState: "NotConfigured",
    currentState: "NotConfigured",
    effectiveState: "NotConfigured",
    configuredState: "NotConfigured",
    scope: "User",
    reversible: true,
    risk: "Low",
    requiresRestart: false,
    requiresLogoff: true,
    requiresAppRestart: false,
    ...overrides
  };
}

const SAMPLE_USERS: LocalUserDto[] = [
  {
    name: "Administrador",
    enabled: true,
    isAdmin: true,
    sid: "S-1-5-21-1000-500"
  },
  {
    name: "Aluno",
    enabled: true,
    isAdmin: false,
    sid: "S-1-5-21-1000-1002"
  },
  {
    name: "TurmaNoite",
    enabled: true,
    isAdmin: false,
    sid: "S-1-5-21-1000-1003"
  },
  {
    name: "ExAlunoInativo",
    enabled: false,
    isAdmin: false,
    sid: "S-1-5-21-1000-1004"
  }
];

test("State machine: symmetric toggle NotConfigured -> PendingActivation -> NotConfigured", () => {
  const policy = makePolicy({ currentState: "NotConfigured", effectiveState: "NotConfigured" });
  assert.equal(isPolicyCurrentlyEnabled(policy), false);

  const initialVisual = computePolicyVisualModel(policy, {});
  assert.equal(initialVisual.switchChecked, false);
  assert.equal(initialVisual.visualStatus, "NotConfigured");
  assert.equal(initialVisual.badgeLabel, "Desativado");

  // 1st click: stages activation without falsely claiming Windows applied it
  const afterFirstClick = togglePolicyPendingState({}, policy);
  assert.equal(afterFirstClick[policy.id], true);

  const pendingVisual = computePolicyVisualModel(policy, afterFirstClick);
  assert.equal(pendingVisual.switchChecked, true);
  assert.equal(pendingVisual.hasPendingChange, true);
  assert.equal(pendingVisual.pendingDesiredState, "Blocked");
  assert.equal(pendingVisual.visualStatus, "PendingActivation");
  assert.equal(pendingVisual.badgeLabel, "Ativação pendente");

  // 2nd click: cancels pending activation cleanly back to NotConfigured
  const afterSecondClick = togglePolicyPendingState(afterFirstClick, policy);
  assert.equal(afterSecondClick[policy.id], undefined);

  const restoredVisual = computePolicyVisualModel(policy, afterSecondClick);
  assert.equal(restoredVisual.switchChecked, false);
  assert.equal(restoredVisual.hasPendingChange, false);
  assert.equal(restoredVisual.visualStatus, "NotConfigured");
});

test("State machine: symmetric toggle Applied -> PendingDeactivation -> Applied", () => {
  const policy = makePolicy({
    currentState: "Applied",
    effectiveState: "Applied",
    configuredState: "Blocked"
  });
  assert.equal(isPolicyCurrentlyEnabled(policy), true);

  const initialVisual = computePolicyVisualModel(policy, {});
  assert.equal(initialVisual.switchChecked, true);
  assert.equal(initialVisual.visualStatus, "Applied");
  assert.equal(initialVisual.badgeLabel, "Ativado");

  // 1st click on active policy: stages deactivation (NotConfigured)
  const afterFirstClick = togglePolicyPendingState({}, policy);
  assert.equal(afterFirstClick[policy.id], false);

  const pendingVisual = computePolicyVisualModel(policy, afterFirstClick);
  assert.equal(pendingVisual.switchChecked, false);
  assert.equal(pendingVisual.hasPendingChange, true);
  assert.equal(pendingVisual.pendingDesiredState, "NotConfigured");
  assert.equal(pendingVisual.visualStatus, "PendingDeactivation");
  assert.equal(pendingVisual.badgeLabel, "Desativação pendente");

  // 2nd click: cancels pending deactivation cleanly back to Applied
  const afterSecondClick = togglePolicyPendingState(afterFirstClick, policy);
  assert.equal(afterSecondClick[policy.id], undefined);

  const restoredVisual = computePolicyVisualModel(policy, afterSecondClick);
  assert.equal(restoredVisual.switchChecked, true);
  assert.equal(restoredVisual.hasPendingChange, false);
  assert.equal(restoredVisual.visualStatus, "Applied");
});

test("State machine: represents Applying, PendingLogoff, PendingAppRestart, Drifted, Inconclusive, NotSupported", () => {
  const base = makePolicy();

  const applyingVisual = computePolicyVisualModel(base, { [base.id]: true }, { isApplying: true });
  assert.equal(applyingVisual.visualStatus, "Applying");
  assert.equal(applyingVisual.disabled, true);

  const logoffVisual = computePolicyVisualModel(
    makePolicy({ currentState: "Applied", effectiveState: "PendingLogoff", configuredState: "Blocked" }),
    {}
  );
  assert.equal(logoffVisual.visualStatus, "PendingLogoff");
  assert.equal(logoffVisual.switchChecked, true);

  const browserRestartVisual = computePolicyVisualModel(
    makePolicy({
      id: "browser.incognito",
      scope: "Machine",
      currentState: "Applied",
      effectiveState: "PendingAppRestart",
      configuredState: "Blocked"
    }),
    {}
  );
  assert.equal(browserRestartVisual.visualStatus, "PendingAppRestart");

  const driftedVisual = computePolicyVisualModel(
    makePolicy({ currentState: "Drifted", effectiveState: "Drifted", configuredState: "NotConfigured" }),
    {}
  );
  assert.equal(driftedVisual.visualStatus, "Drifted");
  assert.equal(driftedVisual.badgeTone, "error");

  const inconclusiveVisual = computePolicyVisualModel(
    makePolicy({ currentState: "Inconclusive", effectiveState: "Inconclusive" }),
    {}
  );
  assert.equal(inconclusiveVisual.visualStatus, "Inconclusive");
  assert.equal(inconclusiveVisual.switchChecked, false);

  const unsupportedVisual = computePolicyVisualModel(
    makePolicy({ currentState: "NotSupported", effectiveState: "NotSupported" }),
    {}
  );
  assert.equal(unsupportedVisual.visualStatus, "NotSupported");
  assert.equal(unsupportedVisual.disabled, true);

  const noUserVisual = computePolicyVisualModel(base, {}, { hasSelectedStandardUser: false });
  assert.equal(noUserVisual.disabled, true);
});

test("User context transition clears user-scoped pending edits and invalidates stale user states", () => {
  const userPolicy = makePolicy({
    id: "personalization.wallpaper",
    scope: "User",
    currentState: "Applied",
    effectiveState: "Applied",
    configuredState: "Blocked"
  });
  const machinePolicy = makePolicy({
    id: "browser.incognito",
    scope: "Machine",
    currentState: "Applied",
    effectiveState: "Applied",
    configuredState: "Blocked"
  });

  const transition = transitionTargetUserContext({
    previousSid: "S-1-5-21-1000-1002",
    nextSid: "S-1-5-21-1000-1003",
    pendingPolicies: {
      "personalization.wallpaper": false,
      "browser.incognito": false
    },
    policies: [userPolicy, machinePolicy]
  });

  assert.equal(transition.clearedUserPendingCount, 1);
  assert.equal(transition.nextPendingPolicies["personalization.wallpaper"], undefined);
  assert.equal(transition.nextPendingPolicies["browser.incognito"], false);

  const updatedUserPolicy = transition.invalidatedPolicies?.find((p) => p.id === "personalization.wallpaper");
  const updatedMachinePolicy = transition.invalidatedPolicies?.find((p) => p.id === "browser.incognito");
  assert.equal(updatedUserPolicy?.effectiveState, "Inconclusive");
  assert.equal(updatedMachinePolicy?.effectiveState, "Applied");
});

test("Transaction request validator enforces non-admin, enabled, canonical SID before UAC/IPC", () => {
  const eligible = getEligibleTargetUsers(SAMPLE_USERS);
  assert.deepEqual(
    eligible.map((u) => u.name),
    ["Aluno", "TurmaNoite"]
  );

  const policies = [
    makePolicy({ id: "personalization.wallpaper", scope: "User", requiresLogoff: true }),
    makePolicy({ id: "browser.incognito", scope: "Machine", requiresLogoff: false, requiresAppRestart: true })
  ];

  // Missing SID for user policy
  const missingSid = buildValidatedTransactionRequest({
    pendingPolicies: { "personalization.wallpaper": true },
    policies,
    selectedUserSid: null,
    localUsers: SAMPLE_USERS
  });
  assert.equal(missingSid.valid, false);

  // Admin SID rejected
  const adminSid = buildValidatedTransactionRequest({
    pendingPolicies: { "personalization.wallpaper": true },
    policies,
    selectedUserSid: "S-1-5-21-1000-500",
    localUsers: SAMPLE_USERS
  });
  assert.equal(adminSid.valid, false);
  assert.match(adminSid.error ?? "", /imunidade|administradora/i);

  // Disabled user rejected
  const disabledSid = buildValidatedTransactionRequest({
    pendingPolicies: { "personalization.wallpaper": true },
    policies,
    selectedUserSid: "S-1-5-21-1000-1004",
    localUsers: SAMPLE_USERS
  });
  assert.equal(disabledSid.valid, false);
  assert.match(disabledSid.error ?? "", /desativada/i);

  // Malformed SID rejected
  const malformedSid = buildValidatedTransactionRequest({
    pendingPolicies: { "personalization.wallpaper": true },
    policies,
    selectedUserSid: "NOT_A_SID",
    localUsers: SAMPLE_USERS
  });
  assert.equal(malformedSid.valid, false);

  // Valid standard user + symmetric Blocked & NotConfigured mapping
  const validTx = buildValidatedTransactionRequest({
    pendingPolicies: {
      "personalization.wallpaper": true,
      "browser.incognito": false
    },
    policies,
    selectedUserSid: "S-1-5-21-1000-1002",
    localUsers: SAMPLE_USERS
  });
  assert.equal(validTx.valid, true);
  assert.equal(validTx.requiresLogoff, true);
  assert.equal(validTx.requiresAppRestart, true);
  assert.equal(validTx.request?.targetUserSid, "S-1-5-21-1000-1002");
  assert.equal(validTx.request?.targetUserName, "Aluno");
  assert.deepEqual(validTx.request?.policies, [
    { policyId: "personalization.wallpaper", desiredState: "Blocked" },
    { policyId: "browser.incognito", desiredState: "NotConfigured" }
  ]);
});

test("MockDesktopAgent isolates user policies per SID, supports deactivation/rollback, and creates accounts without storing passwords", async () => {
  const agent = new MockDesktopAgent();

  // Apply user-scoped wallpaper policy + machine-scoped incognito policy to Aluno (1002)
  const applyRes = await agent.handleRequest<ApplyTransactionResultDto>(
    makeEnvelope(
      IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
      {
        targetUserName: "Aluno",
        targetUserSid: "S-1-5-21-1000-1002",
        policies: [
          { policyId: "personalization.wallpaper", desiredState: "Blocked" },
          { policyId: "browser.chrome.incognito", desiredState: "Blocked" }
        ]
      },
      "command"
    )
  );
  assert.equal(applyRes.success, true);
  const txId = applyRes.data?.transactionId;
  assert.ok(txId);

  // Query Aluno (1002): both user policy and machine policy are active
  const alunoStates = await agent.handleRequest<PolicyStateSummaryDto>(
    makeEnvelope(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES, { targetUserSid: "S-1-5-21-1000-1002" })
  );
  assert.equal(alunoStates.success, true);
  const alunoWallpaper = alunoStates.data?.items.find((p) => p.id === "personalization.wallpaper");
  const alunoIncognito = alunoStates.data?.items.find((p) => p.id === "browser.chrome.incognito");
  assert.equal(alunoWallpaper?.configuredState, "Blocked");
  assert.equal(alunoIncognito?.configuredState, "Blocked");

  // Query TurmaNoite (1003): user policy MUST remain NotConfigured while machine policy is Blocked!
  const turmaStates = await agent.handleRequest<PolicyStateSummaryDto>(
    makeEnvelope(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES, { targetUserSid: "S-1-5-21-1000-1003" })
  );
  assert.equal(turmaStates.success, true);
  const turmaWallpaper = turmaStates.data?.items.find((p) => p.id === "personalization.wallpaper");
  const turmaIncognito = turmaStates.data?.items.find((p) => p.id === "browser.chrome.incognito");
  assert.equal(turmaWallpaper?.currentState, "NotConfigured");
  assert.equal(turmaWallpaper?.configuredState, "NotConfigured");
  assert.equal(turmaIncognito?.configuredState, "Blocked");

  // Rollback transaction restores Aluno's user policy and machine policy
  const rollbackRes = await agent.handleRequest<RollbackResultDto>(
    makeEnvelope(IPC_CONSTANTS.ACTION_ROLLBACK_TRANSACTION, { transactionId: txId }, "command")
  );
  assert.equal(rollbackRes.success, true);
  assert.equal(rollbackRes.data?.status, "RolledBack");

  const afterRollback = await agent.handleRequest<PolicyStateSummaryDto>(
    makeEnvelope(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES, { targetUserSid: "S-1-5-21-1000-1002" })
  );
  assert.equal(
    afterRollback.data?.items.find((p) => p.id === "personalization.wallpaper")?.currentState,
    "NotConfigured"
  );
  assert.equal(
    afterRollback.data?.items.find((p) => p.id === "browser.chrome.incognito")?.currentState,
    "NotConfigured"
  );

  // Create local standard account without leaking password
  const createRes = await agent.handleRequest<{ name: string; sid: string; role: string }>(
    makeEnvelope(
      IPC_CONSTANTS.ACTION_CREATE_LOCAL_ACCOUNT,
      { name: "LabManha", password: "StrongPassword#2026", isAdmin: false },
      "command"
    )
  );
  assert.equal(createRes.success, true);
  assert.equal(createRes.data?.name, "LabManha");
  assert.equal(createRes.data?.role, "Standard");
  assert.doesNotMatch(JSON.stringify(createRes), /StrongPassword#2026/);

  const invRes = await agent.handleRequest<MachineInventoryDto>(
    makeEnvelope(IPC_CONSTANTS.ACTION_QUERY_INVENTORY)
  );
  assert.ok(invRes.data?.localUsers.some((u) => u.name === "LabManha" && !u.isAdmin));
});

test("MachineDataSession.queryPoliciesForUser drops out-of-order responses on rapid user switch", async () => {
  const resolvers = new Map<string, (res: IpcResponse<PolicyStateSummaryDto>) => void>();
  let latestSummary = null as PolicyStateSummaryDto | null;
  let latestSelectedSid = null as string | null;

  const session = new MachineDataSession(
    async <T>(action: string, payload?: unknown): Promise<IpcResponse<T>> => {
      if (action === IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES) {
        const sid = (payload as { targetUserSid?: string } | undefined)?.targetUserSid ?? "none";
        return new Promise<IpcResponse<PolicyStateSummaryDto>>((resolve) => {
          resolvers.set(sid, resolve);
        }) as unknown as Promise<IpcResponse<T>>;
      }
      throw new Error(`Unexpected action ${action}`);
    },
    {
      onModeChange: () => {},
      onConnectionState: () => {},
      onInventory: () => {},
      onPolicySummary: (summary) => {
        latestSummary = summary;
      },
      onPreflight: () => {},
      onScanError: () => {},
      onScanning: () => {},
      onSelectedUserSidChange: (sid) => {
        latestSelectedSid = sid;
      }
    }
  );

  const p1 = session.queryPoliciesForUser("S-1-5-21-1000-1002");
  const p2 = session.queryPoliciesForUser("S-1-5-21-1000-1003");
  assert.equal(latestSelectedSid, "S-1-5-21-1000-1003");

  // Resolve second request FIRST
  resolvers.get("S-1-5-21-1000-1003")?.({
    id: "r2",
    replyToId: "q2",
    success: true,
    data: {
      totalPolicies: 1,
      appliedCount: 0,
      notConfiguredCount: 1,
      pendingCount: 0,
      items: [makePolicy({ evidence: "SID-1003" })]
    }
  });
  await p2;
  assert.equal(latestSummary?.items[0]?.evidence, "SID-1003");

  // Resolve stale first request AFTER second request: must be ignored!
  resolvers.get("S-1-5-21-1000-1002")?.({
    id: "r1",
    replyToId: "q1",
    success: true,
    data: {
      totalPolicies: 1,
      appliedCount: 1,
      notConfiguredCount: 0,
      pendingCount: 0,
      items: [makePolicy({ currentState: "Applied", effectiveState: "Applied", evidence: "STALE-SID-1002" })]
    }
  });
  const staleReturn = await p1;
  assert.equal(staleReturn, null);
  assert.equal(latestSummary?.items[0]?.evidence, "SID-1003");
});

test("DesktopControlCenter renders cleanly in Demo and Real modes with Portuguese labels and target user bar", () => {
  const mockInventory: MachineInventoryDto = {
    scannedAt: new Date().toISOString(),
    computerName: "LAB-SALA-01",
    isMock: false,
    windows: {
      caption: "Microsoft Windows 11 Pro",
      version: "10.0.26100",
      buildNumber: "26100",
      edition: "Professional",
      architecture: "64-bit"
    },
    disks: [{ device: "C:", totalGb: 256, freeGb: 180, freePercent: 70 }],
    detectedApps: [
      { id: "chrome", name: "Google Chrome", path: "C:\\Chrome\\chrome.exe", detected: true, allowed: true }
    ],
    installedApps: [],
    localUsers: SAMPLE_USERS
  };

  const html = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Real",
      native: true,
      inventory: mockInventory,
      policyStates: [
        makePolicy({ id: "personalization.wallpaper", scope: "User" }),
        makePolicy({
          id: "browser.chrome.incognito",
          category: "Navegadores",
          title: "Bloquear aba anônima",
          scope: "Machine"
        })
      ],
      selectedUserSid: "S-1-5-21-1000-1002",
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: false,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true })
    })
  );

  assert.match(html, /Visão geral/);
  assert.match(html, /Contas e usuários/);
  assert.match(html, /Permissões/);
  assert.match(html, /Perfis de laboratório/);
  assert.match(html, /Rede e arquivos/);
  assert.match(html, /Segurança/);
  assert.match(html, /Diagnóstico/);
  assert.match(html, /Histórico e recuperação/);
  assert.match(html, /Configurações/);
  assert.match(html, /LAB-SALA-01/);
  assert.match(html, /Computador Real/);
});

test("MockDesktopAgent responds to system.update_status and network.query_shares with pre-1.0 version and SMB safety", async () => {
  const agent = new MockDesktopAgent();

  const updateRes = await agent.handleRequest<UpdateStatusDto>(
    makeEnvelope(IPC_CONSTANTS.ACTION_QUERY_UPDATE_STATUS)
  );
  assert.equal(updateRes.success, true);
  assert.equal(updateRes.data?.currentVersion, "0.9.1");
  assert.equal(updateRes.data?.installChannel, "Velopack");
  assert.equal(updateRes.data?.autoUpdateSupported, true);

  const netRes = await agent.handleRequest<NetworkShareEnvironmentDto>(
    makeEnvelope(IPC_CONSTANTS.ACTION_QUERY_NETWORK_SHARES)
  );
  assert.equal(netRes.success, true);
  assert.equal(netRes.data?.isMock, true);
  assert.equal(netRes.data?.smb1Enabled, false);
  assert.ok((netRes.data?.mappedDrives.length ?? 0) >= 1);
  assert.ok((netRes.data?.localShares.length ?? 0) >= 1);
});

test("External drift detection surfaces warning banner and computes exact saved profile diff", () => {
  const driftedPolicies: PolicyItemDto[] = [
    makePolicy({
      id: "personalization.wallpaper",
      title: "Bloquear papel de parede",
      currentState: "Drifted",
      effectiveState: "Drifted",
      desiredState: "Blocked"
    }),
    makePolicy({
      id: "browser.chrome.incognito",
      title: "Bloquear navegação anônima",
      scope: "Machine",
      currentState: "Applied",
      effectiveState: "Applied",
      configuredState: "Blocked",
      desiredState: "Blocked"
    }),
    makePolicy({
      id: "storage.usb_write_protect",
      title: "Bloquear gravação em pendrives USB",
      scope: "Machine",
      currentState: "NotConfigured",
      effectiveState: "NotConfigured",
      configuredState: "NotConfigured",
      desiredState: "NotConfigured"
    })
  ];

  const drift = computePolicyDriftSummary(driftedPolicies);
  assert.equal(drift.hasDrift, true);
  assert.equal(drift.driftedPolicies.length, 1);
  assert.deepEqual(drift.remediationPending, { "personalization.wallpaper": true });

  // Diff: saved profile enables usb_write_protect, disables incognito, keeps wallpaper disabled
  const diff = computeSavedProfileDiff(
    {
      "personalization.wallpaper": false,
      "browser.chrome.incognito": false,
      "storage.usb_write_protect": true
    },
    driftedPolicies
  );
  assert.deepEqual(diff.toEnable, ["storage.usb_write_protect"]);
  assert.deepEqual(diff.toDisable, ["browser.chrome.incognito"]);
  assert.equal(diff.unchangedCount, 1);
  assert.deepEqual(diff.pendingMap, {
    "browser.chrome.incognito": false,
    "storage.usb_write_protect": true
  });

  // SSR render verifies the drift warning banner appears automatically
  const html = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Real",
      native: true,
      inventory: {
        scannedAt: new Date().toISOString(),
        computerName: "LAB-DRIFT-01",
        isMock: false,
        windows: {
          caption: "Windows 11 Pro",
          version: "10.0.26100",
          buildNumber: "26100",
          edition: "Professional",
          architecture: "64-bit"
        },
        disks: [{ device: "C:", totalGb: 256, freeGb: 180, freePercent: 70 }],
        detectedApps: [],
        installedApps: [],
        localUsers: SAMPLE_USERS
      },
      policyStates: driftedPolicies,
      selectedUserSid: "S-1-5-21-1000-1002",
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: false,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true })
    })
  );

  assert.match(html, /drift-warning-banner/);
  assert.match(html, /Configuração modificada fora do WinLab/);
  assert.match(html, /Bloquear papel de parede/);
});

test("Account privilege classification: Unknown classification is excluded from eligible targets and blocked on apply", () => {
  const users: LocalUserDto[] = [
    ...SAMPLE_USERS,
    {
      name: "ContaIncerta",
      enabled: true,
      isAdmin: false,
      privilegeClassification: "Unknown",
      classificationDetail: "Falha ao consultar grupos administrativos.",
      sid: "S-1-5-21-1000-1099"
    }
  ];

  const eligible = getEligibleTargetUsers(users);
  assert.equal(eligible.some((u) => u.sid === "S-1-5-21-1000-1099"), false);
  assert.equal(eligible.some((u) => u.sid === "S-1-5-21-1000-1002"), true);

  const policy = makePolicy({ id: "personalization.wallpaper", scope: "User" });
  const txValidation = buildValidatedTransactionRequest({
    pendingPolicies: { "personalization.wallpaper": true },
    policies: [policy],
    selectedUserSid: "S-1-5-21-1000-1099",
    localUsers: users
  });
  assert.equal(txValidation.valid, false);
  assert.match(txValidation.error ?? "", /grupos administrativos|privilégios/i);
});


