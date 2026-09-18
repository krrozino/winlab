"use client";

import { useMemo, useState } from "react";
import { defaultConfig } from "@/lib/default-config";
import { Config, AllowedAppId } from "@/lib/types";
import {
  generateConfigJson,
  generateReadme,
  generateSetupScript
} from "@/lib/generator";

const APP_LABELS: Record<AllowedAppId, string> = {
  chrome: "Google Chrome",
  word: "Microsoft Word",
  excel: "Microsoft Excel",
  powerpoint: "Microsoft PowerPoint",
  powerbi: "Power BI Desktop"
};

function downloadFile(name: string, content: string, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [newPath, setNewPath] = useState("");

  const script = useMemo(() => generateSetupScript(config), [config]);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((current) => ({ ...current, [key]: value }));
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

  function exportFiles() {
    downloadFile("setup.ps1", script);
    downloadFile("config.json", generateConfigJson(config), "application/json");
    downloadFile("README.txt", generateReadme(config));
  }

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">WinLab Configurator · MVP 0.1</p>
          <h1>Monte a política do PC e gere o PowerShell.</h1>
          <p className="subtitle">
            Escolha contas, bloqueios, navegador e aplicativos permitidos.
            O gerador cria um script reproduzível para Windows 10/11 Pro.
          </p>
        </div>
        <button className="primary" onClick={exportFiles}>
          Gerar arquivos
        </button>
      </header>

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
              Usuário de aluno
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
            onChange={(v) => set("createAccounts", v)}
          />
        </section>

        <section className="panel">
          <h2>Aplicativos permitidos</h2>
          <p className="muted">
            O aluno receberá uma allowlist. Programas fora dela não deverão executar.
          </p>

          <div className="apps">
            {(Object.keys(APP_LABELS) as AllowedAppId[]).map((app) => (
              <button
                key={app}
                className={config.allowedApps.includes(app) ? "app active" : "app"}
                onClick={() => toggleApp(app)}
              >
                <span>{config.allowedApps.includes(app) ? "✓" : "+"}</span>
                {APP_LABELS[app]}
              </button>
            ))}
          </div>

          <div className="custom">
            <input
              placeholder="C:\Program Files\Aplicativo\app.exe"
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomPath()}
            />
            <button onClick={addCustomPath}>Adicionar</button>
          </div>

          {config.customAllowedPaths.length > 0 && (
            <ul className="paths">
              {config.customAllowedPaths.map((path) => (
                <li key={path}>
                  <code>{path}</code>
                  <button
                    onClick={() =>
                      set(
                        "customAllowedPaths",
                        config.customAllowedPaths.filter((p) => p !== path)
                      )
                    }
                  >
                    remover
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Windows</h2>
          <Toggle label="Bloquear instaladores MSI" value={config.blockInstallers} onChange={(v) => set("blockInstallers", v)} />
          <Toggle label="Bloquear aplicativos da Microsoft Store" value={config.blockStoreApps} onChange={(v) => set("blockStoreApps", v)} />
          <Toggle label="Bloquear CMD" value={config.blockCmd} onChange={(v) => set("blockCmd", v)} />
          <Toggle label="Bloquear PowerShell" value={config.blockPowerShell} onChange={(v) => set("blockPowerShell", v)} />
          <Toggle label="Bloquear Regedit" value={config.blockRegedit} onChange={(v) => set("blockRegedit", v)} />
        </section>

        <section className="panel">
          <h2>Google Chrome</h2>
          <Toggle label="Bloquear extensões" value={config.blockChromeExtensions} onChange={(v) => set("blockChromeExtensions", v)} />
          <Toggle label="Bloquear modo convidado" value={config.blockChromeGuest} onChange={(v) => set("blockChromeGuest", v)} />
          <Toggle label="Bloquear criação de novos perfis" value={config.blockChromeNewProfiles} onChange={(v) => set("blockChromeNewProfiles", v)} />
          <Toggle label="Bloquear modo anônimo" value={config.blockChromeIncognito} onChange={(v) => set("blockChromeIncognito", v)} />
          <Toggle label="Bloquear salvamento de novas senhas" value={config.blockChromePasswordManager} onChange={(v) => set("blockChromePasswordManager", v)} />
        </section>

        <section className="panel">
          <h2>Personalização</h2>
          <Toggle label="Bloquear troca de wallpaper" value={config.blockWallpaper} onChange={(v) => set("blockWallpaper", v)} />
          <Toggle label="Bloquear ponteiro do mouse" value={config.blockMousePointers} onChange={(v) => set("blockMousePointers", v)} />
          <Toggle label="Bloquear esquema de sons" value={config.blockSoundScheme} onChange={(v) => set("blockSoundScheme", v)} />
        </section>

        <section className="panel preview">
          <div className="previewHeader">
            <div>
              <h2>Prévia do script</h2>
              <p className="muted">{script.split("\n").length} linhas geradas</p>
            </div>
            <button onClick={() => downloadFile("setup.ps1", script)}>
              Baixar .ps1
            </button>
          </div>
          <pre>{script.slice(0, 8000)}</pre>
        </section>
      </div>
    </main>
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
