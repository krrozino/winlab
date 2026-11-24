/**
 * Contratos tipados de IPC para o WinLab Desktop, espelhando fielmente
 * a biblioteca C# WinLab.Contracts para interoperabilidade perfeita.
 */

export const IPC_CONSTANTS = {
  PIPE_NAME: "WinLabService",
  PROTOCOL_VERSION: "1.0.0",

  ACTION_QUERY_INVENTORY: "inventory.query",
  ACTION_QUERY_POLICY_STATE: "policy.query_state",
  ACTION_QUERY_PREFLIGHT: "preflight.query",
  ACTION_LIST_PRESETS: "presets.list",
  ACTION_PREVIEW_POLICY_DIFF: "policy.preview_diff",
  ACTION_VALIDATE_CONFIG: "config.validate",

  ACTION_CREATE_BASELINE: "baseline.create",
  ACTION_CREATE_LOCAL_ACCOUNT: "accounts.create_local",
  ACTION_GET_ENVIRONMENT: "system.environment",
  ACTION_QUERY_UPDATE_STATUS: "system.update_status",
  ACTION_QUERY_NETWORK_SHARES: "network.query_shares",
  ACTION_SET_MODE: "mode.set",

  // Milestone 3: Declarative Policy Engine & Transactions
  ACTION_QUERY_POLICY_CATALOG: "policy.query_catalog",
  ACTION_QUERY_POLICY_STATES: "policy.query_states",
  ACTION_APPLY_TRANSACTION: "policy.apply_transaction",
  ACTION_ROLLBACK_TRANSACTION: "policy.rollback_transaction",
  ACTION_QUERY_TRANSACTION_STATUS: "policy.query_status",
  ACTION_EXPANSION_QUERY: "policy.expansion_query",
  ACTION_EXPANSION_PREVIEW: "policy.expansion_preview",
  ACTION_EXPANSION_APPLY: "policy.expansion_apply",
  ACTION_EXPANSION_ROLLBACK: "policy.expansion_rollback",
  ACTION_ADMIN_ACCOUNTS_QUERY: "admin.accounts.query",
  ACTION_ADMIN_ACCOUNTS_PREVIEW: "admin.accounts.preview",
  ACTION_ADMIN_ACCOUNTS_APPLY: "admin.accounts.apply",
  ACTION_ADMIN_DIAGNOSTICS_QUERY: "admin.diagnostics.query",
  ACTION_ADMIN_PERMISSIONS_QUERY: "admin.permissions.query",
  ACTION_ADMIN_PERMISSIONS_PREVIEW: "admin.permissions.preview",
  ACTION_ADMIN_PERMISSIONS_APPLY: "admin.permissions.apply",

  // Legacy Mutating Actions (Foundation stage — blocked by PRIVILEGED_EXECUTOR_DISABLED)
  ACTION_APPLY_POLICIES: "policy.apply",
  ACTION_ROLLBACK_POLICIES: "policy.rollback"
} as const;

export const ALLOWED_IPC_ACTIONS: readonly string[] = [
  IPC_CONSTANTS.ACTION_QUERY_INVENTORY,
  IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE,
  IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT,
  IPC_CONSTANTS.ACTION_LIST_PRESETS,
  IPC_CONSTANTS.ACTION_PREVIEW_POLICY_DIFF,
  IPC_CONSTANTS.ACTION_VALIDATE_CONFIG,
  IPC_CONSTANTS.ACTION_CREATE_BASELINE,
  IPC_CONSTANTS.ACTION_CREATE_LOCAL_ACCOUNT,
  IPC_CONSTANTS.ACTION_GET_ENVIRONMENT,
  IPC_CONSTANTS.ACTION_QUERY_UPDATE_STATUS,
  IPC_CONSTANTS.ACTION_QUERY_NETWORK_SHARES,
  IPC_CONSTANTS.ACTION_SET_MODE,
  IPC_CONSTANTS.ACTION_QUERY_POLICY_CATALOG,
  IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES,
  IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
  IPC_CONSTANTS.ACTION_ROLLBACK_TRANSACTION,
  IPC_CONSTANTS.ACTION_QUERY_TRANSACTION_STATUS,
  IPC_CONSTANTS.ACTION_EXPANSION_QUERY,
  IPC_CONSTANTS.ACTION_EXPANSION_PREVIEW,
  IPC_CONSTANTS.ACTION_EXPANSION_APPLY,
  IPC_CONSTANTS.ACTION_EXPANSION_ROLLBACK,
  IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_QUERY,
  IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_PREVIEW,
  IPC_CONSTANTS.ACTION_ADMIN_ACCOUNTS_APPLY,
  IPC_CONSTANTS.ACTION_ADMIN_DIAGNOSTICS_QUERY,
  IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_QUERY,
  IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_PREVIEW,
  IPC_CONSTANTS.ACTION_ADMIN_PERMISSIONS_APPLY,
  IPC_CONSTANTS.ACTION_APPLY_POLICIES,
  IPC_CONSTANTS.ACTION_ROLLBACK_POLICIES
];

export interface SecurityContextDto {
  callerPid: number;
  callerSid?: string;
  isElevated: boolean;
  requiresAdmin: boolean;
}

export interface IpcEnvelope<T = unknown> {
  id: string;
  version: string;
  timestamp: string;
  type: "query" | "command" | "response" | "event";
  action: string;
  payload?: T;
  securityContext?: SecurityContextDto;
}

export interface IpcResponse<T = unknown> {
  id: string;
  replyToId: string;
  success: boolean;
  error?: string;
  errorCode?: string;
  data?: T;
}

export interface WindowsInfoDto {
  caption: string;
  version: string;
  buildNumber: string;
  architecture: string;
  edition?: string;
  displayVersion?: string;
  ubr?: number;
  is64Bit?: boolean;
  tpmPresent?: boolean;
  tpmVersion?: string | null;
  secureBootEnabled?: boolean;
}

export interface DetectedAppDto {
  id: string;
  name: string;
  path: string;
  detected: boolean;
  allowed: boolean;
}

export interface InstalledAppDto {
  displayName: string;
  displayVersion: string;
  publisher: string;
  installLocation?: string | null;
  isAppx?: boolean;
}

export type AccountPrivilegeClassification = "Unknown" | "StandardUser" | "Administrator";

export interface LocalUserDto {
  name: string;
  enabled: boolean;
  isAdmin: boolean;
  privilegeClassification?: AccountPrivilegeClassification;
  classificationDetail?: string | null;
  sid?: string;
}

export interface DiskInfoDto {
  device: string;
  totalGb: number;
  freeGb: number;
  freePercent: number;
}

export interface MachineInventoryDto {
  computerName: string;
  scannedAt: string;
  isMock?: boolean;
  windows: WindowsInfoDto;
  detectedApps: DetectedAppDto[];
  installedApps: InstalledAppDto[];
  localUsers: LocalUserDto[];
  disks: DiskInfoDto[];
}

export interface UpdateStatusDto {
  currentVersion: string;
  installChannel: "Velopack" | "InnoSetup" | "Portable" | string;
  autoUpdateSupported: boolean;
  feedUrl: string;
  lastCheckedAt?: string | null;
  lastCheckState: "Idle" | "UpToDate" | "UpdateDownloaded" | "FeedUnavailable" | string;
  pendingVersion?: string | null;
  coexistingLegacyInstallDetected: boolean;
  channelSummary: string;
}

export interface MappedDriveDto {
  driveLetter: string;
  remotePath: string;
  persistent: boolean;
  status: string;
}

export interface LocalSmbShareDto {
  name: string;
  localPath: string;
  remark: string;
}

export interface NetworkShareEnvironmentDto {
  scannedAt: string;
  isMock: boolean;
  smb1Enabled?: boolean | null;
  mappedDrives: MappedDriveDto[];
  localShares: LocalSmbShareDto[];
}

export interface BaselineCreationResultDto {
  transactionId: string;
  timestamp: string;
  registryBaselinePath: string;
  appLockerBaselinePath: string;
  success: boolean;
  message: string;
}

export type PolicyRisk = "Low" | "Medium" | "High" | "Critical";
export type PolicyScope = "User" | "Device" | "Machine";
export type PolicyDesiredState = "NotConfigured" | "Allowed" | "Blocked";
export type PolicyState =
  | "NotConfigured"
  | "Allowed"
  | "Blocked"
  | "Applied"
  | "PendingLogoff"
  | "PendingReboot"
  | "PendingAppRestart"
  | "PendingFirstLogon"
  | "Drifted"
  | "Failed"
  | "Inconclusive"
  | "NotSupported"
  | "Reverted";

export interface PolicyItemDto {
  id: string;
  category: string;
  title: string;
  description: string;
  scope: PolicyScope;
  risk: PolicyRisk;
  currentState: PolicyState;
  desiredState: PolicyDesiredState;
  configuredState?: PolicyDesiredState;
  effectiveState?: PolicyState;
  requiresRestart: boolean;
  requiresLogoff: boolean;
  requiresAppRestart?: boolean;
  reversible: boolean;
  evidence?: string | null;
  lastVerified?: string | null;
}

export interface PolicyDefinitionDto {
  id: string;
  name: string;
  category: string;
  description: string;
  riskLevel: string;
  scope: string;
  reversible: boolean;
  requiresRestart: boolean;
  requiresLogoff: boolean;
  requiresAppRestart: boolean;
  targetProcesses: string[];
}

export interface TriStateDto {
  desiredState: string;
  configuredState: string;
  effectiveState: string;
  evidence?: string | null;
}

export interface PolicyStateSummaryDto {
  totalPolicies: number;
  appliedCount: number;
  notConfiguredCount: number;
  pendingCount: number;
  items: PolicyItemDto[];
}

// Transaction Engine DTOs (Milestone 3)
export type TransactionStatus =
  | "Pending"
  | "Applying"
  | "Verifying"
  | "Committed"
  | "RollingBack"
  | "RolledBack"
  | "Failed";

export type BaselineValueState = "Exists" | "DoesNotExist" | "KeyDoesNotExist";

export interface RegistryValueSnapshotDto {
  policyId: string;
  hive: string;
  subKey: string;
  valueName: string;
  state: BaselineValueState;
  valueKind?: string | null;
  originalValue?: unknown;
}

export interface BaselineSnapshotDto {
  capturedAt: string;
  entries: RegistryValueSnapshotDto[];
}

export interface TransactionActionRecordDto {
  sequence: number;
  policyId: string;
  hive: string;
  subKey: string;
  valueName: string;
  valueKind: string;
  appliedValue?: unknown;
  appliedAt: string;
  verifiedAt?: string | null;
  status: string;
}

export interface RollbackStepDto {
  sequence: number;
  policyId: string;
  operation: "DeleteValue" | "RestoreValue";
  hive: string;
  subKey: string;
  valueName: string;
  restoreKind?: string | null;
  restoreValue?: unknown;
  executedAt?: string | null;
  verifiedAt?: string | null;
  status: string;
}

export interface TransactionDto {
  transactionId: string;
  version: string;
  createdAt: string;
  updatedAt?: string | null;
  status: TransactionStatus;
  targetUserName?: string | null;
  targetUserSid?: string | null;
  failedPolicyId?: string | null;
  failureReason?: string | null;
  baseline: BaselineSnapshotDto;
  actions: TransactionActionRecordDto[];
  rollbackPlan: RollbackStepDto[];
}

export interface PolicyApplyItemDto {
  policyId: string;
  desiredState: string;
}

export interface ApplyTransactionRequestDto {
  transactionId?: string;
  targetUserName?: string;
  targetUserSid?: string;
  policies: PolicyApplyItemDto[];
}

export interface ApplyTransactionResultDto {
  transactionId: string;
  status: TransactionStatus;
  appliedCount: number;
  failedPolicyId?: string | null;
  failureReason?: string | null;
  rolledBackCount: number;
  message: string;
  success: boolean;
}

export interface RollbackTransactionRequestDto {
  transactionId: string;
  targetUserSid?: string;
}

export interface RollbackResultDto {
  transactionId: string;
  status: TransactionStatus;
  restoredCount: number;
  message: string;
  success: boolean;
  error?: string | null;
}

export interface DesktopIpcTransport {
  readonly isRunning: boolean;
  readonly mode: string;
  handleRequest<T = unknown>(envelope: IpcEnvelope): Promise<IpcResponse<T>>;
}

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

/** The credential is transient. Send it only with the create or recovery command. */
export type AdminAccountApplyPayload =
  | { plan: Extract<AdminAccountPlan, { operation: "Create" | "ProtectRecovery" }>; revision: string; password: string }
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
  entraScope?: "User" | "Machine" | null;
}

export type AdminPolicyOrigin = "WinLab" | "ExternalLocal" | "InstitutionalPossible" | "Inconclusive" | "None";

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

/** Allow removes a WinLab block when the recorded baseline supports it. Other controls may still block the action. */
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
  /** Use the existing policy.expansion_* actions for the structured plan and rollback revision. */
  expansionTarget: "chrome" | "edge" | "apps" | "usb" | null;
}

export interface AdminTargetQueryPayload {
  targetUserSid?: string;
  /** Request a read of the loaded account profile through the trusted UAC executor. */
  elevatedRead?: boolean;
}

export interface AdminPermissionsDto {
  target: AdminAccountDto | null;
  management: AdminManagementDto;
  permissions: AdminPermissionDto[];
  canWrite: boolean;
}

export interface AdminPermissionPlan {
  permissionId: string;
  intent: AdminPermissionIntent;
  targetUserSid?: string;
  transactionId?: string;
}

export interface AdminPermissionPreviewPayload extends AdminPermissionPlan {
  elevatedRead?: boolean;
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
  transactionId?: string | null;
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

/** Additional fields returned by policy.expansion_preview for the administration center. */
export interface AdminExpansionPreviewDto {
  revision: string;
  scope: "Machine";
  targetUserSid: string | null;
  before: unknown;
  after: unknown;
  detail: string;
  canApply: boolean;
  requiresAppRestart: boolean;
  requiresRestart: boolean;
  limitations: string[];
}

declare global {
  interface Window {
    chrome?: {
      webview?: {
        postMessage: (message: unknown) => void;
        addEventListener: (
          type: "message",
          listener: (event: MessageEvent) => void
        ) => void;
        removeEventListener: (
          type: "message",
          listener: (event: MessageEvent) => void
        ) => void;
      };
    };
  }
}
