import {
  ALLOWED_IPC_ACTIONS,
  type AccountPrivilegeClassification,
  type LocalUserDto,
  type PolicyRisk,
  type PolicyScope
} from "./contracts";

/**
 * Acoes administrativas do contrato Sprint 03A (WinLab.Contracts.Administration.AdminActions).
 * Mantidas aqui em camada compativel para nao alterar src/desktop/contracts.ts sem coordenacao.
 */
export const ADMIN_IPC_ACTIONS = {
  ACCOUNTS_QUERY: "admin.accounts.query",
  ACCOUNTS_PREVIEW: "admin.accounts.preview",
  ACCOUNTS_APPLY: "admin.accounts.apply",
  DIAGNOSTICS_QUERY: "admin.diagnostics.query",
  PERMISSIONS_QUERY: "admin.permissions.query",
  PERMISSIONS_PREVIEW: "admin.permissions.preview",
  PERMISSIONS_APPLY: "admin.permissions.apply"
} as const;

export type AdminAccountRole = "Student" | "Superadmin" | "Recovery" | "Unmanaged";

export interface AdminAccountDto {
  name: string;
  sid: string | null;
  enabled: boolean;
  role: AdminAccountRole;
  privilegeClassification: AccountPrivilegeClassification;
  protected: boolean;
  groupSids: string[];
}

export interface AdminAccountsDto {
  accounts: AdminAccountDto[];
  recoverySid: string | null;
  recoveryStatus: "NotDesignated" | "Observed" | "Inconclusive";
  canWrite: boolean;
  limitations: string[];
}

export type AdminAccountPlan =
  | { operation: "Create"; name: string; role: "Student" | "Superadmin" }
  | { operation: "ProtectRecovery"; sid: string }
  | { operation: "SetEnabled"; sid: string; enabled: boolean };

export interface AdminAccountPreviewDto {
  revision: string;
  scope: "Machine";
  before: AdminAccountDto | null;
  after: AdminAccountDto;
  canApply: boolean;
  limitations: string[];
}

/** A credencial e transitoria. Enviar somente no comando de criacao ou protecao de recuperacao. */
export type AdminAccountApplyPayload =
  | {
      plan: Extract<AdminAccountPlan, { operation: "Create" | "ProtectRecovery" }>;
      revision: string;
      password: string;
    }
  | { plan: Extract<AdminAccountPlan, { operation: "SetEnabled" }>; revision: string };

export interface AdminAccountResultDto {
  account: AdminAccountDto;
  message: string;
}

export type ManagementEvidence = "Detected" | "NotDetected" | "Inconclusive";

export interface AdminManagementDto {
  status: ManagementEvidence;
  domain: ManagementEvidence;
  entra: ManagementEvidence;
  mdm: ManagementEvidence;
}

export type AdminPolicyOrigin =
  | "WinLab"
  | "ExternalLocal"
  | "InstitutionalPossible"
  | "Inconclusive"
  | "None";

export interface AdminDiagnosticSignalDto {
  id: string;
  name: string;
  scope: PolicyScope;
  observedState: string;
  origin: AdminPolicyOrigin;
  effectiveState: string;
  detail: string;
}

export interface AdminDiagnosticsDto {
  management: AdminManagementDto;
  signals: AdminDiagnosticSignalDto[];
  restrictions: AdminPermissionDto[];
  limitations: string[];
}

export type AdminPermissionIntent = "Allow" | "Block" | "Preserve" | "Restore";

export interface AdminPermissionStateDto {
  origin: AdminPolicyOrigin;
  configuredState: string;
  effectiveState: string;
  observedValue: unknown;
  evidence: string | null;
}

export interface AdminPermissionDto {
  id: string;
  name: string;
  category: string;
  description: string;
  expectedEffect: string;
  scope: PolicyScope;
  risk: PolicyRisk;
  compatibility: string;
  supported: boolean;
  requiresRestart: boolean;
  requiresLogoff: boolean;
  requiresAppRestart: boolean;
  mechanism: "Transaction" | "Expansion";
  intents: AdminPermissionIntent[];
  limitations: string[];
  state: AdminPermissionStateDto;
  expansionTarget: "chrome" | "edge" | "apps" | "usb" | null;
}

export interface AdminTargetQueryPayload {
  targetUserSid?: string;
}

export interface AdminPermissionsDto {
  target: AdminAccountDto | null;
  management: AdminManagementDto;
  permissions: AdminPermissionDto[];
  canWrite: boolean;
}

export interface AdminPermissionPlan extends AdminTargetQueryPayload {
  permissionId: string;
  intent: AdminPermissionIntent;
}

export interface AdminPermissionPreviewDto {
  revision: string;
  permissionId: string;
  intent: AdminPermissionIntent;
  scope: PolicyScope;
  target: AdminAccountDto | null;
  before: AdminPermissionStateDto;
  after: AdminPermissionStateDto;
  canApply: boolean;
  limitations: string[];
}

export interface AdminPermissionApplyPayload {
  plan: AdminPermissionPlan;
  revision: string;
}

export interface AdminPermissionResultDto {
  permission: AdminPermissionDto;
  transactionId: string | null;
  message: string;
}

export interface AdminBackendCapabilities {
  accounts: boolean;
  permissions: boolean;
  diagnostics: boolean;
}

/**
 * Detecta se o contrato IPC publicado no runtime ja registra as acoes administrativas Sprint 03A.
 * No baseline atual (sem o merge do backend 03A), retorna false para nao disparar acoes nao autorizadas.
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
  if (role === "Superadmin") return "Superadmin (Administrador protegido)";
  if (role === "Recovery") return "Administrador de recuperação";
  if (role === "Student") return "Aluno (Conta comum)";
  if (classification === "Administrator") return "Administrador local (Protegido)";
  if (classification === "StandardUser") return "Conta comum";
  return "Conta não classificada";
}

/**
 * Normaliza as contas do contrato administrativo (quando disponivel) ou do inventário local atual.
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
