import { APP_CATALOG } from "./apps";
import type { Config } from "./types";

function psString(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

function psBool(value: boolean) {
  return value ? "$true" : "$false";
}

function psArray(values: readonly string[]) {
  if (!values.length) return "@()";
  return "@(" + values.map(psString).join(", ") + ")";
}

export function generatePreflightScript(config: Config): string {
  const knownApps = config.allowedApps
    .map((id) => {
      const app = APP_CATALOG[id];
      return "@{ Id = " + psString(id) + "; Label = " + psString(app.label) + "; Paths = " + psArray(app.paths) + " }";
    })
    .join(",\n    ");

  return String.raw`#requires -version 5.1
[CmdletBinding()]
param([string]$OutputPath = $null)

<#
WINLAB PREFLIGHT / READINESS
Somente diagnóstico. Não aplica políticas nem altera contas.
#>

$ErrorActionPreference = "Stop"
$ProfileName = ${psString(config.profileName)}
$Aluno = ${psString(config.studentUser)}
$Admin = ${psString(config.adminUser)}
$CreateAccounts = ${psBool(config.createAccounts)}
$EnforcementMode = ${psString(config.enforcementMode)}
$StorageWarningFreePercent = ${config.storageWarningFreePercent}
$BrowserUrlMode = ${psString(config.browserUrlMode)}
$AllowedUrls = ${psArray(config.allowedUrls)}
$CustomAllowedPaths = ${psArray(config.customAllowedPaths)}

$KnownApps = @(
    ${knownApps}
)

$checks = @()

function Add-Check {
    param(
        [Parameter(Mandatory=$true)][string]$Id,
        [Parameter(Mandatory=$true)][string]$Label,
        [Parameter(Mandatory=$true)][ValidateSet("PASS", "WARN", "BLOCK")][string]$Status,
        [Parameter(Mandatory=$true)][string]$Message
    )

    $script:checks += [PSCustomObject]@{
        id = $Id
        label = $Label
        status = $Status
        message = $Message
    }
}

function Test-CommandSet {
    param(
        [Parameter(Mandatory=$true)][string]$Id,
        [Parameter(Mandatory=$true)][string]$Label,
        [Parameter(Mandatory=$true)][string[]]$Commands
    )

    $missing = @($Commands | Where-Object { -not (Get-Command $_ -ErrorAction SilentlyContinue) })

    if ($missing.Count -eq 0) {
        Add-Check $Id $Label "PASS" "Todos os comandos necessários estão disponíveis."
    }
    else {
        Add-Check $Id $Label "BLOCK" ("Comandos ausentes: " + ($missing -join ", "))
    }
}

function Test-PackageIntegrity {
    if (-not $PSScriptRoot) {
        Add-Check "package.integrity" "Integridade do pacote" "WARN" "Diretório do pacote indisponível."
        return
    }

    $manifestPath = Join-Path $PSScriptRoot "manifest.json"

    if (-not (Test-Path $manifestPath)) {
        Add-Check "package.integrity" "Integridade do pacote" "WARN" "manifest.json não encontrado; script possivelmente isolado."
        return
    }

    try {
        $manifest = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $failures = @()

        if ($manifest.schemaVersion -ne 1) {
            $failures += "schema incompatível"
        }
        else {
            foreach ($entry in @($manifest.files)) {
                $path = Join-Path $PSScriptRoot ([string]$entry.name)

                if (-not (Test-Path $path -PathType Leaf)) {
                    $failures += "ausente: $($entry.name)"
                    continue
                }

                $actualHash = (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLowerInvariant()
                $expectedHash = ([string]$entry.sha256).ToLowerInvariant()
                $actualBytes = (Get-Item -LiteralPath $path).Length

                if ($actualHash -ne $expectedHash) {
                    $failures += "hash: $($entry.name)"
                }
                elseif ([int64]$actualBytes -ne [int64]$entry.bytes) {
                    $failures += "tamanho: $($entry.name)"
                }
            }
        }

        if ($failures.Count -gt 0) {
            Add-Check "package.integrity" "Integridade do pacote" "BLOCK" ("Falhas: " + ($failures -join "; "))
        }
        else {
            Add-Check "package.integrity" "Integridade do pacote" "PASS" ("Package ID: " + $manifest.packageId)
        }
    }
    catch {
        Add-Check "package.integrity" "Integridade do pacote" "BLOCK" $_.Exception.Message
    }
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if ($isAdmin) {
    Add-Check "runtime.admin" "Execução administrativa" "PASS" "O preflight está rodando elevado."
}
else {
    Add-Check "runtime.admin" "Execução administrativa" "BLOCK" "setup.ps1 -Apply exigirá execução como administrador."
}

$os = Get-CimInstance Win32_OperatingSystem

Test-CommandSet -Id "runtime.localAccounts" -Label "Cmdlets de contas locais" -Commands @("Get-LocalUser", "Get-LocalGroup")
Test-CommandSet -Id "runtime.applocker" -Label "Cmdlets AppLocker" -Commands @("Get-AppLockerPolicy", "Set-AppLockerPolicy")
Test-CommandSet -Id "runtime.tasks" -Label "Scheduled Tasks" -Commands @("New-ScheduledTaskAction", "New-ScheduledTaskTrigger", "New-ScheduledTaskPrincipal", "Register-ScheduledTask", "Unregister-ScheduledTask")

$appIdService = Get-Service AppIDSvc -ErrorAction SilentlyContinue
if (-not $appIdService) {
    Add-Check "runtime.appidsvc" "Application Identity" "BLOCK" "Serviço AppIDSvc não encontrado."
}
elseif ($appIdService.Status -eq "Running") {
    Add-Check "runtime.appidsvc" "Application Identity" "PASS" "Serviço em execução."
}
else {
    Add-Check "runtime.appidsvc" "Application Identity" "WARN" ("Serviço está " + $appIdService.Status + "; setup tentará iniciá-lo.")
}

if ([string]::Equals($Aluno, $Admin, [StringComparison]::OrdinalIgnoreCase)) {
    Add-Check "accounts.distinct" "Contas separadas" "BLOCK" "Usuário restrito e administrador usam o mesmo nome."
}
else {
    Add-Check "accounts.distinct" "Contas separadas" "PASS" "Usuário restrito e administrador são diferentes."
}

$student = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
$admin = Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue

if ($student) {
    Add-Check "accounts.student" "Conta restrita" "PASS" ("Conta existente: " + $Aluno)
}
elseif ($CreateAccounts) {
    Add-Check "accounts.student" "Conta restrita" "WARN" ("Conta '" + $Aluno + "' ainda não existe; setup tentará criá-la.")
}
else {
    Add-Check "accounts.student" "Conta restrita" "BLOCK" ("Conta '" + $Aluno + "' ausente e criação automática desativada.")
}

if ($admin) {
    Add-Check "accounts.admin" "Conta administrativa" "PASS" ("Conta existente: " + $Admin)
}
elseif ($CreateAccounts) {
    Add-Check "accounts.admin" "Conta administrativa" "WARN" ("Conta '" + $Admin + "' ainda não existe; setup tentará criá-la.")
}
else {
    Add-Check "accounts.admin" "Conta administrativa" "BLOCK" ("Conta '" + $Admin + "' ausente e criação automática desativada.")
}

if ($student) {
    $studentSid = $student.SID.Value
    $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$studentSid'" -ErrorAction SilentlyContinue
    $hiveReady = $profile -and $profile.LocalPath -and (Test-Path (Join-Path $profile.LocalPath "NTUSER.DAT"))

    if ($hiveReady) {
        Add-Check "accounts.profile" "Perfil da conta restrita" "PASS" "NTUSER.DAT disponível; políticas HKCU podem ser aplicadas imediatamente."
    }
    else {
        Add-Check "accounts.profile" "Perfil da conta restrita" "WARN" "Perfil ainda não está pronto; WinLab usará aplicação diferida no primeiro login."
    }
}
elseif ($CreateAccounts) {
    Add-Check "accounts.profile" "Perfil da conta restrita" "WARN" "A conta será criada; políticas HKCU podem ser concluídas no primeiro login."
}

$systemDisk = Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq $env:SystemDrive } | Select-Object -First 1
if ($systemDisk -and $systemDisk.Size -gt 0) {
    $freePercent = [math]::Round(($systemDisk.FreeSpace / $systemDisk.Size) * 100, 1)
    $freeGb = [math]::Round($systemDisk.FreeSpace / 1GB, 1)

    if ($freePercent -lt 5) {
        Add-Check "storage.system" "Armazenamento" "BLOCK" ("Apenas " + $freePercent + "% livre (" + $freeGb + " GB).")
    }
    elseif ($freePercent -lt $StorageWarningFreePercent) {
        Add-Check "storage.system" "Armazenamento" "WARN" ("Espaço livre abaixo do limite configurado: " + $freePercent + "%.")
    }
    else {
        Add-Check "storage.system" "Armazenamento" "PASS" ("Espaço livre: " + $freePercent + "% (" + $freeGb + " GB).")
    }
}
else {
    Add-Check "storage.system" "Armazenamento" "WARN" "Não foi possível consultar o disco do sistema."
}

foreach ($app in $KnownApps) {
    $found = $null

    foreach ($rawPath in $app.Paths) {
        $expanded = [Environment]::ExpandEnvironmentVariables($rawPath)
        if (Test-Path $expanded) {
            $found = $expanded
            break
        }
    }

    if ($found) {
        Add-Check ("app." + $app.Id) $app.Label "PASS" ("Encontrado: " + $found)
    }
    else {
        Add-Check ("app." + $app.Id) $app.Label "WARN" "Aplicativo permitido não foi encontrado nos caminhos conhecidos."
    }
}

for ($index = 0; $index -lt $CustomAllowedPaths.Count; $index++) {
    $rawPath = $CustomAllowedPaths[$index]
    $expanded = [Environment]::ExpandEnvironmentVariables($rawPath)

    if (Test-Path $expanded) {
        Add-Check ("customPath." + $index) "Caminho customizado" "PASS" ("Encontrado: " + $expanded)
    }
    else {
        Add-Check ("customPath." + $index) "Caminho customizado" "WARN" ("Não encontrado: " + $expanded)
    }
}

if ($EnforcementMode -eq "Enabled") {
    Add-Check "config.enforcement" "AppLocker enforcement" "WARN" "Configuração está em bloqueio ativo. Para primeiro piloto, prefira AuditOnly."
}
else {
    Add-Check "config.enforcement" "AppLocker enforcement" "PASS" "AuditOnly: adequado para validação inicial."
}

if ($BrowserUrlMode -eq "AllowListOnly" -and $AllowedUrls.Count -eq 0) {
    Add-Check "config.web" "Navegação web" "WARN" "AllowListOnly sem URLs permitidas bloqueará praticamente toda a navegação."
}
else {
    Add-Check "config.web" "Navegação web" "PASS" ("Modo: " + $BrowserUrlMode)
}

$statePath = "C:\ProgramData\WinLab\state.json"
if (Test-Path $statePath) {
    try {
        $state = Get-Content -Path $statePath -Raw -Encoding UTF8 | ConvertFrom-Json

        if ($state.studentUser -and -not [string]::Equals([string]$state.studentUser, $Aluno, [StringComparison]::OrdinalIgnoreCase)) {
            Add-Check "state.identity" "Estado WinLab existente" "BLOCK" ("state.json pertence ao usuário '" + $state.studentUser + "'.")
        }
        elseif ($state.adminUser -and -not [string]::Equals([string]$state.adminUser, $Admin, [StringComparison]::OrdinalIgnoreCase)) {
            Add-Check "state.identity" "Estado WinLab existente" "BLOCK" ("state.json pertence ao administrador '" + $state.adminUser + "'.")
        }
        else {
            Add-Check "state.identity" "Estado WinLab existente" "PASS" ("Status: " + $state.status)
        }

        if ($state.status -eq "RecoveryFailed" -or $state.status -eq "Applying") {
            Add-Check "state.status" "Saúde da aplicação anterior" "BLOCK" ("Estado requer intervenção: " + $state.status)
        }
        elseif ($state.status -eq "RecoveredAfterFailure") {
            Add-Check "state.status" "Saúde da aplicação anterior" "WARN" "Uma falha anterior foi recuperada automaticamente."
        }
        else {
            Add-Check "state.status" "Saúde da aplicação anterior" "PASS" ("Status: " + $state.status)
        }

        $appLockerBackupOk = $state.baselineAppLockerBackup -and (Test-Path ([string]$state.baselineAppLockerBackup))
        if ($appLockerBackupOk) {
            Add-Check "state.applockerBackup" "Baseline AppLocker" "PASS" ([string]$state.baselineAppLockerBackup)
        }
        else {
            Add-Check "state.applockerBackup" "Baseline AppLocker" "BLOCK" "state.json existe, mas o baseline AppLocker não foi encontrado."
        }

        $registryBackupOk = $state.registryBaselineDir -and (Test-Path ([string]$state.registryBaselineDir))
        if ($registryBackupOk) {
            Add-Check "state.registryBackup" "Baseline de registro" "PASS" ([string]$state.registryBaselineDir)
        }
        else {
            Add-Check "state.registryBackup" "Baseline de registro" "BLOCK" "state.json existe, mas o baseline de registro não foi encontrado."
        }
    }
    catch {
        Add-Check "state.parse" "Estado WinLab" "BLOCK" ("state.json inválido: " + $_.Exception.Message)
    }
}
else {
    Add-Check "state.clean" "Estado WinLab" "PASS" "Nenhuma aplicação WinLab anterior registrada."
}

Test-PackageIntegrity

$pass = @($checks | Where-Object { $_.status -eq "PASS" }).Count
$warn = @($checks | Where-Object { $_.status -eq "WARN" }).Count
$block = @($checks | Where-Object { $_.status -eq "BLOCK" }).Count
$total = [math]::Max(1, $checks.Count)
$score = [math]::Round((($pass + ($warn * 0.5)) / $total) * 100)
$status = if ($block -gt 0) { "BLOCK" } elseif ($warn -gt 0) { "WARN" } else { "PASS" }

$report = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToString("o")
    computerName = $env:COMPUTERNAME
    profileName = $ProfileName
    windows = [ordered]@{
        caption = [string]$os.Caption
        version = [string]$os.Version
        buildNumber = [string]$os.BuildNumber
        architecture = [string]$os.OSArchitecture
    }
    status = $status
    summary = [ordered]@{
        score = [int]$score
        pass = $pass
        warn = $warn
        block = $block
    }
    checks = @($checks)
}

if (-not $OutputPath) {
    $OutputPath = Join-Path $PSScriptRoot ("winlab-preflight-" + $env:COMPUTERNAME + ".json")
}

$report | ConvertTo-Json -Depth 7 | Set-Content -Path $OutputPath -Encoding UTF8

Write-Host ""
Write-Host "=== WinLab Readiness ===" -ForegroundColor Cyan
Write-Host ("Status: " + $status)
Write-Host ("Score: " + $score + "/100")
Write-Host ("PASS: " + $pass + " | WARN: " + $warn + " | BLOCK: " + $block)
Write-Host ("Relatório: " + $OutputPath)

foreach ($check in $checks) {
    $color = if ($check.status -eq "PASS") { "Green" } elseif ($check.status -eq "WARN") { "Yellow" } else { "Red" }
    Write-Host ("[" + $check.status + "] " + $check.label + " - " + $check.message) -ForegroundColor $color
}
`;
}
