"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { APP_CATALOG } from "@/lib/apps";
import { parseConfigJson, serializeConfig } from "@/lib/config-io";
import { generateSetupScript } from "@/lib/generator";
import {
  DEFAULT_NETWORK_SHARE,
  NetworkShareModel,
  NetworkSharePlan,
  generateShareClientScript,
  generateShareDiagnosticsScript,
  generateShareServerScript,
  validateNetworkShare
} from "@/lib/network-share";
import { buildWinLabPackageFiles, getBasePackageFiles, PackageFile } from "@/lib/package-integrity";
import { getPreset, presets } from "@/lib/presets";
import { getConfigReview } from "@/lib/review";
import { AllowedAppId, BrowserUrlMode, Config, EnforcementMode, PresetId, ProfileCleanupMode } from "@/lib/types";
import { getConfigErrors } from "@/lib/validation";
import { createZip } from "@/lib/zip";

interface WebPackageWizardProps {
  config: Config;
  setConfig: (config: Config) => void;
}

const WIZARD_STEPS = [
  { number: 1, title: "Ambiente e perfil", summary: "Escolha o cenário da sala ou estação" },
  { number: 2, title: "Contas locais", summary: "Conta comum de uso e conta de Administrador" },
  { number: 3, title: "Aplicativos", summary: "Programas liberados e controle de instalação" },
  { number: 4, title: "Internet e navegadores", summary: "Chrome, Edge e filtro de sites" },
  { number: 5, title: "Sistema e USB", summary: "Área de trabalho, ferramentas administrativas e pendrives" },
  { number: 6, title: "Rede e pasta SMB", summary: "Pasta coletiva ou pastas privadas por aluno" },
  { number: 7, title: "Revisão de impacto", summary: "Validação de segurança antes de gerar" },
  { number: 8, title: "Gerar pacote ZIP", summary: "Baixar pacote auditável com Configurar-Computador.cmd" }
] as const;

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function WebPackageWizard({ config, setConfig }: WebPackageWizardProps) {
  const [step, setStep] = useState<number>(1);
  const [activePreset, setActivePreset] = useState<PresetId | null>("microlins");
  const [includeNetworkInZip, setIncludeNetworkInZip] = useState<boolean>(false);
  const [networkPlan, setNetworkPlan] = useState<NetworkSharePlan>({
    ...DEFAULT_NETWORK_SHARE,
    studentAccounts: [config.studentUser || "Aluno"]
  });
  const [studentAccountsInput, setStudentAccountsInput] = useState<string>(config.studentUser || "Aluno");
  const [customPathInput, setCustomPathInput] = useState<string>("");
  const [urlInput, setUrlInput] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [showScriptPreview, setShowScriptPreview] = useState<boolean>(false);

  const configErrors = useMemo(() => getConfigErrors(config), [config]);
  const reviewItems = useMemo(() => getConfigReview(config), [config]);

  const effectiveNetworkPlan: NetworkSharePlan = useMemo(() => {
    const parsedAccounts = studentAccountsInput
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      ...networkPlan,
      studentAccounts: parsedAccounts.length > 0 ? parsedAccounts : [config.studentUser || "Aluno"]
    };
  }, [networkPlan, studentAccountsInput, config.studentUser]);

  const networkErrors = useMemo(
    () => (includeNetworkInZip ? validateNetworkShare(effectiveNetworkPlan) : []),
    [includeNetworkInZip, effectiveNetworkPlan]
  );

  const allBlockingErrors = useMemo(
    () => [...configErrors.map((e) => e.message), ...networkErrors],
    [configErrors, networkErrors]
  );

  const previewSetupScript = useMemo(() => generateSetupScript(config), [config]);
  const basePackageFiles = useMemo(() => getBasePackageFiles(config), [config]);

  function updateField<K extends keyof Config>(key: K, value: Config[K]) {
    setActivePreset(null);
    setConfig({ ...config, [key]: value });
  }

  function handleSelectPreset(id: PresetId) {
    const presetCfg = getPreset(id);
    setActivePreset(id);
    setConfig(presetCfg);
    setStudentAccountsInput(presetCfg.studentUser);
    setStatusMessage({
      tone: "success",
      text: `Perfil base "${presetCfg.profileName}" aplicado ao assistente.`
    });
  }

  function toggleAllowedApp(appId: AllowedAppId) {
    const exists = config.allowedApps.includes(appId);
    updateField(
      "allowedApps",
      exists ? config.allowedApps.filter((a) => a !== appId) : [...config.allowedApps, appId]
    );
  }

  function addCustomAllowedPath() {
    const trimmed = customPathInput.trim();
    if (!trimmed) return;
    if (!config.customAllowedPaths.includes(trimmed)) {
      updateField("customAllowedPaths", [...config.customAllowedPaths, trimmed]);
    }
    setCustomPathInput("");
  }

  function addUrlEntry() {
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (config.browserUrlMode === "AllowListOnly") {
      if (!config.allowedUrls.includes(trimmed)) {
        updateField("allowedUrls", [...config.allowedUrls, trimmed]);
      }
    } else {
      if (!config.blockedUrls.includes(trimmed)) {
        updateField("blockedUrls", [...config.blockedUrls, trimmed]);
      }
    }
    setUrlInput("");
  }

  async function handleImportJson(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = parseConfigJson(await file.text());
      setConfig(parsed);
      setActivePreset(null);
      setStudentAccountsInput(parsed.studentUser);
      setStatusMessage({ tone: "success", text: `Configuração "${parsed.profileName}" importada com sucesso.` });
    } catch (err) {
      setStatusMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "Falha ao importar config.json."
      });
    }
  }

  function handleExportJson() {
    const slug = config.profileName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "winlab";
    downloadBlob(
      `winlab-config-${slug}.json`,
      new Blob([serializeConfig(config)], { type: "application/json;charset=utf-8" })
    );
  }

  async function handleGenerateZip() {
    if (allBlockingErrors.length > 0) {
      setStatusMessage({
        tone: "error",
        text: "Corrija os itens pendentes na revisão antes de gerar o pacote ZIP."
      });
      setStep(7);
      return;
    }

    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const extraFiles: PackageFile[] = [];
      if (includeNetworkInZip) {
        extraFiles.push(
          { name: "servidor-pasta-smb.ps1", content: generateShareServerScript(effectiveNetworkPlan) },
          { name: "estacao-mapear-smb.ps1", content: generateShareClientScript(effectiveNetworkPlan) },
          { name: "testar-rede-smb.ps1", content: generateShareDiagnosticsScript(effectiveNetworkPlan) }
        );
      }

      const files = await buildWinLabPackageFiles(config, { extraFiles });
      const zipBlob = createZip(files);
      const slug = config.profileName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "laboratorio";
      downloadBlob(`winlab-pos-formatacao-${slug}.zip`, zipBlob);
      setStatusMessage({
        tone: "success",
        text: `Pacote pós-formatação gerado com ${files.length} arquivos verificados por SHA-256! Copie para um pendrive e execute Configurar-Computador.cmd na máquina Windows.`
      });
    } catch (err) {
      setStatusMessage({
        tone: "error",
        text: err instanceof Error ? err.message : "Erro ao gerar o pacote pós-formatação."
      });
    } finally {
      setIsGenerating(false);
    }
  }

  const appEntries = Object.entries(APP_CATALOG) as Array<[AllowedAppId, (typeof APP_CATALOG)[AllowedAppId]]>;

  return (
    <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px 84px" }}>
      {/* Cabeçalho institucional diferenciando WinLab Web vs WinLab Desktop */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 18,
          paddingBottom: 22,
          borderBottom: "1px solid var(--border)",
          marginBottom: 24
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span
              style={{
                background: "var(--accent)",
                color: "#111",
                fontWeight: 800,
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 999,
                letterSpacing: "0.06em"
              }}
            >
              WINLAB WEB
            </span>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>
              Configurador Pós-Formatação para Windows 10 e Windows 11
            </span>
          </div>
          <h1 style={{ fontSize: "clamp(24px, 3.5vw, 34px)", margin: "0 0 8px", lineHeight: 1.15 }}>
            Prepare computadores recém-formatados sem repetir trabalho manual
          </h1>
          <p style={{ color: "var(--muted)", margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            Monte o perfil da escola, laboratório ou escritório em 8 etapas simples e baixe um pacote{" "}
            <code>.zip</code> auditável com <code>Configurar-Computador.cmd</code>, verificação de integridade SHA-256 e reversão segura.
            Nenhuma senha é salva no navegador ou dentro do arquivo gerado.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link href="/configurador" className="secondary" style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13, textDecoration: "none", border: "1px solid var(--border)" }}>
            Modo técnico avançado
          </Link>
          <Link href="/desktop" className="secondary" style={{ padding: "9px 14px", borderRadius: 8, fontSize: 13, textDecoration: "none", border: "1px solid var(--border)" }}>
            Conhecer WinLab Desktop (Painel Local)
          </Link>
        </div>
      </header>

      {/* Guia rápido: Web vs Desktop */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
          marginBottom: 24
        }}
      >
        <div className="panel" style={{ padding: "14px 18px", margin: 0 }}>
          <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
            Quando usar este WinLab Web (.zip)?
          </strong>
          <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
            Ideal logo após formatar uma bancada de máquinas: você gera um único pacote no navegador, leva no pendrive e aplica o padrão completo em cada estação.
          </span>
        </div>
        <div className="panel" style={{ padding: "14px 18px", margin: 0 }}>
          <strong style={{ display: "block", fontSize: 14, marginBottom: 4 }}>
            Quando usar o WinLab Desktop (.exe)?
          </strong>
          <span style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
            Ideal na rotina diária da máquina já instalada: lê o estado real do Windows sem abrir prompts desnecessários, alterna políticas por conta comum e desfaz mudanças em um clique.
          </span>
        </div>
      </section>

      {statusMessage && (
        <div
          role="status"
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            marginBottom: 20,
            border: `1px solid ${statusMessage.tone === "error" ? "#ef6461" : "#36c986"}`,
            background: statusMessage.tone === "error" ? "rgba(239, 100, 97, 0.12)" : "rgba(54, 201, 134, 0.12)",
            fontSize: 13.5
          }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* Barra de etapas (1 a 8) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr)",
          gap: 22,
          alignItems: "start"
        }}
      >
        <nav
          aria-label="Etapas do configurador pós-formatação"
          className="panel"
          style={{ padding: 12, margin: 0, display: "grid", gap: 6 }}
        >
          {WIZARD_STEPS.map((item) => {
            const isCurrent = step === item.number;
            return (
              <button
                key={item.number}
                type="button"
                onClick={() => setStep(item.number)}
                style={{
                  textAlign: "left",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: isCurrent ? "1px solid var(--accent)" : "1px solid transparent",
                  background: isCurrent ? "rgba(255, 139, 56, 0.14)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer"
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {item.number}. {item.title}
                </div>
                <small style={{ color: "var(--muted)", fontSize: 11.5, display: "block", marginTop: 2 }}>
                  {item.summary}
                </small>
              </button>
            );
          })}
        </nav>

        <section className="panel" style={{ margin: 0, padding: 24 }}>
          {/* ETAPA 1: AMBIENTE E PERFIL */}
          {step === 1 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>1. Ambiente e perfil base</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  Comece escolhendo o modelo mais próximo da sua sala de aula ou estação compartilhada. Você poderá personalizar qualquer regra nas próximas etapas.
                </p>
              </div>

              <div className="presetBar">
                {presets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`preset ${activePreset === preset.id ? "active" : ""}`}
                    onClick={() => handleSelectPreset(preset.id)}
                  >
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>Nome identificador deste perfil</span>
                  <input
                    type="text"
                    value={config.profileName}
                    onChange={(e) => updateField("profileName", e.target.value)}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>Modo do controle de aplicativos (AppLocker)</span>
                  <select
                    value={config.enforcementMode}
                    onChange={(e) => updateField("enforcementMode", e.target.value as EnforcementMode)}
                  >
                    <option value="AuditOnly">Auditoria segura (Recomendado na 1ª máquina piloto)</option>
                    <option value="Enabled">Bloqueio ativo (Após validar todos os programas da aula)</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* ETAPA 2: CONTAS LOCAIS */}
          {step === 2 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>2. Contas locais do Windows</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  O WinLab separa estritamente a conta restrita (usada por alunos ou operadores) da conta de Administrador (que mantém controle total da máquina).
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>Nome da conta comum (restrita)</span>
                  <input
                    type="text"
                    maxLength={20}
                    value={config.studentUser}
                    onChange={(e) => updateField("studentUser", e.target.value)}
                  />
                </label>

                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>Nome da conta de Administrador (protegida)</span>
                  <input
                    type="text"
                    maxLength={20}
                    value={config.adminUser}
                    onChange={(e) => updateField("adminUser", e.target.value)}
                  />
                </label>
              </div>

              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={config.createAccounts}
                  onChange={(e) => updateField("createAccounts", e.target.checked)}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>Criar contas automaticamente se ainda não existirem no Windows</strong>
                  <small style={{ display: "block", color: "var(--muted)", marginTop: 3 }}>
                    Por segurança, nenhuma senha é digitada aqui. Durante a execução de <code>Configurar-Computador.cmd</code>, o PowerShell solicitará a senha diretamente no computador alvo.
                  </small>
                </span>
              </label>
            </div>
          )}

          {/* ETAPA 3: APLICATIVOS */}
          {step === 3 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>3. Aplicativos autorizados na estação</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  Marque os softwares pedagógicos ou corporativos utilizados na rotina e defina o bloqueio de instaladores avulsos.
                </p>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
                {appEntries.map(([appId, info]) => {
                  const checked = config.allowedApps.includes(appId);
                  return (
                    <label
                      key={appId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 12px",
                        borderRadius: 8,
                        border: checked ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: "var(--panel-2)",
                        cursor: "pointer",
                        fontSize: 13
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAllowedApp(appId)}
                      />
                      <div>
                        <strong style={{ display: "block" }}>{info.label}</strong>
                        <small style={{ color: "var(--muted)" }}>{info.category}</small>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockInstallers}
                    onChange={(e) => updateField("blockInstallers", e.target.checked)}
                  />
                  <span>Bloquear execução de instaladores avulsos na conta comum</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockStoreApps}
                    onChange={(e) => updateField("blockStoreApps", e.target.checked)}
                  />
                  <span>Bloquear instalação de jogos e aplicativos pela Microsoft Store</span>
                </label>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Caminhos adicionais permitidos (opcional)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Ex.: C:\Program Files\MeuSistema\app.exe"
                    value={customPathInput}
                    onChange={(e) => setCustomPathInput(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button type="button" className="secondary" onClick={addCustomAllowedPath}>
                    Adicionar
                  </button>
                </div>
                {config.customAllowedPaths.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {config.customAllowedPaths.map((p) => (
                      <span
                        key={p}
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          background: "var(--panel-2)",
                          border: "1px solid var(--border)",
                          fontSize: 12
                        }}
                      >
                        {p}{" "}
                        <button
                          type="button"
                          onClick={() =>
                            updateField(
                              "customAllowedPaths",
                              config.customAllowedPaths.filter((item) => item !== p)
                            )
                          }
                          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ETAPA 4: INTERNET E NAVEGADORES */}
          {step === 4 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>4. Internet e navegadores (Chrome e Edge)</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  Evite senhas salvas em máquinas públicas, desative janelas anônimas e configure filtros de sites quando necessário.
                </p>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockChromeIncognito}
                    onChange={(e) => updateField("blockChromeIncognito", e.target.checked)}
                  />
                  <span>Bloquear aba anônima (Chrome) e janela InPrivate (Edge)</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockChromeGuest}
                    onChange={(e) => updateField("blockChromeGuest", e.target.checked)}
                  />
                  <span>Bloquear modo visitante / convidado nos navegadores</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockChromePasswordManager}
                    onChange={(e) => updateField("blockChromePasswordManager", e.target.checked)}
                  />
                  <span>Impedir salvamento de senhas nos navegadores compartilhados</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockChromeExtensions}
                    onChange={(e) => updateField("blockChromeExtensions", e.target.checked)}
                  />
                  <span>Bloquear instalação manual de extensões</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockChromeNewProfiles}
                    onChange={(e) => updateField("blockChromeNewProfiles", e.target.checked)}
                  />
                  <span>Impedir criação de novos perfis paralelos no navegador</span>
                </label>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>Modo de controle de endereços web (URLs)</span>
                  <select
                    value={config.browserUrlMode}
                    onChange={(e) => updateField("browserUrlMode", e.target.value as BrowserUrlMode)}
                  >
                    <option value="Unrestricted">Acesso livre à web</option>
                    <option value="BlockList">Bloquear sites específicos da lista</option>
                    <option value="AllowListOnly">Permitir somente sites autorizados (Modo restrito / prova)</option>
                  </select>
                </label>

                {config.browserUrlMode !== "Unrestricted" && (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Ex.: redesocial.com ou portal.escola.edu.br"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        style={{ flex: 1 }}
                      />
                      <button type="button" className="secondary" onClick={addUrlEntry}>
                        Adicionar domínio
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ETAPA 5: SISTEMA E USB */}
          {step === 5 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>5. Sistema Windows, personalização e USB</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  Proteja configurações visuais e ferramentas administrativas apenas para a conta comum, mantendo teclado e mouse USB intactos.
                </p>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockWallpaper}
                    onChange={(e) => updateField("blockWallpaper", e.target.checked)}
                  />
                  <span>Fixar papel de parede (impede troca pela conta comum)</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockMousePointers}
                    onChange={(e) => updateField("blockMousePointers", e.target.checked)}
                  />
                  <span>Bloquear alteração de ponteiros do mouse</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockSoundScheme}
                    onChange={(e) => updateField("blockSoundScheme", e.target.checked)}
                  />
                  <span>Bloquear alteração de esquema de sons</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockCmd}
                    onChange={(e) => updateField("blockCmd", e.target.checked)}
                  />
                  <span>Bloquear abertura do Prompt de Comando (CMD) pela conta comum</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockPowerShell}
                    onChange={(e) => updateField("blockPowerShell", e.target.checked)}
                  />
                  <span>Bloquear execução direta do PowerShell pela conta comum</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockRegedit}
                    onChange={(e) => updateField("blockRegedit", e.target.checked)}
                  />
                  <span>Bloquear Editor do Registro (Regedit) para a conta comum</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockUsbWrite}
                    onChange={(e) => updateField("blockUsbWrite", e.target.checked)}
                  />
                  <span>Bloquear gravação de arquivos em pendrives USB (mantém leitura, teclado e mouse)</span>
                </label>
                <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                  <input
                    type="checkbox"
                    checked={config.blockUsbExecute}
                    onChange={(e) => updateField("blockUsbExecute", e.target.checked)}
                  />
                  <span>Bloquear execução de programas direto do pendrive USB</span>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
                <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                  <span>Manutenção de perfis antigos no disco</span>
                  <select
                    value={config.profileCleanupMode}
                    onChange={(e) => updateField("profileCleanupMode", e.target.value as ProfileCleanupMode)}
                  >
                    <option value="Off">Desativada</option>
                    <option value="ReportOnly">Somente relatório de espaço</option>
                    <option value="Delete">Permitir limpeza de perfis inativos (exige -Apply)</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {/* ETAPA 6: REDE E PASTA COMPARTILHADA SMB */}
          {step === 6 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>6. Rede local e pasta compartilhada (SMB)</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  Opcionalmente, inclua no pacote os scripts verificados para criar a pasta no computador servidor e mapear a unidade nas estações — sem ativar SMB1 nem acesso anônimo.
                </p>
              </div>

              <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={includeNetworkInZip}
                  onChange={(e) => setIncludeNetworkInZip(e.target.checked)}
                />
                <strong>Incluir scripts de pasta compartilhada na rede local dentro deste pacote ZIP</strong>
              </label>

              {includeNetworkInZip && (
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: 12 }}>
                    <button
                      type="button"
                      onClick={() => setNetworkPlan({ ...networkPlan, model: "collective" as NetworkShareModel })}
                      style={{
                        textAlign: "left",
                        padding: 14,
                        borderRadius: 10,
                        border:
                          (networkPlan.model ?? "collective") === "collective"
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border)",
                        background: "var(--panel-2)",
                        color: "var(--text)",
                        cursor: "pointer"
                      }}
                    >
                      <strong style={{ display: "block", marginBottom: 4 }}>
                        Modelo A — Pasta coletiva da turma
                      </strong>
                      <small style={{ color: "var(--muted)" }}>
                        Todos os alunos autenticados acessam a mesma unidade compartilhada (ideal para entrega de exercícios simples e apostilas).
                      </small>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNetworkPlan({ ...networkPlan, model: "per_student" as NetworkShareModel })}
                      style={{
                        textAlign: "left",
                        padding: 14,
                        borderRadius: 10,
                        border:
                          networkPlan.model === "per_student"
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border)",
                        background: "var(--panel-2)",
                        color: "var(--text)",
                        cursor: "pointer"
                      }}
                    >
                      <strong style={{ display: "block", marginBottom: 4 }}>
                        Modelo B — Pastas individuais por aluno
                      </strong>
                      <small style={{ color: "var(--muted)" }}>
                        Desativa herança NTFS na raiz e isola cada subpasta para que apenas o respectivo aluno e os Administradores tenham acesso.
                      </small>
                    </button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <span>Nome ou IP do computador servidor</span>
                      <input
                        type="text"
                        placeholder="Ex.: SERVIDOR-LAB"
                        value={networkPlan.server}
                        onChange={(e) => setNetworkPlan({ ...networkPlan, server: e.target.value })}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <span>Nome do compartilhamento SMB</span>
                      <input
                        type="text"
                        value={networkPlan.shareName}
                        onChange={(e) => setNetworkPlan({ ...networkPlan, shareName: e.target.value })}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <span>Pasta local no servidor</span>
                      <input
                        type="text"
                        value={networkPlan.rootPath}
                        onChange={(e) => setNetworkPlan({ ...networkPlan, rootPath: e.target.value })}
                      />
                    </label>
                    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <span>Letra da unidade nas estações</span>
                      <input
                        type="text"
                        maxLength={1}
                        value={networkPlan.driveLetter}
                        onChange={(e) =>
                          setNetworkPlan({ ...networkPlan, driveLetter: e.target.value.toUpperCase() })
                        }
                      />
                    </label>
                  </div>

                  {networkPlan.model === "per_student" && (
                    <label style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      <span>Contas de alunos para criar subpastas isoladas (separadas por vírgula)</span>
                      <input
                        type="text"
                        placeholder="Ex.: Aluno01, Aluno02, TurmaManha"
                        value={studentAccountsInput}
                        onChange={(e) => setStudentAccountsInput(e.target.value)}
                      />
                    </label>
                  )}

                  {networkErrors.length > 0 && (
                    <div style={{ color: "#ef6461", fontSize: 13 }}>
                      {networkErrors.map((err) => (
                        <div key={err}>• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ETAPA 7: REVISÃO DE IMPACTO */}
          {step === 7 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>7. Revisão de segurança e impacto</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  Confira o diagnóstico preventivo da configuração antes de gerar o pacote pós-formatação.
                </p>
              </div>

              {allBlockingErrors.length > 0 ? (
                <div
                  style={{
                    padding: 16,
                    borderRadius: 10,
                    border: "1px solid #ef6461",
                    background: "rgba(239, 100, 97, 0.12)"
                  }}
                >
                  <strong style={{ display: "block", marginBottom: 8, color: "#ef6461" }}>
                    Ajustes obrigatórios antes de gerar o pacote:
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13.5 }}>
                    {allBlockingErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div
                  style={{
                    padding: 14,
                    borderRadius: 10,
                    border: "1px solid #36c986",
                    background: "rgba(54, 201, 134, 0.12)",
                    fontSize: 13.5
                  }}
                >
                  Configuração validada sem conflitos de segurança. A conta <strong>{config.adminUser}</strong> permanece protegida e separada da conta restrita <strong>{config.studentUser}</strong>.
                </div>
              )}

              <div style={{ display: "grid", gap: 10 }}>
                {reviewItems.map((item, index) => (
                  <div
                    key={index}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid var(--border)",
                      background: "var(--panel-2)",
                      fontSize: 13
                    }}
                  >
                    <strong style={{ color: item.level === "warning" ? "#f4b740" : "#36c986" }}>
                      {item.level === "warning" ? "Atenção: " : "Verificado: "}
                    </strong>
                    {item.text}
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className="secondary" onClick={handleExportJson}>
                  Salvar perfil em JSON
                </button>
                <label className="secondary" style={{ padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, border: "1px solid var(--border)" }}>
                  Importar perfil JSON
                  <input
                    type="file"
                    accept=".json,application/json"
                    style={{ display: "none" }}
                    onChange={(e) => void handleImportJson(e.target.files?.[0])}
                  />
                </label>
              </div>
            </div>
          )}

          {/* ETAPA 8: GERAR PACOTE PÓS-FORMATAÇÃO */}
          {step === 8 && (
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h2 style={{ margin: "0 0 6px" }}>8. Gerar pacote pós-formatação (.zip)</h2>
                <p style={{ color: "var(--muted)", margin: 0, fontSize: 14 }}>
                  O pacote inclui atalho executável com elevação automática (UAC), manifesto SHA-256 contra corrupção de pendrive e reversão completa.
                </p>
              </div>

              <div
                style={{
                  padding: 18,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--panel-2)",
                  display: "grid",
                  gap: 12
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <div>
                    <strong style={{ fontSize: 16, display: "block" }}>{config.profileName}</strong>
                    <small style={{ color: "var(--muted)" }}>
                      Conta comum: {config.studentUser} · Admin protegido: {config.adminUser} · AppLocker: {config.enforcementMode}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleGenerateZip()}
                    disabled={isGenerating || allBlockingErrors.length > 0}
                    style={{
                      padding: "12px 22px",
                      borderRadius: 10,
                      border: "none",
                      background: "var(--accent)",
                      color: "#111",
                      fontWeight: 800,
                      fontSize: 14,
                      cursor: isGenerating || allBlockingErrors.length > 0 ? "not-allowed" : "pointer"
                    }}
                  >
                    {isGenerating ? "Gerando pacote verificado..." : "Baixar pacote pós-formatação (.zip)"}
                  </button>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 13, lineHeight: 1.7 }}>
                  <strong>Como aplicar nos computadores recém-formatados:</strong>
                  <ol style={{ margin: "6px 0 0", paddingLeft: 20, color: "var(--muted)" }}>
                    <li>Copie o arquivo <code>.zip</code> para um pendrive e extraia todos os arquivos em uma pasta na máquina Windows.</li>
                    <li>Clique duas vezes em <code>Configurar-Computador.cmd</code> e confirme a solicitação de Administrador do Windows.</li>
                    <li>O script conferirá automaticamente a integridade SHA-256 de todos os arquivos, mostrará o resumo e pedirá sua confirmação.</li>
                    <li>Se precisar desfazer a configuração no futuro, basta executar <code>Reverter-Configuracao.cmd</code>.</li>
                  </ol>
                </div>
              </div>

              <div>
                <strong style={{ fontSize: 13, display: "block", marginBottom: 8 }}>
                  Arquivos incluídos neste pacote ({basePackageFiles.length + (includeNetworkInZip ? 4 : 1)} arquivos):
                </strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {[
                    ...basePackageFiles.map((f) => f.name),
                    ...(includeNetworkInZip
                      ? ["servidor-pasta-smb.ps1", "estacao-mapear-smb.ps1", "testar-rede-smb.ps1"]
                      : []),
                    "manifest.json"
                  ].map((name) => (
                    <code
                      key={name}
                      style={{
                        padding: "4px 9px",
                        borderRadius: 6,
                        background: "var(--panel-2)",
                        border: "1px solid var(--border)",
                        fontSize: 12
                      }}
                    >
                      {name}
                    </code>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setShowScriptPreview((prev) => !prev)}
                  style={{ fontSize: 13 }}
                >
                  {showScriptPreview ? "Ocultar código PowerShell gerado" : "Inspecionar setup.ps1 auditável"}
                </button>
                {showScriptPreview && (
                  <pre
                    style={{
                      marginTop: 10,
                      maxHeight: 280,
                      overflow: "auto",
                      padding: 14,
                      borderRadius: 10,
                      background: "#090d12",
                      border: "1px solid var(--border)",
                      fontSize: 12
                    }}
                  >
                    {previewSetupScript}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Navegação inferior entre etapas */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 24,
              paddingTop: 18,
              borderTop: "1px solid var(--border)"
            }}
          >
            <button
              type="button"
              className="secondary"
              disabled={step === 1}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
            >
              ← Etapa anterior
            </button>
            <span style={{ color: "var(--muted)", fontSize: 12.5 }}>
              Etapa {step} de {WIZARD_STEPS.length}
            </span>
            {step < WIZARD_STEPS.length ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(WIZARD_STEPS.length, s + 1))}
                style={{
                  padding: "9px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "var(--accent)",
                  color: "#111",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                Próxima etapa →
              </button>
            ) : (
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Pronto para gerar</span>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
