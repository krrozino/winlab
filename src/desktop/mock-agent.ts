import {
  ALLOWED_IPC_ACTIONS,
  DesktopIpcTransport,
  IPC_CONSTANTS,
  IpcEnvelope,
  IpcResponse,
  MachineInventoryDto,
  PolicyDesiredState,
  PolicyState,
  PolicyStateSummaryDto,
  PolicyItemDto
} from "./contracts";
import { MILESTONE_3_POLICIES } from "../lib/policies";

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

const SUPPORTED_DESIRED_STATES: readonly PolicyDesiredState[] = ["NotConfigured", "Blocked"];

function invalidPolicyRequest(envelope: IpcEnvelope, message: string, errorCode: string): IpcResponse<never> {
  return {
    id: crypto.randomUUID(),
    replyToId: envelope.id,
    success: false,
    error: message,
    errorCode
  };
}

const DISALLOWED_PAYLOAD_COMMAND_FIELDS = [
  "command",
  "script",
  "shell",
  "exec",
  "rawscript",
  "powershell",
  "cmd"
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

export function validateEnvelopeSchema(envelope: unknown): { isValid: boolean; error?: string; errorCode?: string } {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    return { isValid: false, error: "IPC message must be a valid JSON object envelope.", errorCode: "INVALID_ENVELOPE_SCHEMA" };
  }

  const env = envelope as Record<string, unknown>;

  if (typeof env.id !== "string" || !env.id.trim()) {
    return { isValid: false, error: "Envelope 'id' must be a non-empty string.", errorCode: "INVALID_ENVELOPE_ID" };
  }

  const validTypes = ["query", "command", "response", "event"];
  if (typeof env.type !== "string" || !validTypes.includes(env.type)) {
    return { isValid: false, error: `Envelope 'type' must be one of: ${validTypes.join(", ")}.`, errorCode: "INVALID_ENVELOPE_TYPE" };
  }

  if (typeof env.action !== "string") {
    return { isValid: false, error: "Envelope 'action' must be a string.", errorCode: "INVALID_ENVELOPE_ACTION" };
  }

  const actionCheck = validateIpcAction(env.action);
  if (!actionCheck.isValid) {
    return actionCheck;
  }

  // Schema-level validation on payload fields
  if (env.payload !== undefined && env.payload !== null) {
    if (typeof env.payload === "object" && !Array.isArray(env.payload)) {
      const payloadObj = env.payload as Record<string, unknown>;
      for (const key of Object.keys(payloadObj)) {
        if (DISALLOWED_PAYLOAD_COMMAND_FIELDS.includes(key.toLowerCase())) {
          return {
            isValid: false,
            error: `Disallowed command property '${key}' detected in payload. Arbitrary command execution is forbidden by typed IPC schema.`,
            errorCode: "FORBIDDEN_COMMAND_FIELD"
          };
        }
      }
    } else if (typeof env.payload === "string") {
      // Disallow raw string payloads that could represent arbitrary shell commands
      const shellCheck = validateNoArbitraryShell(env.payload);
      if (!shellCheck.isSafe) {
        return { isValid: false, error: shellCheck.error, errorCode: "FORBIDDEN_SHELL_INJECTION" };
      }
    }
  }

  return { isValid: true };
}

export class MockDesktopAgent implements DesktopIpcTransport {
  public readonly isRunning = true;
  public readonly mode = "Unprivileged Mock (In-Memory Development)";
  private readonly policyStates: Map<string, PolicyDesiredState> = new Map();
  private readonly transactions: Map<string, any> = new Map();

  public async handleRequest<T = unknown>(envelope: IpcEnvelope): Promise<IpcResponse<T>> {
    const schemaCheck = validateEnvelopeSchema(envelope);
    if (!schemaCheck.isValid) {
      return {
        id: crypto.randomUUID(),
        replyToId: typeof envelope?.id === "string" ? envelope.id : "",
        success: false,
        error: schemaCheck.error,
        errorCode: schemaCheck.errorCode
      };
    }

    const rawString = JSON.stringify(envelope);
    const shellCheck = validateNoArbitraryShell(rawString);
    if (!shellCheck.isSafe) {
      return {
        id: crypto.randomUUID(),
        replyToId: typeof envelope?.id === "string" ? envelope.id : "",
        success: false,
        error: shellCheck.error,
        errorCode: "FORBIDDEN_SHELL_INJECTION"
      };
    }

    const actionCheck = validateIpcAction(envelope.action);
    if (!actionCheck.isValid) {
      return {
        id: crypto.randomUUID(),
        replyToId: typeof envelope?.id === "string" ? envelope.id : "",
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

      case IPC_CONSTANTS.ACTION_CREATE_BASELINE:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: {
            transactionId: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            registryBaselinePath: "C:\\ProgramData\\WinLab\\Backups\\Registry-Baseline-Mock",
            appLockerBaselinePath: "C:\\ProgramData\\WinLab\\Backups\\AppLocker-Baseline-Mock.xml",
            success: true,
            message: "Baseline inicial capturado e registrado com sucesso em ambiente de simulação."
          } as unknown as T
        };

      case IPC_CONSTANTS.ACTION_GET_ENVIRONMENT:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: {
            environment: "MockDesktopAgent",
            isElevated: false,
            platform: "Simulated Windows"
          } as unknown as T
        };

      case IPC_CONSTANTS.ACTION_QUERY_POLICY_CATALOG:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: MILESTONE_3_POLICIES.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            description: p.description,
            riskLevel: p.riskLevel,
            scope: p.scope,
            reversible: p.reversible,
            requiresRestart: p.rebootRequired,
            requiresLogoff: p.requiresLogoff,
            requiresAppRestart: p.requiresAppRestart,
            targetProcesses: p.targetProcesses ?? []
          })) as unknown as T
        };

      case IPC_CONSTANTS.ACTION_QUERY_POLICY_STATES:
        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: this.getMockMilestone3PolicyStates() as unknown as T
        };

      case IPC_CONSTANTS.ACTION_APPLY_TRANSACTION: {
        const payload = (envelope.payload ?? {}) as Record<string, unknown>;
        const targetSid = typeof payload.targetUserSid === "string" ? payload.targetUserSid.trim() : "";
        const targetName = typeof payload.targetUserName === "string" ? payload.targetUserName.trim() : "";

        if (
          targetSid === "S-1-5-32-544" ||
          targetSid.endsWith("-500") ||
          targetName.toLowerCase() === "administrador" ||
          targetName.toLowerCase() === "administrator"
        ) {
          return {
            id: crypto.randomUUID(),
            replyToId: envelope.id,
            success: false,
            error: "Violação de segurança: Contas de Administrador possuem imunidade e não podem receber restrições de laboratório.",
            errorCode: "ADMIN_IMMUNITY_VIOLATION"
          };
        }

        const txId = typeof payload.transactionId === "string" && payload.transactionId ? payload.transactionId : crypto.randomUUID();

        if (!Array.isArray(payload.policies)) {
          return invalidPolicyRequest(
            envelope,
            "A lista de políticas é obrigatória e deve ser um array. A solicitação foi rejeitada sem aplicar nenhuma política.",
            "INVALID_POLICY_REQUEST"
          ) as unknown as IpcResponse<T>;
        }

        const rawPolicies = payload.policies as unknown[];
        if (rawPolicies.length === 0) {
          return invalidPolicyRequest(
            envelope,
            "A lista de políticas solicitadas não pode ser vazia.",
            "INVALID_POLICY_REQUEST"
          ) as unknown as IpcResponse<T>;
        }

        if (this.transactions.has(txId)) {
          return invalidPolicyRequest(
            envelope,
            `TransactionId '${txId}' já pertence a uma transação registrada. A solicitação foi rejeitada sem aplicar nenhuma política.`,
            "TRANSACTION_ID_COLLISION"
          ) as unknown as IpcResponse<T>;
        }

        const policies: Array<{ policyId: string; desiredState: PolicyDesiredState }> = [];
        for (const entry of rawPolicies) {
          if (entry === null || typeof entry !== "object") {
            return invalidPolicyRequest(
              envelope,
              "Item de política nulo ou malformado. A solicitação foi rejeitada sem aplicar nenhuma política.",
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }

          const record = entry as Record<string, unknown>;
          const policyId = typeof record.policyId === "string" ? record.policyId : "";
          if (!policyId.trim()) {
            return invalidPolicyRequest(
              envelope,
              "Item de política sem identificador válido (policyId). A solicitação foi rejeitada sem aplicar nenhuma política.",
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }

          if (policyId.trim() !== policyId) {
            return invalidPolicyRequest(
              envelope,
              `PolicyId '${policyId}' contém espaços nas extremidades. Use o identificador canônico do catálogo.`,
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }

          const canonicalPolicy = MILESTONE_3_POLICIES.find((p) => p.id.toLowerCase() === policyId.toLowerCase());
          if (!canonicalPolicy) {
            return invalidPolicyRequest(
              envelope,
              `Política desconhecida no catálogo: '${policyId}'. A solicitação foi rejeitada sem aplicar nenhuma política.`,
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }

          const rawDesired = record.desiredState;
          if (typeof rawDesired === "string" && rawDesired.trim() !== rawDesired) {
            return invalidPolicyRequest(
              envelope,
              `DesiredState '${rawDesired}' contém espaços não permitidos. Use o nome exato do estado (NotConfigured, Blocked).`,
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }
          if (typeof rawDesired === "number") {
            return invalidPolicyRequest(
              envelope,
              `DesiredState '${rawDesired}' usa representação numérica, que não é aceita. Use o nome do estado (NotConfigured, Blocked).`,
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }
          if (typeof rawDesired !== "string" || !rawDesired.trim()) {
            return invalidPolicyRequest(
              envelope,
              `DesiredState ausente, vazio ou de tipo inválido para '${policyId}'. Valores suportados: NotConfigured, Blocked.`,
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }

          const normalized = rawDesired.trim().toLowerCase();
          if (normalized === "allowed") {
            return invalidPolicyRequest(
              envelope,
              "BLOCKED — CONTRACT DECISION REQUIRED: DesiredState 'Allowed' não possui semântica implementada e não pode ser convertido silenciosamente para NotConfigured ou Blocked.",
              "UNSUPPORTED_DESIRED_STATE"
            ) as unknown as IpcResponse<T>;
          }

          const desired = SUPPORTED_DESIRED_STATES.find((s) => s.toLowerCase() === normalized);
          if (!desired) {
            return invalidPolicyRequest(
              envelope,
              `DesiredState '${rawDesired}' é desconhecido, operacional ou incompatível com o contrato. Valores suportados: NotConfigured, Blocked.`,
              "INVALID_POLICY_REQUEST"
            ) as unknown as IpcResponse<T>;
          }

          policies.push({ policyId: canonicalPolicy.id, desiredState: desired });
        }

        for (const item of policies) {
          this.policyStates.set(item.policyId, item.desiredState);
        }

        const txRecord = {
          transactionId: txId,
          status: "Committed",
          createdAt: new Date().toISOString(),
          targetUserName: targetName,
          targetUserSid: targetSid,
          policies
        };
        this.transactions.set(txId, txRecord);

        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: {
            transactionId: txId,
            status: "Committed",
            appliedCount: policies.length,
            rolledBackCount: 0,
            success: true,
            message: `Todas as ${policies.length} políticas foram aplicadas, verificadas e confirmadas com sucesso.`
          } as unknown as T
        };
      }

      case IPC_CONSTANTS.ACTION_ROLLBACK_TRANSACTION: {
        const payload = (envelope.payload ?? {}) as Record<string, unknown>;
        const txId = typeof payload.transactionId === "string" ? payload.transactionId : "";
        const tx = this.transactions.get(txId);

        if (tx) {
          tx.status = "RolledBack";
          for (const item of tx.policies || []) {
            this.policyStates.set(item.policyId, "NotConfigured");
          }
        }

        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: true,
          data: {
            transactionId: txId,
            status: "RolledBack",
            restoredCount: tx?.policies?.length ?? 0,
            success: true,
            message: `Transação '${txId}' revertida com sucesso.`
          } as unknown as T
        };
      }

      case IPC_CONSTANTS.ACTION_QUERY_TRANSACTION_STATUS: {
        const payload = (envelope.payload ?? {}) as Record<string, unknown>;
        const txId = typeof payload.transactionId === "string" ? payload.transactionId : "";
        const tx = this.transactions.get(txId);

        if (tx) {
          return {
            id: crypto.randomUUID(),
            replyToId: envelope.id,
            success: true,
            data: tx as unknown as T
          };
        }

        return {
          id: crypto.randomUUID(),
          replyToId: envelope.id,
          success: false,
          error: `Transação '${txId}' não encontrada.`,
          errorCode: "TRANSACTION_NOT_FOUND"
        };
      }

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
      isMock: true,
      windows: {
        caption: "Windows 11 Pro",
        version: "10.0.26100",
        buildNumber: "26100",
        architecture: "64 bits",
        edition: "Professional",
        displayVersion: "24H2",
        ubr: 1742,
        is64Bit: true,
        tpmPresent: true,
        tpmVersion: "2.0",
        secureBootEnabled: true
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

  public browserRunning = false;
  public setBrowserRunning(running: boolean): void {
    this.browserRunning = running;
  }

  public getMockMilestone3PolicyStates(): PolicyStateSummaryDto {
    const items: PolicyItemDto[] = MILESTONE_3_POLICIES.map((p) => {
      const raw: PolicyDesiredState = this.policyStates.get(p.id) ?? "NotConfigured";
      const isBlocked = raw === "Blocked";

      let effective: PolicyState = "NotConfigured";
      let current: PolicyState = "NotConfigured";

      if (isBlocked) {
        if (p.requiresLogoff) {
          effective = "PendingLogoff";
          current = "Applied";
        } else if (p.requiresAppRestart) {
          effective = this.browserRunning ? "PendingAppRestart" : "Applied";
          current = this.browserRunning ? "PendingAppRestart" : "Applied";
        } else {
          effective = "Applied";
          current = "Applied";
        }
      }

      return {
        id: p.id,
        category: p.category,
        title: p.name,
        description: p.description,
        scope: p.scope,
        risk: p.riskLevel,
        currentState: current,
        desiredState: raw,
        configuredState: raw,
        effectiveState: effective,
        requiresRestart: p.rebootRequired,
        requiresLogoff: p.requiresLogoff,
        requiresAppRestart: p.requiresAppRestart,
        reversible: p.reversible
      };
    });

    const applied = items.filter((i) => i.effectiveState === "Applied" || i.currentState === "Applied").length;
    const notConfigured = items.filter((i) => i.effectiveState === "NotConfigured").length;
    const pending = items.filter((i) => i.effectiveState === "PendingLogoff" || i.effectiveState === "PendingAppRestart" || i.effectiveState === "PendingFirstLogon").length;

    return {
      totalPolicies: items.length,
      appliedCount: applied,
      notConfiguredCount: notConfigured,
      pendingCount: pending,
      items
    };
  }
}
