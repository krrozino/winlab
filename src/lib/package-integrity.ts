import { generateInventoryScannerScript } from "./inventory-script";
import {
  generateAuditScript,
  generateConfigJson,
  generateMaintenanceScript,
  generateReadme,
  generateRollbackScript,
  generateSetupScript,
  generateUnlockWallpaperScript,
  generateVerifyScript
} from "./generator";
import { generatePreflightScript } from "./preflight-script";
import type { Config } from "./types";

export const PACKAGE_MANIFEST_SCHEMA_VERSION = 1;
export const WINLAB_PACKAGE_VERSION = "0.9.0";

export type PackageFile = {
  name: string;
  content: string;
};

export type PackageManifestFile = {
  name: string;
  sha256: string;
  bytes: number;
};

export type PackageManifest = {
  schemaVersion: 1;
  packageVersion: string;
  packageId: string;
  generatedAt: string;
  profileName: string;
  configSchemaVersion: 1;
  channel: "standard" | "pilot";
  targetComputerName: string | null;
  integrity: {
    algorithm: "SHA-256";
    manifestSelfHashed: false;
    authenticity: "unsigned";
  };
  files: PackageManifestFile[];
};

function bytes(content: string) {
  return new TextEncoder().encode(content);
}

export async function sha256Text(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes(content));

  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function generateVerifyPackageScript(): string {
  return `#requires -version 5.1
[CmdletBinding()]
param(
    [string]$PackageRoot = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$manifestPath = Join-Path $PackageRoot "manifest.json"

if (-not (Test-Path $manifestPath)) {
    Write-Error "manifest.json não encontrado em '$PackageRoot'."
    exit 1
}

try {
    $manifest = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
catch {
    Write-Error ("manifest.json inválido: " + $_.Exception.Message)
    exit 1
}

if ($manifest.schemaVersion -ne 1) {
    Write-Error ("Versão de manifesto não suportada: " + $manifest.schemaVersion)
    exit 1
}

if ($manifest.integrity.algorithm -ne "SHA-256") {
    Write-Error ("Algoritmo de integridade não suportado: " + $manifest.integrity.algorithm)
    exit 1
}

$failures = New-Object System.Collections.Generic.List[string]

foreach ($entry in @($manifest.files)) {
    $filePath = Join-Path $PackageRoot ([string]$entry.name)

    if (-not (Test-Path $filePath -PathType Leaf)) {
        $failures.Add("Arquivo ausente: $($entry.name)")
        continue
    }

    $hash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $expected = ([string]$entry.sha256).ToLowerInvariant()

    if ($hash -ne $expected) {
        $failures.Add("Hash divergente: $($entry.name)")
    }

    $length = (Get-Item -LiteralPath $filePath).Length
    if ([int64]$entry.bytes -ne [int64]$length) {
        $failures.Add("Tamanho divergente: $($entry.name)")
    }
}

if ($failures.Count -gt 0) {
    Write-Host "=== WinLab Package Integrity: FAIL ===" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host ("- " + $failure) -ForegroundColor Red
    }

    exit 1
}

Write-Host "=== WinLab Package Integrity: PASS ===" -ForegroundColor Green
Write-Host ("Package ID: " + $manifest.packageId)
Write-Host ("Version: " + $manifest.packageVersion)
Write-Host ("Arquivos verificados: " + @($manifest.files).Count)

if ($manifest.integrity.authenticity -eq "unsigned") {
    Write-Host "Nota: os hashes verificam integridade, não autenticidade/assinatura do pacote." -ForegroundColor Yellow
}
`;
}

export function getBasePackageFiles(config: Config): PackageFile[] {
  return [
    { name: "setup.ps1", content: generateSetupScript(config) },
    { name: "rollback.ps1", content: generateRollbackScript(config) },
    { name: "audit.ps1", content: generateAuditScript(config) },
    {
      name: "liberar-wallpaper.ps1",
      content: generateUnlockWallpaperScript(config)
    },
    { name: "verify.ps1", content: generateVerifyScript(config) },
    { name: "preflight.ps1", content: generatePreflightScript(config) },
    { name: "scan-pc.ps1", content: generateInventoryScannerScript() },
    { name: "maintenance.ps1", content: generateMaintenanceScript(config) },
    { name: "config.json", content: generateConfigJson(config) },
    { name: "README.txt", content: generateReadme(config) },
    { name: "verify-package.ps1", content: generateVerifyPackageScript() }
  ];
}

export type PackageIntegrityFailure = {
  name: string;
  reason: "missing" | "hash" | "size";
};

export async function verifyPackageFiles(
  manifest: PackageManifest,
  files: PackageFile[]
): Promise<{ ok: boolean; failures: PackageIntegrityFailure[] }> {
  const byName = new Map(files.map((file) => [file.name, file]));
  const failures: PackageIntegrityFailure[] = [];

  for (const entry of manifest.files) {
    const file = byName.get(entry.name);

    if (!file) {
      failures.push({ name: entry.name, reason: "missing" });
      continue;
    }

    if (bytes(file.content).byteLength !== entry.bytes) {
      failures.push({ name: entry.name, reason: "size" });
      continue;
    }

    if ((await sha256Text(file.content)) !== entry.sha256) {
      failures.push({ name: entry.name, reason: "hash" });
    }
  }

  return {
    ok: failures.length === 0,
    failures
  };
}

export async function buildPackageManifest(
  config: Config,
  files: PackageFile[],
  options?: {
    packageId?: string;
    generatedAt?: string;
    channel?: "standard" | "pilot";
    targetComputerName?: string | null;
  }
): Promise<PackageManifest> {
  const manifestFiles = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      sha256: await sha256Text(file.content),
      bytes: bytes(file.content).byteLength
    }))
  );

  return {
    schemaVersion: PACKAGE_MANIFEST_SCHEMA_VERSION,
    packageVersion: WINLAB_PACKAGE_VERSION,
    packageId: options?.packageId ?? crypto.randomUUID(),
    generatedAt: options?.generatedAt ?? new Date().toISOString(),
    profileName: config.profileName,
    configSchemaVersion: 1,
    channel: options?.channel ?? "standard",
    targetComputerName: options?.targetComputerName ?? null,
    integrity: {
      algorithm: "SHA-256",
      manifestSelfHashed: false,
      authenticity: "unsigned"
    },
    files: manifestFiles
  };
}

export async function buildWinLabPackageFiles(
  config: Config,
  options?: {
    packageId?: string;
    generatedAt?: string;
    channel?: "standard" | "pilot";
    targetComputerName?: string | null;
    extraFiles?: PackageFile[];
  }
): Promise<PackageFile[]> {
  const files = [
    ...getBasePackageFiles(config),
    ...(options?.extraFiles ?? [])
  ];
  const manifest = await buildPackageManifest(config, files, options);

  return [
    ...files,
    {
      name: "manifest.json",
      content: JSON.stringify(manifest, null, 2) + "\n"
    }
  ];
}
