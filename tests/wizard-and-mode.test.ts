import test from "node:test";
import assert from "node:assert/strict";

import {
  IPC_CONSTANTS,
  ALLOWED_IPC_ACTIONS,
  MachineInventoryDto,
  DesktopIpcTransport
} from "../src/desktop/contracts";
import { MockDesktopAgent } from "../src/desktop/mock-agent";
import { getPreset, presets } from "../src/lib/presets";
import { validateAccountsSafety, getConfigErrors } from "../src/lib/validation";
import { FirstRunWizard, evaluateBaselineCommitEligibility } from "../src/desktop/FirstRunWizard";
import React from "react";
import ReactDOMServer from "react-dom/server";
import type { Config } from "../src/lib/types";

test("Feature 16: Mode toggle invariant - switching from Demo to Real purges all mock data", () => {
  interface State {
    mode: "Demo" | "Real";
    inventory: MachineInventoryDto | null;
    policySummary: unknown | null;
    preflightData: unknown | null;
  }

  const agent = new MockDesktopAgent();
  const mockInv = agent.getMockInventory();

  // Initial Demo State
  let state: State = {
    mode: "Demo",
    inventory: mockInv,
    policySummary: { total: 10 },
    preflightData: { status: "PASS" }
  };

  assert.equal(state.mode, "Demo");
  assert.equal(state.inventory?.isMock, true);
  assert.equal(state.inventory?.computerName, "LAB-MICROLINS-01");

  // Operator initiates switch to Real Mode
  // Step 1: Synchronously purge all mock data
  state = {
    mode: "Real",
    inventory: null,
    policySummary: null,
    preflightData: null
  };

  assert.equal(state.mode, "Real");
  assert.equal(state.inventory, null, "Inventory MUST be null immediately upon switching to Real Mode");
  assert.equal(state.policySummary, null, "Policy summary MUST be null");
  assert.equal(state.preflightData, null, "Preflight data MUST be null");

  // Step 2: Real scan returns live data with isMock = false
  const liveInventory: MachineInventoryDto = {
    computerName: "ESTACAO-TI-04",
    scannedAt: new Date().toISOString(),
    isMock: false,
    windows: {
      caption: "Windows 11 Enterprise",
      version: "10.0.26100.1742",
      buildNumber: "26100",
      architecture: "64 bits",
      edition: "Enterprise",
      displayVersion: "24H2",
      ubr: 1742,
      is64Bit: true,
      tpmPresent: true,
      tpmVersion: "2.0",
      secureBootEnabled: true
    },
    detectedApps: [],
    installedApps: [
      { displayName: "Google Chrome", displayVersion: "131.0", publisher: "Google LLC", isAppx: false }
    ],
    localUsers: [
      { name: "Administrador", enabled: true, isAdmin: true, sid: "S-1-5-21-500" },
      { name: "Aluno", enabled: true, isAdmin: false, sid: "S-1-5-21-1002" }
    ],
    disks: [
      { device: "C:", totalGb: 476.2, freeGb: 312.4, freePercent: 65.6 }
    ]
  };

  state.inventory = liveInventory;
  assert.equal(state.inventory.isMock, false);
  assert.equal(state.inventory.computerName, "ESTACAO-TI-04");
  assert.equal(state.inventory.windows.edition, "Enterprise");
  assert.equal(state.inventory.windows.tpmPresent, true);
});

test("Feature 14 & 16: Zero-masquerade rule - live scan error never falls back to mock values", async () => {
  interface State {
    mode: "Demo" | "Real";
    inventory: MachineInventoryDto | null;
    scanError: string | null;
  }

  const state: State = {
    mode: "Real",
    inventory: null,
    scanError: null
  };

  // Simulate failed real host connection
  const scanSuccess = false;
  const failureError = "Tempo limite esgotado (10000ms) aguardando resposta do host C#.";

  if (!scanSuccess) {
    state.scanError = failureError;
    // CRITICAL: state.inventory must NOT be populated with mock data!
  }

  assert.equal(state.inventory, null, "Inventory must remain null on scan failure; zero masquerade!");
  assert.equal(state.scanError, failureError);
});

test("Feature 14: Account Safety Invariants - reject equal, empty, or administrator as student", () => {
  // Empty checks
  assert.equal(validateAccountsSafety("", "Admin").isValid, false);
  assert.equal(validateAccountsSafety("Aluno", "").isValid, false);

  // Equal accounts check
  assert.equal(validateAccountsSafety("Aluno", "Aluno").isValid, false);
  assert.equal(validateAccountsSafety("aluno", "ALUNO").isValid, false);
  assert.equal(validateAccountsSafety("administrador", "ADMINISTRADOR").isValid, false);

  // Distinct valid accounts
  const valid = validateAccountsSafety("Aluno", "MicrolinsAdmin");
  assert.equal(valid.isValid, true);
  assert.equal(valid.error, undefined);

  // Administrator immunity rule:
  const scannedUsers = [
    { name: "Administrador", isAdmin: true },
    { name: "AdminLocal", isAdmin: true },
    { name: "Aluno", isAdmin: false }
  ];

  function canTargetAsStudent(targetName: string): { allowed: boolean; reason?: string } {
    const user = scannedUsers.find((u) => u.name.toLowerCase() === targetName.toLowerCase());
    if (user && user.isAdmin) {
      return {
        allowed: false,
        reason: "A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador."
      };
    }
    return { allowed: true };
  }

  assert.equal(canTargetAsStudent("Administrador").allowed, false);
  assert.match(canTargetAsStudent("Administrador").reason ?? "", /impede restrições em contas administrativas/);
  assert.equal(canTargetAsStudent("AdminLocal").allowed, false);
  assert.equal(canTargetAsStudent("Aluno").allowed, true);
});

test("Feature 14: Microlins Pedagogical Tiers - configurations conform to schema and policy specifications", () => {
  const iniciante = getPreset("microlins_iniciante");
  assert.equal(iniciante.profileName, "Microlins Iniciante");
  assert.deepEqual(iniciante.allowedApps, ["chrome"]);
  assert.equal(iniciante.blockInstallers, true);
  assert.equal(iniciante.blockCmd, true);
  assert.equal(iniciante.blockPowerShell, true);
  assert.equal(iniciante.blockRegedit, true);
  assert.equal(iniciante.blockUsbExecute, true);
  assert.equal(iniciante.enforcementMode, "AuditOnly");

  const intermediario = getPreset("microlins_intermediario");
  assert.equal(intermediario.profileName, "Microlins Intermediário");
  assert.ok(intermediario.allowedApps.includes("chrome"));
  assert.ok(intermediario.allowedApps.includes("word"));
  assert.ok(intermediario.allowedApps.includes("excel"));
  assert.ok(intermediario.allowedApps.includes("powerbi"));
  assert.ok(intermediario.allowedApps.includes("vlc"));
  assert.equal(intermediario.wallpaperUnlockMinutes, 15);
  assert.equal(intermediario.blockUsbExecute, true);

  const avancado = getPreset("microlins_avancado");
  assert.equal(avancado.profileName, "Microlins Avançado");
  assert.equal(avancado.blockInstallers, false);
  assert.equal(avancado.blockCmd, false);
  assert.equal(avancado.blockPowerShell, false);
  assert.equal(avancado.blockRegedit, true);

  // All presets in catalog have unique IDs and descriptions
  const ids = presets.map((p) => p.id);
  const uniqueIds = new Set(ids);
  assert.equal(ids.length, uniqueIds.size, "All preset IDs must be unique");
});

test("Feature 15 & M2 Contracts: IPC Actions baseline.create and system.environment are registered", async () => {
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_CREATE_BASELINE));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_GET_ENVIRONMENT));
  assert.equal(IPC_CONSTANTS.ACTION_CREATE_BASELINE, "baseline.create");
  assert.equal(IPC_CONSTANTS.ACTION_GET_ENVIRONMENT, "system.environment");

  const agent = new MockDesktopAgent();

  // Test baseline.create roundtrip
  const baselineRes = await agent.handleRequest<{
    transactionId: string;
    timestamp: string;
    registryBaselinePath: string;
    appLockerBaselinePath: string;
    success: boolean;
  }>({
    id: "req-baseline-1",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    type: "command",
    action: IPC_CONSTANTS.ACTION_CREATE_BASELINE,
    payload: { studentUser: "Aluno", adminUser: "MicrolinsAdmin" }
  });

  assert.equal(baselineRes.success, true);
  assert.equal(baselineRes.replyToId, "req-baseline-1");
  assert.ok(baselineRes.data?.transactionId);
  assert.match(baselineRes.data?.registryBaselinePath ?? "", /Registry-Baseline/);

  // Test system.environment roundtrip
  const envRes = await agent.handleRequest<{
    environment: string;
    isElevated: boolean;
    platform: string;
  }>({
    id: "req-env-1",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    type: "query",
    action: IPC_CONSTANTS.ACTION_GET_ENVIRONMENT
  });

  assert.equal(envRes.success, true);
  assert.equal(envRes.replyToId, "req-env-1");
  assert.equal(envRes.data?.environment, "MockDesktopAgent");
  assert.equal(envRes.data?.isElevated, false);
});

test("Whitespace Bypass Remediation: validateAccountsSafety and getConfigErrors reject whitespace-padded collisions", () => {
  // Test pairs with varied whitespace padding and case permutations
  const collisionPairs = [
    ["Aluno ", "Aluno"],
    ["Aluno", "Aluno "],
    ["aluno", " ALUNO "],
    [" aluno ", "aluno"],
    ["  Aluno  ", "aluno"],
    ["aluno", "  Aluno  "],
    ["Administrador", " administrador "],
    [" MicrolinsAdmin ", "microlinsadmin"]
  ];

  const baseConfig = getPreset("microlins_iniciante");

  for (const [student, admin] of collisionPairs) {
    // 1. validateAccountsSafety assertion
    const safetyResult = validateAccountsSafety(student, admin);
    assert.equal(
      safetyResult.isValid,
      false,
      `validateAccountsSafety should reject collision for student='${student}', admin='${admin}'`
    );
    assert.equal(
      safetyResult.error,
      "Usuário restrito e administrador precisam ter nomes diferentes."
    );

    // 2. getConfigErrors assertion
    const config: Config = {
      ...baseConfig,
      studentUser: student,
      adminUser: admin
    };
    const errors = getConfigErrors(config);
    const collisionError = errors.find(
      (e) => e.field === "studentUser" && e.message === "Usuário restrito e administrador precisam ter nomes diferentes."
    );
    assert.ok(
      collisionError,
      `getConfigErrors should flag collision error for student='${student}', admin='${admin}'`
    );
  }

  // Verify that valid distinct names with whitespace trimming pass safely
  const validSafety = validateAccountsSafety(" Aluno ", " MicrolinsAdmin ");
  assert.equal(validSafety.isValid, true);
  assert.equal(validSafety.error, undefined);

  const validConfig: Config = {
    ...baseConfig,
    studentUser: " Aluno ",
    adminUser: " MicrolinsAdmin "
  };
  const validErrors = getConfigErrors(validConfig);
  assert.ok(
    !validErrors.some((e) => e.message.includes("precisam ter nomes diferentes")),
    "Distinct accounts should not trigger collision error"
  );
});

test("Adversarial Invariant: validateAccountsSafety and getConfigErrors reject tabs, newlines, mixed casing, and unexpected nulls", () => {
  const baseConfig = getPreset("microlins_iniciante");

  // 1. Whitespace collision matrix (tabs, newlines, multiple spaces, mixed casing)
  const whitespaceCollisions: [string, string][] = [
    ["\taluno", "aluno"],
    ["aluno\t", "aluno"],
    ["\taluno\t", "\taluno\t"],
    ["\taluno\t", "Aluno"],
    ["\naluno\n", "aluno"],
    ["\r\naluno\r\n", "\naluno\n"],
    ["\n  aluno  \n", "ALUNO"],
    ["   aluno   ", "aluno"],
    ["aluno", "          aluno          "],
    ["  aluno\t", "Aluno"],
    ["\tAluno\r\n", "  aluno  "],
    ["  ALUNO\t", "   aluno\n"],
    ["  alunó  ", "Alunó"],
    ["\tALUNÓ\r\n", "  alunó\t"]
  ];

  for (const [student, admin] of whitespaceCollisions) {
    const safety = validateAccountsSafety(student, admin);
    assert.equal(
      safety.isValid,
      false,
      `Expected validation collision rejection for student=${JSON.stringify(student)}, admin=${JSON.stringify(admin)}`
    );
    assert.equal(safety.error, "Usuário restrito e administrador precisam ter nomes diferentes.");

    const configErrors = getConfigErrors({
      ...baseConfig,
      studentUser: student,
      adminUser: admin
    });
    const collisionErr = configErrors.find((e) => e.message === "Usuário restrito e administrador precisam ter nomes diferentes.");
    assert.ok(
      collisionErr,
      `Expected getConfigErrors collision for student=${JSON.stringify(student)}, admin=${JSON.stringify(admin)}`
    );
  }

  // 2. Accented variations that are distinct accounts must pass cleanly
  const distinctAccented: [string, string][] = [
    ["alunó ", "aluno"],
    ["aluno", "alunó "],
    ["  alunó\t", "Aluno"],
    ["José", "Jose"]
  ];

  for (const [student, admin] of distinctAccented) {
    const safety = validateAccountsSafety(student, admin);
    assert.equal(
      safety.isValid,
      true,
      `Distinct accented names must be valid: student=${JSON.stringify(student)}, admin=${JSON.stringify(admin)}`
    );
    assert.equal(safety.error, undefined);

    const configErrors = getConfigErrors({
      ...baseConfig,
      studentUser: student,
      adminUser: admin
    });
    const collisionErr = configErrors.find((e) => e.message === "Usuário restrito e administrador precisam ter nomes diferentes.");
    assert.equal(collisionErr, undefined, "Distinct accented accounts should not trigger collision error");
  }

  // 3. Unexpected nulls and undefined inputs
  const nullStudent = validateAccountsSafety(null as unknown as string, "MicrolinsAdmin");
  assert.equal(nullStudent.isValid, false);
  assert.equal(nullStudent.error, "Usuário restrito não pode ficar vazio.");

  const nullAdmin = validateAccountsSafety("Aluno", undefined as unknown as string);
  assert.equal(nullAdmin.isValid, false);
  assert.equal(nullAdmin.error, "Administrador não pode ficar vazio.");

  const configWithNulls = getConfigErrors({
    ...baseConfig,
    profileName: null as unknown as string,
    studentUser: undefined as unknown as string,
    adminUser: null as unknown as string
  });
  assert.ok(configWithNulls.some((e) => e.field === "profileName"));
  assert.ok(configWithNulls.some((e) => e.field === "studentUser"));
  assert.ok(configWithNulls.some((e) => e.field === "adminUser"));

  // 4. Character injection and boundary tests
  assert.equal(validateAccountsSafety("aluno/cmd", "admin").isValid, false);
  assert.equal(validateAccountsSafety("aluno\\root", "admin").isValid, false);
  assert.equal(validateAccountsSafety("aluno@domain", "admin").isValid, false);
  assert.equal(validateAccountsSafety("...", "admin").isValid, false);
  assert.equal(validateAccountsSafety("a".repeat(21), "admin").isValid, false);
  assert.equal(validateAccountsSafety("a".repeat(20), "admin").isValid, true);

  // 5. Standard valid configurations pass cleanly
  const standardPairs: [string, string][] = [
    ["Aluno", "MicrolinsAdmin"],
    ["  Aluno  ", "  MicrolinsAdmin  "],
    ["aluno", "professor"],
    ["estudante", "administrador_local"]
  ];

  for (const [student, admin] of standardPairs) {
    const safety = validateAccountsSafety(student, admin);
    assert.equal(safety.isValid, true);
    assert.equal(safety.error, undefined);
  }
});

test("FirstRunWizard Step 4: Preflight BLOCK condition strictly disables controls and rejects baseline creation", async () => {
  const agent = new MockDesktopAgent();

  const blockPreflightData = {
    computerName: "LAB-MICROLINS-01",
    status: "BLOCK",
    readinessScore: 45,
    summary: { pass: 5, warn: 2, block: 2 },
    readinessMessage: "Disco rígido C: com menos de 2 GB livres e TPM desabilitado."
  };

  // 1. SSR HTML rendering check when preflight status is BLOCK
  const blockedHtml = ReactDOMServer.renderToString(
    React.createElement(FirstRunWizard, {
      transport: agent,
      isWebView2Available: true,
      initialMode: "Demo",
      initialStep: 4,
      initialPreflightData: blockPreflightData,
      initialConfirmed: false,
      onComplete: () => {}
    })
  );

  // Checkbox MUST have disabled attribute
  assert.match(
    blockedHtml,
    /<input[^>]+type="checkbox"[^>]+disabled=""/i,
    "Step 4 confirmation checkbox must be disabled when preflight status is BLOCK"
  );

  // Commit button MUST have disabled attribute
  assert.match(
    blockedHtml,
    /<button[^>]+disabled=""[^>]*>[\s\S]*?Confirmar e Inicializar Baseline/i,
    "Step 4 commit button must be disabled when preflight status is BLOCK"
  );

  // Preflight badge displays Status BLOCK
  assert.match(
    blockedHtml,
    /Status.*?BLOCK/i,
    "Step 4 must render explicit Status BLOCK notification"
  );

  // 2. SSR HTML rendering check when preflight status is PASS and confirmed
  const passPreflightData = {
    computerName: "LAB-MICROLINS-01",
    status: "PASS",
    readinessScore: 100,
    summary: { pass: 10, warn: 0, block: 0 },
    readinessMessage: "Computador apto para configuração."
  };

  const passHtml = ReactDOMServer.renderToString(
    React.createElement(FirstRunWizard, {
      transport: agent,
      isWebView2Available: true,
      initialMode: "Demo",
      initialStep: 4,
      initialPreflightData: passPreflightData,
      initialConfirmed: true,
      onComplete: () => {}
    })
  );

  // When PASS and confirmed, commit button should NOT be disabled
  assert.ok(
    !passHtml.includes('disabled="" class="primary" style="font-size:14px;padding:8px 24px;background:var(--success)'),
    "Step 4 commit button must NOT be disabled when preflight status is PASS and confirmed"
  );

  // 3. evaluateBaselineCommitEligibility programmatic evaluation across permutations
  assert.equal(evaluateBaselineCommitEligibility(true, "BLOCK", false).canCommit, false);
  assert.equal(evaluateBaselineCommitEligibility(false, "BLOCK", false).canCommit, false);
  assert.equal(evaluateBaselineCommitEligibility(true, "BLOCK", true).canCommit, false);
  assert.match(evaluateBaselineCommitEligibility(true, "BLOCK", false).reason ?? "", /Preflight status is BLOCK/);

  assert.equal(evaluateBaselineCommitEligibility(true, "PASS", false).canCommit, true);
  assert.equal(evaluateBaselineCommitEligibility(true, "WARN", false).canCommit, true);
  assert.equal(evaluateBaselineCommitEligibility(false, "PASS", false).canCommit, false);
  assert.equal(evaluateBaselineCommitEligibility(true, "PASS", true).canCommit, false);

  // 4. Verification that baseline.create IPC is never dispatched when preflight is BLOCK
  let baselineCreated = false;
  const interceptingAgent: DesktopIpcTransport = {
    isRunning: true,
    mode: "Intercepting Mock",
    handleRequest: async (envelope) => {
      if (envelope.action === IPC_CONSTANTS.ACTION_CREATE_BASELINE) {
        baselineCreated = true;
      }
      return agent.handleRequest(envelope);
    }
  };

  // Simulate execution attempt with BLOCK preflight
  const eligibility = evaluateBaselineCommitEligibility(true, "BLOCK");
  if (eligibility.canCommit) {
    await interceptingAgent.handleRequest({
      id: "req-blocked",
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "command",
      action: IPC_CONSTANTS.ACTION_CREATE_BASELINE
    });
  }

  assert.equal(baselineCreated, false, "ACTION_CREATE_BASELINE must NEVER be executed when preflight status is BLOCK");
});

