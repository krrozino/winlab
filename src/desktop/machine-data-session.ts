import { IPC_CONSTANTS, IpcResponse, MachineInventoryDto, PolicyStateSummaryDto } from "./contracts";
import { OperatingMode } from "../lib/types";

export interface PreflightSnapshotWithMessage {
  computerName: string;
  status: string;
  readinessScore: number;
  summary: { pass: number; warn: number; block: number };
  readinessMessage: string;
}

export interface MachineDataSessionCallbacks {
  onModeChange(mode: OperatingMode): void;
  onInventory(inventory: MachineInventoryDto | null): void;
  onPolicySummary(summary: PolicyStateSummaryDto | null): void;
  onPreflight(preflight: PreflightSnapshotWithMessage | null): void;
  onScanError(error: string | null): void;
  onScanning(scanning: boolean): void;
}

export type IpcSender = <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;

export class MachineDataSession {
  private generation = 0;
  private disposed = false;

  constructor(private readonly send: IpcSender, private readonly callbacks: MachineDataSessionCallbacks) {}

  private isCurrent(generation: number): boolean {
    return !this.disposed && generation === this.generation;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
  }

  async loadInitial(): Promise<void> {
    await this.queryMachineData(this.generation);
  }

  async switchMode(targetMode: OperatingMode): Promise<void> {
    const generation = ++this.generation;
    const callbacks = this.callbacks;

    callbacks.onInventory(null);
    callbacks.onPolicySummary(null);
    callbacks.onPreflight(null);
    callbacks.onScanError(null);
    callbacks.onModeChange(targetMode);
    callbacks.onScanning(true);

    try {
      const setRes = await this.send<{ mode?: string }>(IPC_CONSTANTS.ACTION_SET_MODE, { mode: targetMode });
      if (!this.isCurrent(generation)) return;

      if (!setRes.success || typeof setRes.data?.mode !== "string" || setRes.data.mode.toLowerCase() !== targetMode.toLowerCase()) {
        callbacks.onScanError(setRes.error || `Falha ao alternar para o modo ${targetMode === "Real" ? "Computador Real" : "Demonstração"}.`);
        return;
      }

      await this.queryMachineData(generation);
    } catch (err) {
      if (this.isCurrent(generation)) {
        callbacks.onScanError((err as Error).message);
      }
    } finally {
      if (this.isCurrent(generation)) {
        callbacks.onScanning(false);
      }
    }
  }

  private async queryMachineData(generation: number): Promise<void> {
    const callbacks = this.callbacks;

    const invRes = await this.send<MachineInventoryDto>(IPC_CONSTANTS.ACTION_QUERY_INVENTORY);
    if (!this.isCurrent(generation)) return;
    if (invRes.success && invRes.data) {
      callbacks.onInventory(invRes.data);
    } else {
      callbacks.onScanError(invRes.error || "Falha ao consultar o inventário do computador.");
    }

    const polRes = await this.send<PolicyStateSummaryDto>(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE);
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
