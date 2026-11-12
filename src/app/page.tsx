"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ControlCenter } from "@/desktop/ControlCenter";
import { createDesktopTransport } from "@/desktop/ipc-bridge";
import { defaultConfig } from "@/lib/default-config";
import { parseConfigJson, serializeConfig } from "@/lib/config-io";
import { Config } from "@/lib/types";
import { DesktopIpcTransport, IpcResponse, IpcEnvelope, IPC_CONSTANTS } from "@/desktop/contracts";

export default function WebControlCenter() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("winlab:web:config:v1");
      if (saved) setConfig(parseConfigJson(saved));
    } catch { /* navegador sem armazenamento persistente */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { window.localStorage.setItem("winlab:web:config:v1", serializeConfig(config)); }
    catch { /* configuração continua utilizável em memória */ }
  }, [loaded, config]);
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
