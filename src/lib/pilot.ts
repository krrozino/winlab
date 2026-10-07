import { getConfigReview } from "./review";
import { buildWinLabPackageFiles, type PackageFile } from "./package-integrity";
import type { PreflightReport } from "./preflight-types";
import type { Config } from "./types";
import { getConfigErrors } from "./validation";

export type PilotGateStatus = "PASS" | "WARN" | "BLOCK";

export type PilotGate = {
  id: string;
  label: string;
  status: PilotGateStatus;
  message: string;
};

export type PilotReadiness = {
  status: "READY" | "READY_WITH_WARNINGS" | "BLOCKED";
  targetComputerName: string | null;
  effectiveOverrides: {
    enforcementMode: "AuditOnly";
    profileCleanupMode: "ReportOnly";
  };
  gates: PilotGate[];
};

export function getPilotConfig(config: Config): Config {
  return {
    ...config,
    enforcementMode: "AuditOnly",
    profileCleanupMode: "ReportOnly"
  };
}

export function evaluatePilotReadiness(
  config: Config,
  preflight: PreflightReport | null
): PilotReadiness {
  const gates: PilotGate[] = [];

  for (const error of getConfigErrors(config)) {
    gates.push({
      id: `config.${error.field}`,
      label: "Configuração",
      status: "BLOCK",
      message: error.message
    });
  }

  if (!preflight) {
    gates.push({
      id: "preflight.required",
      label: "Preflight",
      status: "BLOCK",
      message: "Importe um relatório de preflight desta máquina antes de gerar o pacote piloto."
    });
  } else {
    if (!preflight.computerName.trim()) {
      gates.push({
        id: "preflight.computer",
        label: "Máquina alvo",
        status: "BLOCK",
        message: "O relatório não informa o nome do computador."
      });
    } else {
      gates.push({
        id: "preflight.computer",
        label: "Máquina alvo",
        status: "PASS",
        message: `Pacote piloto ficará associado a ${preflight.computerName}.`
      });
    }

    if (preflight.profileName !== config.profileName) {
      gates.push({
        id: "preflight.profile",
        label: "Perfil",
        status: "BLOCK",
        message: `O preflight foi gerado para "${preflight.profileName}", mas a configuração atual é "${config.profileName}".`
      });
    } else {
      gates.push({
        id: "preflight.profile",
        label: "Perfil",
        status: "PASS",
        message: "O preflight corresponde ao perfil atual."
      });
    }

    if (preflight.status === "BLOCK" || preflight.summary.block > 0) {
      gates.push({
        id: "preflight.blockers",
        label: "Bloqueios do preflight",
        status: "BLOCK",
        message: `${preflight.summary.block} bloqueio(s) precisam ser resolvidos antes do piloto.`
      });
    } else {
      gates.push({
        id: "preflight.blockers",
        label: "Bloqueios do preflight",
        status: "PASS",
        message: "Nenhum BLOCK reportado."
      });
    }

    if (preflight.summary.warn > 0) {
      gates.push({
        id: "preflight.warnings",
        label: "Avisos do preflight",
        status: "WARN",
        message: `${preflight.summary.warn} aviso(s) permanecem para revisão.`
      });
    } else {
      gates.push({
        id: "preflight.warnings",
        label: "Avisos do preflight",
        status: "PASS",
        message: "Nenhum WARN reportado."
      });
    }

    if (preflight.summary.score < 70) {
      gates.push({
        id: "preflight.score",
        label: "Readiness score",
        status: "WARN",
        message: `Score ${preflight.summary.score}/100 é baixo para um piloto; revise os avisos.`
      });
    } else {
      gates.push({
        id: "preflight.score",
        label: "Readiness score",
        status: "PASS",
        message: `Score ${preflight.summary.score}/100.`
      });
    }

    const timestamp = Date.parse(preflight.generatedAt);
    if (Number.isFinite(timestamp)) {
      const ageDays = Math.max(0, (Date.now() - timestamp) / 86_400_000);

      if (ageDays > 7) {
        gates.push({
          id: "preflight.age",
          label: "Atualidade do preflight",
          status: "WARN",
          message: `Relatório tem aproximadamente ${Math.floor(ageDays)} dia(s). Considere executar novamente.`
        });
      } else {
        gates.push({
          id: "preflight.age",
          label: "Atualidade do preflight",
          status: "PASS",
          message: "Relatório recente."
        });
      }
    } else {
      gates.push({
        id: "preflight.age",
        label: "Atualidade do preflight",
        status: "WARN",
        message: "Data do relatório não pôde ser validada."
      });
    }
  }

  for (const item of getConfigReview(config).filter((item) => item.level === "warning")) {
    gates.push({
      id: `review.${gates.length}`,
      label: "Revisão da configuração",
      status: "WARN",
      message: item.text
    });
  }

  if (config.enforcementMode === "Enabled") {
    gates.push({
      id: "pilot.auditOnly",
      label: "AppLocker do piloto",
      status: "PASS",
      message: "A configuração original está em Enabled, mas o pacote piloto será forçado para AuditOnly."
    });
  } else {
    gates.push({
      id: "pilot.auditOnly",
      label: "AppLocker do piloto",
      status: "PASS",
      message: "Pacote piloto usará AuditOnly."
    });
  }

  if (config.profileCleanupMode === "Delete") {
    gates.push({
      id: "pilot.cleanup",
      label: "Limpeza de perfis",
      status: "PASS",
      message: "O pacote piloto substituirá Delete por ReportOnly."
    });
  } else {
    gates.push({
      id: "pilot.cleanup",
      label: "Limpeza de perfis",
      status: "PASS",
      message: "Pacote piloto não excluirá perfis."
    });
  }

  const hasBlock = gates.some((gate) => gate.status === "BLOCK");
  const hasWarn = gates.some((gate) => gate.status === "WARN");

  return {
    status: hasBlock ? "BLOCKED" : hasWarn ? "READY_WITH_WARNINGS" : "READY",
    targetComputerName: preflight?.computerName || null,
    effectiveOverrides: {
      enforcementMode: "AuditOnly",
      profileCleanupMode: "ReportOnly"
    },
    gates
  };
}

export function generatePilotDeploymentChecklist(
  config: Config,
  preflight: PreflightReport,
  readiness: PilotReadiness
): string {
  return `WINLAB 0.9 — CHECKLIST DE PILOTO
================================

Package target: ${preflight.computerName}
Perfil: ${config.profileName}
Readiness: ${readiness.status}
Score do preflight: ${preflight.summary.score}/100

ALTERAÇÕES DE SEGURANÇA DO PILOTO
---------------------------------
- AppLocker: AuditOnly, mesmo que a configuração original esteja em Enabled.
- Limpeza de perfis: ReportOnly, mesmo que a configuração original esteja em Delete.
- O restante das políticas configuradas permanece para validação.

ANTES
-----
[ ] Confirmar que este é o computador ${preflight.computerName}.
[ ] Manter uma conta administrativa funcional.
[ ] Extrair TODO o ZIP para uma pasta local.
[ ] Não executar diretamente de dentro do ZIP.
[ ] Executar verify-package.ps1 e exigir PASS.
[ ] Executar preflight.ps1 e confirmar que não existem BLOCKs.
[ ] Revisar todos os WARNs.
[ ] Executar setup.ps1 sem -Apply e revisar o preview.

APLICAÇÃO
---------
[ ] Abrir PowerShell como administrador.
[ ] Executar .\\setup.ps1 -Apply.
[ ] Confirmar que o setup terminou sem RecoveryFailed.
[ ] Reiniciar o computador.
[ ] Fazer login na conta restrita se houver políticas de primeiro login pendentes.

PÓS-APLICAÇÃO
-------------
[ ] Executar verify.ps1.
[ ] Testar Chrome/Edge.
[ ] Testar Office/Power BI/apps permitidos.
[ ] Testar documentos em USB.
[ ] Tentar executar um EXE em USB e conferir o audit do AppLocker.
[ ] Conferir sites permitidos/bloqueados.
[ ] Executar audit.ps1.
[ ] Executar maintenance.ps1 SEM -Apply.
[ ] Conferir C:\\ProgramData\\WinLab\\state.json e backups.

DECISÃO
-------
[ ] PASS: manter a máquina em piloto e analisar logs.
[ ] FAIL: executar o checklist de rollback.
`;
}

export function generatePilotRollbackChecklist(
  config: Config,
  preflight: PreflightReport
): string {
  return `WINLAB 0.9 — CHECKLIST DE ROLLBACK DO PILOTO
============================================

Máquina: ${preflight.computerName}
Perfil: ${config.profileName}

ANTES
-----
[ ] Não apagar C:\\ProgramData\\WinLab.
[ ] Não apagar Backups, History ou state.json manualmente.
[ ] Manter a conta administrativa acessível.
[ ] Executar rollback.ps1 sem -Apply e revisar o baseline que será restaurado.

ROLLBACK
--------
[ ] Abrir PowerShell como administrador.
[ ] Executar .\\rollback.ps1 -Apply.
[ ] Confirmar restauração do baseline AppLocker.
[ ] Confirmar restauração do baseline de registro.
[ ] Confirmar arquivamento do state.json em History.
[ ] Reiniciar o computador.

DEPOIS
------
[ ] Confirmar login administrativo.
[ ] Confirmar funcionamento dos aplicativos anteriores.
[ ] Confirmar que políticas anteriores do navegador foram restauradas.
[ ] Registrar o motivo do rollback antes de alterar a configuração.
`;
}

export async function buildPilotPackageFiles(
  config: Config,
  preflight: PreflightReport
): Promise<PackageFile[]> {
  const readiness = evaluatePilotReadiness(config, preflight);

  if (readiness.status === "BLOCKED") {
    throw new Error("O pacote piloto não pode ser gerado enquanto houver gates BLOCK.");
  }

  const effectiveConfig = getPilotConfig(config);
  const extraFiles: PackageFile[] = [
    {
      name: "PILOT-DEPLOYMENT-CHECKLIST.txt",
      content: generatePilotDeploymentChecklist(config, preflight, readiness)
    },
    {
      name: "PILOT-ROLLBACK-CHECKLIST.txt",
      content: generatePilotRollbackChecklist(config, preflight)
    },
    {
      name: "pilot-readiness.json",
      content: JSON.stringify(readiness, null, 2) + "\n"
    },
    {
      name: "preflight-source.json",
      content: JSON.stringify(preflight, null, 2) + "\n"
    }
  ];

  return buildWinLabPackageFiles(effectiveConfig, {
    channel: "pilot",
    targetComputerName: preflight.computerName,
    extraFiles
  });
}
