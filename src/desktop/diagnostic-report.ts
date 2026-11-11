import { MachineInventoryDto, PolicyStateSummaryDto } from "./contracts";

export const DIAGNOSTIC_REPORT_SCHEMA_VERSION = "1.0.0";

export type ReportOrigin = "DEMO" | "REAL";

export type OriginIntegrity = "CONSISTENT" | "MOCK_DATA_IN_REAL_MODE";

export interface PreflightSnapshot {
  status: string;
  readinessScore: number;
  summary: { pass: number; warn: number; block: number };
}

export interface DiagnosticReportInput {
  mode: "Demo" | "Real";
  generatedAt: string;
  inventory: MachineInventoryDto | null;
  policySummary: PolicyStateSummaryDto | null;
  preflight: PreflightSnapshot | null;
}

export interface DiagnosticReportSystemSection {
  operatingSystem: string;
  version: string;
  build: string;
  architecture: string;
}

export interface DiagnosticReportInventorySection {
  diskCount: number;
  totalCapacityGb: number;
  totalFreeGb: number;
  detectedAppsCount: number;
  installedAppsCount: number;
  localUsersTotal: number;
  localUsersAdministrators: number;
  localUsersStandard: number;
}

export interface DiagnosticReportPolicySection {
  totalPolicies: number;
  applied: number;
  notConfigured: number;
  pendingAction: number;
}

export interface DiagnosticReportPreflightSection {
  status: string;
  readinessScore: number | null;
  pass: number;
  warn: number;
  block: number;
}

export interface DiagnosticReport {
  schemaVersion: string;
  generatedAt: string;
  origin: ReportOrigin;
  originIntegrity: OriginIntegrity;
  system: DiagnosticReportSystemSection | null;
  inventoryMetrics: DiagnosticReportInventorySection | null;
  policySummary: DiagnosticReportPolicySection | null;
  preflight: DiagnosticReportPreflightSection | null;
}

export interface DiagnosticReportResult {
  report: DiagnosticReport;
  isComplete: boolean;
  missingSections: string[];
}

const ISO_8601_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function isValidCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function sanitizeFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeReadinessScore(value: unknown): number | null {
  const score = sanitizeFiniteNumber(value);
  return score !== null && score >= 0 && score <= 100 ? score : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSystemSection(inventory: MachineInventoryDto | null): DiagnosticReportSystemSection | null {
  if (!inventory || typeof inventory !== "object" || !inventory.windows) return null;

  const windows = inventory.windows;
  if (typeof windows.caption !== "string" || !windows.caption.trim()) return null;
  if (typeof windows.buildNumber !== "string" || !windows.buildNumber.trim()) return null;

  const ubr = sanitizeFiniteNumber(windows.ubr);
  const build = isValidCount(ubr) ? `${windows.buildNumber}.${ubr}` : windows.buildNumber;

  return {
    operatingSystem: windows.caption,
    version: typeof windows.version === "string" ? windows.version : "",
    build,
    architecture: typeof windows.architecture === "string" ? windows.architecture : ""
  };
}

function buildInventoryMetrics(inventory: MachineInventoryDto | null): DiagnosticReportInventorySection | null {
  if (!inventory || typeof inventory !== "object" || !Array.isArray(inventory.disks)) return null;

  let totalCapacityGb = 0;
  let totalFreeGb = 0;
  for (const disk of inventory.disks) {
    const capacity = sanitizeFiniteNumber(disk?.totalGb);
    const free = sanitizeFiniteNumber(disk?.freeGb);
    if (capacity === null || capacity < 0 || free === null || free < 0) return null;
    totalCapacityGb += capacity;
    totalFreeGb += free;
  }

  const users = Array.isArray(inventory.localUsers) ? inventory.localUsers : null;
  if (users === null) return null;
  const administrators = users.filter((user) => user?.isAdmin === true).length;

  const detectedApps = Array.isArray(inventory.detectedApps) ? inventory.detectedApps : null;
  const installedApps = Array.isArray(inventory.installedApps) ? inventory.installedApps : null;
  if (detectedApps === null || installedApps === null) return null;

  return {
    diskCount: inventory.disks.length,
    totalCapacityGb: round2(totalCapacityGb),
    totalFreeGb: round2(totalFreeGb),
    detectedAppsCount: detectedApps.length,
    installedAppsCount: installedApps.length,
    localUsersTotal: users.length,
    localUsersAdministrators: administrators,
    localUsersStandard: users.length - administrators
  };
}

function buildPolicySection(summary: PolicyStateSummaryDto | null): DiagnosticReportPolicySection | null {
  if (!summary || typeof summary !== "object") return null;

  const { totalPolicies, appliedCount, notConfiguredCount, pendingCount } = summary;
  if (!isValidCount(totalPolicies) || !isValidCount(appliedCount) || !isValidCount(notConfiguredCount) || !isValidCount(pendingCount)) {
    return null;
  }

  return {
    totalPolicies,
    applied: appliedCount,
    notConfigured: notConfiguredCount,
    pendingAction: pendingCount
  };
}

function buildPreflightSection(preflight: PreflightSnapshot | null): DiagnosticReportPreflightSection | null {
  if (!preflight || typeof preflight !== "object") return null;
  if (typeof preflight.status !== "string" || !preflight.status.trim()) return null;

  const summary = preflight.summary;
  if (!summary || typeof summary !== "object") return null;
  if (!isValidCount(summary.pass) || !isValidCount(summary.warn) || !isValidCount(summary.block)) {
    return null;
  }

  return {
    status: preflight.status,
    readinessScore: sanitizeReadinessScore(preflight.readinessScore),
    pass: summary.pass,
    warn: summary.warn,
    block: summary.block
  };
}

export function buildDiagnosticReport(input: DiagnosticReportInput): DiagnosticReportResult {
  if (!ISO_8601_PATTERN.test(input.generatedAt)) {
    throw new Error("generatedAt deve ser uma data/hora ISO 8601.");
  }

  const originIntegrity: OriginIntegrity =
    input.mode === "Real" && input.inventory?.isMock === true ? "MOCK_DATA_IN_REAL_MODE" : "CONSISTENT";

  const report: DiagnosticReport = {
    schemaVersion: DIAGNOSTIC_REPORT_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    origin: input.mode === "Real" ? "REAL" : "DEMO",
    originIntegrity,
    system: buildSystemSection(input.inventory),
    inventoryMetrics: buildInventoryMetrics(input.inventory),
    policySummary: buildPolicySection(input.policySummary),
    preflight: buildPreflightSection(input.preflight)
  };

  const missingSections: string[] = [];
  if (!report.system) missingSections.push("system");
  if (!report.inventoryMetrics) missingSections.push("inventoryMetrics");
  if (!report.policySummary) missingSections.push("policySummary");
  if (!report.preflight) missingSections.push("preflight");
  if (originIntegrity !== "CONSISTENT") missingSections.push("originIntegrity");

  return {
    report,
    isComplete: missingSections.length === 0,
    missingSections
  };
}

export function canExportDiagnosticReport(report: DiagnosticReport): boolean {
  return (
    report.originIntegrity === "CONSISTENT" &&
    report.system !== null &&
    report.inventoryMetrics !== null &&
    report.policySummary !== null &&
    report.preflight !== null
  );
}

export function serializeDiagnosticReport(report: DiagnosticReport): string {
  if (report.originIntegrity !== "CONSISTENT") {
    throw new Error("Origem inconsistente: dados de demonstração não podem ser exportados como diagnóstico de máquina real.");
  }
  if (!canExportDiagnosticReport(report)) {
    throw new Error("Relatório incompleto: a exportação exige inventário, políticas e preflight disponíveis.");
  }
  return JSON.stringify(report, null, 2);
}

export function diagnosticReportFileName(report: DiagnosticReport): string {
  const stamp = report.generatedAt.replace(/[:.]/g, "-");
  return `winlab-diagnostico-${report.origin.toLowerCase()}-${stamp}.json`;
}
