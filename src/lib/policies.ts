/**
 * WinLab Desktop — Catálogo Declarativo de Políticas (Feature 17)
 * Define metadados, escopo, nível de risco, requisitos de logoff/reboot e estratégias de probe.
 */

export type PolicyRiskLevel = "Low" | "Medium" | "High" | "Critical";
export type PolicyScope = "Machine" | "User";
export type PolicyState = "NotConfigured" | "Allowed" | "Blocked";

export type EffectivePolicyState =
  | "NotConfigured"
  | "Applying"
  | "Applied"
  | "PendingRefresh"
  | "PendingLogoff"
  | "PendingReboot"
  | "PendingAppRestart"
  | "PendingFirstLogon"
  | "Drifted"
  | "Failed"
  | "NotSupported"
  | "Inconclusive"
  | "Reverted";

export interface RegistryProbeTarget {
  hive: "HKLM" | "HKCU" | "HKU";
  subKey: string;
  valueName: string;
  expectedValue: number | string;
  fallbackValue?: number | string;
}

export interface PolicyDefinition {
  id: string;
  name: string;
  category: "Personalização" | "Navegadores" | "Sistema" | "Contas" | "Armazenamento" | "Aplicativos";
  description: string;
  riskLevel: PolicyRiskLevel;
  scope: PolicyScope;
  reversible: boolean;
  rebootRequired: boolean;
  requiresLogoff: boolean;
  requiresAppRestart: boolean;
  targetProcesses?: string[];
  primaryProbe: RegistryProbeTarget;
  counterpartProbe?: RegistryProbeTarget;
}

export const MILESTONE_3_POLICIES: readonly PolicyDefinition[] = [
  {
    id: "personalization.wallpaper",
    name: "Bloquear Alteração de Plano de Fundo",
    category: "Personalização",
    description: "Fixa o papel de parede institucional e desativa as opções de troca pelo usuário.",
    riskLevel: "Low",
    scope: "User",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: true,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKCU",
      subKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop",
      valueName: "NoChangingWallPaper",
      expectedValue: 1
    }
  },
  {
    id: "personalization.sounds",
    name: "Bloquear Alteração de Esquema de Sons",
    category: "Personalização",
    description: "Impede a alteração dos esquemas sonoros do sistema por alunos no laboratório.",
    riskLevel: "Low",
    scope: "User",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKCU",
      subKey: "Software\\Policies\\Microsoft\\Windows\\Personalization",
      valueName: "NoChangingSoundScheme",
      expectedValue: 1
    }
  },
  {
    id: "personalization.mouse_pointers",
    name: "Bloquear Alteração de Ponteiros do Mouse",
    category: "Personalização",
    description: "Impede que o usuário modifique ponteiros, tamanhos e esquemas visuais do mouse.",
    riskLevel: "Low",
    scope: "User",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKCU",
      subKey: "Software\\Policies\\Microsoft\\Windows\\Personalization",
      valueName: "NoChangingMousePointers",
      expectedValue: 1
    }
  },
  {
    id: "browser.chrome.incognito",
    name: "Bloquear Navegação Anônima (Chrome e Edge)",
    category: "Navegadores",
    description: "Desativa permanentemente o modo anônimo no Google Chrome e InPrivate no Microsoft Edge.",
    riskLevel: "Low",
    scope: "Machine",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: true,
    targetProcesses: ["chrome", "msedge"],
    primaryProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Google\\Chrome",
      valueName: "IncognitoModeAvailability",
      expectedValue: 1
    },
    counterpartProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Microsoft\\Edge",
      valueName: "InPrivateModeAvailability",
      expectedValue: 1
    }
  },
  {
    id: "browser.chrome.guest",
    name: "Bloquear Modo Convidado (Chrome e Edge)",
    category: "Navegadores",
    description: "Remove o perfil de visitante/convidado em navegadores Chrome e Edge compartilhados.",
    riskLevel: "Low",
    scope: "Machine",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: true,
    targetProcesses: ["chrome", "msedge"],
    primaryProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Google\\Chrome",
      valueName: "BrowserGuestModeEnabled",
      expectedValue: 0
    },
    counterpartProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Microsoft\\Edge",
      valueName: "BrowserGuestModeEnabled",
      expectedValue: 0
    }
  },
  {
    id: "browser.password_manager",
    name: "Bloquear Gerenciador de Senhas (Chrome e Edge)",
    category: "Navegadores",
    description: "Impede que os navegadores salvem senhas de alunos em estações compartilhadas.",
    riskLevel: "Low",
    scope: "Machine",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: true,
    targetProcesses: ["chrome", "msedge"],
    primaryProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Google\\Chrome",
      valueName: "PasswordManagerEnabled",
      expectedValue: 0
    },
    counterpartProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Microsoft\\Edge",
      valueName: "PasswordManagerEnabled",
      expectedValue: 0
    }
  },
  {
    id: "browser.developer_tools",
    name: "Bloquear Ferramentas do Desenvolvedor (F12)",
    category: "Navegadores",
    description: "Desativa o inspetor de elementos e o console JavaScript (F12) no Chrome e no Edge.",
    riskLevel: "Low",
    scope: "Machine",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: true,
    targetProcesses: ["chrome", "msedge"],
    primaryProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Google\\Chrome",
      valueName: "DeveloperToolsAvailability",
      expectedValue: 2
    },
    counterpartProbe: {
      hive: "HKLM",
      subKey: "SOFTWARE\\Policies\\Microsoft\\Edge",
      valueName: "DeveloperToolsAvailability",
      expectedValue: 2
    }
  },
  {
    id: "system.disable_cmd",
    name: "Bloquear Prompt de Comando (CMD)",
    category: "Sistema",
    description: "Impede que a conta comum abra o Prompt de Comando interativo, mantendo scripts administrativos funcionais.",
    riskLevel: "Medium",
    scope: "User",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKCU",
      subKey: "Software\\Policies\\Microsoft\\Windows\\System",
      valueName: "DisableCMD",
      expectedValue: 2
    }
  },
  {
    id: "system.disable_regedit",
    name: "Bloquear Editor do Registro (Regedit)",
    category: "Sistema",
    description: "Impede que a conta comum execute o regedit.exe ou importe arquivos .reg manualmente.",
    riskLevel: "Medium",
    scope: "User",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKCU",
      subKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
      valueName: "DisableRegistryTools",
      expectedValue: 1
    }
  },
  {
    id: "system.restrict_control_panel",
    name: "Restringir Painel de Controle e Configurações",
    category: "Sistema",
    description: "Impede que a conta comum abra o Painel de Controle clássico e o aplicativo Configurações do Windows.",
    riskLevel: "Medium",
    scope: "User",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: true,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKCU",
      subKey: "Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
      valueName: "NoControlPanel",
      expectedValue: 1
    }
  },
  {
    id: "storage.usb_write_protect",
    name: "Bloquear Gravação em Pendrives USB",
    category: "Armazenamento",
    description: "Impede copiar ou gravar arquivos em unidades removíveis USB sem desativar teclado, mouse ou leitura.",
    riskLevel: "Low",
    scope: "Machine",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKLM",
      subKey: "SYSTEM\\CurrentControlSet\\Control\\StorageDevicePolicies",
      valueName: "WriteProtect",
      expectedValue: 1
    }
  },
  {
    id: "apps.disable_microsoft_store",
    name: "Bloquear Acesso à Microsoft Store",
    category: "Aplicativos",
    description: "Impede que a conta comum abra a loja de aplicativos para instalar jogos ou programas não autorizados.",
    riskLevel: "Low",
    scope: "User",
    reversible: true,
    rebootRequired: false,
    requiresLogoff: false,
    requiresAppRestart: false,
    primaryProbe: {
      hive: "HKCU",
      subKey: "Software\\Policies\\Microsoft\\WindowsStore",
      valueName: "RemoveWindowsStore",
      expectedValue: 1
    }
  }
];

export function getPolicyDefinition(id: string): PolicyDefinition | undefined {
  return MILESTONE_3_POLICIES.find((p) => p.id === id);
}
