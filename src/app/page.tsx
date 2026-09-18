"use client";

import { useMemo, useState } from "react";
import { APP_CATALOG } from "@/lib/apps";
import { parseConfigJson } from "@/lib/config-io";
import {
  applyInventorySuggestions,
  detectedKnownApps,
  findPotentiallyRelevantInstalledApps,
  parseInventoryJson,
  suggestedAllowedApps
} from "@/lib/inventory";
import type { PcInventory } from "@/lib/inventory-types";
import { generateInventoryScannerScript } from "@/lib/inventory-script";
import { getConfigReview } from "@/lib/review";
import { getPreset, presets } from "@/lib/presets";
import { Config, AllowedAppId, PresetId } from "@/lib/types";
import { pathRisk } from "@/lib/security";
import { createZip } from "@/lib/zip";
import {
  generateAuditScript,
  generateConfigJson,
  generateReadme,
  generateRollbackScript,
  generateSetupScript,
  generateUnlockWallpaperScript,
  generateVerifyScript
} from "@/lib/generator";

function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadText(name: string, content: string, type = "text/plain") {
  downloadBlob(name, new Blob([content], { type }));
}

export default function Home() {
  const [config, setConfig] = useState<Config>(() => getPreset("microlins"));
  const [activePreset, setActivePreset] = useState<PresetId | null>("microlins");
  const [newPath, setNewPath] = useState("");
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [inventory, setInventory] = useState<PcInventory | null>(null);
  const [inventoryStatus, setInventoryStatus] = useState<string | null>(null);
  const [inventorySearch, setInventorySearch] = useState("");

  const setupScript = useMemo(() => generateSetupScript(config), [config]);
  const reviewItems = useMemo(() => getConfigReview(config), [config]);
  const inventoryDetectedApps = inventory ? detectedKnownApps(inventory) : [];
  const inventorySuggestions = inventory ? suggestedAllowedApps(inventory, config) : [];
  const inventoryInstalledApps = inventory
    ? findPotentiallyRelevantInstalledApps(inventory, inventorySearch)
    : [];
  const riskyCustomPaths = config.customAllowedPaths
    .map((path) => ({ path, warning: pathRisk(path) }))
    .filter((item) => item.warning);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setActivePreset(null);
    setConfig((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(id: PresetId) {
    setActivePreset(id);
    setConfig(getPreset(id));
  }

  function toggleApp(app: AllowedAppId) {
    set(
      "allowedApps",
      config.allowedApps.includes(app)
        ? config.allowedApps.filter((item) => item !== app)
        : [...config.allowedApps, app]
    );
  }

  function addCustomPath() {
    const path = newPath.trim();
    if (!path) return;

    if (!config.customAllowedPaths.includes(path)) {
      set("customAllowedPaths", [...config.customAllowedPaths, path]);
    }

    setNewPath("");
  }

  async function importConfig(file: File | undefined) {
    if (!file) return;

    try {
      const parsed = parseConfigJson(await file.text());
      setConfig(parsed);
      setActivePreset(null);
      setImportStatus(`Configuração importada: ${file.name}`);
    } catch (error) {
      setImportStatus(
        error instanceof Error ? error.message : "Não foi possível importar o arquivo."
      );
    }
  }

  async function importInventory(file: File | undefined) {
    if (!file) return;

    try {
      const parsed = parseInventoryJson(await file.text());
      setInventory(parsed);
      setInventoryStatus(`Inventário carregado: ${parsed.computerName}`);
    } catch (error) {
      setInventory(null);
      setInventoryStatus(
        error instanceof Error ? error.message : "Não foi possível importar o inventário."
      );
    }
  }

  function applyDetectedApps() {
    if (!inventory) return;
    setActivePreset(null);
    setConfig((current) => applyInventorySuggestions(current, inventory));
  }

  function exportPackage() {
    const blob = createZip([
      { name: "setup.ps1", content: generateSetupScript(config) },
      { name: "rollback.ps1", content: generateRollbackScript(config) },
      { name: "audit.ps1", content: generateAuditScript(config) },
      { name: "liberar-wallpaper.ps1", content: generateUnlockWallpaperScript(config) },
      { name: "verify.ps1", content: generateVerifyScript(config) },
      { name: "scan-pc.ps1", content: generateInventoryScannerScript() },
      { name: "config.json", content: generateConfigJson(config) },
      { name: "README.txt", content: generateReadme(config) }
    ]);
    const slug =
      config.profileName
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "winlab";

    downloadBlob(`winlab-${slug}.zip`, blob);
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">WinLab Configurator · MVP 0.4</p>
          <h1>Configure o Windows sem configurar máquina por máquina.</h1>
          <p className="subtitle">
            Escolha um preset, ajuste as políticas e gere um pacote portátil com
            setup, rollback, auditoria e configuração reutilizável.
          </p>
        </div>

        <button className="primary" onClick={exportPackage}>
          Gerar pacote .zip
        </button>
      </header>

      <section className="presetBar" aria-label="Presets">
        {presets.map((preset) => (
          <button
            key={preset.id}
            className={activePreset === preset.id ? "preset active" : "preset"}
            onClick={() => applyPreset(preset.id)}
          >
            <strong>{preset.name}</strong>
            <span>{preset.description}</span>
          </button>
        ))}
      </section>

      <section className="importBar">
        <div>
          <strong>Reutilizar configuração</strong>
          <span>Importe um config.json gerado anteriormente e continue de onde parou.</span>
        </div>
        <label className="importButton">
          Importar config.json
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => importConfig(event.target.files?.[0])}
          />
        </label>
        {importStatus && <p className="importStatus">{importStatus}</p>}
      </section>

      <section className="inventoryPanel">
        <div className="inventoryIntro">
          <div>
            <p className="eyebrow">Analisar este PC</p>
            <h2>Descubra o que já existe na máquina antes de configurar.</h2>
            <p>
              Baixe o scanner, execute no Windows e importe o JSON gerado. O WinLab
              usa o inventário somente no seu navegador.
            </p>
          </div>

          <div className="inventoryActions">
            <button
              className="secondary"
              onClick={() =>
                downloadText("scan-pc.ps1", generateInventoryScannerScript())
              }
            >
              Baixar scan-pc.ps1
            </button>

            <label className="importButton">
              Importar inventário
              <input
                type="file"
                accept=".json,application/json"
                onChange={(event) => importInventory(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>

        {inventoryStatus && <p className="importStatus">{inventoryStatus}</p>}

        {inventory && (
          <div className="inventoryResults">
            <div className="machineSummary">
              <div>
                <span>Computador</span>
                <strong>{inventory.computerName}</strong>
              </div>
              <div>
                <span>Windows</span>
                <strong>{inventory.windows.caption || "Não identificado"}</strong>
                <small>Build {inventory.windows.buildNumber || "?"}</small>
              </div>
              <div>
                <span>AppLocker</span>
                <strong>{inventory.appLocker.available ? "Disponível" : "Não detectado"}</strong>
                <small>
                  Application Identity: {inventory.appLocker.applicationIdentityStatus ?? "?"}
                </small>
              </div>
              <div>
                <span>Programas registrados</span>
                <strong>{inventory.installedApps.length}</strong>
              </div>
            </div>

            <div className="inventoryColumns">
              <div>
                <div className="sectionHeading">
                  <div>
                    <h3>Apps reconhecidos</h3>
                    <p>{inventoryDetectedApps.length} encontrado(s) no catálogo.</p>
                  </div>
                  {inventorySuggestions.length > 0 && (
                    <button className="secondary" onClick={applyDetectedApps}>
                      Adicionar {inventorySuggestions.length} à allowlist
                    </button>
                  )}
                </div>

                <div className="detectedApps">
                  {inventoryDetectedApps.length ? (
                    inventoryDetectedApps.map((app) => (
                      <div className="detectedApp" key={app.id}>
                        <div>
                          <strong>{app.label}</strong>
                          <small>{app.path ?? "Caminho não informado"}</small>
                        </div>
                        <span
                          className={
                            config.allowedApps.includes(app.id)
                              ? "status allowed"
                              : "status detected"
                          }
                        >
                          {config.allowedApps.includes(app.id)
                            ? "Permitido"
                            : "Detectado"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="muted">Nenhum app do catálogo foi detectado.</p>
                  )}
                </div>
              </div>

              <div>
                <div className="sectionHeading">
                  <div>
                    <h3>Programas instalados</h3>
                    <p>Consulta do registro do Windows.</p>
                  </div>
                </div>

                <input
                  className="inventorySearch"
                  placeholder="Buscar programa ou fabricante..."
                  value={inventorySearch}
                  onChange={(event) => setInventorySearch(event.target.value)}
                />

                <div className="installedApps">
                  {inventoryInstalledApps.map((app) => (
                    <div className="installedApp" key={`${app.name}-${app.version ?? ""}`}>
                      <strong>{app.name}</strong>
                      <span>
                        {[app.version, app.publisher].filter(Boolean).join(" · ") || "Sem detalhes"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="localUsers">
              <h3>Contas locais</h3>
              <div className="userChips">
                {inventory.localUsers.map((user) => (
                  <span key={user.name} className={user.isAdministrator ? "userChip admin" : "userChip"}>
                    {user.name}
                    {user.isAdministrator ? " · admin" : ""}
                    {!user.enabled ? " · desativada" : ""}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      <div className="grid">
        <section className="panel">
          <h2>Identidade</h2>

          <label>
            Nome do perfil
            <input
              value={config.profileName}
              onChange={(e) => set("profileName", e.target.value)}
            />
          </label>

          <div className="two">
            <label>
              Usuário restrito
              <input
                value={config.studentUser}
                onChange={(e) => set("studentUser", e.target.value)}
              />
            </label>

            <label>
              Administrador
              <input
                value={config.adminUser}
                onChange={(e) => set("adminUser", e.target.value)}
              />
            </label>
          </div>

          <Toggle
            label="Criar/ajustar as contas automaticamente"
            value={config.createAccounts}
            onChange={(value) => set("createAccounts", value)}
          />
        </section>

        <section className="panel important">
          <h2>Modo de implantação</h2>

          <label>
            AppLocker
            <select
              value={config.enforcementMode}
              onChange={(e) =>
                set(
                  "enforcementMode",
                  e.target.value as Config["enforcementMode"]
                )
              }
            >
              <option value="AuditOnly">Auditoria — não bloqueia ainda</option>
              <option value="Enabled">Bloqueio ativo</option>
            </select>
          </label>

          <p className="notice">
            {config.enforcementMode === "AuditOnly"
              ? "Recomendado no primeiro teste: o Windows registra o que seria bloqueado sem interromper a aula."
              : "Bloqueio real ativado. Use somente depois de validar a allowlist em um PC piloto."}
          </p>
        </section>

        <section className="panel">
          <h2>Aplicativos permitidos</h2>
          <p className="muted">
            O usuário restrito recebe uma allowlist. O administrador continua
            irrestrito.
          </p>

          <div className="apps">
            {(Object.keys(APP_CATALOG) as AllowedAppId[]).map((app) => (
              <button
                key={app}
                className={config.allowedApps.includes(app) ? "app active" : "app"}
                onClick={() => toggleApp(app)}
              >
                <span>{config.allowedApps.includes(app) ? "✓" : "+"}</span>
                {APP_CATALOG[app].label}
              </button>
            ))}
          </div>

          <div className="custom">
            <input
              placeholder={"C:\\Program Files\\Aplicativo\\app.exe"}
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomPath()}
            />
            <button onClick={addCustomPath}>Adicionar</button>
          </div>

          {config.customAllowedPaths.length > 0 && (
            <ul className="paths">
              {config.customAllowedPaths.map((path) => {
                const warning = pathRisk(path);

                return (
                  <li key={path} className={warning ? "path risky" : "path"}>
                    <div>
                      <code>{path}</code>
                      {warning && <small>{warning}</small>}
                    </div>

                    <button
                      onClick={() =>
                        set(
                          "customAllowedPaths",
                          config.customAllowedPaths.filter((item) => item !== path)
                        )
                      }
                    >
                      remover
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Windows</h2>
          <Toggle
            label="Bloquear instaladores MSI"
            value={config.blockInstallers}
            onChange={(value) => set("blockInstallers", value)}
          />
          <Toggle
            label="Bloquear apps empacotados / Microsoft Store"
            value={config.blockStoreApps}
            onChange={(value) => set("blockStoreApps", value)}
          />
          <Toggle
            label="Bloquear CMD"
            value={config.blockCmd}
            onChange={(value) => set("blockCmd", value)}
          />
          <Toggle
            label="Bloquear PowerShell"
            value={config.blockPowerShell}
            onChange={(value) => set("blockPowerShell", value)}
          />
          <Toggle
            label="Bloquear Regedit"
            value={config.blockRegedit}
            onChange={(value) => set("blockRegedit", value)}
          />
        </section>

        <section className="panel">
          <h2>Google Chrome · somente usuário restrito</h2>
          <Toggle
            label="Bloquear extensões"
            value={config.blockChromeExtensions}
            onChange={(value) => set("blockChromeExtensions", value)}
          />
          <Toggle
            label="Bloquear modo convidado"
            value={config.blockChromeGuest}
            onChange={(value) => set("blockChromeGuest", value)}
          />
          <Toggle
            label="Bloquear novos perfis"
            value={config.blockChromeNewProfiles}
            onChange={(value) => set("blockChromeNewProfiles", value)}
          />
          <Toggle
            label="Bloquear modo anônimo"
            value={config.blockChromeIncognito}
            onChange={(value) => set("blockChromeIncognito", value)}
          />
          <Toggle
            label="Bloquear novas senhas"
            value={config.blockChromePasswordManager}
            onChange={(value) => set("blockChromePasswordManager", value)}
          />
        </section>

        <section className="panel">
          <h2>Personalização</h2>
          <Toggle
            label="Bloquear wallpaper"
            value={config.blockWallpaper}
            onChange={(value) => set("blockWallpaper", value)}
          />
          <Toggle
            label="Bloquear ponteiro do mouse"
            value={config.blockMousePointers}
            onChange={(value) => set("blockMousePointers", value)}
          />
          <Toggle
            label="Bloquear esquema de sons"
            value={config.blockSoundScheme}
            onChange={(value) => set("blockSoundScheme", value)}
          />

          <label className="numberField">
            Liberação temporária do wallpaper
            <div>
              <input
                type="number"
                min={5}
                max={480}
                value={config.wallpaperUnlockMinutes}
                onChange={(e) =>
                  set(
                    "wallpaperUnlockMinutes",
                    Math.max(5, Math.min(480, Number(e.target.value) || 90))
                  )
                }
              />
              <span>minutos</span>
            </div>
          </label>
        </section>

        <section className="panel reviewPanel">
          <h2>Revisão antes de gerar</h2>
          <p className="muted">
            Confira o que merece atenção antes de levar o pacote para um PC.
          </p>
          <div className="reviewList">
            {reviewItems.map((item, index) => (
              <div
                key={`${item.level}-${index}`}
                className={item.level === "warning" ? "review warning" : "review info"}
              >
                <strong>{item.level === "warning" ? "Atenção" : "Info"}</strong>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel packagePanel">
          <h2>Pacote gerado</h2>

          <div className="fileList">
            <File name="setup.ps1" description="Aplica a configuração." />
            <File name="rollback.ps1" description="Remove as políticas sem apagar as contas." />
            <File name="audit.ps1" description="Lê os eventos do AppLocker dos últimos 7 dias." />
            <File name="liberar-wallpaper.ps1" description="Libera o wallpaper e agenda o rebloqueio." />
            <File name="verify.ps1" description="Verifica Windows, AppLocker, contas e caminhos dos aplicativos." />
            <File name="scan-pc.ps1" description="Gera inventário JSON para importar novamente no WinLab." />
            <File name="config.json" description="Permite reproduzir a mesma configuração." />
            <File name="README.txt" description="Instruções para o técnico." />
          </div>

          {riskyCustomPaths.length > 0 && (
            <p className="warningBox">
              Existem {riskyCustomPaths.length} caminho(s) personalizado(s) com
              alerta de segurança. Revise-os antes de usar o modo de bloqueio.
            </p>
          )}
        </section>

        <section className="panel preview">
          <div className="previewHeader">
            <div>
              <h2>Prévia do setup.ps1</h2>
              <p className="muted">
                {setupScript.split("\n").length} linhas ·{" "}
                {config.enforcementMode === "AuditOnly"
                  ? "auditoria"
                  : "bloqueio ativo"}
              </p>
            </div>

            <button onClick={() => downloadText("setup.ps1", setupScript)}>
              Baixar só setup.ps1
            </button>
          </div>

          <pre>{setupScript.slice(0, 12000)}</pre>
        </section>
      </div>
    </main>
  );
}

function File({
  name,
  description
}: {
  name: string;
  description: string;
}) {
  return (
    <div className="file">
      <code>{name}</code>
      <span>{description}</span>
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggleRow">
      <span>{label}</span>
      <button
        type="button"
        aria-pressed={value}
        className={value ? "switch on" : "switch"}
        onClick={() => onChange(!value)}
      >
        <span />
      </button>
    </label>
  );
}
