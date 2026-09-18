import { APP_CATALOG } from "./apps";

function psString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function psArray(values: readonly string[]) {
  if (!values.length) return "@()";
  return `@(\n${values.map((value) => `        ${psString(value)}`).join(",\n")}\n    )`;
}

export function generateInventoryScannerScript(): string {
  const appBlocks = Object.entries(APP_CATALOG)
    .map(
      ([id, app]) => `    @{
        Id = ${psString(id)}
        Label = ${psString(app.label)}
        Paths = ${psArray(app.paths)}
    }`
    )
    .join(",\n");

  return `#requires -version 5.1
<#
WINLAB PC INVENTORY
Gera um inventário local para importar no WinLab Configurator.

O arquivo NÃO coleta senhas, documentos, histórico do navegador ou conteúdo pessoal.
Ele registra apenas informações do Windows, contas locais, AppLocker e programas instalados.
#>

$ErrorActionPreference = "Stop"

$KnownApps = @(
${appBlocks}
)

function Get-WinLabInstalledApps {
    $paths = @(
        "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
        "HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*",
        "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
    )

    $apps = foreach ($path in $paths) {
        Get-ItemProperty -Path $path -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName } |
            ForEach-Object {
                [PSCustomObject]@{
                    name = [string]$_.DisplayName
                    version = if ($_.DisplayVersion) { [string]$_.DisplayVersion } else { $null }
                    publisher = if ($_.Publisher) { [string]$_.Publisher } else { $null }
                    installLocation = if ($_.InstallLocation) { [string]$_.InstallLocation } else { $null }
                }
            }
    }

    $apps |
        Sort-Object name, version -Unique |
        Sort-Object name
}

function Get-WinLabLocalUsers {
    $adminSids = @()

    try {
        $admins = Get-LocalGroup -SID "S-1-5-32-544"
        $adminSids = @(
            Get-LocalGroupMember -Group $admins -ErrorAction SilentlyContinue |
                Where-Object { $_.SID } |
                ForEach-Object { $_.SID.Value }
        )
    }
    catch {
        $adminSids = @()
    }

    Get-LocalUser | ForEach-Object {
        [PSCustomObject]@{
            name = $_.Name
            enabled = [bool]$_.Enabled
            isAdministrator = $adminSids -contains $_.SID.Value
        }
    }
}

function Get-WinLabKnownApps {
    foreach ($app in $KnownApps) {
        $foundPath = $null

        foreach ($rawPath in $app.Paths) {
            $expanded = [Environment]::ExpandEnvironmentVariables($rawPath)

            if (Test-Path $expanded) {
                $foundPath = $expanded
                break
            }
        }

        [PSCustomObject]@{
            id = $app.Id
            label = $app.Label
            found = $null -ne $foundPath
            path = $foundPath
        }
    }
}

$os = Get-CimInstance Win32_OperatingSystem
$appLockerAvailable = $null -ne (Get-Command Get-AppLockerPolicy -ErrorAction SilentlyContinue)
$appIdService = Get-Service AppIDSvc -ErrorAction SilentlyContinue
$systemDisk = Get-CimInstance Win32_LogicalDisk |
    Where-Object { $_.DeviceID -eq $env:SystemDrive } |
    Select-Object -First 1

$storage = if ($systemDisk -and $systemDisk.Size -gt 0) {
    [ordered]@{
        systemDrive = [string]$systemDisk.DeviceID
        sizeGB = [math]::Round($systemDisk.Size / 1GB, 1)
        freeGB = [math]::Round($systemDisk.FreeSpace / 1GB, 1)
        freePercent = [math]::Round(($systemDisk.FreeSpace / $systemDisk.Size) * 100, 1)
    }
}
else {
    $null
}

$inventory = [ordered]@{
    schemaVersion = 1
    generatedAt = (Get-Date).ToString("o")
    computerName = $env:COMPUTERNAME
    windows = [ordered]@{
        caption = [string]$os.Caption
        version = [string]$os.Version
        buildNumber = [string]$os.BuildNumber
        architecture = [string]$os.OSArchitecture
    }
    appLocker = [ordered]@{
        available = [bool]$appLockerAvailable
        applicationIdentityStatus = if ($appIdService) { [string]$appIdService.Status } else { $null }
    }
    storage = $storage
    localUsers = @(Get-WinLabLocalUsers)
    knownApps = @(Get-WinLabKnownApps)
    installedApps = @(Get-WinLabInstalledApps)
}

$fileName = "winlab-inventory-{0}.json" -f $env:COMPUTERNAME
$outputPath = Join-Path $PSScriptRoot $fileName

$inventory |
    ConvertTo-Json -Depth 6 |
    Set-Content -Path $outputPath -Encoding UTF8

Write-Host ""
Write-Host "Inventário WinLab criado com sucesso." -ForegroundColor Green
Write-Host $outputPath -ForegroundColor Cyan
Write-Host ""
Write-Host "Agora importe esse JSON no WinLab Configurator." -ForegroundColor Yellow
`;
}
