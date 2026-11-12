"use client";

import { useState } from "react";
import type { Config, OperatingMode } from "@/lib/types";
import type { IpcResponse, MachineInventoryDto, PolicyStateSummaryDto, ApplyTransactionResultDto } from "@/desktop/contracts";
import { IPC_CONSTANTS } from "@/desktop/contracts";
import { buildWinLabPackageFiles } from "@/lib/package-integrity";
import { createZip } from "@/lib/zip";
import { getConfigErrors } from "@/lib/validation";
import { DEFAULT_NETWORK_SHARE, NetworkSharePlan, generateShareServerScript, generateShareClientScript, validateNetworkShare } from "@/lib/network-share";
import "./control-center.css";

type Section = "home" | "accounts" | "apps" | "internet" | "system" | "network" | "diagnostics";
type AccountRole = "standard" | "admin";

interface Props {
  mode: OperatingMode;
  native: boolean;
  inventory: MachineInventoryDto | null;
  config: Config;
  setConfig: (config: Config) => void;
  scanError: string | null;
  isScanning: boolean;
  onChangeMode: (mode: OperatingMode) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onAdvanced: () => void;
  sendIpc: <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;
}

const links: { id: Section; label: string; symbol: string }[] = [
  { id: "home", label: "Visão geral", symbol: "◫" },
  { id: "accounts", label: "Contas e permissões", symbol: "♙" },
  { id: "apps", label: "Aplicativos", symbol: "▦" },
  { id: "internet", label: "Internet e navegadores", symbol: "◎" },
  { id: "system", label: "Sistema", symbol: "⚙" },
  { id: "network", label: "Rede e pastas", symbol: "▤" },
  { id: "diagnostics", label: "Diagnóstico", symbol: "◷" }
];

const settings: Record<"apps" | "internet" | "system", { key: keyof Config; title: string; description: string }[]> = {
  apps: [
    { key: "blockInstallers", title: "Restringir instalação de aplicativos", description: "Prepara regras para instaladores MSI e programas não autorizados." },
    { key: "blockStoreApps", title: "Restringir aplicativos da Microsoft Store", description: "Prepara restrições para aplicativos empacotados." }
  ],
  internet: [
    { key: "blockChromeIncognito", title: "Bloquear navegação anônima", description: "Chrome e Edge: impede janelas anônimas ou InPrivate." },
    { key: "blockChromeGuest", title: "Bloquear modo convidado", description: "Impede o uso de sessões de visitante nos navegadores." },
    { key: "blockChromeNewProfiles", title: "Impedir novos perfis", description: "Evita que usuários criem outros perfis no Chrome." },
    { key: "blockChromeExtensions", title: "Bloquear extensões não permitidas", description: "Limita a instalação de extensões no Chrome." },
    { key: "blockChromePasswordManager", title: "Desativar gerenciador de senhas", description: "Evita armazenamento de senhas no navegador." }
  ],
  system: [
    { key: "blockCmd", title: "Restringir Prompt de Comando", description: "Impede o uso de CMD pela conta restrita." },
    { key: "blockPowerShell", title: "Restringir PowerShell", description: "Impede ferramentas de script na conta restrita." },
    { key: "blockRegedit", title: "Restringir Editor do Registro", description: "Impede edição manual de configurações pelo usuário comum." },
    { key: "blockUsbWrite", title: "Bloquear gravação em USB", description: "Evita cópia de arquivos para dispositivos removíveis." },
    { key: "blockUsbRead", title: "Bloquear leitura de USB", description: "Evita leitura de arquivos em dispositivos removíveis." },
    { key: "blockWallpaper", title: "Bloquear troca de papel de parede", description: "Mantém a aparência definida pelo administrador." },
    { key: "blockMousePointers", title: "Bloquear alteração de ponteiros", description: "Restringe alterações nos cursores do mouse." },
    { key: "blockSoundScheme", title: "Bloquear esquema de sons", description: "Restringe mudanças de sons do Windows." }
  ]
};

const nativePolicies = [
  { id: "browser.chrome.incognito", label: "Navegação anônima · Chrome e Edge", scope: "machine" },
  { id: "browser.chrome.guest", label: "Modo convidado · Chrome e Edge", scope: "machine" },
  { id: "personalization.wallpaper", label: "Alterar papel de parede", scope: "user" },
  { id: "personalization.sounds", label: "Alterar esquema de sons", scope: "user" },
  { id: "personalization.mouse_pointers", label: "Alterar ponteiros do mouse", scope: "user" }
] as const;

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} className={"wl-switch " + (checked ? "selected" : "")} onClick={onChange}><span /></button>;
}

export function ControlCenter({
  mode, native, inventory, config, setConfig, scanError, isScanning, onChangeMode, onRefresh, onAdvanced, sendIpc
}: Props) {
  const [section, setSection] = useState<Section>("home");
  const [accountRole, setAccountRole] = useState<AccountRole>("standard");
  const [accountName, setAccountName] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  const [sites, setSites] = useState(config.blockedUrls.join("\n"));
  const [policyStates, setPolicyStates] = useState<Record<string, boolean>>({});
  const [policyChecked, setPolicyChecked] = useState(false);
  const [pendingPolicies, setPendingPolicies] = useState<Record<string, boolean>>({});
  const [profileEdited, setProfileEdited] = useState(false);
  const [network, setNetwork] = useState<NetworkSharePlan>(DEFAULT_NETWORK_SHARE);

  const realInventory = mode === "Real" && inventory?.isMock !== true ? inventory : null;
  const realConnected = native && mode === "Real" && realInventory !== null && !scanError;
  const standardUsers = realInventory?.localUsers.filter((user) => !user.isAdmin && user.enabled) ?? [];
  const adminUsers = realInventory?.localUsers.filter((user) => user.isAdmin && user.enabled) ?? [];
  const selectedUser = standardUsers.find((user) => user.name.toLowerCase() === config.studentUser.toLowerCase());
  const configErrors = getConfigErrors(config);

  function update<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig({ ...config, [key]: value });
    setProfileEdited(true);
    setFeedback({ error: false, message: "Opção atualizada no perfil. Para políticas ainda não integradas, exporte o pacote de configuração." });
  }

  function setMessage(message: string, error = false) {
    setFeedback({ error, message });
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!realConnected) return setMessage("Conecte ao computador real antes de criar contas.", true);
    if (accountName.trim().length < 1 || accountName.trim().length > 20 || /["/\\[\]:;|=,+*?<>@]/.test(accountName)) {
      return setMessage("Nome inválido: utilize até 20 caracteres, sem pontuação reservada do Windows.", true);
    }
    if (!accountPassword || accountPassword !== repeatPassword) return setMessage("Digite uma senha e confirme-a corretamente.", true);
    if (accountPassword.length < 8) return setMessage("Utilize uma senha com pelo menos 8 caracteres.", true);
    setBusy(true);
    setFeedback(null);
    try {
      const response = await sendIpc<{ message?: string }>("accounts.create_local", {
        name: accountName.trim(), password: accountPassword, isAdmin: accountRole === "admin"
      });
      if (response.success) {
        setConfig({ ...config, [accountRole === "admin" ? "adminUser" : "studentUser"]: accountName.trim() });
        setMessage("Conta criada no Windows. As permissões foram atribuídas.");
        setAccountName("");
        await onRefresh();
      } else {
        setMessage(response.error || "O Windows não conseguiu criar a conta.", true);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar conta.", true);
    } finally {
      setAccountPassword("");
      setRepeatPassword("");
      setBusy(false);
    }
  }

  async function queryNativePolicies() {
    if (!realConnected) return setMessage("Conecte ao Windows para consultar as políticas.", true);
    setBusy(true);
    try {
      const response = await sendIpc<PolicyStateSummaryDto>(IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES, { targetUserSid: selectedUser?.sid });
      if (!response.success || !response.data) throw new Error(response.error || "Não foi possível consultar políticas.");
      const next: Record<string, boolean> = {};
      response.data.items.forEach((item) => { next[item.id] = item.currentState === "Applied" || item.currentState === "Blocked"; });
      setPolicyStates(next);
      setPendingPolicies({});
      setPolicyChecked(true);
      setMessage("Estados consultados no Windows.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao ler políticas.", true); }
    finally { setBusy(false); }
  }

  function stageNativePolicy(id: string) {
    const current = Object.prototype.hasOwnProperty.call(pendingPolicies, id) ? pendingPolicies[id] : policyStates[id];
    setPendingPolicies((prev) => {
      const next = { ...prev, [id]: !current };
      if (next[id] === policyStates[id]) delete next[id];
      return next;
    });
    setMessage("Alteração adicionada. Confira as opções e clique em Aplicar alterações.");
  }

  async function applyNativeChanges() {
    if (!realConnected || !policyChecked) return setMessage("Conecte e consulte os estados antes de aplicar.", true);
    const items = Object.entries(pendingPolicies);
    if (!items.length) return setMessage("Nenhuma política nativa pendente.");
    const needsUser = items.some(([id]) => nativePolicies.find((p) => p.id === id)?.scope === "user");
    if (needsUser && !selectedUser?.sid) return setMessage("Selecione uma conta comum antes de aplicar políticas do usuário.", true);
    setBusy(true);
    try {
      const response = await sendIpc<ApplyTransactionResultDto>(IPC_CONSTANTS.ACTION_APPLY_TRANSACTION, {
        targetUserSid: needsUser ? selectedUser?.sid : undefined,
        targetUserName: needsUser ? selectedUser?.name : undefined,
        policies: items.map(([id, enabled]) => ({ policyId: id, desiredState: enabled ? "Blocked" : "NotConfigured" }))
      });
      if (!response.success || !response.data?.success) throw new Error(response.error || response.data?.message || "Falha ao aplicar alterações.");
      setPolicyStates((current) => ({ ...current, ...pendingPolicies }));
      setPendingPolicies({});
      setMessage("Alterações nativas aplicadas. " + (profileEdited ? "As opções de perfil restantes ainda precisam ser executadas a partir do pacote exportado." : ""));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível aplicar as políticas.", true); }
    finally { setBusy(false); }
  }

  function downloadNetworkScript(kind: "server" | "client") {
    const errors = validateNetworkShare(network);
    if (errors.length) return setMessage(errors.join(" "), true);
    try {
      const content = kind === "server" ? generateShareServerScript(network) : generateShareClientScript(network);
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = kind === "server" ? "winlab-servidor-pasta-alunos.ps1" : "winlab-conectar-pasta-alunos.ps1";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(kind === "server" ? "Script do servidor gerado. Execute no computador servidor como administrador." : "Script das estações gerado. Execute em cada conta de aluno que usará a pasta.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível gerar o script.", true); }
  }

  async function exportPackage() {
    if (configErrors.length) return setMessage(configErrors.join(" "), true);
    setBusy(true);
    try {
      const files = await buildWinLabPackageFiles(config);
      const url = URL.createObjectURL(createZip(files));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "winlab-configuracao.zip";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Pacote de configuração gerado. As opções preparadas ainda não foram aplicadas no Windows.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao gerar o pacote.", true); }
    finally { setBusy(false); }
  }

  function renderSetting(key: keyof Config, title: string, description: string) {
    const checked = config[key] === true;
    return <div className="wl-setting" key={key}>
      <div><strong>{title}</strong><p>{description}</p></div>
      <Switch label={title} checked={checked} onChange={() => update(key, !checked as Config[typeof key])} />
    </div>;
  }

  return (
    <div className="wl-shell">
      <aside className="wl-side">
        <div className="wl-logo"><span>W</span><div><strong>WinLab</strong><small>Controle do Windows</small></div></div>
        <div className="wl-side-label">MENU PRINCIPAL</div>
        <nav aria-label="Menu principal">
          {links.map((item) => <button type="button" key={item.id} onClick={() => { setSection(item.id); setFeedback(null); }} className={"wl-nav " + (section === item.id ? "current" : "")}><span>{item.symbol}</span>{item.label}</button>)}
        </nav>
        <div className="wl-side-bottom">
          <button type="button" className="wl-advanced" onClick={onAdvanced}>Ferramentas avançadas</button>
          <small>{native ? "Aplicativo Windows" : "Prévia no navegador"}</small>
        </div>
      </aside>

      <div className="wl-main">
        <header className="wl-header">
          <div><span className="wl-overline">PAINEL DO COMPUTADOR</span><h1>{links.find((item) => item.id === section)?.label}</h1></div>
          <div className="wl-head-actions">
            <span className={"wl-state " + (realConnected ? "online" : "offline")}>{realConnected ? "Computador conectado" : !native ? "Versão web" : mode === "Demo" ? "Simulação" : "Aguardando Windows"}</span>
            {native && <button className="wl-button secondary" onClick={() => onRefresh()} disabled={isScanning}>Atualizar</button>}
          </div>
        </header>

        {feedback && <div role={feedback.error ? "alert" : "status"} className={"wl-feedback " + (feedback.error ? "error" : "")}>{feedback.message}</div>}
        {scanError && <div role="alert" className="wl-feedback error">Não foi possível ler este computador: {scanError}</div>}
        {!realConnected && <div className="wl-connect">
          <div><strong>{!native ? "Configure sem instalar nada" : mode === "Demo" ? "Modo de demonstração" : "Sem inventário confirmado"}</strong><p>{!native ? "Escolha suas opções e exporte o pacote para aplicar no Windows. Para alterações diretas, utilize o Desktop ou, futuramente, um agente conectado." : "O modo de demonstração não altera seu computador. Conecte para configurar o Windows real."}</p></div>
          {native ? <button type="button" className="wl-button primary" disabled={isScanning} onClick={() => onChangeMode("Real")}>{isScanning ? "Conectando..." : "Conectar ao Windows"}</button> : <button type="button" className="wl-button secondary" onClick={onAdvanced}>Configuração avançada</button>}
        </div>

        {section === "home" && <>
          <section className="wl-welcome">
            <div><span className="wl-overline">CONFIGURAÇÃO SIMPLIFICADA</span><h2>Seu computador, suas regras.</h2><p>Escolha quais contas podem usar o Windows e configure as restrições sem navegar por menus técnicos.</p></div>
            <button className="wl-button primary" onClick={() => setSection("accounts")}>Configurar usuários</button>
          </section>
          <section className="wl-stats">
            <div><span>Computador</span><strong>{realInventory?.computerName || "Não identificado"}</strong><small>{realInventory?.windows.caption || "Conecte para ver o sistema"}</small></div>
            <div><span>Contas comuns</span><strong>{realInventory ? standardUsers.length : "—"}</strong><small>Sem privilégios administrativos</small></div>
            <div><span>Administradores</span><strong>{realInventory ? adminUsers.length : "—"}</strong><small>Gerenciadores do computador</small></div>
          </section>
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>Configurações principais</h2><p>Atalhos para os ajustes mais usados.</p></div></div>
            <div className="wl-shortcuts">
              <button onClick={() => setSection("accounts")}><strong>Contas e permissões</strong><span>Criar e configurar contas →</span></button>
              <button onClick={() => setSection("apps")}><strong>Instalação de programas</strong><span>Instaladores e Microsoft Store →</span></button>
              <button onClick={() => setSection("internet")}><strong>Acesso à internet</strong><span>Sites e navegadores →</span></button>
              <button onClick={() => setSection("system")}><strong>Restrições do Windows</strong><span>USB, CMD e personalização →</span></button>
              <button onClick={() => setSection("network")}><strong>Pasta compartilhada da escola</strong><span>Conectar as máquinas da rede →</span></button>
            </div>
          </section>
        </>}

        {section === "accounts" && <>
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>Contas deste computador</h2><p>As contas existentes são consultadas diretamente no Windows.</p></div></div>
            {!realInventory ? <p className="wl-muted">Conecte ao Windows para carregar as contas reais.</p> :
              <div className="wl-account-list">{realInventory.localUsers.map((user) => <div className="wl-account" key={user.sid || user.name}><span className="wl-avatar">{user.name.charAt(0).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.enabled ? "Conta ativa" : "Conta desativada"}</small></div><span className={"wl-pill " + (user.isAdmin ? "admin" : "")}>{user.isAdmin ? "Administrador" : "Padrão"}</span></div>)}</div>}
          </section>
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>Contas de referência</h2><p>Escolha quem será restringido e qual conta permanecerá administradora.</p></div></div>
            <div className="wl-fields">
              <label>Conta comum
                <select value={config.studentUser} onChange={(event) => update("studentUser", event.target.value)}>
                  {!standardUsers.some((u) => u.name === config.studentUser) && <option value={config.studentUser}>{config.studentUser} (perfil preparado)</option>}
                  {standardUsers.map((u) => <option key={u.sid || u.name} value={u.name}>{u.name}</option>)}
                </select>
              </label>
              <label>Conta administradora
                <select value={config.adminUser} onChange={(event) => update("adminUser", event.target.value)}>
                  {!adminUsers.some((u) => u.name === config.adminUser) && <option value={config.adminUser}>{config.adminUser} (perfil preparado)</option>}
                  {adminUsers.map((u) => <option key={u.sid || u.name} value={u.name}>{u.name}</option>)}
                </select>
              </label>
            </div>
          </section>
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>Criar conta local</h2><p>A conta será criada no Windows com uma senha definida por você. O Windows pedirá autorização administrativa.</p></div></div>
            <form onSubmit={createAccount} className="wl-account-form">
              <div className="wl-role-choice">
                <button type="button" className={accountRole === "standard" ? "chosen" : ""} onClick={() => setAccountRole("standard")}>Usuário comum<small>Sem permissões administrativas</small></button>
                <button type="button" className={accountRole === "admin" ? "chosen" : ""} onClick={() => setAccountRole("admin")}>Administrador<small>Com permissões administrativas</small></button>
              </div>
              <div className="wl-fields">
                <label>Nome de usuário<input autoComplete="off" value={accountName} maxLength={20} placeholder={accountRole === "admin" ? "AdministradorLab" : "Aluno"} onChange={(event) => setAccountName(event.target.value)} required /></label>
                <label>Senha<input type="password" autoComplete="new-password" value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} required /></label>
                <label>Confirmar senha<input type="password" autoComplete="new-password" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} required /></label>
              </div>
              <p className="wl-muted">A senha não entra no arquivo de configuração. Não é possível criar a conta em modo de simulação.</p>
              <button className="wl-button primary" type="submit" disabled={busy || !realConnected}>{busy ? "Criando conta..." : "Criar conta no Windows"}</button>
            </form>
          </section>
        </>}

        {(section === "apps" || section === "internet" || section === "system") && <>
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>{section === "apps" ? "Instalação e execução" : section === "internet" ? "Navegação e acesso" : "Restrições do sistema"}</h2><p>Estes interruptores editam um perfil exportável. Eles não afirmam que uma regra já está ativa no Windows.</p></div><span className="wl-pill">Perfil preparado</span></div>
            {settings[section].map((item) => renderSetting(item.key, item.title, item.description))}
          </section>
          {section === "internet" && <section className="wl-card"><div className="wl-card-title"><div><h2>Sites bloqueados</h2><p>Adicione um domínio ou endereço por linha. O bloqueio por categorias (adulto, malware etc.) ainda precisa de um mecanismo de filtragem integrado.</p></div></div>
            <label className="wl-full">Endereços a restringir<textarea rows={5} value={sites} placeholder={"exemplo.com\noutrosite.com"} onChange={(event) => setSites(event.target.value)} /></label>
            <button className="wl-button secondary" onClick={() => { setConfig({ ...config, browserUrlMode: "BlockList", blockedUrls: sites.split(/\r?\n/).map((x) => x.trim()).filter(Boolean) }); setMessage("Lista salva no perfil. Exporte o pacote para utilizá-la."); }}>Salvar lista no perfil</button>
          </section>}
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>Políticas aplicáveis diretamente</h2><p>Selecione as alterações abaixo e clique uma única vez em Aplicar alterações. Algumas opções gerais acima ainda precisam do pacote exportado.</p></div><button className="wl-button secondary" disabled={busy || !realConnected} onClick={queryNativePolicies}>Consultar estados</button></div>
            {nativePolicies.filter((p) => (section === "internet" ? p.scope === "machine" : section === "system" ? p.scope === "user" : false)).map((p) =>
              <div className="wl-setting" key={p.id}><div><strong>{p.label}</strong><p>{!policyChecked ? "Estado ainda não consultado" : Object.prototype.hasOwnProperty.call(pendingPolicies, p.id) ? "Alteração selecionada · ainda não aplicada" : policyStates[p.id] ? "Bloqueio aplicado no Windows" : "Não bloqueado"}</p></div><Switch checked={Object.prototype.hasOwnProperty.call(pendingPolicies, p.id) ? pendingPolicies[p.id] : (policyStates[p.id] || false)} label={p.label} onChange={() => stageNativePolicy(p.id)} /></div>
            )}
            {section === "apps" && <p className="wl-muted">Instaladores e Microsoft Store ainda são configurados por pacote. O UAC sozinho não exige senha para toda instalação.</p>}
            {nativePolicies.some((p) => section === "internet" ? p.scope === "machine" : section === "system" ? p.scope === "user" : false) &&
              <div className="wl-apply-row"><span>{Object.keys(pendingPolicies).length} alteração(ões) nativa(s) selecionada(s)</span><button className="wl-button primary" disabled={busy || !realConnected || !policyChecked || Object.keys(pendingPolicies).length === 0} onClick={applyNativeChanges}>{busy ? "Aplicando..." : "Aplicar alterações"}</button></div>}
          </section>
          <section className="wl-export"><div><strong>Salvar e reutilizar configurações</strong><p>Gera scripts e um arquivo de configuração. A exportação não altera o computador.</p></div><button className="wl-button primary" disabled={busy} onClick={exportPackage}>Exportar pacote</button></section>
        </>}

        {section === "network" && <>
          <section className="wl-welcome">
            <div><span className="wl-overline">REDE LOCAL · SMB</span><h2>Uma pasta para todos os alunos.</h2><p>Escolha um computador como servidor. Os outros computadores poderão acessar a mesma pasta pela rede da escola.</p></div>
          </section>
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>Configuração da rede</h2><p>O servidor precisa permanecer ligado e acessível. As máquinas devem estar na mesma rede local e ter credenciais autorizadas para acessar a pasta.</p></div></div>
            <div className="wl-fields">
              <label>Nome do computador servidor<input value={network.server} placeholder="PC-SERVIDOR" onChange={(event) => setNetwork({ ...network, server: event.target.value })} /></label>
              <label>Nome da pasta compartilhada<input value={network.shareName} placeholder="Alunos" onChange={(event) => setNetwork({ ...network, shareName: event.target.value })} /></label>
              <label>Pasta local no servidor<input value={network.rootPath} placeholder={"C:\\WinLab\\Alunos"} onChange={(event) => setNetwork({ ...network, rootPath: event.target.value })} /></label>
              <label>Letra da unidade nos computadores<select value={network.driveLetter} onChange={(event) => setNetwork({ ...network, driveLetter: event.target.value })}>{["Z","Y","X","W","V","U","T","S","R","Q","P","O","N","M","L","K","J","I","H","G","F","E","D"].map((letter) => <option value={letter} key={letter}>{letter}:</option>)}</select></label>
            </div>
            {network.server && <p className="wl-muted">Caminho na rede: \\{network.server}\\{network.shareName} · Unidade {network.driveLetter.toUpperCase()}:</p>}
          </section>
          <section className="wl-card">
            <div className="wl-card-title"><div><h2>Preparar servidor e estações</h2><p>Nesta primeira etapa, o WinLab gera os procedimentos de configuração; não cria ou conecta pastas automaticamente.</p></div></div>
            <div className="wl-network-steps">
              <div><strong>1. Preparar o computador servidor</strong><p>Cria o compartilhamento e permite gravação aos usuários autenticados. Execute apenas na máquina servidora, com autorização administrativa.</p><button className="wl-button secondary" onClick={() => downloadNetworkScript("server")}>Gerar configuração do servidor</button></div>
              <div><strong>2. Conectar os computadores dos alunos</strong><p>Mapeia a pasta compartilhada como unidade de rede. Execute na sessão do usuário que utilizará os arquivos, em cada estação.</p><button className="wl-button primary" onClick={() => downloadNetworkScript("client")}>Gerar configuração das estações</button></div>
            </div>
            <p className="wl-muted">Esta pasta é coletiva: alunos autenticados com acesso poderão consultar e alterar arquivos uns dos outros. Pastas privadas e implantação remota em grupo serão adicionadas com o agente de rede.</p>
          </section>
        </>}

        {section === "diagnostics" && <>
          <section className="wl-card"><div className="wl-card-title"><div><h2>Informações do computador</h2><p>Somente dados confirmados pelo Windows aparecem nesta tela.</p></div></div>
            <div className="wl-diagnostics">
              <div><span>Computador</span><strong>{realInventory?.computerName || "Não identificado"}</strong></div>
              <div><span>Sistema</span><strong>{realInventory?.windows.caption || "Não identificado"}</strong></div>
              <div><span>Processador / arquitetura</span><strong>{realInventory?.windows.architecture || "Não identificado"}</strong></div>
              <div><span>Armazenamento</span><strong>{realInventory?.disks.map((disk) => disk.device + ": " + disk.freeGb + " GB livres").join(", ") || "Não identificado"}</strong></div>
            </div>
          </section>
          <section className="wl-card"><div className="wl-card-title"><div><h2>Ambiente de demonstração</h2><p>Serve para testar menus e fluxos sem modificar contas nem políticas. Não representa o computador físico.</p></div></div>
            {native && <button className="wl-button secondary" onClick={() => onChangeMode(mode === "Demo" ? "Real" : "Demo")}>{mode === "Demo" ? "Voltar ao computador real" : "Entrar em simulação"}</button>}
          </section>
        </>}

        <footer className="wl-footer"><span>WinLab · {native ? "Desktop" : "Web"} · Administração de computadores</span>{native ? <button className="wl-external" onClick={() => window.open("https://winlab-krrozino-s-projects.vercel.app/", "_blank", "noopener,noreferrer")}>Abrir versão web no navegador ↗</button> : <button className="wl-external" onClick={onAdvanced}>Configuração avançada ↗</button>}</footer>
      </div>
    </div>
  );
}
