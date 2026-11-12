"use client";

import { useCallback, useMemo, useState } from "react";
import { ControlCenter } from "@/desktop/ControlCenter";
import { createDesktopTransport } from "@/desktop/ipc-bridge";
import { defaultConfig } from "@/lib/default-config";
import { Config } from "@/lib/types";
import { DesktopIpcTransport, IpcResponse, IpcEnvelope, IPC_CONSTANTS } from "@/desktop/contracts";

export default function WebControlCenter() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const transport: DesktopIpcTransport = useMemo(() => createDesktopTransport(), []);

  const sendIpc = useCallback(async function sendIpc<T>(action: string, payload?: unknown): Promise<IpcResponse<T>> {
    const envelope: IpcEnvelope = {
      id: crypto.randomUUID(),
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "query",
      action,
      payload
    };
    return transport.handleRequest<T>(envelope);
  }, [transport]);

  return (
    <ControlCenter
      mode="Demo"
      native={false}
      inventory={null}
      config={config}
      setConfig={setConfig}
      scanError={null}
      isScanning={false}
      onChangeMode={() => {}}
      onRefresh={() => {}}
      onAdvanced={() => { window.location.assign("/configurador"); }}
      sendIpc={sendIpc}
    />
  );
}
