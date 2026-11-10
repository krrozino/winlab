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
}

export interface LocalUserDto {
  name: string;
  enabled: boolean;
  isAdmin: boolean;
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
  windows: WindowsInfoDto;
  detectedApps: DetectedAppDto[];
  installedApps: InstalledAppDto[];
  localUsers: LocalUserDto[];
  disks: DiskInfoDto[];
}

export type PolicyRisk = "Low" | "Medium" | "High" | "Critical";
export type PolicyScope = "User" | "Device";
export type PolicyState =
  | "NotConfigured"
  | "Applied"
  | "PendingLogoff"
  | "PendingReboot"
  | "Failed"
  | "Reverted";

export interface PolicyItemDto {
  id: string;
  category: string;
  title: string;
  description: string;
  scope: PolicyScope;
  risk: PolicyRisk;
  currentState: PolicyState;
  desiredState: PolicyState;
  requiresRestart: boolean;
  requiresLogoff: boolean;
  reversible: boolean;
}

export interface PolicyStateSummaryDto {
  totalPolicies: number;
  appliedCount: number;
  notConfiguredCount: number;
  pendingCount: number;
  items: PolicyItemDto[];
}
