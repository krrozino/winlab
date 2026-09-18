import { Config, AllowedAppId } from "./types";

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

function psArray(values: string[]) {
  if (!values.length) return "@()";
  return "@(\n" + values.map((v) => `    '${v.replaceAll("'", "''")}'`).join(",\n") + "\n)";
}

export function generateSetupScript(config: Config): string {
  const allowedPaths = [
    ...config.allowedApps.flatMap((app) => APP_PATHS[app]),
    ...config.customAllowedPaths.filter(Boolean)
  ];

  return `#requires -version 5.1
<#
Gerado por WinLab Configurator
Perfil: ${config.profileName}
IMPORTANTE: teste primeiro em uma máquina piloto.
#>

param(
    [ValidateSet("Instalar","Reverter")]
    [string]$Modo = "Instalar"
)

$ErrorActionPreference = "Stop"

$Aluno = '${config.studentUser.replaceAll("'", "''")}'
$Admin = '${config.adminUser.replaceAll("'", "''")}'

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

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute este arquivo como administrador."
    }
}

function Get-AdminsGroup { Get-LocalGroup -SID "S-1-5-32-544" }
function Get-UsersGroup  { Get-LocalGroup -SID "S-1-5-32-545" }

function Ensure-Accounts {
    if (-not $CreateAccounts) { return }

    if (-not (Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue)) {
        $pwd = Read-Host "Defina a senha de $Admin" -AsSecureString
        New-LocalUser -Name $Admin -Password $pwd | Out-Null
    }

    Add-LocalGroupMember -Group (Get-AdminsGroup) -Member $Admin -ErrorAction SilentlyContinue

    if (-not (Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue)) {
        $pwd = Read-Host "Defina a senha de $Aluno" -AsSecureString
        New-LocalUser -Name $Aluno -Password $pwd | Out-Null
    }

    Remove-LocalGroupMember -Group (Get-AdminsGroup) -Member $Aluno -ErrorAction SilentlyContinue
    Add-LocalGroupMember -Group (Get-UsersGroup) -Member $Aluno -ErrorAction SilentlyContinue
}

function Set-ChromePolicies {
    $base = "HKLM:\\SOFTWARE\\Policies\\Google\\Chrome"
    New-Item $base -Force | Out-Null

    if ($BlockChromeGuest) {
        New-ItemProperty $base -Name BrowserGuestModeEnabled -PropertyType DWord -Value 0 -Force | Out-Null
    }

    if ($BlockChromeNewProfiles) {
        New-ItemProperty $base -Name BrowserAddPersonEnabled -PropertyType DWord -Value 0 -Force | Out-Null
    }

    if ($BlockChromeIncognito) {
        New-ItemProperty $base -Name IncognitoModeAvailability -PropertyType DWord -Value 1 -Force | Out-Null
    }

    if ($BlockChromePasswordManager) {
        New-ItemProperty $base -Name PasswordManagerEnabled -PropertyType DWord -Value 0 -Force | Out-Null
    }

    if ($BlockChromeExtensions) {
        $ext = Join-Path $base "ExtensionInstallBlocklist"
        New-Item $ext -Force | Out-Null
        New-ItemProperty $ext -Name "1" -PropertyType String -Value "*" -Force | Out-Null
    }
}

function Set-PersonalizationPolicies {
    $user = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
    if (-not $user) { return }

    $sid = $user.SID.Value
    $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
    $hku = "Registry::HKEY_USERS\\$sid"
    $loaded = $false

    if (-not (Test-Path $hku)) {
        if (-not $profile.LocalPath) { return }
        $ntuser = Join-Path $profile.LocalPath "NTUSER.DAT"
        if (-not (Test-Path $ntuser)) { return }
        reg.exe load "HKU\\$sid" "$ntuser" | Out-Null
        if ($LASTEXITCODE -ne 0) { return }
        $loaded = $true
    }

    try {
        $personalization = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization"
        $desktop = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop"

        New-Item $personalization -Force | Out-Null
        New-Item $desktop -Force | Out-Null

        if ($BlockMousePointers) {
            New-ItemProperty $personalization -Name NoChangingMousePointers -PropertyType DWord -Value 1 -Force | Out-Null
        }
        if ($BlockSoundScheme) {
            New-ItemProperty $personalization -Name NoChangingSoundScheme -PropertyType DWord -Value 1 -Force | Out-Null
        }
        if ($BlockWallpaper) {
            New-ItemProperty $desktop -Name NoChangingWallPaper -PropertyType DWord -Value 1 -Force | Out-Null
        }
    }
    finally {
        if ($loaded) {
            [gc]::Collect()
            [gc]::WaitForPendingFinalizers()
            reg.exe unload "HKU\\$sid" | Out-Null
        }
    }
}

function New-AppLockerXml {
    $student = Get-LocalUser -Name $Aluno -ErrorAction Stop
    $studentSid = $student.SID.Value
    $adminsSid = "S-1-5-32-544"

    $allowRules = ""
    foreach ($path in $AllowedExecutables) {
        $id = [guid]::NewGuid().ToString("B").ToUpper()
        $name = [Security.SecurityElement]::Escape("Permitido: $path")
        $safePath = [Security.SecurityElement]::Escape($path)
        $allowRules += @"
    <FilePathRule Id="$id" Name="$name" Description="" UserOrGroupSid="$studentSid" Action="Allow">
      <Conditions><FilePathCondition Path="$safePath" /></Conditions>
    </FilePathRule>
"@
    }

    $denyAdminTools = ""
    if ($BlockCmd) {
        $denyAdminTools += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear CMD" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%WINDIR%\\System32\\cmd.exe" /></Conditions>
    </FilePathRule>
"@
    }
    if ($BlockPowerShell) {
        $denyAdminTools += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear PowerShell" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%WINDIR%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" /></Conditions>
    </FilePathRule>
"@
    }
    if ($BlockRegedit) {
        $denyAdminTools += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear Regedit" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%WINDIR%\\regedit.exe" /></Conditions>
    </FilePathRule>
"@
    }

    $msiMode = if ($BlockInstallers) { "Enabled" } else { "NotConfigured" }
    $appxMode = if ($BlockStoreApps) { "Enabled" } else { "NotConfigured" }

@"
<AppLockerPolicy Version="1">
  <RuleCollection Type="Exe" EnforcementMode="Enabled">
    <FilePathRule Id="{A1111111-1111-1111-1111-111111111111}" Name="Administradores - tudo" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
      <Conditions><FilePathCondition Path="*" /></Conditions>
    </FilePathRule>

    <FilePathRule Id="{A1111111-1111-1111-1111-111111111112}" Name="Windows necessário" Description="" UserOrGroupSid="$studentSid" Action="Allow">
      <Conditions><FilePathCondition Path="%WINDIR%\\*" /></Conditions>
    </FilePathRule>

$allowRules
$denyAdminTools
  </RuleCollection>

  <RuleCollection Type="Msi" EnforcementMode="$msiMode">
    <FilePathRule Id="{B2222222-2222-2222-2222-222222222221}" Name="Administradores - MSI" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
      <Conditions><FilePathCondition Path="*" /></Conditions>
    </FilePathRule>
  </RuleCollection>

  <RuleCollection Type="Script" EnforcementMode="Enabled">
    <FilePathRule Id="{C3333333-3333-3333-3333-333333333331}" Name="Administradores - scripts" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
      <Conditions><FilePathCondition Path="*" /></Conditions>
    </FilePathRule>
  </RuleCollection>

  <RuleCollection Type="Appx" EnforcementMode="$appxMode">
    <FilePublisherRule Id="{D4444444-4444-4444-4444-444444444441}" Name="Administradores - Appx" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
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

function Install-Profile {
    Ensure-Accounts
    Set-ChromePolicies
    Set-PersonalizationPolicies

    sc.exe config appidsvc start=auto | Out-Null
    Start-Service AppIDSvc -ErrorAction SilentlyContinue

    $xml = New-AppLockerXml
    $path = Join-Path $env:TEMP "WinLab-AppLocker.xml"
    $xml | Set-Content $path -Encoding UTF8
    Set-AppLockerPolicy -XmlPolicy $path

    gpupdate /force | Out-Null

    Write-Host ""
    Write-Host "Perfil aplicado. Reinicie o computador." -ForegroundColor Green
}

function Revert-Profile {
    Remove-Item "HKLM:\\SOFTWARE\\Policies\\Google\\Chrome" -Recurse -Force -ErrorAction SilentlyContinue

    $empty = @"
<AppLockerPolicy Version="1">
  <RuleCollection Type="Exe" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Msi" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Script" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Appx" EnforcementMode="NotConfigured" />
  <RuleCollection Type="Dll" EnforcementMode="NotConfigured" />
</AppLockerPolicy>
"@

    $path = Join-Path $env:TEMP "WinLab-AppLocker-Empty.xml"
    $empty | Set-Content $path -Encoding UTF8
    Set-AppLockerPolicy -XmlPolicy $path
    gpupdate /force | Out-Null

    Write-Host "Políticas principais removidas. Reinicie o computador." -ForegroundColor Green
}

Assert-Administrator

if ($Modo -eq "Instalar") {
    Install-Profile
} else {
    Revert-Profile
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

Usuário de aluno: ${config.studentUser}
Usuário administrador: ${config.adminUser}

1. Teste primeiro em uma máquina piloto.
2. Execute o setup.ps1 como administrador.
3. Reinicie o computador.
4. Valide os programas permitidos.
5. Use setup.ps1 -Modo Reverter em caso de necessidade.

Nenhuma senha é armazenada neste pacote.
As senhas das contas são solicitadas durante a execução.
`;
}
