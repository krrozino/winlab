import {
  IPC_CONSTANTS,
  ALLOWED_IPC_ACTIONS,
  IpcEnvelope,
  IpcResponse,
  MachineInventoryDto,
  PolicyStateSummaryDto,
  PolicyItemDto,
  PolicyState
} from "../../src/desktop/contracts";
import { MockDesktopAgent, validateNoArbitraryShell, validateIpcAction } from "../../src/desktop/mock-agent";
import { Config } from "../../src/lib/types";
import { defaultConfig } from "../../src/lib/default-config";
import { getConfigErrors } from "../../src/lib/validation";
import {
  generateSetupScript,
  generateRollbackScript,
  generateUnlockWallpaperScript,
  generateVerifyScript,
  generateMaintenanceScript
} from "../../src/lib/generator";
import {
  buildWinLabPackageFiles,
  sha256Text,
  verifyPackageFiles,
  PackageFile,
  PackageManifest
} from "../../src/lib/package-integrity";

/**
 * Tri-State Policy Definition according to ADR-001 & TEST_INFRA
 */
export type DesiredState = "NotConfigured" | "Allowed" | "Blocked";
export type ConfiguredState = "NotConfigured" | "Allowed" | "Blocked";
export type EffectiveState =
  | "NotConfigured"
  | "Applying"
  | "Applied"
  | "PendingRefresh"
  | "PendingLogoff"
  | "PendingReboot"
  | "PendingAppRestart"
  | "Drifted"
  | "Failed"
  | "NotSupported"
  | "Inconclusive"
  | "Reverted"
  | "TemporarilyUnlocked";

export interface TriStatePolicyRecord {
  id: string;
  name: string;
  category: string;
  desiredState: DesiredState;
  configuredState: ConfiguredState;
  effectiveState: EffectiveState;
  requiresLogoff: boolean;
  requiresRestart: boolean;
  requiresAppRestart?: string;
  registryPath?: string;
  registryValueName?: string;
  expectedDwordValue?: number;
  lastVerifiedAt?: string;
}

export interface ConsolidatedPendingActions {
  totalPending: number;
  requiresReboot: string[];
  requiresLogoff: string[];
  requiresAppRestart: { app: string; policyIds: string[] }[];
  immediateActive: string[];
  summaryMessage: string;
}

export interface BatchApplyResult {
  transactionId: string;
  success: boolean;
  appliedCount: number;
  failedPolicyId?: string;
  rollbackTriggered: boolean;
  rollbackSucceeded: boolean;
  auditLog: string[];
  finalStates: Record<string, EffectiveState>;
}

export interface DriftScanResult {
  scannedAt: string;
  totalPolicies: number;
  intactCount: number;
  driftedCount: number;
  driftedPolicies: {
    id: string;
    desired: DesiredState;
    configured: ConfiguredState;
    liveObserved: DesiredState;
    remediationAction: string;
  }[];
  intactPolicies: string[];
}

/**
 * Simulated WebView2 Host matching WPF WebView2 security model
 */
export class MockWebView2Host {
  public static readonly TRUSTED_ORIGIN = "https://winlab.local";
  public static readonly LOCALHOST_DEV_ORIGIN = "http://localhost:3000";

  public isReleaseBuild: boolean;
  public wwwrootExists: boolean;
  public areDevToolsEnabled: boolean;
  public isStatusBarEnabled: boolean;
  public isWebMessageEnabled: boolean;
  public activeVirtualHostMapping: string | null = null;
  public currentUrl: string | null = null;
  public lastFatalError: string | null = null;

  private agent: MockDesktopAgent;

  constructor(options: { isReleaseBuild?: boolean; wwwrootExists?: boolean } = {}) {
    this.isReleaseBuild = options.isReleaseBuild ?? true;
    this.wwwrootExists = options.wwwrootExists ?? true;
    this.isStatusBarEnabled = false;
    this.isWebMessageEnabled = true;
    // In Release builds, DevTools should strictly be disabled; in Debug they may be enabled
    this.areDevToolsEnabled = !this.isReleaseBuild;
    this.agent = new MockDesktopAgent();

    this.initializeNavigation();
  }

  public initializeNavigation(): void {
    if (this.wwwrootExists) {
      this.activeVirtualHostMapping = "winlab.local";
      this.currentUrl = `${MockWebView2Host.TRUSTED_ORIGIN}/desktop/index.html`;
      this.lastFatalError = null;
    } else {
      this.activeVirtualHostMapping = null;
      if (this.isReleaseBuild) {
        // Release build must NOT silently fall back to localhost:3000
        this.currentUrl = null;
        this.lastFatalError = "FATAL_MISSING_WWWROOT: Bundled offline static assets not found in release distribution.";
      } else {
        // Dev build fallback
        this.currentUrl = `${MockWebView2Host.LOCALHOST_DEV_ORIGIN}/desktop`;
        this.lastFatalError = null;
      }
    }
  }

  public async postWebMessage(
    rawMessage: string,
    callerOrigin: string
  ): Promise<{ status: "accepted" | "rejected"; response?: IpcResponse; error?: string }> {
    // 1. Origin check: strictly enforce trusted origin
    if (callerOrigin !== MockWebView2Host.TRUSTED_ORIGIN) {
      return {
        status: "rejected",
        error: `UNAUTHORIZED_ORIGIN: Origin '${callerOrigin}' is not permitted to communicate with WinLab desktop bridge.`
      };
    }

    // 2. Parse envelope
    let envelope: IpcEnvelope;
    try {
      envelope = JSON.parse(rawMessage);
    } catch {
      return {
        status: "rejected",
        error: "MALFORMED_JSON: Message payload is not valid JSON."
      };
    }

    // 3. Dispatch through security-validated agent
    const response = await this.agent.handleRequest(envelope);
    return {
      status: "accepted",
      response
    };
  }
}

/**
 * Policy Batch & State Transition Engine Simulator
 */
export class PolicyEngineSimulator {
  private initialBaselineCaptured = false;
  private baselineTransactionId: string | null = null;
  private policies: Map<string, TriStatePolicyRecord> = new Map();
  private auditLog: string[] = [];

  constructor(initialPolicies?: TriStatePolicyRecord[]) {
    if (initialPolicies) {
      for (const p of initialPolicies) {
        this.policies.set(p.id, { ...p });
      }
    }
  }

  public registerPolicy(policy: TriStatePolicyRecord): void {
    this.policies.set(policy.id, { ...policy });
  }

  public getPolicy(id: string): TriStatePolicyRecord | undefined {
    return this.policies.get(id);
  }

  public getAllPolicies(): TriStatePolicyRecord[] {
    return Array.from(this.policies.values());
  }

  public captureBaseline(transactionId: string): { transactionId: string; wasCaptured: boolean } {
    if (!this.initialBaselineCaptured) {
      this.initialBaselineCaptured = true;
      this.baselineTransactionId = transactionId;
      this.auditLog.push(`[${new Date().toISOString()}] Initial baseline captured. Transaction: ${transactionId}`);
      return { transactionId, wasCaptured: true };
    }
    // Idempotent: do NOT overwrite initial baseline
    this.auditLog.push(`[${new Date().toISOString()}] Existing baseline preserved for transaction: ${this.baselineTransactionId}`);
    return { transactionId: this.baselineTransactionId!, wasCaptured: false };
  }

  public calculatePendingActions(policyIdsToApply: string[]): ConsolidatedPendingActions {
    const rebootList: string[] = [];
    const logoffList: string[] = [];
    const appRestartMap = new Map<string, string[]>();
    const immediateList: string[] = [];

    for (const id of policyIdsToApply) {
      const p = this.policies.get(id);
      if (!p) continue;

      if (p.requiresRestart) {
        rebootList.push(p.name);
      } else if (p.requiresLogoff) {
        logoffList.push(p.name);
      } else if (p.requiresAppRestart) {
        const app = p.requiresAppRestart;
        if (!appRestartMap.has(app)) {
          appRestartMap.set(app, []);
        }
        appRestartMap.get(app)!.push(p.name);
      } else {
        immediateList.push(p.name);
      }
    }

    const appRestartList = Array.from(appRestartMap.entries()).map(([app, policyIds]) => ({
      app,
      policyIds
    }));

    const totalPending = rebootList.length + logoffList.length + appRestartList.length;
    let summaryMessage = "";
    if (rebootList.length > 0) {
      summaryMessage = `${rebootList.length} política(s) requerem reinicialização do sistema.`;
    } else if (logoffList.length > 0) {
      summaryMessage = `${logoffList.length} política(s) requerem logoff do usuário.`;
    } else if (appRestartList.length > 0) {
      summaryMessage = `${appRestartList.length} aplicativo(s) precisam ser reiniciados.`;
    } else {
      summaryMessage = "Todas as alterações foram aplicadas imediatamente.";
    }

    return {
      totalPending,
      requiresReboot: rebootList,
      requiresLogoff: logoffList,
      requiresAppRestart: appRestartList,
      immediateActive: immediateList,
      summaryMessage
    };
  }

  public applyBatch(
    policyIds: string[],
    options: { failOnPolicyId?: string } = {}
  ): BatchApplyResult {
    const transactionId = crypto.randomUUID();
    this.captureBaseline(transactionId);

    const snapshotPriorStates = new Map<string, EffectiveState>();
    for (const id of policyIds) {
      const p = this.policies.get(id);
      if (p) snapshotPriorStates.set(id, p.effectiveState);
    }

    const appliedIds: string[] = [];

    for (const id of policyIds) {
      const p = this.policies.get(id);
      if (!p) continue;

      if (options.failOnPolicyId && options.failOnPolicyId === id) {
        // Simulated failure midway
        this.auditLog.push(`[${new Date().toISOString()}] Apply failed on policy ${id}. Triggering automated rollback.`);

        // Automated failure rollback: restore all previously applied in this batch
        for (const appliedId of appliedIds) {
          const prior = snapshotPriorStates.get(appliedId) ?? "NotConfigured";
          const pol = this.policies.get(appliedId)!;
          pol.effectiveState = "Reverted";
          pol.configuredState = "NotConfigured";
        }

        p.effectiveState = "Failed";

        const finalStates: Record<string, EffectiveState> = {};
        for (const [k, v] of this.policies.entries()) {
          finalStates[k] = v.effectiveState;
        }

        return {
          transactionId,
          success: false,
          appliedCount: appliedIds.length,
          failedPolicyId: id,
          rollbackTriggered: true,
          rollbackSucceeded: true,
          auditLog: [...this.auditLog],
          finalStates
        };
      }

      // Success apply
      p.configuredState = p.desiredState;
      if (p.requiresRestart) {
        p.effectiveState = "PendingReboot";
      } else if (p.requiresLogoff) {
        p.effectiveState = "PendingLogoff";
      } else if (p.requiresAppRestart) {
        p.effectiveState = "PendingAppRestart";
      } else {
        p.effectiveState = "Applied";
      }
      p.lastVerifiedAt = new Date().toISOString();
      appliedIds.push(id);
    }

    const finalStates: Record<string, EffectiveState> = {};
    for (const [k, v] of this.policies.entries()) {
      finalStates[k] = v.effectiveState;
    }

    return {
      transactionId,
      success: true,
      appliedCount: appliedIds.length,
      rollbackTriggered: false,
      rollbackSucceeded: false,
      auditLog: [...this.auditLog],
      finalStates
    };
  }

  public detectDrift(liveOsState: Map<string, DesiredState>): DriftScanResult {
    const scannedAt = new Date().toISOString();
    const intactPolicies: string[] = [];
    const driftedPolicies: DriftScanResult["driftedPolicies"] = [];

    for (const [id, policy] of this.policies.entries()) {
      const live = liveOsState.get(id) ?? "NotConfigured";
      if (policy.configuredState === "Blocked" && live !== "Blocked") {
        policy.effectiveState = "Drifted";
        driftedPolicies.push({
          id,
          desired: policy.desiredState,
          configured: policy.configuredState,
          liveObserved: live,
          remediationAction: "Re-apply policy via UAC elevated helper"
        });
      } else if (policy.configuredState === live) {
        intactPolicies.push(id);
      }
    }

    return {
      scannedAt,
      totalPolicies: this.policies.size,
      intactCount: intactPolicies.length,
      driftedCount: driftedPolicies.length,
      driftedPolicies,
      intactPolicies
    };
  }

  public executeRollback(transactionId: string): { success: boolean; revertedPolicies: string[] } {
    const reverted: string[] = [];
    for (const [, p] of this.policies.entries()) {
      if (p.effectiveState !== "NotConfigured") {
        p.configuredState = "NotConfigured";
        p.effectiveState = "Reverted";
        reverted.push(p.id);
      }
    }
    this.auditLog.push(`[${new Date().toISOString()}] Manual rollback executed for transaction: ${transactionId}`);
    return { success: true, revertedPolicies: reverted };
  }
}
