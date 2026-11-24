import type {
  ApplyTransactionRequestDto,
  ApplyTransactionResultDto,
  IpcResponse,
  LocalUserDto,
  PolicyApplyItemDto,
  PolicyItemDto,
  PolicyState
} from "./contracts";

export type VisualPolicyStatus =
  | "NotConfigured"
  | "PendingActivation"
  | "PendingDeactivation"
  | "Applying"
  | "Applied"
  | "PendingLogoff"
  | "PendingReboot"
  | "PendingAppRestart"
  | "PendingFirstLogon"
  | "Drifted"
  | "Inconclusive"
  | "Failed"
  | "NotSupported"
  | "Reverted";

export type VisualBadgeTone = "inactive" | "pending" | "active" | "warning" | "error" | "neutral";

export interface PolicyVisualModel {
  policyId: string;
  currentlyEnabled: boolean;
  switchChecked: boolean;
  hasPendingChange: boolean;
  pendingDesiredState: "Blocked" | "NotConfigured" | null;
  visualStatus: VisualPolicyStatus;
  badgeLabel: string;
  badgeTone: VisualBadgeTone;
  actionRequirements: string[];
  disabled: boolean;
  disabledReason?: string;
}

const ACTIVE_STATES: ReadonlySet<string> = new Set([
  "Applied",
  "Blocked",
  "PendingLogoff",
  "PendingReboot",
  "PendingAppRestart",
  "PendingFirstLogon"
]);

const CANONICAL_SID_REGEX = /^S-1-\d+(-\d+)+$/i;

/**
 * Determina se uma política está atualmente configurada/ativa no sistema consultado.
 * Nunca considera cliques pendentes não confirmados como "ativos no Windows".
 */
export function isPolicyCurrentlyEnabled(policy: PolicyItemDto): boolean {
  const configured = policy.configuredState as string | undefined;
  if (configured === "Blocked" || configured === "Applied") {
    return true;
  }
  const effective = policy.effectiveState ?? policy.currentState;
  return ACTIVE_STATES.has(effective) || ACTIVE_STATES.has(policy.currentState);
}

/**
 * Calcula o novo mapa de alterações pendentes ao alternar o switch de uma política.
 * Garante simetria total:
 * - Desativado -> clique -> PendingActivation (true) -> clique -> volta ao estado real (remove pendência)
 * - Ativado -> clique -> PendingDeactivation (false) -> clique -> volta ao estado real (remove pendência)
 */
export function togglePolicyPendingState(
  prevPending: Record<string, boolean>,
  policy: PolicyItemDto,
  explicitTargetEnabled?: boolean
): Record<string, boolean> {
  const currentlyEnabled = isPolicyCurrentlyEnabled(policy);
  const currentVisualChecked =
    prevPending[policy.id] !== undefined ? prevPending[policy.id] : currentlyEnabled;

  const desiredEnabled =
    explicitTargetEnabled !== undefined ? explicitTargetEnabled : !currentVisualChecked;

  const next = { ...prevPending };
  if (desiredEnabled === currentlyEnabled) {
    delete next[policy.id];
  } else {
    next[policy.id] = desiredEnabled;
  }
  return next;
}

/**
 * Deriva o modelo visual completo de uma política sem jamais confundir seleção local
 * com política efetivamente verificada no Windows.
 */
export function computePolicyVisualModel(
  policy: PolicyItemDto,
  pendingPolicies: Record<string, boolean>,
  options?: { isApplying?: boolean; hasSelectedStandardUser?: boolean }
): PolicyVisualModel {
  const isApplying = options?.isApplying ?? false;
  const hasSelectedStandardUser = options?.hasSelectedStandardUser ?? true;
  const currentlyEnabled = isPolicyCurrentlyEnabled(policy);
  const hasPendingChange = pendingPolicies[policy.id] !== undefined;
  const switchChecked = hasPendingChange ? pendingPolicies[policy.id] : currentlyEnabled;
  const pendingDesiredState: "Blocked" | "NotConfigured" | null = hasPendingChange
    ? pendingPolicies[policy.id]
      ? "Blocked"
      : "NotConfigured"
    : null;

  const effective: PolicyState = policy.effectiveState ?? policy.currentState;

  let visualStatus: VisualPolicyStatus = "NotConfigured";
  let badgeLabel = "Desativado";
  let badgeTone: VisualBadgeTone = "inactive";

  if (isApplying && hasPendingChange) {
    visualStatus = "Applying";
    badgeLabel = "Aplicando...";
    badgeTone = "pending";
  } else if (hasPendingChange) {
    if (pendingPolicies[policy.id]) {
      visualStatus = "PendingActivation";
      badgeLabel = "Ativação pendente";
      badgeTone = "pending";
    } else {
      visualStatus = "PendingDeactivation";
      badgeLabel = "Desativação pendente";
      badgeTone = "pending";
    }
  } else {
    switch (effective) {
      case "Applied":
      case "Blocked":
        visualStatus = "Applied";
        badgeLabel = "Ativado";
        badgeTone = "active";
        break;
      case "PendingLogoff":
        visualStatus = "PendingLogoff";
        badgeLabel = "Aguardando novo login";
        badgeTone = "warning";
        break;
      case "PendingReboot":
        visualStatus = "PendingReboot";
        badgeLabel = "Aguardando reinício";
        badgeTone = "warning";
        break;
      case "PendingAppRestart":
        visualStatus = "PendingAppRestart";
        badgeLabel = "Reinicie o navegador";
        badgeTone = "warning";
        break;
      case "PendingFirstLogon":
        visualStatus = "PendingFirstLogon";
        badgeLabel = "Aguardando 1º login";
        badgeTone = "warning";
        break;
      case "Drifted":
        visualStatus = "Drifted";
        badgeLabel = "Modificado fora do WinLab";
        badgeTone = "error";
        break;
      case "Inconclusive":
        visualStatus = "Inconclusive";
        badgeLabel = "Não verificado";
        badgeTone = "neutral";
        break;
      case "Failed":
        visualStatus = "Failed";
        badgeLabel = "Falha na verificação";
        badgeTone = "error";
        break;
      case "NotSupported":
        visualStatus = "NotSupported";
        badgeLabel = "Não suportado nesta edição";
        badgeTone = "neutral";
        break;
      case "Reverted":
        visualStatus = "Reverted";
        badgeLabel = "Revertido";
        badgeTone = "inactive";
        break;
      default:
        visualStatus = currentlyEnabled ? "Applied" : "NotConfigured";
        badgeLabel = currentlyEnabled ? "Ativado" : "Desativado";
        badgeTone = currentlyEnabled ? "active" : "inactive";
        break;
    }
  }

  const actionRequirements: string[] = [];
  if (policy.requiresRestart) actionRequirements.push("Reiniciar o computador");
  if (policy.requiresLogoff) actionRequirements.push("Encerrar sessão (logoff) da conta comum");
  if (policy.requiresAppRestart) actionRequirements.push("Fechar e reabrir o navegador");

  let disabled = false;
  let disabledReason: string | undefined;
  if (isApplying) {
    disabled = true;
    disabledReason = "Aguarde a conclusão da aplicação em andamento.";
  } else if (effective === "NotSupported") {
    disabled = true;
    disabledReason = "Esta política não é compatível com a edição atual do Windows.";
  } else if (!policy.reversible && currentlyEnabled) {
    disabled = true;
    disabledReason = "Esta política não suporta reversão automática.";
  } else if (policy.scope === "User" && !hasSelectedStandardUser) {
    disabled = true;
    disabledReason = "Selecione ou crie uma conta comum antes de alterar políticas de usuário.";
  }

  return {
    policyId: policy.id,
    currentlyEnabled,
    switchChecked,
    hasPendingChange,
    pendingDesiredState,
    visualStatus,
    badgeLabel,
    badgeTone,
    actionRequirements,
    disabled,
    disabledReason
  };
}

/**
 * Filtra apenas contas comuns (não-administrativas), habilitadas e com SID válido.
 */
export function getEligibleTargetUsers(users: LocalUserDto[] | undefined | null): LocalUserDto[] {
  if (!users || !Array.isArray(users)) return [];
  return users.filter((u) => {
    if (!u || !u.enabled || u.isAdmin) return false;
    if (u.privilegeClassification && u.privilegeClassification !== "StandardUser") return false;
    const sid = u.sid?.trim() ?? "";
    if (!sid || !CANONICAL_SID_REGEX.test(sid)) return false;
    if (sid === "S-1-5-32-544" || sid.endsWith("-500")) return false;
    const lowerName = (u.name ?? "").trim().toLowerCase();
    if (lowerName === "administrador" || lowerName === "administrator") return false;
    return true;
  });
}

/**
 * Ao trocar a conta-alvo selecionada, limpa imediatamente quaisquer pendências de escopo User
 * e invalida os estados exibidos de políticas de usuário até que a nova leitura IPC retorne.
 */
export function transitionTargetUserContext(params: {
  previousSid: string | null;
  nextSid: string | null;
  pendingPolicies: Record<string, boolean>;
  policies: PolicyItemDto[] | null;
}): {
  nextPendingPolicies: Record<string, boolean>;
  invalidatedPolicies: PolicyItemDto[] | null;
  clearedUserPendingCount: number;
} {
  const { previousSid, nextSid, pendingPolicies, policies } = params;
  if (previousSid === nextSid) {
    return {
      nextPendingPolicies: pendingPolicies,
      invalidatedPolicies: policies,
      clearedUserPendingCount: 0
    };
  }

  const userScopedIds = new Set(
    (policies ?? []).filter((p) => p.scope === "User").map((p) => p.id)
  );

  const nextPendingPolicies: Record<string, boolean> = {};
  let clearedUserPendingCount = 0;

  for (const [policyId, desired] of Object.entries(pendingPolicies)) {
    if (userScopedIds.has(policyId)) {
      clearedUserPendingCount += 1;
    } else {
      nextPendingPolicies[policyId] = desired;
    }
  }

  const invalidatedPolicies = policies
    ? policies.map((p) =>
        p.scope === "User"
          ? {
              ...p,
              currentState: "Inconclusive" as PolicyState,
              effectiveState: "Inconclusive" as PolicyState,
              configuredState: "NotConfigured" as const,
              desiredState: "NotConfigured" as const,
              evidence: nextSid
                ? "Consultando o estado real da conta selecionada..."
                : "Selecione uma conta comum para consultar políticas por usuário."
            }
          : p
      )
    : null;

  return {
    nextPendingPolicies,
    invalidatedPolicies,
    clearedUserPendingCount
  };
}

export interface TransactionValidationResult {
  valid: boolean;
  error?: string;
  request?: ApplyTransactionRequestDto;
  requiresLogoff: boolean;
  requiresRestart: boolean;
  requiresAppRestart: boolean;
}

/**
 * Constrói e valida rigorosamente o pedido de transação antes de acionar UAC / IPC.
 */
export function buildValidatedTransactionRequest(params: {
  pendingPolicies: Record<string, boolean>;
  policies: PolicyItemDto[] | null;
  selectedUserSid: string | null;
  localUsers: LocalUserDto[] | undefined | null;
}): TransactionValidationResult {
  const { pendingPolicies, policies, selectedUserSid, localUsers } = params;
  const entries = Object.entries(pendingPolicies);

  if (entries.length === 0) {
    return {
      valid: false,
      error: "Nenhuma alteração pendente selecionada.",
      requiresLogoff: false,
      requiresRestart: false,
      requiresAppRestart: false
    };
  }

  const policyMap = new Map((policies ?? []).map((p) => [p.id, p]));
  let hasUserScoped = false;
  let requiresLogoff = false;
  let requiresRestart = false;
  let requiresAppRestart = false;

  const items: PolicyApplyItemDto[] = [];

  for (const [policyId, enabled] of entries) {
    const meta = policyMap.get(policyId);
    if (meta) {
      if (meta.scope === "User") hasUserScoped = true;
      if (meta.requiresLogoff) requiresLogoff = true;
      if (meta.requiresRestart) requiresRestart = true;
      if (meta.requiresAppRestart) requiresAppRestart = true;
    }
    items.push({
      policyId,
      desiredState: enabled ? "Blocked" : "NotConfigured"
    });
  }

  let targetUserName: string | undefined;
  let targetUserSid: string | undefined;

  if (hasUserScoped) {
    const cleanSid = selectedUserSid?.trim() ?? "";
    if (!cleanSid) {
      return {
        valid: false,
        error: "Selecione uma conta comum válida antes de aplicar políticas por usuário.",
        requiresLogoff,
        requiresRestart,
        requiresAppRestart
      };
    }

    if (!CANONICAL_SID_REGEX.test(cleanSid)) {
      return {
        valid: false,
        error: `O identificador de segurança (SID '${cleanSid}') da conta selecionada é inválido.`,
        requiresLogoff,
        requiresRestart,
        requiresAppRestart
      };
    }

    if (cleanSid === "S-1-5-32-544" || cleanSid.endsWith("-500")) {
      return {
        valid: false,
        error: "Contas administrativas possuem imunidade e não podem receber restrições.",
        requiresLogoff,
        requiresRestart,
        requiresAppRestart
      };
    }

    if (localUsers && localUsers.length > 0) {
      const matched = localUsers.find(
        (u) => (u.sid?.trim().toLowerCase() ?? "") === cleanSid.toLowerCase()
      );
      if (!matched) {
        return {
          valid: false,
          error: "A conta selecionada não foi encontrada entre os usuários locais deste computador.",
          requiresLogoff,
          requiresRestart,
          requiresAppRestart
        };
      }
      if (!matched.enabled) {
        return {
          valid: false,
          error: `A conta '${matched.name}' está desativada no Windows e não pode receber restrições.`,
          requiresLogoff,
          requiresRestart,
          requiresAppRestart
        };
      }
      if (matched.isAdmin || matched.privilegeClassification === "Administrator") {
        return {
          valid: false,
          error: `A conta '${matched.name}' é administradora e está protegida pelo WinLab.`,
          requiresLogoff,
          requiresRestart,
          requiresAppRestart
        };
      }
      if (matched.privilegeClassification === "Unknown") {
        return {
          valid: false,
          error:
            matched.classificationDetail ??
            `Não foi possível confirmar os privilégios da conta '${matched.name}' (classificação desconhecida).`,
          requiresLogoff,
          requiresRestart,
          requiresAppRestart
        };
      }
      targetUserName = matched.name;
    }

    targetUserSid = cleanSid;
  }

  return {
    valid: true,
    request: {
      ...(targetUserName ? { targetUserName } : {}),
      ...(targetUserSid ? { targetUserSid } : {}),
      policies: items
    },
    requiresLogoff,
    requiresRestart,
    requiresAppRestart
  };
}

export interface SavedPolicyProfile {
  id: string;
  name: string;
  savedAt: string;
  policies: Record<string, boolean>;
}

export interface PolicyDriftSummary {
  hasDrift: boolean;
  driftedPolicies: PolicyItemDto[];
  remediationPending: Record<string, boolean>;
}

/**
 * Identifica políticas marcadas como Drifted (alteradas externamente fora do WinLab)
 * e monta o mapa de pendências para restaurar o padrão esperado após confirmação do operador.
 */
export function computePolicyDriftSummary(
  policies: PolicyItemDto[] | null | undefined
): PolicyDriftSummary {
  if (!policies || policies.length === 0) {
    return { hasDrift: false, driftedPolicies: [], remediationPending: {} };
  }

  const driftedPolicies = policies.filter(
    (p) => p.effectiveState === "Drifted" || p.currentState === "Drifted"
  );

  if (driftedPolicies.length === 0) {
    return { hasDrift: false, driftedPolicies: [], remediationPending: {} };
  }

  const remediationPending: Record<string, boolean> = {};
  for (const policy of driftedPolicies) {
    // Se desiredState era NotConfigured, restaura desativado; caso contrário reaplica Blocked
    remediationPending[policy.id] = policy.desiredState !== "NotConfigured";
  }

  return {
    hasDrift: true,
    driftedPolicies,
    remediationPending
  };
}

export interface SavedProfileDiff {
  toEnable: string[];
  toDisable: string[];
  unchangedCount: number;
  pendingMap: Record<string, boolean>;
}

/**
 * Compara um perfil salvo (sem credenciais) contra as políticas lidas da estação atual.
 */
export function computeSavedProfileDiff(
  profilePolicies: Record<string, boolean>,
  livePolicies: PolicyItemDto[] | null | undefined
): SavedProfileDiff {
  if (!livePolicies || livePolicies.length === 0) {
    return { toEnable: [], toDisable: [], unchangedCount: 0, pendingMap: {} };
  }

  const toEnable: string[] = [];
  const toDisable: string[] = [];
  let unchangedCount = 0;
  const pendingMap: Record<string, boolean> = {};

  for (const policy of livePolicies) {
    if (policy.effectiveState === "NotSupported") continue;
    const desired = Boolean(profilePolicies[policy.id]);
    const current = isPolicyCurrentlyEnabled(policy);
    if (desired !== current) {
      pendingMap[policy.id] = desired;
      if (desired) {
        toEnable.push(policy.id);
      } else {
        toDisable.push(policy.id);
      }
    } else {
      unchangedCount++;
    }
  }

  return { toEnable, toDisable, unchangedCount, pendingMap };
}

export type ItemExecutionPhase =
  | "idle"
  | "selected"
  | "processing"
  | "confirmed"
  | "inconclusive"
  | "failed";

export interface PolicyExecutionOutcome {
  policyId: string;
  requestedState: "Blocked" | "NotConfigured" | string;
  phase: "confirmed" | "inconclusive" | "failed";
  detail: string;
  updatedAt: string;
}

/**
 * Deriva o resultado honesto de cada item apos a resposta real do executor e a releitura do Windows.
 * Nunca marca um item como confirmado antes da resposta IPC e da confirmacao na releitura.
 */
export function derivePostApplyOutcomes(params: {
  requestedItems: PolicyApplyItemDto[];
  applyResponse: IpcResponse<ApplyTransactionResultDto>;
  refreshedPolicies: PolicyItemDto[] | null;
}): Record<string, PolicyExecutionOutcome> {
  const { requestedItems, applyResponse, refreshedPolicies } = params;
  const updatedAt = new Date().toISOString();
  const outcomes: Record<string, PolicyExecutionOutcome> = {};

  if (!applyResponse.success || !applyResponse.data?.success) {
    const failedPolicyId = applyResponse.data?.failedPolicyId ?? null;
    const baseFailure =
      applyResponse.error ||
      applyResponse.data?.failureReason ||
      applyResponse.data?.message ||
      "Não foi possível concluir a aplicação. As alterações foram revertidas.";

    for (const item of requestedItems) {
      outcomes[item.policyId] = {
        policyId: item.policyId,
        requestedState: item.desiredState,
        phase: "failed",
        detail:
          failedPolicyId === item.policyId && applyResponse.data?.failureReason
            ? applyResponse.data.failureReason
            : baseFailure,
        updatedAt
      };
    }
    return outcomes;
  }

  const refreshedMap = new Map((refreshedPolicies ?? []).map((p) => [p.id, p]));

  for (const item of requestedItems) {
    const refreshed = refreshedMap.get(item.policyId);
    if (!refreshed) {
      outcomes[item.policyId] = {
        policyId: item.policyId,
        requestedState: item.desiredState,
        phase: "inconclusive",
        detail: "Gravação enviada, mas a releitura não retornou o estado atualizado desta política.",
        updatedAt
      };
      continue;
    }

    const effective = refreshed.effectiveState ?? refreshed.currentState;
    if (effective === "Inconclusive" || refreshed.currentState === "Inconclusive") {
      outcomes[item.policyId] = {
        policyId: item.policyId,
        requestedState: item.desiredState,
        phase: "inconclusive",
        detail: "Gravação enviada, mas a releitura da conta retornou inconclusiva.",
        updatedAt
      };
      continue;
    }

    if (effective === "Failed" || refreshed.currentState === "Failed") {
      outcomes[item.policyId] = {
        policyId: item.policyId,
        requestedState: item.desiredState,
        phase: "failed",
        detail: refreshed.evidence || "A verificação pós-aplicação relatou falha na leitura do registro.",
        updatedAt
      };
      continue;
    }

    const enabledAfter = isPolicyCurrentlyEnabled(refreshed);
    if (item.desiredState === "Blocked") {
      outcomes[item.policyId] = enabledAfter
        ? {
            policyId: item.policyId,
            requestedState: item.desiredState,
            phase: "confirmed",
            detail:
              effective === "PendingLogoff"
                ? "Gravada e verificada no registro; requer novo login da conta comum."
                : effective === "PendingAppRestart"
                  ? "Gravada e verificada no registro; reinicie o navegador para concluir."
                  : effective === "PendingReboot"
                    ? "Gravada e verificada no registro; requer reinício do Windows."
                    : "Aplicada e confirmada na releitura do sistema.",
            updatedAt
          }
        : {
            policyId: item.policyId,
            requestedState: item.desiredState,
            phase: "inconclusive",
            detail: "Execução concluída, porém a releitura não confirmou o bloqueio ativo.",
            updatedAt
          };
      continue;
    }

    if (item.desiredState === "NotConfigured") {
      outcomes[item.policyId] = !enabledAfter
        ? {
            policyId: item.policyId,
            requestedState: item.desiredState,
            phase: "confirmed",
            detail: "Restrição removida e herança padrão confirmada na releitura.",
            updatedAt
          }
        : {
            policyId: item.policyId,
            requestedState: item.desiredState,
            phase: "inconclusive",
            detail: "Remoção enviada, porém a releitura ainda detectou restrição ativa.",
            updatedAt
          };
      continue;
    }

    outcomes[item.policyId] = {
      policyId: item.policyId,
      requestedState: item.desiredState,
      phase: "inconclusive",
      detail: "Estado retornado requer verificação manual.",
      updatedAt
    };
  }

  return outcomes;
}


