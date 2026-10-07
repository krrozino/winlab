import type {
  PreflightCheck,
  PreflightReport,
  PreflightStatus
} from "./preflight-types";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function statusValue(value: unknown): PreflightStatus {
  return value === "PASS" || value === "WARN" || value === "BLOCK"
    ? value
    : "BLOCK";
}

function parseCheck(value: unknown): PreflightCheck | null {
  if (!record(value)) return null;

  const id = stringValue(value.id).trim();
  const label = stringValue(value.label).trim();
  if (!id || !label) return null;

  return {
    id,
    label,
    status: statusValue(value.status),
    message: stringValue(value.message)
  };
}

export function parsePreflightReportJson(raw: string): PreflightReport {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("O relatório de preflight não contém JSON válido.");
  }

  if (!record(parsed) || parsed.schemaVersion !== 1) {
    throw new Error("Relatório de preflight incompatível.");
  }

  if (!record(parsed.windows) || !record(parsed.summary)) {
    throw new Error("Relatório de preflight incompleto.");
  }

  const checks = Array.isArray(parsed.checks)
    ? parsed.checks.map(parseCheck).filter((item): item is PreflightCheck => !!item)
    : [];

  return {
    schemaVersion: 1,
    generatedAt: stringValue(parsed.generatedAt),
    computerName: stringValue(parsed.computerName),
    profileName: stringValue(parsed.profileName),
    windows: {
      caption: stringValue(parsed.windows.caption),
      version: stringValue(parsed.windows.version),
      buildNumber: stringValue(parsed.windows.buildNumber),
      architecture: stringValue(parsed.windows.architecture)
    },
    status: statusValue(parsed.status),
    summary: {
      score: Math.max(0, Math.min(100, Math.round(numberValue(parsed.summary.score)))),
      pass: Math.max(0, Math.round(numberValue(parsed.summary.pass))),
      warn: Math.max(0, Math.round(numberValue(parsed.summary.warn))),
      block: Math.max(0, Math.round(numberValue(parsed.summary.block)))
    },
    checks
  };
}

export function isPreflightReady(report: PreflightReport) {
  return report.status !== "BLOCK" && report.summary.block === 0;
}
