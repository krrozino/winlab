import type { PolicyItemDto } from "./contracts";
import type { AdminPermissionDto, AdminPermissionIntent } from "./admin-contracts-compat";
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
    shortDescription: "Separação de privilégios, imunidade administrativa, TPM, Secure Boot e drift."
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
      "Impede que a conta comum selecionada altere o plano de fundo; administradores não são afetados.",
    expectedEffectWhenInherited:
      "Remove a trava no registro do usuário e restaura a personalização padrão do Windows.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "personalization.sounds": {
    group: "Personalização",
    simpleName: "Alterar esquema de sons",
    expectedEffectWhenBlocked:
      "Desabilita a troca de esquemas sonoros no Painel de Sons e Configurações para a conta selecionada.",
    expectedEffectWhenInherited:
      "Permite novamente que o usuário selecione esquemas de áudio conforme padrão do Windows.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "personalization.mouse_pointers": {
    group: "Personalização",
    simpleName: "Alterar ponteiros do mouse",
    expectedEffectWhenBlocked:
      "Impede troca de cursores e carregamento de ponteiros personalizados (.cur/.ani) pela conta selecionada.",
    expectedEffectWhenInherited:
      "Restaura o comportamento padrão do Windows para ajuste de ponteiros do mouse.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "browser.chrome.incognito": {
    group: "Internet",
    simpleName: "Usar janela anônima / InPrivate (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Desativa o modo anônimo no Google Chrome e InPrivate no Microsoft Edge para todas as contas do computador.",
    expectedEffectWhenInherited:
      "Remove a política de máquina no registro e restaura a navegação anônima padrão dos navegadores.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
  },
  "browser.chrome.guest": {
    group: "Internet",
    simpleName: "Usar modo convidado / visitante (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Oculta sessões de visitante no Chrome e Edge para todas as contas desta máquina.",
    expectedEffectWhenInherited:
      "Restaura o comportamento padrão dos navegadores quanto ao perfil de convidado.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
  },
  "browser.password_manager": {
    group: "Internet",
    simpleName: "Salvar senhas nos navegadores (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Impede que Chrome e Edge ofereçam salvar ou preencher credenciais pessoais em máquinas compartilhadas.",
    expectedEffectWhenInherited:
      "Remove a restrição de máquina e devolve o controle de senhas ao padrão do navegador.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
  },
  "browser.developer_tools": {
    group: "Internet",
    simpleName: "Abrir Ferramentas do Desenvolvedor / F12 (Chrome e Edge)",
    expectedEffectWhenBlocked:
      "Desativa o DevTools (F12 e Inspecionar) no Chrome e Edge para todas as contas desta estação.",
    expectedEffectWhenInherited:
      "Restaura o acesso padrão às Ferramentas do Desenvolvedor nos navegadores.",
    compatibility: "Google Chrome e Microsoft Edge no Windows 10/11 · Máquina inteira (HKLM)"
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
      "Impede que a conta comum abra o regedit.exe ou importe arquivos .reg manualmente; executor WinLab não é afetado.",
    expectedEffectWhenInherited:
      "Remove o bloqueio de edição do registro na conta selecionada (sem conceder direitos admin).",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "system.restrict_control_panel": {
    group: "Sistema",
    simpleName: "Acessar Painel de Controle e Configurações",
    expectedEffectWhenBlocked:
      "Bloqueia o Painel de Controle clássico e o app Configurações do Windows na conta selecionada; exige novo logon.",
    expectedEffectWhenInherited:
      "Restaura a abertura do Painel de Controle e Configurações conforme padrão do Windows.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
  },
  "storage.usb_write_protect": {
    group: "Dispositivos",
    simpleName: "Gravar arquivos em pendrives USB",
    expectedEffectWhenBlocked:
      "Bloqueia escrita e cópia para mídias removíveis USB em toda a máquina, mantendo leitura, teclado e mouse funcionando.",
    expectedEffectWhenInherited:
      "Remove a proteção contra gravação em USB no registro da máquina.",
    compatibility: "Windows 10 e 11 · Máquina inteira (HKLM\\SYSTEM\\...\\StorageDevicePolicies)"
  },
  "apps.disable_microsoft_store": {
    group: "Aplicativos",
    simpleName: "Abrir a Microsoft Store",
    expectedEffectWhenBlocked:
      "Bloqueia o acesso à loja de aplicativos do Windows para a conta comum selecionada.",
    expectedEffectWhenInherited:
      "Restaura o acesso padrão à Microsoft Store para a conta selecionada.",
    compatibility: "Windows 10 e 11 · Registro por usuário (HKU/<SID>)"
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
    normalized.includes("internet")
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
  controlMode: "binary-compat" | "tristate";
  supportedIntents?: AdminPermissionIntent[];
  activeTriState?: "Allow" | "Block" | "Inherit";
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

export function buildPermissionCardViewModel(params: {
  policy: PolicyItemDto;
  pendingPolicies: Record<string, boolean>;
  isApplying: boolean;
  hasSelectedStandardUser: boolean;
  selectedUserName?: string | null;
  executionOutcome?: PolicyExecutionOutcome;
  adminOverride?: AdminPermissionDto | null;
}): PermissionCardViewModel {
  const {
    policy,
    pendingPolicies,
    isApplying,
    hasSelectedStandardUser,
    selectedUserName,
    executionOutcome,
    adminOverride
  } = params;

  const meta = PERMISSION_METADATA[policy.id];
  const def = getPolicyDefinition(policy.id);
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

  const expectedEffect = adminOverride?.expectedEffect
    ? adminOverride.expectedEffect
    : meta
      ? targetWillBlock
        ? meta.expectedEffectWhenBlocked
        : meta.expectedEffectWhenInherited
      : policy.description;

  const compatibility =
    (policy.effectiveState ?? policy.currentState) === "NotSupported"
      ? "Não suportada nesta edição do Windows."
      : adminOverride?.compatibility ??
        meta?.compatibility ??
        (scopeKind === "User"
          ? "Windows 10 e 11 · Registro por usuário"
          : "Windows 10 e 11 · Máquina inteira (HKLM)");

  const phaseInfo = formatOperationPhase({
    isApplying,
    hasPendingChange: visual.hasPendingChange,
    pendingEnabled: pendingPolicies[policy.id],
    outcome: executionOutcome
  });

  const supportsTriState = Boolean(
    adminOverride &&
      adminOverride.intents.includes("Allow") &&
      adminOverride.intents.includes("Block")
  );

  const isExplicitlyAllowed =
    adminOverride?.state.configuredState === "Allowed" ||
    policy.configuredState === "Allowed" ||
    policy.effectiveState === "Allowed";
  const activeTriState: "Allow" | "Block" | "Inherit" = visual.switchChecked
    ? "Block"
    : isExplicitlyAllowed
      ? "Allow"
      : "Inherit";

  const probe = def?.primaryProbe;

  return {
    id: policy.id,
    group: mapCategoryToPermissionGroup(policy.category, policy.id),
    simpleName: meta?.simpleName ?? adminOverride?.name ?? policy.title,
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
    controlMode: supportsTriState ? "tristate" : "binary-compat",
    supportedIntents: adminOverride?.intents,
    activeTriState,
    technicalDetails: {
      policyId: policy.id,
      hive: probe?.hive ?? (scopeKind === "User" ? "HKU/<SID>" : "HKLM"),
      subKey: probe?.subKey ?? "Definido pelo catálogo do executor",
      valueName: probe?.valueName ?? "—",
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
    id: "future.personalization.taskbar_lockscreen",
    group: "Personalização",
    simpleName: "Fixar barra de tarefas e tela de bloqueio",
    description: "Impede reordenar ícones fixos ou alterar imagem da tela de bloqueio.",
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
      "Alterar switches nunca grava no Windows imediatamente: tudo passa pela barra de pendências e pelo painel de prévia.",
      "Em Modo Demonstração, os dados pertencem à estação simulada LAB-MICROLINS-01 e não alteram seu computador.",
      "Use a barra de pesquisa no topo ou o atalho '/' para pular direto para qualquer configuração."
    ]
  },
  accounts: {
    title: "Gerenciamento de contas e proteção administrativa",
    summary:
      "Separa claramente contas de aluno (alvos das restrições por usuário) das contas Superadmin e de recuperação.",
    tips: [
      "Contas administrativas têm imunidade automática contra restrições de usuário.",
      "Senhas digitadas ao criar uma conta são enviadas diretamente à API local no comando de criação e descartadas da memória logo depois.",
      "Recursos avançados como designar Administrador de recuperação dedicado ou ativar/desativar contas ficam bloqueados com aviso até a publicação do contrato backend."
    ]
  },
  permissions: {
    title: "Central de Permissões (Por usuário vs Máquina inteira)",
    summary:
      "Agrupa controles em Sistema, Personalização, Aplicativos, Internet e Dispositivos, mostrando estado verificado, compatibilidade e necessidade de reinício.",
    tips: [
      "Políticas 'Por usuário' exigem uma conta comum selecionada no seletor fixo do topo.",
      "Políticas 'Máquina inteira' (Chrome, Edge, USB) valem para todos os usuários do computador.",
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
      "Reúne evidências reais de privilégios da interface (asInvoker), confiança do executor elevado, TPM, Secure Boot e detecção de drift.",
    tips: [
      "Se alguma política for alterada manualmente fora do WinLab (Drifted), você pode preparar a restauração pela prévia.",
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
    keywords: "applocker aplicativos executaveis auditonly powershell programas"
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
