import {
  ALLOWED_IPC_ACTIONS,
  IPC_CONSTANTS,
  type AccountPrivilegeClassification,
  type AdminAccountApplyPayload,
  type AdminAccountDto,
  type AdminAccountPlan,
  type AdminAccountPreviewDto,
  type AdminAccountResultDto,
  type AdminAccountRole,
  type AdminAccountsDto,
  type AdminDiagnosticSignalDto,
  type AdminDiagnosticsDto,
  type AdminExpansionPreviewDto,
  type AdminManagementDto,
  type AdminPermissionApplyPayload,
  type AdminPermissionDto,
  type AdminPermissionIntent,
  type AdminPermissionPlan,
  type AdminPermissionPreviewDto,
  type AdminPermissionPreviewPayload,
  type AdminPermissionResultDto,
  type AdminPermissionStateDto,
  type AdminPermissionsDto,
  type AdminPolicyOrigin,
  type AdminTargetQueryPayload,
  type IpcResponse,
  type LocalUserDto,
  type ManagementEvidence,
  type PolicyScope
} from "./contracts";

export type {
  AdminAccountApplyPayload,
  AdminAccountDto,
  AdminAccountPlan,
  AdminAccountPreviewDto,
  AdminAccountResultDto,
  AdminAccountRole,
  AdminAccountsDto,
  AdminDiagnosticSignalDto,
  AdminDiagnosticsDto,
  AdminExpansionPreviewDto,
  AdminManagementDto,
  AdminPermissionApplyPayload,
  AdminPermissionDto,
  AdminPermissionIntent,
  AdminPermissionPlan,
  AdminPermissionPreviewDto,
  AdminPermissionPreviewPayload,
  AdminPermissionResultDto,
  AdminPermissionStateDto,
  AdminPermissionsDto,
  AdminPolicyOrigin,
  AdminTargetQueryPayload,
  ManagementEvidence
};

/**
 * Aliases apontando diretamente para os contratos oficiais em IPC_CONSTANTS.
 */
export const ADMIN_IPC_ACTIONS = {
  ACCOUNTS_QUERY: IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_QUERY,
  ACCOUNTS_PREVIEW: IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_PREVIEW,
  ACCOUNTS_APPLY: IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_APPLY,
  DIAGNOSTICS_QUERY: IPC_CONSTANTS.ACTION_ADMIN_DIAGNOSTICS_QUERY,
  PERMISSIONS_QUERY: IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_QUERY,
  PERMISSIONS_PREVIEW: IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_PREVIEW,
  PERMISSIONS_APPLY: IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_APPLY
} as const;

const MUTATION_IPC_ACTIONS: ReadonlySet<string> = new Set([
  IPC_CONSTANTS.ACTION_EXPANSION_APPLY,
  IPC_CONSTANTS.ACTION_EXPANSION_ROLLBACK,
  IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
  IPC_CONSTANTS.ACTION_ROLLBACK_TRANSACTION,
  IPC_CONSTANTS.ACTION_CREATE_LOCAL_ACCOUNT,
  IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_APPLY,
  IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_APPLY
]);

const ADMIN_FALLBACK_ERROR_CODES: ReadonlySet<string> = new Set([
  "UNHANDLED_ACTION",
  "UNAUTHORIZED_ACTION",
  "PLATFORM_NOT_SUPPORTED",
  "ADMIN_UNAVAILABLE"
]);

const LOCAL_WINDOWS_SID_REGEX = /^S-1-5-21-(\d+)-(\d+)-(\d+)-(\d+)$/;

/**
 * Classifica acoes que exigem envelope type = "command" no transporte IPC (paridade com AdminRequest.cs).
 */
export function isMutationIpcAction(action: string): boolean {
  return MUTATION_IPC_ACTIONS.has(action);
}

/**
 * Valida se o SID segue o formato canonico local exigido pelo backend C# (AdminRequest.IsLocalSid):
 * S-1-5-21-<a>-<b>-<c>-<rid> com 4 inteiros UInt32 e ate 60 caracteres.
 */
export function isCanonicalLocalWindowsSid(sid: string | null | undefined): sid is string {
  if (typeof sid !== "string") return false;
  if (sid.length === 0 || sid.length > 60) return false;
  const match = LOCAL_WINDOWS_SID_REGEX.exec(sid);
  if (!match) return false;
  for (let i = 1; i <= 4; i++) {
    const part = match[i];
    if (part.length > 1 && part.startsWith("0")) return false;
    const num = Number(part);
    if (!Number.isInteger(num) || num < 0 || num > 4_294_967_295) {
      return false;
    }
  }
  return true;
}

/**
 * Constroi o payload estrito exigido por admin.permissions.query e admin.diagnostics.query.
 * Sempre retorna um objeto (nunca undefined) e omite targetUserSid invalido ou não-local.
 */
export function buildAdminTargetQueryPayload(
  targetUserSid?: string | null,
  elevatedRead?: boolean
): AdminTargetQueryPayload {
  const payload: AdminTargetQueryPayload = {};
  const cleanSid = targetUserSid?.trim();
  if (isCanonicalLocalWindowsSid(cleanSid)) {
    payload.targetUserSid = cleanSid;
  }
  if (elevatedRead === true) {
    payload.elevatedRead = true;
  }
  return payload;
}

/**
 * Constroi o payload estrito de admin.permissions.preview:
 * omite targetUserSid para escopo Machine e inclui somente SID local canonico para escopo User.
 */
export function buildAdminPermissionPreviewPayload(params: {
  permissionId: string;
  intent: AdminPermissionIntent;
  scope: PolicyScope;
  targetUserSid?: string | null;
  elevatedRead?: boolean;
  transactionId?: string;
}): AdminPermissionPreviewPayload {
  const payload: AdminPermissionPreviewPayload = {
    permissionId: params.permissionId,
    intent: params.intent
  };
  const cleanSid = params.targetUserSid?.trim();
  if (params.scope === "User" && isCanonicalLocalWindowsSid(cleanSid)) {
    payload.targetUserSid = cleanSid;
  }
  if (params.elevatedRead === true) {
    payload.elevatedRead = true;
  }
  if (params.intent === "Restore" && params.transactionId) {
    payload.transactionId = params.transactionId;
  }
  return payload;
}

/**
 * Constroi o payload estrito de admin.permissions.apply:
 * remove campos nao aceitos em plan (como elevatedRead) e omite targetUserSid em escopo Machine.
 */
export function buildAdminPermissionApplyPayload(
  preview: AdminPermissionPreviewDto
): AdminPermissionApplyPayload {
  const targetSid = preview.target?.sid?.trim();
  const plan: AdminPermissionPlan = {
    permissionId: preview.permissionId,
    intent: preview.intent,
    ...(preview.intent === "Restore" && preview.transactionId ? { transactionId: preview.transactionId } : {}),
    ...(preview.scope === "User" && isCanonicalLocalWindowsSid(targetSid)
      ? { targetUserSid: targetSid }
      : {})
  };
  return {
    plan,
    revision: preview.revision
  };
}

/**
 * Indica se o erro retornado por uma consulta admin.* representa ausencia de suporte no agente
 * (Mock, agente legado ou host fora do Windows), devendo cair graciosamente para o modo legado.
 */
export function isAdminFallbackErrorCode(errorCode?: string | null): boolean {
  return Boolean(errorCode && ADMIN_FALLBACK_ERROR_CODES.has(errorCode));
}

export interface AdminBackendCapabilities {
  accounts: boolean;
  permissions: boolean;
  diagnostics: boolean;
}

/**
 * Verifica se as acoes administrativas estao registradas na allowlist estatica do protocolo IPC.
 * No runtime real, use AdminCenterSession.probeAndLoad para detectar se o agente conectado
 * (Real vs Mock vs legado) efetivamente implementa o centro administrativo.
 */
export function detectAdminBackendCapabilities(
  allowedActions: readonly string[] = ALLOWED_IPC_ACTIONS,
  override?: Partial<AdminBackendCapabilities>
): AdminBackendCapabilities {
  const detected: AdminBackendCapabilities = {
    accounts:
      allowedActions.includes(ADMIN_IPC_ACTIONS.ACCOUNTS_QUERY) &&
      allowedActions.includes(ADMIN_IPC_ACTIONS.ACCOUNTS_PREVIEW) &&
      allowedActions.includes(ADMIN_IPC_ACTIONS.ACCOUNTS_APPLY),
    permissions:
      allowedActions.includes(ADMIN_IPC_ACTIONS.PERMISSIONS_QUERY) &&
      allowedActions.includes(ADMIN_IPC_ACTIONS.PERMISSIONS_PREVIEW) &&
      allowedActions.includes(ADMIN_IPC_ACTIONS.PERMISSIONS_APPLY),
    diagnostics: allowedActions.includes(ADMIN_IPC_ACTIONS.DIAGNOSTICS_QUERY)
  };

  if (!override) return detected;
  return {
    accounts: override.accounts ?? detected.accounts,
    permissions: override.permissions ?? detected.permissions,
    diagnostics: override.diagnostics ?? detected.diagnostics
  };
}

export type IpcSender = <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;

export type AdminProbeLoadResult =
  | { stale: true }
  | {
      stale: false;
      capabilities: AdminBackendCapabilities;
      accounts: AdminAccountsDto | null;
      permissions: AdminPermissionsDto | null;
      diagnostics: AdminDiagnosticsDto | null;
    };

export type AdminTargetQueryResult =
  | { stale: true }
  | {
      stale: false;
      permissions: AdminPermissionsDto | null;
      permissionsError?: string;
      diagnostics: AdminDiagnosticsDto | null;
      diagnosticsError?: string;
    };

export type AdminPermissionPreviewResult =
  | { stale: true }
  | {
      stale: false;
      response: IpcResponse<AdminPermissionPreviewDto>;
    };

/**
 * Coordena sondagem e consultas administrativas com token de geracao monotonico
 * para descartar respostas desatualizadas ao trocar de conta ou modo.
 */
export class AdminCenterSession {
  private generation = 0;
  private previewGeneration = 0;
  private currentTargetSid: string | null = null;

  public getTargetSid(): string | null {
    return this.currentTargetSid;
  }

  /**
   * Invalida imediatamente quaisquer consultas e previas em andamento ao trocar conta ou modo.
   */
  public invalidate(nextTargetSid?: string | null): number {
    this.generation += 1;
    this.previewGeneration += 1;
    this.currentTargetSid = nextTargetSid?.trim() ? nextTargetSid.trim() : null;
    return this.generation;
  }

  public async probeAndLoad(
    sendIpc: IpcSender,
    params: {
      targetUserSid?: string | null;
      elevatedRead?: boolean;
      override?: Partial<AdminBackendCapabilities>;
    } = {}
  ): Promise<AdminProbeLoadResult> {
    const gen = this.invalidate(params.targetUserSid ?? null);
    const { override, elevatedRead } = params;

    if (
      override?.accounts === false &&
      override?.permissions === false &&
      override?.diagnostics === false
    ) {
      return {
        stale: false,
        capabilities: { accounts: false, permissions: false, diagnostics: false },
        accounts: null,
        permissions: null,
        diagnostics: null
      };
    }

    let accountsData: AdminAccountsDto | null = null;
    let detectedAccounts = false;

    if (override?.accounts !== false) {
      const accRes = await sendIpc<AdminAccountsDto>(ADMIN_IPC_ACTIONS.ACCOUNTS_QUERY, {});
      if (gen !== this.generation) {
        return { stale: true };
      }
      if (accRes.success && accRes.data) {
        detectedAccounts = true;
        accountsData = accRes.data;
      } else if (
        override?.accounts === undefined &&
        override?.permissions !== true &&
        override?.diagnostics !== true &&
        (isAdminFallbackErrorCode(accRes.errorCode) || !accRes.success)
      ) {
        return {
          stale: false,
          capabilities: { accounts: false, permissions: false, diagnostics: false },
          accounts: null,
          permissions: null,
          diagnostics: null
        };
      }
    }

    const queryPayload = buildAdminTargetQueryPayload(params.targetUserSid, elevatedRead);
    const shouldQueryPerms = override?.permissions !== false && (detectedAccounts || override?.permissions === true);
    const shouldQueryDiag = override?.diagnostics !== false && (detectedAccounts || override?.diagnostics === true);

    const [permRes, diagRes] = await Promise.all([
      shouldQueryPerms
        ? sendIpc<AdminPermissionsDto>(ADMIN_IPC_ACTIONS.PERMISSIONS_QUERY, queryPayload)
        : Promise.resolve(null),
      shouldQueryDiag
        ? sendIpc<AdminDiagnosticsDto>(ADMIN_IPC_ACTIONS.DIAGNOSTICS_QUERY, queryPayload)
        : Promise.resolve(null)
    ]);

    if (gen !== this.generation) {
      return { stale: true };
    }

    const permissionsData = permRes && permRes.success && permRes.data ? permRes.data : null;
    const diagnosticsData = diagRes && diagRes.success && diagRes.data ? diagRes.data : null;

    return {
      stale: false,
      capabilities: {
        accounts: override?.accounts ?? detectedAccounts,
        permissions: override?.permissions ?? Boolean(permissionsData),
        diagnostics: override?.diagnostics ?? Boolean(diagnosticsData)
      },
      accounts: accountsData,
      permissions: permissionsData,
      diagnostics: diagnosticsData
    };
  }

  public async queryTarget(
    sendIpc: IpcSender,
    params: {
      targetUserSid?: string | null;
      elevatedRead?: boolean;
      includePermissions: boolean;
      includeDiagnostics: boolean;
    }
  ): Promise<AdminTargetQueryResult> {
    const gen = this.invalidate(params.targetUserSid ?? null);
    const payload = buildAdminTargetQueryPayload(params.targetUserSid, params.elevatedRead);

    const [permRes, diagRes] = await Promise.all([
      params.includePermissions
        ? sendIpc<AdminPermissionsDto>(ADMIN_IPC_ACTIONS.PERMISSIONS_QUERY, payload)
        : Promise.resolve(null),
      params.includeDiagnostics
        ? sendIpc<AdminDiagnosticsDto>(ADMIN_IPC_ACTIONS.DIAGNOSTICS_QUERY, payload)
        : Promise.resolve(null)
    ]);

    if (gen !== this.generation) {
      return { stale: true };
    }

    return {
      stale: false,
      permissions: permRes && permRes.success && permRes.data ? permRes.data : null,
      permissionsError: permRes && !permRes.success ? permRes.error : undefined,
      diagnostics: diagRes && diagRes.success && diagRes.data ? diagRes.data : null,
      diagnosticsError: diagRes && !diagRes.success ? diagRes.error : undefined
    };
  }

  public async previewPermission(
    sendIpc: IpcSender,
    params: {
      permissionId: string;
      intent: AdminPermissionIntent;
      scope: PolicyScope;
      targetUserSid?: string | null;
      elevatedRead?: boolean;
      transactionId?: string;
    }
  ): Promise<AdminPermissionPreviewResult> {
    const targetGen = this.generation;
    const previewGen = ++this.previewGeneration;
    const payload = buildAdminPermissionPreviewPayload(params);
    const response = await sendIpc<AdminPermissionPreviewDto>(
      ADMIN_IPC_ACTIONS.PERMISSIONS_PREVIEW,
      payload
    );
    if (targetGen !== this.generation || previewGen !== this.previewGeneration) {
      return { stale: true };
    }
    return { stale: false, response };
  }
}

export interface UnifiedAccountRow {
  key: string;
  name: string;
  sid: string | null;
  enabled: boolean;
  role: AdminAccountRole;
  roleLabel: string;
  privilegeClassification: AccountPrivilegeClassification;
  classificationDetail: string | null;
  protected: boolean;
  canBePolicyTarget: boolean;
  groupSids: string[];
  source: "admin-contract" | "inventory";
}

function getRoleLabel(role: AdminAccountRole, classification: AccountPrivilegeClassification): string {
  if (role === "Superadmin") return "Superadmin (Administrador)";
  if (role === "Recovery") return "Administrador de recuperação";
  if (role === "Student") return "Aluno (Conta comum)";
  if (classification === "Administrator") return "Administrador local";
  if (classification === "StandardUser") return "Conta comum";
  return "Conta não classificada";
}

/**
 * Normaliza as contas do contrato administrativo (quando disponivel) ou do inventario local legado.
 */
export function buildUnifiedAccountRows(
  localUsers: LocalUserDto[] | undefined | null,
  adminAccounts?: AdminAccountsDto | null
): UnifiedAccountRow[] {
  if (adminAccounts && Array.isArray(adminAccounts.accounts) && adminAccounts.accounts.length > 0) {
    return adminAccounts.accounts.map((acc) => {
      const canBePolicyTarget =
        acc.enabled &&
        !acc.protected &&
        acc.role === "Student" &&
        acc.privilegeClassification === "StandardUser" &&
        Boolean(acc.sid && acc.sid.trim());
      return {
        key: acc.sid || acc.name,
        name: acc.name,
        sid: acc.sid,
        enabled: acc.enabled,
        role: acc.role,
        roleLabel: getRoleLabel(acc.role, acc.privilegeClassification),
        privilegeClassification: acc.privilegeClassification,
        classificationDetail: null,
        protected: acc.protected,
        canBePolicyTarget,
        groupSids: acc.groupSids,
        source: "admin-contract"
      };
    });
  }

  return (localUsers ?? []).map((user) => {
    const classification: AccountPrivilegeClassification =
      user.privilegeClassification ?? (user.isAdmin ? "Administrator" : "StandardUser");
    const isAdmin = user.isAdmin || classification === "Administrator";
    const isUnknown = classification === "Unknown";
    const role: AdminAccountRole = isAdmin ? "Superadmin" : isUnknown ? "Unmanaged" : "Student";
    const sid = user.sid?.trim() || null;
    const isBuiltInAdminSid = sid === "S-1-5-32-544" || Boolean(sid?.endsWith("-500"));
    const isBuiltInAdminName =
      user.name.trim().toLowerCase() === "administrador" ||
      user.name.trim().toLowerCase() === "administrator";
    const isProtected = isAdmin || isUnknown || isBuiltInAdminSid || isBuiltInAdminName;
    const canBePolicyTarget = Boolean(
      user.enabled && !isProtected && classification === "StandardUser" && sid && /^S-1-\d+(-\d+)+$/i.test(sid)
    );

    return {
      key: sid || user.name,
      name: user.name,
      sid,
      enabled: user.enabled,
      role,
      roleLabel: getRoleLabel(role, classification),
      privilegeClassification: classification,
      classificationDetail: user.classificationDetail ?? null,
      protected: isProtected,
      canBePolicyTarget,
      groupSids: [],
      source: "inventory"
    };
  });
}
