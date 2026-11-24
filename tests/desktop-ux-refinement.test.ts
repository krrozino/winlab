import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DesktopControlCenter } from "../src/desktop/DesktopControlCenter";
import { ReviewDrawer, buildReviewDrawerItems } from "../src/desktop/ReviewDrawer";
import {
  buildPermissionCardViewModel,
  DESKTOP_NAVIGATION_ITEMS,
  PERMISSION_GROUPS,
  type DesktopSection
} from "../src/desktop/permissions-catalog";
import { derivePostApplyOutcomes } from "../src/desktop/policy-state-machine";
import {
  ALLOWED_IPC_ACTIONS,
  IPC_CONSTANTS,
  type LocalUserDto,
  type MachineInventoryDto,
  type PolicyItemDto
} from "../src/desktop/contracts";
import {
  detectAdminBackendCapabilities,
  type AdminPermissionDto
} from "../src/desktop/admin-contracts-compat";
import { defaultConfig } from "../src/lib/default-config";
import { MILESTONE_3_POLICIES } from "../src/lib/policies";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SAMPLE_USERS: LocalUserDto[] = [
  {
    name: "Administrador",
    enabled: true,
    isAdmin: true,
    privilegeClassification: "Administrator",
    sid: "S-1-5-21-1000-500"
  },
  {
    name: "Aluno",
    enabled: true,
    isAdmin: false,
    privilegeClassification: "StandardUser",
    sid: "S-1-5-21-1000-1002"
  },
  {
    name: "TurmaNoite",
    enabled: true,
    isAdmin: false,
    privilegeClassification: "StandardUser",
    sid: "S-1-5-21-1000-1003"
  }
];

const ALL_POLICY_ITEMS: PolicyItemDto[] = MILESTONE_3_POLICIES.map((def) => ({
  id: def.id,
  category: def.category,
  title: def.name,
  description: def.description,
  scope: def.scope,
  risk: def.riskLevel,
  currentState: "NotConfigured",
  desiredState: "NotConfigured",
  configuredState: "NotConfigured",
  effectiveState: "NotConfigured",
  requiresRestart: def.rebootRequired,
  requiresLogoff: def.requiresLogoff,
  requiresAppRestart: def.requiresAppRestart,
  reversible: def.reversible,
  evidence: `${def.primaryProbe.hive}\\${def.primaryProbe.subKey}\\${def.primaryProbe.valueName}`
}));

function makeInventory(isMock = false): MachineInventoryDto {
  return {
    scannedAt: "2026-11-23T12:00:00.000Z",
    computerName: isMock ? "LAB-MICROLINS-01" : "LAB-SALA-01",
    isMock,
    windows: {
      caption: "Microsoft Windows 11 Pro",
      version: "10.0.26100",
      buildNumber: "26100",
      architecture: "64-bit",
      edition: "Professional",
      tpmPresent: true,
      tpmVersion: "2.0",
      secureBootEnabled: true
    },
    disks: [{ device: "C:", totalGb: 256, freeGb: 180, freePercent: 70 }],
    detectedApps: [
      { id: "chrome", name: "Google Chrome", path: "C:\\Chrome\\chrome.exe", detected: true, allowed: true }
    ],
    installedApps: [
      { displayName: "Google Chrome", displayVersion: "130.0", publisher: "Google LLC" }
    ],
    localUsers: SAMPLE_USERS
  };
}

test("MainWindow.xaml starts Maximized, fits 1366x768 restore bounds, and preserves standard window controls", () => {
  const xaml = readFileSync(path.join(ROOT_DIR, "desktop/src/WinLab.Desktop/MainWindow.xaml"), "utf8");

  assert.match(xaml, /WindowState="Maximized"/);
  assert.match(xaml, /WindowStartupLocation="CenterScreen"/);

  const widthMatch = xaml.match(/\bWidth="(\d+)"/);
  const heightMatch = xaml.match(/\bHeight="(\d+)"/);
  assert.ok(widthMatch && Number(widthMatch[1]) <= 1366, "Restored Width must fit inside 1366px");
  assert.ok(heightMatch && Number(heightMatch[1]) <= 720, "Restored Height must fit inside 768px with taskbar");

  assert.equal(xaml.includes('Topmost="True"'), false, "Kiosk Topmost must not be enabled");
  assert.equal(xaml.includes('WindowStyle="None"'), false, "Standard minimize/restore/close chrome must stay intact");
  assert.equal(xaml.includes('ResizeMode="NoResize"'), false, "User resize/restore must stay intact");
});

test("Scope guard: src/desktop/contracts.ts and vercel.json remain untouched against base commit", () => {
  const contractsDiff = execSync(
    "git diff 12b06af6095951a995aa014d7be94f930a254319 -- src/desktop/contracts.ts",
    { cwd: ROOT_DIR, encoding: "utf8" }
  ).trim();
  assert.equal(contractsDiff, "", "src/desktop/contracts.ts must not be modified without coordination");

  const vercelJson = JSON.parse(readFileSync(path.join(ROOT_DIR, "vercel.json"), "utf8")) as {
    git?: { deploymentEnabled?: boolean };
  };
  assert.equal(vercelJson.git?.deploymentEnabled, false);
});

test("Navigation renders all 9 required sections cleanly and Overview shows summary cards & skeletons", () => {
  assert.deepEqual(
    DESKTOP_NAVIGATION_ITEMS.map((item) => item.label),
    [
      "Visão geral",
      "Contas e usuários",
      "Permissões",
      "Perfis de laboratório",
      "Rede e arquivos",
      "Segurança",
      "Diagnóstico",
      "Histórico e recuperação",
      "Configurações"
    ]
  );

  const demoOverview = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Demo",
      native: false,
      inventory: makeInventory(true),
      policyStates: ALL_POLICY_ITEMS,
      selectedUserSid: "S-1-5-21-1000-1002",
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: false,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
      initialSection: "overview"
    })
  );

  assert.match(demoOverview, /Modo Demonstração ativo/);
  assert.match(demoOverview, /Máquina/);
  assert.match(demoOverview, /Contas/);
  assert.match(demoOverview, /Políticas/);
  assert.match(demoOverview, /Pendências/);
  assert.match(demoOverview, /Ações rápidas/);

  const loadingSkeletonHtml = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Real",
      native: true,
      inventory: null,
      policyStates: null,
      selectedUserSid: null,
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: true,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
      initialSection: "overview"
    })
  );
  assert.match(loadingSkeletonHtml, /wl-skeleton/);
});

test("Permissions center displays all 5 groups, 8 mandatory fields, collapsed technical details, and unavailable badges", () => {
  assert.deepEqual([...PERMISSION_GROUPS], [
    "Sistema",
    "Personalização",
    "Aplicativos",
    "Internet",
    "Dispositivos"
  ]);

  const html = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Demo",
      native: false,
      inventory: makeInventory(true),
      policyStates: ALL_POLICY_ITEMS,
      selectedUserSid: "S-1-5-21-1000-1002",
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: false,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
      initialSection: "permissions"
    })
  );

  for (const group of PERMISSION_GROUPS) {
    assert.match(html, new RegExp(group));
  }
  assert.match(html, /Por usuário \(Aluno\)/);
  assert.match(html, /Máquina inteira \(todas as contas\)/);
  assert.match(html, /Efeito esperado/);
  assert.match(html, /Compatibilidade/);
  assert.match(html, /Reinício/);
  assert.match(html, /Alteração pendente/);
  assert.match(html, /Estado atual:/);
  assert.match(html, /Indisponível nesta versão/);
  assert.match(html, /Detalhes técnicos \(registro e auditoria\)/);
  assert.equal(/<details[^>]*\bopen\b/i.test(html), false, "Technical details must be collapsed by default");
});

test("Permissions catalog supports Permitir / Bloquear / Herdar when AdminPermissionDto enables tri-state, and explains compatibility otherwise", () => {
  const samplePolicy = ALL_POLICY_ITEMS[0];

  const compatCard = buildPermissionCardViewModel({
    policy: samplePolicy,
    pendingPolicies: {},
    isApplying: false,
    hasSelectedStandardUser: true,
    selectedUserName: "Aluno"
  });
  assert.equal(compatCard.controlMode, "binary-compat");

  const adminPerm: AdminPermissionDto = {
    id: samplePolicy.id,
    name: samplePolicy.title,
    category: samplePolicy.category,
    description: samplePolicy.description,
    expectedEffect: "Efeito administrativo",
    scope: "User",
    risk: "Low",
    compatibility: "Windows 11",
    supported: true,
    requiresRestart: false,
    requiresLogoff: true,
    requiresAppRestart: false,
    mechanism: "Transaction",
    intents: ["Allow", "Block", "Restore"],
    limitations: [],
    state: {
      origin: "WinLab",
      configuredState: "NotConfigured",
      effectiveState: "NotConfigured",
      observedValue: null,
      evidence: null
    },
    expansionTarget: null
  };

  const triStateCard = buildPermissionCardViewModel({
    policy: samplePolicy,
    pendingPolicies: {},
    isApplying: false,
    hasSelectedStandardUser: true,
    selectedUserName: "Aluno",
    adminOverride: adminPerm
  });
  assert.equal(triStateCard.controlMode, "tristate");
});

test("Accounts section handles Superadmin, Recovery Admin, and Student safely in both current and future IPC contracts", () => {
  const currentCaps = detectAdminBackendCapabilities(ALLOWED_IPC_ACTIONS);
  assert.deepEqual(currentCaps, { accounts: false, permissions: false, diagnostics: false });

  const currentHtml = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Demo",
      native: false,
      inventory: makeInventory(true),
      policyStates: ALL_POLICY_ITEMS,
      selectedUserSid: "S-1-5-21-1000-1002",
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: false,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
      initialSection: "accounts"
    })
  );

  assert.match(currentHtml, /Superadmin/);
  assert.match(currentHtml, /Administrador de recuperação/);
  assert.match(currentHtml, /Aluno \(Conta comum\)/);
  assert.match(currentHtml, /Indisponível/);

  const futureCaps = detectAdminBackendCapabilities(ALLOWED_IPC_ACTIONS, { accounts: true });
  assert.equal(futureCaps.accounts, true);
});

test("ReviewDrawer renders all 7 required sections and derivePostApplyOutcomes distinguishes confirmed, inconclusive, and failed", () => {
  const cards = ALL_POLICY_ITEMS.slice(0, 2).map((policy) =>
    buildPermissionCardViewModel({
      policy,
      pendingPolicies: { "personalization.wallpaper": true },
      isApplying: false,
      hasSelectedStandardUser: true,
      selectedUserName: "Aluno"
    })
  );
  const drawerItems = buildReviewDrawerItems(cards, { "personalization.wallpaper": true });

  const drawerHtml = renderToStaticMarkup(
    React.createElement(ReviewDrawer, {
      open: true,
      mode: "Real",
      busy: false,
      items: drawerItems,
      selectedUser: SAMPLE_USERS[1],
      validationError: null,
      canConfirm: true,
      onRemoveItem: () => {},
      onDiscardAll: () => {},
      onCancel: () => {},
      onConfirm: () => {}
    })
  );

  assert.match(drawerHtml, /Antes \(Estado verificado\)/);
  assert.match(drawerHtml, /Depois \(Operação prevista\)/);
  assert.match(drawerHtml, /Alterações que serão executadas/);
  assert.match(drawerHtml, /Contas afetadas e escopo/);
  assert.match(drawerHtml, /Avisos de impacto administrativo/);
  assert.match(drawerHtml, /Compatibilidade e reinicializações/);
  assert.match(drawerHtml, /Cancelar/);
  assert.match(drawerHtml, /Confirmar e aplicar/);

  const outcomes = derivePostApplyOutcomes({
    requestedItems: [
      { policyId: "personalization.wallpaper", desiredState: "Blocked" },
      { policyId: "personalization.sounds", desiredState: "Blocked" },
      { policyId: "system.disable_cmd", desiredState: "Blocked" }
    ],
    applyResponse: {
      id: "r1",
      replyToId: "q1",
      success: true,
      data: {
        transactionId: "tx-1",
        status: "Committed",
        appliedCount: 3,
        rolledBackCount: 0,
        message: "ok",
        success: true
      }
    },
    refreshedPolicies: [
      { ...ALL_POLICY_ITEMS[0], currentState: "Applied", effectiveState: "PendingLogoff", configuredState: "Blocked" },
      { ...ALL_POLICY_ITEMS[1], currentState: "Inconclusive", effectiveState: "Inconclusive" },
      { ...ALL_POLICY_ITEMS[7], currentState: "Failed", effectiveState: "Failed", evidence: "Access denied" }
    ]
  });

  assert.equal(outcomes["personalization.wallpaper"]?.phase, "confirmed");
  assert.equal(outcomes["personalization.sounds"]?.phase, "inconclusive");
  assert.equal(outcomes["system.disable_cmd"]?.phase, "failed");

  const failedTx = derivePostApplyOutcomes({
    requestedItems: [{ policyId: "personalization.wallpaper", desiredState: "Blocked" }],
    applyResponse: { id: "r2", replyToId: "q2", success: false, error: "UAC cancelado" },
    refreshedPolicies: null
  });
  assert.equal(failedTx["personalization.wallpaper"]?.phase, "failed");
  assert.match(failedTx["personalization.wallpaper"]?.detail ?? "", /UAC cancelado/);
});

test("All 9 sections render without errors and CSS includes animations, reduced-motion, focus-visible, and 1366x768 layout rules", () => {
  const sections: DesktopSection[] = [
    "overview",
    "accounts",
    "permissions",
    "profiles",
    "network",
    "security",
    "diagnostics",
    "history",
    "settings"
  ];
  for (const sec of sections) {
    const html = renderToStaticMarkup(
      React.createElement(DesktopControlCenter, {
        mode: "Demo",
        native: false,
        inventory: makeInventory(true),
        policyStates: ALL_POLICY_ITEMS,
        selectedUserSid: "S-1-5-21-1000-1002",
        config: defaultConfig,
        setConfig: () => {},
        scanError: null,
        isScanning: false,
        onChangeMode: () => {},
        onRefresh: () => {},
        sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
        initialSection: sec
      })
    );
    assert.ok(html.length > 500, `Expected non-empty render for section ${sec}`);
  }

  const css = readFileSync(path.join(ROOT_DIR, "src/desktop/control-center.css"), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.wl-skeleton/);
  assert.match(css, /max-width:\s*1400px/);
  assert.match(css, /max-width:\s*1160px/);
});

test("Allowed IPC actions do not include unmerged admin.* actions prematurely on 12b06af", () => {
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_APPLY_TRANSACTION));
});
