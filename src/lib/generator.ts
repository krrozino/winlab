import { AllowedAppId, Config } from "./types";

const APP_PATHS: Record<AllowedAppId, string[]> = {
  chrome: [
    "%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe",
    "%PROGRAMFILES(X86)%\\Google\\Chrome\\Application\\chrome.exe"
  ],
  word: [
    "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
    "%PROGRAMFILES(X86)%\\Microsoft Office\\root\\Office16\\WINWORD.EXE"
  ],
  excel: [
    "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\EXCEL.EXE",
    "%PROGRAMFILES(X86)%\\Microsoft Office\\root\\Office16\\EXCEL.EXE"
  ],
  powerpoint: [
    "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\POWERPNT.EXE",
    "%PROGRAMFILES(X86)%\\Microsoft Office\\root\\Office16\\POWERPNT.EXE"
  ],
  powerbi: [
    "%PROGRAMFILES%\\Microsoft Power BI Desktop\\bin\\PBIDesktop.exe",
    "%PROGRAMFILES(X86)%\\Microsoft Power BI Desktop\\bin\\PBIDesktop.exe"
  ]
};

function psBool(value: boolean) {
  return value ? "$true" : "$false";
}

function psString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function psArray(values: string[]) {
  if (!values.length) return "@()";
  return `@(
${values.map((value) => `    ${psString(value)}`).join(",\n")}
)`;
}

function getAllowedPaths(config: Config) {
  return [
    ...config.allowedApps.flatMap((app) => APP_PATHS[app]),
    ...config.customAllowedPaths.map((path) => path.trim()).filter(Boolean)
  ];
}

function commonHeader(config: Config, title: string) {
  return `#requires -version 5.1
<#
${title}
Gerado por WinLab Configurator
Perfil: ${config.profileName}

Teste primeiro em uma máquina piloto.
Nenhuma senha é armazenada neste arquivo.
#>

$ErrorActionPreference = "Stop"
$Aluno = ${psString(config.studentUser)}
$Admin = ${psString(config.adminUser)}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)

    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute este arquivo como administrador."
    }
}

function Get-AdminsGroup { Get-LocalGroup -SID "S-1-5-32-544" }
function Get-UsersGroup { Get-LocalGroup -SID "S-1-5-32-545" }

function Invoke-WithUserHive {
    param(
        [Parameter(Mandatory=$true)][string]$UserName,
        [Parameter(Mandatory=$true)][scriptblock]$Action
    )

    $user = Get-LocalUser -Name $UserName -ErrorAction Stop
    $sid = $user.SID.Value
    $hive = "Registry::HKEY_USERS\\$sid"
    $mountedByUs = $false

    if (-not (Test-Path $hive)) {
        $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue

        if (-not $profile.LocalPath) {
            Write-Warning "O perfil de '$UserName' ainda não existe. Entre uma vez na conta e execute novamente."
            return
        }

        $ntUser = Join-Path $profile.LocalPath "NTUSER.DAT"

        if (-not (Test-Path $ntUser)) {
            Write-Warning "NTUSER.DAT de '$UserName' não encontrado."
            return
        }

        reg.exe load "HKU\\$sid" "$ntUser" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Não foi possível carregar o registro da conta '$UserName'."
        }

        $mountedByUs = $true
    }

    try {
        & $Action $sid
    }
    finally {
        if ($mountedByUs) {
            [gc]::Collect()
            [gc]::WaitForPendingFinalizers()
            reg.exe unload "HKU\\$sid" | Out-Null
        }
    }
}
`;
}

export function generateSetupScript(config: Config): string {
  const allowedPaths = getAllowedPaths(config);
  const enforcement = config.enforcementMode;

  return `${commonHeader(config, "SETUP")}
$CreateAccounts = ${psBool(config.createAccounts)}
$BlockInstallers = ${psBool(config.blockInstallers)}
$BlockStoreApps = ${psBool(config.blockStoreApps)}
$BlockCmd = ${psBool(config.blockCmd)}
$BlockPowerShell = ${psBool(config.blockPowerShell)}
$BlockRegedit = ${psBool(config.blockRegedit)}

$BlockChromeExtensions = ${psBool(config.blockChromeExtensions)}
$BlockChromeGuest = ${psBool(config.blockChromeGuest)}
$BlockChromeNewProfiles = ${psBool(config.blockChromeNewProfiles)}
$BlockChromeIncognito = ${psBool(config.blockChromeIncognito)}
$BlockChromePasswordManager = ${psBool(config.blockChromePasswordManager)}

$BlockWallpaper = ${psBool(config.blockWallpaper)}
$BlockMousePointers = ${psBool(config.blockMousePointers)}
$BlockSoundScheme = ${psBool(config.blockSoundScheme)}

$AllowedExecutables = ${psArray(allowedPaths)}
$EnforcementMode = "${enforcement}"

function Ensure-Accounts {
    if (-not $CreateAccounts) { return }

    if (-not (Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue)) {
        $password = Read-Host "Defina a senha da conta administrativa '$Admin'" -AsSecureString
        New-LocalUser -Name $Admin -Password $password -Description "WinLab - Administrador" | Out-Null
    }

    Add-LocalGroupMember -Group (Get-AdminsGroup) -Member $Admin -ErrorAction SilentlyContinue

    if (-not (Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue)) {
        $password = Read-Host "Defina a senha da conta '$Aluno'" -AsSecureString
        New-LocalUser -Name $Aluno -Password $password -Description "WinLab - Usuário restrito" | Out-Null
    }

    Remove-LocalGroupMember -Group (Get-AdminsGroup) -Member $Aluno -ErrorAction SilentlyContinue
    Add-LocalGroupMember -Group (Get-UsersGroup) -Member $Aluno -ErrorAction SilentlyContinue
}

function Set-StudentChromePolicies {
    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)
        $base = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Google\\Chrome"
        New-Item -Path $base -Force | Out-Null

        if ($BlockChromeGuest) {
            New-ItemProperty -Path $base -Name BrowserGuestModeEnabled -PropertyType DWord -Value 0 -Force | Out-Null
        }

        if ($BlockChromeNewProfiles) {
            New-ItemProperty -Path $base -Name BrowserAddPersonEnabled -PropertyType DWord -Value 0 -Force | Out-Null
        }

        if ($BlockChromeIncognito) {
            New-ItemProperty -Path $base -Name IncognitoModeAvailability -PropertyType DWord -Value 1 -Force | Out-Null
        }

        if ($BlockChromePasswordManager) {
            New-ItemProperty -Path $base -Name PasswordManagerEnabled -PropertyType DWord -Value 0 -Force | Out-Null
        }

        if ($BlockChromeExtensions) {
            $extensions = Join-Path $base "ExtensionInstallBlocklist"
            New-Item -Path $extensions -Force | Out-Null
            New-ItemProperty -Path $extensions -Name "1" -PropertyType String -Value "*" -Force | Out-Null
        }
    }
}

function Set-StudentPersonalizationPolicies {
    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)

        $personalization = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization"
        $desktop = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop"

        New-Item -Path $personalization -Force | Out-Null
        New-Item -Path $desktop -Force | Out-Null

        if ($BlockMousePointers) {
            New-ItemProperty -Path $personalization -Name NoChangingMousePointers -PropertyType DWord -Value 1 -Force | Out-Null
        }

        if ($BlockSoundScheme) {
            New-ItemProperty -Path $personalization -Name NoChangingSoundScheme -PropertyType DWord -Value 1 -Force | Out-Null
        }

        if ($BlockWallpaper) {
            New-ItemProperty -Path $desktop -Name NoChangingWallPaper -PropertyType DWord -Value 1 -Force | Out-Null
        }
    }
}

function Backup-AppLocker {
    $backupDir = "C:\\ProgramData\\WinLab\\Backups"
    New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = Join-Path $backupDir "AppLocker-$stamp.xml"
    Get-AppLockerPolicy -Local -Xml | Set-Content -Path $backup -Encoding UTF8
    Write-Host "Backup AppLocker: $backup" -ForegroundColor DarkGray
}

function New-WinLabAppLockerXml {
    $studentSid = (Get-LocalUser -Name $Aluno -ErrorAction Stop).SID.Value
    $adminsSid = "S-1-5-32-544"

    $allowRules = ""

    foreach ($path in $AllowedExecutables) {
        $id = [guid]::NewGuid().ToString("B").ToUpper()
        $safeName = [Security.SecurityElement]::Escape("Permitido: $path")
        $safePath = [Security.SecurityElement]::Escape($path)

        $allowRules += @"
    <FilePathRule Id="$id" Name="$safeName" Description="" UserOrGroupSid="$studentSid" Action="Allow">
      <Conditions><FilePathCondition Path="$safePath" /></Conditions>
    </FilePathRule>
"@
    }

    $denyRules = ""

    if ($BlockCmd) {
        $denyRules += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear CMD" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%WINDIR%\\System32\\cmd.exe" /></Conditions>
    </FilePathRule>
"@
    }

    if ($BlockPowerShell) {
        $denyRules += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear Windows PowerShell" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%WINDIR%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" /></Conditions>
    </FilePathRule>
"@
        $denyRules += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear Windows PowerShell 32-bit" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%WINDIR%\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe" /></Conditions>
    </FilePathRule>
"@
    }

    if ($BlockRegedit) {
        $denyRules += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear Regedit" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%WINDIR%\\regedit.exe" /></Conditions>
    </FilePathRule>
"@
    }

    $msiMode = if ($BlockInstallers) { $EnforcementMode } else { "NotConfigured" }
    $appxMode = if ($BlockStoreApps) { $EnforcementMode } else { "NotConfigured" }

@"
<AppLockerPolicy Version="1">
  <RuleCollection Type="Exe" EnforcementMode="$EnforcementMode">
    <FilePathRule Id="{A1111111-1111-1111-1111-111111111111}" Name="Administradores - todos executáveis" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
      <Conditions><FilePathCondition Path="*" /></Conditions>
    </FilePathRule>

    <FilePathRule Id="{A1111111-1111-1111-1111-111111111112}" Name="Aluno - componentes do Windows" Description="" UserOrGroupSid="$studentSid" Action="Allow">
      <Conditions><FilePathCondition Path="%WINDIR%\\*" /></Conditions>
    </FilePathRule>

$allowRules
$denyRules
  </RuleCollection>

  <RuleCollection Type="Msi" EnforcementMode="$msiMode">
    <FilePathRule Id="{B2222222-2222-2222-2222-222222222221}" Name="Administradores - todos MSI" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
      <Conditions><FilePathCondition Path="*" /></Conditions>
    </FilePathRule>
  </RuleCollection>

  <RuleCollection Type="Script" EnforcementMode="$EnforcementMode">
    <FilePathRule Id="{C3333333-3333-3333-3333-333333333331}" Name="Administradores - todos scripts" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
      <Conditions><FilePathCondition Path="*" /></Conditions>
    </FilePathRule>
  </RuleCollection>

  <RuleCollection Type="Appx" EnforcementMode="$appxMode">
    <FilePublisherRule Id="{D4444444-4444-4444-4444-444444444441}" Name="Administradores - todos apps empacotados" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
      <Conditions>
        <FilePublisherCondition PublisherName="*" ProductName="*" BinaryName="*">
          <BinaryVersionRange LowSection="0.0.0.0" HighSection="*" />
        </FilePublisherCondition>
      </Conditions>
    </FilePublisherRule>
  </RuleCollection>

  <RuleCollection Type="Dll" EnforcementMode="NotConfigured" />
</AppLockerPolicy>
"@
}

function Install-WinLabProfile {
    Ensure-Accounts
    Set-StudentChromePolicies
    Set-StudentPersonalizationPolicies

    Backup-AppLocker

    sc.exe config appidsvc start=auto | Out-Null
    Start-Service AppIDSvc -ErrorAction SilentlyContinue

    $xml = New-WinLabAppLockerXml
    $temp = Join-Path $env:TEMP "WinLab-AppLocker.xml"
    $xml | Set-Content -Path $temp -Encoding UTF8

    Set-AppLockerPolicy -XmlPolicy $temp
    gpupdate /force | Out-Null

    Write-Host ""
    Write-Host "WinLab aplicado ao perfil '$Aluno'." -ForegroundColor Green
    Write-Host "Conta administrativa '$Admin' permanece fora das políticas por usuário." -ForegroundColor Green
    Write-Host "AppLocker: $EnforcementMode" -ForegroundColor Cyan

    if ($EnforcementMode -eq "AuditOnly") {
        Write-Host "Os bloqueios AppLocker estão em AUDITORIA. Valide os logs antes de gerar uma configuração em modo Enabled." -ForegroundColor Yellow
    }

    Write-Host "Reinicie o computador." -ForegroundColor Yellow
}

Assert-Administrator
Install-WinLabProfile
`;
}

export function generateRollbackScript(config: Config): string {
  return `${commonHeader(config, "ROLLBACK")}
function Remove-StudentPolicies {
    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)

        Remove-Item "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Google\\Chrome" -Recurse -Force -ErrorAction SilentlyContinue
        Remove-ItemProperty "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization" -Name NoChangingMousePointers -ErrorAction SilentlyContinue
        Remove-ItemProperty "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization" -Name NoChangingSoundScheme -ErrorAction SilentlyContinue
        Remove-ItemProperty "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop" -Name NoChangingWallPaper -ErrorAction SilentlyContinue
    }
}

function Remove-AppLockerPolicy {
    $empty = @"
<AppLockerPolicy Version="1">
  <RuleCollection Type="Exe" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Msi" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Script" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Appx" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Dll" EnforcementMode="NotConfigured" />
</AppLockerPolicy>
"@

    $temp = Join-Path $env:TEMP "WinLab-AppLocker-Empty.xml"
    $empty | Set-Content -Path $temp -Encoding UTF8
    Set-AppLockerPolicy -XmlPolicy $temp
}

Assert-Administrator
Remove-StudentPolicies
Remove-AppLockerPolicy
gpupdate /force | Out-Null

Write-Host "Políticas WinLab removidas. As contas locais foram preservadas." -ForegroundColor Green
Write-Host "Reinicie o computador." -ForegroundColor Yellow
`;
}

export function generateUnlockWallpaperScript(config: Config): string {
  const minutes = Math.max(5, Math.min(480, Math.round(config.wallpaperUnlockMinutes || 90)));

  return `${commonHeader(config, "LIBERAÇÃO TEMPORÁRIA DE WALLPAPER")}
$Minutos = ${minutes}

function Set-WallpaperLock {
    param([int]$Value)

    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)

        $desktop = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop"
        New-Item -Path $desktop -Force | Out-Null
        New-ItemProperty -Path $desktop -Name NoChangingWallPaper -PropertyType DWord -Value $Value -Force | Out-Null
    }
}

Assert-Administrator
Set-WallpaperLock -Value 0

$folder = "C:\\ProgramData\\WinLab"
New-Item -Path $folder -ItemType Directory -Force | Out-Null

$relock = @'
$ErrorActionPreference = "Stop"
$Aluno = ${psString(config.studentUser)}
$user = Get-LocalUser -Name $Aluno -ErrorAction Stop
$sid = $user.SID.Value
$profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
$hive = "Registry::HKEY_USERS\\$sid"
$mounted = $false

if (-not (Test-Path $hive)) {
    if (-not $profile.LocalPath) { exit 1 }
    $ntUser = Join-Path $profile.LocalPath "NTUSER.DAT"
    reg.exe load "HKU\\$sid" "$ntUser" | Out-Null
    if ($LASTEXITCODE -ne 0) { exit 1 }
    $mounted = $true
}

try {
    $desktop = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop"
    New-Item -Path $desktop -Force | Out-Null
    New-ItemProperty -Path $desktop -Name NoChangingWallPaper -PropertyType DWord -Value 1 -Force | Out-Null
}
finally {
    if ($mounted) {
        [gc]::Collect()
        [gc]::WaitForPendingFinalizers()
        reg.exe unload "HKU\\$sid" | Out-Null
    }
}
'@

$relockPath = Join-Path $folder "Rebloquear-Wallpaper.ps1"
$relock | Set-Content -Path $relockPath -Encoding UTF8

$taskName = "WinLab-Rebloquear-Wallpaper"
$when = (Get-Date).AddMinutes($Minutos)
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File \`"$relockPath\`""
$trigger = New-ScheduledTaskTrigger -Once -At $when
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

Write-Host "Wallpaper liberado por $Minutos minutos." -ForegroundColor Green
Write-Host "Rebloqueio automático: $($when.ToString('HH:mm'))." -ForegroundColor Cyan
Write-Host "Ponteiro e esquema de sons continuam bloqueados." -ForegroundColor Yellow
`;
}

export function generateAuditScript(config: Config): string {
  return `${commonHeader(config, "RELATÓRIO DE AUDITORIA")}
Assert-Administrator

Write-Host "=== WinLab - Auditoria AppLocker ===" -ForegroundColor Cyan
Write-Host "Perfil: ${config.profileName}"
Write-Host "Usuário restrito: $Aluno"
Write-Host ""

$logs = @(
    "Microsoft-Windows-AppLocker/EXE and DLL",
    "Microsoft-Windows-AppLocker/MSI and Script",
    "Microsoft-Windows-AppLocker/Packaged app-Execution",
    "Microsoft-Windows-AppLocker/Packaged app-Deployment"
)

foreach ($log in $logs) {
    Write-Host ""
    Write-Host "### $log" -ForegroundColor Yellow

    Get-WinEvent -FilterHashtable @{
        LogName = $log
        StartTime = (Get-Date).AddDays(-7)
    } -ErrorAction SilentlyContinue |
        Where-Object { $_.Id -in 8003, 8004, 8006, 8007, 8021, 8022, 8025 } |
        Select-Object -First 100 TimeCreated, Id, Message |
        Format-List
}
`;
}

export function generateConfigJson(config: Config): string {
  return JSON.stringify(config, null, 2);
}

export function generateReadme(config: Config): string {
  return `WINLAB CONFIGURATOR
===================

Perfil: ${config.profileName}
Usuário restrito: ${config.studentUser}
Administrador: ${config.adminUser}
AppLocker: ${config.enforcementMode === "AuditOnly" ? "AUDITORIA" : "BLOQUEIO ATIVO"}

ARQUIVOS
--------
setup.ps1
  Aplica contas, políticas por usuário, Chrome, personalização e AppLocker.

rollback.ps1
  Remove as políticas WinLab e preserva as contas.

audit.ps1
  Mostra eventos recentes do AppLocker para validar o que seria bloqueado.

liberar-wallpaper.ps1
  Libera somente a troca de wallpaper por ${config.wallpaperUnlockMinutes} minutos.
  O bloqueio volta automaticamente.

config.json
  Configuração usada para gerar este pacote.

FLUXO RECOMENDADO
-----------------
1. Gere inicialmente em modo AUDITORIA.
2. Execute setup.ps1 como administrador.
3. Reinicie.
4. Use normalmente a conta ${config.studentUser}.
5. Execute audit.ps1 e confira os eventos.
6. Ajuste a allowlist no WinLab.
7. Gere novamente em modo BLOQUEIO ATIVO.
8. Execute o novo setup.ps1.

Nenhuma senha é armazenada nos arquivos.
`;
}
