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
import { cmdSafeLabel, withPsUtf8Bom } from "./powershell";
import type { Config } from "./types";

export const PACKAGE_MANIFEST_SCHEMA_VERSION = 1;
export const WINLAB_PACKAGE_VERSION = "0.9.2";

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
  return withPsUtf8Bom(`#requires -version 5.1
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
`);
}

export const CMD_EXIT_CODES = {
  SUCCESS: 0,
  EXECUTION_ERROR: 1,
  INTEGRITY_FAILURE: 2,
  VERIFICATION_FAILURE: 3,
  ROLLBACK_INCOMPLETE: 4,
  CANCELLED: 5
} as const;

export function generateLauncherCmdScript(config: Config): string {
  const safeProfile = cmdSafeLabel(config.profileName);
  return [
    "@echo off",
    "setlocal EnableExtensions",
    "chcp 65001 >nul 2>&1",
    `title WinLab - Configurar Computador (${safeProfile})`,
    "rem Codigos de saida: 0=sucesso, 1=erro de execucao, 2=falha SHA-256, 3=falha verify.ps1, 5=cancelado",
    "echo ================================================================",
    `echo   WinLab - Configuracao Pos-Formatacao (${safeProfile})`,
    "echo ================================================================",
    "echo.",
    "if not \"%OS%\"==\"Windows_NT\" (",
    "  echo [ERRO] Este pacote deve ser executado em um computador Windows.",
    "  pause",
    "  exit /b 1",
    ")",
    "cd /d \"%~dp0\"",
    "if not exist \"%~dp0setup.ps1\" (",
    "  echo [ERRO] Extraia TODOS os arquivos do ZIP para uma pasta antes de abrir Configurar-Computador.cmd.",
    "  pause",
    "  exit /b 1",
    ")",
    "if not exist \"%~dp0manifest.json\" (",
    "  echo [ERRO] manifest.json nao encontrado. Extraia o pacote ZIP completo antes de continuar.",
    "  pause",
    "  exit /b 1",
    ")",
    "net session >nul 2>&1",
    "if not %errorLevel%==0 goto :winlab_elevate",
    "echo [1/4] Verificando integridade SHA-256 do pacote...",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0verify-package.ps1\"",
    "if not %errorLevel%==0 (",
    "  echo.",
    "  echo [BLOQUEADO] A verificacao de integridade do pacote falhou. Nenhuma alteracao foi feita.",
    "  pause",
    "  exit /b 2",
    ")",
    "echo.",
    "echo [2/4] Exibindo plano de configuracao ^(modo simulacao^)...",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0setup.ps1\"",
    "if not %errorLevel%==0 (",
    "  echo.",
    "  echo [ERRO] Falha ao exibir o plano inicial.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
    "set \"WINLAB_CONFIRM=\"",
    "set /p WINLAB_CONFIRM=\"Deseja aplicar esta configuracao neste computador agora? (S/N): \"",
    "setlocal EnableDelayedExpansion",
    "if /I not \"!WINLAB_CONFIRM!\"==\"S\" (",
    "  endlocal",
    "  echo Operacao cancelada pelo operador. Nenhuma alteracao foi aplicada.",
    "  pause",
    "  exit /b 5",
    ")",
    "endlocal",
    "echo.",
    "echo [3/4] Aplicando configuracao e preservando baseline para reversao...",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0setup.ps1\" -Apply",
    "if not %errorLevel%==0 (",
    "  echo.",
    "  echo [ERRO] A aplicacao encontrou um problema. Verifique as mensagens acima.",
    "  pause",
    "  exit /b 1",
    ")",
    "echo.",
    "echo [4/4] Verificando estado final aplicado...",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0verify.ps1\" -PostApply",
    "set \"WINLAB_EXIT=%errorLevel%\"",
    "if not \"%WINLAB_EXIT%\"==\"0\" (",
    "  echo.",
    "  echo [ERRO] A verificacao final ^(verify.ps1^) falhou com codigo %WINLAB_EXIT%. A configuracao nao foi validada.",
    "  pause",
    "  exit /b 3",
    ")",
    "echo.",
    "echo ================================================================",
    "echo   Concluido! Se solicitado acima, reinicie o computador ou",
    "echo   encerre a sessao da conta comum para efetivar todas as regras.",
    "echo ================================================================",
    "pause",
    "exit /b 0",
    ":winlab_elevate",
    "echo Solicitando permissao de Administrador do Windows ^(UAC^)...",
    "set \"WINLAB_ELEVATE_SCRIPT=%~f0\"",
    "set \"WINLAB_ELEVATE_DIR=%~dp0\"",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"try { $p = Start-Process -FilePath $env:WINLAB_ELEVATE_SCRIPT -WorkingDirectory $env:WINLAB_ELEVATE_DIR -Verb RunAs -Wait -PassThru; exit $p.ExitCode } catch { exit 1 }\"",
    "exit /b %errorLevel%"
  ].join("\r\n") + "\r\n";
}

export function generateRollbackCmdScript(config: Config): string {
  const safeProfile = cmdSafeLabel(config.profileName);
  return [
    "@echo off",
    "setlocal EnableExtensions",
    "chcp 65001 >nul 2>&1",
    `title WinLab - Reverter Configuracao (${safeProfile})`,
    "rem Codigos de saida: 0=sucesso, 1=erro de execucao, 2=falha SHA-256, 4=rollback incompleto, 5=cancelado",
    "if not \"%OS%\"==\"Windows_NT\" (",
    "  echo [ERRO] Este pacote deve ser executado em um computador Windows.",
    "  pause",
    "  exit /b 1",
    ")",
    "cd /d \"%~dp0\"",
    "if not exist \"%~dp0rollback.ps1\" (",
    "  echo [ERRO] Extraia todos os arquivos do pacote ZIP antes de executar Reverter-Configuracao.cmd.",
    "  pause",
    "  exit /b 1",
    ")",
    "if not exist \"%~dp0manifest.json\" (",
    "  echo [ERRO] manifest.json nao encontrado. Extraia o pacote ZIP completo antes de continuar.",
    "  pause",
    "  exit /b 1",
    ")",
    "net session >nul 2>&1",
    "if not %errorLevel%==0 goto :winlab_elevate",
    "echo [1/2] Verificando integridade SHA-256 do pacote...",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0verify-package.ps1\"",
    "if not %errorLevel%==0 (",
    "  echo [BLOQUEADO] Integridade do pacote invalida.",
    "  pause",
    "  exit /b 2",
    ")",
    "set \"WINLAB_RB=\"",
    "set /p WINLAB_RB=\"Confirma a reversao para o baseline anterior deste computador? (S/N): \"",
    "setlocal EnableDelayedExpansion",
    "if /I not \"!WINLAB_RB!\"==\"S\" (",
    "  endlocal",
    "  echo Operacao cancelada pelo operador.",
    "  pause",
    "  exit /b 5",
    ")",
    "endlocal",
    "echo [2/2] Executando rollback.ps1 -Apply...",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0rollback.ps1\" -Apply",
    "set \"WINLAB_EXIT=%errorLevel%\"",
    "if \"%WINLAB_EXIT%\"==\"4\" (",
    "  echo.",
    "  echo [ERRO] Rollback incompleto! Apenas parte das politicas foi revertida. Consulte as mensagens acima e C:\\ProgramData\\WinLab.",
    "  pause",
    "  exit /b 4",
    ")",
    "if not \"%WINLAB_EXIT%\"==\"0\" (",
    "  echo.",
    "  echo [ERRO] O rollback falhou ^(codigo %WINLAB_EXIT%^). Nenhuma conclusao foi confirmada.",
    "  pause",
    "  exit /b %WINLAB_EXIT%",
    ")",
    "echo.",
    "echo ================================================================",
    "echo   Rollback concluido com sucesso! Reinicie o computador.",
    "echo ================================================================",
    "pause",
    "exit /b 0",
    ":winlab_elevate",
    "echo Solicitando permissao de Administrador do Windows ^(UAC^)...",
    "set \"WINLAB_ELEVATE_SCRIPT=%~f0\"",
    "set \"WINLAB_ELEVATE_DIR=%~dp0\"",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"try { $p = Start-Process -FilePath $env:WINLAB_ELEVATE_SCRIPT -WorkingDirectory $env:WINLAB_ELEVATE_DIR -Verb RunAs -Wait -PassThru; exit $p.ExitCode } catch { exit 1 }\"",
    "exit /b %errorLevel%"
  ].join("\r\n") + "\r\n";
}

export function getBasePackageFiles(config: Config): PackageFile[] {
  return [
    { name: "Configurar-Computador.cmd", content: generateLauncherCmdScript(config) },
    { name: "Reverter-Configuracao.cmd", content: generateRollbackCmdScript(config) },
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
