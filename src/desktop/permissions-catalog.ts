import type { PolicyItemDto } from "./contracts";
import type {
  AdminPermissionDto,
  AdminPermissionIntent,
  AdminPermissionStateDto,
  AdminPolicyOrigin
} from "./admin-contracts-compat";
import { getPolicyDefinition } from "../lib/policies";
import {
  computePolicyVisualModel,
  type ItemExecutionPhase,
  type PolicyExecutionOutcome,
  type VisualBadgeTone
} from "./policy-state-machine";

export type DesktopSection =
  | "overview"
  | "accounts"
  | "permissions"
  | "profiles"
  | "network"
  | "security"
  | "diagnostics"
  | "history"
  | "settings";

export interface NavigationItemMeta {
  id: DesktopSection;
  label: string;
  shortDescription: string;
}

export const DESKTOP_NAVIGATION_ITEMS: readonly NavigationItemMeta[] = [
  {
    id: "overview",
    label: "Visão geral",
    shortDescription: "Resumo da estação, contas, políticas aplicadas, pendências e atalhos."
  },
  {
    id: "accounts",
    label: "Contas e usuários",
    shortDescription: "Seleção da conta-alvo, papéis Superadmin/Recuperação/Aluno e criação local."
  },
  {
    id: "permissions",
    label: "Permissões",
    shortDescription: "Central de políticas por usuário e de máquina agrupadas por área."
  },
  {
    id: "profiles",
    label: "Perfis de laboratório",
    shortDescription: "Presets de sala de aula, perfis salvos e importação/exportação JSON."
  },
  {
    id: "network",
    label: "Rede e arquivos",
    shortDescription: "Diagnóstico SMB atual e geração de scripts de pasta compartilhada."
  },
  {
    id: "security",
    label: "Segurança",
    shortDescription: "Separação de privilégios, proteção de contas administrativas, escopo de máquina, TPM, Secure Boot e drift."
  },
  {
    id: "diagnostics",
    label: "Diagnóstico",
    shortDescription: "Relatório técnico somente leitura, inventário de softwares e exportação JSON."
  },
  {
    id: "history",
    label: "Histórico e recuperação",
    shortDescription: "Transações da sessão, reversão (rollback) e criação manual de baseline."
  },
  {
    id: "settings",
    label: "Configurações",
    shortDescription: "Modo Demo/Real, atualizações, acessibilidade, atalhos e inspeção IPC."
  }
];

export type PermissionGroup =
  | "Sistema"
  | "Personalização"
  | "Aplicativos"
  | "Internet"
  | "Dispositivos";

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  "Sistema",
  "Personalização",
  "Aplicativos",
  "Internet",
  "Dispositivos"
];

export interface AdminIntentMetadata {
  label: string;
  shortDesc: string;
  previewActionLabel: string;
}

/**
 * Diferenciacao explicita das 4 intencoes administrativas. Nunca trata Permitir,
 * Bloquear, Herdar/Preservar e Restaurar como operacoes equivalentes.
 */
export const ADMIN_INTENT_META: Record<AdminPermissionIntent, AdminIntentMetadata> = {
  Allow: {
    label: "Permitir",
    shortDesc:
      "Remove o bloqueio WinLab quando possível segundo o baseline registrado (outras políticas do Windows ainda podem bloquear).",
    previewActionLabel: "Permitir (remover bloqueio WinLab quando possível)"
  },
  Block: {
    label: "Bloquear",
    shortDesc: "Aplica a restrição suportada pelo catálogo do WinLab no registro do Windows.",
    previewActionLabel: "Bloquear (aplicar restrição suportada)"
  },
  Preserve: {
    label: "Herdar / Preservar",
    shortDesc: "Mantém a configuração atualmente observada sem gravar alteração no sistema.",
    previewActionLabel: "Herdar / Preservar (manter configuração atual sem alteração)"
  },
  Restore: {
    label: "Restaurar",
    shortDesc: "Recupera exatamente o baseline registrado pelo WinLab antes da última restrição.",
    previewActionLabel: "Restaurar (recuperar baseline registrado)"
  }
};

export interface PermissionMetadataEntry {
  group: PermissionGroup;
  simpleName: string;
  expectedEffectWhenBlocked: string;
  expectedEffectWhenInherited: string;
  compatibility: string;
}

const PERMISSION_METADATA: Record<string, PermissionMetadataEntry> = {
  "personalization.wallpaper": {
    group: "Personalização",
    simpleName: "Alterar papel de parede",
    expectedEffectWhenBlocked:
      "Impede que a conta comum selecionada altere o plano de fundo; aplicada apenas ao perfil da conta comum selecionada.",
    expectedEffectWhenInherited:
      "Remove a trava WinLab no registro do usuário e restaura a personalização padrão do Windows.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "personalization.sounds": {
    group: "Personalização",
    simpleName: "Alterar esquema de sons",
    expectedEffectWhenBlocked:
      "Desabilita a troca de esquemas sonoros no Painel de Sons e Configurações para a conta comum selecionada.",
    expectedEffectWhenInherited:
      "Restaura o comportamento padrão para seleção de esquemas de áudio conforme padrão do Windows.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "personalization.mouse_pointers": {
    group: "Personalização",
    simpleName: "Alterar ponteiros do mouse",
    expectedEffectWhenBlocked:
      "Impede troca de cursores e carregamento de ponteiros personalizados (.cur/.ani) pela conta comum selecionada.",
    expectedEffectWhenInherited:
      "Restaura o comportamento padrão do Windows para ajuste de ponteiros do mouse.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "personalization.lock_screen": {
    group: "Personalização",
    simpleName: "Alterar imagem da tela de bloqueio",
    expectedEffectWhenBlocked:
      "Impede mudar a imagem da tela de bloqueio e de entrada no Windows; política de máquina inteira (HKLM) que afeta todas as contas, inclusive administradores.",
    expectedEffectWhenInherited:
      "Remove a restrição WinLab de tela de bloqueio na máquina e restaura o comportamento padrão do Windows.",
    compatibility: "Windows 10 e 11 · Máquina inteira (HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization)"
  },
  "browser.chrome.incognito": {
    group: "Internet",
    simpleName: "Usar janela anônima / InPrivate (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Desativa o modo anônimo no Google Chrome e InPrivate no Microsoft Edge para todas as contas do computador, inclusive administradores.",
    expectedEffectWhenInherited:
      "Remove a política de máquina no registro e restaura a navegação anônima padrão dos navegadores.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
  },
  "browser.chrome.guest": {
    group: "Internet",
    simpleName: "Usar modo convidado / visitante (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Oculta sessões de visitante no Chrome e Edge para todas as contas desta máquina, inclusive administradores.",
    expectedEffectWhenInherited:
      "Restaura o comportamento padrão dos navegadores quanto ao perfil de convidado.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
  },
  "browser.password_manager": {
    group: "Internet",
    simpleName: "Salvar senhas nos navegadores (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Impede que Chrome e Edge ofereçam salvar credenciais em todas as contas da estação, inclusive administradores.",
    expectedEffectWhenInherited:
      "Remove a restrição de máquina e devolve o controle de senhas ao padrão do navegador.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
  },
  "browser.developer_tools": {
    group: "Internet",
    simpleName: "Abrir Ferramentas do Desenvolvedor / F12 (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Desativa o DevTools (F12 e Inspecionar) no Chrome e Edge para todas as contas desta estação, inclusive administradores.",
    expectedEffectWhenInherited:
      "Restaura o acesso padrão às Ferramentas do Desenvolvedor nos navegadores.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
  },
  "network.lan_properties": {
    group: "Internet",
    simpleName: "Alterar propriedades de conexões LAN / rede",
    expectedEffectWhenBlocked:
      "Bloqueia a abertura das propriedades da conexão de rede no painel clássico apenas para a conta comum selecionada (controles de rede por outros caminhos continuam válidos).",
    expectedEffectWhenInherited:
      "Remove a restrição WinLab da conta comum e restaura o comportamento padrão do painel de rede.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>, NC_LanProperties)"
  },
  "system.disable_cmd": {
    group: "Sistema",
    simpleName: "Abrir Prompt de Comando (CMD)",
    expectedEffectWhenBlocked:
      "Bloqueia a abertura interativa do cmd.exe apenas na conta comum selecionada; scripts administrativos e de logon seguem preservados.",
    expectedEffectWhenInherited:
      "Restaura o acesso padrão ao Prompt de Comando para a conta comum selecionada.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>, DisableCMD=2)"
  },
  "system.disable_regedit": {
    group: "Sistema",
    simpleName: "Editar Registro do Windows (Regedit)",
    expectedEffectWhenBlocked:
      "Impede que a conta comum selecionada abra o regedit.exe ou importe arquivos .reg manualmente; executor WinLab não é afetado.",
    expectedEffectWhenInherited:
      "Remove o bloqueio WinLab de edição do registro na conta selecionada (sem conceder direitos admin).",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "system.restrict_control_panel": {
    group: "Sistema",
    simpleName: "Acessar Painel de Controle e Configurações",
    expectedEffectWhenBlocked:
      "Bloqueia o Painel de Controle clássico e o app Configurações do Windows na conta comum selecionada; exige novo logon.",
    expectedEffectWhenInherited:
      "Restaura a abertura do Painel de Controle e Configurações conforme padrão do Windows.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "system.task_manager": {
    group: "Sistema",
    simpleName: "Abrir Gerenciador de Tarefas",
    expectedEffectWhenBlocked:
      "Remove o acesso ao Gerenciador de Tarefas apenas na conta comum selecionada; exige novo logon.",
    expectedEffectWhenInherited:
      "Restaura o acesso padrão ao Gerenciador de Tarefas para a conta comum selecionada.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>, DisableTaskMgr)"
  },
  "settings.hide_network_pages": {
    group: "Sistema",
    simpleName: "Acessar páginas de rede e proxy em Configurações",
    expectedEffectWhenBlocked:
      "Oculta as páginas de status, Ethernet, Wi-Fi e proxy no app Configurações apenas para a conta comum selecionada.",
    expectedEffectWhenInherited:
      "Restaura a visibilidade das páginas de rede e proxy em Configurações para a conta selecionada.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>, SettingsPageVisibility)"
  },
  "storage.usb_write_protect": {
    group: "Dispositivos",
    simpleName: "Gravar arquivos em pendrives USB",
    expectedEffectWhenBlocked:
      "Bloqueia escrita e cópia para mídias removíveis USB em toda a máquina (inclusive administradores), mantendo leitura, teclado e mouse funcionando.",
    expectedEffectWhenInherited:
      "Remove a proteção contra gravação em USB no registro da máquina.",
    compatibility: "Windows 10 e 11 · Máquina inteira (HKLM\\SYSTEM\\...\\StorageDevicePolicies)"
  },
  "apps.disable_microsoft_store": {
    group: "Aplicativos",
    simpleName: "Abrir a Microsoft Store",
    expectedEffectWhenBlocked:
      "Bloqueia o acesso à loja de aplicativos do Windows apenas para a conta comum selecionada.",
    expectedEffectWhenInherited:
      "Restaura o acesso padrão à Microsoft Store para a conta selecionada.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "apps.block_unmanaged_msi": {
    group: "Aplicativos",
    simpleName: "Executar instaladores MSI não gerenciados",
    expectedEffectWhenBlocked:
      "Restringe instalações via Windows Installer (.msi) em toda a máquina (inclusive administradores); executáveis .exe têm controles próprios.",
    expectedEffectWhenInherited:
      "Remove a trava WinLab do Windows Installer (.msi) na máquina.",
    compatibility: "Windows 10 e 11 · Máquina inteira (HKLM\\SOFTWARE\\...\\Installer\\DisableMSI)"
  },
  "account.local_management": {
    group: "Sistema",
    simpleName: "Gerenciar contas locais no Painel",
    expectedEffectWhenBlocked:
      "Impede alterações de contas locais pela conta comum selecionada.",
    expectedEffectWhenInherited:
      "Restaura a visibilidade padrão conforme privilégios de usuário comum.",
    compatibility: "Windows 10 e 11 · Registro por usuário"
  }
};

const TECHNICAL_PROBE_FALLBACK: Record<string, { hive: string; subKey: string; valueName: string }> = {
  "personalization.lock_screen": {
    hive: "HKLM",
    subKey: "SOFTWARE\\Policies\\Microsoft\\Windows\\Personalization",
    valueName: "NoChangingLockScreen"
  },
  "system.task_manager": {
    hive: "HKU/<SID>",
    subKey: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System",
    valueName: "DisableTaskMgr"
  },
  "network.lan_properties": {
    hive: "HKU/<SID>",
    subKey: "SOFTWARE\\Policies\\Microsoft\\Windows\\Network Connections",
    valueName: "NC_LanProperties"
  },
  "settings.hide_network_pages": {
    hive: "HKU/<SID>",
    subKey: "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer",
    valueName: "SettingsPageVisibility"
  },
  "apps.block_unmanaged_msi": {
    hive: "HKLM",
    subKey: "SOFTWARE\\Policies\\Microsoft\\Windows\\Installer",
    valueName: "DisableMSI"
  }
};

export function mapCategoryToPermissionGroup(category: string, policyId = ""): PermissionGroup {
  if (PERMISSION_METADATA[policyId]) {
    return PERMISSION_METADATA[policyId].group;
  }
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("personaliza")) return "Personalização";
  if (normalized.includes("aplicativ") || normalized.includes("app")) return "Aplicativos";
  if (
    normalized.includes("navegador") ||
    normalized.includes("browser") ||
    normalized.includes("internet") ||
    normalized.includes("rede") ||
    normalized.includes("network")
  ) {
    return "Internet";
  }
  if (
    normalized.includes("armazenamento") ||
    normalized.includes("storage") ||
    normalized.includes("usb") ||
    normalized.includes("dispositiv")
  ) {
    return "Dispositivos";
  }
  return "Sistema";
}

export function formatAdminOriginLabel(origin: AdminPolicyOrigin): string {
  switch (origin) {
    case "WinLab":
      return "Gerenciada pelo WinLab";
    case "ExternalLocal":
      return "Política local externa";
    case "InstitutionalPossible":
      return "Possível gerenciamento institucional";
    case "Inconclusive":
      return "Origem inconclusiva";
    default:
      return "Sem política gravada";
  }
}

export interface PermissionTechnicalDetails {
  policyId: string;
  hive: string;
  subKey: string;
  valueName: string;
  riskLabel: string;
  reversibleText: string;
  configuredState: string;
  effectiveState: string;
  evidence: string | null;
  lastVerified: string | null;
}

export interface PermissionCardViewModel {
  id: string;
  group: PermissionGroup;
  simpleName: string;
  title: string;
  description: string;
  currentStateLabel: string;
  currentStateTone: VisualBadgeTone;
  expectedEffect: string;
  scopeKind: "User" | "Machine";
  scopeBadge: string;
  compatibility: string;
  restartBadge: string;
  requiresRestart: boolean;
  requiresLogoff: boolean;
  requiresAppRestart: boolean;
  operationPhase: ItemExecutionPhase;
  operationPhaseLabel: string;
  operationDetail?: string;
  hasPendingChange: boolean;
  pendingDesiredLabel: string | null;
  switchChecked: boolean;
  disabled: boolean;
  disabledReason?: string;
  controlMode: "binary-compat" | "admin-intents";
  supportedIntents?: AdminPermissionIntent[];
  activeAdminIntent?: AdminPermissionIntent | null;
  originLabel?: string;
  limitations?: string[];
  technicalDetails: PermissionTechnicalDetails;
}

const RISK_LABELS: Record<string, string> = {
  Low: "Baixo",
  Medium: "Moderado",
  High: "Elevado",
  Critical: "Crítico"
};

function formatRestartBadge(policy: {
  requiresRestart: boolean;
  requiresLogoff: boolean;
  requiresAppRestart?: boolean;
}): string {
  const parts: string[] = [];
  if (policy.requiresRestart) parts.push("Requer reiniciar o Windows");
  if (policy.requiresLogoff) parts.push("Requer novo login (logoff)");
  if (policy.requiresAppRestart) parts.push("Requer reiniciar navegador");
  return parts.length > 0 ? parts.join(" · ") : "Efeito imediato";
}

function formatVerifiedCurrentState(policy: PolicyItemDto): {
  label: string;
  tone: VisualBadgeTone;
} {
  const effective = policy.effectiveState ?? policy.currentState;
  switch (effective) {
    case "Applied":
    case "Blocked":
      return { label: "Bloqueada e verificada", tone: "active" };
    case "Allowed":
      return { label: "Permitida explicitamente", tone: "active" };
    case "PendingLogoff":
      return { label: "Configurada (aguarda novo login)", tone: "warning" };
    case "PendingReboot":
      return { label: "Configurada (aguarda reinício)", tone: "warning" };
    case "PendingAppRestart":
      return { label: "Configurada (reinicie o navegador)", tone: "warning" };
    case "PendingFirstLogon":
      return { label: "Configurada (aguarda 1º login)", tone: "warning" };
    case "Drifted":
      return { label: "Divergente (alterada fora do WinLab)", tone: "error" };
    case "Inconclusive":
      return { label: "Consulta inconclusiva", tone: "neutral" };
    case "Failed":
      return { label: "Falha na verificação", tone: "error" };
    case "NotSupported":
      return { label: "Não suportada nesta edição", tone: "neutral" };
    case "Reverted":
      return { label: "Revertida ao padrão", tone: "inactive" };
    default:
      return { label: "Padrão do Windows (Herdada)", tone: "inactive" };
  }
}

function formatAdminPermissionState(state: AdminPermissionStateDto): {
  label: string;
  tone: VisualBadgeTone;
  isBlocked: boolean;
  activeIntent: AdminPermissionIntent | null;
} {
  if (state.origin === "Inconclusive" || state.configuredState === "Inconclusive" || state.effectiveState === "Inconclusive") {
    return {
      label: "Consulta inconclusiva",
      tone: "neutral",
      isBlocked: false,
      activeIntent: null
    };
  }
  if (state.configuredState === "Blocked" || state.effectiveState === "Blocked" || state.effectiveState === "Applied") {
    const label =
      state.origin === "WinLab"
        ? state.effectiveState === "NotVerified"
          ? "Bloqueio WinLab no registro (efeito requer sessão)"
          : "Bloqueada pelo WinLab"
        : `Bloqueio detectado (${formatAdminOriginLabel(state.origin)})`;
    return {
      label,
      tone: state.origin === "WinLab" ? "active" : "warning",
      isBlocked: true,
      activeIntent: "Block"
    };
  }
  if (state.configuredState === "Configured") {
    return {
      label: `Configurada no registro (${formatAdminOriginLabel(state.origin)})`,
      tone: "warning",
      isBlocked: false,
      activeIntent: "Preserve"
    };
  }
  if (state.configuredState === "Allowed" || state.effectiveState === "Allowed") {
    return {
      label: "Permitida (sem bloqueio WinLab)",
      tone: "active",
      isBlocked: false,
      activeIntent: "Allow"
    };
  }
  return {
    label: "Sem bloqueio gravado (Padrão)",
    tone: "inactive",
    isBlocked: false,
    activeIntent: "Preserve"
  };
}

function formatOperationPhase(params: {
  isApplying: boolean;
  hasPendingChange: boolean;
  pendingEnabled: boolean | undefined;
  outcome?: PolicyExecutionOutcome;
}): {
  phase: ItemExecutionPhase;
  label: string;
  detail?: string;
} {
  const { isApplying, hasPendingChange, pendingEnabled, outcome } = params;
  if (isApplying && hasPendingChange) {
    return {
      phase: "processing",
      label: "Em processamento — aguardando executor",
      detail: "Aguardando confirmação do agente elevado e releitura."
    };
  }
  if (hasPendingChange) {
    return {
      phase: "selected",
      label: pendingEnabled
        ? "Selecionada: Bloquear (não aplicada)"
        : "Selecionada: Herdar padrão (não aplicada)"
    };
  }
  if (outcome) {
    if (outcome.phase === "confirmed") {
      return { phase: "confirmed", label: "Confirmada na última execução", detail: outcome.detail };
    }
    if (outcome.phase === "inconclusive") {
      return { phase: "inconclusive", label: "Inconclusiva na releitura", detail: outcome.detail };
    }
    return { phase: "failed", label: "Falhou na última tentativa", detail: outcome.detail };
  }
  return { phase: "idle", label: "Sem alteração pendente" };
}

/**
 * Constroi o modelo visual para permissoes vindas diretamente do contrato administrativo (AdminPermissionDto),
 * cobrindo as 12 politicas legadas + 5 novas politicas administrativas com 4 intencoes distintas.
 */
export function buildPermissionCardFromAdminDto(params: {
  permission: AdminPermissionDto;
  canWrite: boolean;
  isApplying: boolean;
  hasSelectedStandardUser: boolean;
  selectedUserName?: string | null;
  executionOutcome?: PolicyExecutionOutcome;
}): PermissionCardViewModel {
  const {
    permission,
    canWrite,
    isApplying,
    hasSelectedStandardUser,
    selectedUserName,
    executionOutcome
  } = params;
  const meta = PERMISSION_METADATA[permission.id];
  const def = getPolicyDefinition(permission.id);
  const probeFallback = TECHNICAL_PROBE_FALLBACK[permission.id];
  const scopeKind: "User" | "Machine" = permission.scope === "User" ? "User" : "Machine";
  const scopeBadge =
    scopeKind === "User"
      ? selectedUserName
        ? `Por usuário (${selectedUserName})`
        : "Por usuário (conta comum)"
      : "Máquina inteira (todas as contas)";

  const stateInfo = formatAdminPermissionState(permission.state);
  const originLabel = formatAdminOriginLabel(permission.state.origin);

  let disabled = false;
  let disabledReason: string | undefined;
  if (isApplying) {
    disabled = true;
    disabledReason = "Aguarde a conclusão da operação administrativa em andamento.";
  } else if (!permission.supported) {
    disabled = true;
    disabledReason = "Esta permissão não é suportada nesta edição ou ambiente do Windows.";
  } else if (scopeKind === "User" && !hasSelectedStandardUser) {
    disabled = true;
    disabledReason = "Selecione ou crie uma conta comum válida antes de consultar ou pré-visualizar políticas por usuário.";
  } else if (!canWrite && !permission.intents.includes("Preserve")) {
    disabled = true;
    disabledReason = "Modo somente leitura ativo (canWrite = false).";
  }

  let phase: ItemExecutionPhase = "idle";
  let phaseLabel = "Pronta para prévia explícita";
  let phaseDetail: string | undefined;
  if (stateInfo.activeIntent === null) {
    phase = "inconclusive";
    phaseLabel = "Leitura inconclusiva — consulte sob UAC se necessário";
  }
  if (executionOutcome) {
    if (executionOutcome.phase === "confirmed") {
      phase = "confirmed";
      phaseLabel = "Confirmada na última execução";
      phaseDetail = executionOutcome.detail;
    } else if (executionOutcome.phase === "inconclusive") {
      phase = "inconclusive";
      phaseLabel = "Inconclusiva na releitura";
      phaseDetail = executionOutcome.detail;
    } else {
      phase = "failed";
      phaseLabel = "Falhou na última tentativa";
      phaseDetail = executionOutcome.detail;
    }
  }

  return {
    id: permission.id,
    group: mapCategoryToPermissionGroup(permission.category, permission.id),
    simpleName: meta?.simpleName ?? permission.name,
    title: permission.name,
    description: permission.description,
    currentStateLabel: stateInfo.label,
    currentStateTone: stateInfo.tone,
    expectedEffect: permission.expectedEffect || meta?.expectedEffectWhenBlocked || permission.description,
    scopeKind,
    scopeBadge,
    compatibility: permission.supported
      ? permission.compatibility || meta?.compatibility || (scopeKind === "User" ? "Registro por usuário" : "Máquina inteira (HKLM)")
      : `Indisponível: ${permission.compatibility || "edição atual do Windows"}`,
    restartBadge: formatRestartBadge(permission),
    requiresRestart: permission.requiresRestart,
    requiresLogoff: permission.requiresLogoff,
    requiresAppRestart: permission.requiresAppRestart,
    operationPhase: phase,
    operationPhaseLabel: phaseLabel,
    operationDetail: phaseDetail,
    hasPendingChange: false,
    pendingDesiredLabel: null,
    switchChecked: stateInfo.isBlocked,
    disabled,
    disabledReason,
    controlMode: "admin-intents",
    supportedIntents: permission.intents,
    activeAdminIntent: stateInfo.activeIntent,
    originLabel,
    limitations: permission.limitations,
    technicalDetails: {
      policyId: permission.id,
      hive: def?.primaryProbe.hive ?? probeFallback?.hive ?? (scopeKind === "User" ? "HKU/<SID>" : "HKLM"),
      subKey: def?.primaryProbe.subKey ?? probeFallback?.subKey ?? "Definido pelo catálogo do executor",
      valueName: def?.primaryProbe.valueName ?? probeFallback?.valueName ?? "—",
      riskLabel: RISK_LABELS[permission.risk] ?? permission.risk,
      reversibleText: "Com snapshot/baseline registrado pelo WinLab",
      configuredState: permission.state.configuredState,
      effectiveState: permission.state.effectiveState,
      evidence: permission.state.evidence ?? null,
      lastVerified: null
    }
  };
}

export function buildPermissionCardViewModel(params: {
  policy: PolicyItemDto;
  pendingPolicies: Record<string, boolean>;
  isApplying: boolean;
  hasSelectedStandardUser: boolean;
  selectedUserName?: string | null;
  executionOutcome?: PolicyExecutionOutcome;
  adminOverride?: AdminPermissionDto | null;
  adminCanWrite?: boolean;
}): PermissionCardViewModel {
  const {
    policy,
    pendingPolicies,
    isApplying,
    hasSelectedStandardUser,
    selectedUserName,
    executionOutcome,
    adminOverride,
    adminCanWrite = true
  } = params;

  if (adminOverride) {
    return buildPermissionCardFromAdminDto({
      permission: adminOverride,
      canWrite: adminCanWrite,
      isApplying,
      hasSelectedStandardUser,
      selectedUserName,
      executionOutcome
    });
  }

  const meta = PERMISSION_METADATA[policy.id];
  const def = getPolicyDefinition(policy.id);
  const probeFallback = TECHNICAL_PROBE_FALLBACK[policy.id];
  const visual = computePolicyVisualModel(policy, pendingPolicies, {
    isApplying,
    hasSelectedStandardUser
  });
  const currentState = formatVerifiedCurrentState(policy);
  const scopeKind: "User" | "Machine" = policy.scope === "User" ? "User" : "Machine";
  const scopeBadge =
    scopeKind === "User"
      ? selectedUserName
        ? `Por usuário (${selectedUserName})`
        : "Por usuário (conta comum)"
      : "Máquina inteira (todas as contas)";

  const targetWillBlock = visual.hasPendingChange
    ? Boolean(pendingPolicies[policy.id])
    : visual.currentlyEnabled;

  const expectedEffect = meta
    ? targetWillBlock
      ? meta.expectedEffectWhenBlocked
      : meta.expectedEffectWhenInherited
    : policy.description;

  const compatibility =
    (policy.effectiveState ?? policy.currentState) === "NotSupported"
      ? "Não suportada nesta edição do Windows."
      : meta?.compatibility ??
        (scopeKind === "User"
          ? "Windows 10 e 11 · Registro por usuário"
          : "Windows 10 e 11 · Máquina inteira (HKLM)");

  const phaseInfo = formatOperationPhase({
    isApplying,
    hasPendingChange: visual.hasPendingChange,
    pendingEnabled: pendingPolicies[policy.id],
    outcome: executionOutcome
  });

  const probe = def?.primaryProbe;

  return {
    id: policy.id,
    group: mapCategoryToPermissionGroup(policy.category, policy.id),
    simpleName: meta?.simpleName ?? policy.title,
    title: policy.title,
    description: policy.description,
    currentStateLabel: currentState.label,
    currentStateTone: currentState.tone,
    expectedEffect,
    scopeKind,
    scopeBadge,
    compatibility,
    restartBadge: formatRestartBadge(policy),
    requiresRestart: policy.requiresRestart,
    requiresLogoff: policy.requiresLogoff,
    requiresAppRestart: Boolean(policy.requiresAppRestart),
    operationPhase: phaseInfo.phase,
    operationPhaseLabel: phaseInfo.label,
    operationDetail: phaseInfo.detail,
    hasPendingChange: visual.hasPendingChange,
    pendingDesiredLabel: visual.hasPendingChange
      ? pendingPolicies[policy.id]
        ? "Bloquear"
        : "Herdar padrão (Remover bloqueio)"
      : null,
    switchChecked: visual.switchChecked,
    disabled: visual.disabled,
    disabledReason: visual.disabledReason,
    controlMode: "binary-compat",
    technicalDetails: {
      policyId: policy.id,
      hive: probe?.hive ?? probeFallback?.hive ?? (scopeKind === "User" ? "HKU/<SID>" : "HKLM"),
      subKey: probe?.subKey ?? probeFallback?.subKey ?? "Definido pelo catálogo do executor",
      valueName: probe?.valueName ?? probeFallback?.valueName ?? "—",
      riskLabel: RISK_LABELS[policy.risk] ?? policy.risk,
      reversibleText: policy.reversible ? "Sim (com snapshot de rollback)" : "Reversão manual",
      configuredState: String(policy.configuredState ?? policy.desiredState),
      effectiveState: String(policy.effectiveState ?? policy.currentState),
      evidence: policy.evidence ?? null,
      lastVerified: policy.lastVerified ?? null
    }
  };
}

export interface UnavailableFuturePermission {
  id: string;
  group: PermissionGroup;
  simpleName: string;
  description: string;
  scopeBadge: string;
  compatibility: string;
  restartBadge: string;
  availabilityReason: string;
}

export const UNAVAILABLE_FUTURE_PERMISSIONS: readonly UnavailableFuturePermission[] = [
  {
    id: "future.system.defender_firewall",
    group: "Sistema",
    simpleName: "Políticas de Microsoft Defender e Firewall local",
    description:
      "Bloqueio de alteração de firewall e proteção em tempo real fora da cobertura atual do piloto.",
    scopeBadge: "Máquina inteira",
    compatibility: "Indisponível nesta versão",
    restartBadge: "Não aplicável",
    availabilityReason:
      "Mantido bloqueado intencionalmente para proteger a segurança básica do Windows durante o piloto."
  },
  {
    id: "future.personalization.taskbar_pinning",
    group: "Personalização",
    simpleName: "Fixar e reordenar ícones na barra de tarefas",
    description: "Impede reordenar ou fixar novos ícones na barra de tarefas do Windows.",
    scopeBadge: "Por usuário",
    compatibility: "Indisponível nesta versão",
    restartBadge: "Requer novo login",
    availabilityReason:
      "Ainda não possui handler transacional homologado no catálogo do WinLab.Executor."
  },
  {
    id: "future.apps.applocker_enforce",
    group: "Aplicativos",
    simpleName: "AppLocker em modo bloqueio rígido (Enforce)",
    description: "Bloqueia a abertura de executáveis não listados em vez de apenas auditar.",
    scopeBadge: "Por usuário / Máquina",
    compatibility: "Indisponível nesta versão (apenas AuditOnly)",
    restartBadge: "Efeito imediato",
    availabilityReason:
      "Por segurança do piloto escolar, o Desktop opera somente com AppLocker AuditOnly e presets auditados acima."
  },
  {
    id: "future.internet.dns_categories",
    group: "Internet",
    simpleName: "Filtro web por categorias (conteúdo adulto / malware)",
    description: "Filtragem de navegação independente de navegador por categoria DNS.",
    scopeBadge: "Máquina inteira",
    compatibility: "Indisponível nesta versão",
    restartBadge: "Não aplicável",
    availabilityReason:
      "Utilize as listas de sites bloqueados e permitidos por navegador (Chrome e Edge) acima no modo Computador Real."
  },
  {
    id: "future.devices.bluetooth_mtp",
    group: "Dispositivos",
    simpleName: "Bloqueio granular de Bluetooth e transferência MTP/PTP",
    description: "Restringe pareamento Bluetooth e acesso a celulares via cabo USB.",
    scopeBadge: "Máquina inteira",
    compatibility: "Indisponível nesta versão",
    restartBadge: "Requer reiniciar o Windows",
    availabilityReason:
      "A versão atual cobre proteção contra gravação USB e bloqueio de leitura/execução em discos removíveis."
  }
];

export interface SectionHelpContent {
  title: string;
  summary: string;
  tips: string[];
}

export const SECTION_HELP_CONTENT: Record<DesktopSection, SectionHelpContent> = {
  overview: {
    title: "Como usar a Visão geral",
    summary:
      "Esta tela resume a saúde atual da estação, contas detectadas, políticas verificadas e eventuais pendências antes de qualquer mudança.",
    tips: [
      "Alterar switches nunca grava no Windows imediatamente: tudo passa pela barra de pendências ou pela gaveta de prévia e confirmação.",
      "Em Modo Demonstração, os dados pertencem à estação simulada LAB-MICROLINS-01 e não alteram seu computador.",
      "Use a barra de pesquisa no topo ou o atalho '/' para pular direto para qualquer configuração."
    ]
  },
  accounts: {
    title: "Gerenciamento de contas e proteção administrativa",
    summary:
      "Separa contas de aluno (alvos das restrições por usuário) das contas Superadmin e de recuperação.",
    tips: [
      "Políticas 'Por usuário' não selecionam contas administrativas ou de recuperação como alvo; já políticas de 'Máquina inteira' (HKLM) afetam todos os usuários do computador, inclusive administradores.",
      "Para usar recursos avançados administrativos, designe primeiro um administrador local independente como Conta de Recuperação antes de criar Superadmin ou desativar Aluno.",
      "Senhas digitadas ao criar uma conta ou validar recuperação são enviadas somente no comando final e descartadas da memória logo depois."
    ]
  },
  permissions: {
    title: "Central de Permissões (Por usuário vs Máquina inteira)",
    summary:
      "Agrupa controles em Sistema, Personalização, Aplicativos, Internet e Dispositivos, diferenciando Permitir, Bloquear, Herdar / Preservar e Restaurar.",
    tips: [
      "Políticas 'Por usuário' exigem uma conta comum selecionada no seletor fixo do topo.",
      "Políticas 'Máquina inteira' (HKLM — navegadores, tela de bloqueio, USB, MSI não gerenciado) valem para todos os usuários do computador, inclusive administradores.",
      "Detalhes técnicos de registro ficam recolhidos por padrão em cada cartão para reduzir poluição visual."
    ]
  },
  profiles: {
    title: "Perfis de laboratório e JSON",
    summary:
      "Permite carregar presets pedagógicos, comparar perfis salvos localmente com o estado atual da máquina e exportar/importar JSON compatível com o WinLab Web.",
    tips: [
      "Carregar um preset ou perfil salvo apenas prepara as diferenças na barra de pendências — nada é aplicado sem revisão.",
      "Arquivos JSON de perfil jamais armazenam ou exportam senhas."
    ]
  },
  network: {
    title: "Rede local (SMB) e arquivos de aula",
    summary:
      "Inspeciona unidades mapeadas, compartilhamentos locais e protocolo legado SMBv1 em modo somente leitura, além de gerar scripts PowerShell para o servidor e estações.",
    tips: [
      "Prefira sempre contas autenticadas (Modelo A coletivo ou Modelo B isolado por aluno); o WinLab nunca ativa SMBv1 nem acesso anônimo.",
      "Os scripts gerados precisam ser executados separadamente no servidor (admin) e nas estações."
    ]
  },
  security: {
    title: "Postura de segurança e garantias do piloto",
    summary:
      "Reúne evidências reais de privilégios da interface (asInvoker), confiança do executor elevado, proteção de contas administrativas, escopo de máquina, TPM, Secure Boot e detecção de drift.",
    tips: [
      "Contas administrativas nunca são selecionadas como alvo por usuário, mas restrições de máquina inteira (HKLM) afetam toda a estação, inclusive administradores.",
      "Controles críticos como Defender, Firewall e WinRE permanecem intencionalmente fora da mutação automática."
    ]
  },
  diagnostics: {
    title: "Diagnóstico e inventário",
    summary:
      "Consolida sistema operacional, discos, contas, resumo de políticas e prontidão pré-voo para exportação segura em JSON.",
    tips: [
      "No modo Real, a exportação é bloqueada se houver qualquer inconsistência de origem ou falha na leitura.",
      "Use o filtro abaixo do relatório para localizar rapidamente programas instalados ou detectados."
    ]
  },
  history: {
    title: "Histórico, Baseline e Recuperação",
    summary:
      "Mostra transações executadas nesta sessão com opção de desfazer (rollback LIFO) e criação de ponto de restauração inicial (Baseline).",
    tips: [
      "Cada aplicação grava um snapshot prévio dos valores do registro antes de alterar qualquer chave.",
      "A confirmação de sucesso só aparece depois que o executor responde e a releitura do Windows valida o estado."
    ]
  },
  settings: {
    title: "Configurações do WinLab Desktop",
    summary:
      "Gerencia modo de operação (Demo/Real), canal de atualização Velopack/Inno/Portable, preferência local de animações reduzidas e inspeção técnica IPC.",
    tips: [
      "Ative 'Reduzir animações' se preferir transições instantâneas além da preferência do sistema operacional.",
      "A janela principal inicia maximizada em Desktop Windows preservando minimizar, restaurar e fechar."
    ]
  }
};

export interface GlobalSearchItem {
  id: string;
  label: string;
  description: string;
  section: DesktopSection;
  group?: PermissionGroup;
  keywords: string;
}

export const GLOBAL_SEARCH_CATALOG: readonly GlobalSearchItem[] = [
  ...DESKTOP_NAVIGATION_ITEMS.map((item) => ({
    id: `nav:${item.id}`,
    label: item.label,
    description: item.shortDescription,
    section: item.id,
    keywords: `${item.label} ${item.shortDescription}`
  })),
  ...Object.entries(PERMISSION_METADATA).map(([policyId, meta]) => ({
    id: `perm:${policyId}`,
    label: meta.simpleName,
    description: `${meta.group} · ${meta.compatibility}`,
    section: "permissions" as DesktopSection,
    group: meta.group,
    keywords: `${policyId} ${meta.simpleName} ${meta.group} ${meta.expectedEffectWhenBlocked}`
  })),
  {
    id: "feature:applocker-audit",
    label: "AppLocker (Auditoria de executáveis e PowerShell)",
    description: "Permissões → Aplicativos · Presets por conta e AuditOnly",
    section: "permissions",
    group: "Aplicativos",
    keywords: "applocker aplicativos executaveis auditonly powershell programas msi"
  },
  {
    id: "feature:browser-lists",
    label: "Listas de sites e extensões (Chrome e Edge)",
    description: "Permissões → Internet · Bloqueio e permissão de URLs e extensões",
    section: "permissions",
    group: "Internet",
    keywords: "chrome edge extensoes sites urls bloqueados permitidos perfis"
  },
  {
    id: "feature:usb-expansion",
    label: "Discos removíveis USB (leitura e execução)",
    description: "Permissões → Dispositivos · Leitura, execução e gravação em USB",
    section: "permissions",
    group: "Dispositivos",
    keywords: "usb pendrive discos removiveis leitura execucao gravacao"
  },
  {
    id: "feature:smb-share",
    label: "Pasta compartilhada da turma (SMB Modelo A / B)",
    description: "Rede e arquivos · Scripts para servidor e estações",
    section: "network",
    keywords: "smb rede pasta compartilhada servidor estacoes alunos"
  },
  {
    id: "feature:baseline",
    label: "Criar ponto de restauração (Baseline) e Reversão (Rollback)",
    description: "Histórico e recuperação · Snapshot de registro e AppLocker",
    section: "history",
    keywords: "baseline backup rollback desfazer historico recuperacao"
  },
  {
    id: "feature:superadmin-accounts",
    label: "Contas Superadmin, Recuperação e Aluno",
    description: "Contas e usuários · Criar conta local e definir alvo",
    section: "accounts",
    keywords: "conta usuario superadmin recuperacao aluno senha criar"
  },
  {
    id: "feature:diagnostic-export",
    label: "Exportar relatório de diagnóstico JSON",
    description: "Diagnóstico · Prontidão pré-voo, discos e softwares instalados",
    section: "diagnostics",
    keywords: "diagnostico relatorio json preflight software instalado"
  },
  {
    id: "feature:updates-reduced-motion",
    label: "Atualizações Velopack e Acessibilidade (Reduzir animações)",
    description: "Configurações · Canal de update, atalhos de teclado e movimento reduzido",
    section: "settings",
    keywords: "atualizacao velopack acessibilidade animacoes prefers-reduced-motion teclado"
  }
];
