"use client";

import { useEffect, useState } from "react";
import { IPC_CONSTANTS as IPC, type DetectedAppDto, type IpcResponse } from "./contracts";

type Target = "apps" | "chrome" | "edge" | "usb";

interface BrowserPlan {
  target: "chrome" | "edge";
  blockExtensions: boolean;
  allowedExtensions: string[];
  blockedSites: string[];
  allowedSites: string[];
  restrictSites: boolean;
  blockProfiles: boolean;
}

interface AppPlan {
  target: "apps";
  sid: string;
  apps: string[];
  auditExecutables: boolean;
  auditInstallers: boolean;
  auditPowerShell: boolean;
}

interface UsbPlan {
  target: "usb";
  denyRead: boolean;
  denyExecute: boolean;
}

type Plan = BrowserPlan | AppPlan | UsbPlan;

interface RegistryPolicy {
  policy: string;
  values: { name: string; kind: string; value: unknown }[];
}

interface AppConfiguration {
  selections?: AppPlan[] | null;
  effective: { type: string; mode: string; ruleCount: number }[];
}

interface Status {
  supported: boolean;
  canWrite: boolean;
  state: string;
  detail: string;
  configured: RegistryPolicy[] | AppConfiguration;
  rollbackRevision: string | null;
}

interface Preview {
  revision: string;
  before: unknown;
  after: unknown;
  detail: string;
  requiresAppRestart: boolean;
  requiresRestart: boolean;
}

interface PanelProps {
  target: Target;
  real: boolean;
  sid?: string | null;
  detectedApps?: DetectedAppDto[];
  sendIpc: <T>(action: string, payload?: unknown) => Promise<IpcResponse<T>>;
}

const titles: Record<Target, string> = {
  apps: "Controle de aplicativos",
  chrome: "Google Chrome",
  edge: "Microsoft Edge",
  usb: "Discos removíveis"
};

const states: Record<string, string> = {
  NotConfigured: "Sem configuração local",
  Configured: "Configuração local encontrada",
  AuditOnly: "AuditOnly confirmado pelo Windows",
  Drifted: "Alteração externa detectada",
  RecoveryRequired: "Restauração pendente",
  Inconclusive: "Consulta inconclusiva"
};

const presets = [
  ["chrome", "Google Chrome"], ["edge", "Microsoft Edge"], ["word", "Word"],
  ["excel", "Excel"], ["powerpoint", "PowerPoint"], ["powerbi", "Power BI Desktop"]
];

function initialPlan(target: Target, configured?: Status["configured"], sid?: string | null): Plan {
  if (target === "apps") {
    const saved = !Array.isArray(configured) ? configured?.selections?.find(item => item.sid === sid) : null;
    if (saved) return {
      target, sid: saved.sid, apps: saved.apps, auditExecutables: saved.auditExecutables,
      auditInstallers: saved.auditInstallers, auditPowerShell: saved.auditPowerShell
    };
    return { target, sid: sid ?? "", apps: [], auditExecutables: true, auditInstallers: true, auditPowerShell: false };
  }
  const values = (name: string) => Array.isArray(configured)
    ? configured.find(policy => policy.policy.split(", ").includes(name))?.values ?? []
    : [];
  const strings = (name: string) => values(name)
    .filter(item => item.kind === "String" && typeof item.value === "string")
    .sort((a, b) => Number(a.name) - Number(b.name))
    .map(item => item.value as string);
  if (target === "usb") {
    return {
      target,
      denyRead: values("Deny_Read").some(item => item.name.toLowerCase() === "deny_read" && item.value === 1),
      denyExecute: values("Deny_Execute").some(item => item.name.toLowerCase() === "deny_execute" && item.value === 1)
    };
  }
  const blocked = strings("URLBlocklist");
  const restrictSites = blocked.includes("*");
  return {
    target, restrictSites,
    blockExtensions: strings("ExtensionInstallBlocklist").includes("*"),
    allowedExtensions: strings("ExtensionInstallAllowlist"),
    blockedSites: restrictSites ? [] : blocked,
    allowedSites: strings("URLAllowlist"),
    blockProfiles: values(target === "chrome" ? "BrowserAddPersonEnabled" : "BrowserAddProfileEnabled")
      .some(item => item.kind === "DWord" && item.value === 0)
  };
}

function readable(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function PolicyValues({ data }: { data: unknown }) {
  if (Array.isArray(data)) {
    if (data.length === 0) return <p className="wl-muted">Sem entradas.</p>;
    return (
      <ul className="wl-expansion-values">
        {data.map((entry: RegistryPolicy | { type: string; mode: string; ruleCount: number }) =>
          "policy" in entry ? (
            <li key={entry.policy}>
              <strong>{entry.policy}</strong>
              <span>{entry.values.map(value => readable(value.value)).join(", ") || "Sem valores"}</span>
            </li>
          ) : (
            <li key={entry.type}><strong>{entry.type}</strong><span>{entry.mode}, {entry.ruleCount} regras</span></li>
          )
        )}
      </ul>
    );
  }

  const audit = data as {
    collections: AppConfiguration["effective"];
    accounts: { sid: string; presetPaths: string[]; auditsPortableExecutables: boolean;
      auditsMsiMspMst: boolean; auditsPowerShell: boolean }[];
  };
  return (
    <div className="wl-expansion-values">
      <PolicyValues data={audit.collections} />
      {audit.accounts.map(account => <div key={account.sid} className="wl-expansion-values">
        <strong>{account.sid}</strong>
        {account.presetPaths.length > 0 && <ul>{account.presetPaths.map(path => <li key={path}>{path}</li>)}</ul>}
        {account.auditsPortableExecutables && <span>Executáveis, inclusive portáteis e instaladores .exe</span>}
        {account.auditsMsiMspMst && <span>Pacotes .msi, .msp e .mst</span>}
        {account.auditsPowerShell && <span>Executáveis do PowerShell auditados para esta conta</span>}
      </div>)}
    </div>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="wl-expansion-switch"><input type="checkbox" role="switch" checked={checked}
    onChange={event => onChange(event.target.checked)} />{label}</label>;
}

function BrowserEditor({ plan, setPlan, disabled }: {
  plan: BrowserPlan; setPlan: (plan: BrowserPlan) => void; disabled: boolean;
}) {
  const [lists, setLists] = useState(() => ({
    allowedExtensions: plan.allowedExtensions.join("\n"),
    blockedSites: plan.blockedSites.join("\n"),
    allowedSites: plan.allowedSites.join("\n")
  }));

  const edit = (key: keyof typeof lists, text: string) => {
    setLists({ ...lists, [key]: text });
    setPlan({ ...plan, [key]: text.split("\n").map(value => value.trim()).filter(Boolean) });
  };

  return (
    <fieldset className="wl-expansion-editor" disabled={disabled}>
      <Switch label="Bloquear instalação de extensões" checked={plan.blockExtensions}
        onChange={blockExtensions => setPlan({ ...plan, blockExtensions })} />
      <label>IDs das extensões permitidas
        <textarea rows={2} value={lists.allowedExtensions} onChange={event => edit("allowedExtensions", event.target.value)} />
      </label>
      <Switch label="Permitir navegação somente nos sites da lista" checked={plan.restrictSites}
        onChange={restrictSites => setPlan({ ...plan, restrictSites })} />
      {!plan.restrictSites && <label>Sites bloqueados
        <textarea rows={2} value={lists.blockedSites} onChange={event => edit("blockedSites", event.target.value)} />
      </label>}
      <label>Sites permitidos
        <textarea rows={2} value={lists.allowedSites} onChange={event => edit("allowedSites", event.target.value)} />
      </label>
      <small>Um item por linha. Use o ID de 32 letras da extensão e endereços como escola.example ou https://escola.example/aulas.</small>
      <Switch label="Ocultar criação de perfis pela interface do navegador" checked={plan.blockProfiles}
        onChange={blockProfiles => setPlan({ ...plan, blockProfiles })} />
    </fieldset>
  );
}

function AppEditor({ plan, setPlan, detectedApps, disabled }: {
  plan: AppPlan; setPlan: (plan: AppPlan) => void; detectedApps: DetectedAppDto[]; disabled: boolean;
}) {
  return (
    <fieldset className="wl-expansion-editor" disabled={disabled}>
      <Switch label="Auditar executáveis e instaladores .exe fora da lista" checked={plan.auditExecutables}
        onChange={auditExecutables => setPlan({ ...plan, auditExecutables, auditPowerShell: auditExecutables && plan.auditPowerShell })} />
      {plan.auditExecutables && <div className="wl-expansion-presets" role="group" aria-label="Aplicativos autorizados">
        {presets.map(([id, name]) => {
          const detected = detectedApps.some(app => app.id === id && app.detected);
          return (
            <label className="wl-expansion-switch" key={id}>
              <input type="checkbox" checked={plan.apps.includes(id)} disabled={!detected && !plan.apps.includes(id)}
                onChange={event => setPlan({ ...plan, apps: event.target.checked ? [...plan.apps, id] : plan.apps.filter(app => app !== id) })} />
              {name}{!detected && <small>Não detectado</small>}
            </label>
          );
        })}
      </div>}
      <Switch label="Auditar pacotes do Windows Installer" checked={plan.auditInstallers}
        onChange={auditInstallers => setPlan({ ...plan, auditInstallers })} />
      {plan.auditExecutables && <Switch label="Auditar execução do PowerShell para esta conta" checked={plan.auditPowerShell}
        onChange={auditPowerShell => setPlan({ ...plan, auditPowerShell })} />}
      <small>A auditoria de executáveis e pacotes é independente da elevação UAC. A fase AuditOnly registra eventos e mantém a execução permitida.</small>
    </fieldset>
  );
}

export function PolicyExpansionPanel({ target, real, sid, detectedApps = [], sendIpc }: PanelProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [plan, setPlan] = useState<Plan>(() => initialPlan(target, undefined, sid));
  const [preview, setPreview] = useState<{ plan: Plan; result: Preview } | null>(null);
  const [reload, setReload] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!real) return;
    let active = true;
    void sendIpc<Status>(IPC.ACTION_EXPANSION_QUERY, { target }).then(response => {
      if (!active) return;
      if (!response.success || !response.data) {
        setError(response.error ?? "Falha na consulta ao Windows.");
        return;
      }
      setStatus(response.data);
      setPlan(initialPlan(target, response.data.configured, sid));
      setEditorVersion(version => version + 1);
    }).catch(() => { if (active) setError("Falha na consulta ao Windows."); });
    return () => { active = false; };
  }, [real, target, sid, reload, sendIpc]);

  const updatePlan = (next: Plan) => {
    setPlan(next);
    setPreview(null);
  };

  async function perform<T>(action: string, payload: unknown, onSuccess: (result: T) => void) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await sendIpc<T>(action, payload);
      if (!response.success || !response.data) {
        setError(response.error ?? "Falha na operação.");
        if (action !== IPC.ACTION_EXPANSION_PREVIEW) setReload(value => value + 1);
      } else {
        onSuccess(response.data);
      }
    } catch {
      setError("O Windows não confirmou a operação. Atualize a consulta.");
      if (action !== IPC.ACTION_EXPANSION_PREVIEW) setReload(value => value + 1);
    } finally {
      setBusy(false);
    }
  }

  const editDisabled = busy || !status?.supported || !status.canWrite || status.state === "RecoveryRequired";
  const effective = status?.configured;
  const shown = Array.isArray(effective) ? effective : effective?.effective;
  const scopeTag = target === "apps" ? "Por usuário + regras na máquina" : "Máquina inteira (todas as contas)";
  const compatTag =
    target === "apps"
      ? "Windows 10/11 · AppLocker (AuditOnly)"
      : target === "usb"
        ? "Windows 10/11 · Discos removíveis"
        : `${target === "chrome" ? "Google Chrome" : "Microsoft Edge"} · Windows 10/11`;
  const restartTag =
    target === "apps"
      ? "Auditoria imediata"
      : target === "usb"
        ? "Requer reiniciar o Windows / reconectar USB"
        : "Requer reiniciar o navegador";

  return (
    <div className="wl-card">
      <div className="wl-card-title">
        <div>
          <div className="wl-setting-header" style={{ marginBottom: 6 }}>
            <h2>{titles[target]}</h2>
            <span className="wl-scope-tag">{scopeTag}</span>
            <span className="wl-scope-tag">{compatTag}</span>
            <span className="wl-scope-tag">{restartTag}</span>
          </div>
          {real ? (
            <p>
              {target === "apps"
                ? "Auditoria AppLocker por conta local (somente AuditOnly — registra eventos sem bloquear abertura). As coleções são instaladas na máquina."
                : "Política de toda a máquina, inclusive para contas administrativas. Todas as alterações passam por prévia antes de confirmar."}
            </p>
          ) : (
            <p>
              Estrutura real de políticas estendidas do Windows. Em Modo Demonstração ou Web, a consulta e aplicação ao vivo ficam indisponíveis para evitar simulação enganosa.
            </p>
          )}
        </div>
      </div>
      {!real ? (
        <div className="wl-notice-box info">
          <strong>Indisponível no Modo Demonstração / Web:</strong> Conecte ao <strong>Computador Real</strong> no aplicativo WinLab Desktop instalado no Windows para consultar e revisar esta configuração avançada.
        </div>
      ) : (
        <>
          {error && <p role="alert" className="wl-feedback error">{error}</p>}
          {message && <p role="status" className="wl-feedback">{message}</p>}
          {!status && !error && (
            <div className="wl-skeleton-stack" aria-label="Consultando configuração no Windows">
              <div className="wl-skeleton wl-skeleton-line" />
              <div className="wl-skeleton wl-skeleton-line short" />
            </div>
          )}
          {status && (
            <div className="wl-expansion-status">
              <strong>{states[status.state] ?? status.state}</strong>
              <span>{status.detail}</span>
              {!status.supported && <span>Alterações indisponíveis neste ambiente.</span>}
              {!status.canWrite && <span>Somente leitura. Use a instalação por máquina em Program Files com uma conta administrativa.</span>}
              {(shown?.length ?? 0) > 0 && (
                <details className="wl-setting-details">
                  <summary>Detalhes técnicos encontrados no sistema</summary>
                  <div>
                    <PolicyValues data={shown} />
                  </div>
                </details>
              )}
            </div>
          )}
          {plan.target === "apps" && <AppEditor plan={plan} setPlan={updatePlan} detectedApps={detectedApps} disabled={editDisabled || !sid} />}
          {plan.target === "usb" && <fieldset className="wl-expansion-editor" disabled={editDisabled}>
            <Switch label="Bloquear leitura de discos removíveis" checked={plan.denyRead}
              onChange={denyRead => updatePlan({ ...plan, denyRead })} />
            <Switch label="Bloquear execução em discos removíveis" checked={plan.denyExecute}
              onChange={denyExecute => updatePlan({ ...plan, denyExecute })} />
          </fieldset>}
          {(plan.target === "chrome" || plan.target === "edge") &&
            <BrowserEditor key={editorVersion} plan={plan} setPlan={updatePlan} disabled={editDisabled} />}
          <div className="wl-expansion-actions">
            <button type="button" className="wl-button secondary" disabled={busy} onClick={() => {
              setPreview(null);
              setError("");
              setReload(value => value + 1);
            }}>Consultar Windows</button>
            <button type="button" className="wl-button primary" disabled={editDisabled || (target === "apps" && !sid)}
              onClick={() => {
                const draft = plan.target === "chrome" || plan.target === "edge"
                  ? { ...plan, blockedSites: plan.restrictSites ? [] : plan.blockedSites } : plan;
                setPreview(null);
                void perform<Preview>(IPC.ACTION_EXPANSION_PREVIEW, draft, result => setPreview({ plan: draft, result }));
              }}>Revisar alterações</button>
            {status?.rollbackRevision && <button type="button" className="wl-button secondary" disabled={busy || !status.canWrite}
              onClick={() => {
                if (!window.confirm(target === "apps" ? "Restaurar a linha de base AppLocker desta máquina? Isso remove a auditoria WinLab de todas as contas."
                  : "Restaurar a configuração anterior registrada nesta máquina?")) return;
                setPreview(null);
                void perform<Status>(IPC.ACTION_EXPANSION_ROLLBACK, { target, revision: status.rollbackRevision }, () => {
                  setMessage("Restauração confirmada na releitura do Windows.");
                  setReload(value => value + 1);
                });
              }}>Restaurar configuração anterior</button>}
          </div>
          {preview && <div className="wl-expansion-preview" role="region" aria-label="Prévia da alteração estruturada">
            <h3>Prévia: confirmar alterações</h3>
            <p>{preview.result.detail}</p>
            <div className="wl-notice-box warning">
              <strong>Impacto administrativo:</strong> {target === "apps" ? "Atualiza a política AppLocker AuditOnly desta máquina." : "Modifica chaves de máquina (HKLM) e solicita elevação UAC."}
            </div>
            {preview.result.requiresAppRestart && <p>Compatibilidade e reinício: feche e reabra o navegador para verificar o efeito.</p>}
            {preview.result.requiresRestart && <p>Compatibilidade e reinício: reinicie o Windows e reconecte o dispositivo para verificar o efeito.</p>}
            <div className="wl-expansion-diff">
              <div className="wl-diff-card"><strong>Antes (Configuração anterior)</strong><PolicyValues data={preview.result.before} /></div>
              <div className="wl-diff-card"><strong>Depois (Configuração prevista)</strong><PolicyValues data={preview.result.after} /></div>
            </div>
            <div className="wl-expansion-actions">
              <button type="button" className="wl-button secondary" disabled={busy} onClick={() => setPreview(null)}>Cancelar</button>
              <button type="button" className="wl-button primary" disabled={busy} onClick={() => {
                const { plan: reviewed, result } = preview;
                setPreview(null);
                void perform<Status>(IPC.ACTION_EXPANSION_APPLY, { plan: reviewed, revision: result.revision }, current => {
                  setMessage(target === "apps"
                    ? current.state === "AuditOnly" ? "Política efetiva confirmada em AuditOnly." : "Linha de base AppLocker confirmada."
                    : "Configuração confirmada no registro do Windows. Verifique o efeito após o reinício indicado.");
                  setStatus(current);
                  setReload(value => value + 1);
                });
              }}>Confirmar e aplicar</button>
            </div>
          </div>}
        </>
      )}
    </div>
  );
}

export function BrowserExpansion({ real, sendIpc }: Pick<PanelProps, "real" | "sendIpc">) {
  const [target, setTarget] = useState<"chrome" | "edge">("chrome");
  return <>
    <label className="wl-expansion-browser">
      Navegador <select value={target} onChange={event => setTarget(event.target.value as "chrome" | "edge")}>
        <option value="chrome">Google Chrome</option><option value="edge">Microsoft Edge</option>
      </select>
    </label>
    <PolicyExpansionPanel key={target} target={target} real={real} sendIpc={sendIpc} />
  </>;
}
