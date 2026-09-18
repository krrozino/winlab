import { APP_CATALOG } from "./apps";
import { pathRisk } from "./security";
import type { Config } from "./types";

export type ReviewItem = {
  level: "info" | "warning";
  text: string;
};

export function getConfigReview(config: Config): ReviewItem[] {
  const items: ReviewItem[] = [];

  items.push({
    level: "info",
    text: "Safety & Recovery ativo: scripts mutáveis exigem -Apply; setup preserva baseline e rollback exige state.json válido."
  });

  if (config.createAccounts) {
    items.push({
      level: "info",
      text: "Se a conta restrita ainda não tiver perfil, políticas por usuário serão concluídas automaticamente no primeiro logon."
    });
  }

  items.push({
    level: "info",
    text:
      config.enforcementMode === "AuditOnly"
        ? "AppLocker está em auditoria: registra eventos sem bloquear aplicativos."
        : "AppLocker está em bloqueio ativo: use somente após validar um PC piloto."
  });

  items.push({
    level: "info",
    text: `${config.allowedApps.length} aplicativo(s) conhecido(s) na allowlist: ${config.allowedApps
      .map((id) => APP_CATALOG[id].label)
      .join(", ") || "nenhum"}.`
  });

  items.push({
    level: "info",
    text: config.allowLocalAccountManagement
      ? "A página de Contas > Outros usuários ficará disponível para o usuário restrito. Criar/remover contas continua exigindo privilégios administrativos do Windows."
      : "A página de Contas > Outros usuários ficará oculta para o usuário restrito."
  });

  items.push({
    level: "info",
    text:
      config.browserUrlMode === "Unrestricted"
        ? "Navegação web sem lista de URLs do WinLab."
        : config.browserUrlMode === "BlockList"
          ? `${config.blockedUrls.length} URL(s) bloqueada(s), com ${config.allowedUrls.length} exceção(ões), para Chrome e Edge.`
          : `Modo somente sites permitidos: ${config.allowedUrls.length} URL(s) liberada(s) para Chrome e Edge.`
  });

  if (config.browserUrlMode === "AllowListOnly" && config.allowedUrls.length === 0) {
    items.push({
      level: "warning",
      text: "Modo somente sites permitidos está ativo, mas nenhuma URL foi liberada. A navegação ficará praticamente toda bloqueada."
    });
  }

  items.push({
    level: "info",
    text: `USB — leitura: ${config.blockUsbRead ? "bloqueada" : "permitida"}; gravação: ${config.blockUsbWrite ? "bloqueada" : "permitida"}; execução: ${config.blockUsbExecute ? "bloqueada" : "permitida"}.`
  });

  if (config.profileCleanupMode === "Delete") {
    items.push({
      level: "warning",
      text: `maintenance.ps1 poderá excluir perfis não carregados e inativos há mais de ${config.profileCleanupDays} dias, preservando as contas restrita e administrativa configuradas.`
    });
  } else if (config.profileCleanupMode === "ReportOnly") {
    items.push({
      level: "info",
      text: `maintenance.ps1 apenas listará perfis inativos há mais de ${config.profileCleanupDays} dias; nenhum perfil será excluído.`
    });
  }

  for (const path of config.customAllowedPaths) {
    const risk = pathRisk(path);
    if (risk) {
      items.push({
        level: "warning",
        text: `${path}: ${risk}`
      });
    }
  }

  if (config.studentUser.toLowerCase() === config.adminUser.toLowerCase()) {
    items.push({
      level: "warning",
      text: "A conta restrita e a conta administrativa não podem usar o mesmo nome."
    });
  }

  if (!config.allowedApps.length && !config.customAllowedPaths.length) {
    items.push({
      level: "warning",
      text: "Nenhum aplicativo de terceiros foi liberado para o usuário restrito."
    });
  }

  if (config.enforcementMode === "Enabled") {
    items.push({
      level: "warning",
      text: "Antes de instalar em várias máquinas, execute verify.ps1 e valide audit.ps1 no PC piloto."
    });
  }

  return items;
}
