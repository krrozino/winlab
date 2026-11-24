"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { Config, OperatingMode, PresetId } from "@/lib/types";
import type {
  ApplyTransactionResultDto,
  BaselineCreationResultDto,
  DesktopIpcTransport,
  IpcEnvelope,
  IpcResponse,
  LocalUserDto,
  MachineInventoryDto,
  NetworkShareEnvironmentDto,
  PolicyItemDto,
  PolicyStateSummaryDto,
  RollbackResultDto,
  UpdateStatusDto
} from "@/desktop/contracts";
import { IPC_CONSTANTS } from "@/desktop/contracts";
import type { PreflightSnapshotWithMessage } from "@/desktop/machine-data-session";
import {
  SavedPolicyProfile,
  buildValidatedTransactionRequest,
  computePolicyDriftSummary,
  computeSavedProfileDiff,
  derivePostApplyOutcomes,
  getEligibleTargetUsers,
  isPolicyCurrentlyEnabled,
  togglePolicyPendingState,
  transitionTargetUserContext,
  type PolicyExecutionOutcome
} from "@/desktop/policy-state-machine";
import {
  ADMIN_IPC_ACTIONS,
  AdminCenterSession,
  buildAdminPermissionApplyPayload,
  isCanonicalLocalWindowsSid,
  type AdminAccountsDto,
  type AdminBackendCapabilities,
  type AdminDiagnosticsDto,
  type AdminPermissionDto,
  type AdminPermissionIntent,
  type AdminPermissionResultDto,
  type AdminPermissionsDto
} from "@/desktop/admin-contracts-compat";
import {
  DESKTOP_NAVIGATION_ITEMS,
  GLOBAL_SEARCH_CATALOG,
  SECTION_HELP_CONTENT,
  buildPermissionCardFromAdminDto,
  buildPermissionCardViewModel,
  type DesktopSection,
  type PermissionGroup
} from "@/desktop/permissions-catalog";
import {
  PermissionsCenterView,
  type ScopeFilter,
  type StatusFilter
} from "@/desktop/PermissionsCenterView";
import { AccountsSectionView } from "@/desktop/AccountsSectionView";
import {
  ReviewDrawer,
  buildReviewDrawerItems,
  type AdminDrawerPreviewState
} from "@/desktop/ReviewDrawer";
import { DiagnosticReport } from "@/desktop/DiagnosticReport";
import { FirstRunWizard } from "@/desktop/FirstRunWizard";
import { presets, getPreset } from "@/lib/presets";
import { parseConfigJson, serializeConfig } from "@/lib/config-io";
import {
  DEFAULT_NETWORK_SHARE,
  NetworkShareModel,
  NetworkSharePlan,
  generateShareClientScript,
  generateShareDiagnosticsScript,
  generateShareServerScript,
  validateNetworkShare
} from "@/lib/network-share";

export interface DesktopControlCenterProps {
  mode: OperatingMode;
  native: boolean;
  inventory: MachineInventoryDto | null;
  policySummary?: PolicyStateSummaryDto | null;
  policyStates: PolicyItemDto[] | null;
  preflightData?: PreflightSnapshotWithMessage | null;
  selectedUserSid?: string | null;
  onSelectUser?: (sid: string | null) => void | Promise<unknown>;
  onQueryOfflineProfile?: (sid: string | null) => void | Promise<unknown>;
  config: Config;
  setConfig: (config: Config) => void;
  scanError: string | null;
  isScanning: boolean;
  onChangeMode: (mode: OperatingMode) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onAdvanced?: () => void;
  sendIpc: <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;
  initialSection?: DesktopSection;
  adminCapabilitiesOverride?: Partial<AdminBackendCapabilities>;
  initialAdminAccountsData?: AdminAccountsDto | null;
  initialAdminPermissionsData?: AdminPermissionsDto | null;
  initialAdminDiagnosticsData?: AdminDiagnosticsDto | null;
}

interface SessionTransactionEntry {
  transactionId: string;
  appliedAt: string;
  targetUserName?: string;
  targetUserSid?: string;
  appliedCount: number;
  status: "Committed" | "RolledBack";
}

function SectionIcon({ id }: { id: DesktopSection }) {
  const common = {
    width: 17,
    height: 17,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const
  };
  switch (id) {
    case "overview":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="5" rx="1.5" />
          <rect x="13" y="10" width="8" height="11" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
        </svg>
      );
    case "accounts":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "permissions":
      return (
        <svg {...common} aria-hidden="true">
          <line x1="4" y1="6" x2="20" y2="6" />
          <circle cx="9" cy="6" r="2.5" fill="currentColor" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <circle cx="15" cy="12" r="2.5" fill="currentColor" />
          <line x1="4" y1="18" x2="20" y2="18" />
          <circle cx="10" cy="18" r="2.5" fill="currentColor" />
        </svg>
      );
    case "profiles":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "network":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="9" y="2" width="6" height="6" rx="1" />
          <rect x="2" y="16" width="6" height="6" rx="1" />
          <rect x="16" y="16" width="6" height="6" rx="1" />
          <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
          <line x1="12" y1="12" x2="12" y2="8" />
        </svg>
      );
    case "security":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "diagnostics":
      return (
        <svg {...common} aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "history":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <polyline points="3 3 3 8 8 8" />
          <polyline points="12 7 12 12 15 14" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

function invalidateUserScopedAdminPermissions(
  prev: AdminPermissionsDto | null,
  nextSid: string | null
): AdminPermissionsDto | null {
  if (!prev) return null;
  const evidence = nextSid
    ? "Consultando estado real da conta selecionada..."
    : "Selecione uma conta comum válida para consultar políticas por usuário.";
  return {
    ...prev,
    target: null,
    permissions: prev.permissions.map((perm) =>
      perm.scope === "User"
        ? {
            ...perm,
            intents: ["Preserve"],
            state: {
              ...perm.state,
              origin: "Inconclusive",
              configuredState: "Inconclusive",
              effectiveState: "NotVerified",
              observedValue: null,
              evidence
            }
          }
        : perm
    )
  };
}

export function DesktopControlCenter({
  mode,
  native,
  inventory,
  policySummary,
  policyStates,
  preflightData,
  selectedUserSid: externalSelectedUserSid,
  onSelectUser,
  onQueryOfflineProfile,
  config,
  setConfig,
  scanError,
  isScanning,
  onChangeMode,
  onRefresh,
  onAdvanced,
  sendIpc,
  initialSection = "overview",
  adminCapabilitiesOverride,
  initialAdminAccountsData = null,
  initialAdminPermissionsData = null,
  initialAdminDiagnosticsData = null
}: DesktopControlCenterProps) {
  const [section, setSection] = useState<DesktopSection>(initialSection);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error" | "warning";
    message: string;
  } | null>(null);
  const [pendingPolicies, setPendingPolicies] = useState<Record<string, boolean>>({});
  const [executionOutcomes, setExecutionOutcomes] = useState<Record<string, PolicyExecutionOutcome>>(
    {}
  );
  const [drawerBatchResult, setDrawerBatchResult] = useState<{
    hasError: boolean;
    hasInconclusive: boolean;
    message: string;
  } | null>(null);
  const [localSelectedUserSid, setLocalSelectedUserSid] = useState<string | null>(
    externalSelectedUserSid ?? null
  );
  const [displayPolicies, setDisplayPolicies] = useState<PolicyItemDto[] | null>(policyStates);
  const [showReviewDrawer, setShowReviewDrawer] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<SessionTransactionEntry[]>([]);
  const [latestBaseline, setLatestBaseline] = useState<BaselineCreationResultDto | null>(null);

  // Pesquisa global, filtros da central de permissoes e ajuda contextual
  const [globalSearch, setGlobalSearch] = useState("");
  const [permSearch, setPermSearch] = useState("");
  const [selectedPermGroup, setSelectedPermGroup] = useState<PermissionGroup | "all">("all");
  const [permScopeFilter, setPermScopeFilter] = useState<ScopeFilter>("all");
  const [permStatusFilter, setPermStatusFilter] = useState<StatusFilter>("all");
  const [showContextHelp, setShowContextHelp] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [showWizardModal, setShowWizardModal] = useState(false);
  const [reducedMotionPref, setReducedMotionPref] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const upgradedFoundationKeyRef = useRef<string | null>(null);

  // Contratos administrativos (sondagem dinâmica em runtime com guarda contra respostas obsoletas)
  const adminSessionRef = useRef<AdminCenterSession | null>(null);
  if (!adminSessionRef.current) {
    adminSessionRef.current = new AdminCenterSession();
  }
  const [adminCapabilities, setAdminCapabilities] = useState<AdminBackendCapabilities>(() => ({
    accounts: adminCapabilitiesOverride?.accounts ?? Boolean(initialAdminAccountsData),
    permissions: adminCapabilitiesOverride?.permissions ?? Boolean(initialAdminPermissionsData),
    diagnostics: adminCapabilitiesOverride?.diagnostics ?? Boolean(initialAdminDiagnosticsData)
  }));
  const [adminAccountsData, setAdminAccountsData] = useState<AdminAccountsDto | null>(
    initialAdminAccountsData
  );
  const [adminPermissionsData, setAdminPermissionsData] = useState<AdminPermissionsDto | null>(
    initialAdminPermissionsData
  );
  const [adminDiagnosticsData, setAdminDiagnosticsData] = useState<AdminDiagnosticsDto | null>(
    initialAdminDiagnosticsData
  );
  const [adminPermPreview, setAdminPermPreview] = useState<AdminDrawerPreviewState | null>(null);

  // Criacao de contas locais
  const [accountRole, setAccountRole] = useState<"standard" | "admin">("standard");
  const [accountName, setAccountName] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  // Rede SMB, canal de atualizacao e perfis locais salvos (sem credenciais)
  const [network, setNetwork] = useState<NetworkSharePlan>(DEFAULT_NETWORK_SHARE);
  const [networkStudentAccounts, setNetworkStudentAccounts] = useState<string>(
    config.studentUser || "Aluno"
  );
  const [networkEnvironment, setNetworkEnvironment] = useState<NetworkShareEnvironmentDto | null>(
    null
  );
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusDto | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedPolicyProfile[]>([]);
  const [newProfileName, setNewProfileName] = useState<string>("");

  // Carrega preferencias locais seguras (sem credenciais)
  useEffect(() => {
    try {
      const rawProfiles = window.localStorage.getItem("winlab:desktop:saved-profiles:v1");
      if (rawProfiles) {
        const parsed = JSON.parse(rawProfiles);
        if (Array.isArray(parsed)) {
          setSavedProfiles(
            parsed.filter(
              (item): item is SavedPolicyProfile =>
                Boolean(
                  item &&
                    typeof item.id === "string" &&
                    typeof item.name === "string" &&
                    item.policies &&
                    typeof item.policies === "object"
                )
            )
          );
        }
      }
      const motionPref = window.localStorage.getItem("winlab:desktop:reduced-motion:v1");
      if (motionPref === "true") {
        setReducedMotionPref(true);
      }
    } catch {
      // Ignora armazenamento indisponivel ou corrompido
    }
  }, []);

  // Atalho de teclado '/' para foco na pesquisa global
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setDisplayPolicies(policyStates);
  }, [policyStates]);

  const nonAdminUsers = useMemo<LocalUserDto[]>(() => {
    if (adminCapabilities.accounts && adminAccountsData?.accounts?.length) {
      return adminAccountsData.accounts
        .filter(
          (acc) =>
            acc.enabled &&
            !acc.protected &&
            acc.role === "Student" &&
            acc.privilegeClassification === "StandardUser" &&
            isCanonicalLocalWindowsSid(acc.sid)
        )
        .map((acc) => ({
          name: acc.name,
          enabled: acc.enabled,
          isAdmin: false,
          privilegeClassification: acc.privilegeClassification,
          sid: acc.sid ?? undefined
        }));
    }
    return getEligibleTargetUsers(inventory?.localUsers);
  }, [adminCapabilities.accounts, adminAccountsData, inventory?.localUsers]);

  const selectedUserSid =
    externalSelectedUserSid !== undefined ? externalSelectedUserSid : localSelectedUserSid;
  const selectedUserSidRef = useRef<string | null>(selectedUserSid);
  selectedUserSidRef.current = selectedUserSid;

  useEffect(() => {
    if (nonAdminUsers.length > 0) {
      const stillValid =
        selectedUserSid !== null &&
        nonAdminUsers.some((u) => u.sid?.toLowerCase() === selectedUserSid.toLowerCase());
      if (!stillValid) {
        const defaultSid = nonAdminUsers[0]?.sid ?? null;
        setLocalSelectedUserSid(defaultSid);
        if (defaultSid && onSelectUser) {
          void onSelectUser(defaultSid);
        }
      }
    } else if (selectedUserSid !== null) {
      setLocalSelectedUserSid(null);
    }
  }, [nonAdminUsers, selectedUserSid, onSelectUser]);

  const realConnected = native && mode === "Real" && inventory?.isMock !== true && !scanError;
  const demoConnected = mode === "Demo" && inventory !== null && !scanError;
  const canOperateAgent = realConnected || demoConnected;

  const refreshSystemDiagnostics = useCallback(async () => {
    if (!canOperateAgent) {
      setNetworkEnvironment(null);
      setUpdateStatus(null);
      return;
    }
    const [updateRes, netRes] = await Promise.all([
      sendIpc<UpdateStatusDto>(IPC_CONSTANTS.ACTION_QUERY_UPDATE_STATUS),
      sendIpc<NetworkShareEnvironmentDto>(IPC_CONSTANTS.ACTION_QUERY_NETWORK_SHARES)
    ]);
    if (updateRes.success && updateRes.data) {
      setUpdateStatus(updateRes.data);
    }
    if (netRes.success && netRes.data) {
      if (mode === "Real" && netRes.data.isMock) {
        setNetworkEnvironment(null);
      } else {
        setNetworkEnvironment(netRes.data);
      }
    }
  }, [canOperateAgent, mode, sendIpc]);

  const refreshAdminCapabilitiesData = useCallback(async () => {
    const session = adminSessionRef.current;
    if (!session) return;
    if (!canOperateAgent) {
      session.invalidate(null);
      setAdminCapabilities({
        accounts: adminCapabilitiesOverride?.accounts ?? false,
        permissions: adminCapabilitiesOverride?.permissions ?? false,
        diagnostics: adminCapabilitiesOverride?.diagnostics ?? false
      });
      setAdminAccountsData(null);
      setAdminPermissionsData(null);
      setAdminDiagnosticsData(null);
      setAdminPermPreview(null);
      return;
    }

    const res = await session.probeAndLoad(sendIpc, {
      targetUserSid: selectedUserSidRef.current,
      override: adminCapabilitiesOverride
    });
    if (res.stale) return;

    setAdminCapabilities(res.capabilities);
    setAdminAccountsData(res.accounts);
    setAdminPermissionsData(res.permissions);
    setAdminDiagnosticsData(res.diagnostics);
  }, [canOperateAgent, adminCapabilitiesOverride, sendIpc]);

  const refreshAdminTarget = useCallback(
    async (targetSid: string | null, elevatedRead = false) => {
      const session = adminSessionRef.current;
      if (!session || !canOperateAgent) return null;
      if (!adminCapabilities.permissions && !adminCapabilities.diagnostics) return null;
      const result = await session.queryTarget(sendIpc, {
        targetUserSid: targetSid,
        elevatedRead,
        includePermissions: adminCapabilities.permissions,
        includeDiagnostics: adminCapabilities.diagnostics
      });
      if (result.stale) return result;
      if (result.permissions) setAdminPermissionsData(result.permissions);
      if (result.diagnostics) setAdminDiagnosticsData(result.diagnostics);
      return result;
    },
    [canOperateAgent, adminCapabilities.permissions, adminCapabilities.diagnostics, sendIpc]
  );

  useEffect(() => {
    setNetworkEnvironment(null);
    setUpdateStatus(null);
    setAdminPermPreview(null);
    if (canOperateAgent) {
      void refreshSystemDiagnostics();
      void refreshAdminCapabilitiesData();
    } else {
      adminSessionRef.current?.invalidate(null);
      setAdminAccountsData(null);
      setAdminPermissionsData(null);
      setAdminDiagnosticsData(null);
    }
  }, [canOperateAgent, mode, refreshSystemDiagnostics, refreshAdminCapabilitiesData]);

  useEffect(() => {
    if (!canOperateAgent) return;
    if (!adminCapabilities.permissions && !adminCapabilities.diagnostics) return;
    if (adminSessionRef.current?.getTargetSid() === (selectedUserSid ?? null)) return;
    void refreshAdminTarget(selectedUserSid ?? null, false);
  }, [
    canOperateAgent,
    adminCapabilities.permissions,
    adminCapabilities.diagnostics,
    selectedUserSid,
    refreshAdminTarget
  ]);

  // Garante carregamento do catalogo interativo completo (12 politicas) se veio do resumo inicial
  useEffect(() => {
    if (!canOperateAgent || !policyStates || policyStates.length === 0) return;
    const isFoundationSummary =
      policyStates.every((p) => !p.scope) ||
      policyStates.some((p) => p.scope === "Device" || p.id === "applocker.mode");
    if (!isFoundationSummary) return;

    const upgradeKey = `${mode}:${selectedUserSid ?? "none"}`;
    if (upgradedFoundationKeyRef.current === upgradeKey) return;
    upgradedFoundationKeyRef.current = upgradeKey;

    if (onSelectUser) {
      void onSelectUser(selectedUserSid ?? null);
    } else {
      void sendIpc<PolicyStateSummaryDto>(
        IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES,
        selectedUserSid ? { targetUserSid: selectedUserSid } : undefined
      ).then((res) => {
        if (res.success && res.data) {
          setDisplayPolicies(res.data.items);
        }
      });
    }
  }, [canOperateAgent, mode, policyStates, selectedUserSid, onSelectUser, sendIpc]);

  const driftSummary = useMemo(
    () => computePolicyDriftSummary(displayPolicies),
    [displayPolicies]
  );

  const selectedUser = useMemo(
    () =>
      nonAdminUsers.find(
        (u) => (u.sid?.toLowerCase() ?? "") === (selectedUserSid?.toLowerCase() ?? "")
      ) ?? null,
    [nonAdminUsers, selectedUserSid]
  );

  const permissionCards = useMemo(() => {
    if (adminCapabilities.permissions && adminPermissionsData) {
      return adminPermissionsData.permissions
        .filter((item) => item.mechanism === "Transaction")
        .map((permission) =>
          buildPermissionCardFromAdminDto({
            permission,
            canWrite: adminPermissionsData.canWrite,
            isApplying: busy,
            hasSelectedStandardUser: selectedUser !== null,
            selectedUserName: selectedUser?.name ?? null,
            executionOutcome: executionOutcomes[permission.id]
          })
        );
    }
    return (displayPolicies ?? []).map((policy) =>
      buildPermissionCardViewModel({
        policy,
        pendingPolicies,
        isApplying: busy,
        hasSelectedStandardUser: selectedUser !== null,
        selectedUserName: selectedUser?.name ?? null,
        executionOutcome: executionOutcomes[policy.id]
      })
    );
  }, [
    displayPolicies,
    pendingPolicies,
    busy,
    selectedUser,
    executionOutcomes,
    adminCapabilities.permissions,
    adminPermissionsData
  ]);

  const reviewDrawerItems = useMemo(
    () => buildReviewDrawerItems(permissionCards, pendingPolicies),
    [permissionCards, pendingPolicies]
  );

  const transactionValidation = useMemo(() => {
    if (Object.keys(pendingPolicies).length === 0) return null;
    return buildValidatedTransactionRequest({
      pendingPolicies,
      policies: displayPolicies,
      selectedUserSid: selectedUserSid ?? null,
      localUsers: inventory?.localUsers
    });
  }, [pendingPolicies, displayPolicies, selectedUserSid, inventory?.localUsers]);

  const hasUserScopedPending = useMemo(
    () =>
      (displayPolicies ?? []).some(
        (p) => p.scope === "User" && pendingPolicies[p.id] !== undefined
      ),
    [displayPolicies, pendingPolicies]
  );

  const hasInconclusiveUserPolicies = useMemo(() => {
    if (!selectedUserSid) return false;
    if (adminCapabilities.permissions && adminPermissionsData) {
      return adminPermissionsData.permissions.some(
        (p) =>
          p.scope === "User" &&
          (p.state.configuredState === "Inconclusive" ||
            p.state.effectiveState === "Inconclusive" ||
            p.state.origin === "Inconclusive")
      );
    }
    return (displayPolicies ?? []).some(
      (p) =>
        p.scope === "User" &&
        (p.effectiveState === "Inconclusive" || p.currentState === "Inconclusive")
    );
  }, [adminCapabilities.permissions, adminPermissionsData, displayPolicies, selectedUserSid]);

  const pendingCount = Object.keys(pendingPolicies).length;
  const canApply =
    canOperateAgent && pendingCount > 0 && (!hasUserScopedPending || selectedUser !== null);

  const handleTogglePolicyCard = useCallback(
    (card: { id: string }) => {
      const targetPolicy = displayPolicies?.find((p) => p.id === card.id);
      if (!targetPolicy) return;
      setPendingPolicies((prev) => togglePolicyPendingState(prev, targetPolicy));
      setDrawerBatchResult(null);
    },
    [displayPolicies]
  );

  const handleRemovePendingItem = useCallback(
    (policyId: string) => {
      const remainingKeys = Object.keys(pendingPolicies).filter((k) => k !== policyId);
      setPendingPolicies((prev) => {
        const next = { ...prev };
        delete next[policyId];
        return next;
      });
      if (remainingKeys.length === 0) {
        setShowReviewDrawer(false);
      }
    },
    [pendingPolicies]
  );

  const handleUserSwitch = useCallback(
    async (nextSidRaw: string) => {
      const nextSid = nextSidRaw.trim() ? nextSidRaw.trim() : null;
      const transition = transitionTargetUserContext({
        previousSid: selectedUserSid ?? null,
        nextSid,
        pendingPolicies,
        policies: displayPolicies
      });

      adminSessionRef.current?.invalidate(nextSid);
      setLocalSelectedUserSid(nextSid);
      setPendingPolicies(transition.nextPendingPolicies);
      setDisplayPolicies(transition.invalidatedPolicies);
      setAdminPermissionsData((prev) => invalidateUserScopedAdminPermissions(prev, nextSid));
      setAdminPermPreview((prev) => (prev?.preview.scope === "User" ? null : prev));
      setExecutionOutcomes({});

      if (transition.clearedUserPendingCount > 0) {
        setFeedback({
          tone: "warning",
          message: `${transition.clearedUserPendingCount} alteração(ões) pendente(s) da conta anterior foram descartadas ao trocar de conta.`
        });
      } else {
        setFeedback(null);
      }

      const legacyPromise = onSelectUser
        ? onSelectUser(nextSid)
        : nextSid
          ? sendIpc<PolicyStateSummaryDto>(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES, {
              targetUserSid: nextSid
            }).then((res) => {
              if (res.success && res.data) {
                setDisplayPolicies(res.data.items);
              } else if (res.error) {
                setFeedback({ tone: "error", message: res.error });
              }
            })
          : Promise.resolve();

      const adminPromise =
        adminCapabilities.permissions || adminCapabilities.diagnostics
          ? refreshAdminTarget(nextSid, false)
          : Promise.resolve(null);

      await Promise.all([legacyPromise, adminPromise]);
    },
    [
      selectedUserSid,
      pendingPolicies,
      displayPolicies,
      onSelectUser,
      sendIpc,
      adminCapabilities.permissions,
      adminCapabilities.diagnostics,
      refreshAdminTarget
    ]
  );

  const handleQueryOfflineProfile = useCallback(async () => {
    if (!selectedUserSid) return;
    setBusy(true);
    setFeedback(null);
    try {
      if (adminCapabilities.permissions || adminCapabilities.diagnostics) {
        const adminRes = await refreshAdminTarget(selectedUserSid, true);
        if (adminRes && !adminRes.stale) {
          if (adminRes.permissionsError) {
            setFeedback({ tone: "error", message: adminRes.permissionsError });
          } else if (adminRes.permissions) {
            setFeedback({
              tone: "success",
              message: `Perfil da conta '${selectedUser?.name ?? selectedUserSid}' consultado sob UAC com sucesso.`
            });
          }
        }
      }

      if (!adminCapabilities.permissions) {
        if (onQueryOfflineProfile) {
          await onQueryOfflineProfile(selectedUserSid);
        } else {
          const res = await sendIpc<PolicyStateSummaryDto>(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES, {
            targetUserSid: selectedUserSid,
            allowElevation: true
          });
          if (res.success && res.data) {
            setDisplayPolicies(res.data.items);
            setFeedback({
              tone: "success",
              message: `Perfil da conta '${selectedUser?.name ?? selectedUserSid}' consultado com sucesso.`
            });
          } else {
            setFeedback({
              tone: "error",
              message: res.error || "Não foi possível ler o perfil offline desta conta."
            });
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }, [
    selectedUserSid,
    selectedUser?.name,
    adminCapabilities.permissions,
    adminCapabilities.diagnostics,
    refreshAdminTarget,
    onQueryOfflineProfile,
    sendIpc
  ]);

  const applyPendingChanges = useCallback(async () => {
    if (!canOperateAgent) {
      setFeedback({
        tone: "error",
        message: "Conecte ao Windows real (no aplicativo instalado) ou ative o Modo Demonstração."
      });
      return;
    }

    const validation = buildValidatedTransactionRequest({
      pendingPolicies,
      policies: displayPolicies,
      selectedUserSid: selectedUserSid ?? null,
      localUsers: inventory?.localUsers
    });

    if (!validation.valid || !validation.request) {
      setFeedback({
        tone: "error",
        message: validation.error || "Selecione um usuário válido antes de aplicar."
      });
      return;
    }

    setBusy(true);
    setFeedback(null);
    setDrawerBatchResult(null);

    try {
      const response = await sendIpc<ApplyTransactionResultDto>(
        IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
        validation.request
      );

      let refreshedItems: PolicyItemDto[] | null = null;
      if (onSelectUser) {
        const selectRes = (await onSelectUser(selectedUserSid ?? null)) as
          | IpcResponse<PolicyStateSummaryDto>
          | undefined;
        if (selectRes && selectRes.success && selectRes.data?.items) {
          refreshedItems = selectRes.data.items;
          setDisplayPolicies(selectRes.data.items);
        }
      }

      if (!refreshedItems) {
        const refreshed = await sendIpc<PolicyStateSummaryDto>(
          IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES,
          selectedUserSid ? { targetUserSid: selectedUserSid } : undefined
        );
        if (refreshed.success && refreshed.data?.items) {
          refreshedItems = refreshed.data.items;
          setDisplayPolicies(refreshed.data.items);
        }
        if (!onSelectUser) {
          await onRefresh();
        }
      }

      const outcomes = derivePostApplyOutcomes({
        requestedItems: validation.request.policies,
        applyResponse: response,
        refreshedPolicies: refreshedItems
      });
      setExecutionOutcomes((prev) => ({ ...prev, ...outcomes }));

      const outcomeValues = Object.values(outcomes);
      const hasFailedOutcome = outcomeValues.some((o) => o.phase === "failed");
      const hasInconclusiveOutcome = outcomeValues.some((o) => o.phase === "inconclusive");

      if (response.success && response.data?.success) {
        const txData = response.data;
        setPendingPolicies({});
        setTransactionHistory((prev) => [
          {
            transactionId: txData.transactionId,
            appliedAt: new Date().toISOString(),
            targetUserName: validation.request?.targetUserName,
            targetUserSid: validation.request?.targetUserSid,
            appliedCount: txData.appliedCount,
            status: "Committed"
          },
          ...prev.slice(0, 14)
        ]);

        const followUp: string[] = [];
        if (validation.requiresRestart) followUp.push("reinicie o computador");
        if (validation.requiresLogoff) followUp.push("encerre e inicie novamente a sessão da conta comum");
        if (validation.requiresAppRestart) followUp.push("feche e reabra o navegador");

        const followUpNote =
          followUp.length > 0 ? ` Para concluir o efeito em sessão ativa, ${followUp.join(" e ")}.` : "";

        const summaryMsg = hasInconclusiveOutcome
          ? `${txData.appliedCount} política(s) processada(s), porém com item(ns) inconclusivo(s) na releitura.${followUpNote}`
          : `Confirmada: ${txData.appliedCount} política(s) aplicada(s) e verificada(s)${mode === "Demo" ? " em modo de demonstração" : " no Windows"}.${followUpNote}`;

        setFeedback({
          tone: hasInconclusiveOutcome || followUp.length > 0 ? "warning" : "success",
          message: summaryMsg
        });

        if (hasInconclusiveOutcome || hasFailedOutcome) {
          setDrawerBatchResult({
            hasError: hasFailedOutcome,
            hasInconclusive: hasInconclusiveOutcome,
            message: summaryMsg
          });
        } else {
          setDrawerBatchResult(null);
          setShowReviewDrawer(false);
        }
      } else {
        const errorMsg =
          response.error ||
          response.data?.message ||
          "Não foi possível concluir a aplicação. As alterações foram revertidas.";
        setFeedback({ tone: "error", message: errorMsg });
        setDrawerBatchResult({
          hasError: true,
          hasInconclusive: false,
          message: errorMsg
        });
      }
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Erro inesperado ao aplicar alterações.";
      setFeedback({ tone: "error", message: errorMsg });
      setDrawerBatchResult({
        hasError: true,
        hasInconclusive: false,
        message: errorMsg
      });
    } finally {
      setBusy(false);
    }
  }, [
    canOperateAgent,
    pendingPolicies,
    displayPolicies,
    selectedUserSid,
    inventory?.localUsers,
    sendIpc,
    onSelectUser,
    onRefresh,
    mode
  ]);

  const handleSelectAdminIntent = useCallback(
    async (permission: AdminPermissionDto, intent: AdminPermissionIntent, elevatedRead = false) => {
      if (!adminCapabilities.permissions || !adminSessionRef.current) return;
      if (permission.scope === "User" && !isCanonicalLocalWindowsSid(selectedUserSid)) {
        setFeedback({
          tone: "error",
          message:
            "Selecione uma conta comum com SID local válido antes de pré-visualizar permissões por usuário."
        });
        return;
      }

      setBusy(true);
      setFeedback(null);
      try {
        const previewResult = await adminSessionRef.current.previewPermission(sendIpc, {
          permissionId: permission.id,
          intent,
          scope: permission.scope,
          targetUserSid: selectedUserSid,
          elevatedRead
        });
        if (previewResult.stale) return;
        const res = previewResult.response;
        if (res.success && res.data) {
          setAdminPermPreview({
            preview: res.data,
            permission,
            elevatedReadUsed: elevatedRead,
            canWrite: adminPermissionsData?.canWrite ?? true
          });
        } else {
          setFeedback({
            tone: "error",
            message: res.error || "Não foi possível gerar a prévia da permissão administrativa."
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [adminCapabilities.permissions, adminPermissionsData?.canWrite, selectedUserSid, sendIpc]
  );

  const handleRetryElevatedAdminPreview = useCallback(async () => {
    if (!adminPermPreview) return;
    const { preview, permission } = adminPermPreview;
    const perm =
      permission ??
      adminPermissionsData?.permissions.find((item) => item.id === preview.permissionId) ??
      null;
    if (!perm) return;
    await handleSelectAdminIntent(perm, preview.intent, true);
  }, [adminPermPreview, adminPermissionsData, handleSelectAdminIntent]);

  const handleConfirmAdminPermPreview = useCallback(async () => {
    if (!adminPermPreview) return;
    const { preview, permission } = adminPermPreview;
    if (!preview.canApply) {
      setFeedback({
        tone: "error",
        message: "Operação bloqueada na prévia (canApply = false). Revise as limitações exibidas."
      });
      return;
    }

    setBusy(true);
    try {
      const payload = buildAdminPermissionApplyPayload(preview);
      const res = await sendIpc<AdminPermissionResultDto>(ADMIN_IPC_ACTIONS.PERMISSIONS_APPLY, payload);
      if (res.success && res.data) {
        const outcomePhase =
          res.data.permission.state.origin === "Inconclusive" ||
          res.data.permission.state.configuredState === "Inconclusive"
            ? "inconclusive"
            : "confirmed";
        setExecutionOutcomes((prev) => ({
          ...prev,
          [preview.permissionId]: {
            policyId: preview.permissionId,
            requestedState: preview.intent,
            phase: outcomePhase,
            detail: res.data!.message,
            updatedAt: new Date().toISOString()
          }
        }));
        if (res.data.transactionId) {
          setTransactionHistory((prev) => [
            {
              transactionId: res.data!.transactionId!,
              appliedAt: new Date().toISOString(),
              targetUserName: preview.target?.name,
              targetUserSid: preview.target?.sid ?? undefined,
              appliedCount: 1,
              status: "Committed"
            },
            ...prev.slice(0, 14)
          ]);
        }
        setAdminPermPreview(null);
        await refreshAdminTarget(selectedUserSid ?? null, false);
        setFeedback({
          tone: outcomePhase === "inconclusive" ? "warning" : "success",
          message:
            res.data.message || `Operação concluída para '${permission?.name ?? preview.permissionId}'.`
        });
      } else {
        setExecutionOutcomes((prev) => ({
          ...prev,
          [preview.permissionId]: {
            policyId: preview.permissionId,
            requestedState: preview.intent,
            phase: "failed",
            detail: res.error || "Falha ao aplicar permissão administrativa.",
            updatedAt: new Date().toISOString()
          }
        }));
        setFeedback({
          tone: "error",
          message: res.error || "Falha ao aplicar permissão administrativa."
        });
      }
    } finally {
      setBusy(false);
    }
  }, [adminPermPreview, sendIpc, refreshAdminTarget, selectedUserSid]);

  const handleRollbackTransaction = useCallback(
    async (tx: SessionTransactionEntry) => {
      if (tx.status === "RolledBack") return;
      setBusy(true);
      setFeedback(null);
      try {
        const res = await sendIpc<RollbackResultDto>(IPC_CONSTANTS.ACTION_ROLLBACK_TRANSACTION, {
          transactionId: tx.transactionId,
          targetUserSid: tx.targetUserSid
        });
        if (res.success && res.data?.success) {
          setTransactionHistory((prev) =>
            prev.map((entry) =>
              entry.transactionId === tx.transactionId ? { ...entry, status: "RolledBack" } : entry
            )
          );
          if (onSelectUser) {
            await onSelectUser(selectedUserSid ?? null);
          } else {
            await onRefresh();
          }
          setFeedback({
            tone: "success",
            message: `Alterações desfeitas com sucesso (${res.data.restoredCount} item(ns) restaurado(s) ao backup anterior).`
          });
        } else {
          setFeedback({
            tone: "error",
            message: res.error || res.data?.message || "Falha ao desfazer transação."
          });
        }
      } catch (err) {
        setFeedback({
          tone: "error",
          message: err instanceof Error ? err.message : "Erro ao desfazer alterações."
        });
      } finally {
        setBusy(false);
      }
    },
    [sendIpc, onSelectUser, selectedUserSid, onRefresh]
  );

  const handleCreateBaseline = useCallback(async () => {
    if (!canOperateAgent) {
      setFeedback({
        tone: "error",
        message: "Conecte ao Windows real ou ative o Modo Demonstração para capturar o baseline."
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await sendIpc<BaselineCreationResultDto>(IPC_CONSTANTS.ACTION_CREATE_BASELINE, {
        studentUser: selectedUser?.name || config.studentUser,
        adminUser: config.adminUser
      });
      if (res.success && res.data?.success) {
        setLatestBaseline(res.data);
        setFeedback({ tone: "success", message: res.data.message });
      } else {
        setFeedback({
          tone: "error",
          message: res.error || res.data?.message || "Falha ao criar ponto de restauração inicial."
        });
      }
    } finally {
      setBusy(false);
    }
  }, [canOperateAgent, sendIpc, selectedUser?.name, config.studentUser, config.adminUser]);

  const discardPendingChanges = useCallback(() => {
    setPendingPolicies({});
    setDrawerBatchResult(null);
    setShowReviewDrawer(false);
    setFeedback({ tone: "success", message: "Alterações pendentes descartadas." });
  }, []);

  const handleCreateAccount = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canOperateAgent) {
        setFeedback({
          tone: "error",
          message: "Conecte ao Windows no aplicativo instalado antes de criar contas locais."
        });
        return;
      }
      const trimmedName = accountName.trim();
      if (
        trimmedName.length < 1 ||
        trimmedName.length > 20 ||
        /["/\\[\]:;|=,+*?<>@]/.test(trimmedName)
      ) {
        setFeedback({
          tone: "error",
          message:
            "Informe um nome de conta entre 1 e 20 caracteres, sem símbolos reservados do Windows."
        });
        return;
      }
      if (!accountPassword || accountPassword !== repeatPassword) {
        setFeedback({
          tone: "error",
          message: "A senha e a confirmação de senha precisam coincidir."
        });
        return;
      }
      if (accountPassword.length < 8) {
        setFeedback({
          tone: "error",
          message: "Use uma senha com pelo menos 8 caracteres."
        });
        return;
      }

      setBusy(true);
      setFeedback(null);
      try {
        const res = await sendIpc<{ name?: string; sid?: string; message?: string }>(
          IPC_CONSTANTS.ACTION_CREATE_LOCAL_ACCOUNT,
          {
            name: trimmedName,
            password: accountPassword,
            isAdmin: accountRole === "admin"
          }
        );
        if (res.success) {
          setAccountName("");
          setConfig({
            ...config,
            [accountRole === "admin" ? "adminUser" : "studentUser"]: trimmedName
          });
          await onRefresh();
          if (accountRole === "standard" && res.data?.sid && onSelectUser) {
            await onSelectUser(res.data.sid);
          }
          setFeedback({
            tone: "success",
            message: res.data?.message || `Conta '${trimmedName}' criada com sucesso.`
          });
        } else {
          setFeedback({
            tone: "error",
            message: res.error || "Não foi possível criar a conta local."
          });
        }
      } catch (err) {
        setFeedback({
          tone: "error",
          message: err instanceof Error ? err.message : "Erro ao criar conta local."
        });
      } finally {
        setAccountPassword("");
        setRepeatPassword("");
        setBusy(false);
      }
    },
    [
      canOperateAgent,
      accountName,
      accountPassword,
      repeatPassword,
      accountRole,
      sendIpc,
      setConfig,
      config,
      onRefresh,
      onSelectUser
    ]
  );

  const handleSaveCurrentProfile = useCallback(() => {
    if (!displayPolicies || displayPolicies.length === 0) {
      setFeedback({
        tone: "error",
        message: "Carregue as políticas da estação antes de salvar um perfil local."
      });
      return;
    }
    const trimmed = newProfileName.trim() || config.profileName.trim() || "Perfil Personalizado";
    const snapshot: Record<string, boolean> = {};
    for (const p of displayPolicies) {
      snapshot[p.id] =
        pendingPolicies[p.id] !== undefined ? pendingPolicies[p.id] : isPolicyCurrentlyEnabled(p);
    }
    const entry: SavedPolicyProfile = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      savedAt: new Date().toISOString(),
      policies: snapshot
    };
    const next = [
      entry,
      ...savedProfiles.filter((s) => s.name.toLowerCase() !== trimmed.toLowerCase())
    ].slice(0, 12);
    setSavedProfiles(next);
    setNewProfileName("");
    try {
      window.localStorage.setItem("winlab:desktop:saved-profiles:v1", JSON.stringify(next));
    } catch {
      // Ignora quota
    }
    setFeedback({
      tone: "success",
      message: `Perfil "${trimmed}" salvo localmente (nenhuma credencial armazenada).`
    });
  }, [displayPolicies, newProfileName, config.profileName, pendingPolicies, savedProfiles]);

  const handleDeleteSavedProfile = useCallback(
    (id: string) => {
      const next = savedProfiles.filter((p) => p.id !== id);
      setSavedProfiles(next);
      try {
        window.localStorage.setItem("winlab:desktop:saved-profiles:v1", JSON.stringify(next));
      } catch {
        // Ignora
      }
    },
    [savedProfiles]
  );

  const handleStageSavedProfile = useCallback(
    (profile: SavedPolicyProfile) => {
      const diff = computeSavedProfileDiff(profile.policies, displayPolicies);
      setPendingPolicies(diff.pendingMap);
      const totalChanges = diff.toEnable.length + diff.toDisable.length;
      setFeedback({
        tone: totalChanges > 0 ? "warning" : "success",
        message:
          totalChanges > 0
            ? `Perfil "${profile.name}" comparado com a estação atual: ${diff.toEnable.length} bloqueio(s) e ${diff.toDisable.length} restauração(ões) prontos na barra de pendências.`
            : `A estação atual já está idêntica ao perfil "${profile.name}".`
      });
    },
    [displayPolicies]
  );

  const applyPresetToPending = useCallback(
    (presetId: PresetId) => {
      const presetCfg = getPreset(presetId);
      setConfig(presetCfg);
      if (!displayPolicies || displayPolicies.length === 0) return;

      const desiredMap: Record<string, boolean> = {
        "browser.chrome.incognito": presetCfg.blockChromeIncognito,
        "browser.chrome.guest": presetCfg.blockChromeGuest,
        "browser.password_manager": presetCfg.blockChromePasswordManager,
        "browser.developer_tools": presetId === "kiosk" || presetCfg.blockChromeExtensions,
        "personalization.wallpaper": presetCfg.blockWallpaper,
        "personalization.sounds": presetCfg.blockSoundScheme,
        "personalization.mouse_pointers": presetCfg.blockMousePointers,
        "system.disable_cmd": presetCfg.blockCmd,
        "system.disable_regedit": presetCfg.blockRegedit,
        "system.restrict_control_panel": !presetCfg.allowLocalAccountManagement,
        "storage.usb_write_protect": presetCfg.blockUsbWrite,
        "apps.disable_microsoft_store": presetCfg.blockStoreApps
      };

      const nextPending: Record<string, boolean> = {};
      for (const policy of displayPolicies) {
        if (desiredMap[policy.id] !== undefined) {
          const desired = desiredMap[policy.id];
          if (desired !== isPolicyCurrentlyEnabled(policy)) {
            nextPending[policy.id] = desired;
          }
        }
      }
      setPendingPolicies(nextPending);
      const count = Object.keys(nextPending).length;
      setFeedback({
        tone: "success",
        message:
          count > 0
            ? `Perfil "${presetCfg.profileName}" preparado com ${count} alteração(ões) na barra de pendências. Nenhuma política foi aplicada ainda.`
            : `O computador já corresponde às políticas ativas do perfil "${presetCfg.profileName}".`
      });
    },
    [displayPolicies, setConfig]
  );

  const effectiveNetworkPlan: NetworkSharePlan = useMemo(() => {
    const parsedAccounts = networkStudentAccounts
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const fallbackAccounts =
      nonAdminUsers.length > 0
        ? nonAdminUsers.map((u) => u.name)
        : [config.studentUser || "Aluno"];
    return {
      ...network,
      studentAccounts: parsedAccounts.length > 0 ? parsedAccounts : fallbackAccounts
    };
  }, [network, networkStudentAccounts, nonAdminUsers, config.studentUser]);

  const downloadNetworkScript = useCallback(
    (kind: "server" | "client" | "diagnostics") => {
      const errors = validateNetworkShare(effectiveNetworkPlan);
      if (errors.length > 0) {
        setFeedback({ tone: "error", message: errors.join(" ") });
        return;
      }
      const content =
        kind === "server"
          ? generateShareServerScript(effectiveNetworkPlan)
          : kind === "client"
            ? generateShareClientScript(effectiveNetworkPlan)
            : generateShareDiagnosticsScript(effectiveNetworkPlan);
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download =
        kind === "server"
          ? "winlab-servidor-pasta-alunos.ps1"
          : kind === "client"
            ? "winlab-conectar-pasta-alunos.ps1"
            : "winlab-testar-rede-smb.ps1";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setFeedback({
        tone: "success",
        message:
          kind === "server"
            ? "Script do servidor gerado. Execute como Administrador no computador servidor."
            : kind === "client"
              ? "Script da estação gerado. Execute na conta comum que acessará a pasta de rede."
              : "Script de diagnóstico SMB gerado (somente leitura: DNS, TCP 445 e acesso UNC)."
      });
    },
    [effectiveNetworkPlan]
  );

  const searchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return GLOBAL_SEARCH_CATALOG.filter((item) =>
      `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [globalSearch]);

  const wizardTransport: DesktopIpcTransport = useMemo(
    () => ({
      isRunning: true,
      mode: mode === "Real" ? "Native IPC" : "Demo IPC",
      handleRequest: <T,>(envelope: IpcEnvelope) => sendIpc<T>(envelope.action, envelope.payload)
    }),
    [mode, sendIpc]
  );

  const sectionMeta =
    DESKTOP_NAVIGATION_ITEMS.find((item) => item.id === section) ?? DESKTOP_NAVIGATION_ITEMS[0];
  const helpContent = SECTION_HELP_CONTENT[section];

  const adminUsersCount =
    adminCapabilities.accounts && adminAccountsData?.accounts?.length
      ? adminAccountsData.accounts.filter(
          (acc) =>
            acc.enabled &&
            (acc.role === "Superadmin" ||
              acc.role === "Recovery" ||
              acc.privilegeClassification === "Administrator")
        ).length
      : inventory?.localUsers.filter((u) => u.enabled && u.isAdmin).length ?? 0;
  const standardUsersCount = nonAdminUsers.length;
  const adminTransactionPerms =
    adminCapabilities.permissions && adminPermissionsData
      ? adminPermissionsData.permissions.filter((item) => item.mechanism === "Transaction")
      : null;
  const appliedPoliciesCount = adminTransactionPerms
    ? adminTransactionPerms.filter(
        (item) =>
          item.state.configuredState === "Blocked" ||
          item.state.effectiveState === "Blocked" ||
          item.state.effectiveState === "Applied"
      ).length
    : (displayPolicies ?? []).filter((p) => isPolicyCurrentlyEnabled(p)).length;
  const totalPoliciesCount = adminTransactionPerms
    ? adminTransactionPerms.length
    : displayPolicies?.length ?? 0;
  const systemDisk = inventory?.disks?.[0] ?? null;
  const latestCommittedTx = transactionHistory.find((t) => t.status === "Committed") ?? null;

  const normalizedInvSearch = inventorySearch.trim().toLowerCase();
  const filteredInstalledApps = (inventory?.installedApps ?? []).filter(
    (app) =>
      !normalizedInvSearch ||
      `${app.displayName} ${app.publisher}`.toLowerCase().includes(normalizedInvSearch)
  );

  function toggleReducedMotionPref(next: boolean) {
    setReducedMotionPref(next);
    try {
      window.localStorage.setItem("winlab:desktop:reduced-motion:v1", next ? "true" : "false");
    } catch {
      // Ignora
    }
  }

  return (
    <div
      className="wl-shell"
      data-reduced-motion={reducedMotionPref ? "true" : "false"}
    >
      <aside className="wl-side">
        <div className="wl-logo">
          <span>W</span>
          <div>
            <strong>WinLab</strong>
            <small>Controle do Windows</small>
          </div>
        </div>

        <div className="wl-side-label">NAVEGAÇÃO</div>
        <nav aria-label="Menu principal">
          {DESKTOP_NAVIGATION_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
              className={`wl-nav ${section === item.id ? "current" : ""}`}
            >
              <span className="wl-nav-icon">
                <SectionIcon id={item.id} />
              </span>
              <span className="wl-nav-label">{item.label}</span>
              {item.id === "permissions" && pendingCount > 0 && (
                <span className="wl-nav-badge">{pendingCount}</span>
              )}
              {item.id === "history" && transactionHistory.length > 0 && (
                <span className="wl-nav-badge neutral">{transactionHistory.length}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="wl-side-bottom">
          <button
            type="button"
            className="wl-button secondary"
            onClick={() => void onRefresh()}
            disabled={isScanning || busy}
          >
            {isScanning ? "Consultando..." : "Atualizar leitura"}
          </button>
          {onAdvanced && (
            <button type="button" className="wl-advanced" onClick={onAdvanced}>
              Inspeção técnica e logs IPC
            </button>
          )}
          <small>
            {realConnected
              ? `Conectado a ${inventory?.computerName}`
              : mode === "Demo"
                ? "Ambiente de Demonstração"
                : "Prévia sem agente nativo"}
          </small>
        </div>
      </aside>

      <div className="wl-main">
        <header className="wl-header">
          <div className="wl-header-title">
            <span className="wl-overline">
              WINLAB DESKTOP · {realConnected ? "COMPUTADOR REAL" : "MODO DEMONSTRAÇÃO"}
            </span>
            <h1>{sectionMeta.label}</h1>
          </div>

          <div className="wl-head-actions">
            <div className="wl-global-search-wrap">
              <input
                ref={searchInputRef}
                type="search"
                className="wl-global-search"
                aria-label="Pesquisar configurações, permissões e seções"
                placeholder="Pesquisar configurações... (/)"
                value={globalSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalSearch(val);
                  if (section === "permissions") {
                    setPermSearch(val);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setGlobalSearch("");
                  }
                }}
              />
              {searchResults.length > 0 && (
                <div className="wl-search-results" role="listbox" aria-label="Resultados da pesquisa">
                  {searchResults.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="wl-search-item"
                      onClick={() => {
                        setSection(result.section);
                        if (result.section === "permissions") {
                          setSelectedPermGroup(result.group ?? "all");
                          setPermSearch(
                            result.id.startsWith("perm:") ? result.label : ""
                          );
                        }
                        setGlobalSearch("");
                      }}
                    >
                      <strong>{result.label}</strong>
                      <small>{result.description}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              className="wl-button secondary"
              aria-expanded={showContextHelp}
              onClick={() => setShowContextHelp((prev) => !prev)}
            >
              {showContextHelp ? "Ocultar ajuda" : "Ajuda contextual"}
            </button>

            <span
              className={`wl-state ${
                realConnected ? "online" : mode === "Demo" ? "demo" : "offline"
              }`}
            >
              {realConnected
                ? "Computador Real Conectado"
                : mode === "Demo"
                  ? "Modo Demonstração"
                  : "Aguardando Conexão"}
            </span>

            {pendingCount > 0 && (
              <button
                type="button"
                className="wl-pending-badge"
                onClick={() => setShowReviewDrawer(true)}
              >
                {pendingCount} pendência(s)
              </button>
            )}

            {native && mode === "Demo" && (
              <button
                type="button"
                className="wl-button primary"
                onClick={() => void onChangeMode("Real")}
                disabled={isScanning || busy}
              >
                Conectar ao Windows Real
              </button>
            )}
            {native && mode === "Real" && (
              <button
                type="button"
                className="wl-button secondary"
                onClick={() => void onChangeMode("Demo")}
                disabled={isScanning || busy}
              >
                Usar Demonstração
              </button>
            )}
          </div>
        </header>

        {showContextHelp && (
          <section className="wl-help-panel" aria-label="Ajuda contextual desta seção">
            <div className="wl-help-head">
              <strong>{helpContent.title}</strong>
              <button
                type="button"
                className="wl-button-link"
                onClick={() => setShowContextHelp(false)}
              >
                Fechar ajuda
              </button>
            </div>
            <p>{helpContent.summary}</p>
            <ul>
              {helpContent.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </section>
        )}

        {feedback && (
          <div
            role={feedback.tone === "error" ? "alert" : "status"}
            className={`wl-feedback ${
              feedback.tone === "error" ? "error" : feedback.tone === "warning" ? "warning" : ""
            }`}
          >
            <span>{feedback.message}</span>
            <div className="wl-head-actions">
              {latestCommittedTx && feedback.tone !== "error" && (
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => void handleRollbackTransaction(latestCommittedTx)}
                  disabled={busy}
                >
                  Desfazer última aplicação
                </button>
              )}
              <button
                type="button"
                className="wl-button-link"
                onClick={() => setFeedback(null)}
              >
                Dispensar
              </button>
            </div>
          </div>
        )}

        {scanError && (
          <div role="alert" className="wl-feedback error">
            <span>Não foi possível ler os dados deste computador: {scanError}</span>
          </div>
        )}

        {driftSummary.hasDrift && (
          <div role="alert" className="wl-feedback warning" data-testid="drift-warning-banner">
            <span>
              Configuração modificada fora do WinLab: {driftSummary.driftedPolicies.length} política(s) diverge(m) do padrão esperado (
              {driftSummary.driftedPolicies.map((p) => p.title).join(", ")}). Revise a prévia para restaurar o padrão.
            </span>
            <button
              type="button"
              className="wl-button primary"
              onClick={() => {
                setPendingPolicies((prev) => ({ ...prev, ...driftSummary.remediationPending }));
                setShowReviewDrawer(true);
              }}
              disabled={busy}
            >
              Revisar restauração
            </button>
          </div>
        )}

        {mode === "Demo" && (
          <div className="wl-connect" role="status">
            <div>
              <strong>Modo Demonstração ativo — Dados simulados (LAB-MICROLINS-01)</strong>
              <p>
                Você está testando em ambiente simulado em memória. Nenhuma chave de registro ou conta do Windows real será modificada neste modo.
              </p>
            </div>
            {native && (
              <button
                type="button"
                className="wl-button primary"
                onClick={() => void onChangeMode("Real")}
                disabled={isScanning || busy}
              >
                Alternar para Computador Real
              </button>
            )}
          </div>
        )}

        {showWizardModal && (
          <FirstRunWizard
            transport={wizardTransport}
            isWebView2Available={native}
            initialMode={mode}
            onComplete={({ mode: newMode, config: newConfig }) => {
              setConfig(newConfig);
              setShowWizardModal(false);
              if (newMode !== mode) {
                void onChangeMode(newMode);
              } else {
                void onRefresh();
              }
            }}
            onCancel={() => setShowWizardModal(false)}
          />
        )}

        {/* 1. VISAO GERAL */}
        {section === "overview" && (
          <div className="wl-section-content wl-page-enter" key="page-overview">
            <section className="wl-welcome">
              <div>
                <span className="wl-overline">PAINEL CENTRAL DA ESTAÇÃO</span>
                <h2>
                  {inventory?.computerName
                    ? `Estação ${inventory.computerName}`
                    : "Painel de Controle do Computador"}
                </h2>
                <p>
                  Consulte o resumo do computador, selecione a conta comum de laboratório, ajuste permissões com prévia completa antes de gravar e reverta quando necessário.
                </p>
              </div>
              <div className="wl-head-actions">
                <button
                  type="button"
                  className="wl-button primary"
                  onClick={() => setSection("permissions")}
                >
                  Configurar permissões
                </button>
                {latestCommittedTx && (
                  <button
                    type="button"
                    className="wl-button secondary"
                    onClick={() => void handleRollbackTransaction(latestCommittedTx)}
                    disabled={busy}
                  >
                    Desfazer última aplicação
                  </button>
                )}
              </div>
            </section>

            {isScanning && !inventory ? (
              <div className="wl-stats" aria-label="Carregando resumo da máquina">
                {[1, 2, 3, 4].map((item) => (
                  <div key={item} className="wl-skeleton-card">
                    <div className="wl-skeleton wl-skeleton-line short" />
                    <div className="wl-skeleton wl-skeleton-title" />
                    <div className="wl-skeleton wl-skeleton-line" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="wl-stats">
                <div>
                  <span>Máquina</span>
                  <strong>{inventory?.windows.caption || "Não consultado"}</strong>
                  <small>
                    {inventory?.windows.buildNumber
                      ? `${inventory.computerName} · Build ${inventory.windows.buildNumber} (${inventory.windows.architecture})`
                      : "Aguardando leitura do inventário"}
                    {systemDisk ? ` · Disco ${systemDisk.device} ${systemDisk.freeGb} GB livres` : ""}
                  </small>
                </div>
                <div>
                  <span>Contas</span>
                  <strong>
                    {inventory ? `${standardUsersCount} aluno(s) · ${adminUsersCount} admin` : "—"}
                  </strong>
                  <small>
                    {selectedUser
                      ? `Alvo ativo: ${selectedUser.name}`
                      : "Nenhuma conta comum selecionada"}
                  </small>
                </div>
                <div>
                  <span>Políticas</span>
                  <strong>
                    {displayPolicies || adminTransactionPerms
                      ? `${appliedPoliciesCount} de ${totalPoliciesCount} ativas`
                      : "—"}
                  </strong>
                  <small>
                    {driftSummary.hasDrift
                      ? `${driftSummary.driftedPolicies.length} divergência(s) detectada(s)`
                      : preflightData?.readinessMessage || "Estados verificados diretamente no sistema"}
                  </small>
                </div>
                <div>
                  <span>Pendências</span>
                  <strong>{pendingCount} selecionada(s)</strong>
                  <small>
                    {pendingCount > 0
                      ? "Aguardando revisão no painel de prévia"
                      : "Nenhuma alteração pendente para aplicar"}
                  </small>
                </div>
              </div>
            )}

            <div className="wl-user-selector">
              <div className="wl-user-selector-info">
                <label htmlFor="wl-overview-user-select">Conta comum alvo ativa</label>
                <small>
                  Políticas por usuário atingem apenas esta conta comum (administradores não são alvo por usuário). Políticas de máquina inteira (HKLM) afetam todas as contas.
                </small>
              </div>
              <div className="wl-user-selector-controls">
                <select
                  id="wl-overview-user-select"
                  value={selectedUserSid || ""}
                  onChange={(e) => void handleUserSwitch(e.target.value)}
                  disabled={busy || nonAdminUsers.length === 0}
                >
                  <option value="">Selecione um usuário...</option>
                  {nonAdminUsers.map((user) => (
                    <option key={user.sid} value={user.sid}>
                      {user.name} ({user.sid})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => setSection("accounts")}
                >
                  Gerenciar contas
                </button>
              </div>
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Ações rápidas</h2>
                  <p>Atalhos organizados para as rotinas principais de administração do laboratório.</p>
                </div>
              </div>
              <div className="wl-shortcuts">
                <button type="button" onClick={() => setSection("permissions")}>
                  <strong>Central de permissões</strong>
                  <span>Ajustar Sistema, Personalização, Aplicativos, Internet e Dispositivos</span>
                </button>
                <button type="button" onClick={() => setSection("accounts")}>
                  <strong>Contas e usuários</strong>
                  <span>Criar conta de aluno ou Superadmin e definir conta-alvo</span>
                </button>
                <button type="button" onClick={() => setSection("profiles")}>
                  <strong>Perfis de laboratório</strong>
                  <span>Aplicar preset Microlins/Escola ou comparar perfis salvos</span>
                </button>
                <button type="button" onClick={() => setSection("history")}>
                  <strong>Histórico e recuperação</strong>
                  <span>Criar ponto de restauração (Baseline) e desfazer alterações</span>
                </button>
                <button type="button" onClick={() => setSection("diagnostics")}>
                  <strong>Relatório de diagnóstico</strong>
                  <span>Inspecionar prontidão pré-voo, softwares e exportar JSON</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. CONTAS E USUARIOS */}
        {section === "accounts" && (
          <div className="wl-page-enter" key="page-accounts">
            <AccountsSectionView
              localUsers={inventory?.localUsers}
              adminAccountsData={adminAccountsData}
              adminCapabilities={adminCapabilities}
              canOperateAgent={canOperateAgent}
              isScanning={isScanning}
              busy={busy}
              selectedUserSid={selectedUserSid ?? null}
              onSelectUser={handleUserSwitch}
              onOpenPermissionsForUser={(sid) => {
                void handleUserSwitch(sid);
                setSection("permissions");
              }}
              accountRole={accountRole}
              onAccountRoleChange={setAccountRole}
              accountName={accountName}
              onAccountNameChange={setAccountName}
              accountPassword={accountPassword}
              onAccountPasswordChange={setAccountPassword}
              repeatPassword={repeatPassword}
              onRepeatPasswordChange={setRepeatPassword}
              onCreateLegacyAccount={handleCreateAccount}
              onRefreshAccounts={async () => {
                await onRefresh();
                await refreshAdminCapabilitiesData();
              }}
              onNotify={setFeedback}
              sendIpc={sendIpc}
            />
          </div>
        )}

        {/* 3. PERMISSOES */}
        {section === "permissions" && (
          <div className="wl-page-enter" key="page-permissions">
            <PermissionsCenterView
              cards={permissionCards}
              searchQuery={permSearch}
              onSearchChange={setPermSearch}
              selectedGroup={selectedPermGroup}
              onSelectGroup={setSelectedPermGroup}
              scopeFilter={permScopeFilter}
              onScopeFilterChange={setPermScopeFilter}
              statusFilter={permStatusFilter}
              onStatusFilterChange={setPermStatusFilter}
              nonAdminUsers={nonAdminUsers}
              selectedUserSid={selectedUserSid ?? null}
              selectedUser={selectedUser}
              onUserSwitch={handleUserSwitch}
              hasInconclusiveUserPolicies={hasInconclusiveUserPolicies}
              onQueryOfflineProfile={handleQueryOfflineProfile}
              onTogglePolicy={handleTogglePolicyCard}
              adminPermissionsEnabled={adminCapabilities.permissions}
              adminPermissions={adminPermissionsData?.permissions ?? null}
              adminCanWrite={adminPermissionsData?.canWrite ?? true}
              adminManagement={
                adminPermissionsData?.management ?? adminDiagnosticsData?.management ?? null
              }
              onSelectAdminIntent={(perm, intent) => void handleSelectAdminIntent(perm, intent, false)}
              realExpansionActive={native && mode === "Real"}
              detectedApps={inventory?.detectedApps ?? []}
              busy={busy}
              isLoadingPolicies={isScanning && !displayPolicies && !adminPermissionsData}
              sendIpc={sendIpc}
            />
          </div>
        )}

        {/* 4. PERFIS DE LABORATORIO */}
        {section === "profiles" && (
          <div className="wl-section-content wl-page-enter" key="page-profiles">
            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Presets rápidos de sala de aula</h2>
                  <p>
                    Carregue um perfil pré-configurado para preparar as diferenças na barra de pendências. Nenhuma política é aplicada automaticamente.
                  </p>
                </div>
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => setShowWizardModal(true)}
                >
                  Abrir Assistente Inicial
                </button>
              </div>
              <div className="wl-shortcuts">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPresetToPending(preset.id)}
                  >
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>
              {pendingCount > 0 && (
                <div className="wl-head-actions" style={{ marginTop: 14 }}>
                  <button
                    type="button"
                    className="wl-button primary"
                    onClick={() => setShowReviewDrawer(true)}
                  >
                    Revisar {pendingCount} alteração(ões) preparada(s)
                  </button>
                </div>
              )}
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Perfis salvos localmente e comparação com a estação</h2>
                  <p>
                    Salve combinações de políticas deste computador para reaproveitar e comparar antes de aplicar. Nenhuma senha é armazenada.
                  </p>
                </div>
              </div>
              <div className="wl-fields" style={{ marginBottom: 12 }}>
                <label style={{ gridColumn: "1 / -1" }}>
                  Nome do perfil personalizado
                  <div className="wl-inline-input-row">
                    <input
                      type="text"
                      placeholder="Ex.: Laboratório Noite — Design"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                    />
                    <button
                      type="button"
                      className="wl-button primary"
                      onClick={handleSaveCurrentProfile}
                      disabled={busy || !displayPolicies || displayPolicies.length === 0}
                    >
                      Salvar estado atual
                    </button>
                  </div>
                </label>
              </div>
              {savedProfiles.length === 0 ? (
                <p className="wl-muted">Nenhum perfil personalizado salvo neste computador ainda.</p>
              ) : (
                <div className="wl-tx-list">
                  {savedProfiles.map((prof) => {
                    const diff = computeSavedProfileDiff(prof.policies, displayPolicies);
                    const totalDiff = diff.toEnable.length + diff.toDisable.length;
                    return (
                      <div key={prof.id} className="wl-tx-item">
                        <div>
                          <strong>{prof.name}</strong>
                          <small>
                            {totalDiff === 0
                              ? `Idêntico à estação atual (${diff.unchangedCount} política(s) alinhada(s))`
                              : `Diferenças para a estação: +${diff.toEnable.length} bloquear · -${diff.toDisable.length} herdar · ${diff.unchangedCount} iguais`}
                          </small>
                        </div>
                        <div className="wl-head-actions">
                          <button
                            type="button"
                            className="wl-button secondary"
                            onClick={() => handleStageSavedProfile(prof)}
                            disabled={busy}
                          >
                            {totalDiff === 0 ? "Alinhado" : "Preparar diferenças"}
                          </button>
                          <button
                            type="button"
                            className="wl-button secondary"
                            onClick={() => handleDeleteSavedProfile(prof.id)}
                            disabled={busy}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Importar ou exportar perfil JSON</h2>
                  <p>
                    Compatível com o configurador WinLab Web. Nenhuma credencial é exportada no arquivo JSON.
                  </p>
                </div>
                <span className="wl-status-badge neutral">Sincronização em rede: Indisponível</span>
              </div>
              <div className="wl-head-actions">
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => {
                    const blob = new Blob([serializeConfig(config)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `winlab-perfil-${config.profileName.toLowerCase().replace(/\s+/g, "-")}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Exportar perfil (.json)
                </button>
                <label className="wl-button secondary" style={{ display: "inline-flex", alignItems: "center" }}>
                  Importar perfil (.json)
                  <input
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const imported = parseConfigJson(await file.text());
                        setConfig(imported);
                        setFeedback({
                          tone: "success",
                          message: `Perfil "${imported.profileName}" importado com sucesso.`
                        });
                      } catch (err) {
                        setFeedback({
                          tone: "error",
                          message: `Arquivo JSON inválido: ${(err as Error).message}`
                        });
                      }
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* 5. REDE E ARQUIVOS */}
        {section === "network" && (
          <div className="wl-section-content wl-page-enter" key="page-network">
            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Estado atual de rede SMB nesta estação</h2>
                  <p>
                    Leitura não-elevada das unidades de rede mapeadas, compartilhamentos locais publicados e protocolo legado SMBv1.
                  </p>
                </div>
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => void refreshSystemDiagnostics()}
                  disabled={busy || !canOperateAgent}
                >
                  Atualizar rede
                </button>
              </div>
              {networkEnvironment ? (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="wl-account">
                    <div>
                      <strong>Protocolo legado SMBv1</strong>
                      <small>O SMBv1 deve permanecer desativado em redes educacionais e corporativas.</small>
                    </div>
                    <span
                      className={`wl-status-badge ${
                        networkEnvironment.smb1Enabled === true ? "error" : "active"
                      }`}
                    >
                      {networkEnvironment.smb1Enabled === true
                        ? "Ativo — Risco de segurança"
                        : networkEnvironment.smb1Enabled === false
                          ? "Desativado (Seguro)"
                          : "Não aplicável neste host"}
                    </span>
                  </div>
                  <div className="wl-account-list">
                    {networkEnvironment.mappedDrives.map((drive) => (
                      <div key={drive.driveLetter} className="wl-account">
                        <div>
                          <strong>
                            Unidade {drive.driveLetter}: → {drive.remotePath}
                          </strong>
                          <small>
                            {drive.persistent ? "Mapeamento persistente" : "Sessão atual"}
                          </small>
                        </div>
                        <span className="wl-status-badge active">{drive.status}</span>
                      </div>
                    ))}
                    {networkEnvironment.localShares.map((share) => (
                      <div key={share.name} className="wl-account">
                        <div>
                          <strong>
                            Compartilhamento local \\{inventory?.computerName || "LOCAL"}\{share.name}
                          </strong>
                          <small>
                            {share.localPath} {share.remark ? `· ${share.remark}` : ""}
                          </small>
                        </div>
                        <span className="wl-status-badge active">Publicado</span>
                      </div>
                    ))}
                    {networkEnvironment.mappedDrives.length === 0 &&
                      networkEnvironment.localShares.length === 0 && (
                        <p className="wl-muted">
                          Nenhuma unidade de rede mapeada ou pasta SMB publicada encontrada nesta estação.
                        </p>
                      )}
                  </div>
                </div>
              ) : (
                <p className="wl-muted">
                  Conecte ao agente do Windows ou ative o Modo Demonstração para inspecionar mapeamentos SMB.
                </p>
              )}
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Pasta compartilhada de laboratório (SMB)</h2>
                  <p>
                    Gere scripts administrativos seguros (sem compartilhamento anônimo nem SMBv1) para configurar o servidor e mapear a unidade nas estações.
                  </p>
                </div>
                <span className="wl-status-badge neutral">
                  Implantação remota em lote: Indisponível
                </span>
              </div>
              <div className="wl-role-choice" style={{ marginBottom: 16 }}>
                <button
                  type="button"
                  className={(network.model ?? "collective") === "collective" ? "chosen" : ""}
                  onClick={() => setNetwork({ ...network, model: "collective" as NetworkShareModel })}
                >
                  <span>Modelo A — Pasta coletiva da turma</span>
                  <small>Uma pasta compartilhada autenticada onde os alunos leem e salvam exercícios em conjunto.</small>
                </button>
                <button
                  type="button"
                  className={network.model === "per_student" ? "chosen" : ""}
                  onClick={() => setNetwork({ ...network, model: "per_student" as NetworkShareModel })}
                >
                  <span>Modelo B — Pastas individuais isoladas por aluno</span>
                  <small>Herança NTFS desativada na raiz: cada conta acessa exclusivamente sua própria subpasta.</small>
                </button>
              </div>
              <div className="wl-fields">
                <label>
                  Nome ou IP do servidor
                  <input
                    type="text"
                    placeholder="Ex.: SERVIDOR-LAB"
                    value={network.server}
                    onChange={(e) => setNetwork({ ...network, server: e.target.value })}
                  />
                </label>
                <label>
                  Nome do compartilhamento
                  <input
                    type="text"
                    value={network.shareName}
                    onChange={(e) => setNetwork({ ...network, shareName: e.target.value })}
                  />
                </label>
                <label>
                  Caminho físico no servidor
                  <input
                    type="text"
                    value={network.rootPath}
                    onChange={(e) => setNetwork({ ...network, rootPath: e.target.value })}
                  />
                </label>
                <label>
                  Letra da unidade nas estações
                  <input
                    type="text"
                    maxLength={1}
                    value={network.driveLetter}
                    onChange={(e) => setNetwork({ ...network, driveLetter: e.target.value.toUpperCase() })}
                  />
                </label>
              </div>
              {network.model === "per_student" && (
                <div className="wl-fields" style={{ marginTop: 12 }}>
                  <label style={{ gridColumn: "1 / -1" }}>
                    Contas individuais dos alunos (separadas por vírgula)
                    <input
                      type="text"
                      placeholder="Ex.: Aluno01, Aluno02, Aluno03"
                      value={networkStudentAccounts}
                      onChange={(e) => setNetworkStudentAccounts(e.target.value)}
                    />
                  </label>
                </div>
              )}
              <div className="wl-network-steps">
                <div>
                  <strong>1. No computador servidor</strong>
                  <p className="wl-muted">
                    Cria a pasta local, aplica ACLs NTFS {(network.model ?? "collective") === "per_student" ? "isoladas por subpasta de aluno" : "autenticadas"} e publica o compartilhamento SMB.
                  </p>
                  <button
                    type="button"
                    className="wl-button primary"
                    onClick={() => downloadNetworkScript("server")}
                  >
                    Baixar script do servidor (.ps1)
                  </button>
                </div>
                <div>
                  <strong>2. Nas estações dos alunos</strong>
                  <p className="wl-muted">
                    Testa porta TCP 445 em <code>\\{network.server || "SERVIDOR"}\{network.shareName}</code> e mapeia a unidade persistente.
                  </p>
                  <button
                    type="button"
                    className="wl-button secondary"
                    onClick={() => downloadNetworkScript("client")}
                  >
                    Baixar script das estações (.ps1)
                  </button>
                </div>
                <div>
                  <strong>3. Diagnóstico de conectividade SMB</strong>
                  <p className="wl-muted">
                    Verifica resolução DNS, porta TCP 445, acesso UNC e estado do SMBv1 sem alterar nenhuma configuração.
                  </p>
                  <button
                    type="button"
                    className="wl-button secondary"
                    onClick={() => downloadNetworkScript("diagnostics")}
                  >
                    Baixar diagnóstico de rede (.ps1)
                  </button>
                </div>
              </div>
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Transferência por discos removíveis (USB)</h2>
                  <p>
                    As políticas de leitura, execução e gravação em pendrives USB ficam centralizadas em Permissões → Dispositivos.
                  </p>
                </div>
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => {
                    setSelectedPermGroup("Dispositivos");
                    setSection("permissions");
                  }}
                >
                  Abrir permissões de Dispositivos →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 6. SEGURANCA */}
        {section === "security" && (
          <div className="wl-section-content wl-page-enter" key="page-security">
            <div className="wl-stats">
              <div>
                <span>Interface Gráfica</span>
                <strong>Não elevada (asInvoker)</strong>
                <small>Sem privilégios administrativos contínuos na janela WebView2.</small>
              </div>
              <div>
                <span>Executor Privilegiado</span>
                <strong>Sob demanda (UAC + SHA-256)</strong>
                <small>Named Pipe com DACL restrita e verificação do processo pai.</small>
              </div>
              <div>
                <span>Hardware de Plataforma</span>
                <strong>
                  {inventory?.windows.tpmPresent === true
                    ? `TPM ${inventory.windows.tpmVersion ?? "Ativo"}`
                    : inventory?.windows.tpmPresent === false
                      ? "TPM ausente"
                      : "Não informado"}
                </strong>
                <small>
                  Secure Boot:{" "}
                  {inventory?.windows.secureBootEnabled === true
                    ? "Ativado"
                    : inventory?.windows.secureBootEnabled === false
                      ? "Desativado"
                      : "Indisponível"}
                </small>
              </div>
              <div>
                <span>Proteção de Contas Administrativas</span>
                <strong>{adminUsersCount} conta(s) protegida(s)</strong>
                <small>
                  Administradores não são selecionados em políticas por usuário; políticas de máquina inteira (HKLM) afetam todas as contas.
                </small>
              </div>
            </div>

            {adminDiagnosticsData && (
              <div className="wl-card">
                <div className="wl-card-title">
                  <div>
                    <h2>Sinais de gerenciamento e origem das políticas</h2>
                    <p>
                      Domínio: {adminDiagnosticsData.management.domain} · Entra ID:{" "}
                      {adminDiagnosticsData.management.entra}
                      {adminDiagnosticsData.management.entraScope
                        ? ` (${adminDiagnosticsData.management.entraScope})`
                        : ""}{" "}
                      · MDM: {adminDiagnosticsData.management.mdm}
                    </p>
                  </div>
                </div>
                {adminDiagnosticsData.limitations.length > 0 && (
                  <p className="wl-requires-action" style={{ marginBottom: 10 }}>
                    {adminDiagnosticsData.limitations.join(" ")}
                  </p>
                )}
                {adminDiagnosticsData.signals.length > 0 && (
                  <div className="wl-account-list">
                    {adminDiagnosticsData.signals.map((sig) => (
                      <div key={sig.id} className="wl-account">
                        <div>
                          <strong>{sig.name}</strong>
                          <small>{sig.detail}</small>
                        </div>
                        <span className="wl-scope-tag">Origem: {sig.origin}</span>
                        <span className="wl-status-badge neutral">{sig.effectiveState}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Controles de segurança fora do escopo automático do piloto</h2>
                  <p>
                    Os itens abaixo permanecem protegidos ou indisponíveis nesta versão para evitar bloqueio irreversível do sistema operacional.
                  </p>
                </div>
              </div>
              <div className="wl-account-list">
                <div className="wl-account">
                  <div>
                    <strong>Microsoft Defender e Firewall do Windows</strong>
                    <small>Não modificados automaticamente pelo motor do piloto.</small>
                  </div>
                  <span className="wl-status-badge neutral">Indisponível nesta versão</span>
                </div>
                <div className="wl-account">
                  <div>
                    <strong>WinRE, Boot e Políticas de Senha do Domínio/Sistema</strong>
                    <small>Mantidos intactos para preservar recuperação do Windows.</small>
                  </div>
                  <span className="wl-status-badge neutral">Indisponível nesta versão</span>
                </div>
                <div className="wl-account">
                  <div>
                    <strong>AppLocker em modo Enforce (Bloqueio rígido)</strong>
                    <small>O piloto Desktop opera exclusivamente em modo AuditOnly.</small>
                  </div>
                  <span className="wl-status-badge neutral">Indisponível nesta versão</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 7. DIAGNOSTICO */}
        {section === "diagnostics" && (
          <div className="wl-section-content wl-page-enter" key="page-diagnostics">
            <div className="wl-card">
              <DiagnosticReport
                mode={mode}
                inventory={inventory}
                policySummary={
                  policySummary ??
                  (displayPolicies
                    ? {
                        totalPolicies: displayPolicies.length,
                        appliedCount: appliedPoliciesCount,
                        notConfiguredCount: displayPolicies.filter(
                          (p) => p.currentState === "NotConfigured"
                        ).length,
                        pendingCount: displayPolicies.filter((p) =>
                          [
                            "PendingLogoff",
                            "PendingReboot",
                            "PendingAppRestart",
                            "PendingFirstLogon"
                          ].includes(p.effectiveState ?? p.currentState)
                        ).length,
                        items: displayPolicies
                      }
                    : null)
                }
                preflightData={preflightData ?? null}
                isScanning={isScanning}
                scanError={scanError}
              />
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Programas detectados e inventário instalado</h2>
                  <p>Consulta somente leitura da estação atual.</p>
                </div>
                <input
                  type="search"
                  className="wl-inline-search"
                  placeholder="Filtrar programas instalados..."
                  aria-label="Filtrar programas instalados"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                />
              </div>

              {inventory ? (
                <div className="wl-account-list">
                  {inventory.detectedApps.map((app) => (
                    <div key={app.id} className="wl-account">
                      <div>
                        <strong>{app.name}</strong>
                        <small>{app.path}</small>
                      </div>
                      <span className={`wl-status-badge ${app.detected ? "active" : "inactive"}`}>
                        {app.detected ? "Catálogo detectado" : "Não encontrado"}
                      </span>
                    </div>
                  ))}
                  {filteredInstalledApps.slice(0, 30).map((app) => (
                    <div key={`${app.displayName}-${app.displayVersion}`} className="wl-account">
                      <div>
                        <strong>{app.displayName}</strong>
                        <small>
                          {app.publisher || "Publicador não informado"} · v{app.displayVersion || "—"}
                        </small>
                      </div>
                      <span className="wl-scope-tag">{app.isAppx ? "Store / AppX" : "Desktop"}</span>
                    </div>
                  ))}
                </div>
              ) : isScanning ? (
                <div className="wl-skeleton-stack">
                  <div className="wl-skeleton wl-skeleton-line" />
                  <div className="wl-skeleton wl-skeleton-line short" />
                </div>
              ) : (
                <p className="wl-muted">Inventário ainda não carregado.</p>
              )}
            </div>
          </div>
        )}

        {/* 8. HISTORICO E RECUPERACAO */}
        {section === "history" && (
          <div className="wl-section-content wl-page-enter" key="page-history">
            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Ponto de restauração manual (Baseline)</h2>
                  <p>
                    Captura o estado prévio do registro e das políticas AppLocker em <code>C:\ProgramData\WinLab\Backups</code>.
                  </p>
                </div>
                <button
                  type="button"
                  className="wl-button primary"
                  onClick={() => void handleCreateBaseline()}
                  disabled={busy || !canOperateAgent}
                >
                  {busy ? "Gravando..." : "Criar ponto de base (Baseline)"}
                </button>
              </div>
              {latestBaseline ? (
                <div className="wl-notice-box info">
                  <strong>Baseline registrado ({latestBaseline.transactionId.slice(0, 8)}):</strong>{" "}
                  Registro em <code>{latestBaseline.registryBaselinePath}</code> · AppLocker em{" "}
                  <code>{latestBaseline.appLockerBaselinePath}</code>
                </div>
              ) : (
                <p className="wl-muted">
                  Toda aplicação de política também grava automaticamente um snapshot de reversão antes da primeira escrita.
                </p>
              )}
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Histórico de transações desta sessão e reversão (Rollback)</h2>
                  <p>
                    Permite desfazer alterações confirmadas restaurando exatamente os valores anteriores gravados no snapshot.
                  </p>
                </div>
                <span className="wl-status-badge neutral">
                  Histórico entre reinícios: Indisponível na UI atual
                </span>
              </div>
              {transactionHistory.length === 0 ? (
                <p className="wl-muted">Nenhuma aplicação registrada nesta sessão ainda.</p>
              ) : (
                <div className="wl-tx-list">
                  {transactionHistory.map((tx) => (
                    <div key={tx.transactionId} className="wl-tx-item">
                      <div>
                        <strong>
                          {tx.appliedCount} política(s) ·{" "}
                          {tx.targetUserName ? `Conta ${tx.targetUserName}` : "Escopo do computador"}
                        </strong>
                        <small>
                          {new Date(tx.appliedAt).toLocaleTimeString()} · ID {tx.transactionId.slice(0, 8)}
                        </small>
                      </div>
                      <div className="wl-head-actions">
                        <span
                          className={`wl-status-badge ${
                            tx.status === "Committed" ? "active" : "inactive"
                          }`}
                        >
                          {tx.status === "Committed" ? "Aplicada" : "Revertida"}
                        </span>
                        {tx.status === "Committed" && (
                          <button
                            type="button"
                            className="wl-button secondary"
                            onClick={() => void handleRollbackTransaction(tx)}
                            disabled={busy}
                          >
                            Desfazer
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 9. CONFIGURACOES */}
        {section === "settings" && (
          <div className="wl-section-content wl-page-enter" key="page-settings">
            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Modo de operação e canal de atualizações</h2>
                  <p>
                    Controle se o painel opera em simulação (Demonstração) ou conectado ao host local do Windows, além do canal de atualização Velopack/Inno.
                  </p>
                </div>
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => void refreshSystemDiagnostics()}
                  disabled={busy || !canOperateAgent}
                >
                  Verificar atualizações
                </button>
              </div>
              {updateStatus ? (
                <div className="wl-account-list">
                  <div className="wl-account">
                    <div>
                      <strong>
                        WinLab Desktop v{updateStatus.currentVersion} · Canal {updateStatus.installChannel}
                      </strong>
                      <small>{updateStatus.channelSummary}</small>
                    </div>
                    <span
                      className={`wl-status-badge ${
                        updateStatus.coexistingLegacyInstallDetected
                          ? "warning"
                          : updateStatus.autoUpdateSupported
                            ? "active"
                            : "inactive"
                      }`}
                    >
                      {updateStatus.pendingVersion
                        ? `v${updateStatus.pendingVersion} pronta no próximo início`
                        : updateStatus.autoUpdateSupported
                          ? "Auto-atualizável"
                          : "Canal fixo / manual"}
                    </span>
                  </div>
                  <div className="wl-account">
                    <div>
                      <strong>Origem de releases</strong>
                      <small>{updateStatus.feedUrl}</small>
                    </div>
                    <span className="wl-scope-tag">Estado: {updateStatus.lastCheckState}</span>
                  </div>
                </div>
              ) : (
                <p className="wl-muted">
                  WinLab Desktop v0.9.1 (Pré-lançamento de piloto · sem publicação estável 1.0).
                </p>
              )}
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Acessibilidade, movimento e atalhos</h2>
                  <p>
                    O WinLab respeita automaticamente <code>prefers-reduced-motion</code> do sistema operacional e oferece ajuste manual abaixo.
                  </p>
                </div>
              </div>
              <div className="wl-setting">
                <div className="wl-setting-info">
                  <div className="wl-setting-header">
                    <strong>Reduzir animações na interface</strong>
                    <span className="wl-scope-tag">Preferência local da UI</span>
                  </div>
                  <p className="wl-setting-description">
                    Desativa transições de página, deslize de gaveta e efeito shimmer nos esqueletos de carregamento.
                  </p>
                </div>
                <div className="wl-setting-controls">
                  <button
                    type="button"
                    role="switch"
                    aria-label="Reduzir animações na interface"
                    aria-checked={reducedMotionPref}
                    className={`wl-switch ${reducedMotionPref ? "selected" : ""}`}
                    onClick={() => toggleReducedMotionPref(!reducedMotionPref)}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <p className="wl-compat-hint" style={{ marginTop: 10 }}>
                Atalhos por teclado: <code>/</code> foca a pesquisa global · <code>Esc</code> fecha a prévia lateral · <code>Tab</code> / <code>Enter</code> operam todos os controles.
              </p>
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Ferramentas do aplicativo</h2>
                  <p>Acesso ao assistente inicial, logs IPC e versão web de referência.</p>
                </div>
              </div>
              <div className="wl-head-actions">
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => setShowWizardModal(true)}
                >
                  Assistente Inicial
                </button>
                {onAdvanced && (
                  <button type="button" className="wl-button secondary" onClick={onAdvanced}>
                    Inspeção técnica e logs IPC
                  </button>
                )}
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() =>
                    window.open("https://winlab-krrozino-s-projects.vercel.app/", "_blank", "noopener,noreferrer")
                  }
                >
                  Abrir versão web no navegador ↗
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BARRA FIXA DE ALTERACOES PENDENTES */}
        {(pendingCount > 0 || busy) && canOperateAgent && (
          <div className="wl-action-bar" role="region" aria-label="Alterações pendentes">
            <div className="wl-action-info">
              <strong>
                {busy
                  ? "Operação em processamento no executor..."
                  : `${pendingCount} alteração(ões) pendente(s) para revisão`}
              </strong>
              <span>
                {busy
                  ? "Aguardando resposta real do Windows e releitura pós-aplicação."
                  : hasUserScopedPending && !selectedUser
                    ? "Selecione uma conta comum válida antes de revisar e aplicar."
                    : selectedUser && hasUserScopedPending
                      ? `Alvo das políticas por usuário: ${selectedUser.name}`
                      : "Políticas globais de máquina prontas para prévia."}
              </span>
            </div>
            <div className="wl-action-buttons">
              <button
                type="button"
                className="wl-button secondary"
                onClick={discardPendingChanges}
                disabled={busy}
              >
                Descartar
              </button>
              <button
                type="button"
                className="wl-button primary"
                onClick={() => {
                  setDrawerBatchResult(null);
                  setShowReviewDrawer(true);
                }}
                disabled={busy || pendingCount === 0}
              >
                {busy ? "Processando..." : `Revisar prévia (${pendingCount})`}
              </button>
            </div>
          </div>
        )}

        {/* PAINEL LATERAL DE PREVIA E CONFIRMACAO */}
        <ReviewDrawer
          open={showReviewDrawer || Boolean(adminPermPreview)}
          mode={mode}
          busy={busy}
          items={reviewDrawerItems}
          selectedUser={selectedUser}
          validationError={transactionValidation && !transactionValidation.valid ? transactionValidation.error ?? "Seleção inválida." : null}
          canConfirm={canApply && Boolean(transactionValidation?.valid)}
          outcomes={executionOutcomes}
          batchResult={drawerBatchResult}
          adminPreview={adminPermPreview}
          onRetryElevatedAdminPreview={handleRetryElevatedAdminPreview}
          onConfirmAdminPreview={handleConfirmAdminPermPreview}
          onRemoveItem={handleRemovePendingItem}
          onDiscardAll={discardPendingChanges}
          onCancel={() => {
            setAdminPermPreview(null);
            setShowReviewDrawer(false);
            setDrawerBatchResult(null);
          }}
          onConfirm={applyPendingChanges}
        />
      </div>
    </div>
  );
}
