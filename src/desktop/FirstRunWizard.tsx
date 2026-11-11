"use client";

import React, { useState, useEffect } from "react";
import { Config, FirstRunState, OperatingMode, PresetId } from "@/lib/types";
import { presets, getPreset } from "@/lib/presets";
import {
  DesktopIpcTransport,
  IPC_CONSTANTS,
  IpcEnvelope,
  IpcResponse,
  LocalUserDto,
  MachineInventoryDto
} from "./contracts";
import { validateAccountsSafety } from "@/lib/validation";

export function evaluateBaselineCommitEligibility(
  isConfirmed: boolean,
  preflightStatus?: string | null,
  isCreatingBaseline: boolean = false
): { canCommit: boolean; reason?: string } {
  if (preflightStatus === "BLOCK") {
    return {
      canCommit: false,
      reason: "Preflight status is BLOCK. System changes are strictly prohibited."
    };
  }
  if (!isConfirmed) {
    return {
      canCommit: false,
      reason: "Confirmation checkbox must be checked by the operator."
    };
  }
  if (isCreatingBaseline) {
    return {
      canCommit: false,
      reason: "Baseline creation is currently in progress."
    };
  }
  return { canCommit: true };
}

export interface FirstRunWizardProps {
  transport: DesktopIpcTransport;
  isWebView2Available: boolean;
  initialMode?: OperatingMode;
  initialStep?: 1 | 2 | 3 | 4;
  initialPreflightData?: {
    computerName: string;
    status: string;
    readinessScore: number;
    summary: { pass: number; warn: number; block: number };
    readinessMessage: string;
  } | null;
  initialConfirmed?: boolean;
  onComplete: (result: {
    mode: OperatingMode;
    config: Config;
    firstRunState: FirstRunState;
  }) => void;
  onCancel?: () => void;
}

export function FirstRunWizard({
  transport,
  isWebView2Available,
  initialMode = "Demo",
  initialStep = 1,
  initialPreflightData = null,
  initialConfirmed = false,
  onComplete,
  onCancel
}: FirstRunWizardProps) {
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(initialStep);
  const [mode, setMode] = useState<OperatingMode>(initialMode);

  // Step 2 State
  const [inventory, setInventory] = useState<MachineInventoryDto | null>(null);
  const [isLoadingInventory, setIsLoadingInventory] = useState(false);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [studentUser, setStudentUser] = useState<string>("Aluno");
  const [adminUser, setAdminUser] = useState<string>("MicrolinsAdmin");
  const [createAccountIfMissing, setCreateAccountIfMissing] = useState(true);
  const [accountValidationError, setAccountValidationError] = useState<string | null>(null);

  // Step 3 State
  const [selectedPresetId, setSelectedPresetId] = useState<PresetId>("microlins_intermediario");
  const [selectedConfig, setSelectedConfig] = useState<Config>(() => getPreset("microlins_intermediario"));

  // Step 4 State
  const [preflightData, setPreflightData] = useState<{
    computerName: string;
    status: string;
    readinessScore: number;
    summary: { pass: number; warn: number; block: number };
    readinessMessage: string;
  } | null>(initialPreflightData);
  const [isLoadingPreflight, setIsLoadingPreflight] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(initialConfirmed);
  const [isCreatingBaseline, setIsCreatingBaseline] = useState(false);
  const [baselineResult, setBaselineResult] = useState<string | null>(null);

  // Helper IPC dispatch
  async function sendIpc<T>(action: string, payload?: unknown): Promise<IpcResponse<T>> {
    const envelope: IpcEnvelope = {
      id: crypto.randomUUID(),
      version: IPC_CONSTANTS.PROTOCOL_VERSION,
      timestamp: new Date().toISOString(),
      type: "query",
      action,
      payload
    };
    return (await transport.handleRequest<T>(envelope)) as IpcResponse<T>;
  }

  // Fetch inventory when transitioning to Step 2
  useEffect(() => {
    if (currentStep === 2) {
      setIsLoadingInventory(true);
      setInventoryError(null);
      sendIpc<MachineInventoryDto>(IPC_CONSTANTS.ACTION_QUERY_INVENTORY)
        .then((res) => {
          if (res.success && res.data) {
            setInventory(res.data);
            // Pre-select accounts if found
            const users = res.data.localUsers || [];
            const standardUser = users.find((u) => !u.isAdmin && u.name.toLowerCase() === "aluno") || users.find((u) => !u.isAdmin);
            const admin = users.find((u) => u.isAdmin);
            if (standardUser) setStudentUser(standardUser.name);
            if (admin) setAdminUser(admin.name);
          } else {
            setInventoryError(res.error || "Não foi possível escanear o inventário da máquina.");
          }
        })
        .catch((err) => {
          setInventoryError((err as Error).message);
        })
        .finally(() => {
          setIsLoadingInventory(false);
        });
    }
  }, [currentStep, mode]);

  // Fetch preflight when transitioning to Step 4
  useEffect(() => {
    if (currentStep === 4 && !preflightData) {
      setIsLoadingPreflight(true);
      setPreflightError(null);
      sendIpc<{
        computerName: string;
        status: string;
        readinessScore: number;
        summary: { pass: number; warn: number; block: number };
        readinessMessage: string;
      }>(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT)
        .then((res) => {
          if (res.success && res.data) {
            setPreflightData(res.data);
          } else {
            setPreflightError(res.error || "Falha ao consultar verificações de diagnóstico pré-voo.");
          }
        })
        .catch((err) => {
          setPreflightError((err as Error).message);
        })
        .finally(() => {
          setIsLoadingPreflight(false);
        });
    }
  }, [currentStep]);

  // Validation function for Step 2
  function validateStep2(): boolean {
    setAccountValidationError(null);

    // Common syntax and non-equality check
    const basicCheck = validateAccountsSafety(studentUser, adminUser);
    if (!basicCheck.isValid) {
      setAccountValidationError(basicCheck.error || "Erro na validação de contas.");
      return false;
    }

    // Check Administrator Immunity Rule against scanned inventory
    if (inventory && inventory.localUsers) {
      const selectedStudentObj = inventory.localUsers.find(
        (u) => u.name.localeCompare(studentUser.trim(), undefined, { sensitivity: "accent" }) === 0
      );
      if (selectedStudentObj && selectedStudentObj.isAdmin) {
        setAccountValidationError(
          "A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador."
        );
        return false;
      }
    }

    return true;
  }

  // Handle Preset Selection in Step 3
  function handleSelectPreset(presetId: PresetId) {
    setSelectedPresetId(presetId);
    const pConfig = getPreset(presetId);
    setSelectedConfig({
      ...pConfig,
      studentUser: studentUser.trim(),
      adminUser: adminUser.trim(),
      createAccounts: createAccountIfMissing
    });
  }

  // Step 4 Commit
  async function handleConfirmAndInitialize() {
    const eligibility = evaluateBaselineCommitEligibility(isConfirmed, preflightData?.status, isCreatingBaseline);
    if (!eligibility.canCommit) return;
    setIsCreatingBaseline(true);
    setPreflightError(null);

    try {
      const res = await sendIpc<{
        transactionId: string;
        timestamp: string;
        success: boolean;
        message: string;
      }>(IPC_CONSTANTS.ACTION_CREATE_BASELINE, {
        studentUser,
        adminUser,
        presetId: selectedPresetId
      });

      const txId = res.data?.transactionId || crypto.randomUUID();
      const firstRunState: FirstRunState = {
        isCompleted: true,
        completedAt: new Date().toISOString(),
        configuredPresetId: selectedPresetId,
        targetStudentUser: studentUser.trim(),
        protectedAdminUser: adminUser.trim(),
        initialBaselineId: txId
      };

      setBaselineResult(res.data?.message || "Baseline inicial criado com sucesso!");

      setTimeout(() => {
        onComplete({
          mode,
          config: {
            ...selectedConfig,
            studentUser: studentUser.trim(),
            adminUser: adminUser.trim(),
            createAccounts: createAccountIfMissing
          },
          firstRunState
        });
      }, 500);
    } catch (err) {
      setPreflightError((err as Error).message);
    } finally {
      setIsCreatingBaseline(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-labelledby="wizard-title"
      style={{
        background: "var(--card-bg, #1a1e24)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "28px 24px",
        marginBottom: 24,
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
      }}
    >
      {/* Wizard Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <span
            style={{
              background: "var(--accent)",
              color: "#111",
              fontSize: 10,
              fontWeight: 900,
              padding: "2px 8px",
              borderRadius: 4,
              letterSpacing: "0.08em"
            }}
          >
            ASSISTENTE DE CONFIGURAÇÃO INICIAL
          </span>
          <h2 id="wizard-title" style={{ margin: "8px 0 2px", fontSize: 22 }}>
            Passo {currentStep} de 4:{" "}
            {currentStep === 1 && "Detecção de Ambiente e Modo"}
            {currentStep === 2 && "Descoberta de Contas e Sistema"}
            {currentStep === 3 && "Seleção de Perfil Pedagógico Microlins"}
            {currentStep === 4 && "Verificação Pré-voo e Baseline Inicial"}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
            Configure com segurança a estação de trabalho antes de ativar qualquer política restritiva.
          </p>
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="secondary"
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            Pular Assistente
          </button>
        )}
      </div>

      {/* Step Indicators */}
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: step <= currentStep ? "var(--accent)" : "rgba(255,255,255,0.1)",
              transition: "background 0.3s ease"
            }}
          />
        ))}
      </div>

      {/* STEP 1: Detecção de Ambiente */}
      {currentStep === 1 && (
        <div>
          <p style={{ fontSize: 14, color: "var(--foreground)", marginBottom: 16 }}>
            Selecione como deseja executar o WinLab nesta sessão:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
            {/* Tile A: Modo Demonstração */}
            <div
              onClick={() => setMode("Demo")}
              style={{
                border: mode === "Demo" ? "2px solid var(--accent)" : "1px solid var(--border)",
                background: mode === "Demo" ? "rgba(255, 122, 24, 0.08)" : "transparent",
                borderRadius: 10,
                padding: 16,
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <strong style={{ fontSize: 15 }}>Modo Demonstração</strong>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: "rgba(255, 122, 24, 0.2)",
                    color: "var(--accent)"
                  }}
                >
                  AMBIENTE SEGURO (MOCK)
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                Execução em ambiente isolado utilizando dados fictícios (<code style={{ fontSize: 11 }}>LAB-MICROLINS-01</code>).
                Permite testar todas as funcionalidades e simular políticas sem alterar o computador real.
              </p>
            </div>

            {/* Tile B: Computador Físico Real */}
            <div
              onClick={() => {
                if (isWebView2Available) setMode("Real");
              }}
              style={{
                border: mode === "Real" ? "2px solid var(--success)" : "1px solid var(--border)",
                background: mode === "Real" ? "rgba(46, 204, 113, 0.08)" : "transparent",
                borderRadius: 10,
                padding: 16,
                cursor: isWebView2Available ? "pointer" : "not-allowed",
                opacity: isWebView2Available ? 1 : 0.6,
                transition: "all 0.2s ease"
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <strong style={{ fontSize: 15 }}>Computador Físico / Modo Real</strong>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: isWebView2Available ? "rgba(46, 204, 113, 0.2)" : "rgba(255,255,255,0.1)",
                    color: isWebView2Available ? "var(--success)" : "var(--muted)"
                  }}
                >
                  {isWebView2Available ? "MÁQUINA LOCAL (WINDOWS)" : "INDISPONÍVEL NA WEB"}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                Conecta ao host nativo C# do Windows para ler hardware, discos, contas locais e inventário real desta estação.
              </p>
              {!isWebView2Available && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--accent)" }}>
                  ⚠️ Requer o aplicativo WinLab Desktop (WPF/WebView2) instalado localmente no Windows.
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="primary"
              style={{ fontSize: 14, padding: "8px 20px" }}
            >
              Avançar para Descoberta de Contas →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: Descoberta de Contas e Sistema */}
      {currentStep === 2 && (
        <div>
          {isLoadingInventory ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              ⏳ Escaneando contas de usuário e componentes do sistema...
            </div>
          ) : inventoryError ? (
            <div style={{ padding: 14, background: "rgba(231,76,60,0.15)", border: "1px solid #e74c3c", borderRadius: 8, marginBottom: 16 }}>
              <strong style={{ color: "#e74c3c", fontSize: 13 }}>Falha no scanner:</strong>
              <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: 6 }}>{inventoryError}</span>
            </div>
          ) : (
            <div>
              {/* Host Specs */}
              {inventory && (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", background: "rgba(255,255,255,0.03)", padding: 12, borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ fontSize: 12 }}><strong>Computador:</strong> {inventory.computerName}</div>
                  <div style={{ fontSize: 12 }}><strong>Sistema:</strong> {inventory.windows.caption} ({inventory.windows.architecture})</div>
                  <div style={{ fontSize: 12 }}><strong>Build:</strong> {inventory.windows.buildNumber}</div>
                  <div style={{ fontSize: 12 }}><strong>Contas Detectadas:</strong> {inventory.localUsers.length}</div>
                </div>
              )}

              {/* Scanned Accounts Table */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                  Contas de Usuário Locais Encontradas:
                </label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                  {inventory?.localUsers.map((user) => (
                    <div
                      key={user.name}
                      style={{
                        padding: "8px 12px",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: user.name === studentUser ? 700 : 400 }}>
                        {user.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: user.isAdmin ? "rgba(46, 204, 113, 0.2)" : "rgba(255,255,255,0.1)",
                          color: user.isAdmin ? "var(--success)" : "var(--muted)"
                        }}
                      >
                        {user.isAdmin ? "🛡️ Administrador" : "Padrão"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Account Selection Inputs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, marginBottom: 16 }}>
                <div>
                  <label htmlFor="student-account-input" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                    Conta do Aluno / Usuário Restrito:
                  </label>
                  <input
                    id="student-account-input"
                    type="text"
                    value={studentUser}
                    onChange={(e) => setStudentUser(e.target.value)}
                    placeholder="ex: Aluno"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", color: "#fff" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--muted)", display: "block", marginTop: 4 }}>
                    Esta conta receberá as políticas de restrição do perfil pedagógico selecionado.
                  </span>
                </div>

                <div>
                  <label htmlFor="admin-account-input" style={{ display: "block", fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                    Conta Administrativa Protegida:
                  </label>
                  <input
                    id="admin-account-input"
                    type="text"
                    value={adminUser}
                    onChange={(e) => setAdminUser(e.target.value)}
                    placeholder="ex: MicrolinsAdmin"
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "rgba(0,0,0,0.2)", color: "#fff" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--muted)", display: "block", marginTop: 4 }}>
                    Esta conta NUNCA será restrita e mantém controle total da máquina.
                  </span>
                </div>
              </div>

              {/* Assisted creation checkbox */}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 16, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={createAccountIfMissing}
                  onChange={(e) => setCreateAccountIfMissing(e.target.checked)}
                />
                Criar a conta de usuário padrão &apos;{studentUser || "Aluno"}&apos; caso ela ainda não exista nesta máquina
              </label>

              {/* Validation Error Alert */}
              {accountValidationError && (
                <div role="alert" style={{ padding: 12, background: "rgba(231,76,60,0.15)", border: "1px solid #e74c3c", borderRadius: 8, marginBottom: 16 }}>
                  <strong style={{ color: "#e74c3c", fontSize: 13 }}>Bloqueio de Segurança:</strong>
                  <span style={{ fontSize: 13, color: "#fff", display: "block", marginTop: 2 }}>{accountValidationError}</span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="secondary"
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={() => {
                if (validateStep2()) setCurrentStep(3);
              }}
              className="primary"
              style={{ fontSize: 14, padding: "8px 20px" }}
            >
              Avançar para Perfis Pedagógicos →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Seleção de Perfil Pedagógico */}
      {currentStep === 3 && (
        <div>
          <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
            Selecione o perfil pedagógico Microlins alinhado à grade de cursos ministrada nesta estação:
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14, marginBottom: 20 }}>
            {presets
              .filter((p) => p.id.startsWith("microlins"))
              .map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset.id)}
                    style={{
                      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                      background: isSelected ? "rgba(255, 122, 24, 0.08)" : "transparent",
                      borderRadius: 10,
                      padding: 14,
                      cursor: "pointer",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <strong style={{ fontSize: 14 }}>{preset.name}</strong>
                      {isSelected && <span style={{ color: "var(--accent)", fontSize: 16 }}>✓</span>}
                    </div>
                    <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 10px", lineHeight: 1.4 }}>
                      {preset.description}
                    </p>
                    <div style={{ fontSize: 11, color: "var(--foreground)" }}>
                      <strong>Apps permitidos:</strong> {preset.config.allowedApps.join(", ") || "Nenhum"}
                    </div>
                  </div>
                );
              })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="secondary"
              style={{ fontSize: 13, padding: "8px 16px" }}
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={() => setCurrentStep(4)}
              className="primary"
              style={{ fontSize: 14, padding: "8px 20px" }}
            >
              Avançar para Verificação Pré-voo →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Verificação Pré-voo e Baseline Inicial */}
      {currentStep === 4 && (
        <div>
          {isLoadingPreflight ? (
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              ⏳ Executando verificações de diagnóstico pré-voo...
            </div>
          ) : (
            <div>
              {/* Preflight Summary Badge */}
              {preflightData && (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 8,
                    marginBottom: 16,
                    background:
                      preflightData.status === "BLOCK"
                        ? "rgba(231,76,60,0.15)"
                        : preflightData.status === "WARN"
                        ? "rgba(255,122,24,0.15)"
                        : "rgba(46,204,113,0.15)",
                    border: `1px solid ${
                      preflightData.status === "BLOCK"
                        ? "#e74c3c"
                        : preflightData.status === "WARN"
                        ? "var(--accent)"
                        : "var(--success)"
                    }`
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <strong style={{ fontSize: 14 }}>
                      Diagnóstico Pré-voo: Status {preflightData.status} (Nota: {preflightData.readinessScore}/100)
                    </strong>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
                      Pass: {preflightData.summary.pass} | Warn: {preflightData.summary.warn} | Block: {preflightData.summary.block}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, color: "var(--foreground)" }}>
                    {preflightData.readinessMessage}
                  </span>
                </div>
              )}

              {preflightError && (
                <div style={{ padding: 12, background: "rgba(231,76,60,0.15)", border: "1px solid #e74c3c", borderRadius: 8, marginBottom: 16 }}>
                  <span style={{ color: "#e74c3c", fontSize: 13 }}>{preflightError}</span>
                </div>
              )}

              {/* Baseline Snapshot Plan Disclosure */}
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 14, borderRadius: 8, marginBottom: 16 }}>
                <strong style={{ fontSize: 13, display: "block", marginBottom: 6 }}>Plano de Captura de Baseline Inicial:</strong>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: "var(--muted)", lineHeight: 1.6 }}>
                  <li>Registro do Windows: Snapshot seguro gravado em <code style={{ fontSize: 11 }}>C:\ProgramData\WinLab\Backups\Registry-Baseline-*</code></li>
                  <li>Políticas AppLocker: Exportação do estado pré-existente via XML</li>
                  <li>Identificador exclusivo de transação UUID v4 registrado no estado do WinLab</li>
                </ul>
              </div>

              {/* Confirmation Checkbox */}
              <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 20, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={isConfirmed}
                  onChange={(e) => setIsConfirmed(e.target.checked)}
                  disabled={preflightData?.status === "BLOCK"}
                />
                <span>
                  Confirmo que revisei as contas de usuário (Aluno: <strong>{studentUser}</strong>, Admin: <strong>{adminUser}</strong>) e o perfil pedagógico (<strong>{selectedPresetId}</strong>) para esta estação de trabalho.
                </span>
              </label>

              {baselineResult && (
                <div style={{ padding: 12, background: "rgba(46,204,113,0.15)", border: "1px solid var(--success)", borderRadius: 8, marginBottom: 16, color: "var(--success)", fontSize: 13 }}>
                  ✓ {baselineResult}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20 }}>
            <button
              type="button"
              onClick={() => setCurrentStep(3)}
              className="secondary"
              style={{ fontSize: 13, padding: "8px 16px" }}
              disabled={isCreatingBaseline}
            >
              ← Voltar
            </button>
            <button
              type="button"
              onClick={handleConfirmAndInitialize}
              disabled={!evaluateBaselineCommitEligibility(isConfirmed, preflightData?.status, isCreatingBaseline).canCommit}
              className="primary"
              style={{
                fontSize: 14,
                padding: "8px 24px",
                background: "var(--success)",
                borderColor: "var(--success)",
                color: "#111",
                fontWeight: 700,
                cursor: !evaluateBaselineCommitEligibility(isConfirmed, preflightData?.status, isCreatingBaseline).canCommit ? "not-allowed" : "pointer",
                opacity: !evaluateBaselineCommitEligibility(isConfirmed, preflightData?.status, isCreatingBaseline).canCommit ? 0.6 : 1
              }}
            >
              {isCreatingBaseline ? "Gravando Baseline..." : "Confirmar e Inicializar Baseline"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
