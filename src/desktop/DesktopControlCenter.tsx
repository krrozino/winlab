"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import type { Config, OperatingMode, PresetId } from "@/lib/types";
import type {
  ApplyTransactionResultDto,
  IpcResponse,
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
  computePolicyVisualModel,
  computeSavedProfileDiff,
  getEligibleTargetUsers,
  isPolicyCurrentlyEnabled,
  togglePolicyPendingState,
  transitionTargetUserContext
} from "@/desktop/policy-state-machine";
import { DiagnosticReport } from "@/desktop/DiagnosticReport";
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
}

type Section =
  | "home"
  | "accounts"
  | "apps"
  | "internet"
  | "system"
  | "network"
  | "diagnostics"
  | "settings";

interface SessionTransactionEntry {
  transactionId: string;
  appliedAt: string;
  targetUserName?: string;
  targetUserSid?: string;
  appliedCount: number;
  status: "Committed" | "RolledBack";
}

function SectionIcon({ id }: { id: Section }) {
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
    case "home":
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
    case "apps":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.3 7 12 12 20.7 7" />
          <line x1="12" y1="22" x2="12" y2="12" />
        </svg>
      );
    case "internet":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <path d="M12 3a14.5 14.5 0 0 1 0 18 14.5 14.5 0 0 1 0-18" />
        </svg>
      );
    case "system":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
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
    case "diagnostics":
      return (
        <svg {...common} aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
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

const NAVIGATION_ITEMS: { id: Section; label: string }[] = [
  { id: "home", label: "Início" },
  { id: "accounts", label: "Contas e permissões" },
  { id: "apps", label: "Aplicativos" },
  { id: "internet", label: "Internet e navegadores" },
  { id: "system", label: "Sistema Windows" },
  { id: "network", label: "Rede e compartilhamento" },
  { id: "diagnostics", label: "Diagnóstico" },
  { id: "settings", label: "Configurações do WinLab" }
];

const CATEGORY_TO_SECTION: Record<string, Section> = {
  Personalization: "system",
  Personalização: "system",
  Browsers: "internet",
  Navegadores: "internet",
  Navegador: "internet",
  Internet: "internet",
  System: "system",
  Sistema: "system",
  Accounts: "accounts",
  Contas: "accounts",
  "Contas Locais": "accounts",
  Storage: "system",
  Armazenamento: "system",
  "Armazenamento e USB": "system",
  "Controle de Aplicativos": "apps",
  Aplicativos: "apps",
  Rede: "network"
};

interface PolicySettingProps {
  policy: PolicyItemDto;
  pendingPolicies: Record<string, boolean>;
  isApplying: boolean;
  hasSelectedStandardUser: boolean;
  onToggle: (policy: PolicyItemDto) => void;
}

function PolicySetting({
  policy,
  pendingPolicies,
  isApplying,
  hasSelectedStandardUser,
  onToggle
}: PolicySettingProps) {
  const visual = computePolicyVisualModel(policy, pendingPolicies, {
    isApplying,
    hasSelectedStandardUser
  });

  const scopeLabel = policy.scope === "User" ? "Conta comum selecionada" : "Todo o computador";
  const riskLabel: Record<string, string> = {
    Low: "Baixo",
    Medium: "Moderado",
    High: "Elevado",
    Critical: "Crítico"
  };

  return (
    <div className="wl-setting" data-policy-id={policy.id}>
      <div className="wl-setting-info">
        <div className="wl-setting-header">
          <strong>{policy.title}</strong>
          <span className="wl-scope-tag">{scopeLabel}</span>
          <span className={`wl-status-badge ${visual.badgeTone}`}>{visual.badgeLabel}</span>
        </div>
        <p className="wl-setting-description">{policy.description}</p>
        {visual.actionRequirements.length > 0 && (
          <small className="wl-requires-action">
            Efeito completo: {visual.actionRequirements.join(" · ")}
          </small>
        )}
        {policy.evidence && (
          <details className="wl-setting-details">
            <summary>Detalhes técnicos da verificação</summary>
            <div>
              <span>Identificador: {policy.id}</span>
              <span>Impacto: {riskLabel[policy.risk] ?? policy.risk}</span>
              <span>Leitura do sistema: {policy.evidence}</span>
              {policy.lastVerified && <span>Última leitura: {new Date(policy.lastVerified).toLocaleString()}</span>}
            </div>
          </details>
        )}
      </div>
      <div className="wl-setting-controls">
        <button
          type="button"
          role="switch"
          aria-label={`Alternar ${policy.title}`}
          aria-checked={visual.switchChecked}
          title={visual.disabledReason}
          className={`wl-switch ${visual.switchChecked ? "selected" : ""} ${visual.hasPendingChange ? "pending" : ""}`}
          onClick={() => onToggle(policy)}
          disabled={visual.disabled}
        >
          <span />
        </button>
      </div>
    </div>
  );
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
  sendIpc
}: DesktopControlCenterProps) {
  const [section, setSection] = useState<Section>("home");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error" | "warning"; message: string } | null>(null);
  const [pendingPolicies, setPendingPolicies] = useState<Record<string, boolean>>({});
  const [localSelectedUserSid, setLocalSelectedUserSid] = useState<string | null>(externalSelectedUserSid ?? null);
  const [displayPolicies, setDisplayPolicies] = useState<PolicyItemDto[] | null>(policyStates);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<SessionTransactionEntry[]>([]);

  // Criação de contas locais
  const [accountRole, setAccountRole] = useState<"standard" | "admin">("standard");
  const [accountName, setAccountName] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");

  // Rede SMB, canal de atualização e perfis locais salvos (sem credenciais)
  const [network, setNetwork] = useState<NetworkSharePlan>(DEFAULT_NETWORK_SHARE);
  const [networkStudentAccounts, setNetworkStudentAccounts] = useState<string>(
    config.studentUser || "Aluno"
  );
  const [networkEnvironment, setNetworkEnvironment] = useState<NetworkShareEnvironmentDto | null>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusDto | null>(null);
  const [savedProfiles, setSavedProfiles] = useState<SavedPolicyProfile[]>([]);
  const [newProfileName, setNewProfileName] = useState<string>("");

  // Carrega perfis salvos localmente no navegador/WebView2 (jamais armazena senhas)
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("winlab:desktop:saved-profiles:v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedProfiles(
          parsed.filter(
            (item): item is SavedPolicyProfile =>
              Boolean(item && typeof item.id === "string" && typeof item.name === "string" && item.policies && typeof item.policies === "object")
          )
        );
      }
    } catch {
      // Ignora armazenamento corrompido
    }
  }, []);

  // Sincroniza estados vindos da sessão
  useEffect(() => {
    setDisplayPolicies(policyStates);
  }, [policyStates]);

  const nonAdminUsers = useMemo(
    () => getEligibleTargetUsers(inventory?.localUsers),
    [inventory?.localUsers]
  );

  const selectedUserSid = externalSelectedUserSid !== undefined ? externalSelectedUserSid : localSelectedUserSid;

  // Auto-seleciona a primeira conta comum elegível quando o inventário carrega
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
      // Garante zero vazamento de dados simulados quando em modo Real
      if (mode === "Real" && netRes.data.isMock) {
        setNetworkEnvironment(null);
      } else {
        setNetworkEnvironment(netRes.data);
      }
    }
  }, [canOperateAgent, mode, sendIpc]);

  useEffect(() => {
    setNetworkEnvironment(null);
    setUpdateStatus(null);
    if (canOperateAgent) {
      void refreshSystemDiagnostics();
    }
  }, [canOperateAgent, mode, refreshSystemDiagnostics]);

  const driftSummary = useMemo(
    () => computePolicyDriftSummary(displayPolicies),
    [displayPolicies]
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
    const next = [entry, ...savedProfiles.filter((s) => s.name.toLowerCase() !== trimmed.toLowerCase())].slice(0, 12);
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
            ? `Perfil "${profile.name}" comparado com a estação atual: ${diff.toEnable.length} ativação(ões) e ${diff.toDisable.length} desativação(ões) prontas para revisão.`
            : `A estação atual já está idêntica ao perfil "${profile.name}".`
      });
    },
    [displayPolicies]
  );

  // Se o resumo inicial veio de policy.query_state (fundação sem escopo), carrega o catálogo interativo completo (policy.query_states)
  useEffect(() => {
    if (
      canOperateAgent &&
      policyStates &&
      policyStates.length > 0 &&
      policyStates.every((p) => !p.scope)
    ) {
      if (onSelectUser) {
        void onSelectUser(selectedUserSid);
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
    }
  }, [canOperateAgent, policyStates, selectedUserSid, onSelectUser, sendIpc]);

  const selectedUser = useMemo(
    () =>
      nonAdminUsers.find(
        (u) => (u.sid?.toLowerCase() ?? "") === (selectedUserSid?.toLowerCase() ?? "")
      ) ?? null,
    [nonAdminUsers, selectedUserSid]
  );

  const policiesBySection = useMemo(() => {
    const grouped: Record<Section, PolicyItemDto[]> = {
      home: [],
      accounts: [],
      apps: [],
      internet: [],
      system: [],
      network: [],
      diagnostics: [],
      settings: []
    };
    (displayPolicies ?? []).forEach((policy) => {
      const target = CATEGORY_TO_SECTION[policy.category] ?? "system";
      grouped[target].push(policy);
    });
    return grouped;
  }, [displayPolicies]);

  const hasUserScopedPending = useMemo(
    () =>
      (displayPolicies ?? []).some(
        (p) => p.scope === "User" && pendingPolicies[p.id] !== undefined
      ),
    [displayPolicies, pendingPolicies]
  );

  const hasInconclusiveUserPolicies = useMemo(
    () =>
      Boolean(
        selectedUserSid &&
          (displayPolicies ?? []).some(
            (p) =>
              p.scope === "User" &&
              (p.effectiveState === "Inconclusive" || p.currentState === "Inconclusive")
          )
      ),
    [displayPolicies, selectedUserSid]
  );

  const pendingCount = Object.keys(pendingPolicies).length;
  const canApply = canOperateAgent && pendingCount > 0 && (!hasUserScopedPending || selectedUser !== null);

  // Alterna uma política usando a máquina de estados simétrica
  const handleTogglePolicy = useCallback((policy: PolicyItemDto) => {
    setPendingPolicies((prev) => togglePolicyPendingState(prev, policy));
  }, []);

  // Troca de conta-alvo: limpa pendências de usuário, invalida estado anterior e reconsulta IPC
  const handleUserSwitch = useCallback(
    async (nextSidRaw: string) => {
      const nextSid = nextSidRaw.trim() ? nextSidRaw.trim() : null;
      const transition = transitionTargetUserContext({
        previousSid: selectedUserSid ?? null,
        nextSid,
        pendingPolicies,
        policies: displayPolicies
      });

      setLocalSelectedUserSid(nextSid);
      setPendingPolicies(transition.nextPendingPolicies);
      setDisplayPolicies(transition.invalidatedPolicies);

      if (transition.clearedUserPendingCount > 0) {
        setFeedback({
          tone: "warning",
          message: `${transition.clearedUserPendingCount} alteração(ões) pendente(s) da conta anterior foram limpas ao trocar de usuário.`
        });
      } else {
        setFeedback(null);
      }

      if (onSelectUser) {
        await onSelectUser(nextSid);
      } else if (nextSid) {
        const res = await sendIpc<PolicyStateSummaryDto>(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES, {
          targetUserSid: nextSid
        });
        if (res.success && res.data) {
          setDisplayPolicies(res.data.items);
        } else if (res.error) {
          setFeedback({ tone: "error", message: res.error });
        }
      }
    },
    [selectedUserSid, pendingPolicies, displayPolicies, onSelectUser, sendIpc]
  );

  const handleQueryOfflineProfile = useCallback(async () => {
    if (!selectedUserSid) return;
    setBusy(true);
    setFeedback(null);
    try {
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
    } finally {
      setBusy(false);
    }
  }, [selectedUserSid, selectedUser?.name, onQueryOfflineProfile, sendIpc]);

  // Aplica alterações pendentes com validação, transação atômica e releitura imediata
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
    setShowReviewModal(false);

    try {
      const response = await sendIpc<ApplyTransactionResultDto>(
        IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
        validation.request
      );

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

        // Reconsulta imediatamente o estado real verificado
        if (onSelectUser) {
          await onSelectUser(selectedUserSid ?? null);
        } else {
          const refreshed = await sendIpc<PolicyStateSummaryDto>(
            IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES,
            selectedUserSid ? { targetUserSid: selectedUserSid } : undefined
          );
          if (refreshed.success && refreshed.data) {
            setDisplayPolicies(refreshed.data.items);
          }
          await onRefresh();
        }

        const followUp: string[] = [];
        if (validation.requiresRestart) followUp.push("reinicie o computador");
        if (validation.requiresLogoff) followUp.push("encerre e inicie novamente a sessão da conta comum");
        if (validation.requiresAppRestart) followUp.push("feche e reabra o navegador");

        const followUpNote =
          followUp.length > 0 ? ` Para concluir o efeito em sessão ativa, ${followUp.join(" e ")}.` : "";

        setFeedback({
          tone: followUp.length > 0 ? "warning" : "success",
          message: `${txData.appliedCount} política(s) aplicada(s) e verificada(s)${mode === "Demo" ? " em modo de demonstração" : " no Windows"}.${followUpNote}`
        });
      } else {
        const errorMsg =
          response.error ||
          response.data?.message ||
          "Não foi possível concluir a aplicação. As alterações foram revertidas.";
        setFeedback({ tone: "error", message: errorMsg });
        // Reconsulta estados após falha/rollback automático para nunca exibir estado otimista incorreto
        if (onSelectUser) {
          await onSelectUser(selectedUserSid ?? null);
        } else {
          await onRefresh();
        }
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Erro inesperado ao aplicar alterações."
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

  const discardPendingChanges = useCallback(() => {
    setPendingPolicies({});
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
      if (trimmedName.length < 1 || trimmedName.length > 20 || /["/\\[\]:;|=,+*?<>@]/.test(trimmedName)) {
        setFeedback({
          tone: "error",
          message: "Informe um nome de conta entre 1 e 20 caracteres, sem símbolos reservados do Windows."
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
        // Senhas jamais permanecem em estado ou memória após o envio
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
            ? `Perfil "${presetCfg.profileName}" carregado com ${count} alteração(ões) pronta(s) para revisão.`
            : `O computador já corresponde às políticas ativas do perfil "${presetCfg.profileName}".`
      });
    },
    [displayPolicies, setConfig]
  );

  const sectionTitle = NAVIGATION_ITEMS.find((item) => item.id === section)?.label ?? "Início";

  // Contagens reais derivadas exclusivamente dos dados consultados
  const adminUsersCount = inventory?.localUsers.filter((u) => u.enabled && u.isAdmin).length ?? 0;
  const standardUsersCount = nonAdminUsers.length;
  const appliedPoliciesCount = (displayPolicies ?? []).filter((p) => isPolicyCurrentlyEnabled(p)).length;
  const totalPoliciesCount = displayPolicies?.length ?? 0;
  const systemDisk = inventory?.disks?.[0] ?? null;
  const latestCommittedTx = transactionHistory.find((t) => t.status === "Committed") ?? null;

  function renderUserSelectorBar() {
    return (
      <div className="wl-user-selector">
        <div className="wl-user-selector-info">
          <label htmlFor="wl-target-user-select">Conta comum alvo para políticas por usuário</label>
          <small>
            {nonAdminUsers.length > 0
              ? "Contas administrativas ficam ocultas desta lista e possuem imunidade contra restrições."
              : "Nenhuma conta comum ativa encontrada. Crie uma conta comum em Contas e permissões."}
          </small>
        </div>
        <div className="wl-user-selector-controls">
          <select
            id="wl-target-user-select"
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
          {hasInconclusiveUserPolicies && native && mode === "Real" && (
            <button
              type="button"
              className="wl-button secondary"
              onClick={() => void handleQueryOfflineProfile()}
              disabled={busy}
            >
              Consultar perfil offline (Admin)
            </button>
          )}
        </div>
      </div>
    );
  }

  function renderPolicyCategorySection(sec: Section) {
    const items = policiesBySection[sec];
    const containsUserScoped = items.some((p) => p.scope === "User");

    return (
      <div className="wl-section-content">
        {containsUserScoped && renderUserSelectorBar()}
        <div className="wl-section-header">
          <h2>{sectionTitle}</h2>
          <span className="wl-policy-count">{items.length} política(s)</span>
        </div>
        {items.length === 0 ? (
          <div className="wl-empty-state">
            Nenhuma política disponível nesta categoria no momento.
          </div>
        ) : (
          <div className="wl-settings-list">
            {items.map((policy) => (
              <PolicySetting
                key={policy.id}
                policy={policy}
                pendingPolicies={pendingPolicies}
                isApplying={busy}
                hasSelectedStandardUser={selectedUser !== null}
                onToggle={handleTogglePolicy}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="wl-shell">
      <aside className="wl-side">
        <div className="wl-logo">
          <span>W</span>
          <div>
            <strong>WinLab</strong>
            <small>Painel Desktop</small>
          </div>
        </div>

        <div className="wl-side-label">GERENCIAMENTO</div>
        <nav aria-label="Menu principal">
          {NAVIGATION_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`wl-nav ${section === item.id ? "current" : ""}`}
            >
              <span className="wl-nav-icon">
                <SectionIcon id={item.id} />
              </span>
              {item.label}
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
          <div>
            <span className="wl-overline">WINLAB DESKTOP</span>
            <h1>{sectionTitle}</h1>
          </div>
          <div className="wl-head-actions">
            <span
              className={`wl-state ${
                realConnected ? "online" : mode === "Demo" ? "demo" : "offline"
              }`}
            >
              {realConnected
                ? "Computador Real Conectado"
                : mode === "Demo"
                  ? "Modo Demonstração (Simulação)"
                  : "Aguardando Conexão"}
            </span>

            {pendingCount > 0 && (
              <span className="wl-pending-badge">{pendingCount} alteração(ões) pendente(s)</span>
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

        {feedback && (
          <div
            role={feedback.tone === "error" ? "alert" : "status"}
            className={`wl-feedback ${feedback.tone === "error" ? "error" : feedback.tone === "warning" ? "warning" : ""}`}
          >
            <span>{feedback.message}</span>
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
              {driftSummary.driftedPolicies.map((p) => p.title).join(", ")}). Revise e reaplique para restaurar o padrão.
            </span>
            <button
              type="button"
              className="wl-button primary"
              onClick={() => {
                setPendingPolicies((prev) => ({ ...prev, ...driftSummary.remediationPending }));
                setShowReviewModal(true);
              }}
              disabled={busy}
            >
              Preparar restauração do padrão
            </button>
          </div>
        )}

        {mode === "Demo" && (
          <div className="wl-connect">
            <div>
              <strong>Modo Demonstração ativo</strong>
              <p>
                Você pode testar seleção de contas, revisão, aplicação e reversão com segurança em memória. Nenhuma chave de registro ou conta do Windows real será modificada neste modo.
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

        {/* SEÇÃO 1: INÍCIO */}
        {section === "home" && (
          <div className="wl-section-content">
            <section className="wl-welcome">
              <div>
                <span className="wl-overline">ADMINISTRAÇÃO LOCAL SEGURA</span>
                <h2>
                  {inventory?.computerName
                    ? `Estação ${inventory.computerName}`
                    : "Painel de Controle do Computador"}
                </h2>
                <p>
                  Consulte o estado atual do Windows, escolha a conta comum que receberá as políticas, revise o impacto antes de confirmar e reverta alterações com um clique quando precisar.
                </p>
              </div>
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
            </section>

            <div className="wl-stats">
              <div>
                <span>Sistema Operacional</span>
                <strong>{inventory?.windows.caption || "Não consultado"}</strong>
                <small>
                  {inventory?.windows.buildNumber
                    ? `Build ${inventory.windows.buildNumber} · ${inventory.windows.architecture}`
                    : "Aguardando leitura do inventário"}
                </small>
              </div>
              <div>
                <span>Contas Locais Ativas</span>
                <strong>
                  {inventory ? `${standardUsersCount} comum(ns) · ${adminUsersCount} admin` : "—"}
                </strong>
                <small>
                  {selectedUser
                    ? `Alvo atual: ${selectedUser.name}`
                    : "Selecione ou crie uma conta comum"}
                </small>
              </div>
              <div>
                <span>Políticas Verificadas</span>
                <strong>
                  {displayPolicies ? `${appliedPoliciesCount} de ${totalPoliciesCount} ativas` : "—"}
                </strong>
                <small>
                  {pendingCount > 0
                    ? `${pendingCount} alteração(ões) aguardando revisão`
                    : "Nenhuma alteração pendente"}
                </small>
              </div>
              <div>
                <span>Armazenamento & Prontidão</span>
                <strong>
                  {systemDisk
                    ? `${systemDisk.freeGb} GB livres (${systemDisk.freePercent}%)`
                    : preflightData?.status || "—"}
                </strong>
                <small>
                  {preflightData?.readinessMessage || "Leitura sem privilégios administrativos contínuos"}
                </small>
              </div>
            </div>

            {renderUserSelectorBar()}

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Ações rápidas</h2>
                  <p>Acesse diretamente a área que deseja configurar neste computador.</p>
                </div>
              </div>
              <div className="wl-shortcuts">
                <button type="button" onClick={() => setSection("accounts")}>
                  <strong>Gerenciar contas locais</strong>
                  <span>Criar conta de aluno ou professor e escolher conta-alvo</span>
                </button>
                <button type="button" onClick={() => setSection("internet")}>
                  <strong>Proteger navegadores</strong>
                  <span>Bloquear janela anônima e modo visitante no Chrome e Edge</span>
                </button>
                <button type="button" onClick={() => setSection("system")}>
                  <strong>Restringir personalização e sistema</strong>
                  <span>Fixar papel de parede, sons e cursores na conta comum</span>
                </button>
                <button type="button" onClick={() => setSection("diagnostics")}>
                  <strong>Relatório de diagnóstico</strong>
                  <span>Inspecionar compatibilidade e exportar relatório JSON</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SEÇÃO 2: CONTAS E PERMISSÕES */}
        {section === "accounts" && (
          <div className="wl-section-content">
            {renderUserSelectorBar()}

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Contas encontradas neste computador</h2>
                  <p>
                    Contas administrativas possuem imunidade automática no WinLab para evitar bloqueio acidental do administrador.
                  </p>
                </div>
              </div>

              {inventory && inventory.localUsers.length > 0 ? (
                <div className="wl-account-list">
                  {inventory.localUsers.map((user) => (
                    <div key={user.sid || user.name} className="wl-account">
                      <div className="wl-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
                      <div>
                        <strong>{user.name}</strong>
                        <small>
                          {user.enabled ? "Conta ativa" : "Conta desativada"} · SID: {user.sid || "Local"}
                        </small>
                      </div>
                      {!user.enabled && <span className="wl-pill disabled">Desativada</span>}
                      <span className={`wl-pill ${user.isAdmin ? "admin" : ""}`}>
                        {user.isAdmin ? "Administrador (Protegido)" : "Conta comum"}
                      </span>
                      {!user.isAdmin && user.enabled && user.sid && (
                        <button
                          type="button"
                          className={`wl-button ${selectedUserSid === user.sid ? "primary" : "secondary"}`}
                          onClick={() => void handleUserSwitch(user.sid!)}
                          disabled={busy || selectedUserSid === user.sid}
                        >
                          {selectedUserSid === user.sid ? "Alvo selecionado" : "Selecionar como alvo"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wl-muted">Nenhuma conta local carregada ainda.</p>
              )}
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Criar nova conta local no Windows</h2>
                  <p>
                    A senha é enviada apenas no momento da criação para a API nativa do Windows e nunca fica gravada em arquivos ou histórico.
                  </p>
                </div>
              </div>
              <form className="wl-account-form" onSubmit={(e) => void handleCreateAccount(e)}>
                <div className="wl-role-choice">
                  <button
                    type="button"
                    className={accountRole === "standard" ? "chosen" : ""}
                    onClick={() => setAccountRole("standard")}
                  >
                    <span>Conta comum (Recomendado para alunos)</span>
                    <small>Não instala programas do sistema e pode receber políticas por usuário.</small>
                  </button>
                  <button
                    type="button"
                    className={accountRole === "admin" ? "chosen" : ""}
                    onClick={() => setAccountRole("admin")}
                  >
                    <span>Conta de Administrador (Suporte / TI)</span>
                    <small>Controle total da máquina e imunidade contra restrições de laboratório.</small>
                  </button>
                </div>
                <div className="wl-fields">
                  <label>
                    Nome da conta
                    <input
                      type="text"
                      maxLength={20}
                      placeholder="Ex.: Aluno01"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Senha inicial (mínimo 8 caracteres)
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={accountPassword}
                      onChange={(e) => setAccountPassword(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Confirmar senha
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </div>
                <div>
                  <button type="submit" className="wl-button primary" disabled={busy || !canOperateAgent}>
                    {busy ? "Criando conta..." : "Criar conta local"}
                  </button>
                </div>
              </form>
            </div>

            {policiesBySection.accounts.length > 0 && renderPolicyCategorySection("accounts")}
          </div>
        )}

        {/* SEÇÃO 3: APLICATIVOS */}
        {section === "apps" && (
          <div className="wl-section-content">
            {policiesBySection.apps.length > 0 && renderPolicyCategorySection("apps")}

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Programas detectados nesta estação</h2>
                  <p>Leitura local dos aplicativos de sala de aula e softwares instalados no Windows.</p>
                </div>
              </div>
              {inventory && inventory.detectedApps.length > 0 ? (
                <div className="wl-account-list">
                  {inventory.detectedApps.map((app) => (
                    <div key={app.id} className="wl-account">
                      <div>
                        <strong>{app.name}</strong>
                        <small>{app.path}</small>
                      </div>
                      <span className={`wl-status-badge ${app.detected ? "active" : "inactive"}`}>
                        {app.detected ? "Instalado" : "Não encontrado"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="wl-muted">Nenhum aplicativo catalogado retornado na leitura atual.</p>
              )}
            </div>
          </div>
        )}

        {/* SEÇÃO 4: INTERNET E NAVEGADORES */}
        {section === "internet" && renderPolicyCategorySection("internet")}

        {/* SEÇÃO 5: SISTEMA WINDOWS */}
        {section === "system" && renderPolicyCategorySection("system")}

        {/* SEÇÃO 6: REDE E COMPARTILHAMENTO */}
        {section === "network" && (
          <div className="wl-section-content">
            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Estado atual de rede SMB nesta estação</h2>
                  <p>
                    Leitura não-elevada das unidades de rede mapeadas, compartilhamentos locais publicados e protocolo SMBv1.
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
                    Gere scripts administrativos seguros (sem compartilhamento anônimo nem SMBv1) para configurar o servidor e mapear a unidade nas estações de aula.
                  </p>
                </div>
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
          </div>
        )}

        {/* SEÇÃO 7: DIAGNÓSTICO */}
        {section === "diagnostics" && (
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
                        ["PendingLogoff", "PendingReboot", "PendingAppRestart", "PendingFirstLogon"].includes(
                          p.effectiveState ?? p.currentState
                        )
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
        )}

        {/* SEÇÃO 8: CONFIGURAÇÕES DO WINLAB */}
        {section === "settings" && (
          <div className="wl-section-content">
            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Versão, instalador e canal de atualizações</h2>
                  <p>
                    O WinLab Desktop baixa atualizações estáveis em segundo plano e aplica apenas no próximo início, sem interromper aulas em andamento.
                  </p>
                </div>
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => void refreshSystemDiagnostics()}
                  disabled={busy || !canOperateAgent}
                >
                  Verificar estado
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
                      <strong>Repositório de releases estáveis</strong>
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
                  <h2>Perfis salvos localmente e comparação com a estação</h2>
                  <p>
                    Salve combinações personalizadas de políticas para reaproveitar e comparar diferenças antes de aplicar. Nenhuma senha é armazenada.
                  </p>
                </div>
              </div>
              <div className="wl-fields" style={{ marginBottom: 12 }}>
                <label style={{ gridColumn: "1 / -1" }}>
                  Nome do perfil personalizado
                  <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                    <input
                      type="text"
                      placeholder="Ex.: Laboratório Noite — Design"
                      value={newProfileName}
                      onChange={(e) => setNewProfileName(e.target.value)}
                      style={{ flex: 1 }}
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
                              : `Diferenças para a estação: +${diff.toEnable.length} ativar · -${diff.toDisable.length} desativar · ${diff.unchangedCount} iguais`}
                          </small>
                        </div>
                        <div className="wl-head-actions">
                          <button
                            type="button"
                            className="wl-button secondary"
                            onClick={() => handleStageSavedProfile(prof)}
                            disabled={busy}
                          >
                            {totalDiff === 0 ? "Alinhado" : "Carregar diferenças"}
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
                  <h2>Perfis rápidos de sala de aula</h2>
                  <p>
                    Carregue um perfil pré-configurado para selecionar automaticamente as restrições recomendadas e revisá-las antes de aplicar.
                  </p>
                </div>
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
            </div>

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Importar ou exportar perfil JSON</h2>
                  <p>
                    Compatível com o configurador WinLab Web. Nenhuma senha é exportada no arquivo JSON.
                  </p>
                </div>
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

            <div className="wl-card">
              <div className="wl-card-title">
                <div>
                  <h2>Histórico de aplicações nesta sessão</h2>
                  <p>
                    Cada aplicação cria um snapshot prévio dos valores originais e permite desfazer as alterações com restauração verificada.
                  </p>
                </div>
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

        {/* BARRA DE AÇÃO FIXA DE ALTERAÇÕES PENDENTES */}
        {pendingCount > 0 && canOperateAgent && (
          <div className="wl-action-bar">
            <div className="wl-action-info">
              <strong>{pendingCount} alteração(ões) selecionada(s) para revisão</strong>
              <span>
                {hasUserScopedPending && !selectedUser
                  ? "Selecione uma conta comum válida antes de revisar e aplicar."
                  : selectedUser && hasUserScopedPending
                    ? `Alvo das políticas de usuário: ${selectedUser.name}`
                    : "Políticas globais do computador prontas para revisão."}
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
                onClick={() => setShowReviewModal(true)}
                disabled={busy || !canApply}
                title={!canApply ? "Selecione um usuário comum válido para políticas por usuário" : undefined}
              >
                {busy ? "Aplicando..." : "Revisar e aplicar"}
              </button>
            </div>
          </div>
        )}

        {/* MODAL DE REVISÃO E CONFIRMAÇÃO */}
        {showReviewModal && (
          <div className="wl-modal-overlay" onClick={() => setShowReviewModal(false)}>
            <div
              className="wl-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="wl-review-modal-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="wl-review-modal-title">Revisar Alterações</h2>
              <p className="wl-modal-sub">
                {mode === "Real"
                  ? "O WinLab salvará um ponto de restauração dos valores atuais antes de aplicar. O Windows solicitará confirmação administrativa (UAC)."
                  : "Simulação em Modo Demonstração: nenhuma alteração será gravada no Windows real."}
              </p>

              <div className="wl-review-target">
                <strong>
                  {hasUserScopedPending && selectedUser
                    ? `Conta-alvo de usuário: ${selectedUser.name}`
                    : "Escopo: Todo o computador"}
                </strong>
                {hasUserScopedPending && selectedUser?.sid && (
                  <span className="wl-muted">SID verificado: {selectedUser.sid}</span>
                )}
              </div>

              <div className="wl-review-list">
                {Object.entries(pendingPolicies).map(([policyId, enabled]) => {
                  const policy = displayPolicies?.find((p) => p.id === policyId);
                  return (
                    <div key={policyId} className="wl-review-item">
                      <strong>{policy?.title || policyId}</strong>
                      <span>
                        {enabled
                          ? "Estado atual → Ativar restrição (Blocked)"
                          : "Estado atual → Remover restrição (NotConfigured)"}
                      </span>
                      {policy && (
                        <small>
                          {policy.scope === "User" ? "Aplica-se somente à conta selecionada · " : "Aplica-se ao computador · "}
                          {policy.requiresRestart
                            ? "Requer reiniciar o computador"
                            : policy.requiresLogoff
                              ? "Requer encerrar sessão (logoff)"
                              : policy.requiresAppRestart
                                ? "Requer fechar e reabrir o navegador"
                                : "Efeito imediato após verificação"}
                        </small>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="wl-modal-actions">
                <button
                  type="button"
                  className="wl-button secondary"
                  onClick={() => setShowReviewModal(false)}
                  disabled={busy}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="wl-button primary"
                  onClick={() => void applyPendingChanges()}
                  disabled={busy || !canApply}
                >
                  {busy ? "Aplicando..." : "Confirmar e aplicar"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
