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
