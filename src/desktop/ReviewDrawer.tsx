"use client";

import { useEffect, useRef } from "react";
import type { OperatingMode } from "@/lib/types";
import type { LocalUserDto } from "./contracts";
import type {
  AdminPermissionDto,
  AdminPermissionPreviewDto
} from "./admin-contracts-compat";
import {
  ADMIN_INTENT_META,
  formatAdminOriginLabel,
  type PermissionCardViewModel
} from "./permissions-catalog";
import type { PolicyExecutionOutcome } from "./policy-state-machine";

export interface ReviewDrawerItem {
  policyId: string;
  title: string;
  simpleName: string;
  scopeKind: "User" | "Machine";
  scopeBadge: string;
  risk: string;
  beforeLabel: string;
  afterLabel: string;
  expectedEffect: string;
  compatibility: string;
  restartBadge: string;
  requiresRestart: boolean;
  requiresLogoff: boolean;
  requiresAppRestart: boolean;
  desiredEnabled: boolean;
}

export interface AdminDrawerPreviewState {
  preview: AdminPermissionPreviewDto;
  permission: AdminPermissionDto | null;
  elevatedReadUsed?: boolean;
  canWrite?: boolean;
}

export interface ReviewDrawerProps {
  open: boolean;
  mode: OperatingMode;
  busy: boolean;
  items: ReviewDrawerItem[];
  selectedUser: LocalUserDto | null;
  validationError: string | null;
  canConfirm: boolean;
  outcomes?: Record<string, PolicyExecutionOutcome>;
  batchResult?: {
    hasError: boolean;
    hasInconclusive: boolean;
    message: string;
  } | null;
  adminPreview?: AdminDrawerPreviewState | null;
  onRetryElevatedAdminPreview?: () => void | Promise<void>;
  onConfirmAdminPreview?: () => void | Promise<void>;
  onRemoveItem: (policyId: string) => void;
  onDiscardAll: () => void;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
}

const RISK_PT: Record<string, string> = {
  Low: "Baixo",
  Medium: "Moderado",
  High: "Elevado",
  Critical: "Crítico"
};

export function buildReviewDrawerItems(
  cards: PermissionCardViewModel[],
  pendingPolicies: Record<string, boolean>
): ReviewDrawerItem[] {
  const result: ReviewDrawerItem[] = [];
  for (const card of cards) {
    if (pendingPolicies[card.id] === undefined) continue;
    const desiredEnabled = Boolean(pendingPolicies[card.id]);
    result.push({
      policyId: card.id,
      title: card.title,
      simpleName: card.simpleName,
      scopeKind: card.scopeKind,
      scopeBadge: card.scopeBadge,
      risk: RISK_PT[card.technicalDetails.riskLabel] ?? card.technicalDetails.riskLabel,
      beforeLabel: card.currentStateLabel,
      afterLabel: desiredEnabled ? "Bloquear (Ativar restrição)" : "Herdar padrão do Windows (Remover bloqueio)",
      expectedEffect: card.expectedEffect,
      compatibility: card.compatibility,
      restartBadge: card.restartBadge,
      requiresRestart: card.requiresRestart,
      requiresLogoff: card.requiresLogoff,
      requiresAppRestart: card.requiresAppRestart,
      desiredEnabled
    });
  }
  return result;
}

export function ReviewDrawer({
  open,
  mode,
  busy,
  items,
  selectedUser,
  validationError,
  canConfirm,
  outcomes = {},
  batchResult = null,
  adminPreview = null,
  onRetryElevatedAdminPreview,
  onConfirmAdminPreview,
  onRemoveItem,
  onDiscardAll,
  onCancel,
  onConfirm
}: ReviewDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  // Modo 1: Previa administrativa individual (AdminPermissionPreviewDto)
  if (adminPreview) {
    const { preview, permission, elevatedReadUsed = false, canWrite = true } = adminPreview;
    const intentMeta = ADMIN_INTENT_META[preview.intent];
    const isMachineScope = preview.scope === "Machine";
    const needsUacElevatedRetry =
      preview.scope === "User" &&
      !elevatedReadUsed &&
      Boolean(onRetryElevatedAdminPreview) &&
      (preview.before.effectiveState === "Inconclusive" ||
        preview.before.configuredState === "Inconclusive" ||
        preview.before.origin === "Inconclusive" ||
        !preview.canApply);
    const confirmBlocked =
      busy ||
      !preview.canApply ||
      (preview.intent !== "Preserve" && !canWrite) ||
      !onConfirmAdminPreview;

    return (
      <div
        className="wl-drawer-overlay"
        onClick={() => {
          if (!busy) onCancel();
        }}
      >
        <aside
          ref={panelRef}
          tabIndex={-1}
          className="wl-drawer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wl-review-drawer-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="wl-drawer-header">
            <div>
              <span className="wl-overline">PRÉVIA E CONFIRMAÇÃO · PERMISSÃO ADMINISTRATIVA</span>
              <h2 id="wl-review-drawer-title">{permission?.name ?? preview.permissionId}</h2>
              <p>
                Intenção selecionada: <strong>{intentMeta.previewActionLabel}</strong> · Revisão{" "}
                <code>{preview.revision.slice(0, 12)}</code>
              </p>
            </div>
            <button
              type="button"
              className="wl-button secondary"
              onClick={onCancel}
              disabled={busy}
              aria-label="Fechar painel de prévia"
            >
              Fechar
            </button>
          </div>

          <div className="wl-drawer-body">
            {busy && (
              <div className="wl-feedback warning" role="status" aria-live="polite">
                <div>
                  <strong>Em processamento no executor administrativo...</strong>
                  <p>Aguardando autorização e releitura real do Windows antes de confirmar.</p>
                </div>
              </div>
            )}

            <section className="wl-drawer-section" aria-label="Intenção e escopo">
              <h3>Contas afetadas, escopo e intenção</h3>
              <div className="wl-review-target-grid">
                <div className="wl-review-target-card">
                  <span>{isMachineScope ? "Máquina inteira (HKLM)" : "Por usuário (conta comum)"}</span>
                  <strong>
                    {isMachineScope
                      ? "Todas as contas desta estação"
                      : preview.target
                        ? preview.target.name
                        : "Conta comum não informada"}
                  </strong>
                  <small>
                    {isMachineScope
                      ? "Política de máquina inteira (HKLM): afeta todas as contas, inclusive administradores e Superadmin."
                      : preview.target?.sid
                        ? `SID: ${preview.target.sid} · Políticas por usuário não selecionam administradores como alvo.`
                        : "Selecione uma conta comum válida."}
                  </small>
                </div>
                <div className="wl-review-target-card">
                  <span>Operação prevista</span>
                  <strong>{intentMeta.label}</strong>
                  <small>{intentMeta.shortDesc}</small>
                </div>
              </div>
            </section>

            <section className="wl-drawer-section" aria-label="Antes e depois">
              <h3>Antes e depois (leitura real do sistema)</h3>
              <div className="wl-diff-grid">
                <div>
                  <span>Antes (Estado observado)</span>
                  <strong>
                    {preview.before.configuredState} · {preview.before.effectiveState}
                  </strong>
                  <small className="wl-muted" style={{ display: "block", marginTop: 4 }}>
                    Origem: {formatAdminOriginLabel(preview.before.origin)}
                  </small>
                  {preview.before.evidence && (
                    <small className="wl-perm-detail-note">{preview.before.evidence}</small>
                  )}
                </div>
                <div>
                  <span>Depois (Resultado previsto)</span>
                  <strong>
                    {preview.after.configuredState} · {preview.after.effectiveState}
                  </strong>
                  <small className="wl-muted" style={{ display: "block", marginTop: 4 }}>
                    Origem: {formatAdminOriginLabel(preview.after.origin)}
                  </small>
                  {preview.after.evidence && (
                    <small className="wl-perm-detail-note">{preview.after.evidence}</small>
                  )}
                </div>
              </div>
            </section>

            <section className="wl-drawer-section" aria-label="Avisos de impacto administrativo e limitações">
              <h3>Avisos de impacto administrativo e limitações</h3>
              <div className="wl-drawer-warnings">
                {(!preview.canApply || (preview.intent !== "Preserve" && !canWrite)) && (
                  <div className="wl-feedback error" role="alert">
                    <span>
                      Operação bloqueada para confirmação (canApply = false). Revise as limitações abaixo antes de aplicar.
                    </span>
                  </div>
                )}
                {isMachineScope && (
                  <div className="wl-notice-box warning">
                    <strong>Impacto em toda a máquina (inclusive administradores):</strong> Políticas de máquina inteira (HKLM) afetam todas as contas deste computador, inclusive administradores e Superadmin, até serem revertidas.
                  </div>
                )}
                {preview.limitations.length > 0 && (
                  <div className="wl-notice-box warning">
                    <strong>Limitações e observações do executor:</strong>
                    <ul style={{ margin: "6px 0 0 18px", padding: 0 }}>
                      {preview.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {needsUacElevatedRetry && (
                  <div className="wl-notice-box info">
                    <strong>Leitura do perfil de usuário incompleta:</strong> você pode solicitar uma releitura da prévia sob elevação administrativa (UAC) antes de aplicar.
                    <div style={{ marginTop: 8 }}>
                      <button
                        type="button"
                        className="wl-button secondary"
                        disabled={busy}
                        onClick={() => void onRetryElevatedAdminPreview?.()}
                      >
                        Repetir prévia sob UAC (leitura elevada)
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {permission && (
              <section className="wl-drawer-section" aria-label="Compatibilidade e reinicializações">
                <h3>Compatibilidade e reinicializações</h3>
                <p className="wl-review-effect">{permission.compatibility}</p>
                <div className="wl-compat-pills" style={{ marginTop: 8 }}>
                  <span className={`wl-status-badge ${permission.requiresRestart ? "warning" : "neutral"}`}>
                    {permission.requiresRestart ? "Requer reiniciar o Windows" : "Sem reinício obrigatório do Windows"}
                  </span>
                  <span className={`wl-status-badge ${permission.requiresLogoff ? "warning" : "neutral"}`}>
                    {permission.requiresLogoff ? "Requer novo login (logoff) da conta" : "Sem logoff obrigatório"}
                  </span>
                  <span className={`wl-status-badge ${permission.requiresAppRestart ? "warning" : "neutral"}`}>
                    {permission.requiresAppRestart ? "Requer fechar e reabrir navegadores" : "Aplicativos sem reinício"}
                  </span>
                </div>
              </section>
            )}
          </div>

          <div className="wl-drawer-footer">
            <span className="wl-muted">
              {elevatedReadUsed ? "Prévia consultada sob UAC (elevatedRead)." : "Confirmação explícita obrigatória."}
            </span>
            <div className="wl-head-actions">
              <button
                type="button"
                className="wl-button secondary"
                onClick={onCancel}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="wl-button primary"
                onClick={() => void onConfirmAdminPreview?.()}
                disabled={confirmBlocked}
              >
                {busy ? "Aplicando no executor..." : "Confirmar e aplicar"}
              </button>
            </div>
          </div>
        </aside>
      </div>
    );
  }

  // Modo 2: Transacao em lote (motor transacional existente / Demo)
  const userScopedItems = items.filter((item) => item.scopeKind === "User");
  const machineScopedItems = items.filter((item) => item.scopeKind === "Machine");
  const requiresRestart = items.some((item) => item.requiresRestart);
  const requiresLogoff = items.some((item) => item.requiresLogoff);
  const requiresAppRestart = items.some((item) => item.requiresAppRestart);
  const mediumOrHighRiskCount = items.filter(
    (item) => item.risk === "Moderado" || item.risk === "Elevado" || item.risk === "Crítico"
  ).length;

  const outcomeList = Object.values(outcomes);
  const showingOutcomeView = Boolean(batchResult) && !busy && items.length === 0 && outcomeList.length > 0;

  return (
    <div
      className="wl-drawer-overlay"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="wl-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wl-review-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wl-drawer-header">
          <div>
            <span className="wl-overline">PRÉVIA E CONFIRMAÇÃO</span>
            <h2 id="wl-review-drawer-title">
              {showingOutcomeView ? "Resultado da execução" : "Revisar alterações antes de aplicar"}
            </h2>
            <p>
              {mode === "Real"
                ? "O WinLab gravará um ponto de restauração prévio dos valores do registro. O Windows solicitará confirmação administrativa (UAC)."
                : "Modo Demonstração ativo: simulação controlada em memória. Nenhuma chave ou conta do Windows real será alterada."}
            </p>
          </div>
          <button
            type="button"
            className="wl-button secondary"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fechar painel de prévia"
          >
            Fechar
          </button>
        </div>

        <div className="wl-drawer-body">
          {busy && (
            <div className="wl-feedback warning" role="status" aria-live="polite">
              <div>
                <strong>Em processamento no executor...</strong>
                <p>
                  Aguardando autorização e resposta real do agente Windows com releitura pós-aplicação. Não feche o aplicativo durante a transação.
                </p>
              </div>
            </div>
          )}

          {batchResult && !busy && (
            <div
              role={batchResult.hasError ? "alert" : "status"}
              className={`wl-feedback ${
                batchResult.hasError ? "error" : batchResult.hasInconclusive ? "warning" : ""
              }`}
            >
              <span>{batchResult.message}</span>
            </div>
          )}

          {/* 1. Contas afetadas */}
          <section className="wl-drawer-section" aria-label="Contas afetadas">
            <h3>Contas afetadas e escopo</h3>
            <div className="wl-review-target-grid">
              <div className="wl-review-target-card">
                <span>Políticas por usuário ({userScopedItems.length})</span>
                <strong>
                  {userScopedItems.length === 0
                    ? "Nenhuma selecionada"
                    : selectedUser
                      ? `${selectedUser.name}`
                      : "Nenhuma conta comum selecionada"}
                </strong>
                <small>
                  {userScopedItems.length === 0
                    ? "Somente configurações globais da máquina serão alteradas."
                    : selectedUser?.sid
                      ? `SID: ${selectedUser.sid} · Políticas por usuário não selecionam contas administrativas como alvo.`
                      : "Selecione uma conta comum válida antes de confirmar políticas por usuário."}
                </small>
              </div>
              <div className="wl-review-target-card">
                <span>Políticas de máquina inteira ({machineScopedItems.length})</span>
                <strong>
                  {machineScopedItems.length > 0
                    ? "Todas as contas desta estação"
                    : "Nenhuma selecionada"}
                </strong>
                <small>
                  {machineScopedItems.length > 0
                    ? "Escopo HKLM: afeta todas as contas deste computador, inclusive administradores e Superadmin."
                    : "Escopo global não será modificado nesta operação."}
                </small>
              </div>
            </div>
          </section>

          {/* 2. Avisos de impacto administrativo */}
          <section className="wl-drawer-section" aria-label="Avisos de impacto administrativo">
            <h3>Avisos de impacto administrativo</h3>
            <div className="wl-drawer-warnings">
              {validationError && (
                <div className="wl-feedback error" role="alert">
                  <span>{validationError}</span>
                </div>
              )}
              {machineScopedItems.length > 0 && (
                <div className="wl-notice-box warning">
                  <strong>Impacto em toda a máquina:</strong> {machineScopedItems.length} alteração(ões) em escopo de máquina (HKLM) afetam todas as contas desta estação, inclusive administradores e Superadmin, até serem revertidas.
                </div>
              )}
              {mediumOrHighRiskCount > 0 && (
                <div className="wl-notice-box warning">
                  <strong>Restrições administrativas de sistema:</strong> {mediumOrHighRiskCount} política(s) de impacto moderado/elevado. Em políticas por usuário, contas administrativas não são alvo; em políticas de máquina inteira (HKLM), administradores também são afetados.
                </div>
              )}
              <div className="wl-notice-box info">
                <strong>Ponto de restauração automático:</strong> Antes de gravar qualquer alteração, o motor transacional salva os valores atuais para permitir desfazer em um clique.
              </div>
            </div>
          </section>

          {/* 3. Compatibilidade e reinicializações */}
          <section className="wl-drawer-section" aria-label="Compatibilidade e reinicializações">
            <h3>Compatibilidade e reinicializações</h3>
            <div className="wl-compat-pills">
              <span className={`wl-status-badge ${requiresRestart ? "warning" : "neutral"}`}>
                {requiresRestart ? "Requer reiniciar o Windows" : "Sem reinício obrigatório do Windows"}
              </span>
              <span className={`wl-status-badge ${requiresLogoff ? "warning" : "neutral"}`}>
                {requiresLogoff ? "Requer novo login (logoff) da conta" : "Sem logoff obrigatório"}
              </span>
              <span className={`wl-status-badge ${requiresAppRestart ? "warning" : "neutral"}`}>
                {requiresAppRestart ? "Requer fechar e reabrir Chrome/Edge" : "Navegadores sem reinício"}
              </span>
            </div>
          </section>

          {/* 4. Antes e depois + Alterações que serão executadas */}
          <section className="wl-drawer-section" aria-label="Antes e depois e alterações que serão executadas">
            <div className="wl-section-header">
              <h3>
                {showingOutcomeView
                  ? `Resultado verificado (${outcomeList.length})`
                  : `Alterações que serão executadas (${items.length})`}
              </h3>
              <span className="wl-policy-count">
                {busy
                  ? "Em processamento"
                  : showingOutcomeView
                    ? "Pós-execução"
                    : "Selecionadas"}
              </span>
            </div>

            {showingOutcomeView ? (
              <div className="wl-review-list">
                {outcomeList.map((outcome) => (
                  <div key={outcome.policyId} className="wl-review-item">
                    <div className="wl-review-item-head">
                      <strong>{outcome.policyId}</strong>
                      <span
                        className={`wl-status-badge ${
                          outcome.phase === "confirmed"
                            ? "active"
                            : outcome.phase === "inconclusive"
                              ? "warning"
                              : "error"
                        }`}
                      >
                        {outcome.phase === "confirmed"
                          ? "Confirmada"
                          : outcome.phase === "inconclusive"
                            ? "Inconclusiva"
                            : "Falhou"}
                      </span>
                    </div>
                    <span>{outcome.detail}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="wl-review-list">
                {items.map((item) => {
                  const itemOutcome = outcomes[item.policyId];
                  const statusTone = busy
                    ? "pending"
                    : itemOutcome?.phase === "failed"
                      ? "error"
                      : itemOutcome?.phase === "inconclusive"
                        ? "warning"
                        : "pending";
                  const statusLabel = busy
                    ? "Em processamento"
                    : itemOutcome?.phase === "failed"
                      ? "Falhou anteriormente"
                      : itemOutcome?.phase === "inconclusive"
                        ? "Inconclusiva"
                        : "Selecionada";
                  return (
                    <div key={item.policyId} className="wl-review-item" data-review-policy-id={item.policyId}>
                      <div className="wl-review-item-head">
                        <div>
                          <strong>{item.simpleName}</strong>
                          <small className="wl-muted">{item.title}</small>
                        </div>
                        <div className="wl-head-actions">
                          <span className={`wl-status-badge ${statusTone}`}>{statusLabel}</span>
                          <button
                            type="button"
                            className="wl-button-link"
                            onClick={() => onRemoveItem(item.policyId)}
                            disabled={busy}
                          >
                            Remover
                          </button>
                        </div>
                      </div>

                      <div className="wl-diff-grid">
                        <div>
                          <span>Antes (Estado verificado)</span>
                          <strong>{item.beforeLabel}</strong>
                        </div>
                        <div>
                          <span>Depois (Operação prevista)</span>
                          <strong>{item.afterLabel}</strong>
                        </div>
                      </div>

                      <p className="wl-review-effect">{item.expectedEffect}</p>
                      <div className="wl-review-meta">
                        <span>{item.scopeBadge}</span>
                        <span>{item.compatibility}</span>
                        <span>{item.restartBadge}</span>
                        <span>Impacto: {item.risk}</span>
                      </div>
                      {itemOutcome?.phase === "failed" && (
                        <small className="wl-review-error">{itemOutcome.detail}</small>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="wl-drawer-footer">
          {!showingOutcomeView && (
            <button
              type="button"
              className="wl-button danger"
              onClick={onDiscardAll}
              disabled={busy || items.length === 0}
            >
              Descartar tudo
            </button>
          )}
          <div className="wl-head-actions">
            <button
              type="button"
              className="wl-button secondary"
              onClick={onCancel}
              disabled={busy}
            >
              {showingOutcomeView ? "Fechar" : "Cancelar"}
            </button>
            {!showingOutcomeView && (
              <button
                type="button"
                className="wl-button primary"
                onClick={() => void onConfirm()}
                disabled={busy || !canConfirm || items.length === 0}
              >
                {busy ? "Aplicando no executor..." : "Confirmar e aplicar"}
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
