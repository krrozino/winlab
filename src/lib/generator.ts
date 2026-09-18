import { APP_CATALOG } from "./apps";
import { serializeConfig } from "./config-io";
import { Config } from "./types";

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
    ...config.allowedApps.flatMap((app) => APP_CATALOG[app].paths),
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
$AllowLocalAccountManagement = ${psBool(config.allowLocalAccountManagement)}

$BlockChromeExtensions = ${psBool(config.blockChromeExtensions)}
$BlockChromeGuest = ${psBool(config.blockChromeGuest)}
$BlockChromeNewProfiles = ${psBool(config.blockChromeNewProfiles)}
$BlockChromeIncognito = ${psBool(config.blockChromeIncognito)}
$BlockChromePasswordManager = ${psBool(config.blockChromePasswordManager)}

$BrowserUrlMode = "${config.browserUrlMode}"
$BlockedUrls = ${psArray(config.blockedUrls)}
$AllowedUrls = ${psArray(config.allowedUrls)}

$BlockUsbRead = ${psBool(config.blockUsbRead)}
$BlockUsbWrite = ${psBool(config.blockUsbWrite)}
$BlockUsbExecute = ${psBool(config.blockUsbExecute)}

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

function Set-PolicyStringList {
    param(
        [Parameter(Mandatory=$true)][string]$BasePath,
        [Parameter(Mandatory=$true)][string]$Name,
        [string[]]$Values
    )

    $target = Join-Path $BasePath $Name
    Remove-Item -Path $target -Recurse -Force -ErrorAction SilentlyContinue

    if (-not $Values -or $Values.Count -eq 0) { return }

    New-Item -Path $target -Force | Out-Null

    for ($index = 0; $index -lt $Values.Count; $index++) {
        New-ItemProperty -Path $target -Name ([string]($index + 1)) -PropertyType String -Value $Values[$index] -Force | Out-Null
    }
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

        if ($BrowserUrlMode -eq "Unrestricted") {
            Set-PolicyStringList -BasePath $base -Name "URLBlocklist" -Values @()
            Set-PolicyStringList -BasePath $base -Name "URLAllowlist" -Values @()
        }
        elseif ($BrowserUrlMode -eq "BlockList") {
            Set-PolicyStringList -BasePath $base -Name "URLBlocklist" -Values $BlockedUrls
            Set-PolicyStringList -BasePath $base -Name "URLAllowlist" -Values $AllowedUrls
        }
        elseif ($BrowserUrlMode -eq "AllowListOnly") {
            Set-PolicyStringList -BasePath $base -Name "URLBlocklist" -Values @("*")
            Set-PolicyStringList -BasePath $base -Name "URLAllowlist" -Values $AllowedUrls
        }
    }
}

function Set-StudentEdgePolicies {
    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)

        $base = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Edge"
        New-Item -Path $base -Force | Out-Null

        if ($BrowserUrlMode -eq "Unrestricted") {
            Set-PolicyStringList -BasePath $base -Name "URLBlocklist" -Values @()
            Set-PolicyStringList -BasePath $base -Name "URLAllowlist" -Values @()
        }
        elseif ($BrowserUrlMode -eq "BlockList") {
            Set-PolicyStringList -BasePath $base -Name "URLBlocklist" -Values $BlockedUrls
            Set-PolicyStringList -BasePath $base -Name "URLAllowlist" -Values $AllowedUrls
        }
        elseif ($BrowserUrlMode -eq "AllowListOnly") {
            Set-PolicyStringList -BasePath $base -Name "URLBlocklist" -Values @("*")
            Set-PolicyStringList -BasePath $base -Name "URLAllowlist" -Values $AllowedUrls
        }
    }
}

function Set-StudentUsbPolicies {
    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)

        $usb = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices\\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}"
        New-Item -Path $usb -Force | Out-Null

        if ($BlockUsbRead) {
            New-ItemProperty -Path $usb -Name Deny_Read -PropertyType DWord -Value 1 -Force | Out-Null
        }
        else {
            Remove-ItemProperty -Path $usb -Name Deny_Read -ErrorAction SilentlyContinue
        }

        if ($BlockUsbWrite) {
            New-ItemProperty -Path $usb -Name Deny_Write -PropertyType DWord -Value 1 -Force | Out-Null
        }
        else {
            Remove-ItemProperty -Path $usb -Name Deny_Write -ErrorAction SilentlyContinue
        }
    }
}

function Set-StudentAccountPolicies {
    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)

        $explorer = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer"
        New-Item -Path $explorer -Force | Out-Null

        if ($AllowLocalAccountManagement) {
            Remove-ItemProperty -Path $explorer -Name SettingsPageVisibility -ErrorAction SilentlyContinue
        }
        else {
            New-ItemProperty -Path $explorer -Name SettingsPageVisibility -PropertyType String -Value "hide:otherusers" -Force | Out-Null
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

    if ($BlockUsbExecute) {
        $denyRules += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear execução em USB" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%HOT%\\*" /></Conditions>
    </FilePathRule>
"@
        $denyRules += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear execução em mídia removível" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%REMOVABLE%\\*" /></Conditions>
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
    Set-StudentEdgePolicies
    Set-StudentUsbPolicies
    Set-StudentAccountPolicies
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

        $chrome = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Google\\Chrome"
        Remove-ItemProperty -Path $chrome -Name BrowserGuestModeEnabled -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $chrome -Name BrowserAddPersonEnabled -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $chrome -Name IncognitoModeAvailability -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $chrome -Name PasswordManagerEnabled -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $chrome "ExtensionInstallBlocklist") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $chrome "URLBlocklist") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $chrome "URLAllowlist") -Recurse -Force -ErrorAction SilentlyContinue

        $edge = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Edge"
        Remove-Item -Path (Join-Path $edge "URLBlocklist") -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $edge "URLAllowlist") -Recurse -Force -ErrorAction SilentlyContinue

        $usb = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices\\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}"
        Remove-ItemProperty -Path $usb -Name Deny_Read -ErrorAction SilentlyContinue
        Remove-ItemProperty -Path $usb -Name Deny_Write -ErrorAction SilentlyContinue

        Remove-ItemProperty "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization" -Name NoChangingMousePointers -ErrorAction SilentlyContinue
        Remove-ItemProperty "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization" -Name NoChangingSoundScheme -ErrorAction SilentlyContinue
        Remove-ItemProperty "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop" -Name NoChangingWallPaper -ErrorAction SilentlyContinue
        Remove-ItemProperty "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" -Name SettingsPageVisibility -ErrorAction SilentlyContinue
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


export function generateVerifyScript(config: Config): string {
  const knownApps = config.allowedApps.map((id) => ({
    label: APP_CATALOG[id].label,
    paths: APP_CATALOG[id].paths
  }));
  const appBlocks = knownApps
    .map(
      (app) => `    @{
        Name = ${psString(app.label)}
        Paths = ${psArray([...app.paths])}
    }`
    )
    .join(",\n");

  return `${commonHeader(config, "VERIFICAÇÃO DO PC")}

Assert-Administrator

$KnownApps = @(
${appBlocks}
)
$CustomAllowedPaths = ${psArray(config.customAllowedPaths)}

function Write-Check {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Details
    )

    $status = if ($Ok) { "OK" } else { "ATENÇÃO" }
    $color = if ($Ok) { "Green" } else { "Yellow" }
    Write-Host ("[{0}] {1} - {2}" -f $status, $Name, $Details) -ForegroundColor $color
}

Write-Host "=== WinLab - Verificação da máquina ===" -ForegroundColor Cyan
Write-Host "Perfil: ${config.profileName}"
Write-Host ""

$os = Get-CimInstance Win32_OperatingSystem
Write-Host ("Computador: {0}" -f $env:COMPUTERNAME)
Write-Host ("Windows: {0}" -f $os.Caption)
Write-Host ("Versão: {0}" -f $os.Version)
Write-Host ("Build: {0}" -f $os.BuildNumber)
Write-Host ("Arquitetura: {0}" -f $os.OSArchitecture)
Write-Host ""

$hasAppLocker = $null -ne (Get-Command Get-AppLockerPolicy -ErrorAction SilentlyContinue)
Write-Check "AppLocker" $hasAppLocker $(if ($hasAppLocker) { "cmdlets disponíveis" } else { "cmdlets não encontrados" })

$service = Get-Service AppIDSvc -ErrorAction SilentlyContinue
Write-Check "Application Identity" ($null -ne $service) $(if ($service) { "serviço encontrado: $($service.Status)" } else { "serviço não encontrado" })

$student = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
$admin = Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue
Write-Check "Conta restrita" ($null -ne $student -or ${psBool(config.createAccounts)}) $(if ($student) { "existe: $Aluno" } else { "será criada pelo setup: $Aluno" })
Write-Check "Conta administrativa" ($null -ne $admin -or ${psBool(config.createAccounts)}) $(if ($admin) { "existe: $Admin" } else { "será criada pelo setup: $Admin" })

Write-Host ""
Write-Host "=== Aplicativos conhecidos ===" -ForegroundColor Cyan

foreach ($app in $KnownApps) {
    $found = $null

    foreach ($rawPath in $app.Paths) {
        $expanded = [Environment]::ExpandEnvironmentVariables($rawPath)
        if (Test-Path $expanded) {
            $found = $expanded
            break
        }
    }

    Write-Check $app.Name ($null -ne $found) $(if ($found) { "encontrado: $found" } else { "nenhum caminho conhecido encontrado" })
}

if ($CustomAllowedPaths.Count -gt 0) {
    Write-Host ""
    Write-Host "=== Caminhos personalizados ===" -ForegroundColor Cyan

    foreach ($rawPath in $CustomAllowedPaths) {
        $expanded = [Environment]::ExpandEnvironmentVariables($rawPath)
        Write-Check $rawPath (Test-Path $expanded) $(if (Test-Path $expanded) { "encontrado" } else { "não encontrado" })
    }
}

Write-Host ""
Write-Host "Use este relatório antes de ativar o AppLocker em modo Enabled." -ForegroundColor Yellow
`;
}

export function generateMaintenanceScript(config: Config): string {
  return `${commonHeader(config, "MANUTENÇÃO E LIMPEZA DE PERFIS")}

Assert-Administrator

$Mode = "${config.profileCleanupMode}"
$Days = ${config.profileCleanupDays}
$StorageWarningFreePercent = ${config.storageWarningFreePercent}

function Get-WinLabLastUseTime {
    param($Value)

    if ($null -eq $Value) { return $null }
    if ($Value -is [datetime]) { return $Value }

    try {
        return [Management.ManagementDateTimeConverter]::ToDateTime([string]$Value)
    }
    catch {
        return $null
    }
}

$disk = Get-CimInstance Win32_LogicalDisk |
    Where-Object { $_.DeviceID -eq $env:SystemDrive } |
    Select-Object -First 1

$freePercent = if ($disk -and $disk.Size -gt 0) {
    [math]::Round(($disk.FreeSpace / $disk.Size) * 100, 1)
}
else {
    $null
}

Write-Host "=== WinLab - Manutenção ===" -ForegroundColor Cyan
Write-Host ("Modo: {0}" -f $Mode)
Write-Host ("Perfis inativos: {0} dias" -f $Days)

if ($disk) {
    $freeGb = [math]::Round($disk.FreeSpace / 1GB, 1)
    $totalGb = [math]::Round($disk.Size / 1GB, 1)
    Write-Host ("Disco {0}: {1} GB livres de {2} GB ({3}%)" -f $disk.DeviceID, $freeGb, $totalGb, $freePercent)

    if ($freePercent -lt $StorageWarningFreePercent) {
        Write-Warning ("Espaço livre abaixo do limite configurado de {0}%." -f $StorageWarningFreePercent)
    }
}

$protectedSids = @()

foreach ($name in @($Aluno, $Admin)) {
    $user = Get-LocalUser -Name $name -ErrorAction SilentlyContinue
    if ($user) {
        $protectedSids += $user.SID.Value
    }
}

$cutoff = (Get-Date).AddDays(-$Days)
$candidates = @()

foreach ($profile in Get-CimInstance Win32_UserProfile) {
    if ($profile.Special -or $profile.Loaded) { continue }
    if (-not $profile.LocalPath -or -not $profile.SID) { continue }
    if ($protectedSids -contains $profile.SID) { continue }
    if ($profile.LocalPath -match "\\(Default|Public|defaultuser0)$") { continue }

    $lastUse = Get-WinLabLastUseTime $profile.LastUseTime
    if ($null -eq $lastUse -or $lastUse -ge $cutoff) { continue }

    $candidates += [PSCustomObject]@{
        SID = [string]$profile.SID
        LocalPath = [string]$profile.LocalPath
        LastUseTime = $lastUse
    }
}

Write-Host ""
Write-Host ("Perfis candidatos: {0}" -f $candidates.Count) -ForegroundColor Yellow

foreach ($profile in $candidates) {
    Write-Host ("- {0} | último uso: {1}" -f $profile.LocalPath, $profile.LastUseTime)
}

$deleted = 0

if ($Mode -eq "Delete" -and $candidates.Count -gt 0) {
    Write-Warning "Modo Delete ativo: perfis candidatos serão removidos. Valide em PC piloto e mantenha backup dos dados necessários."

    foreach ($candidate in $candidates) {
        $profile = Get-CimInstance Win32_UserProfile |
            Where-Object { $_.SID -eq $candidate.SID } |
            Select-Object -First 1

        if ($profile -and -not $profile.Loaded -and -not $profile.Special) {
            Remove-CimInstance -InputObject $profile
            $deleted++
            Write-Host ("Removido: {0}" -f $candidate.LocalPath) -ForegroundColor Green
        }
    }
}
elseif ($Mode -eq "ReportOnly") {
    Write-Host "Modo relatório: nenhum perfil foi removido." -ForegroundColor Cyan
}
else {
    Write-Host "Limpeza de perfis desativada." -ForegroundColor DarkGray
}

$folder = "C:\\ProgramData\\WinLab"
New-Item -Path $folder -ItemType Directory -Force | Out-Null

$report = [ordered]@{
    generatedAt = (Get-Date).ToString("o")
    computerName = $env:COMPUTERNAME
    mode = $Mode
    inactiveDays = $Days
    storageWarningFreePercent = $StorageWarningFreePercent
    freePercent = $freePercent
    candidates = @($candidates)
    deleted = $deleted
}

$reportPath = Join-Path $folder "maintenance-latest.json"
$report | ConvertTo-Json -Depth 5 | Set-Content -Path $reportPath -Encoding UTF8

Write-Host ""
Write-Host ("Relatório salvo em {0}" -f $reportPath) -ForegroundColor Cyan
`;
}


export function generateConfigJson(config: Config): string {
  return serializeConfig(config);
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
  Aplica contas, políticas por usuário, Chrome/Edge, USB, personalização e AppLocker.

rollback.ps1
  Remove as políticas WinLab e preserva as contas.

audit.ps1
  Mostra eventos recentes do AppLocker para validar o que seria bloqueado.

liberar-wallpaper.ps1
  Libera somente a troca de wallpaper por ${config.wallpaperUnlockMinutes} minutos.
  O bloqueio volta automaticamente.

verify.ps1
  Verifica Windows, AppLocker, contas e caminhos conhecidos dos aplicativos antes do setup.

scan-pc.ps1
  Gera um inventário JSON local com informações do Windows, contas locais,
  AppLocker, armazenamento e programas instalados para importar no WinLab.
  Não coleta senhas, documentos ou histórico do navegador.

maintenance.ps1
  Mostra espaço livre e perfis inativos. No modo Delete pode remover perfis
  não carregados e antigos, preservando as contas Aluno/Admin configuradas.

config.json
  Configuração versionada usada para gerar este pacote.
  Pode ser importada novamente no WinLab.

FLUXO RECOMENDADO
-----------------
1. Execute verify.ps1 como administrador e confira a máquina.
2. Gere inicialmente em modo AUDITORIA.
3. Execute setup.ps1 como administrador.
4. Reinicie.
5. Use normalmente a conta ${config.studentUser}.
6. Execute audit.ps1 e confira os eventos.
7. Ajuste a allowlist no WinLab.
8. Gere novamente em modo BLOQUEIO ATIVO.
9. Execute o novo setup.ps1.

CONTAS LOCAIS
-------------
${config.allowLocalAccountManagement ? "A página Contas > Outros usuários fica disponível para a conta restrita. Criar ou remover contas continua exigindo credencial administrativa." : "A página Contas > Outros usuários fica oculta para a conta restrita."}

WEB
---
Modo: ${config.browserUrlMode}
Bloqueados: ${config.blockedUrls.join(", ") || "nenhum"}
Permitidos/exceções: ${config.allowedUrls.join(", ") || "nenhum"}

USB
---
Leitura: ${config.blockUsbRead ? "bloqueada" : "permitida"}
Gravação: ${config.blockUsbWrite ? "bloqueada" : "permitida"}
Execução: ${config.blockUsbExecute ? "bloqueada via AppLocker" : "permitida pela regra WinLab"}

MANUTENÇÃO
----------
Modo: ${config.profileCleanupMode}
Perfis inativos após: ${config.profileCleanupDays} dias
Alerta de armazenamento: abaixo de ${config.storageWarningFreePercent}% livre

Nenhuma senha é armazenada nos arquivos.
`;
}
