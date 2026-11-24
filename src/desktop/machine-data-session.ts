import { IPC_CONSTANTS, IpcResponse, MachineInventoryDto, PolicyStateSummaryDto } from "./contracts";
import { OperatingMode } from "../lib/types";
import { getEligibleTargetUsers } from "./policy-state-machine";

export interface PreflightSnapshotWithMessage {
  computerName: string;
  status: string;
  readinessScore: number;
  summary: { pass: number; warn: number; block: number };
  readinessMessage: string;
}

export type ConnectionHandshakeState = "connecting" | "connected" | "failed";

export interface MachineDataSessionCallbacks {
  onModeChange(mode: OperatingMode): void;
  onConnectionState(state: ConnectionHandshakeState): void;
  onInventory(inventory: MachineInventoryDto | null): void;
  onPolicySummary(summary: PolicyStateSummaryDto | null): void;
  onPreflight(preflight: PreflightSnapshotWithMessage | null): void;
  onScanError(error: string | null): void;
  onScanning(scanning: boolean): void;
  onSelectedUserSidChange?(sid: string | null): void;
}

export type IpcSender = <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;

export class MachineDataSession {
  private generation = 0;
  private policyQueryGeneration = 0;
  private disposed = false;
  private selectedUserSid: string | null = null;

  constructor(private readonly send: IpcSender, private readonly callbacks: MachineDataSessionCallbacks) {}

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  private isCurrentPolicyQuery(generation: number, policyGen: number): boolean {
    return !this.disposed && generation === this.generation && policyGen === this.policyQueryGeneration;
  }

  getSelectedUserSid(): string | null {
    return this.selectedUserSid;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.policyQueryGeneration += 1;
  }

  async loadInitial(): Promise<void> {
    const generation = this.generation;
    try {
      await this.queryMachineData(generation);
    } catch (err) {
      if (this.isCurrent(generation)) {
        this.callbacks.onScanError((err as Error).message);
      }
    }
  }

  async switchMode(targetMode: OperatingMode): Promise<void> {
    const generation = ++this.generation;
    this.policyQueryGeneration += 1;
    const callbacks = this.callbacks;

    callbacks.onInventory(null);
    callbacks.onPolicySummary(null);
    callbacks.onPreflight(null);
    callbacks.onScanError(null);
    callbacks.onModeChange(targetMode);
    callbacks.onConnectionState("connecting");
    callbacks.onScanning(true);

    try {
      const setRes = await this.send<{ mode?: string }>(IPC_CONSTANTS.ACTION_SET_MODE, { mode: targetMode });
      if (!this.isCurrent(generation)) return;

      if (!setRes.success || typeof setRes.data?.mode !== "string" || setRes.data.mode.toLowerCase() !== targetMode.toLowerCase()) {
        callbacks.onConnectionState("failed");
        callbacks.onScanError(setRes.error || `Falha ao alternar para o modo ${targetMode === "Real" ? "Computador Real" : "Demonstração"}.`);
        return;
      }

      callbacks.onConnectionState("connected");
      await this.queryMachineData(generation);
    } catch (err) {
      if (this.isCurrent(generation)) {
        callbacks.onConnectionState("failed");
        callbacks.onScanError((err as Error).message);
      }
    } finally {
      if (this.isCurrent(generation)) {
        callbacks.onScanning(false);
      }
    }
  }

  /**
   * Consulta estados de políticas para uma conta-alvo específica com proteção contra corrida (stale responses).
   */
  async queryPoliciesForUser(
    targetUserSid: string | null,
    options?: { allowElevation?: boolean }
  ): Promise<IpcResponse<PolicyStateSummaryDto> | null> {
    const generation = this.generation;
    const policyGen = ++this.policyQueryGeneration;
    this.selectedUserSid = targetUserSid;
    this.callbacks.onSelectedUserSidChange?.(targetUserSid);

    const payload = targetUserSid
      ? {
          targetUserSid,
          ...(options?.allowElevation ? { allowElevation: true } : {})
        }
      : options?.allowElevation
        ? { allowElevation: true }
        : undefined;

    const polRes = await this.send<PolicyStateSummaryDto>(
      IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES,
      payload
    );

    if (!this.isCurrentPolicyQuery(generation, policyGen)) {
      return null;
    }

    if (polRes.success && polRes.data) {
      this.callbacks.onPolicySummary(polRes.data);
    }

    return polRes;
  }

  private async queryMachineData(generation: number): Promise<void> {
    const callbacks = this.callbacks;

    const invRes = await this.send<MachineInventoryDto>(IPC_CONSTANTS.ACTION_QUERY_INVENTORY);
    if (!this.isCurrent(generation)) return;
    if (invRes.success && invRes.data) {
      callbacks.onInventory(invRes.data);
      const eligible = getEligibleTargetUsers(invRes.data.localUsers);
      const stillValid =
        this.selectedUserSid !== null &&
        eligible.some((u) => u.sid?.toLowerCase() === this.selectedUserSid?.toLowerCase());
      if (!stillValid) {
        this.selectedUserSid = eligible[0]?.sid ?? null;
        callbacks.onSelectedUserSidChange?.(this.selectedUserSid);
      }
    } else {
      callbacks.onScanError(invRes.error || "Falha ao consultar o inventário do computador.");
    }

    const policyPayload = this.selectedUserSid ? { targetUserSid: this.selectedUserSid } : undefined;
    const polRes = await this.send<PolicyStateSummaryDto>(
      IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE,
      policyPayload
    );
    if (!this.isCurrent(generation)) return;
    if (polRes.success && polRes.data) {
      callbacks.onPolicySummary(polRes.data);
    }

    const preRes = await this.send<PreflightSnapshotWithMessage>(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT);
    if (!this.isCurrent(generation)) return;
    if (preRes.success && preRes.data) {
      callbacks.onPreflight(preRes.data);
    }
  }
}

export function createProcessingCounter(onChange: (processing: boolean) => void): { begin(): void; end(): void } {
  let pending = 0;
  return {
    begin(): void {
      pending += 1;
      onChange(true);
    },
    end(): void {
      pending = Math.max(0, pending - 1);
      if (pending === 0) {
        onChange(false);
      }
    }
  };
}
