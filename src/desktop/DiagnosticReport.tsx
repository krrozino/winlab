"use client";

import React, { useMemo, useState } from "react";
import { MachineInventoryDto, PolicyStateSummaryDto } from "./contracts";
import {
  buildDiagnosticReport,
  canExportDiagnosticReport,
  diagnosticReportFileName,
  PreflightSnapshot,
  serializeDiagnosticReport
} from "./diagnostic-report";

export interface DiagnosticReportProps {
  mode: "Demo" | "Real";
  inventory: MachineInventoryDto | null;
  policySummary: PolicyStateSummaryDto | null;
  preflightData: PreflightSnapshot | null;
  isScanning?: boolean;
  scanError?: string | null;
}

const cardStyle: React.CSSProperties = {
  background: "var(--panel)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  padding: 18,
  flex: 1,
  minWidth: 240
};

const metricRowStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 0",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  fontSize: 13
};

function MetricRow({ label, value, unavailable = false }: { label: string; value: string; unavailable?: boolean }) {
  return (
    <div style={metricRowStyle}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <strong style={{ color: unavailable ? "var(--warning)" : "var(--text)" }}>{value}</strong>
    </div>
  );
}

function StatusChip({ label, tone }: { label: string; tone: "success" | "warning" | "danger" }) {
  const colors = { success: "var(--success)", warning: "var(--warning)", danger: "var(--danger)" };
  return (
    <span
      style={{
        background: "var(--panel-2)",
        border: `1px solid ${colors[tone]}`,
        color: colors[tone],
        borderRadius: 999,
        padding: "4px 12px",
        fontSize: 12,
        fontWeight: 700
      }}
    >
      {label}
    </span>
  );
}

export function DiagnosticReport({
  mode,
  inventory,
  policySummary,
  preflightData,
  isScanning = false,
  scanError = null
}: DiagnosticReportProps) {
  const [feedback, setFeedback] = useState<{ tone: "success" | "danger"; message: string } | null>(null);

  const { report, isComplete } = useMemo(
    () => buildDiagnosticReport({ mode, generatedAt: new Date().toISOString(), inventory, policySummary, preflight: preflightData }),
    [mode, inventory, policySummary, preflightData]
  );
  const hasAnyData = report.system !== null || report.policySummary !== null || report.preflight !== null;
  const canExport = isComplete && !isScanning && !scanError;

  function handleExport() {
    if (!report || !canExportDiagnosticReport(report)) {
      setFeedback({ tone: "danger", message: "Exportação indisponível: dados insuficientes ou consulta em andamento." });
      return;
    }
    try {
      const json = serializeDiagnosticReport(report);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = diagnosticReportFileName(report);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setFeedback({ tone: "success", message: `Relatório exportado: ${diagnosticReportFileName(report)}` });
    } catch (err) {
      setFeedback({ tone: "danger", message: `Falha ao exportar o relatório: ${(err as Error).message}` });
    }
  }

  const isDemo = mode === "Demo";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 20, marginBottom: 4 }}>Relatório de Diagnóstico</h2>
          <small style={{ color: "var(--muted)", fontSize: 12 }}>
            Consolidação somente leitura do inventário, das políticas e do preflight. Nenhuma alteração é aplicada.
          </small>
        </div>
        <span
          role="status"
          aria-label={isDemo ? "Origem do relatório: modo demonstração" : "Origem do relatório: máquina real"}
          style={{
            background: isDemo ? "rgba(255, 122, 24, 0.12)" : "rgba(83, 209, 138, 0.12)",
            border: `2px solid ${isDemo ? "var(--accent)" : "var(--success)"}`,
            color: isDemo ? "var(--accent)" : "var(--success)",
            borderRadius: 10,
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase"
          }}
        >
          {isDemo ? "MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS" : "MODO REAL — DIAGNÓSTICO DESTA MÁQUINA"}
        </span>
      </div>

      {scanError ? (
        <div
          role="alert"
          style={{ background: "var(--panel)", border: "1px solid var(--danger)", borderRadius: 12, padding: 20, marginBottom: 16 }}
        >
          <strong style={{ color: "var(--danger)" }}>Falha na consulta de diagnóstico</strong>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0 0" }}>{scanError}</p>
        </div>
      ) : null}

      {isScanning && !hasAnyData ? (
        <div
          role="status"
          aria-live="polite"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}
        >
          <strong style={{ color: "var(--accent-2)" }}>Carregando diagnóstico…</strong>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0 0" }}>
            Consultando inventário, políticas e preflight via IPC. A exportação permanece desabilitada até a conclusão.
          </p>
        </div>
      ) : null}

      {!isScanning && !hasAnyData && !scanError ? (
        <div
          role="status"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 16 }}
        >
          <strong style={{ color: "var(--muted)" }}>Nenhum dado disponível</strong>
          <p style={{ color: "var(--muted)", fontSize: 13, margin: "8px 0 0" }}>
            Nenhuma consulta de inventário, políticas ou preflight foi concluída nesta sessão. O relatório e a exportação
            permanecem indisponíveis até que os dados sejam obtidos.
          </p>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Informações do Computador</h3>
          {report.system ? (
            <>
              <MetricRow label="Sistema operacional" value={report.system.operatingSystem} />
              <MetricRow label="Versão" value={report.system.version || "Indisponível"} unavailable={!report.system.version} />
              <MetricRow label="Build" value={report.system.build} />
              <MetricRow label="Arquitetura" value={report.system.architecture || "Indisponível"} unavailable={!report.system.architecture} />
            </>
          ) : (
            <MetricRow label="Sistema operacional" value="Indisponível" unavailable />
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Métricas de Inventário</h3>
          {report.inventoryMetrics ? (
            <>
              <MetricRow label="Discos" value={String(report.inventoryMetrics.diskCount)} />
              <MetricRow
                label="Capacidade total"
                value={`${report.inventoryMetrics.totalCapacityGb} GB`}
              />
              <MetricRow label="Espaço livre total" value={`${report.inventoryMetrics.totalFreeGb} GB`} />
              <MetricRow label="Aplicativos detectados" value={String(report.inventoryMetrics.detectedAppsCount)} />
              <MetricRow label="Aplicativos instalados" value={String(report.inventoryMetrics.installedAppsCount)} />
              <MetricRow label="Usuários locais" value={String(report.inventoryMetrics.localUsersTotal)} />
              <MetricRow label="— Administradores" value={String(report.inventoryMetrics.localUsersAdministrators)} />
              <MetricRow label="— Usuários comuns" value={String(report.inventoryMetrics.localUsersStandard)} />
            </>
          ) : (
            <MetricRow label="Inventário" value="Indisponível" unavailable />
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Estado das Políticas</h3>
          {report.policySummary ? (
            <>
              <MetricRow label="Total de políticas" value={String(report.policySummary.totalPolicies)} />
              <MetricRow label="Aplicadas" value={String(report.policySummary.applied)} />
              <MetricRow label="Não configuradas" value={String(report.policySummary.notConfigured)} />
              <MetricRow label="Pendentes de ação" value={String(report.policySummary.pendingAction)} />
            </>
          ) : (
            <MetricRow label="Políticas" value="Indisponível" unavailable />
          )}
        </div>

        <div style={cardStyle}>
          <h3 style={{ fontSize: 14, marginBottom: 10 }}>Prontidão do Ambiente</h3>
          {report.preflight ? (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <StatusChip
                  label={report.preflight.status}
                  tone={report.preflight.status.toUpperCase() === "PASS" ? "success" : report.preflight.status.toUpperCase() === "BLOCK" ? "danger" : "warning"}
                />
              </div>
              <MetricRow
                label="Readiness Score"
                value={report.preflight.readinessScore === null ? "Indisponível" : `${report.preflight.readinessScore}/100`}
                unavailable={report.preflight.readinessScore === null}
              />
              <MetricRow label="PASS" value={String(report.preflight.pass)} />
              <MetricRow label="WARN" value={String(report.preflight.warn)} />
              <MetricRow label="BLOCK" value={String(report.preflight.block)} />
            </>
          ) : (
            <MetricRow label="Preflight" value="Indisponível" unavailable />
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 20 }}>
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport}
          aria-disabled={!canExport}
          style={{
            background: canExport ? "var(--accent)" : "var(--panel-2)",
            color: canExport ? "#0b0d10" : "var(--muted)",
            border: "1px solid",
            borderColor: canExport ? "var(--accent)" : "var(--border)",
            borderRadius: 10,
            padding: "10px 20px",
            fontWeight: 700,
            fontSize: 13,
            cursor: canExport ? "pointer" : "not-allowed"
          }}
        >
          Exportar relatório
        </button>
        {!canExport ? (
          <small style={{ color: "var(--muted)", fontSize: 12 }}>
            {isComplete
              ? "Exportação indisponível durante carregamento ou falha de consulta."
              : "A exportação exige inventário, políticas e preflight disponíveis e válidos."}
          </small>
        ) : null}
        <span role="status" aria-live="polite" style={{ fontSize: 12 }}>
          {feedback ? <strong style={{ color: feedback.tone === "success" ? "var(--success)" : "var(--danger)" }}>{feedback.message}</strong> : null}
        </span>
      </div>
    </div>
  );
}
