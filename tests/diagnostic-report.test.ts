import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import ReactDOMServer from "react-dom/server";

import { IPC_CONSTANTS, MachineInventoryDto, PolicyStateSummaryDto } from "../src/desktop/contracts";
import { MockDesktopAgent } from "../src/desktop/mock-agent";
import { DiagnosticReport } from "../src/desktop/DiagnosticReport";
import {
  buildDiagnosticReport,
  canExportDiagnosticReport,
  diagnosticReportFileName,
  DiagnosticReportInput,
  PreflightSnapshot,
  serializeDiagnosticReport
} from "../src/desktop/diagnostic-report";
import { readFile } from "node:fs/promises";

const ISO_NOW = "2026-11-11T12:00:00.000Z";

function sensitiveInventory(): MachineInventoryDto {
  return {
    computerName: "LAB-SECRET-01",
    scannedAt: "2026-11-11T11:00:00.000Z",
    isMock: true,
    windows: {
      caption: "Windows 11 Pro",
      version: "10.0.26100",
      buildNumber: "26100",
      architecture: "64-bit",
      ubr: 2894
    },
    detectedApps: [{ id: "chrome", name: "Google Chrome", path: "C:\\Program Files\\Chrome\\chrome.exe", detected: true, allowed: false }],
    installedApps: [{ displayName: "Google Chrome", displayVersion: "131.0", publisher: "Google LLC", installLocation: "C:\\Program Files\\Google", isAppx: false }],
    localUsers: [
      { name: "aluno.secret", enabled: true, isAdmin: false, sid: "S-1-5-21-999-1001" },
      { name: "prof.admin", enabled: true, isAdmin: true, sid: "S-1-5-21-999-1002" }
    ],
    disks: [
      { device: "\\\\.\\PhysicalDrive0", totalGb: 476.94, freeGb: 212.4, freePercent: 44.5 },
      { device: "\\\\.\\PhysicalDrive1", totalGb: 1024, freeGb: 800, freePercent: 78.1 }
    ]
  };
}

function validPolicySummary(): PolicyStateSummaryDto {
  return { totalPolicies: 5, appliedCount: 3, notConfiguredCount: 2, pendingCount: 0, items: [] };
}

function validPreflight(): PreflightSnapshot {
  return { status: "PASS", readinessScore: 92, summary: { pass: 8, warn: 2, block: 0 } };
}

function fullInput(mode: "Demo" | "Real" = "Real"): DiagnosticReportInput {
  return {
    mode,
    generatedAt: ISO_NOW,
    inventory: sensitiveInventory(),
    policySummary: validPolicySummary(),
    preflight: validPreflight()
  };
}

test("builds a valid complete report from available data", () => {
  const { report, isComplete, missingSections } = buildDiagnosticReport(fullInput());

  assert.equal(isComplete, true);
  assert.deepEqual(missingSections, []);
  assert.equal(report.schemaVersion, "1.0.0");
  assert.equal(report.origin, "REAL");
  assert.equal(report.system?.operatingSystem, "Windows 11 Pro");
  assert.equal(report.system?.build, "26100.2894");
  assert.equal(report.system?.architecture, "64-bit");
  assert.equal(report.inventoryMetrics?.diskCount, 2);
  assert.equal(report.inventoryMetrics?.totalCapacityGb, 1500.94);
  assert.equal(report.inventoryMetrics?.totalFreeGb, 1012.4);
  assert.equal(report.inventoryMetrics?.detectedAppsCount, 1);
  assert.equal(report.inventoryMetrics?.installedAppsCount, 1);
  assert.equal(report.inventoryMetrics?.localUsersTotal, 2);
  assert.equal(report.inventoryMetrics?.localUsersAdministrators, 1);
  assert.equal(report.inventoryMetrics?.localUsersStandard, 1);
  assert.equal(report.policySummary?.totalPolicies, 5);
  assert.equal(report.policySummary?.applied, 3);
  assert.equal(report.policySummary?.notConfigured, 2);
  assert.equal(report.policySummary?.pendingAction, 0);
  assert.equal(report.preflight?.status, "PASS");
  assert.equal(report.preflight?.readinessScore, 92);
  assert.equal(report.preflight?.pass, 8);
  assert.equal(report.preflight?.warn, 2);
  assert.equal(report.preflight?.block, 0);
  assert.equal(canExportDiagnosticReport(report), true);
});

test("exported JSON has the correct schema and ISO 8601 timestamp", () => {
  const { report } = buildDiagnosticReport(fullInput());
  const json = serializeDiagnosticReport(report);
  const parsed = JSON.parse(json);

  assert.equal(parsed.schemaVersion, "1.0.0");
  assert.ok(!Number.isNaN(Date.parse(parsed.generatedAt)), "generatedAt must parse as a date");
  assert.match(parsed.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, "generatedAt must be ISO 8601");
  assert.deepEqual(Object.keys(parsed).sort(), ["generatedAt", "inventoryMetrics", "origin", "policySummary", "preflight", "schemaVersion", "system"]);
  assert.deepEqual(Object.keys(parsed.system).sort(), ["architecture", "build", "operatingSystem", "version"]);
  assert.deepEqual(
    Object.keys(parsed.inventoryMetrics).sort(),
    ["detectedAppsCount", "diskCount", "installedAppsCount", "localUsersAdministrators", "localUsersStandard", "localUsersTotal", "totalCapacityGb", "totalFreeGb"]
  );
  assert.deepEqual(Object.keys(parsed.policySummary).sort(), ["applied", "notConfigured", "pendingAction", "totalPolicies"]);
  assert.deepEqual(Object.keys(parsed.preflight).sort(), ["block", "pass", "readinessScore", "status", "warn"]);
  assert.match(diagnosticReportFileName(report), /^winlab-diagnostico-(demo|real)-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
});

test("DEMO and REAL reports are strictly separated by origin", () => {
  const demo = buildDiagnosticReport(fullInput("Demo")).report;
  const real = buildDiagnosticReport(fullInput("Real")).report;

  assert.equal(demo.origin, "DEMO");
  assert.equal(real.origin, "REAL");
  assert.notEqual(demo.origin, real.origin);

  const demoJson = serializeDiagnosticReport(demo);
  assert.equal(JSON.parse(demoJson).origin, "DEMO");
  assert.equal(demoJson.includes("REAL"), false, "DEMO export must never be marked as REAL");

  const rendered = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiagnosticReport, {
      mode: "Demo",
      inventory: sensitiveInventory(),
      policySummary: validPolicySummary(),
      preflightData: validPreflight()
    })
  );
  assert.match(rendered, /MODO DEMONSTRAÇÃO/);
  assert.equal(rendered.includes("MODO REAL"), false, "DEMO UI must never display the REAL badge");
});

test("exported content contains no personal data, paths, app names or identifiers", () => {
  const { report } = buildDiagnosticReport(fullInput("Real"));
  const json = serializeDiagnosticReport(report);

  const forbiddenLiterals = [
    "aluno.secret",
    "prof.admin",
    "S-1-5-21-999-1001",
    "S-1-5-21-999-1002",
    "LAB-SECRET-01",
    "Google Chrome",
    "chrome.exe",
    "C:\\Program Files",
    "C:\\\\Program Files",
    "\\\\\\\\.\\\\PhysicalDrive",
    "PhysicalDrive"
  ];
  for (const literal of forbiddenLiterals) {
    assert.equal(json.includes(literal), false, `exported JSON must not contain '${literal}'`);
  }
  assert.equal(json.toLowerCase().includes("sid"), false, "exported JSON must not contain sid keys");
  assert.equal(json.toLowerCase().includes("path"), false, "exported JSON must not contain path keys");
  assert.equal(/S-1-\d/.test(json), false, "exported JSON must not contain Windows SID patterns");
  assert.equal(json.includes("computerName"), false, "exported JSON must not include the computer name");
});

test("missing or incomplete data blocks export and reports missing sections", () => {
  const noInventory = buildDiagnosticReport({ ...fullInput(), inventory: null });
  assert.equal(noInventory.isComplete, false);
  assert.ok(noInventory.missingSections.includes("system"));
  assert.ok(noInventory.missingSections.includes("inventoryMetrics"));
  assert.equal(canExportDiagnosticReport(noInventory.report), false);
  assert.throws(() => serializeDiagnosticReport(noInventory.report), /incompleto/i);

  const noPolicies = buildDiagnosticReport({ ...fullInput(), policySummary: null });
  assert.equal(noPolicies.isComplete, false);
  assert.ok(noPolicies.missingSections.includes("policySummary"));
  assert.throws(() => serializeDiagnosticReport(noPolicies.report));

  const noPreflight = buildDiagnosticReport({ ...fullInput(), preflight: null });
  assert.equal(noPreflight.isComplete, false);
  assert.ok(noPreflight.missingSections.includes("preflight"));
  assert.throws(() => serializeDiagnosticReport(noPreflight.report));

  const empty = buildDiagnosticReport({ mode: "Demo", generatedAt: ISO_NOW, inventory: null, policySummary: null, preflight: null });
  assert.equal(empty.isComplete, false);
  assert.equal(empty.missingSections.length, 4);
});

test("invalid numeric values are rejected or neutralized, never fabricated", () => {
  const nanScore = buildDiagnosticReport({ ...fullInput(), preflight: { status: "PASS", readinessScore: Number.NaN, summary: { pass: 8, warn: 2, block: 0 } } });
  assert.equal(nanScore.report.preflight?.readinessScore, null, "NaN readiness must become null, never a default like 100");
  assert.equal(nanScore.report.preflight?.readinessScore !== 100, true);

  const infiniteScore = buildDiagnosticReport({ ...fullInput(), preflight: { status: "PASS", readinessScore: Number.POSITIVE_INFINITY, summary: { pass: 8, warn: 2, block: 0 } } });
  assert.equal(infiniteScore.report.preflight?.readinessScore, null);

  const stringScore = buildDiagnosticReport({ ...fullInput(), preflight: { status: "PASS", readinessScore: "100" as unknown as number, summary: { pass: 8, warn: 2, block: 0 } } });
  assert.equal(stringScore.report.preflight?.readinessScore, null);

  const negativeCounts = buildDiagnosticReport({ ...fullInput(), policySummary: { totalPolicies: -1, appliedCount: 3, notConfiguredCount: 2, pendingCount: 0, items: [] } });
  assert.equal(negativeCounts.isComplete, false);
  assert.ok(negativeCounts.missingSections.includes("policySummary"));
  assert.throws(() => serializeDiagnosticReport(negativeCounts.report));

  const invalidPreCounts = buildDiagnosticReport({ ...fullInput(), preflight: { status: "PASS", readinessScore: 90, summary: { pass: Number.NaN, warn: 2, block: 0 } } });
  assert.equal(invalidPreCounts.isComplete, false);
  assert.ok(invalidPreCounts.missingSections.includes("preflight"));

  const negativeDisk = buildDiagnosticReport({ ...fullInput(), inventory: { ...sensitiveInventory(), disks: [{ device: "C:", totalGb: -5, freeGb: 0, freePercent: 0 }] } });
  assert.equal(negativeDisk.isComplete, false);
  assert.ok(negativeDisk.missingSections.includes("inventoryMetrics"));

  assert.throws(() => buildDiagnosticReport({ ...fullInput(), generatedAt: "not-a-date" }), /ISO 8601/);
});

test("export is disabled during loading and on query errors (no stale or mixed export)", () => {
  function renderButton(props: { isScanning?: boolean; scanError?: string | null }) {
    return ReactDOMServer.renderToStaticMarkup(
      React.createElement(DiagnosticReport, {
        mode: "Real",
        inventory: sensitiveInventory(),
        policySummary: validPolicySummary(),
        preflightData: validPreflight(),
        ...props
      })
    );
  }

  const loadingAfterPurge = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiagnosticReport, {
      mode: "Real",
      inventory: null,
      policySummary: null,
      preflightData: null,
      isScanning: true,
      scanError: null
    })
  );
  assert.match(loadingAfterPurge, /disabled=""/, "export button must be disabled while scanning");
  assert.match(loadingAfterPurge, /Carregando diagnóstico/);

  const rescanWithData = renderButton({ isScanning: true });
  assert.match(rescanWithData, /disabled=""/, "export button must stay disabled during a rescan even with stale-visible data");
  assert.equal(rescanWithData.includes("Carregando diagnóstico"), false, "no loading card when data is already rendered");

  const error = renderButton({ scanError: "Falha ao escanear o computador real." });
  assert.match(error, /disabled=""/, "export button must be disabled on query error");
  assert.match(error, /Falha na consulta de diagnóstico/);

  const ready = renderButton({});
  assert.equal(ready.includes("disabled=\"\""), false, "export button must be enabled with complete data and no errors");
  assert.match(ready, /MODO REAL/);

  const incompleteButIdle = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiagnosticReport, {
      mode: "Real",
      inventory: null,
      policySummary: null,
      preflightData: null,
      isScanning: false,
      scanError: null
    })
  );
  assert.match(incompleteButIdle, /disabled=""/, "export button must be disabled without data");
  assert.match(incompleteButIdle, /Nenhum dado disponível/);
});

test("diagnostic feature performs no mutation IPC calls (read-only guarantee)", async () => {
  const sources = await Promise.all([
    readFile("src/desktop/diagnostic-report.ts", "utf8"),
    readFile("src/desktop/DiagnosticReport.tsx", "utf8")
  ]);

  const forbidden = [
    "ACTION_APPLY_TRANSACTION",
    "ACTION_ROLLBACK_TRANSACTION",
    "ACTION_APPLY_POLICIES",
    "ACTION_ROLLBACK_POLICIES",
    "ACTION_CREATE_BASELINE",
    "mode.set",
    "apply_transaction",
    "rollback",
    "fetch(",
    "XMLHttpRequest"
  ];
  for (const source of sources) {
    for (const token of forbidden) {
      assert.equal(source.includes(token), false, `read-only feature must not reference '${token}'`);
    }
  }
});

test("report builds from the real mock DTOs obtained via IPC (contract compatibility)", async () => {
  const agent = new MockDesktopAgent();

  const invRes = await agent.handleRequest<MachineInventoryDto>({ id: "r1", version: IPC_CONSTANTS.PROTOCOL_VERSION, timestamp: ISO_NOW, type: "query", action: IPC_CONSTANTS.ACTION_QUERY_INVENTORY });
  const polRes = await agent.handleRequest<PolicyStateSummaryDto>({ id: "r2", version: IPC_CONSTANTS.PROTOCOL_VERSION, timestamp: ISO_NOW, type: "query", action: IPC_CONSTANTS.ACTION_QUERY_POLICY_STATE });
  const preRes = await agent.handleRequest<PreflightSnapshot>({ id: "r3", version: IPC_CONSTANTS.PROTOCOL_VERSION, timestamp: ISO_NOW, type: "query", action: IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT });

  assert.equal(invRes.success, true);
  assert.equal(polRes.success, true);
  assert.equal(preRes.success, true);

  const { report, isComplete } = buildDiagnosticReport({
    mode: "Demo",
    generatedAt: ISO_NOW,
    inventory: invRes.data ?? null,
    policySummary: polRes.data ?? null,
    preflight: preRes.data ?? null
  });

  assert.equal(isComplete, true);
  assert.equal(report.origin, "DEMO");
  const parsed = JSON.parse(serializeDiagnosticReport(report));
  assert.equal(parsed.schemaVersion, "1.0.0");
  assert.equal(typeof parsed.inventoryMetrics.localUsersAdministrators, "number");
  assert.equal(typeof parsed.preflight.readinessScore, "number");
});
