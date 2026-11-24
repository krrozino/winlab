import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { DesktopControlCenter } from "../src/desktop/DesktopControlCenter";
import { ReviewDrawer, buildReviewDrawerItems } from "../src/desktop/ReviewDrawer";
import {
  buildPermissionCardFromAdminDto,
  buildPermissionCardViewModel,
  DESKTOP_NAVIGATION_ITEMS,
  PERMISSION_GROUPS,
  type DesktopSection
} from "../src/desktop/permissions-catalog";
import { derivePostApplyOutcomes } from "../src/desktop/policy-state-machine";
import {
  ALLOWED_IPC_ACTIONS,
  IPC_CONSTANTS,
  type AdminAccountsDto,
  type AdminPermissionDto,
  type AdminPermissionPreviewDto,
  type AdminPermissionsDto,
  type LocalUserDto,
  type MachineInventoryDto,
  type PolicyItemDto
} from "../src/desktop/contracts";
import {
  AdminCenterSession,
  buildAdminPermissionApplyPayload,
  buildAdminPermissionPreviewPayload,
  buildAdminTargetQueryPayload,
  detectAdminBackendCapabilities,
  isCanonicalLocalWindowsSid,
  isMutationIpcAction
} from "../src/desktop/admin-contracts-compat";
import { MockDesktopAgent } from "../src/desktop/mock-agent";
import { defaultConfig } from "../src/lib/default-config";
import { MILESTONE_3_POLICIES } from "../src/lib/policies";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CANONICAL_ADMIN_SID = "S-1-5-21-100000001-200000002-300000003-500";
const CANONICAL_UNMANAGED_ADMIN_SID = "S-1-5-21-100000001-200000002-300000003-1001";
const CANONICAL_STUDENT_SID = "S-1-5-21-100000001-200000002-300000003-1002";
const CANONICAL_STUDENT_B_SID = "S-1-5-21-100000001-200000002-300000003-1003";

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

function makeInventory(isMock = false, users: LocalUserDto[] = SAMPLE_USERS): MachineInventoryDto {
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
    localUsers: users
  };
}

function makeAdminAccountsFixture(overrides: Partial<AdminAccountsDto> = {}): AdminAccountsDto {
  return {
    accounts: [
      {
        name: "SuperadminLab",
        sid: CANONICAL_ADMIN_SID,
        enabled: true,
        role: "Superadmin",
        privilegeClassification: "Administrator",
        protected: true,
        groupSids: ["S-1-5-32-544"]
      },
      {
        name: "AdminRecuperacao",
        sid: CANONICAL_UNMANAGED_ADMIN_SID,
        enabled: true,
        role: "Unmanaged",
        privilegeClassification: "Administrator",
        protected: true,
        groupSids: ["S-1-5-32-544"]
      },
      {
        name: "Aluno01",
        sid: CANONICAL_STUDENT_SID,
        enabled: true,
        role: "Student",
        privilegeClassification: "StandardUser",
        protected: false,
        groupSids: ["S-1-5-32-545"]
      }
    ],
    recoverySid: null,
    recoveryStatus: "NotDesignated",
    canWrite: true,
    limitations: ["Designe primeiro uma conta Administrador de recuperação independente antes de criar Superadmin."],
    ...overrides
  };
}

function makeAdminPermissionFixture(
  overrides: Partial<AdminPermissionDto> & Pick<AdminPermissionDto, "id" | "name" | "category" | "scope">
): AdminPermissionDto {
  return {
    description: `${overrides.name} — descrição oficial`,
    expectedEffect: `${overrides.name} — efeito esperado`,
    risk: "Low",
    compatibility: "Windows 10/11",
    supported: true,
    requiresRestart: false,
    requiresLogoff: overrides.scope === "User",
    requiresAppRestart: false,
    mechanism: "Transaction",
    intents: ["Preserve", "Block"],
    limitations: [],
    state: {
      origin: "None",
      configuredState: "NotConfigured",
      effectiveState: "NotVerified",
      observedValue: [],
      evidence: "O registro confirma a configuração observada."
    },
    expansionTarget: null,
    ...overrides
  };
}

function makeFullAdminPermissionsDto(canWrite = true): AdminPermissionsDto {
  const newPolicies: AdminPermissionDto[] = [
    makeAdminPermissionFixture({
      id: "personalization.lock_screen",
      name: "Alteração da tela de bloqueio",
      category: "Personalização",
      scope: "Machine",
      intents: canWrite ? ["Preserve", "Restore", "Allow"] : ["Preserve"],
      state: {
        origin: "WinLab",
        configuredState: "Blocked",
        effectiveState: "NotVerified",
        observedValue: [],
        evidence: "Configurado via HKLM."
      }
    }),
    makeAdminPermissionFixture({
      id: "system.task_manager",
      name: "Gerenciador de Tarefas",
      category: "Sistema",
      scope: "User",
      risk: "Medium",
      intents: canWrite ? ["Preserve", "Block"] : ["Preserve"]
    }),
    makeAdminPermissionFixture({
      id: "network.lan_properties",
      name: "Propriedades de conexões LAN",
      category: "Rede",
      scope: "User",
      risk: "Medium",
      intents: canWrite ? ["Preserve", "Block"] : ["Preserve"]
    }),
    makeAdminPermissionFixture({
      id: "settings.hide_network_pages",
      name: "Páginas de rede e proxy em Configurações",
      category: "Configurações",
      scope: "User",
      intents: canWrite ? ["Preserve", "Block"] : ["Preserve"]
    }),
    makeAdminPermissionFixture({
      id: "apps.block_unmanaged_msi",
      name: "Instalação de MSI não gerenciado",
      category: "Aplicativos",
      scope: "Machine",
      risk: "High",
      intents: canWrite ? ["Preserve", "Block"] : ["Preserve"]
    }),
    makeAdminPermissionFixture({
      id: "apps.audit_execution",
      name: "Auditoria de execução e instalação",
      category: "Aplicativos",
      scope: "Machine",
      risk: "High",
      mechanism: "Expansion",
      intents: ["Preserve"],
      expansionTarget: "apps"
    })
  ];

  return {
    target: {
      name: "Aluno01",
      sid: CANONICAL_STUDENT_SID,
      enabled: true,
      role: "Student",
      privilegeClassification: "StandardUser",
      protected: false,
      groupSids: ["S-1-5-32-545"]
    },
    management: {
      status: "NotDetected",
      domain: "NotDetected",
      entra: "NotDetected",
      mdm: "NotDetected",
      entraScope: null
    },
    permissions: newPolicies,
    canWrite
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

test("Deployment guard: vercel.json keeps automatic Vercel deployments disabled", () => {
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
  assert.match(html, /Detalhes técnicos \(registro/);
  assert.equal(/<details[^>]*\bopen\b/i.test(html), false, "Technical details must be collapsed by default");
});

test("Permissions catalog enables admin-intents whenever AdminPermissionDto is present (without requiring Allow+Block simultaneously)", () => {
  const samplePolicy = ALL_POLICY_ITEMS[0];

  const compatCard = buildPermissionCardViewModel({
    policy: samplePolicy,
    pendingPolicies: {},
    isApplying: false,
    hasSelectedStandardUser: true,
    selectedUserName: "Aluno"
  });
  assert.equal(compatCard.controlMode, "binary-compat");

  const adminPerm = makeAdminPermissionFixture({
    id: samplePolicy.id,
    name: samplePolicy.title,
    category: samplePolicy.category,
    scope: "User",
    intents: ["Preserve", "Block"]
  });

  const adminCard = buildPermissionCardFromAdminDto({
    permission: adminPerm,
    canWrite: true,
    isApplying: false,
    hasSelectedStandardUser: true,
    selectedUserName: "Aluno01"
  });
  assert.equal(adminCard.controlMode, "admin-intents");
  assert.equal(adminCard.activeAdminIntent, "Preserve");
});

test("Accounts section handles Superadmin, Recovery Admin, and Student safely in both legacy and administrative contracts", () => {
  const unifiedCaps = detectAdminBackendCapabilities(ALLOWED_IPC_ACTIONS);
  assert.deepEqual(unifiedCaps, { accounts: true, permissions: true, diagnostics: true });

  const legacyAllowlist = ALLOWED_IPC_ACTIONS.filter((action) => !action.startsWith("admin."));
  const legacyCaps = detectAdminBackendCapabilities(legacyAllowlist);
  assert.deepEqual(legacyCaps, { accounts: false, permissions: false, diagnostics: false });

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
  assert.match(css, /\.wl-tristate\s*\{[^}]*flex-wrap:\s*wrap/);
});

test("Allowed IPC actions include both legacy actions and all 7 official admin.* actions", () => {
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_APPLY_TRANSACTION));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_QUERY));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_PREVIEW));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_APPLY));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_ADMIN_DIAGNOSTICS_QUERY));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_QUERY));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_PREVIEW));
  assert.ok(ALLOWED_IPC_ACTIONS.includes(IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_APPLY));
});

test("Strict admin.* payload builders follow AdminRequest.cs validation rules and strip elevatedRead on apply", () => {
  assert.equal(isCanonicalLocalWindowsSid("S-1-5-21-1000-1002"), false);
  assert.equal(isCanonicalLocalWindowsSid("S-1-5-32-544"), false);
  assert.equal(isCanonicalLocalWindowsSid(CANONICAL_STUDENT_SID), true);

  assert.deepEqual(buildAdminTargetQueryPayload(), {});
  assert.deepEqual(buildAdminTargetQueryPayload("S-1-5-21-1000-1002"), {});
  assert.deepEqual(buildAdminTargetQueryPayload(CANONICAL_STUDENT_SID, true), {
    targetUserSid: CANONICAL_STUDENT_SID,
    elevatedRead: true
  });

  const machinePreviewPayload = buildAdminPermissionPreviewPayload({
    permissionId: "apps.block_unmanaged_msi",
    intent: "Block",
    scope: "Machine",
    targetUserSid: CANONICAL_STUDENT_SID,
    elevatedRead: true
  });
  assert.equal("targetUserSid" in machinePreviewPayload, false);
  assert.equal(machinePreviewPayload.elevatedRead, true);

  const userPreviewPayload = buildAdminPermissionPreviewPayload({
    permissionId: "system.task_manager",
    intent: "Block",
    scope: "User",
    targetUserSid: CANONICAL_STUDENT_SID,
    elevatedRead: true
  });
  assert.equal(userPreviewPayload.targetUserSid, CANONICAL_STUDENT_SID);

  const machineApplyPayload = buildAdminPermissionApplyPayload({
    revision: "rev-1",
    permissionId: "apps.block_unmanaged_msi",
    intent: "Block",
    scope: "Machine",
    target: {
      name: "Aluno01",
      sid: CANONICAL_STUDENT_SID,
      enabled: true,
      role: "Student",
      privilegeClassification: "StandardUser",
      protected: false,
      groupSids: []
    },
    before: { origin: "None", configuredState: "NotConfigured", effectiveState: "NotVerified", observedValue: [], evidence: null },
    after: { origin: "WinLab", configuredState: "Blocked", effectiveState: "NotVerified", observedValue: [], evidence: null },
    canApply: true,
    limitations: []
  });
  assert.equal("targetUserSid" in machineApplyPayload.plan, false);
  assert.equal("elevatedRead" in (machineApplyPayload.plan as unknown as Record<string, unknown>), false);

  assert.equal(isMutationIpcAction(IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_APPLY), true);
  assert.equal(isMutationIpcAction(IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_APPLY), true);
  assert.equal(isMutationIpcAction(IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_QUERY), false);
  assert.equal(isMutationIpcAction(IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_PREVIEW), false);
});

test("AdminCenterSession runtime probe sends {} payload, falls back cleanly on MockDesktopAgent, and activates on admin backend", async () => {
  const mockAgent = new MockDesktopAgent();
  const capturedPayloads: { action: string; payload: unknown }[] = [];
  const legacySession = new AdminCenterSession();

  const legacyResult = await legacySession.probeAndLoad(
    async <T>(action: string, payload?: unknown) => {
      capturedPayloads.push({ action, payload });
      return mockAgent.handleRequest<T>({
        id: "probe-1",
        version: IPC_CONSTANTS.PROTOCOL_VERSION,
        timestamp: new Date().toISOString(),
        type: "query",
        action,
        payload
      });
    },
    { targetUserSid: "S-1-5-21-1000-1002" }
  );

  assert.equal(legacyResult.stale, false);
  if (!legacyResult.stale) {
    assert.deepEqual(legacyResult.capabilities, {
      accounts: false,
      permissions: false,
      diagnostics: false
    });
  }
  assert.equal(capturedPayloads[0]?.action, IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_QUERY);
  assert.deepEqual(capturedPayloads[0]?.payload, {});

  const adminSession = new AdminCenterSession();
  const adminAccounts = makeAdminAccountsFixture();
  const adminPerms = makeFullAdminPermissionsDto(true);
  const adminResult = await adminSession.probeAndLoad(
    async <T>(action: string) => {
      if (action === IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_QUERY) {
        return { id: "1", replyToId: "1", success: true, data: adminAccounts as unknown as T };
      }
      if (action === IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_QUERY) {
        return { id: "2", replyToId: "2", success: true, data: adminPerms as unknown as T };
      }
      return {
        id: "3",
        replyToId: "3",
        success: true,
        data: {
          management: adminPerms.management,
          signals: [],
          restrictions: [],
          limitations: []
        } as unknown as T
      };
    },
    { targetUserSid: CANONICAL_STUDENT_SID }
  );

  assert.equal(adminResult.stale, false);
  if (!adminResult.stale) {
    assert.deepEqual(adminResult.capabilities, {
      accounts: true,
      permissions: true,
      diagnostics: true
    });
    assert.equal(adminResult.permissions?.permissions.length, 6);
  }
});

test("AdminCenterSession drops stale queryTarget and previewPermission responses when switching user account", async () => {
  const session = new AdminCenterSession();
  const slowHolder: { resolve?: (val: unknown) => void } = {};

  const slowPromiseA = session.queryTarget(
    <T>(action: string) =>
      new Promise((resolve) => {
        if (action === IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_QUERY) {
          slowHolder.resolve = resolve as (val: unknown) => void;
        }
      }) as Promise<{ id: string; replyToId: string; success: boolean; data?: T }>,
    { targetUserSid: CANONICAL_STUDENT_SID, includePermissions: true, includeDiagnostics: false }
  );

  const fastResultB = await session.queryTarget(
    async <T>() => ({
      id: "fast-b",
      replyToId: "q-b",
      success: true,
      data: makeFullAdminPermissionsDto(true) as unknown as T
    }),
    { targetUserSid: CANONICAL_STUDENT_B_SID, includePermissions: true, includeDiagnostics: false }
  );
  assert.equal(fastResultB.stale, false);

  slowHolder.resolve?.({
    id: "slow-a",
    replyToId: "q-a",
    success: true,
    data: makeFullAdminPermissionsDto(true)
  });
  const staleResultA = await slowPromiseA;
  assert.equal(staleResultA.stale, true);

  const previewHolder: { resolve?: (val: unknown) => void } = {};
  const pendingPreview = session.previewPermission(
    <T>() =>
      new Promise((resolve) => {
        previewHolder.resolve = resolve as (val: unknown) => void;
      }) as Promise<{ id: string; replyToId: string; success: boolean; data?: T }>,
    {
      permissionId: "system.task_manager",
      intent: "Block",
      scope: "User",
      targetUserSid: CANONICAL_STUDENT_B_SID
    }
  );

  session.invalidate(CANONICAL_STUDENT_SID);
  previewHolder.resolve?.({ id: "p1", replyToId: "p1", success: true });
  const stalePreview = await pendingPreview;
  assert.equal(stalePreview.stale, true);
});

test("Administrative permissions UI renders all 5 new PR #40 policies, 4 distinct intents, Expansion strip, and enforces canWrite = false", () => {
  const adminAccounts = makeAdminAccountsFixture();
  const writablePerms = makeFullAdminPermissionsDto(true);

  const writableHtml = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Real",
      native: true,
      inventory: makeInventory(false, []),
      policyStates: ALL_POLICY_ITEMS,
      selectedUserSid: CANONICAL_STUDENT_SID,
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: false,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
      initialSection: "permissions",
      adminCapabilitiesOverride: { accounts: true, permissions: true, diagnostics: true },
      initialAdminAccountsData: adminAccounts,
      initialAdminPermissionsData: writablePerms
    })
  );

  assert.match(writableHtml, /Alterar imagem da tela de bloqueio/);
  assert.match(writableHtml, /Abrir Gerenciador de Tarefas/);
  assert.match(writableHtml, /Alterar propriedades de conexões LAN/);
  assert.match(writableHtml, /Acessar páginas de rede e proxy em Configurações/);
  assert.match(writableHtml, /Executar instaladores MSI não gerenciados/);
  assert.match(writableHtml, />Permitir<\/button>/);
  assert.match(writableHtml, />Bloquear<\/button>/);
  assert.match(writableHtml, />Herdar \/ Preservar<\/button>/);
  assert.match(writableHtml, />Restaurar<\/button>/);
  assert.match(writableHtml, /Auditoria de execução e instalação/);

  const readOnlyPerms = makeFullAdminPermissionsDto(false);
  const readOnlyHtml = renderToStaticMarkup(
    React.createElement(DesktopControlCenter, {
      mode: "Real",
      native: true,
      inventory: makeInventory(false, []),
      policyStates: ALL_POLICY_ITEMS,
      selectedUserSid: CANONICAL_STUDENT_SID,
      config: defaultConfig,
      setConfig: () => {},
      scanError: null,
      isScanning: false,
      onChangeMode: () => {},
      onRefresh: () => {},
      sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
      initialSection: "permissions",
      adminCapabilitiesOverride: { accounts: true, permissions: true, diagnostics: true },
      initialAdminAccountsData: adminAccounts,
      initialAdminPermissionsData: readOnlyPerms
    })
  );

  assert.match(readOnlyHtml, /Modo administrativo somente leitura \(canWrite = false\)/);
  assert.match(readOnlyHtml, /<button[^>]*disabled=""[^>]*>Permitir<\/button>/);
  assert.match(readOnlyHtml, /<button[^>]*disabled=""[^>]*>Bloquear<\/button>/);
  assert.match(readOnlyHtml, /<button[^>]*disabled=""[^>]*>Restaurar<\/button>/);
});

test("ReviewDrawer supports AdminPermissionPreviewDto with UAC elevatedRead retry, canApply blocking, and HKLM admin warning", () => {
  const inconclusiveUserPreview: AdminPermissionPreviewDto = {
    revision: "rev-user-inconclusive",
    permissionId: "system.task_manager",
    intent: "Block",
    scope: "User",
    target: {
      name: "Aluno01",
      sid: CANONICAL_STUDENT_SID,
      enabled: true,
      role: "Student",
      privilegeClassification: "StandardUser",
      protected: false,
      groupSids: []
    },
    before: {
      origin: "Inconclusive",
      configuredState: "Inconclusive",
      effectiveState: "NotVerified",
      observedValue: null,
      evidence: "Perfil offline não pôde ser consultado."
    },
    after: {
      origin: "WinLab",
      configuredState: "Blocked",
      effectiveState: "NotVerified",
      observedValue: [],
      evidence: null
    },
    canApply: false,
    limitations: ["Solicite leitura sob UAC para consultar o perfil."]
  };

  const blockedHtml = renderToStaticMarkup(
    React.createElement(ReviewDrawer, {
      open: true,
      mode: "Real",
      busy: false,
      items: [],
      selectedUser: null,
      validationError: null,
      canConfirm: false,
      adminPreview: {
        preview: inconclusiveUserPreview,
        permission: makeAdminPermissionFixture({
          id: "system.task_manager",
          name: "Gerenciador de Tarefas",
          category: "Sistema",
          scope: "User"
        }),
        elevatedReadUsed: false,
        canWrite: true
      },
      onRetryElevatedAdminPreview: () => {},
      onConfirmAdminPreview: () => {},
      onRemoveItem: () => {},
      onDiscardAll: () => {},
      onCancel: () => {},
      onConfirm: () => {}
    })
  );

  assert.match(blockedHtml, /Repetir prévia sob UAC \(leitura elevada\)/);
  assert.match(blockedHtml, /canApply = false/);
  assert.match(blockedHtml, /Solicite leitura sob UAC para consultar o perfil\./);
  assert.match(blockedHtml, /<button[^>]*disabled[^>]*>Confirmar e aplicar<\/button>/);

  const machinePreview: AdminPermissionPreviewDto = {
    revision: "rev-machine-ok",
    permissionId: "apps.block_unmanaged_msi",
    intent: "Block",
    scope: "Machine",
    target: null,
    before: {
      origin: "None",
      configuredState: "NotConfigured",
      effectiveState: "NotVerified",
      observedValue: [],
      evidence: null
    },
    after: {
      origin: "WinLab",
      configuredState: "Blocked",
      effectiveState: "NotVerified",
      observedValue: [],
      evidence: null
    },
    canApply: true,
    limitations: ["Configuração para toda a máquina, incluindo contas administrativas."]
  };

  const machineHtml = renderToStaticMarkup(
    React.createElement(ReviewDrawer, {
      open: true,
      mode: "Real",
      busy: false,
      items: [],
      selectedUser: null,
      validationError: null,
      canConfirm: false,
      adminPreview: {
        preview: machinePreview,
        permission: makeAdminPermissionFixture({
          id: "apps.block_unmanaged_msi",
          name: "Instalação de MSI não gerenciado",
          category: "Aplicativos",
          scope: "Machine"
        }),
        canWrite: true
      },
      onConfirmAdminPreview: () => {},
      onRemoveItem: () => {},
      onDiscardAll: () => {},
      onCancel: () => {},
      onConfirm: () => {}
    })
  );

  assert.match(machineHtml, /inclusive administradores e Superadmin/);
  assert.equal(/<button[^>]*disabled[^>]*>Confirmar e aplicar<\/button>/.test(machineHtml), false);
});

test("AccountsSectionView shows ProtectRecovery on Unmanaged Admin, SetEnabled on Student, and honors UX admin-impact copy rules", () => {
  const adminAccounts = makeAdminAccountsFixture();
  const sections: DesktopSection[] = ["overview", "accounts", "permissions", "security"];

  for (const sec of sections) {
    const html = renderToStaticMarkup(
      React.createElement(DesktopControlCenter, {
        mode: "Real",
        native: true,
        inventory: makeInventory(false, []),
        policyStates: ALL_POLICY_ITEMS,
        selectedUserSid: CANONICAL_STUDENT_SID,
        config: defaultConfig,
        setConfig: () => {},
        scanError: null,
        isScanning: false,
        onChangeMode: () => {},
        onRefresh: () => {},
        sendIpc: async () => ({ id: "1", replyToId: "1", success: true }),
        initialSection: sec,
        adminCapabilitiesOverride: { accounts: true, permissions: true, diagnostics: true },
        initialAdminAccountsData: adminAccounts,
        initialAdminPermissionsData: makeFullAdminPermissionsDto(true)
      })
    );

    assert.equal(
      /imunidade automática|Administradores são imunes|nunca recebem restrições/i.test(html),
      false,
      `Section '${sec}' must not claim blanket automatic immunity`
    );

    if (sec === "accounts") {
      assert.match(html, /Proteger recuperação/);
      assert.match(html, /Desativar conta/);
      assert.match(html, /Designe primeiro um administrador local independente \(Unmanaged\)/);
      assert.match(html, /políticas de máquina inteira \(HKLM\) ainda podem afetá-los/i);
    }
    if (sec === "permissions") {
      assert.match(html, /inclusive administradores e Superadmin/);
    }
  }
});
