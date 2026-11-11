import { Config, PresetId } from "./types";
import { defaultConfig } from "./default-config";

export type Preset = {
  id: PresetId;
  name: string;
  description: string;
  config: Config;
};

export const presets: Preset[] = [
  {
    id: "microlins_iniciante",
    name: "Microlins — Iniciante (Kids & Alfabetização)",
    description: "Ambiente estritamente protegido para cursos introdutórios. Apenas Chrome liberado, com bloqueio total de personalização, Store e utilitários do sistema.",
    config: {
      ...defaultConfig,
      profileName: "Microlins Iniciante",
      studentUser: "Aluno",
      adminUser: "MicrolinsAdmin",
      allowedApps: ["chrome"],
      blockInstallers: true,
      blockStoreApps: true,
      blockCmd: true,
      blockPowerShell: true,
      blockRegedit: true,
      blockWallpaper: true,
      blockMousePointers: true,
      blockSoundScheme: true,
      blockUsbExecute: true,
      blockChromeExtensions: true,
      blockChromeGuest: true,
      blockChromeIncognito: true,
      browserUrlMode: "BlockList",
      enforcementMode: "AuditOnly"
    }
  },
  {
    id: "microlins_intermediario",
    name: "Microlins — Intermediário (Office & Power BI)",
    description: "Perfil padrão para laboratórios de informática comercial. Chrome, Office 365, Power BI e VLC liberados com bloqueio de pendrives executáveis.",
    config: {
      ...defaultConfig,
      profileName: "Microlins Intermediário",
      studentUser: "Aluno",
      adminUser: "MicrolinsAdmin",
      allowedApps: ["chrome", "word", "excel", "powerpoint", "powerbi", "vlc"],
      blockInstallers: true,
      blockStoreApps: true,
      blockCmd: true,
      blockPowerShell: true,
      blockRegedit: true,
      blockWallpaper: true,
      wallpaperUnlockMinutes: 15,
      blockUsbExecute: true,
      blockChromeExtensions: true,
      blockChromePasswordManager: true,
      enforcementMode: "AuditOnly"
    }
  },
  {
    id: "microlins_avancado",
    name: "Microlins — Avançado (Design & Programação)",
    description: "Perfil flexível para cursos de desenvolvimento, design e tecnologias avançadas. Suporte a caminhos customizados com salvaguardas no sistema.",
    config: {
      ...defaultConfig,
      profileName: "Microlins Avançado",
      studentUser: "Aluno",
      adminUser: "MicrolinsAdmin",
      allowedApps: ["chrome", "word", "excel", "powerpoint", "powerbi", "vlc"],
      blockInstallers: false,
      blockStoreApps: false,
      blockCmd: false,
      blockPowerShell: false,
      blockRegedit: true,
      blockWallpaper: false,
      blockUsbExecute: true,
      enforcementMode: "AuditOnly"
    }
  },
  {
    id: "microlins",
    name: "Microlins (Padrão)",
    description: "Laboratório com Chrome, Office, Power BI e personalização controlada.",
    config: {
      ...defaultConfig,
      profileName: "Microlins Lab",
      studentUser: "Aluno",
      adminUser: "MicrolinsAdmin",
      enforcementMode: "AuditOnly"
    }
  },
  {
    id: "school",
    name: "Escola",
    description: "Ambiente educacional restrito, com Office e navegador liberados.",
    config: {
      ...defaultConfig,
      profileName: "Laboratório Escolar",
      adminUser: "LabAdmin",
      allowedApps: ["chrome", "word", "excel", "powerpoint"],
      enforcementMode: "AuditOnly"
    }
  },
  {
    id: "company",
    name: "Empresa",
    description: "Estação compartilhada com navegador e produtividade, sem personalização.",
    config: {
      ...defaultConfig,
      profileName: "Estação Empresarial",
      studentUser: "Operador",
      adminUser: "TIAdmin",
      allowedApps: ["chrome", "word", "excel", "powerpoint", "powerbi"],
      blockWallpaper: false,
      blockMousePointers: false,
      blockSoundScheme: false,
      enforcementMode: "AuditOnly"
    }
  },
  {
    id: "kiosk",
    name: "Totem",
    description: "Perfil mínimo, com apenas navegador e bloqueios mais rígidos.",
    config: {
      ...defaultConfig,
      profileName: "Totem",
      studentUser: "Totem",
      adminUser: "TotemAdmin",
      allowedApps: ["chrome"],
      blockWallpaper: true,
      blockMousePointers: true,
      blockSoundScheme: true,
      enforcementMode: "Enabled"
    }
  }
];

export function getPreset(id: PresetId): Config {
  const preset = presets.find((item) => item.id === id);
  return structuredClone(preset?.config ?? defaultConfig);
}
