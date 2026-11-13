"use client";

import { useState, useCallback } from "react";
import type { Config, OperatingMode } from "@/lib/types";
import type { IpcResponse, MachineInventoryDto, PolicyStateSummaryDto, PolicyItemDto, ApplyTransactionResultDto } from "@/desktop/contracts";
import { IPC_CONSTANTS } from "@/desktop/contracts";
import "./control-center.css";

/**
 * Desktop Control Center - WinLab Desktop Main Interface
 * 
 * This component provides a clean, professional interface for direct Windows administration.
 * It focuses on:
 * - Real-time Windows state consultation
 * - Policy selection and application
 * - Clear feedback on changes
 * - Restart/logoff requirements indication
 */

interface DesktopControlCenterProps {
  mode: OperatingMode;
  native: boolean;
  inventory: MachineInventoryDto | null;
  policyStates: PolicyItemDto[] | null;
  config: Config;
  setConfig: (config: Config) => void;
  scanError: string | null;
  isScanning: boolean;
  onChangeMode: (mode: OperatingMode) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onAdvanced?: () => void;
  sendIpc: <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;
}

type Section = "home" | "accounts" | "apps" | "internet" | "system" | "network" | "diagnostics";

const NAVIGATION_ITEMS = [
  { id: "home" as Section, label: "Início", icon: "🏠" },
  { id: "accounts" as Section, label: "Contas e permissões", icon: "👥" },
  { id: "apps" as Section, label: "Aplicativos", icon: "📦" },
  { id: "internet" as Section, label: "Internet e navegadores", icon: "🌐" },
  { id: "system" as Section, label: "Sistema Windows", icon: "⚙️" },
  { id: "network" as Section, label: "Rede e compartilhamento", icon: "🔗" },
  { id: "diagnostics" as Section, label: "Diagnóstico", icon: "🔍" }
];

/**
 * Policy Setting Component
 * Displays a single policy with its current state and allows toggling
 */
interface PolicySettingProps {
  policy: PolicyItemDto;
  isPending: boolean;
  onToggle: (policyId: string, enabled: boolean) => void;
}

function PolicySetting({ policy, isPending, onToggle }: PolicySettingProps) {
  const isActive = policy.currentState === "Applied" || policy.currentState === "Blocked";
  const isPendingChange = isPending;
  const requiresAction = policy.requiresLogoff || policy.requiresRestart || policy.requiresAppRestart;

  const statusText = isPendingChange ? "Pendente" : isActive ? "Ativado" : "Desativado";
  const statusClass = isPendingChange ? "pending" : isActive ? "active" : "inactive";

  const actionText = [];
  if (policy.requiresRestart) actionText.push("Reinício");
  if (policy.requiresLogoff) actionText.push("Logoff");
  if (policy.requiresAppRestart) actionText.push("Reiniciar apps");

  return (
    <div className="wl-setting" data-policy-id={policy.id}>
      <div className="wl-setting-info">
        <div className="wl-setting-header">
          <strong>{policy.title}</strong>
          <span className={`wl-status-badge ${statusClass}`}>
            {statusText}
          </span>
        </div>
        <p className="wl-setting-description">{policy.description}</p>
        {requiresAction && (
          <small className="wl-requires-action">
            {actionText.join(", ")} necessário após aplicação
          </small>
        )}
      </div>
      <div className="wl-setting-controls">
        <button
          type="button"
          role="switch"
          aria-label={`Alternar ${policy.title}`}
          aria-checked={isActive}
          className={`wl-switch ${isActive ? "selected" : ""} ${isPendingChange ? "pending" : ""}`}
          onClick={() => onToggle(policy.id, !isActive)}
          disabled={!policy.reversible}
        >
          <span />
        </button>
      </div>
    </div>
  );
}

/**
 * Section Component
 * Renders a section with policies or content
 */
interface SectionProps {
  id: Section;
  title: string;
  policies: PolicyItemDto[] | null;
  pendingPolicies: Record<string, boolean>;
  onTogglePolicy: (policyId: string, enabled: boolean) => void;
}

function Section({ id, title, policies, pendingPolicies, onTogglePolicy }: SectionProps) {
  if (id === "home") {
    return (
      <div className="wl-section-content">
        <div className="wl-welcome">
          <h2>Bem-vindo ao WinLab Desktop</h2>
          <p>Gerencie seu computador Windows de forma simples e segura.</p>
          <p>Selecione uma categoria no menu para começar.</p>
        </div>
      </div>
    );
  }

  const filteredPolicies = policies?.filter(p => p.category === title) || [];

  if (filteredPolicies.length === 0) {
    return (
      <div className="wl-section-content">
        <p className="wl-empty-state">Nenhuma política disponível nesta categoria.</p>
      </div>
    );
  }

  return (
    <div className="wl-section-content">
      <div className="wl-section-header">
        <h2>{title}</h2>
        <span className="wl-policy-count">{filteredPolicies.length} políticas</span>
      </div>
      <div className="wl-settings-list">
        {filteredPolicies.map(policy => (
          <PolicySetting
            key={policy.id}
            policy={policy}
            isPending={pendingPolicies[policy.id] !== undefined}
            onToggle={onTogglePolicy}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Main Desktop Control Center Component
 */
export function DesktopControlCenter({
  mode,
  native,
  inventory,
  policyStates,
  config,
  setConfig,
  scanError,
  isScanning,
  onChangeMode,
  onRefresh,
  sendIpc
}: DesktopControlCenterProps) {
  const [section, setSection] = useState<Section>("home");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [pendingPolicies, setPendingPolicies] = useState<Record<string, boolean>>({});

  // Check if we have real connection to Windows
  const realConnected = native && mode === "Real" && inventory?.isMock !== true && !scanError;
  
  // Get section title for display
  const sectionTitle = NAVIGATION_ITEMS.find(item => item.id === section)?.label || "Início";

  // Group policies by category for navigation
  const policiesByCategory: Record<string, PolicyItemDto[]> = {};
  if (policyStates) {
    policyStates.forEach(policy => {
      if (!policiesByCategory[policy.category]) {
        policiesByCategory[policy.category] = [];
      }
      policiesByCategory[policy.category].push(policy);
    });
  }

  // Handle policy toggle
  const handleTogglePolicy = useCallback((policyId: string, enabled: boolean) => {
    setPendingPolicies(prev => {
      const newPending = { ...prev };
      if (enabled) {
        newPending[policyId] = true;
      } else {
        delete newPending[policyId];
      }
      return newPending;
    });
  }, []);

  // Apply pending changes
  const applyPendingChanges = useCallback(async () => {
    if (!realConnected) {
      setFeedback({ error: true, message: "Conecte ao Windows real para aplicar alterações." });
      return;
    }
    
    if (Object.keys(pendingPolicies).length === 0) {
      setFeedback({ error: false, message: "Nenhuma alteração pendente para aplicar." });
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      // Build the transaction payload
      const policiesToApply = Object.entries(pendingPolicies).map(([policyId, enabled]) => ({
        policyId,
        desiredState: enabled ? "Blocked" : "NotConfigured"
      }));

      const response = await sendIpc<ApplyTransactionResultDto>(
        IPC_CONSTANTS.ACTION_APPLY_TRANSACTION,
        { policies: policiesToApply }
      );

      if (response.success && response.data?.success) {
        setPendingPolicies({});
        setFeedback({
          error: false,
          message: `Sucesso: ${response.data.appliedCount} políticas aplicadas e verificadas.`
        });
        // Refresh to get updated states
        await onRefresh();
      } else {
        const errorMsg = response.error || response.data?.message || "Falha ao aplicar alterações.";
        setFeedback({ error: true, message: errorMsg });
      }
    } catch (error) {
      setFeedback({
        error: true,
        message: error instanceof Error ? error.message : "Erro ao aplicar alterações."
      });
    } finally {
      setBusy(false);
    }
  }, [realConnected, pendingPolicies, sendIpc, onRefresh]);

  // Discard pending changes
  const discardPendingChanges = useCallback(() => {
    setPendingPolicies({});
    setFeedback({ error: false, message: "Alterações pendentes descartadas." });
  }, []);

  // Get pending count
  const pendingCount = Object.keys(pendingPolicies).length;

  return (
    <div className="wl-shell">
      {/* Sidebar Navigation */}
      <aside className="wl-side">
        <div className="wl-logo">
          <span>W</span>
          <div>
            <strong>WinLab</strong>
            <small>Desktop</small>
          </div>
        </div>
        
        <div className="wl-side-label">MENU PRINCIPAL</div>
        <nav aria-label="Menu principal">
          {NAVIGATION_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`wl-nav ${section === item.id ? "current" : ""}`}
            >
              <span>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="wl-side-bottom">
          <button
            type="button"
            className="wl-button secondary"
            onClick={onRefresh}
            disabled={isScanning}
          >
            {isScanning ? "Atualizando..." : "Atualizar"}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="wl-main">
        {/* Header */}
        <header className="wl-header">
          <div>
            <span className="wl-overline">PAINEL DE CONTROLE</span>
            <h1>{sectionTitle}</h1>
          </div>
          <div className="wl-head-actions">
            <span className={`wl-state ${realConnected ? "online" : "offline"}`}>
              {realConnected ? "Windows conectado" : mode === "Demo" ? "Modo Demonstração" : "Aguardando conexão"}
            </span>
            
            {/* Pending changes indicator */}
            {pendingCount > 0 && (
              <span className="wl-pending-badge">{pendingCount} pendente(s)</span>
            )}
            
            {/* Connection/Mode controls */}
            {native && mode === "Demo" && (
              <button
                type="button"
                className="wl-button primary"
                onClick={() => onChangeMode("Real")}
                disabled={isScanning}
              >
                Conectar ao Windows
              </button>
            )}
          </div>
        </header>

        {/* Feedback Message */}
        {feedback && (
          <div role={feedback.error ? "alert" : "status"} className={`wl-feedback ${feedback.error ? "error" : ""}`}>
            {feedback.message}
          </div>
        )}

        {/* Scan Error */}
        {scanError && !realConnected && (
          <div role="alert" className="wl-feedback error">
            Não foi possível ler o Windows: {scanError}
          </div>
        )}

        {/* Not Connected State */}
        {!realConnected && mode === "Demo" && (
          <div className="wl-connect">
            <div>
              <strong>Modo de Demonstração</strong>
              <p>Este modo não altera seu computador. Conecte ao modo Real para administrar o Windows.</p>
            </div>
          </div>
        )}

        {/* Main Section Content */}
        {realConnected ? (
          <Section
            id={section}
            title={sectionTitle}
            policies={policyStates}
            pendingPolicies={pendingPolicies}
            onTogglePolicy={handleTogglePolicy}
          />
        ) : (
          <div className="wl-section-content">
            <p className="wl-empty-state">
              {mode === "Real" ? "Conectando ao Windows..." : "Conecte ao Windows para ver as políticas disponíveis."}
            </p>
          </div>
        )}

        {/* Action Bar - Apply/Discard */}
        {pendingCount > 0 && realConnected && (
          <div className="wl-action-bar">
            <div className="wl-action-info">
              <strong>{pendingCount} alteração(ões) pendente(s)</strong>
              <span>Revisar e aplicar as mudanças selecionadas</span>
            </div>
            <div className="wl-action-buttons">
              <button
                type="button"
                className="wl-button secondary"
                onClick={discardPendingChanges}
                disabled={busy}
              >
                Descartar
              </button>
              <button
                type="button"
                className="wl-button primary"
                onClick={applyPendingChanges}
                disabled={busy}
              >
                {busy ? "Aplicando..." : "Aplicar alterações"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
