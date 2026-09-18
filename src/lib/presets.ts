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
    id: "microlins",
    name: "Microlins",
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
