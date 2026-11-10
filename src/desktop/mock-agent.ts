import {
  ALLOWED_IPC_ACTIONS,
  IPC_CONSTANTS,
  IpcEnvelope,
  IpcResponse,
  MachineInventoryDto,
  PolicyStateSummaryDto
} from "./contracts";

const FORBIDDEN_SHELL_PATTERNS = [
  "powershell.exe",
  "powershell -c",
  "pwsh.exe",
  "cmd.exe",
  "cmd /c",
  "bash",
  "eval(",
  "invoke-expression",
  "iex ",
  "downloadstring",
  "system.diagnostics.process",
  "wscript.shell"
];

export function validateNoArbitraryShell(raw: string): { isSafe: boolean; error?: string } {
  const lower = raw.toLowerCase();
  for (const pattern of FORBIDDEN_SHELL_PATTERNS) {
    if (lower.includes(pattern)) {
      return {
        isSafe: false,
        error: `Forbidden executable or script pattern detected: '${pattern}'. Arbitrary shell execution is strictly blocked by WinLab security policy.`
      };
    }
  }
  return { isSafe: true };
}

export function validateIpcAction(action: string): { isValid: boolean; error?: string; errorCode?: string } {
  if (!action || !action.trim()) {
    return { isValid: false, error: "Action cannot be empty.", errorCode: "EMPTY_ACTION" };
  }

  if (!ALLOWED_IPC_ACTIONS.includes(action)) {
    return {
      isValid: false,
      error: `Action '${action}' is not in the strict IPC allowlist.`,
      errorCode: "UNAUTHORIZED_ACTION"
    };
  }

  if (action === IPC_CONSTANTS.ACTION_APPLY_POLICIES || action === IPC_CONSTANTS.ACTION_ROLLBACK_POLICIES) {
    return {
      isValid: false,
      error: "Privileged policy execution is disabled in the foundation desktop stage. Only read-only queries and dry-run previews are permitted.",
      errorCode: "PRIVILEGED_EXECUTOR_DISABLED"
    };
  }

  return { isValid: true };
}

export class MockDesktopAgent {
  public readonly isRunning = true;
  public readonly mode = "Unprivileged Mock (In-Memory Development)";

  public async handleRequest<T = unknown>(envelope: IpcEnvelope): Promise<IpcResponse<T>> {
    const rawString = JSON.stringify(envelope);
    const shellCheck = validateNoArbitraryShell(rawString);
    if (!shellCheck.isSafe) {
      return {
        id: crypto.randomUUID(),
        replyToId: envelope.id || "",
        success: false,
        error: shellCheck.error,
        errorCode: "FORBIDDEN_SHELL_INJECTION"
      };
    }

    const actionCheck = validateIpcAction(envelope.action);
    if (!actionCheck.isValid) {
      return {
        id: crypto.randomUUID(),
        replyToId: envelope.id || "",
        success: false,
        error: actionCheck.error,
        errorCode: actionCheck.errorCode
      };
    }

    switch (envelope.action) {
      case IPC_CONSTANTS.ACTION_QUERY_INVENTORY:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: this.getMockInventory() as unknown as T
        };

      case IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: this.getMockPolicyState() as unknown as T
        };

      case IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: {
            computerName: "LAB-MICROLINS-01",
            status: "PASS",
            readinessScore: 100,
            summary: { pass: 10, warn: 0, block: 0 },
            readinessMessage: "Computador apto para configuração em modo de piloto seguro (AuditOnly)."
          } as unknown as T
        };

      case IPC_CONSTANTS.ACTION_LIST_PRESETS:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: [
            { id: "microlins", name: "Microlins", description: "Alinhado à grade com Chrome, Office, Power BI e bloqueio de USB executável." },
            { id: "escola", name: "Escola Geral", description: "Laboratório de informática compartilhado com restrições balanceadas." },
            { id: "empresa", name: "Empresa / Kiosk", description: "Estação frontline ou escritório compartilhado." },
            { id: "totem", name: "Totem", description: "Restrição máxima com interface direcionada a aplicativo único." }
          ] as unknown as T
        };

      case IPC_CONSTANTS.ACTION_PREVIEW_POLICY_DIFF:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: {
            previewOnly: true,
            willModifyRegistry: false,
            willModifyAppLocker: false,
            description: "Simulação segura de diff. Nenhuma alteração aplicada ao sistema nesta etapa."
          } as unknown as T
        };

      case IPC_CONSTANTS.ACTION_VALIDATE_CONFIG:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: {
            valid: true,
            message: "Configuração validada com sucesso pelo validador do WinLab."
          } as unknown as T
        };

      default:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: false,
          error: `Unhandled action: ${envelope.action}`,
          errorCode: "UNHANDLED_ACTION"
        };
    }
  }

  public getMockInventory(): MachineInventoryDto {
    return {
      computerName: "LAB-MICROLINS-01",
      scannedAt: new Date().toISOString(),
      windows: {
        caption: "Windows 11 Pro",
        version: "10.0.26100",
        buildNumber: "26100",
        architecture: "64 bits"
      },
      detectedApps: [
        { id: "chrome", name: "Google Chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", detected: true, allowed: true },
        { id: "office", name: "Microsoft Office", path: "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE", detected: true, allowed: true },
        { id: "powerbi", name: "Power BI Desktop", path: "C:\\Program Files\\Microsoft Power BI Desktop\\bin\\PBIDesktop.exe", detected: true, allowed: true },
        { id: "vlc", name: "VLC Media Player", path: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe", detected: true, allowed: true }
      ],
      installedApps: [
        { displayName: "Google Chrome", displayVersion: "130.0.6723.117", publisher: "Google LLC" },
        { displayName: "Microsoft 365 Apps for enterprise", displayVersion: "16.0.17932.20162", publisher: "Microsoft Corporation" },
        { displayName: "Microsoft Power BI Desktop", displayVersion: "2.138.1004.0", publisher: "Microsoft Corporation" }
      ],
      localUsers: [
        { name: "Administrador", enabled: true, isAdmin: true, sid: "S-1-5-21-1000-500" },
        { name: "AdminLocal", enabled: true, isAdmin: true, sid: "S-1-5-21-1000-1001" },
        { name: "Aluno", enabled: true, isAdmin: false, sid: "S-1-5-21-1000-1002" }
      ],
      disks: [
        { device: "C:", totalGb: 237.5, freeGb: 142.1, freePercent: 59.8 }
      ]
    };
  }

  public getMockPolicyState(): PolicyStateSummaryDto {
    return {
      totalPolicies: 6,
      appliedCount: 0,
      notConfiguredCount: 6,
      pendingCount: 0,
      items: [
        {
          id: "account.local_management",
          category: "Contas Locais",
          title: "Bloquear Gerenciamento de Contas Locais",
          description: "Impede que o usuário restrito acesse a página de contas ou crie novos usuários.",
          scope: "User",
          risk: "Medium",
          currentState: "NotConfigured",
          desiredState: "NotConfigured",
          requiresRestart: false,
          requiresLogoff: true,
          reversible: true
        },
        {
          id: "applocker.mode",
          category: "Controle de Aplicativos",
          title: "Modo de Aplicação do AppLocker",
          description: "AuditOnly registra execuções no EventLog sem bloquear aplicativos. Enabled impõe allowlist.",
          scope: "Device",
          risk: "High",
          currentState: "NotConfigured",
          desiredState: "NotConfigured",
          requiresRestart: false,
          requiresLogoff: false,
          reversible: true
        },
        {
          id: "browser.url_mode",
          category: "Navegador",
          title: "Controle de URLs (Chrome e Edge)",
          description: "Bloqueio ou liberação de domínios específicos nas políticas do Chrome e Edge.",
          scope: "User",
          risk: "Medium",
          currentState: "NotConfigured",
          desiredState: "NotConfigured",
          requiresRestart: false,
          requiresLogoff: false,
          reversible: true
        },
        {
          id: "usb.execution",
          category: "Armazenamento e USB",
          title: "Bloquear Execução de Arquivos em USB",
          description: "Permite ler e salvar arquivos no pendrive, mas impede a execução de binários (.exe).",
          scope: "Device",
          risk: "High",
          currentState: "NotConfigured",
          desiredState: "NotConfigured",
          requiresRestart: false,
          requiresLogoff: false,
          reversible: true
        },
        {
          id: "personalization.wallpaper",
          category: "Personalização",
          title: "Bloquear Alteração de Plano de Fundo",
          description: "Fixa o papel de parede do laboratório e desativa a personalização pelo aluno.",
          scope: "User",
          risk: "Low",
          currentState: "NotConfigured",
          desiredState: "NotConfigured",
          requiresRestart: false,
          requiresLogoff: true,
          reversible: true
        },
        {
          id: "maintenance.cleanup_profiles",
          category: "Manutenção",
          title: "Limpeza de Perfis Locais Inativos",
          description: "Gera relatório de perfis temporários inativos para manter espaço em disco.",
          scope: "Device",
          risk: "Medium",
          currentState: "NotConfigured",
          desiredState: "NotConfigured",
          requiresRestart: false,
          requiresLogoff: false,
          reversible: true
        }
      ]
    };
  }
}
