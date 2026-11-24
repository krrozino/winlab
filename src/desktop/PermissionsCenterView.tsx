"use client";

import type { DetectedAppDto, IpcResponse, LocalUserDto } from "./contracts";
import type {
  AdminManagementDto,
  AdminPermissionDto,
  AdminPermissionIntent
} from "./admin-contracts-compat";
import {
  ADMIN_INTENT_META,
  PERMISSION_GROUPS,
  UNAVAILABLE_FUTURE_PERMISSIONS,
  formatAdminOriginLabel,
  type PermissionCardViewModel,
  type PermissionGroup
} from "./permissions-catalog";
import { BrowserExpansion, PolicyExpansionPanel } from "./PolicyExpansionPanel";

export type ScopeFilter = "all" | "User" | "Machine";
export type StatusFilter = "all" | "active" | "pending" | "attention" | "inconclusive";

export interface PermissionsCenterViewProps {
  cards: PermissionCardViewModel[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedGroup: PermissionGroup | "all";
  onSelectGroup: (group: PermissionGroup | "all") => void;
  scopeFilter: ScopeFilter;
  onScopeFilterChange: (scope: ScopeFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  nonAdminUsers: LocalUserDto[];
  selectedUserSid: string | null;
  selectedUser: LocalUserDto | null;
  onUserSwitch: (nextSid: string) => void | Promise<void>;
  hasInconclusiveUserPolicies: boolean;
  onQueryOfflineProfile: () => void | Promise<void>;
  onTogglePolicy: (card: PermissionCardViewModel) => void;
  adminPermissionsEnabled: boolean;
  adminPermissions: AdminPermissionDto[] | null;
  adminCanWrite?: boolean;
  adminManagement?: AdminManagementDto | null;
  onSelectAdminIntent?: (permission: AdminPermissionDto, intent: AdminPermissionIntent) => void;
  realExpansionActive: boolean;
  detectedApps: DetectedAppDto[];
  busy: boolean;
  isLoadingPolicies: boolean;
  sendIpc: <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;
}

const ADMIN_INTENT_ORDER: readonly AdminPermissionIntent[] = [
  "Allow",
  "Block",
  "Preserve",
  "Restore"
];

function getUnavailableIntentHint(intent: AdminPermissionIntent, adminCanWrite: boolean): string {
  if (!adminCanWrite && intent !== "Preserve") {
    return "Modo somente leitura ativo (canWrite = false): apenas Herdar / Preservar pode ser pré-visualizado.";
  }
  switch (intent) {
    case "Block":
      return "Indisponível porque já existe configuração gravada no registro ou pendência no histórico.";
    case "Allow":
      return "Disponível quando houver bloqueio WinLab com baseline confirmando ausência prévia de política.";
    case "Restore":
      return "Disponível quando houver baseline WinLab íntegro registrado antes da restrição.";
    default:
      return "Indisponível para o estado atual.";
  }
}

function ExpansionAdminSummaryStrip({ items }: { items: AdminPermissionDto[] }) {
  if (items.length === 0) return null;
  return (
    <div className="wl-expansion-admin-strip" aria-label="Resumo administrativo de expansão">
      {items.map((item) => (
        <div key={item.id} className="wl-expansion-admin-item">
          <div className="wl-setting-header">
            <strong>{item.name}</strong>
            <span className="wl-scope-tag scope-machine">Máquina inteira (todas as contas)</span>
            <span className="wl-status-badge neutral">
              {item.state.configuredState} · {formatAdminOriginLabel(item.state.origin)}
            </span>
          </div>
          <small className="wl-muted">{item.description}</small>
        </div>
      ))}
    </div>
  );
}

function PermissionCard({
  card,
  adminPermission,
  adminCanWrite,
  onToggle,
  onSelectAdminIntent
}: {
  card: PermissionCardViewModel;
  adminPermission?: AdminPermissionDto | null;
  adminCanWrite: boolean;
  onToggle: (card: PermissionCardViewModel) => void;
  onSelectAdminIntent?: (permission: AdminPermissionDto, intent: AdminPermissionIntent) => void;
}) {
  const phaseBadgeTone =
    card.operationPhase === "confirmed"
      ? "active"
      : card.operationPhase === "failed"
        ? "error"
        : card.operationPhase === "inconclusive"
          ? "warning"
          : card.operationPhase === "selected" || card.operationPhase === "processing"
            ? "pending"
            : "neutral";

  return (
    <article
      className={`wl-perm-card ${card.hasPendingChange ? "is-pending" : ""}`}
      data-policy-id={card.id}
    >
      <div className="wl-perm-top">
        <div className="wl-perm-title-block">
          <div className="wl-setting-header">
            <h3>{card.simpleName}</h3>
            <span className={`wl-scope-tag ${card.scopeKind === "User" ? "scope-user" : "scope-machine"}`}>
              {card.scopeBadge}
            </span>
            <span className={`wl-status-badge ${card.currentStateTone}`}>
              Estado atual: {card.currentStateLabel}
            </span>
            {card.originLabel && (
              <span className="wl-scope-tag">Origem: {card.originLabel}</span>
            )}
          </div>
          <p className="wl-setting-description">{card.description}</p>
        </div>

        <div className="wl-perm-controls">
          {card.controlMode === "admin-intents" && adminPermission && onSelectAdminIntent ? (
            <div className="wl-tristate" role="group" aria-label={`Intenções de ${card.simpleName}`}>
              {ADMIN_INTENT_ORDER.map((intent) => {
                const supported = adminPermission.intents.includes(intent);
                const intentCanWrite = intent === "Preserve" || adminCanWrite;
                const isSelected = card.activeAdminIntent === intent;
                const meta = ADMIN_INTENT_META[intent];
                const isDisabled = card.disabled || !supported || !intentCanWrite;
                return (
                  <button
                    key={intent}
                    type="button"
                    disabled={isDisabled}
                    aria-pressed={isSelected}
                    title={
                      supported && intentCanWrite
                        ? meta.shortDesc
                        : getUnavailableIntentHint(intent, adminCanWrite)
                    }
                    className={`wl-tristate-btn ${isSelected ? "active" : ""}`}
                    onClick={() => onSelectAdminIntent(adminPermission, intent)}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="wl-binary-control">
              <div className="wl-mode-pills" aria-hidden="true">
                <span className={!card.switchChecked ? "active" : ""}>Herdar padrão</span>
                <span className={card.switchChecked ? "active block" : ""}>Bloquear</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-label={`Alternar ${card.simpleName}`}
                aria-checked={card.switchChecked}
                title={card.disabledReason}
                className={`wl-switch ${card.switchChecked ? "selected" : ""} ${
                  card.hasPendingChange ? "pending" : ""
                }`}
                onClick={() => onToggle(card)}
                disabled={card.disabled}
              >
                <span />
              </button>
            </div>
          )}
        </div>
      </div>

      <dl className="wl-perm-facts">
        <div>
          <dt>Efeito esperado</dt>
          <dd>{card.expectedEffect}</dd>
        </div>
        <div>
          <dt>Compatibilidade</dt>
          <dd>{card.compatibility}</dd>
        </div>
        <div>
          <dt>Reinício</dt>
          <dd>{card.restartBadge}</dd>
        </div>
        <div>
          <dt>Alteração pendente</dt>
          <dd>
            <span className={`wl-status-badge ${phaseBadgeTone}`}>{card.operationPhaseLabel}</span>
            {card.operationDetail && <small className="wl-perm-detail-note">{card.operationDetail}</small>}
          </dd>
        </div>
      </dl>

      {card.controlMode === "admin-intents" ? (
        <p className="wl-compat-hint wl-intent-legend">
          <strong>Semântica distinta:</strong> Permitir (remove bloqueio WinLab quando possível) · Bloquear (aplica restrição suportada) · Herdar / Preservar (mantém configuração sem alteração) · Restaurar (recupera baseline registrado). Clique em uma ação para abrir a prévia.
        </p>
      ) : (
        <p className="wl-compat-hint">
          Semântica atual do motor: ativar aplica bloqueio; desativar restaura a herança padrão do Windows (NotConfigured). A opção forçada Permitir requer o contrato administrativo v2.
        </p>
      )}

      {card.disabledReason && <p className="wl-requires-action">{card.disabledReason}</p>}

      <details className="wl-setting-details">
        <summary>Detalhes técnicos (registro, limitações e auditoria)</summary>
        <div>
          <span>Identificador: {card.technicalDetails.policyId}</span>
          <span>
            Chave de registro: {card.technicalDetails.hive}\{card.technicalDetails.subKey} (
            {card.technicalDetails.valueName})
          </span>
          <span>
            Impacto: {card.technicalDetails.riskLabel} · Reversível: {card.technicalDetails.reversibleText}
          </span>
          <span>
            Configurada: {card.technicalDetails.configuredState} · Efetiva:{" "}
            {card.technicalDetails.effectiveState}
          </span>
          {card.technicalDetails.evidence && (
            <span>Leitura do sistema: {card.technicalDetails.evidence}</span>
          )}
          {card.limitations && card.limitations.length > 0 && (
            <span>Limitações registradas: {card.limitations.join(" ")}</span>
          )}
          {card.technicalDetails.lastVerified && (
            <span>
              Última verificação: {new Date(card.technicalDetails.lastVerified).toLocaleString()}
            </span>
          )}
        </div>
      </details>
    </article>
  );
}

export function PermissionsCenterView({
  cards,
  searchQuery,
  onSearchChange,
  selectedGroup,
  onSelectGroup,
  scopeFilter,
  onScopeFilterChange,
  statusFilter,
  onStatusFilterChange,
  nonAdminUsers,
  selectedUserSid,
  selectedUser,
  onUserSwitch,
  hasInconclusiveUserPolicies,
  onQueryOfflineProfile,
  onTogglePolicy,
  adminPermissionsEnabled,
  adminPermissions,
  adminCanWrite = true,
  adminManagement = null,
  onSelectAdminIntent,
  realExpansionActive,
  detectedApps,
  busy,
  isLoadingPolicies,
  sendIpc
}: PermissionsCenterViewProps) {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const matchesSearch = (text: string) =>
    !normalizedSearch || text.toLowerCase().includes(normalizedSearch);

  const filteredCards = cards.filter((card) => {
    if (selectedGroup !== "all" && card.group !== selectedGroup) return false;
    if (scopeFilter !== "all" && card.scopeKind !== scopeFilter) return false;
    if (statusFilter === "active" && !card.switchChecked && !card.hasPendingChange) return false;
    if (statusFilter === "pending" && !card.hasPendingChange) return false;
    if (
      statusFilter === "attention" &&
      card.technicalDetails.effectiveState !== "Drifted" &&
      !card.requiresLogoff &&
      !card.requiresRestart &&
      !card.requiresAppRestart
    ) {
      return false;
    }
    if (
      statusFilter === "inconclusive" &&
      card.technicalDetails.effectiveState !== "Inconclusive" &&
      card.technicalDetails.configuredState !== "Inconclusive" &&
      card.operationPhase !== "inconclusive"
    ) {
      return false;
    }

    return matchesSearch(
      `${card.simpleName} ${card.title} ${card.description} ${card.group} ${card.id} ${card.expectedEffect}`
    );
  });

  const adminMap = new Map((adminPermissions ?? []).map((item) => [item.id, item]));
  const expansionAdminItems = (adminPermissions ?? []).filter((item) => item.mechanism === "Expansion");
  const groupsToDisplay =
    selectedGroup === "all" ? PERMISSION_GROUPS : PERMISSION_GROUPS.filter((g) => g === selectedGroup);

  const userScopedCount = cards.filter((c) => c.scopeKind === "User").length;
  const machineScopedCount = cards.filter((c) => c.scopeKind === "Machine").length;

  return (
    <div className="wl-section-content">
      {/* Barra persistente de conta alvo e distincao de escopo */}
      <div className="wl-user-selector sticky-scope">
        <div className="wl-user-selector-info">
          <div className="wl-setting-header">
            <label htmlFor="wl-perm-user-select">Conta comum selecionada para políticas por usuário</label>
            {selectedUser ? (
              <span className="wl-status-badge active">{selectedUser.name}</span>
            ) : (
              <span className="wl-status-badge warning">Nenhuma conta comum selecionada</span>
            )}
          </div>
          <small>
            <strong>Por usuário ({userScopedCount}):</strong> aplica apenas à conta comum escolhida (contas administrativas não são selecionadas como alvo).{" "}
            <strong>Máquina inteira ({machineScopedCount}):</strong> aplica para todas as contas do computador, inclusive administradores e Superadmin.
          </small>
        </div>

        <div className="wl-user-selector-controls">
          <select
            id="wl-perm-user-select"
            value={selectedUserSid || ""}
            onChange={(e) => void onUserSwitch(e.target.value)}
            disabled={busy || nonAdminUsers.length === 0}
          >
            <option value="">Selecione um usuário comum...</option>
            {nonAdminUsers.map((user) => (
              <option key={user.sid} value={user.sid}>
                {user.name} ({user.sid})
              </option>
            ))}
          </select>
          {hasInconclusiveUserPolicies && (realExpansionActive || adminPermissionsEnabled) && (
            <button
              type="button"
              className="wl-button secondary"
              onClick={() => void onQueryOfflineProfile()}
              disabled={busy}
            >
              Consultar perfil sob UAC (Admin)
            </button>
          )}
        </div>
      </div>

      {adminPermissionsEnabled && adminManagement && adminManagement.status !== "NotDetected" && (
        <div className="wl-notice-box warning" role="status">
          <strong>Gerenciamento externo/institucional detectado ({adminManagement.status}):</strong>{" "}
          Domínio: {adminManagement.domain} · Entra ID: {adminManagement.entra}
          {adminManagement.entraScope ? ` (${adminManagement.entraScope})` : ""} · MDM: {adminManagement.mdm}. Alterações administrativas permanecem suspensas (somente leitura / Herdar ou Preservar).
        </div>
      )}

      {adminPermissionsEnabled && !adminCanWrite && (!adminManagement || adminManagement.status === "NotDetected") && (
        <div className="wl-notice-box warning" role="status">
          <strong>Modo administrativo somente leitura (canWrite = false):</strong> pré-visualizações de alteração ficam restritas até haver autorização elevada e histórico de baseline íntegro.
        </div>
      )}

      {/* Filtros e busca da central de permissoes */}
      <div className="wl-card wl-filter-card">
        <div className="wl-filter-top">
          <label className="wl-search-field">
            <span>Filtrar permissões</span>
            <input
              type="search"
              placeholder="Buscar por nome, recurso, navegador, USB, CMD, MSI..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </label>
          <label>
            <span>Escopo</span>
            <select
              value={scopeFilter}
              onChange={(e) => onScopeFilterChange(e.target.value as ScopeFilter)}
            >
              <option value="all">Todos os escopos</option>
              <option value="User">Por usuário (conta selecionada)</option>
              <option value="Machine">Máquina inteira (HKLM — inclui administradores)</option>
            </select>
          </label>
          <label>
            <span>Estado</span>
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as StatusFilter)}
            >
              <option value="all">Todos os estados</option>
              <option value="active">Bloqueios ativos / selecionados</option>
              <option value="pending">Com alteração pendente</option>
              <option value="attention">Divergentes / requer reinício</option>
              <option value="inconclusive">Inconclusivas</option>
            </select>
          </label>
        </div>

        <div className="wl-category-tabs" role="tablist" aria-label="Categorias de permissões">
          <button
            type="button"
            role="tab"
            aria-selected={selectedGroup === "all"}
            className={`wl-cat-tab ${selectedGroup === "all" ? "active" : ""}`}
            onClick={() => onSelectGroup("all")}
          >
            Todas ({cards.length})
          </button>
          {PERMISSION_GROUPS.map((group) => {
            const count = cards.filter((c) => c.group === group).length;
            return (
              <button
                key={group}
                type="button"
                role="tab"
                aria-selected={selectedGroup === group}
                className={`wl-cat-tab ${selectedGroup === group ? "active" : ""}`}
                onClick={() => onSelectGroup(group)}
              >
                {group} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {isLoadingPolicies && cards.length === 0 ? (
        <div className="wl-card">
          <div className="wl-skeleton-stack" aria-label="Carregando permissões da estação">
            <div className="wl-skeleton wl-skeleton-title" />
            <div className="wl-skeleton wl-skeleton-line" />
            <div className="wl-skeleton wl-skeleton-line" />
            <div className="wl-skeleton wl-skeleton-line short" />
          </div>
        </div>
      ) : null}

      {groupsToDisplay.map((group) => {
        const groupCards = filteredCards.filter((c) => c.group === group);
        const futureItems = UNAVAILABLE_FUTURE_PERMISSIONS.filter(
          (item) =>
            item.group === group &&
            scopeFilter === "all" &&
            statusFilter === "all" &&
            matchesSearch(`${item.simpleName} ${item.description} ${item.group}`)
        );
        const showsAppExpansion = group === "Aplicativos" && statusFilter === "all" && scopeFilter !== "User";
        const showsBrowserExpansion = group === "Internet" && statusFilter === "all" && scopeFilter !== "User";
        const showsUsbExpansion = group === "Dispositivos" && statusFilter === "all" && scopeFilter !== "User";

        const groupExpansionSummary = expansionAdminItems.filter((item) => {
          if (group === "Aplicativos") return item.expansionTarget === "apps";
          if (group === "Internet") return item.expansionTarget === "chrome" || item.expansionTarget === "edge";
          if (group === "Dispositivos") return item.expansionTarget === "usb";
          return false;
        });

        if (
          groupCards.length === 0 &&
          futureItems.length === 0 &&
          !showsAppExpansion &&
          !showsBrowserExpansion &&
          !showsUsbExpansion
        ) {
          return null;
        }

        return (
          <section key={group} className="wl-perm-group" aria-label={`Permissões de ${group}`}>
            <div className="wl-section-header">
              <div>
                <h2>{group}</h2>
                <small className="wl-muted">
                  {group === "Sistema" && "Ferramentas administrativas, Configurações e controles críticos do sistema."}
                  {group === "Personalização" && "Aparência visual, tela de bloqueio, sons e cursor."}
                  {group === "Aplicativos" && "Microsoft Store, Windows Installer (MSI) e auditoria AppLocker."}
                  {group === "Internet" && "Restrições de Chrome/Edge na máquina e conexões LAN por usuário."}
                  {group === "Dispositivos" && "Proteção contra gravação, leitura e execução em mídias USB."}
                </small>
              </div>
              <span className="wl-policy-count">{groupCards.length} controle(s)</span>
            </div>

            {groupCards.length > 0 && (
              <div className="wl-perm-list">
                {groupCards.map((card) => (
                  <PermissionCard
                    key={card.id}
                    card={card}
                    adminPermission={adminPermissionsEnabled ? adminMap.get(card.id) : null}
                    adminCanWrite={adminCanWrite}
                    onToggle={onTogglePolicy}
                    onSelectAdminIntent={onSelectAdminIntent}
                  />
                ))}
              </div>
            )}

            {showsAppExpansion && (
              <>
                <ExpansionAdminSummaryStrip items={groupExpansionSummary} />
                <PolicyExpansionPanel
                  key={`apps-${selectedUserSid || "no-user"}`}
                  target="apps"
                  real={realExpansionActive}
                  sid={selectedUserSid}
                  detectedApps={detectedApps}
                  sendIpc={sendIpc}
                />
              </>
            )}

            {showsBrowserExpansion && (
              <>
                <ExpansionAdminSummaryStrip items={groupExpansionSummary} />
                <BrowserExpansion real={realExpansionActive} sendIpc={sendIpc} />
              </>
            )}

            {showsUsbExpansion && (
              <>
                <ExpansionAdminSummaryStrip items={groupExpansionSummary} />
                <PolicyExpansionPanel target="usb" real={realExpansionActive} sendIpc={sendIpc} />
              </>
            )}

            {futureItems.length > 0 && (
              <div className="wl-future-list">
                {futureItems.map((future) => (
                  <div key={future.id} className="wl-perm-card is-unavailable">
                    <div className="wl-perm-top">
                      <div className="wl-perm-title-block">
                        <div className="wl-setting-header">
                          <h3>{future.simpleName}</h3>
                          <span className="wl-scope-tag">{future.scopeBadge}</span>
                          <span className="wl-status-badge neutral">Indisponível nesta versão</span>
                        </div>
                        <p className="wl-setting-description">{future.description}</p>
                      </div>
                    </div>
                    <p className="wl-compat-hint">{future.availabilityReason}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}

      {filteredCards.length === 0 && !isLoadingPolicies && (
        <div className="wl-empty-state">
          Nenhuma permissão encontrada para os filtros atuais. Limpe a busca ou altere categoria/escopo/estado.
        </div>
      )}
    </div>
  );
}
