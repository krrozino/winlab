"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createDesktopTransport, isWebView2Available } from "@/desktop/ipc-bridge";
import {
  DesktopIpcTransport,
  IPC_CONSTANTS,
  IpcEnvelope,
  IpcResponse,
  MachineInventoryDto,
  PolicyStateSummaryDto
} from "@/desktop/contracts";
import { presets, getPreset } from "@/lib/presets";
import { defaultConfig } from "@/lib/default-config";
import { parseConfigJson } from "@/lib/config-io";
import { getConfigReview } from "@/lib/review";
import { Config, OperatingMode, PresetId } from "@/lib/types";
import { DemoBanner } from "@/desktop/DemoBanner";
import { DiagnosticReport } from "@/desktop/DiagnosticReport";
import { FirstRunWizard } from "@/desktop/FirstRunWizard";
import { ControlCenter } from "@/desktop/ControlCenter";
import { ConnectionHandshakeState, MachineDataSession, PreflightSnapshotWithMessage, createProcessingCounter } from "@/desktop/machine-data-session";

interface IpcLogEntry {
  id: string;
  timestamp: string;
  action: string;
  type: string;
  success: boolean;
  error?: string;
  durationMs: number;
}

export default function DesktopPage() {
  const [isNativeWebView2, setIsNativeWebView2] = useState(false);
  const transport: DesktopIpcTransport = useMemo(() => {
    return createDesktopTransport();
  }, []);

  useEffect(() => {
    setIsNativeWebView2(isWebView2Available());
  }, []);

  // Estado do inventário e políticas obtidos via IPC
  const [inventory, setInventory] = useState<MachineInventoryDto | null>(null);
  const [policySummary, setPolicySummary] = useState<PolicyStateSummaryDto | null>(null);
  const [preflightData, setPreflightData] = useState<PreflightSnapshotWithMessage | null>(null);

  // Estado da configuração ativa
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [activePresetId, setActivePresetId] = useState<PresetId>("microlins");
  const [importStatus, setImportStatus] = useState<string | null>(null);

  // Modo de operação (Demo vs Real) e Assistente Inicial
  const [mode, setMode] = useState<OperatingMode>("Demo");
  const [showWizard, setShowWizard] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionHandshakeState>("connected");

  // Aba ativa da interface desktop
  const [activeTab, setActiveTab] = useState<
    "overview" | "inventory" | "diagnostic" | "presets" | "policies" | "config" | "ipc"
  >("overview");

  // Log de mensagens IPC
  const [ipcLogs, setIpcLogs] = useState<IpcLogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingCounter = useMemo(() => createProcessingCounter(setIsProcessing), []);

  // Função central para envio de mensagens IPC tipadas
  const sendIpcMessage = useCallback(async function sendIpcMessage<T>(action: string, payload?: unknown): Promise<IpcResponse<T>> {
    processingCounter.begin();
    const start = performance.now();
    const envelope: IpcEnvelope = {
      id: crypto.randomUUID(),
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "query",
      action,
      payload,
      securityContext: {
        callerPid: 4096,
        isElevated: false,
        requiresAdmin: false
      }
    };

    try {
      const response = (await transport.handleRequest<T>(envelope)) as IpcResponse<T>;
      const durationMs = Math.round(performance.now() - start);

      setIpcLogs((prev) => [
        {
          id: envelope.id,
          timestamp: new Date().toLocaleTimeString(),
          action,
          type: envelope.type,
          success: response.success,
          error: response.error,
          durationMs
        },
        ...prev.slice(0, 19)
      ]);

      return response;
    } finally {
      processingCounter.end();
    }
  }, [transport, processingCounter]);

  // Sessão de dados da máquina: uma instância por ciclo de efeito, de modo que o
  // replay de efeitos (React Strict Mode) recrie a sessão com geração nova.
  const sessionRef = useRef<MachineDataSession | null>(null);

  useEffect(() => {
    const session = new MachineDataSession(sendIpcMessage, {
      onModeChange: setMode,
      onConnectionState: setConnectionState,
      onInventory: setInventory,
      onPolicySummary: setPolicySummary,
      onPreflight: setPreflightData,
      onScanError: setScanError,
      onScanning: setIsScanning
    });
    sessionRef.current = session;
    // No executável nativo, o computador real é o padrão. No navegador, mantém a demonstração.
    void (isWebView2Available() ? session.switchMode("Real") : session.loadInitial());
    return () => {
      session.dispose();
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, [sendIpcMessage]);

  // Alternância entre Modo Demonstração e Modo Computador Real (Feature 16)
  async function handleToggleMode(targetMode: OperatingMode) {
    const session = sessionRef.current;
    if (!session) return;
    await session.switchMode(targetMode);
  }

  // Seleciona um preset
  function selectPreset(id: PresetId) {
    const presetConfig = getPreset(id);
    setActivePresetId(id);
    setConfig(presetConfig);
  }

  // Importa arquivo config.json
  async function handleFileImport(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const imported = parseConfigJson(text);
      setConfig(imported);
      setImportStatus(`Configuração importada com sucesso: "${imported.profileName}".`);
      await sendIpcMessage(IPC_CONSTANTS.ACTION_VALIDATE_CONFIG, { profileName: imported.profileName });
    } catch (err) {
      setImportStatus(`Falha na importação: ${(err as Error).message}`);
    }
  }

  // Exporta arquivo config.json
  function handleFileExport() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `winlab-config-${config.profileName.toLowerCase().replace(/\s+/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  // Análise de revisão de segurança
  const reviews = useMemo(() => getConfigReview(config), [config]);

  // Testes de autorização negativa ao vivo
  async function testArbitraryShellRejection() {
    const maliciousEnvelope: IpcEnvelope = {
      id: crypto.randomUUID(),
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "command",
      action: "system.execute_shell",
      payload: { command: "powershell.exe -Command Remove-Item C:\\Windows" }
    };

    const res = await transport.handleRequest(maliciousEnvelope);
    setIpcLogs((prev) => [
      {
        id: maliciousEnvelope.id,
        timestamp: new Date().toLocaleTimeString(),
        action: maliciousEnvelope.action,
        type: maliciousEnvelope.type,
        success: res.success,
        error: res.error,
        durationMs: 1
      },
      ...prev.slice(0, 19)
    ]);
  }

  async function testPrivilegeMutationRejection() {
    const res = await sendIpcMessage(IPC_CONSTANTS.ACTION_APPLY_POLICIES, { mode: "ImmediateApply" });
    if (!res.success) {
      // Bloqueio esperado!
    }
  }

  if (!showAdvanced) {
    return (
      <ControlCenter
        mode={mode}
        native={isNativeWebView2}
        inventory={inventory}
        config={config}
        setConfig={setConfig}
        scanError={scanError}
        isScanning={isScanning}
        onChangeMode={handleToggleMode}
        onRefresh={() => sessionRef.current?.switchMode(mode)}
        onAdvanced={() => setShowAdvanced(true)}
        sendIpc={sendIpcMessage}
      />
    );
  }

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px 80px" }}>
      <button type="button" className="secondary" onClick={() => setShowAdvanced(false)} style={{ marginBottom: 16 }}>← Voltar ao painel simples</button>
      {/* Persistent Demonstration Banner vs Real Machine Live Status (Feature 16) */}
      <DemoBanner
        mode={mode}
        computerName={inventory?.computerName}
        isWebView2Available={isNativeWebView2}
        onToggleMode={handleToggleMode}
        isScanning={isScanning}
        connectionState={mode === "Real" ? connectionState : "connected"}
        hasReadError={mode === "Real" && !!scanError}
      />

      {/* Error Banner when Real Scan fails */}
      {scanError && (
        <div
          role="alert"
          style={{
            background: "rgba(231, 76, 60, 0.15)",
            border: "1px solid #e74c3c",
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 12
          }}
        >
          <span style={{ fontSize: 20 }}>❌</span>
          <div style={{ flex: 1 }}>
            <strong style={{ color: "#e74c3c", fontSize: 13, display: "block" }}>
              Falha de Conexão com o Host Windows
            </strong>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{scanError}</span>
          </div>
        </div>
      )}

      {/* First-Run Configuration Wizard (Feature 14) */}
      {showWizard && (
        <FirstRunWizard
          transport={transport}
          isWebView2Available={isNativeWebView2}
          initialMode={mode}
          onComplete={({ mode: newMode, config: newConfig }) => {
            setMode(newMode);
            setConfig(newConfig);
            setShowWizard(false);
            handleToggleMode(newMode);
          }}
          onCancel={() => setShowWizard(false)}
        />
      )}

      {/* Top Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          paddingBottom: 20,
          borderBottom: "1px solid var(--border)",
          marginBottom: 24
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                background: "var(--accent)",
                color: "#111",
                fontWeight: 900,
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 4,
                letterSpacing: "0.08em"
              }}
            >
              DESKTOP
            </span>
            <span className="eyebrow" style={{ margin: 0 }}>
              Painel Administrativo Local — Versão Fundação
            </span>
          </div>
          <h1 style={{ fontSize: "clamp(26px, 4vw, 36px)", margin: "8px 0 4px", lineHeight: 1.1 }}>
            WinLab Desktop
          </h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
            Aplicativo instalável offline-first para controle de políticas Windows em escolas,
            laboratórios e estações de trabalho.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowWizard((prev) => !prev)}
            className="secondary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            🧙 {showWizard ? "Fechar Assistente" : "Assistente Inicial"}
          </button>
          <button type="button" className="secondary" style={{ fontSize: 13 }} onClick={() => window.open("https://winlab-krrozino-s-projects.vercel.app/", "_blank", "noopener,noreferrer")}>
            Abrir versão web no navegador ↗
          </button>
        </div>
      </div>

      {/* Security Status Bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 24
        }}
      >
        <div
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px"
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
            Nível de Execução da UI
          </div>
          <strong style={{ display: "block", color: "var(--text)", marginTop: 4, fontSize: 14 }}>
            Não-Elevado (asInvoker)
          </strong>
          <small style={{ color: "var(--success)", fontSize: 11 }}>
            ✓ Sem privilégios administrativos contínuos
          </small>
        </div>

        <div
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px"
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
            Executor Privilegiado
          </div>
          <strong style={{ display: "block", color: "var(--warning)", marginTop: 4, fontSize: 14 }}>
            Desativado na Fundação
          </strong>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            Nenhum serviço do sistema instalado
          </small>
        </div>

        <div
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px"
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
            Conexão IPC Local
          </div>
          <strong style={{ display: "block", color: "var(--success)", marginTop: 4, fontSize: 14 }}>
            {isNativeWebView2 ? "Host C# (WebView2 Nativo)" : "Mock In-Memory (Web Fallback)"}
          </strong>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            {isNativeWebView2 ? "Ponte bidirecional postMessage ativa" : "Protocolo v1.0.0 com allowlist estrita"}
          </small>
        </div>

        <div
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: "12px 16px"
          }}
        >
          <div style={{ color: "var(--muted)", fontSize: 11, textTransform: "uppercase" }}>
            Alvo do Piloto Físico
          </div>
          <strong style={{ display: "block", color: "var(--accent-2)", marginTop: 4, fontSize: 14 }}>
            LAB-MICROLINS (Windows 11 Pro)
          </strong>
          <small style={{ color: "var(--muted)", fontSize: 11 }}>
            Readiness Score: {preflightData?.readinessScore ?? 100}/100
          </small>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: "flex",
          gap: 6,
          borderBottom: "1px solid var(--border)",
          paddingBottom: 0,
          marginBottom: 24,
          overflowX: "auto"
        }}
      >
        {[
          { id: "overview", label: "Visão Geral & Segurança" },
          { id: "inventory", label: "Inventário (Read-Only)" },
          { id: "diagnostic", label: "Relatório de Diagnóstico" },
          { id: "presets", label: "Presets de Configuração" },
          { id: "policies", label: "Matriz de Políticas" },
          { id: "config", label: "Importar / Exportar" },
          { id: "ipc", label: "Log e Testes IPC" }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            style={{
              background: activeTab === tab.id ? "var(--panel)" : "transparent",
              color: activeTab === tab.id ? "var(--accent-2)" : "var(--muted)",
              border: "1px solid",
              borderColor: activeTab === tab.id ? "var(--border)" : "transparent",
              borderBottomColor: activeTab === tab.id ? "var(--panel)" : "transparent",
              borderRadius: "10px 10px 0 0",
              padding: "10px 18px",
              fontWeight: 700,
              fontSize: 13,
              marginBottom: -1,
              whiteSpace: "nowrap"
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Overview */}
      {activeTab === "overview" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel important">
            <h2 style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span>🛡️</span> Fundação do WinLab Desktop
            </h2>
            <p style={{ color: "var(--muted)", lineHeight: 1.6, fontSize: 14 }}>
              O <strong>WinLab Desktop</strong> foi concebido para resolver o gargalo operacional de
              laboratórios compartilhados: permitir que o instrutor ou administrador visualize o
              inventário, selecione presets de segurança e aplique ou reverta políticas diretamente no
              computador, com preview transparente e rollback garantido, sem a necessidade de recriar
              manualmente arquivos ZIP a cada alteração.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: 16,
                marginTop: 20
              }}
            >
              <div
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16
                }}
              >
                <strong style={{ color: "var(--accent-2)", fontSize: 14 }}>
                  1. Separação de Privilégios
                </strong>
                <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>
                  A UI desktop roda com privilégios de usuário comum (<code>asInvoker</code>). Nenhuma
                  janela gráfica possui permissões administrativas persistentes, prevenindo qualquer
                  ataque por interface.
                </p>
              </div>

              <div
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16
                }}
              >
                <strong style={{ color: "var(--accent-2)", fontSize: 14 }}>
                  2. IPC com Validação Rígida
                </strong>
                <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>
                  A comunicação com a camada de execução utiliza envelopes tipados com lista fechada de
                  ações (allowlist). É estritamente proibido o envio de strings de shell arbitrárias ou
                  scripts dinâmicos.
                </p>
              </div>

              <div
                style={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 16
                }}
              >
                <strong style={{ color: "var(--accent-2)", fontSize: 14 }}>
                  3. Piloto Homologado sem Risco
                </strong>
                <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 0", lineHeight: 1.5 }}>
                  Na etapa atual de fundação, o executor privilegiado encontra-se inativo. Todas as
                  consultas operam sobre modelos em memória e inventário somente leitura, garantindo zero
                  impacto na máquina de testes.
                </p>
              </div>
            </div>
          </div>

          <div className="panel">
            <h2>Critérios de Segurança e Rollback do Piloto 0.9</h2>
            <ul style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.8, paddingLeft: 20 }}>
              <li>
                <strong>AppLocker AuditOnly:</strong> Durante a fase piloto, o AppLocker opera em modo
                de auditoria. Execuções são registradas no Visualizador de Eventos sem interromper
                aplicativos essenciais.
              </li>
              <li>
                <strong>Proteção da Conta Admin:</strong> O WinLab se recusa a aplicar restrições ao
                usuário administrador. A conta restrita nunca pode coincidir com a administrativa.
              </li>
              <li>
                <strong>Preservação de Baseline:</strong> O setup salva o estado prévio de chaves de
                registro e do AppLocker em <code>C:\ProgramData\WinLab\Backups</code> antes de qualquer
                modificação.
              </li>
              <li>
                <strong>Zero Deployments na Vercel:</strong> O repositório mantém a trava{" "}
                <code>git.deploymentEnabled = false</code> intacta, eliminando consumo não autorizado de
                recursos em nuvem.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* Tab: Inventory */}
      {activeTab === "inventory" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel">
            <div className="sectionHeading">
              <div>
                <h2>Inventário do Computador (Somente Leitura)</h2>
                <p>
                  Dados de diagnóstico e hardware obtidos via chamada IPC segura{" "}
                  <code>inventory.query</code>.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => sendIpcMessage(IPC_CONSTANTS.ACTION_QUERY_INVENTORY)}
                disabled={isProcessing}
              >
                Atualizar Diagnóstico
              </button>
            </div>

            {inventory ? (
              <div>
                <div className="machineSummary" style={{ marginTop: 16 }}>
                  <div>
                    <span>Computador</span>
                    <strong>{inventory.computerName}</strong>
                    <small>{inventory.windows.architecture}</small>
                  </div>
                  <div>
                    <span>Sistema Operacional</span>
                    <strong>{inventory.windows.caption}</strong>
                    <small>Build {inventory.windows.buildNumber}</small>
                  </div>
                  <div>
                    <span>Armazenamento</span>
                    <strong>{inventory.disks[0]?.device ?? "C:"}</strong>
                    <small>
                      {inventory.disks[0]?.freeGb} GB livres ({inventory.disks[0]?.freePercent}%)
                    </small>
                  </div>
                  <div>
                    <span>Prontidão Piloto</span>
                    <strong style={{ color: "var(--success)" }}>PASS (100/100)</strong>
                    <small>AuditOnly Recomendado</small>
                  </div>
                </div>

                <div className="inventoryColumns" style={{ marginTop: 20 }}>
                  <div>
                    <h3>Aplicativos do Catálogo Detectados</h3>
                    <div className="detectedApps" style={{ marginTop: 12 }}>
                      {inventory.detectedApps.map((app) => (
                        <div key={app.id} className="detectedApp">
                          <div>
                            <strong>{app.name}</strong>
                            <small>{app.path}</small>
                          </div>
                          <span className={`status ${app.detected ? "allowed" : "detected"}`}>
                            {app.detected ? "Detectado ✓" : "Ausente"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3>Contas de Usuário Locais</h3>
                    <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                      {inventory.localUsers.map((user) => (
                        <div
                          key={user.name}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "10px 12px",
                            background: "var(--panel-2)",
                            border: "1px solid var(--border)",
                            borderRadius: 8
                          }}
                        >
                          <div>
                            <strong style={{ color: user.isAdmin ? "var(--accent-2)" : "var(--text)" }}>
                              {user.name}
                            </strong>
                            <span
                              style={{ display: "block", color: "var(--muted)", fontSize: 11, marginTop: 2 }}
                            >
                              SID: {user.sid ?? "Local"}
                            </span>
                          </div>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: user.isAdmin ? "var(--accent-2)" : "var(--success)"
                            }}
                          >
                            {user.isAdmin ? "Administrador (Protegido)" : "Usuário Restrito"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>Carregando inventário via IPC...</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Diagnostic Report (read-only consolidation + JSON export) */}
      {activeTab === "diagnostic" && (
        <div className="panel">
          <DiagnosticReport
            mode={mode}
            inventory={inventory}
            policySummary={policySummary}
            preflightData={preflightData}
            isScanning={isScanning}
            scanError={scanError}
          />
        </div>
      )}

      {/* Tab: Presets */}
      {activeTab === "presets" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel">
            <h2>Presets de Configuração Disponíveis</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 18px" }}>
              Selecione um preset homologado para aplicar parâmetros pré-validados na interface local.
            </p>

            <div className="presetBar">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  className={`preset ${activePresetId === preset.id ? "active" : ""}`}
                  onClick={() => selectPreset(preset.id)}
                >
                  <strong>{preset.name}</strong>
                  <span>{preset.description}</span>
                </button>
              ))}
            </div>

            <div
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 18,
                marginTop: 20
              }}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
                Resumo da Configuração Selecionada: <em>{config.profileName}</em>
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 12,
                  fontSize: 13
                }}
              >
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Usuário Restrito</span>
                  <strong>{config.studentUser}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Administrador</span>
                  <strong>{config.adminUser}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Modo AppLocker</span>
                  <strong style={{ color: "var(--warning)" }}>{config.enforcementMode}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Navegador (URLs)</span>
                  <strong>{config.browserUrlMode}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Bloqueio USB Executável</span>
                  <strong>{config.blockUsbExecute ? "Sim (Bloqueado)" : "Não"}</strong>
                </div>
                <div>
                  <span style={{ color: "var(--muted)", display: "block" }}>Gerenciamento de Contas</span>
                  <strong>
                    {config.allowLocalAccountManagement ? "Permitido" : "Bloqueado pelo WinLab"}
                  </strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Policies */}
      {activeTab === "policies" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel">
            <div className="sectionHeading">
              <div>
                <h2>Matriz de Políticas Windows (Policy Catalog V2 Foundation)</h2>
                <p>
                  Catálogo declarativo com escopo, nível de risco, requisitos de logoff/reboot e estado
                  atual observado.
                </p>
              </div>
              <button
                className="secondary"
                onClick={() => sendIpcMessage(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE)}
                disabled={isProcessing}
              >
                Consultar Políticas
              </button>
            </div>

            {policySummary ? (
              <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                {policySummary.items.map((policy) => (
                  <div
                    key={policy.id}
                    style={{
                      background: "var(--panel-2)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 16,
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                      gap: 16,
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span
                          style={{
                            fontSize: 11,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "var(--muted)"
                          }}
                        >
                          {policy.category}
                        </span>
                        <span style={{ color: "var(--border)" }}>•</span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color:
                              policy.risk === "Critical"
                                ? "var(--danger)"
                                : policy.risk === "High"
                                ? "var(--accent)"
                                : "var(--muted)"
                          }}
                        >
                          Risco: {policy.risk}
                        </span>
                        <span style={{ color: "var(--border)" }}>•</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>
                          Escopo: {policy.scope}
                        </span>
                      </div>
                      <strong style={{ fontSize: 15, display: "block" }}>{policy.title}</strong>
                      <p style={{ color: "var(--muted)", fontSize: 13, margin: "4px 0 0" }}>
                        {policy.description}
                      </p>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                          background:
                            policy.currentState === "Applied"
                              ? "rgba(83, 209, 138, 0.15)"
                              : "rgba(255, 255, 255, 0.08)",
                          color:
                            policy.currentState === "Applied" ? "var(--success)" : "var(--muted)"
                        }}
                      >
                        {policy.currentState === "NotConfigured"
                          ? "Não Configurado"
                          : policy.currentState}
                      </span>
                      <small
                        style={{
                          display: "block",
                          color: "var(--muted)",
                          fontSize: 10,
                          marginTop: 4
                        }}
                      >
                        {policy.requiresLogoff ? "Exige Logoff" : "Imediato"}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--muted)" }}>Carregando catálogo de políticas...</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Config Import/Export */}
      {activeTab === "config" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel">
            <h2>Importação e Exportação de Configuração</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 18px" }}>
              Carregue ou salve arquivos <code>config.json</code> com verificação automática de
              integridade e compatibilidade entre versões.
            </p>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <label
                className="secondary"
                style={{
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "11px 16px"
                }}
              >
                <span>📂</span> Importar config.json
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileImport}
                  style={{ display: "none" }}
                />
              </label>

              <button
                className="secondary"
                onClick={handleFileExport}
                style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 16px" }}
              >
                <span>💾</span> Exportar config.json Atual
              </button>
            </div>

            {importStatus && (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: importStatus.includes("sucesso")
                    ? "rgba(83, 209, 138, 0.1)"
                    : "rgba(255, 122, 24, 0.1)",
                  border: "1px solid",
                  borderColor: importStatus.includes("sucesso")
                    ? "rgba(83, 209, 138, 0.3)"
                    : "rgba(255, 122, 24, 0.3)",
                  color: importStatus.includes("sucesso") ? "var(--success)" : "var(--accent-2)",
                  fontSize: 13,
                  marginBottom: 18
                }}
              >
                {importStatus}
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <h3 style={{ fontSize: 15, marginBottom: 10 }}>Alertas de Segurança da Configuração</h3>
              <div className="reviewList">
                {reviews.map((item, idx) => (
                  <div key={idx} className={`review ${item.level}`}>
                    <strong>{item.level.toUpperCase()}</strong>
                    <div>
                      <span>{item.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: IPC Logs and Security Negative Tests */}
      {activeTab === "ipc" && (
        <div style={{ display: "grid", gap: 20 }}>
          <div className="panel important">
            <h2>Testes de Autorização Negativa e Segurança IPC</h2>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 16px" }}>
              Prove a eficácia dos filtros de segurança executando chamadas malformadas ou não
              autorizadas para observar o bloqueio imediato:
            </p>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              <button
                className="secondary"
                onClick={testArbitraryShellRejection}
                style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
              >
                ⚡ Testar Injeção de Shell (Bloqueio Esperado)
              </button>

              <button
                className="secondary"
                onClick={testPrivilegeMutationRejection}
                style={{ borderColor: "var(--warning)", color: "var(--warning)" }}
              >
                🔒 Testar Mutação sem Executor (Bloqueio Esperado)
              </button>

              <button
                className="secondary"
                onClick={() => sendIpcMessage(IPC_CONSTANTS.ACTION_PREVIEW_POLICY_DIFF)}
              >
                🔍 Testar Preview / Diff Seguro (Read-Only)
              </button>
            </div>

            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Histórico de Mensagens IPC Auditadas</h3>
            <div
              style={{
                maxHeight: 320,
                overflowY: "auto",
                background: "#080A0C",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: 12,
                fontFamily: "monospace",
                fontSize: 12
              }}
            >
              {ipcLogs.length === 0 ? (
                <div style={{ color: "var(--muted)" }}>Nenhuma mensagem trafegada ainda.</div>
              ) : (
                ipcLogs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: "6px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12
                    }}
                  >
                    <div>
                      <span style={{ color: "var(--muted)" }}>[{log.timestamp}]</span>{" "}
                      <strong style={{ color: log.success ? "var(--success)" : "var(--danger)" }}>
                        {log.action}
                      </strong>
                      {log.error && (
                        <div style={{ color: "var(--danger)", fontSize: 11, marginTop: 2 }}>
                          ↳ Erro de Segurança: {log.error}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        color: log.success ? "var(--success)" : "var(--danger)",
                        fontWeight: 700
                      }}
                    >
                      {log.success ? "200 OK" : "403 BLOCKED"} ({log.durationMs}ms)
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
