"use client";

import { useState } from "react";
import type { IpcResponse, LocalUserDto } from "./contracts";
import {
  ADMIN_IPC_ACTIONS,
  buildUnifiedAccountRows,
  isCanonicalLocalWindowsSid,
  type AdminAccountApplyPayload,
  type AdminAccountPlan,
  type AdminAccountPreviewDto,
  type AdminAccountResultDto,
  type AdminAccountsDto,
  type AdminBackendCapabilities
} from "./admin-contracts-compat";

export interface AccountsSectionViewProps {
  localUsers: LocalUserDto[] | undefined;
  adminAccountsData: AdminAccountsDto | null;
  adminCapabilities: AdminBackendCapabilities;
  canOperateAgent: boolean;
  isScanning: boolean;
  busy: boolean;
  selectedUserSid: string | null;
  onSelectUser: (sid: string) => void | Promise<void>;
  onOpenPermissionsForUser: (sid: string) => void;
  accountRole: "standard" | "admin";
  onAccountRoleChange: (role: "standard" | "admin") => void;
  accountName: string;
  onAccountNameChange: (name: string) => void;
  accountPassword: string;
  onAccountPasswordChange: (password: string) => void;
  repeatPassword: string;
  onRepeatPasswordChange: (password: string) => void;
  onCreateLegacyAccount: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onRefreshAccounts: () => void | Promise<void>;
  onNotify: (feedback: { tone: "success" | "error" | "warning"; message: string }) => void;
  sendIpc: <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;
}

export function AccountsSectionView({
  localUsers,
  adminAccountsData,
  adminCapabilities,
  canOperateAgent,
  isScanning,
  busy,
  selectedUserSid,
  onSelectUser,
  onOpenPermissionsForUser,
  accountRole,
  onAccountRoleChange,
  accountName,
  onAccountNameChange,
  accountPassword,
  onAccountPasswordChange,
  repeatPassword,
  onRepeatPasswordChange,
  onCreateLegacyAccount,
  onRefreshAccounts,
  onNotify,
  sendIpc
}: AccountsSectionViewProps) {
  const [adminPreview, setAdminPreview] = useState<AdminAccountPreviewDto | null>(null);
  const [pendingPlan, setPendingPlan] = useState<AdminAccountPlan | null>(null);
  const [pendingActionLabel, setPendingActionLabel] = useState<string | null>(null);
  const [recoveryPassword, setRecoveryPassword] = useState("");
  const [localBusy, setLocalBusy] = useState(false);

  const unifiedRows = buildUnifiedAccountRows(localUsers, adminAccountsData);
  const eligibleTargets = unifiedRows.filter((row) => row.canBePolicyTarget);
  const recoveryAccount = unifiedRows.find((row) => row.role === "Recovery") ?? null;
  const adminCount = unifiedRows.filter(
    (row) => row.role === "Superadmin" || row.privilegeClassification === "Administrator"
  ).length;
  const studentCount = unifiedRows.filter((row) => row.role === "Student").length;

  async function requestAccountPreview(plan: AdminAccountPlan, actionLabel: string) {
    setLocalBusy(true);
    try {
      const previewRes = await sendIpc<AdminAccountPreviewDto>(
        ADMIN_IPC_ACTIONS.ACCOUNTS_PREVIEW,
        plan
      );
      if (!previewRes.success || !previewRes.data) {
        onNotify({
          tone: "error",
          message: previewRes.error || "Não foi possível gerar a prévia da operação na conta."
        });
        return;
      }
      setRecoveryPassword("");
      setPendingPlan(plan);
      setAdminPreview(previewRes.data);
      setPendingActionLabel(actionLabel);
    } finally {
      setLocalBusy(false);
    }
  }

  async function handleAdminCreatePreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adminCapabilities.accounts) {
      await onCreateLegacyAccount(event);
      return;
    }

    const trimmedName = accountName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 20 || /["/\\[\]:;|=,+*?<>@]/.test(trimmedName)) {
      onNotify({
        tone: "error",
        message: "Informe um nome de conta entre 1 e 20 caracteres, sem símbolos reservados do Windows."
      });
      return;
    }
    if (!accountPassword || accountPassword !== repeatPassword || accountPassword.length < 8) {
      onNotify({
        tone: "error",
        message: "Informe uma senha com mínimo de 8 caracteres e confirme corretamente."
      });
      return;
    }

    const role: "Student" | "Superadmin" = accountRole === "admin" ? "Superadmin" : "Student";
    await requestAccountPreview(
      { operation: "Create", name: trimmedName, role },
      `Criar conta ${role === "Superadmin" ? "Superadmin" : "Aluno"} '${trimmedName}'`
    );
  }

  async function handleConfirmAdminAccountPreview() {
    if (!adminPreview || !pendingPlan) return;
    setLocalBusy(true);
    try {
      let payload: AdminAccountApplyPayload;
      if (pendingPlan.operation === "Create") {
        payload = {
          plan: pendingPlan,
          revision: adminPreview.revision,
          password: accountPassword
        };
      } else if (pendingPlan.operation === "ProtectRecovery") {
        payload = {
          plan: pendingPlan,
          revision: adminPreview.revision,
          password: recoveryPassword
        };
      } else {
        payload = {
          plan: pendingPlan,
          revision: adminPreview.revision
        };
      }

      const res = await sendIpc<AdminAccountResultDto>(ADMIN_IPC_ACTIONS.ACCOUNTS_APPLY, payload);
      if (res.success && res.data) {
        const appliedOperation = pendingPlan.operation;
        setAdminPreview(null);
        setPendingPlan(null);
        setPendingActionLabel(null);
        if (appliedOperation === "Create") {
          onAccountNameChange("");
        }
        await onRefreshAccounts();
        if (
          appliedOperation === "Create" &&
          res.data.account.role === "Student" &&
          isCanonicalLocalWindowsSid(res.data.account.sid)
        ) {
          await onSelectUser(res.data.account.sid);
        }
        onNotify({
          tone: "success",
          message: res.data.message || `Operação concluída para '${res.data.account.name}'.`
        });
      } else {
        onNotify({
          tone: "error",
          message: res.error || "Falha ao aplicar alteração da conta."
        });
      }
    } finally {
      onAccountPasswordChange("");
      onRepeatPasswordChange("");
      setRecoveryPassword("");
      setLocalBusy(false);
    }
  }

  const effectiveBusy = busy || localBusy;
  const adminCanWrite = adminCapabilities.accounts ? Boolean(adminAccountsData?.canWrite) : true;
  const isRecoveryPreview = pendingPlan?.operation === "ProtectRecovery";

  return (
    <div className="wl-section-content">
      {/* Resumo dos 3 papeis de conta */}
      <div className="wl-stats">
        <div>
          <span>Superadmin / Administradores</span>
          <strong>{adminCount}</strong>
          <small>
            Não são alvo de políticas por usuário; políticas de máquina inteira (HKLM) ainda podem afetá-los.
          </small>
        </div>
        <div>
          <span>Administrador de recuperação</span>
          <strong>{recoveryAccount ? recoveryAccount.name : "Não designado"}</strong>
          <small>
            {adminCapabilities.accounts
              ? `Status do contrato: ${adminAccountsData?.recoveryStatus ?? "NotDesignated"}`
              : "Contrato dedicado de recuperação indisponível nesta versão do backend."}
          </small>
        </div>
        <div>
          <span>Alunos (Contas comuns)</span>
          <strong>{studentCount}</strong>
          <small>{eligibleTargets.length} elegível(is) para políticas por usuário.</small>
        </div>
      </div>

      {/* Seletor da conta alvo */}
      <div className="wl-user-selector">
        <div className="wl-user-selector-info">
          <label htmlFor="wl-accounts-target-select">Conta comum alvo ativa</label>
          <small>
            {eligibleTargets.length > 0
              ? "As políticas por usuário consultam e modificam exclusivamente esta conta."
              : "Crie uma conta comum abaixo para habilitar políticas por usuário."}
          </small>
        </div>
        <div className="wl-user-selector-controls">
          <select
            id="wl-accounts-target-select"
            value={selectedUserSid || ""}
            onChange={(e) => void onSelectUser(e.target.value)}
            disabled={effectiveBusy || eligibleTargets.length === 0}
          >
            <option value="">Selecione um usuário comum...</option>
            {eligibleTargets.map((user) => (
              <option key={user.sid || user.name} value={user.sid || ""}>
                {user.name} ({user.sid})
              </option>
            ))}
          </select>
          {selectedUserSid && (
            <button
              type="button"
              className="wl-button primary"
              onClick={() => onOpenPermissionsForUser(selectedUserSid)}
            >
              Abrir permissões →
            </button>
          )}
        </div>
      </div>

      {/* Lista de contas locais */}
      <div className="wl-card">
        <div className="wl-card-title">
          <div>
            <h2>Contas encontradas neste computador</h2>
            <p>
              Classificação de privilégios verificada no Windows. Contas administrativas e contas com privilégio incerto não são selecionadas como alvo por usuário (políticas HKLM afetam toda a estação).
            </p>
          </div>
          <span className="wl-policy-count">{unifiedRows.length} conta(s)</span>
        </div>

        {adminCapabilities.accounts && adminAccountsData && adminAccountsData.limitations.length > 0 && (
          <div className="wl-notice-box warning" style={{ marginBottom: 12 }} role="status">
            <strong>Condições administrativas de contas:</strong>{" "}
            {adminAccountsData.limitations.join(" ")}
          </div>
        )}

        {isScanning && unifiedRows.length === 0 ? (
          <div className="wl-skeleton-stack" aria-label="Carregando contas locais">
            <div className="wl-skeleton wl-skeleton-line" />
            <div className="wl-skeleton wl-skeleton-line" />
          </div>
        ) : unifiedRows.length > 0 ? (
          <div className="wl-account-list">
            {unifiedRows.map((user) => {
              const canProtectRecovery =
                adminCapabilities.accounts &&
                Boolean(user.sid) &&
                user.enabled &&
                user.privilegeClassification === "Administrator" &&
                (user.role === "Unmanaged" || user.role === "Recovery");
              const canToggleStudentEnabled =
                adminCapabilities.accounts &&
                Boolean(user.sid) &&
                !user.protected &&
                user.role === "Student";

              return (
                <div key={user.key} className="wl-account">
                  <div className="wl-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
                  <div>
                    <strong>{user.name}</strong>
                    <small>
                      {user.enabled ? "Ativa" : "Desativada"} · SID: {user.sid || "Não informado"}
                      {user.classificationDetail ? ` · ${user.classificationDetail}` : ""}
                    </small>
                  </div>
                  {!user.enabled && <span className="wl-pill disabled">Desativada</span>}
                  <span
                    className={`wl-pill ${
                      user.role === "Superadmin" || user.role === "Recovery" ? "admin" : ""
                    }`}
                  >
                    {user.roleLabel}
                  </span>
                  {user.canBePolicyTarget && user.sid && (
                    <button
                      type="button"
                      className={`wl-button ${selectedUserSid === user.sid ? "primary" : "secondary"}`}
                      onClick={() => void onSelectUser(user.sid!)}
                      disabled={effectiveBusy || selectedUserSid === user.sid}
                    >
                      {selectedUserSid === user.sid ? "Alvo selecionado" : "Selecionar como alvo"}
                    </button>
                  )}
                  {canProtectRecovery && user.sid && (
                    <button
                      type="button"
                      className="wl-button secondary"
                      disabled={effectiveBusy || !adminCanWrite}
                      onClick={() =>
                        void requestAccountPreview(
                          { operation: "ProtectRecovery", sid: user.sid! },
                          user.role === "Recovery"
                            ? `Revalidar Administrador de recuperação '${user.name}'`
                            : `Designar '${user.name}' como Administrador de recuperação`
                        )
                      }
                    >
                      {user.role === "Recovery" ? "Verificar recuperação" : "Proteger recuperação"}
                    </button>
                  )}
                  {canToggleStudentEnabled && user.sid && (
                    <button
                      type="button"
                      className="wl-button secondary"
                      disabled={effectiveBusy || !adminCanWrite}
                      onClick={() =>
                        void requestAccountPreview(
                          { operation: "SetEnabled", sid: user.sid!, enabled: !user.enabled },
                          `${user.enabled ? "Desativar" : "Reativar"} conta '${user.name}'`
                        )
                      }
                    >
                      {user.enabled ? "Desativar conta" : "Reativar conta"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="wl-muted">Nenhuma conta local carregada ainda.</p>
        )}
        {!adminCapabilities.accounts && (
          <p className="wl-compat-hint" style={{ marginTop: 12 }}>
            Ativação/desativação de contas existentes e designação dedicada de Administrador de recuperação estão indisponíveis no contrato IPC atual.
          </p>
        )}
      </div>

      {/* Criacao de contas local + preparacao Superadmin / Recuperacao */}
      <div className="wl-card">
        <div className="wl-card-title">
          <div>
            <h2>Criar nova conta local</h2>
            <p>
              A senha é enviada apenas no momento da execução para a API nativa do Windows e limpa da memória imediatamente após o envio.
            </p>
          </div>
          <span className="wl-scope-tag">
            {adminCapabilities.accounts
              ? "Contrato administrativo v2 ativo"
              : "Compatível com accounts.create_local"}
          </span>
        </div>

        <form className="wl-account-form" onSubmit={(e) => void handleAdminCreatePreview(e)}>
          <div className="wl-role-choice wl-role-choice-3">
            <button
              type="button"
              className={accountRole === "standard" ? "chosen" : ""}
              onClick={() => onAccountRoleChange("standard")}
            >
              <span>Aluno (Conta comum)</span>
              <small>Sem privilégios administrativos. Recebe permissões por usuário no laboratório.</small>
            </button>
            <button
              type="button"
              className={accountRole === "admin" ? "chosen" : ""}
              onClick={() => onAccountRoleChange("admin")}
            >
              <span>Superadmin (Administrador)</span>
              <small>
                Controle administrativo local. Não é alvo de políticas por usuário, mas políticas de máquina inteira (HKLM) ainda se aplicam.
              </small>
            </button>
            <div className="wl-role-unavailable" aria-disabled="true">
              <div className="wl-setting-header">
                <span>Administrador de recuperação</span>
                <span className="wl-status-badge neutral">
                  {adminCapabilities.accounts ? "Ordem obrigatória" : "Indisponível"}
                </span>
              </div>
              <small>
                {adminCapabilities.accounts
                  ? "Designe primeiro um administrador local independente (Unmanaged) via 'Proteger recuperação' antes de criar Superadmin ou desativar Aluno."
                  : "Designação dedicada aguarda publicação do contrato IPC admin.accounts.*."}
              </small>
            </div>
          </div>

          <div className="wl-fields">
            <label>
              Nome da conta
              <input
                type="text"
                maxLength={20}
                placeholder={accountRole === "admin" ? "Ex.: SuperadminLab" : "Ex.: Aluno01"}
                value={accountName}
                onChange={(e) => onAccountNameChange(e.target.value)}
                disabled={effectiveBusy}
              />
            </label>
            <label>
              Senha inicial (mínimo 8 caracteres)
              <input
                type="password"
                autoComplete="new-password"
                value={accountPassword}
                onChange={(e) => onAccountPasswordChange(e.target.value)}
                disabled={effectiveBusy}
              />
            </label>
            <label>
              Confirmar senha
              <input
                type="password"
                autoComplete="new-password"
                value={repeatPassword}
                onChange={(e) => onRepeatPasswordChange(e.target.value)}
                disabled={effectiveBusy}
              />
            </label>
          </div>

          <div className="wl-head-actions">
            <button
              type="submit"
              className="wl-button primary"
              disabled={effectiveBusy || !canOperateAgent || !adminCanWrite}
            >
              {effectiveBusy
                ? "Processando..."
                : adminCapabilities.accounts
                  ? "Revisar criação da conta"
                  : "Criar conta local"}
            </button>
            {!canOperateAgent && (
              <small className="wl-muted">
                Conecte ao Windows real ou ative o Modo Demonstração para criar contas.
              </small>
            )}
          </div>
        </form>

        {adminPreview && pendingPlan && (
          <div className="wl-expansion-preview" style={{ marginTop: 16 }} role="region" aria-label="Prévia da operação de conta">
            <h3>Prévia: {pendingActionLabel}</h3>
            <p className="wl-muted">
              Escopo: {adminPreview.scope} · Revisão {adminPreview.revision.slice(0, 12)}
            </p>
            <div className="wl-expansion-diff">
              <div className="wl-diff-card">
                <strong>Antes</strong>
                <span>
                  {adminPreview.before
                    ? `${adminPreview.before.name} (${adminPreview.before.role} · ${adminPreview.before.enabled ? "Ativa" : "Desativada"})`
                    : "Conta inexistente"}
                </span>
              </div>
              <div className="wl-diff-card">
                <strong>Depois</strong>
                <span>
                  {adminPreview.after.name} ({adminPreview.after.role} ·{" "}
                  {adminPreview.after.enabled ? "Ativa" : "Desativada"})
                </span>
              </div>
            </div>
            {adminPreview.limitations.length > 0 && (
              <p className="wl-requires-action">{adminPreview.limitations.join(" ")}</p>
            )}
            {isRecoveryPreview && (
              <label className="wl-full" style={{ maxWidth: 380 }}>
                Senha atual da conta de recuperação (validação transitória de logon)
                <input
                  type="password"
                  autoComplete="current-password"
                  value={recoveryPassword}
                  onChange={(e) => setRecoveryPassword(e.target.value)}
                  disabled={effectiveBusy}
                />
              </label>
            )}
            <div className="wl-expansion-actions">
              <button
                type="button"
                className="wl-button secondary"
                onClick={() => {
                  setAdminPreview(null);
                  setPendingPlan(null);
                  setRecoveryPassword("");
                }}
                disabled={effectiveBusy}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="wl-button primary"
                onClick={() => void handleConfirmAdminAccountPreview()}
                disabled={
                  effectiveBusy ||
                  !adminPreview.canApply ||
                  !adminCanWrite ||
                  (isRecoveryPreview && recoveryPassword.length < 1)
                }
              >
                Confirmar alteração
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
