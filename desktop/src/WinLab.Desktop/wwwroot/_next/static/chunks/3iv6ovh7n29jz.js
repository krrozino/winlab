(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,52683,e=>{"use strict";var t=e.i(43476),o=e.i(22016),a=e.i(71645),r=e.i(95060),i=e.i(14265);function n(e){return"object"==typeof e&&null!==e&&!Array.isArray(e)}function s(e,t=""){return"string"==typeof e?e:t}function l(e){return"string"==typeof e&&e.trim()?e:null}function c(e,t=0){return"number"==typeof e&&Number.isFinite(e)?e:t}function d(e){if(!n(e))return null;let t=s(e.name).trim();return t?{name:t,enabled:!0===e.enabled,isAdministrator:!0===e.isAdministrator}:null}function u(e){if(!n(e))return null;let t=s(e.id);return r.ALLOWED_APP_IDS.includes(t)?{id:t,label:s(e.label,r.APP_CATALOG[t].label),found:!0===e.found,path:l(e.path)}:null}function p(e){if(!n(e))return null;let t=s(e.name).trim();return t?{name:t,version:l(e.version),publisher:l(e.publisher),installLocation:l(e.installLocation)}:null}function m(e){return e.knownApps.filter(e=>e.found)}function $(e,t){return m(e).map(e=>e.id).filter(e=>!t.allowedApps.includes(e))}function h(e){return`'${e.replaceAll("'","''")}'`}function f(){let e=Object.entries(r.APP_CATALOG).map(([e,t])=>{var o;return`    @{
        Id = ${h(e)}
        Label = ${h(t.label)}
        Paths = ${!(o=t.paths).length?"@()":`@(
${o.map(e=>`        ${h(e)}`).join(",\n")}
    )`}
    }`}).join(",\n");return`#requires -version 5.1
<#
WINLAB PC INVENTORY
Gera um invent\xe1rio local para importar no WinLab Configurator.

O arquivo N\xc3O coleta senhas, documentos, hist\xf3rico do navegador ou conte\xfado pessoal.
Ele registra apenas informa\xe7\xf5es do Windows, contas locais, AppLocker e programas instalados.
#>

$ErrorActionPreference = "Stop"

$KnownApps = @(
${e}
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
Write-Host "Invent\xe1rio WinLab criado com sucesso." -ForegroundColor Green
Write-Host $outputPath -ForegroundColor Cyan
Write-Host ""
Write-Host "Agora importe esse JSON no WinLab Configurator." -ForegroundColor Yellow
`}function g(e){return"object"==typeof e&&null!==e&&!Array.isArray(e)}function A(e,t=""){return"string"==typeof e?e:t}function P(e,t=0){return"number"==typeof e&&Number.isFinite(e)?e:t}function x(e){return"PASS"===e||"WARN"===e||"BLOCK"===e?e:"BLOCK"}function S(e){if(!g(e))return null;let t=A(e.id).trim(),o=A(e.label).trim();return t&&o?{id:t,label:o,status:x(e.status),message:A(e.message)}:null}function y(e){return"'"+e.replaceAll("'","''")+"'"}function C(e){return e.length?"@("+e.map(y).join(", ")+")":"@()"}function b(e){let t=e.allowedApps.map(e=>{let t=r.APP_CATALOG[e];return"@{ Id = "+y(e)+"; Label = "+y(t.label)+"; Paths = "+C(t.paths)+" }"}).join(",\n    ");return String.raw`#requires -version 5.1
[CmdletBinding()]
param([string]$OutputPath = $null)

<#
WINLAB PREFLIGHT / READINESS
Somente diagnóstico. Não aplica políticas nem altera contas.
#>

$ErrorActionPreference = "Stop"
$ProfileName = ${y(e.profileName)}
$Aluno = ${y(e.studentUser)}
$Admin = ${y(e.adminUser)}
$CreateAccounts = ${e.createAccounts?"$true":"$false"}
$EnforcementMode = ${y(e.enforcementMode)}
$StorageWarningFreePercent = ${e.storageWarningFreePercent}
$BrowserUrlMode = ${y(e.browserUrlMode)}
$AllowedUrls = ${C(e.allowedUrls)}
$CustomAllowedPaths = ${C(e.customAllowedPaths)}

$KnownApps = @(
    ${t}
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
`}var v=e.i(67874),k=e.i(35856),N=e.i(20592);function w(e){return e?"$true":"$false"}function L(e){return`'${e.replaceAll("'","''")}'`}function R(e){return e.length?`@(
${e.map(e=>`    ${L(e)}`).join(",\n")}
)`:"@()"}function E(e,t,o=""){let a=o?`${o}

`:"";return`#requires -version 5.1
<#
${t}
Gerado por WinLab Configurator
Perfil: ${e.profileName}

Teste primeiro em uma m\xe1quina piloto.
Nenhuma senha \xe9 armazenada neste arquivo.
#>
${a}$ErrorActionPreference = "Stop"
$Aluno = ${L(e.studentUser)}
$Admin = ${L(e.adminUser)}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)

    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Execute este arquivo como administrador."
    }
}

function Assert-WinLabPackageIntegrity {
    if (-not $PSScriptRoot) {
        Write-Warning "Integridade do pacote indispon\xedvel: script sem diret\xf3rio de origem."
        return
    }

    $manifestPath = Join-Path $PSScriptRoot "manifest.json"

    if (-not (Test-Path $manifestPath)) {
        Write-Warning "manifest.json n\xe3o encontrado. O script parece ter sido baixado isoladamente; a integridade do pacote n\xe3o pode ser verificada."
        return
    }

    try {
        $manifest = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "manifest.json inv\xe1lido: $($_.Exception.Message)"
    }

    if ($manifest.schemaVersion -ne 1) {
        throw "Vers\xe3o de manifesto n\xe3o suportada: $($manifest.schemaVersion)"
    }

    foreach ($entry in @($manifest.files)) {
        $path = Join-Path $PSScriptRoot ([string]$entry.name)

        if (-not (Test-Path $path -PathType Leaf)) {
            throw "Integridade do pacote falhou: arquivo ausente '$($entry.name)'."
        }

        $actualHash = (Get-FileHash -Path $path -Algorithm SHA256).Hash.ToLowerInvariant()
        $expectedHash = ([string]$entry.sha256).ToLowerInvariant()

        if ($actualHash -ne $expectedHash) {
            throw "Integridade do pacote falhou: hash divergente em '$($entry.name)'."
        }

        $actualBytes = (Get-Item -LiteralPath $path).Length
        if ([int64]$actualBytes -ne [int64]$entry.bytes) {
            throw "Integridade do pacote falhou: tamanho divergente em '$($entry.name)'."
        }
    }

    Write-Host "Integridade do pacote: PASS" -ForegroundColor Green
}

function Get-AdminsGroup { Get-LocalGroup -SID "S-1-5-32-544" }
function Get-UsersGroup { Get-LocalGroup -SID "S-1-5-32-545" }

function Invoke-WithUserHive {
    param(
        [Parameter(Mandatory=$true)][string]$UserName,
        [Parameter(Mandatory=$true)][scriptblock]$Action,
        $Context = $null
    )

    $user = Get-LocalUser -Name $UserName -ErrorAction Stop
    $sid = $user.SID.Value
    $hive = "Registry::HKEY_USERS\\$sid"
    $mountedByUs = $false

    if (-not (Test-Path $hive)) {
        $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue

        if (-not $profile.LocalPath) {
            throw "O perfil de '$UserName' ainda n\xe3o existe; as pol\xedticas por usu\xe1rio n\xe3o podem ser aplicadas imediatamente."
        }

        $ntUser = Join-Path $profile.LocalPath "NTUSER.DAT"

        if (-not (Test-Path $ntUser)) {
            throw "NTUSER.DAT de '$UserName' n\xe3o encontrado."
        }

        reg.exe load "HKU\\$sid" "$ntUser" | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "N\xe3o foi poss\xedvel carregar o registro da conta '$UserName'."
        }

        $mountedByUs = $true
    }

    try {
        & $Action $sid $Context
    }
    finally {
        if ($mountedByUs) {
            [gc]::Collect()
            [gc]::WaitForPendingFinalizers()
            reg.exe unload "HKU\\$sid" | Out-Null
        }
    }
}
`}function W(e){let t=[...e.allowedApps.flatMap(e=>r.APP_CATALOG[e].paths),...e.customAllowedPaths.map(e=>e.trim()).filter(Boolean)],o=e.enforcementMode;return`${E(e,"SETUP",`[CmdletBinding()]
param([switch]$Apply, [switch]$UserPoliciesOnly)`)}
$ProfileName = ${L(e.profileName)}
$CreateAccounts = ${w(e.createAccounts)}
$BlockInstallers = ${w(e.blockInstallers)}
$BlockStoreApps = ${w(e.blockStoreApps)}
$BlockCmd = ${w(e.blockCmd)}
$BlockPowerShell = ${w(e.blockPowerShell)}
$BlockRegedit = ${w(e.blockRegedit)}
$AllowLocalAccountManagement = ${w(e.allowLocalAccountManagement)}

$BlockChromeExtensions = ${w(e.blockChromeExtensions)}
$BlockChromeGuest = ${w(e.blockChromeGuest)}
$BlockChromeNewProfiles = ${w(e.blockChromeNewProfiles)}
$BlockChromeIncognito = ${w(e.blockChromeIncognito)}
$BlockChromePasswordManager = ${w(e.blockChromePasswordManager)}

$BrowserUrlMode = "${e.browserUrlMode}"
$BlockedUrls = ${R(e.blockedUrls)}
$AllowedUrls = ${R(e.allowedUrls)}

$BlockUsbRead = ${w(e.blockUsbRead)}
$BlockUsbWrite = ${w(e.blockUsbWrite)}
$BlockUsbExecute = ${w(e.blockUsbExecute)}

$BlockWallpaper = ${w(e.blockWallpaper)}
$BlockMousePointers = ${w(e.blockMousePointers)}
$BlockSoundScheme = ${w(e.blockSoundScheme)}

$AllowedExecutables = ${R(t)}
$EnforcementMode = "${o}"

$WinLabRoot = "C:\\ProgramData\\WinLab"
$StatePath = Join-Path $WinLabRoot "state.json"
$DeferredTaskName = "WinLab-Apply-UserPolicies"

function Get-WinLabState {
    if (-not (Test-Path $StatePath)) { return $null }

    try {
        return Get-Content -Path $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "O estado WinLab existente em '$StatePath' est\xe1 corrompido ou ileg\xedvel. N\xe3o \xe9 seguro continuar."
    }
}

function Save-WinLabState {
    param([Parameter(Mandatory=$true)]$State)

    New-Item -Path $WinLabRoot -ItemType Directory -Force | Out-Null
    $State | ConvertTo-Json -Depth 8 | Set-Content -Path $StatePath -Encoding UTF8
}

function Test-WinLabUserName {
    param([Parameter(Mandatory=$true)][string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
    if ($Value.Length -gt 20) { return $false }
    if ($Value -match '^[.\\s]+$') { return $false }

    $invalid = @('"', '/', '\\', '[', ']', ':', ';', '|', '=', ',', '+', '*', '?', '<', '>', '@')
    foreach ($character in $invalid) {
        if ($Value.Contains($character)) { return $false }
    }

    return $true
}

function Test-WinLabPreflight {
    $errors = New-Object System.Collections.Generic.List[string]

    if (-not (Test-WinLabUserName -Value $Aluno)) {
        $errors.Add("Nome inv\xe1lido para a conta restrita '$Aluno'. Use at\xe9 20 caracteres e evite caracteres reservados do Windows.")
    }

    if (-not (Test-WinLabUserName -Value $Admin)) {
        $errors.Add("Nome inv\xe1lido para a conta administrativa '$Admin'. Use at\xe9 20 caracteres e evite caracteres reservados do Windows.")
    }

    if ([string]::Equals($Aluno, $Admin, [StringComparison]::OrdinalIgnoreCase)) {
        $errors.Add("A conta restrita e a conta administrativa usam o mesmo nome.")
    }

    $requiredCommands = @(
        "Get-LocalUser",
        "Get-LocalGroup",
        "Get-AppLockerPolicy",
        "Set-AppLockerPolicy",
        "New-ScheduledTaskAction",
        "New-ScheduledTaskTrigger",
        "New-ScheduledTaskPrincipal",
        "Register-ScheduledTask",
        "Unregister-ScheduledTask"
    )

    if ($CreateAccounts) {
        $requiredCommands += @(
            "New-LocalUser",
            "Add-LocalGroupMember",
            "Remove-LocalGroupMember"
        )
    }

    foreach ($command in $requiredCommands) {
        if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
            $errors.Add("Comando obrigat\xf3rio n\xe3o encontrado: $command")
        }
    }

    if (-not $CreateAccounts) {
        if (-not (Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue)) {
            $errors.Add("A conta restrita '$Aluno' n\xe3o existe e a cria\xe7\xe3o autom\xe1tica est\xe1 desativada.")
        }

        if (-not (Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue)) {
            $errors.Add("A conta administrativa '$Admin' n\xe3o existe e a cria\xe7\xe3o autom\xe1tica est\xe1 desativada.")
        }
    }

    $appIdService = Get-Service AppIDSvc -ErrorAction SilentlyContinue
    if (-not $appIdService) {
        $errors.Add("Servi\xe7o Application Identity (AppIDSvc) n\xe3o encontrado.")
    }

    $state = Get-WinLabState
    if ($state) {
        if ($state.studentUser -and -not [string]::Equals([string]$state.studentUser, $Aluno, [StringComparison]::OrdinalIgnoreCase)) {
            $errors.Add("J\xe1 existe estado WinLab para o usu\xe1rio '$($state.studentUser)'. Execute o rollback antes de mudar o usu\xe1rio restrito.")
        }

        if ($state.adminUser -and -not [string]::Equals([string]$state.adminUser, $Admin, [StringComparison]::OrdinalIgnoreCase)) {
            $errors.Add("J\xe1 existe estado WinLab para o administrador '$($state.adminUser)'. Execute o rollback antes de mudar a conta administrativa.")
        }

        $currentStudent = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
        if ($state.studentSid -and $currentStudent -and ([string]$state.studentSid -ne $currentStudent.SID.Value)) {
            $errors.Add("A conta '$Aluno' foi recriada com outro SID. Fa\xe7a recupera\xe7\xe3o/rollback antes de reaplicar.")
        }

        $currentAdmin = Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue
        if ($state.adminSid -and $currentAdmin -and ([string]$state.adminSid -ne $currentAdmin.SID.Value)) {
            $errors.Add("A conta '$Admin' foi recriada com outro SID. Fa\xe7a recupera\xe7\xe3o/rollback antes de reaplicar.")
        }
    }

    if ($errors.Count -gt 0) {
        $message = "Preflight WinLab falhou:" + [Environment]::NewLine + (($errors | ForEach-Object { " - $_" }) -join [Environment]::NewLine)
        throw $message
    }

    Write-Host "Preflight WinLab: OK" -ForegroundColor Green
}

function Ensure-Accounts {
    if (-not $CreateAccounts) { return }

    if (-not (Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue)) {
        $password = Read-Host "Defina a senha da conta administrativa '$Admin'" -AsSecureString
        New-LocalUser -Name $Admin -Password $password -Description "WinLab - Administrador" | Out-Null
    }

    Add-LocalGroupMember -Group (Get-AdminsGroup) -Member $Admin -ErrorAction SilentlyContinue

    if (-not (Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue)) {
        $password = Read-Host "Defina a senha da conta '$Aluno'" -AsSecureString
        New-LocalUser -Name $Aluno -Password $password -Description "WinLab - Usu\xe1rio restrito" | Out-Null
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

function Test-StudentProfileReady {
    $user = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
    if (-not $user) { return $false }

    $sid = $user.SID.Value
    $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
    if (-not $profile -or -not $profile.LocalPath) { return $false }

    return Test-Path (Join-Path $profile.LocalPath "NTUSER.DAT")
}

function Apply-StudentPolicies {
    Set-StudentChromePolicies
    Set-StudentEdgePolicies
    Set-StudentUsbPolicies
    Set-StudentAccountPolicies
    Set-StudentPersonalizationPolicies
}

function Queue-StudentPoliciesForFirstLogon {
    if (-not $PSCommandPath) {
        throw "N\xe3o foi poss\xedvel localizar o pr\xf3prio setup.ps1 para preparar a aplica\xe7\xe3o no primeiro logon."
    }

    New-Item -Path $WinLabRoot -ItemType Directory -Force | Out-Null

    $deferredScript = Join-Path $WinLabRoot "setup-deferred.ps1"
    Copy-Item -Path $PSCommandPath -Destination $deferredScript -Force

    $actionArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $deferredScript + '" -Apply -UserPoliciesOnly'
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
    $triggerUser = "$env:COMPUTERNAME\\$Aluno"
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $triggerUser
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    Register-ScheduledTask -TaskName $DeferredTaskName -Action $action -Trigger $trigger -Principal $principal -Force | Out-Null

    Write-Host "Pol\xedticas por usu\xe1rio agendadas para o primeiro logon de '$Aluno'." -ForegroundColor Yellow
}

function Complete-DeferredUserPolicies {
    if (-not (Test-StudentProfileReady)) {
        throw "O perfil de '$Aluno' ainda n\xe3o est\xe1 pronto. A tarefa ser\xe1 mantida para tentar novamente no pr\xf3ximo logon."
    }

    Apply-StudentPolicies

    $state = Get-WinLabState
    if ($state) {
        $state.userPoliciesDeferred = $false
        $state.userPoliciesAppliedAt = (Get-Date).ToString("o")
        Save-WinLabState -State $state
    }

    Unregister-ScheduledTask -TaskName $DeferredTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Pol\xedticas por usu\xe1rio aplicadas e tarefa de primeiro logon removida." -ForegroundColor Green
}

function Ensure-RegistryBaseline {
    $state = Get-WinLabState
    if ($state -and $state.registryBaselineDir) {
        $existing = [string]$state.registryBaselineDir

        if (Test-Path $existing) {
            Write-Host "Baseline de registro preservado: $existing" -ForegroundColor DarkGray
            return $existing
        }

        throw "O estado WinLab aponta para um baseline de registro inexistente: $existing."
    }

    $backupRoot = Join-Path $WinLabRoot "Backups"
    New-Item -Path $backupRoot -ItemType Directory -Force | Out-Null

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $baselineDir = Join-Path $backupRoot "Registry-Baseline-$stamp"
    New-Item -Path $baselineDir -ItemType Directory -Force | Out-Null

    $profileReady = Test-StudentProfileReady

    if ($profileReady) {
        Invoke-WithUserHive -UserName $Aluno -Context $baselineDir -Action {
            param($sid, $context)

            $baselineDir = [string]$context

            $targets = @(
                @{ Name = "Chrome"; Native = "HKU\\$sid\\Software\\Policies\\Google\\Chrome"; Provider = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Google\\Chrome" },
                @{ Name = "Edge"; Native = "HKU\\$sid\\Software\\Policies\\Microsoft\\Edge"; Provider = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Edge" },
                @{ Name = "Personalization"; Native = "HKU\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization"; Provider = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\Personalization" },
                @{ Name = "ActiveDesktop"; Native = "HKU\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop"; Provider = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop" },
                @{ Name = "Explorer"; Native = "HKU\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer"; Provider = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer" },
                @{ Name = "RemovableStorage"; Native = "HKU\\$sid\\Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices"; Provider = "Registry::HKEY_USERS\\$sid\\Software\\Policies\\Microsoft\\Windows\\RemovableStorageDevices" }
            )

            foreach ($target in $targets) {
                if (Test-Path $target.Provider) {
                    $file = Join-Path $baselineDir ($target.Name + ".reg")
                    reg.exe export $target.Native $file /y | Out-Null

                    if ($LASTEXITCODE -ne 0) {
                        throw "Falha ao exportar baseline de registro: $($target.Native)"
                    }
                }
            }
        }
    }

    $manifest = [ordered]@{
        createdAt = (Get-Date).ToString("o")
        studentUser = $Aluno
        profileReadyAtBaseline = $profileReady
    }

    $manifest | ConvertTo-Json | Set-Content -Path (Join-Path $baselineDir "manifest.json") -Encoding UTF8

    Write-Host "Baseline de registro criado: $baselineDir" -ForegroundColor DarkGray
    return $baselineDir
}

function Ensure-AppLockerBaseline {
    $backupDir = Join-Path $WinLabRoot "Backups"
    New-Item -Path $backupDir -ItemType Directory -Force | Out-Null

    $state = Get-WinLabState
    if ($state -and $state.baselineAppLockerBackup) {
        $existing = [string]$state.baselineAppLockerBackup

        if (Test-Path $existing) {
            Write-Host "Baseline AppLocker preservado: $existing" -ForegroundColor DarkGray
            return $existing
        }

        throw "O estado WinLab aponta para um baseline AppLocker inexistente: $existing. N\xe3o \xe9 seguro sobrescrever o baseline."
    }

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backup = Join-Path $backupDir "AppLocker-Baseline-$stamp.xml"
    Get-AppLockerPolicy -Local -Xml | Set-Content -Path $backup -Encoding UTF8

    Write-Host "Baseline AppLocker criado: $backup" -ForegroundColor DarkGray
    return $backup
}

function Save-WinLabAppliedState {
    param(
        [Parameter(Mandatory=$true)][string]$BaselineAppLockerBackup,
        [Parameter(Mandatory=$true)][string]$RegistryBaselineDir,
        [Parameter(Mandatory=$true)][bool]$UserPoliciesDeferred,
        [ValidateSet("Applying", "Applied", "RecoveredAfterFailure", "RecoveryFailed")][string]$Status = "Applied",
        [string]$ErrorMessage = $null
    )

    $previous = Get-WinLabState
    $createdAt = if ($previous -and $previous.createdAt) {
        [string]$previous.createdAt
    }
    else {
        (Get-Date).ToString("o")
    }

    $applyCount = 0
    if ($previous -and $previous.applyCount) {
        $applyCount = [int]$previous.applyCount
    }

    if ($Status -eq "Applied") {
        $applyCount++
    }

    $studentObject = Get-LocalUser -Name $Aluno -ErrorAction Stop
    $adminObject = Get-LocalUser -Name $Admin -ErrorAction Stop

    $state = [ordered]@{
        schemaVersion = 2
        status = $Status
        profileName = $ProfileName
        studentUser = $Aluno
        studentSid = $studentObject.SID.Value
        adminUser = $Admin
        adminSid = $adminObject.SID.Value
        enforcementMode = $EnforcementMode
        baselineAppLockerBackup = $BaselineAppLockerBackup
        registryBaselineDir = $RegistryBaselineDir
        userPoliciesDeferred = $UserPoliciesDeferred
        userPoliciesAppliedAt = if ($Status -eq "Applied" -and -not $UserPoliciesDeferred) {
            (Get-Date).ToString("o")
        }
        elseif ($previous) {
            $previous.userPoliciesAppliedAt
        }
        else {
            $null
        }
        errorMessage = $ErrorMessage
        createdAt = $createdAt
        lastAttemptAt = (Get-Date).ToString("o")
        lastAppliedAt = if ($Status -eq "Applied") { (Get-Date).ToString("o") } elseif ($previous) { $previous.lastAppliedAt } else { $null }
        applyCount = $applyCount
    }

    Save-WinLabState -State $state
    Write-Host "Estado WinLab salvo em $StatePath ($Status)" -ForegroundColor DarkGray
}

function Remove-StudentWinLabPoliciesForRecovery {
    if (-not (Test-StudentProfileReady)) { return }

    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid, $context)

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

function Restore-RegistryBaselineForRecovery {
    param([Parameter(Mandatory=$true)][string]$RegistryBaselineDir)

    if (-not (Test-Path $RegistryBaselineDir)) {
        throw "Baseline de registro ausente durante recupera\xe7\xe3o: $RegistryBaselineDir"
    }

    $files = @(Get-ChildItem -Path $RegistryBaselineDir -Filter *.reg -File -ErrorAction SilentlyContinue)
    if ($files.Count -eq 0) { return }

    if (-not (Test-StudentProfileReady)) {
        throw "Existem backups de registro, mas o perfil de '$Aluno' n\xe3o est\xe1 dispon\xedvel para restaura\xe7\xe3o autom\xe1tica."
    }

    Invoke-WithUserHive -UserName $Aluno -Context $files -Action {
        param($sid, $context)

        foreach ($file in @($context)) {
            reg.exe import $file.FullName | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao importar baseline de registro: $($file.FullName)"
            }
        }
    }
}

function Recover-FromFailedSetup {
    param(
        [Parameter(Mandatory=$true)][string]$BaselineAppLockerBackup,
        [Parameter(Mandatory=$true)][string]$RegistryBaselineDir,
        [Parameter(Mandatory=$true)][string]$OriginalError
    )

    Write-Warning "Falha durante o setup. Iniciando recupera\xe7\xe3o autom\xe1tica."

    try {
        if (Test-Path $BaselineAppLockerBackup) {
            Set-AppLockerPolicy -XmlPolicy $BaselineAppLockerBackup
        }

        Remove-StudentWinLabPoliciesForRecovery
        Restore-RegistryBaselineForRecovery -RegistryBaselineDir $RegistryBaselineDir

        Unregister-ScheduledTask -TaskName $DeferredTaskName -Confirm:$false -ErrorAction SilentlyContinue
        Remove-Item -Path (Join-Path $WinLabRoot "setup-deferred.ps1") -Force -ErrorAction SilentlyContinue
        gpupdate /force | Out-Null

        Save-WinLabAppliedState -BaselineAppLockerBackup $BaselineAppLockerBackup -RegistryBaselineDir $RegistryBaselineDir -UserPoliciesDeferred $false -Status "RecoveredAfterFailure" -ErrorMessage $OriginalError

        Write-Host "Recupera\xe7\xe3o autom\xe1tica conclu\xedda; baselines restaurados." -ForegroundColor Green
        return $true
    }
    catch {
        $recoveryError = $_.Exception.Message

        try {
            Save-WinLabAppliedState -BaselineAppLockerBackup $BaselineAppLockerBackup -RegistryBaselineDir $RegistryBaselineDir -UserPoliciesDeferred $false -Status "RecoveryFailed" -ErrorMessage ("Setup: " + $OriginalError + " | Recovery: " + $recoveryError)
        }
        catch {
            Write-Warning "Tamb\xe9m n\xe3o foi poss\xedvel atualizar state.json ap\xf3s falha de recupera\xe7\xe3o."
        }

        Write-Warning ("Recupera\xe7\xe3o autom\xe1tica falhou: " + $recoveryError)
        return $false
    }
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
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear execu\xe7\xe3o em USB" Description="" UserOrGroupSid="$studentSid" Action="Deny">
      <Conditions><FilePathCondition Path="%HOT%\\*" /></Conditions>
    </FilePathRule>
"@
        $denyRules += @"
    <FilePathRule Id="$([guid]::NewGuid().ToString("B").ToUpper())" Name="Bloquear execu\xe7\xe3o em m\xeddia remov\xedvel" Description="" UserOrGroupSid="$studentSid" Action="Deny">
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
    <FilePathRule Id="{A1111111-1111-1111-1111-111111111111}" Name="Administradores - todos execut\xe1veis" Description="" UserOrGroupSid="$adminsSid" Action="Allow">
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

function Show-WinLabPlan {
    Write-Host "=== WinLab - PREVIEW do setup ===" -ForegroundColor Cyan
    Write-Host ("Perfil: ${e.profileName}")
    Write-Host ("Usu\xe1rio restrito: {0}" -f $Aluno)
    Write-Host ("Administrador: {0}" -f $Admin)
    Write-Host ("AppLocker: {0}" -f $EnforcementMode)
    Write-Host ("Criar/ajustar contas: {0}" -f $CreateAccounts)
    Write-Host ("Sites: {0}" -f $BrowserUrlMode)
    Write-Host ("USB leitura bloqueada: {0}" -f $BlockUsbRead)
    Write-Host ("USB grava\xe7\xe3o bloqueada: {0}" -f $BlockUsbWrite)
    Write-Host ("USB execu\xe7\xe3o bloqueada: {0}" -f $BlockUsbExecute)
    Write-Host ("Aplicativos/caminhos permitidos: {0}" -f $AllowedExecutables.Count)
    Write-Host ""
    Write-Host "Nenhuma altera\xe7\xe3o foi aplicada." -ForegroundColor Green
    Write-Host "Para aplicar de verdade, execute novamente com -Apply." -ForegroundColor Yellow
}

function Install-WinLabProfile {
    Ensure-Accounts

    $baseline = Ensure-AppLockerBaseline
    $registryBaseline = Ensure-RegistryBaseline
    Save-WinLabAppliedState -BaselineAppLockerBackup $baseline -RegistryBaselineDir $registryBaseline -UserPoliciesDeferred $false -Status "Applying"

    $userPoliciesDeferred = $false

    try {
        if (Test-StudentProfileReady) {
            Apply-StudentPolicies
            Unregister-ScheduledTask -TaskName $DeferredTaskName -Confirm:$false -ErrorAction SilentlyContinue
            Remove-Item -Path (Join-Path $WinLabRoot "setup-deferred.ps1") -Force -ErrorAction SilentlyContinue
            Write-Host "Pol\xedticas por usu\xe1rio aplicadas imediatamente." -ForegroundColor Green
        }
        else {
            Queue-StudentPoliciesForFirstLogon
            $userPoliciesDeferred = $true
        }

        sc.exe config appidsvc start=auto | Out-Null
        Start-Service AppIDSvc -ErrorAction SilentlyContinue

        $xml = New-WinLabAppLockerXml
        $temp = Join-Path $env:TEMP "WinLab-AppLocker.xml"
        $xml | Set-Content -Path $temp -Encoding UTF8

        Set-AppLockerPolicy -XmlPolicy $temp
        gpupdate /force | Out-Null

        Save-WinLabAppliedState -BaselineAppLockerBackup $baseline -RegistryBaselineDir $registryBaseline -UserPoliciesDeferred $userPoliciesDeferred -Status "Applied"
    }
    catch {
        $originalError = $_.Exception.Message
        $recovered = Recover-FromFailedSetup -BaselineAppLockerBackup $baseline -RegistryBaselineDir $registryBaseline -OriginalError $originalError

        if ($recovered) {
            throw ("Setup WinLab falhou, mas a recupera\xe7\xe3o autom\xe1tica restaurou os baselines. Erro original: " + $originalError)
        }

        throw ("Setup WinLab falhou e a recupera\xe7\xe3o autom\xe1tica tamb\xe9m falhou. Consulte state.json. Erro original: " + $originalError)
    }

    Write-Host ""
    Write-Host "WinLab aplicado ao perfil '$Aluno'." -ForegroundColor Green
    Write-Host "Conta administrativa '$Admin' permanece fora das pol\xedticas por usu\xe1rio." -ForegroundColor Green
    Write-Host "AppLocker: $EnforcementMode" -ForegroundColor Cyan

    if ($userPoliciesDeferred) {
        Write-Host "As pol\xedticas do usu\xe1rio ser\xe3o conclu\xeddas automaticamente no primeiro logon de '$Aluno'." -ForegroundColor Yellow
    }

    if ($EnforcementMode -eq "AuditOnly") {
        Write-Host "Os bloqueios AppLocker est\xe3o em AUDITORIA. Valide os logs antes de gerar uma configura\xe7\xe3o em modo Enabled." -ForegroundColor Yellow
    }

    Write-Host "Reinicie o computador." -ForegroundColor Yellow
}

if ($Apply) {
    Assert-Administrator
    Assert-WinLabPackageIntegrity
    Test-WinLabPreflight

    if ($UserPoliciesOnly) {
        Complete-DeferredUserPolicies
    }
    else {
        Install-WinLabProfile
    }
}
else {
    Show-WinLabPlan
}
`}function j(e){return new TextEncoder().encode(e)}async function U(e){return[...new Uint8Array(await crypto.subtle.digest("SHA-256",j(e)))].map(e=>e.toString(16).padStart(2,"0")).join("")}async function B(e,t,o){let a=await Promise.all(t.map(async e=>({name:e.name,sha256:await U(e.content),bytes:j(e.content).byteLength})));return{schemaVersion:1,packageVersion:"0.9.0",packageId:o?.packageId??crypto.randomUUID(),generatedAt:o?.generatedAt??new Date().toISOString(),profileName:e.profileName,configSchemaVersion:1,channel:o?.channel??"standard",targetComputerName:o?.targetComputerName??null,integrity:{algorithm:"SHA-256",manifestSelfHashed:!1,authenticity:"unsigned"},files:a}}async function I(e,t){let o,a,n=[{name:"setup.ps1",content:W(e)},{name:"rollback.ps1",content:`${E(e,"ROLLBACK",`[CmdletBinding()]
param([switch]$Apply)`)}
$WinLabRoot = "C:\\ProgramData\\WinLab"
$StatePath = Join-Path $WinLabRoot "state.json"
$DeferredTaskName = "WinLab-Apply-UserPolicies"

function Get-WinLabRollbackState {
    if (-not (Test-Path $StatePath)) {
        throw "state.json do WinLab n\xe3o foi encontrado. O rollback seguro foi interrompido para n\xe3o apagar pol\xedticas anteriores."
    }

    try {
        $state = Get-Content -Path $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json
    }
    catch {
        throw "state.json est\xe1 corrompido ou ileg\xedvel. O rollback seguro foi interrompido."
    }

    if (-not $state.baselineAppLockerBackup) {
        throw "O estado WinLab n\xe3o cont\xe9m um baseline AppLocker. O rollback seguro foi interrompido."
    }

    if (-not (Test-Path ([string]$state.baselineAppLockerBackup))) {
        throw "O backup AppLocker original n\xe3o existe mais: $($state.baselineAppLockerBackup)"
    }

    if ($state.studentUser -and -not [string]::Equals([string]$state.studentUser, $Aluno, [StringComparison]::OrdinalIgnoreCase)) {
        throw "O estado pertence ao usu\xe1rio '$($state.studentUser)', mas este rollback foi gerado para '$Aluno'."
    }

    if ($state.adminUser -and -not [string]::Equals([string]$state.adminUser, $Admin, [StringComparison]::OrdinalIgnoreCase)) {
        throw "O estado pertence ao administrador '$($state.adminUser)', mas este rollback foi gerado para '$Admin'."
    }

    $currentStudent = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
    if ($state.studentSid -and $currentStudent -and ([string]$state.studentSid -ne $currentStudent.SID.Value)) {
        throw "A conta '$Aluno' possui SID diferente do registrado pelo WinLab. O rollback autom\xe1tico foi interrompido para n\xe3o restaurar registro no usu\xe1rio errado."
    }

    $currentAdmin = Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue
    if ($state.adminSid -and $currentAdmin -and ([string]$state.adminSid -ne $currentAdmin.SID.Value)) {
        throw "A conta '$Admin' possui SID diferente do registrado pelo WinLab. O rollback autom\xe1tico foi interrompido."
    }

    return $state
}

function Test-StudentProfileExists {
    $user = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
    if (-not $user) { return $false }

    $sid = $user.SID.Value
    $profile = Get-CimInstance Win32_UserProfile -Filter "SID='$sid'" -ErrorAction SilentlyContinue
    return [bool]($profile -and $profile.LocalPath -and (Test-Path (Join-Path $profile.LocalPath "NTUSER.DAT")))
}

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

function Restore-RegistryBaseline {
    param([Parameter(Mandatory=$true)]$State)

    if (-not $State.registryBaselineDir) {
        Write-Warning "Estado WinLab sem baseline de registro; nada ser\xe1 importado."
        return
    }

    $baselineDir = [string]$State.registryBaselineDir
    if (-not (Test-Path $baselineDir)) {
        throw "Baseline de registro n\xe3o encontrado: $baselineDir"
    }

    $files = @(Get-ChildItem -Path $baselineDir -Filter *.reg -File -ErrorAction SilentlyContinue)
    if ($files.Count -eq 0) {
        Write-Host "Baseline de registro n\xe3o continha chaves anteriores para restaurar." -ForegroundColor DarkGray
        return
    }

    if (-not (Test-StudentProfileExists)) {
        throw "H\xe1 backups de registro para '$Aluno', mas o perfil local n\xe3o existe mais. Restaura\xe7\xe3o manual necess\xe1ria."
    }

    Invoke-WithUserHive -UserName $Aluno -Context $files -Action {
        param($sid, $context)

        $files = @($context)

        foreach ($file in $files) {
            reg.exe import $file.FullName | Out-Null

            if ($LASTEXITCODE -ne 0) {
                throw "Falha ao restaurar baseline de registro: $($file.FullName)"
            }
        }
    }

    Write-Host "Baseline de registro restaurado a partir de $baselineDir" -ForegroundColor Green
}

function Restore-AppLockerBaseline {
    param([Parameter(Mandatory=$true)]$State)

    $baseline = [string]$State.baselineAppLockerBackup
    Set-AppLockerPolicy -XmlPolicy $baseline
    Write-Host "Baseline AppLocker restaurado: $baseline" -ForegroundColor Green
}

function Archive-WinLabState {
    param([Parameter(Mandatory=$true)]$State)

    $historyDir = Join-Path $WinLabRoot "History"
    New-Item -Path $historyDir -ItemType Directory -Force | Out-Null

    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $historyPath = Join-Path $historyDir "state-rollback-$stamp.json"
    $State | ConvertTo-Json -Depth 8 | Set-Content -Path $historyPath -Encoding UTF8

    Remove-Item -Path $StatePath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $WinLabRoot "setup-deferred.ps1") -Force -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $DeferredTaskName -Confirm:$false -ErrorAction SilentlyContinue

    Write-Host "Estado anterior arquivado em $historyPath" -ForegroundColor DarkGray
}

if ($Apply) {
    Assert-Administrator
    Assert-WinLabPackageIntegrity
    $state = Get-WinLabRollbackState

    Restore-AppLockerBaseline -State $state

    if (Test-StudentProfileExists) {
        Remove-StudentPolicies
        Restore-RegistryBaseline -State $state
    }
    else {
        Write-Host "Perfil do usu\xe1rio '$Aluno' n\xe3o existe; n\xe3o h\xe1 hive de usu\xe1rio para limpar." -ForegroundColor DarkGray
        Restore-RegistryBaseline -State $state
    }

    Unregister-ScheduledTask -TaskName $DeferredTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Remove-Item -Path (Join-Path $WinLabRoot "setup-deferred.ps1") -Force -ErrorAction SilentlyContinue

    gpupdate /force | Out-Null
    Archive-WinLabState -State $state

    Write-Host "Rollback WinLab conclu\xeddo. As contas locais foram preservadas." -ForegroundColor Green
    Write-Host "Reinicie o computador." -ForegroundColor Yellow
}
else {
    Write-Host "=== WinLab - PREVIEW do rollback ===" -ForegroundColor Cyan

    if (Test-Path $StatePath) {
        try {
            $state = Get-WinLabRollbackState
            Write-Host "Baseline AppLocker que seria restaurado: $($state.baselineAppLockerBackup)" -ForegroundColor Cyan
        }
        catch {
            Write-Warning $_.Exception.Message
        }
    }
    else {
        Write-Warning "Nenhum state.json encontrado; o modo -Apply recusar\xe1 executar para proteger pol\xedticas anteriores."
    }

    Write-Host "As pol\xedticas por usu\xe1rio gerenciadas pelo WinLab seriam removidas."
    Write-Host "As contas locais seriam preservadas."
    Write-Host "Nenhuma altera\xe7\xe3o foi aplicada." -ForegroundColor Green
    Write-Host "Para executar o rollback seguro, rode novamente com -Apply." -ForegroundColor Yellow
}
`},{name:"audit.ps1",content:`${E(e,"RELATÓRIO DE AUDITORIA")}
Assert-Administrator

Write-Host "=== WinLab - Auditoria AppLocker ===" -ForegroundColor Cyan
Write-Host "Perfil: ${e.profileName}"
Write-Host "Usu\xe1rio restrito: $Aluno"
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
`},{name:"liberar-wallpaper.ps1",content:(o=Math.max(5,Math.min(480,Math.round(e.wallpaperUnlockMinutes||90))),`${E(e,"LIBERAÇÃO TEMPORÁRIA DE WALLPAPER",`[CmdletBinding()]
param([switch]$Apply)`)}
$Minutos = ${o}

function Set-WallpaperLock {
    param([int]$Value)

    Invoke-WithUserHive -UserName $Aluno -Action {
        param($sid)

        $desktop = "Registry::HKEY_USERS\\$sid\\Software\\Microsoft\\Windows\\CurrentVersion\\Policies\\ActiveDesktop"
        New-Item -Path $desktop -Force | Out-Null
        New-ItemProperty -Path $desktop -Name NoChangingWallPaper -PropertyType DWord -Value $Value -Force | Out-Null
    }
}

if (-not $Apply) {
    Write-Host "=== WinLab - PREVIEW da libera\xe7\xe3o de wallpaper ===" -ForegroundColor Cyan
    Write-Host "Wallpaper seria liberado por $Minutos minutos para '$Aluno'."
    Write-Host "Nenhuma altera\xe7\xe3o foi aplicada." -ForegroundColor Green
    Write-Host "Para liberar, rode novamente com -Apply." -ForegroundColor Yellow
    return
}

Assert-Administrator
Assert-WinLabPackageIntegrity
Set-WallpaperLock -Value 0

$folder = "C:\\ProgramData\\WinLab"
New-Item -Path $folder -ItemType Directory -Force | Out-Null

$relock = @'
$ErrorActionPreference = "Stop"
$Aluno = ${L(e.studentUser)}
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
Write-Host "Rebloqueio autom\xe1tico: $($when.ToString('HH:mm'))." -ForegroundColor Cyan
Write-Host "Ponteiro e esquema de sons continuam bloqueados." -ForegroundColor Yellow
`)},{name:"verify.ps1",content:(a=e.allowedApps.map(e=>({label:r.APP_CATALOG[e].label,paths:r.APP_CATALOG[e].paths})).map(e=>`    @{
        Name = ${L(e.label)}
        Paths = ${R([...e.paths])}
    }`).join(",\n"),`${E(e,"VERIFICAÇÃO DO PC")}

Assert-Administrator

$KnownApps = @(
${a}
)
$CustomAllowedPaths = ${R(e.customAllowedPaths)}

function Write-Check {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Details
    )

    $status = if ($Ok) { "OK" } else { "ATEN\xc7\xc3O" }
    $color = if ($Ok) { "Green" } else { "Yellow" }
    Write-Host ("[{0}] {1} - {2}" -f $status, $Name, $Details) -ForegroundColor $color
}

Write-Host "=== WinLab - Verifica\xe7\xe3o da m\xe1quina ===" -ForegroundColor Cyan
Write-Host "Perfil: ${e.profileName}"
Write-Host ""

$os = Get-CimInstance Win32_OperatingSystem
Write-Host ("Computador: {0}" -f $env:COMPUTERNAME)
Write-Host ("Windows: {0}" -f $os.Caption)
Write-Host ("Vers\xe3o: {0}" -f $os.Version)
Write-Host ("Build: {0}" -f $os.BuildNumber)
Write-Host ("Arquitetura: {0}" -f $os.OSArchitecture)
Write-Host ""

$hasAppLocker = $null -ne (Get-Command Get-AppLockerPolicy -ErrorAction SilentlyContinue)
Write-Check "AppLocker" $hasAppLocker $(if ($hasAppLocker) { "cmdlets dispon\xedveis" } else { "cmdlets n\xe3o encontrados" })

$service = Get-Service AppIDSvc -ErrorAction SilentlyContinue
Write-Check "Application Identity" ($null -ne $service) $(if ($service) { "servi\xe7o encontrado: $($service.Status)" } else { "servi\xe7o n\xe3o encontrado" })

$student = Get-LocalUser -Name $Aluno -ErrorAction SilentlyContinue
$admin = Get-LocalUser -Name $Admin -ErrorAction SilentlyContinue
Write-Check "Conta restrita" ($null -ne $student -or ${w(e.createAccounts)}) $(if ($student) { "existe: $Aluno" } else { "ser\xe1 criada pelo setup: $Aluno" })
Write-Check "Conta administrativa" ($null -ne $admin -or ${w(e.createAccounts)}) $(if ($admin) { "existe: $Admin" } else { "ser\xe1 criada pelo setup: $Admin" })

Write-Host ""
Write-Host "=== Safety & Recovery ===" -ForegroundColor Cyan

$winLabRoot = "C:\\ProgramData\\WinLab"
$statePath = Join-Path $winLabRoot "state.json"

if (Test-Path $statePath) {
    try {
        $state = Get-Content -Path $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        Write-Check "state.json" $true ("status: {0}; aplica\xe7\xf5es: {1}" -f $state.status, $state.applyCount)

        $appLockerBaselineOk = $state.baselineAppLockerBackup -and (Test-Path ([string]$state.baselineAppLockerBackup))
        Write-Check "Baseline AppLocker" ([bool]$appLockerBaselineOk) $(if ($appLockerBaselineOk) { [string]$state.baselineAppLockerBackup } else { "ausente ou inv\xe1lido" })

        $registryBaselineOk = $state.registryBaselineDir -and (Test-Path ([string]$state.registryBaselineDir))
        Write-Check "Baseline de registro" ([bool]$registryBaselineOk) $(if ($registryBaselineOk) { [string]$state.registryBaselineDir } else { "ausente ou inv\xe1lido" })

        $task = Get-ScheduledTask -TaskName "WinLab-Apply-UserPolicies" -ErrorAction SilentlyContinue
        if ($state.userPoliciesDeferred) {
            Write-Check "Primeiro login" ($null -ne $task) $(if ($task) { "pol\xedticas HKCU pendentes; tarefa agendada" } else { "estado indica pend\xeancia, mas a tarefa n\xe3o foi encontrada" })
        }
        else {
            Write-Check "Primeiro login" ($null -eq $task) $(if ($task) { "tarefa ainda existe apesar de n\xe3o haver pend\xeancia" } else { "sem pend\xeancia" })
        }
    }
    catch {
        Write-Check "state.json" $false $_.Exception.Message
    }
}
else {
    Write-Check "state.json" $true "nenhuma aplica\xe7\xe3o WinLab registrada ainda"
}

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
        Write-Check $rawPath (Test-Path $expanded) $(if (Test-Path $expanded) { "encontrado" } else { "n\xe3o encontrado" })
    }
}

Write-Host ""
Write-Host "Use este relat\xf3rio antes de ativar o AppLocker em modo Enabled." -ForegroundColor Yellow
`)},{name:"preflight.ps1",content:b(e)},{name:"scan-pc.ps1",content:f()},{name:"maintenance.ps1",content:`${E(e,"MANUTENÇÃO E LIMPEZA DE PERFIS",`[CmdletBinding()]
param([switch]$Apply)`)}

Assert-Administrator

if ($Apply) {
    Assert-WinLabPackageIntegrity
}

$Mode = "${e.profileCleanupMode}"
$Days = ${e.profileCleanupDays}
$StorageWarningFreePercent = ${e.storageWarningFreePercent}

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

Write-Host "=== WinLab - Manuten\xe7\xe3o ===" -ForegroundColor Cyan
Write-Host ("Modo: {0}" -f $Mode)
Write-Host ("Perfis inativos: {0} dias" -f $Days)

if ($disk) {
    $freeGb = [math]::Round($disk.FreeSpace / 1GB, 1)
    $totalGb = [math]::Round($disk.Size / 1GB, 1)
    Write-Host ("Disco {0}: {1} GB livres de {2} GB ({3}%)" -f $disk.DeviceID, $freeGb, $totalGb, $freePercent)

    if ($freePercent -lt $StorageWarningFreePercent) {
        Write-Warning ("Espa\xe7o livre abaixo do limite configurado de {0}%." -f $StorageWarningFreePercent)
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
    Write-Host ("- {0} | \xfaltimo uso: {1}" -f $profile.LocalPath, $profile.LastUseTime)
}

$deleted = 0

if ($Mode -eq "Delete" -and $Apply -and $candidates.Count -gt 0) {
    Write-Warning "Modo Delete ativo: perfis candidatos ser\xe3o removidos. Valide em PC piloto e mantenha backup dos dados necess\xe1rios."

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
elseif ($Mode -eq "Delete" -and -not $Apply) {
    Write-Host "Modo Delete configurado, mas este foi apenas um PREVIEW. Nenhum perfil foi removido." -ForegroundColor Cyan
    Write-Host "Para permitir exclus\xf5es, rode novamente com -Apply." -ForegroundColor Yellow
}
elseif ($Mode -eq "ReportOnly") {
    Write-Host "Modo relat\xf3rio: nenhum perfil foi removido." -ForegroundColor Cyan
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
Write-Host ("Relat\xf3rio salvo em {0}" -f $reportPath) -ForegroundColor Cyan
`},{name:"config.json",content:(0,i.serializeConfig)(e)},{name:"README.txt",content:`WINLAB CONFIGURATOR
===================

Perfil: ${e.profileName}
Usu\xe1rio restrito: ${e.studentUser}
Administrador: ${e.adminUser}
AppLocker: ${"AuditOnly"===e.enforcementMode?"AUDITORIA":"BLOQUEIO ATIVO"}

ARQUIVOS
--------
setup.ps1
  Aplica contas, pol\xedticas por usu\xe1rio, Chrome/Edge, USB, personaliza\xe7\xe3o e AppLocker.

rollback.ps1
  Restaura o baseline AppLocker e as pol\xedticas por usu\xe1rio anteriores.
  Exige state.json e backups v\xe1lidos. As contas locais s\xe3o preservadas.

audit.ps1
  Mostra eventos recentes do AppLocker para validar o que seria bloqueado.

liberar-wallpaper.ps1
  Libera somente a troca de wallpaper por ${e.wallpaperUnlockMinutes} minutos.
  O bloqueio volta automaticamente.

verify.ps1
  Verifica Windows, AppLocker, contas e caminhos conhecidos dos aplicativos antes do setup.

preflight.ps1
  Diagn\xf3stico somente leitura. Gera PASS/WARN/BLOCK, readiness score e relat\xf3rio JSON
  para importar novamente no WinLab antes de executar setup.ps1 -Apply.

scan-pc.ps1
  Gera um invent\xe1rio JSON local com informa\xe7\xf5es do Windows, contas locais,
  AppLocker, armazenamento e programas instalados para importar no WinLab.
  N\xe3o coleta senhas, documentos ou hist\xf3rico do navegador.

maintenance.ps1
  Mostra espa\xe7o livre e perfis inativos. No modo Delete pode remover perfis
  n\xe3o carregados e antigos, preservando as contas Aluno/Admin configuradas.

verify-package.ps1
  Verifica SHA-256 e tamanho de todos os arquivos listados no manifest.

manifest.json
  Registra Package ID, vers\xe3o, gera\xe7\xe3o e hashes SHA-256.
  O manifesto verifica integridade, mas ainda n\xe3o fornece assinatura/autenticidade criptogr\xe1fica.

config.json
  Configura\xe7\xe3o versionada usada para gerar este pacote.
  Pode ser importada novamente no WinLab.

FLUXO RECOMENDADO
-----------------
1. Execute verify.ps1 como administrador e confira a m\xe1quina.
2. Gere inicialmente em modo AUDITORIA.
3. Execute setup.ps1 SEM -Apply para revisar o plano.
4. Quando estiver de acordo, execute setup.ps1 -Apply como administrador.
5. Reinicie.
6. Use normalmente a conta ${e.studentUser}.
7. Execute audit.ps1 e confira os eventos.
8. Ajuste a allowlist no WinLab.
9. Gere novamente em modo BLOQUEIO ATIVO.
10. Revise o preview e s\xf3 ent\xe3o execute o novo setup.ps1 -Apply.

INTEGRIDADE DO PACOTE
---------------------
Antes de usar um ZIP completo, execute verify-package.ps1.
Quando manifest.json est\xe1 presente, scripts mut\xe1veis tamb\xe9m conferem a integridade antes de -Apply.
Um script baixado isoladamente continua funcionando, mas sem a garantia de integridade do pacote.

SEGURAN\xc7A DE EXECU\xc7\xc3O
---------------------
setup.ps1, rollback.ps1 e liberar-wallpaper.ps1 n\xe3o alteram o Windows sem -Apply.
maintenance.ps1 pode gerar relat\xf3rio sem -Apply; exclus\xf5es no modo Delete exigem -Apply.

SAFETY & RECOVERY
-----------------
Antes de aplicar, setup.ps1 executa um preflight e interrompe se a m\xe1quina n\xe3o estiver pronta.

Na primeira aplica\xe7\xe3o, o WinLab preserva:
- AppLocker local em C:\\ProgramData\\WinLab\\Backups\\AppLocker-Baseline-*.xml
- pol\xedticas HKCU existentes em C:\\ProgramData\\WinLab\\Backups\\Registry-Baseline-*
- estado em C:\\ProgramData\\WinLab\\state.json

Reaplica\xe7\xf5es preservam o baseline original.

Se o perfil do usu\xe1rio restrito ainda n\xe3o existir, as pol\xedticas por usu\xe1rio ficam pendentes
e s\xe3o conclu\xeddas no primeiro logon por uma tarefa tempor\xe1ria.

rollback.ps1 -Apply s\xf3 executa se state.json e o baseline AppLocker forem v\xe1lidos.
Ele restaura os baselines anteriores e arquiva o estado em C:\\ProgramData\\WinLab\\History.

CONTAS LOCAIS
-------------
${e.allowLocalAccountManagement?"A página Contas > Outros usuários fica disponível para a conta restrita. Criar ou remover contas continua exigindo credencial administrativa.":"A página Contas > Outros usuários fica oculta para a conta restrita."}

WEB
---
Modo: ${e.browserUrlMode}
Bloqueados: ${e.blockedUrls.join(", ")||"nenhum"}
Permitidos/exce\xe7\xf5es: ${e.allowedUrls.join(", ")||"nenhum"}

USB
---
Leitura: ${e.blockUsbRead?"bloqueada":"permitida"}
Grava\xe7\xe3o: ${e.blockUsbWrite?"bloqueada":"permitida"}
Execu\xe7\xe3o: ${e.blockUsbExecute?"bloqueada via AppLocker":"permitida pela regra WinLab"}

MANUTEN\xc7\xc3O
----------
Modo: ${e.profileCleanupMode}
Perfis inativos ap\xf3s: ${e.profileCleanupDays} dias
Alerta de armazenamento: abaixo de ${e.storageWarningFreePercent}% livre

Nenhuma senha \xe9 armazenada nos arquivos.
`},{name:"verify-package.ps1",content:`#requires -version 5.1
[CmdletBinding()]
param(
    [string]$PackageRoot = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$manifestPath = Join-Path $PackageRoot "manifest.json"

if (-not (Test-Path $manifestPath)) {
    Write-Error "manifest.json n\xe3o encontrado em '$PackageRoot'."
    exit 1
}

try {
    $manifest = Get-Content -Path $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
}
catch {
    Write-Error ("manifest.json inv\xe1lido: " + $_.Exception.Message)
    exit 1
}

if ($manifest.schemaVersion -ne 1) {
    Write-Error ("Vers\xe3o de manifesto n\xe3o suportada: " + $manifest.schemaVersion)
    exit 1
}

if ($manifest.integrity.algorithm -ne "SHA-256") {
    Write-Error ("Algoritmo de integridade n\xe3o suportado: " + $manifest.integrity.algorithm)
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
    Write-Host "Nota: os hashes verificam integridade, n\xe3o autenticidade/assinatura do pacote." -ForegroundColor Yellow
}
`},...t?.extraFiles??[]],s=await B(e,n,t);return[...n,{name:"manifest.json",content:JSON.stringify(s,null,2)+"\n"}]}var D=e.i(95018);function O(e,t){let o=[];for(let t of(0,D.getConfigErrors)(e))o.push({id:`config.${t.field}`,label:"Configuração",status:"BLOCK",message:t.message});if(t){t.computerName.trim()?o.push({id:"preflight.computer",label:"Máquina alvo",status:"PASS",message:`Pacote piloto ficar\xe1 associado a ${t.computerName}.`}):o.push({id:"preflight.computer",label:"Máquina alvo",status:"BLOCK",message:"O relatório não informa o nome do computador."}),t.profileName!==e.profileName?o.push({id:"preflight.profile",label:"Perfil",status:"BLOCK",message:`O preflight foi gerado para "${t.profileName}", mas a configura\xe7\xe3o atual \xe9 "${e.profileName}".`}):o.push({id:"preflight.profile",label:"Perfil",status:"PASS",message:"O preflight corresponde ao perfil atual."}),"BLOCK"===t.status||t.summary.block>0?o.push({id:"preflight.blockers",label:"Bloqueios do preflight",status:"BLOCK",message:`${t.summary.block} bloqueio(s) precisam ser resolvidos antes do piloto.`}):o.push({id:"preflight.blockers",label:"Bloqueios do preflight",status:"PASS",message:"Nenhum BLOCK reportado."}),t.summary.warn>0?o.push({id:"preflight.warnings",label:"Avisos do preflight",status:"WARN",message:`${t.summary.warn} aviso(s) permanecem para revis\xe3o.`}):o.push({id:"preflight.warnings",label:"Avisos do preflight",status:"PASS",message:"Nenhum WARN reportado."}),t.summary.score<70?o.push({id:"preflight.score",label:"Readiness score",status:"WARN",message:`Score ${t.summary.score}/100 \xe9 baixo para um piloto; revise os avisos.`}):o.push({id:"preflight.score",label:"Readiness score",status:"PASS",message:`Score ${t.summary.score}/100.`});let a=Date.parse(t.generatedAt);if(Number.isFinite(a)){let e=Math.max(0,(Date.now()-a)/864e5);e>7?o.push({id:"preflight.age",label:"Atualidade do preflight",status:"WARN",message:`Relat\xf3rio tem aproximadamente ${Math.floor(e)} dia(s). Considere executar novamente.`}):o.push({id:"preflight.age",label:"Atualidade do preflight",status:"PASS",message:"Relatório recente."})}else o.push({id:"preflight.age",label:"Atualidade do preflight",status:"WARN",message:"Data do relatório não pôde ser validada."})}else o.push({id:"preflight.required",label:"Preflight",status:"BLOCK",message:"Importe um relatório de preflight desta máquina antes de gerar o pacote piloto."});for(let t of(0,v.getConfigReview)(e).filter(e=>"warning"===e.level))o.push({id:`review.${o.length}`,label:"Revisão da configuração",status:"WARN",message:t.text});"Enabled"===e.enforcementMode?o.push({id:"pilot.auditOnly",label:"AppLocker do piloto",status:"PASS",message:"A configuração original está em Enabled, mas o pacote piloto será forçado para AuditOnly."}):o.push({id:"pilot.auditOnly",label:"AppLocker do piloto",status:"PASS",message:"Pacote piloto usará AuditOnly."}),"Delete"===e.profileCleanupMode?o.push({id:"pilot.cleanup",label:"Limpeza de perfis",status:"PASS",message:"O pacote piloto substituirá Delete por ReportOnly."}):o.push({id:"pilot.cleanup",label:"Limpeza de perfis",status:"PASS",message:"Pacote piloto não excluirá perfis."});let a=o.some(e=>"BLOCK"===e.status),r=o.some(e=>"WARN"===e.status);return{status:a?"BLOCKED":r?"READY_WITH_WARNINGS":"READY",targetComputerName:t?.computerName||null,effectiveOverrides:{enforcementMode:"AuditOnly",profileCleanupMode:"ReportOnly"},gates:o}}async function T(e,t){let o=O(e,t);if("BLOCKED"===o.status)throw Error("O pacote piloto não pode ser gerado enquanto houver gates BLOCK.");let a={...e,enforcementMode:"AuditOnly",profileCleanupMode:"ReportOnly"},r=[{name:"PILOT-DEPLOYMENT-CHECKLIST.txt",content:`WINLAB 0.9 — CHECKLIST DE PILOTO
================================

Package target: ${t.computerName}
Perfil: ${e.profileName}
Readiness: ${o.status}
Score do preflight: ${t.summary.score}/100

ALTERA\xc7\xd5ES DE SEGURAN\xc7A DO PILOTO
---------------------------------
- AppLocker: AuditOnly, mesmo que a configura\xe7\xe3o original esteja em Enabled.
- Limpeza de perfis: ReportOnly, mesmo que a configura\xe7\xe3o original esteja em Delete.
- O restante das pol\xedticas configuradas permanece para valida\xe7\xe3o.

ANTES
-----
[ ] Confirmar que este \xe9 o computador ${t.computerName}.
[ ] Manter uma conta administrativa funcional.
[ ] Extrair TODO o ZIP para uma pasta local.
[ ] N\xe3o executar diretamente de dentro do ZIP.
[ ] Executar verify-package.ps1 e exigir PASS.
[ ] Executar preflight.ps1 e confirmar que n\xe3o existem BLOCKs.
[ ] Revisar todos os WARNs.
[ ] Executar setup.ps1 sem -Apply e revisar o preview.

APLICA\xc7\xc3O
---------
[ ] Abrir PowerShell como administrador.
[ ] Executar .\\setup.ps1 -Apply.
[ ] Confirmar que o setup terminou sem RecoveryFailed.
[ ] Reiniciar o computador.
[ ] Fazer login na conta restrita se houver pol\xedticas de primeiro login pendentes.

P\xd3S-APLICA\xc7\xc3O
-------------
[ ] Executar verify.ps1.
[ ] Testar Chrome/Edge.
[ ] Testar Office/Power BI/apps permitidos.
[ ] Testar documentos em USB.
[ ] Tentar executar um EXE em USB e conferir o audit do AppLocker.
[ ] Conferir sites permitidos/bloqueados.
[ ] Executar audit.ps1.
[ ] Executar maintenance.ps1 SEM -Apply.
[ ] Conferir C:\\ProgramData\\WinLab\\state.json e backups.

DECIS\xc3O
-------
[ ] PASS: manter a m\xe1quina em piloto e analisar logs.
[ ] FAIL: executar o checklist de rollback.
`},{name:"PILOT-ROLLBACK-CHECKLIST.txt",content:`WINLAB 0.9 — CHECKLIST DE ROLLBACK DO PILOTO
============================================

M\xe1quina: ${t.computerName}
Perfil: ${e.profileName}

ANTES
-----
[ ] N\xe3o apagar C:\\ProgramData\\WinLab.
[ ] N\xe3o apagar Backups, History ou state.json manualmente.
[ ] Manter a conta administrativa acess\xedvel.
[ ] Executar rollback.ps1 sem -Apply e revisar o baseline que ser\xe1 restaurado.

ROLLBACK
--------
[ ] Abrir PowerShell como administrador.
[ ] Executar .\\rollback.ps1 -Apply.
[ ] Confirmar restaura\xe7\xe3o do baseline AppLocker.
[ ] Confirmar restaura\xe7\xe3o do baseline de registro.
[ ] Confirmar arquivamento do state.json em History.
[ ] Reiniciar o computador.

DEPOIS
------
[ ] Confirmar login administrativo.
[ ] Confirmar funcionamento dos aplicativos anteriores.
[ ] Confirmar que pol\xedticas anteriores do navegador foram restauradas.
[ ] Registrar o motivo do rollback antes de alterar a configura\xe7\xe3o.
`},{name:"pilot-readiness.json",content:JSON.stringify(o,null,2)+"\n"},{name:"preflight-source.json",content:JSON.stringify(t,null,2)+"\n"}];return I(a,{channel:"pilot",targetComputerName:t.computerName,extraFiles:r})}let M=new TextEncoder;function F(e){return new Uint8Array(e)}function G(e,t,o){e.setUint16(t,o,!0)}function H(e,t,o){e.setUint32(t,o>>>0,!0)}function q(e){var t;let o,a=(o=Math.max(1980,(t=new Date).getFullYear()),{time:t.getHours()<<11|t.getMinutes()<<5|Math.floor(t.getSeconds()/2),date:o-1980<<9|t.getMonth()+1<<5|t.getDate()}),r=[],i=[],n=0;for(let t of e){let e=M.encode(t.name),o=M.encode(t.content),s=function(e){let t=0xffffffff;for(let o of e){t^=o;for(let e=0;e<8;e++)t=t>>>1^0xedb88320&-(1&t)}return(0xffffffff^t)>>>0}(o),l=F(30),c=new DataView(l.buffer);H(c,0,0x4034b50),G(c,4,20),G(c,6,2048),G(c,8,0),G(c,10,a.time),G(c,12,a.date),H(c,14,s),H(c,18,o.length),H(c,22,o.length),G(c,26,e.length),G(c,28,0),i.push({name:e,data:o,crc:s,offset:n}),r.push(l,e,o),n+=l.length+e.length+o.length}let s=[],l=0;for(let e of i){let t=F(46),o=new DataView(t.buffer);H(o,0,0x2014b50),G(o,4,20),G(o,6,20),G(o,8,2048),G(o,10,0),G(o,12,a.time),G(o,14,a.date),H(o,16,e.crc),H(o,20,e.data.length),H(o,24,e.data.length),G(o,28,e.name.length),G(o,30,0),G(o,32,0),G(o,34,0),G(o,36,0),H(o,38,0),H(o,42,e.offset),s.push(t,e.name),l+=t.length+e.name.length}let c=F(22),d=new DataView(c.buffer);H(d,0,0x6054b50),G(d,4,0),G(d,6,0),G(d,8,i.length),G(d,10,i.length),H(d,12,l),H(d,16,n),G(d,20,0);let u=function(e){let t=new Uint8Array(e.reduce((e,t)=>e+t.length,0)),o=0;for(let a of e)t.set(a,o),o+=a.length;return t}([...r,...s,c]),p=new ArrayBuffer(u.byteLength);return new Uint8Array(p).set(u),new Blob([p],{type:"application/zip"})}function V(e,t){let o=URL.createObjectURL(t),a=document.createElement("a");a.href=o,a.download=e,a.click(),URL.revokeObjectURL(o)}function K(e,t,o="text/plain"){V(e,new Blob([t],{type:o}))}function _({name:e,description:o}){return(0,t.jsxs)("div",{className:"file",children:[(0,t.jsx)("code",{children:e}),(0,t.jsx)("span",{children:o})]})}function J({label:e,value:o,onChange:a}){return(0,t.jsxs)("label",{className:"toggleRow",children:[(0,t.jsx)("span",{children:e}),(0,t.jsx)("button",{type:"button","aria-pressed":o,className:o?"switch on":"switch",onClick:()=>a(!o),children:(0,t.jsx)("span",{})})]})}e.s(["default",0,function(){let e,[h,y]=(0,a.useState)(()=>(0,k.getPreset)("microlins")),[C,w]=(0,a.useState)("microlins"),[L,R]=(0,a.useState)(""),[E,j]=(0,a.useState)(null),[U,B]=(0,a.useState)(null),[M,F]=(0,a.useState)(null),[G,H]=(0,a.useState)(""),[z,Y]=(0,a.useState)(null),[X,Q]=(0,a.useState)(null),Z=(0,a.useMemo)(()=>W(h),[h]),ee=(0,a.useMemo)(()=>(0,v.getConfigReview)(h),[h]),et=(0,a.useMemo)(()=>(0,D.getConfigErrors)(h),[h]),eo=(0,a.useMemo)(()=>O(h,z),[h,z]),ea=U?m(U):[],er=U?$(U,h):[],ei=U?(e=G.trim().toLowerCase())?U.installedApps.filter(t=>[t.name,t.publisher,t.installLocation].filter(Boolean).some(t=>t.toLowerCase().includes(e))).slice(0,40):U.installedApps.slice(0,40):[],en=h.customAllowedPaths.map(e=>({path:e,warning:(0,N.pathRisk)(e)})).filter(e=>e.warning);function es(e,t){w(null),y(o=>({...o,[e]:t}))}function el(){let e=L.trim();e&&(h.customAllowedPaths.includes(e)||es("customAllowedPaths",[...h.customAllowedPaths,e]),R(""))}async function ec(e){if(e)try{let t=(0,i.parseConfigJson)(await e.text());y(t),w(null),j(`Configura\xe7\xe3o importada: ${e.name}`)}catch(e){j(e instanceof Error?e.message:"Não foi possível importar o arquivo.")}}async function ed(e){if(e)try{let t=function(e){let t;try{t=JSON.parse(e)}catch{throw Error("O inventário não contém JSON válido.")}if(!n(t))throw Error("O inventário precisa conter um objeto JSON.");if(1!==t.schemaVersion)throw Error("Versão de inventário não suportada.");if(!n(t.windows)||!n(t.appLocker))throw Error("Inventário incompleto: Windows ou AppLocker ausente.");let o=s(t.computerName).trim();if(!o)throw Error("Inventário sem nome do computador.");return{schemaVersion:1,generatedAt:s(t.generatedAt),computerName:o,windows:{caption:s(t.windows.caption),version:s(t.windows.version),buildNumber:s(t.windows.buildNumber),architecture:s(t.windows.architecture)},appLocker:{available:!0===t.appLocker.available,applicationIdentityStatus:l(t.appLocker.applicationIdentityStatus)},storage:n(t.storage)?{systemDrive:s(t.storage.systemDrive),sizeGB:c(t.storage.sizeGB),freeGB:c(t.storage.freeGB),freePercent:c(t.storage.freePercent)}:null,localUsers:Array.isArray(t.localUsers)?t.localUsers.map(d).filter(e=>!!e):[],knownApps:Array.isArray(t.knownApps)?t.knownApps.map(u).filter(e=>!!e):[],installedApps:Array.isArray(t.installedApps)?t.installedApps.map(p).filter(e=>!!e):[]}}(await e.text());B(t),F(`Invent\xe1rio carregado: ${t.computerName}`)}catch(e){B(null),F(e instanceof Error?e.message:"Não foi possível importar o inventário.")}}async function eu(e){if(e)try{let t=function(e){let t;try{t=JSON.parse(e)}catch{throw Error("O relatório de preflight não contém JSON válido.")}if(!g(t)||1!==t.schemaVersion)throw Error("Relatório de preflight incompatível.");if(!g(t.windows)||!g(t.summary))throw Error("Relatório de preflight incompleto.");let o=Array.isArray(t.checks)?t.checks.map(S).filter(e=>!!e):[];return{schemaVersion:1,generatedAt:A(t.generatedAt),computerName:A(t.computerName),profileName:A(t.profileName),windows:{caption:A(t.windows.caption),version:A(t.windows.version),buildNumber:A(t.windows.buildNumber),architecture:A(t.windows.architecture)},status:x(t.status),summary:{score:Math.max(0,Math.min(100,Math.round(P(t.summary.score)))),pass:Math.max(0,Math.round(P(t.summary.pass))),warn:Math.max(0,Math.round(P(t.summary.warn))),block:Math.max(0,Math.round(P(t.summary.block)))},checks:o}}(await e.text());Y(t),Q(`Preflight carregado: ${t.computerName||e.name}`)}catch(e){Y(null),Q(e instanceof Error?e.message:"Não foi possível importar o preflight.")}}async function ep(){if(et.length>0)return;let e=q(await I(h)),t=h.profileName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"winlab";V(`winlab-${t}.zip`,e)}async function em(){if(!z||"BLOCKED"===eo.status)return;let e=q(await T(h,z)),t=h.profileName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"winlab",o=z.computerName.toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-|-$/g,"")||"pc";V(`winlab-${t}-pilot-${o}.zip`,e)}return(0,t.jsxs)("main",{children:[(0,t.jsxs)("header",{className:"hero",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{className:"eyebrow",children:"WinLab Configurator · MVP 0.9"}),(0,t.jsx)("h1",{children:"Configure o Windows sem configurar máquina por máquina."}),(0,t.jsx)("p",{className:"subtitle",children:"Escolha um preset, ajuste as políticas e gere um pacote portátil com setup, rollback, auditoria e configuração reutilizável."})]}),(0,t.jsxs)("div",{style:{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"},children:[(0,t.jsx)(o.default,{href:"/desktop",className:"secondary",style:{textDecoration:"none",display:"inline-flex",alignItems:"center",gap:6,padding:"13px 16px",fontWeight:700},children:"🖥️ WinLab Desktop"}),(0,t.jsx)("button",{className:"primary",onClick:ep,disabled:et.length>0,title:et.length?"Corrija os erros de configuração antes de gerar o pacote.":void 0,children:"Gerar pacote .zip"})]})]}),(0,t.jsx)("section",{className:"presetBar","aria-label":"Presets",children:k.presets.map(e=>(0,t.jsxs)("button",{className:C===e.id?"preset active":"preset",onClick:()=>{var t;w(t=e.id),y((0,k.getPreset)(t))},children:[(0,t.jsx)("strong",{children:e.name}),(0,t.jsx)("span",{children:e.description})]},e.id))}),(0,t.jsxs)("section",{className:"importBar",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:"Reutilizar configuração"}),(0,t.jsx)("span",{children:"Importe um config.json gerado anteriormente e continue de onde parou."})]}),(0,t.jsxs)("label",{className:"importButton",children:["Importar config.json",(0,t.jsx)("input",{type:"file",accept:".json,application/json",onChange:e=>ec(e.target.files?.[0])})]}),E&&(0,t.jsx)("p",{className:"importStatus",children:E})]}),(0,t.jsxs)("section",{className:"inventoryPanel",children:[(0,t.jsxs)("div",{className:"inventoryIntro",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{className:"eyebrow",children:"Analisar este PC"}),(0,t.jsx)("h2",{children:"Descubra o que já existe na máquina antes de configurar."}),(0,t.jsx)("p",{children:"Baixe o scanner, execute no Windows e importe o JSON gerado. O WinLab usa o inventário somente no seu navegador."})]}),(0,t.jsxs)("div",{className:"inventoryActions",children:[(0,t.jsx)("button",{className:"secondary",onClick:()=>K("scan-pc.ps1",f()),children:"Baixar scan-pc.ps1"}),(0,t.jsxs)("label",{className:"importButton",children:["Importar inventário",(0,t.jsx)("input",{type:"file",accept:".json,application/json",onChange:e=>ed(e.target.files?.[0])})]})]})]}),M&&(0,t.jsx)("p",{className:"importStatus",children:M}),U&&(0,t.jsxs)("div",{className:"inventoryResults",children:[(0,t.jsxs)("div",{className:"machineSummary",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("span",{children:"Computador"}),(0,t.jsx)("strong",{children:U.computerName})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("span",{children:"Windows"}),(0,t.jsx)("strong",{children:U.windows.caption||"Não identificado"}),(0,t.jsxs)("small",{children:["Build ",U.windows.buildNumber||"?"]})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("span",{children:"AppLocker"}),(0,t.jsx)("strong",{children:U.appLocker.available?"Disponível":"Não detectado"}),(0,t.jsxs)("small",{children:["Application Identity: ",U.appLocker.applicationIdentityStatus??"?"]})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("span",{children:"Programas registrados"}),(0,t.jsx)("strong",{children:U.installedApps.length})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("span",{children:"Armazenamento"}),(0,t.jsx)("strong",{children:U.storage?`${U.storage.freeGB} GB livres`:"Não informado"}),U.storage&&(0,t.jsxs)("small",{children:[U.storage.freePercent,"% de ",U.storage.sizeGB," GB"]})]})]}),(0,t.jsxs)("div",{className:"inventoryColumns",children:[(0,t.jsxs)("div",{children:[(0,t.jsxs)("div",{className:"sectionHeading",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{children:"Apps reconhecidos"}),(0,t.jsxs)("p",{children:[ea.length," encontrado(s) no catálogo."]})]}),er.length>0&&(0,t.jsxs)("button",{className:"secondary",onClick:function(){U&&(w(null),y(e=>{let t;return t=$(U,e),{...e,allowedApps:[...e.allowedApps,...t]}}))},children:["Adicionar ",er.length," à allowlist"]})]}),(0,t.jsx)("div",{className:"detectedApps",children:ea.length?ea.map(e=>(0,t.jsxs)("div",{className:"detectedApp",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:e.label}),(0,t.jsx)("small",{children:e.path??"Caminho não informado"})]}),(0,t.jsx)("span",{className:h.allowedApps.includes(e.id)?"status allowed":"status detected",children:h.allowedApps.includes(e.id)?"Permitido":"Detectado"})]},e.id)):(0,t.jsx)("p",{className:"muted",children:"Nenhum app do catálogo foi detectado."})})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("div",{className:"sectionHeading",children:(0,t.jsxs)("div",{children:[(0,t.jsx)("h3",{children:"Programas instalados"}),(0,t.jsx)("p",{children:"Consulta do registro do Windows."})]})}),(0,t.jsx)("input",{className:"inventorySearch",placeholder:"Buscar programa ou fabricante...",value:G,onChange:e=>H(e.target.value)}),(0,t.jsx)("div",{className:"installedApps",children:ei.map(e=>(0,t.jsxs)("div",{className:"installedApp",children:[(0,t.jsx)("strong",{children:e.name}),(0,t.jsx)("span",{children:[e.version,e.publisher].filter(Boolean).join(" · ")||"Sem detalhes"})]},`${e.name}-${e.version??""}`))})]})]}),(0,t.jsxs)("div",{className:"localUsers",children:[(0,t.jsx)("h3",{children:"Contas locais"}),(0,t.jsx)("div",{className:"userChips",children:U.localUsers.map(e=>(0,t.jsxs)("span",{className:e.isAdministrator?"userChip admin":"userChip",children:[e.name,e.isAdministrator?" · admin":"",e.enabled?"":" · desativada"]},e.name))})]})]})]}),(0,t.jsxs)("section",{className:"readinessPanel",children:[(0,t.jsxs)("div",{className:"readinessIntro",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{className:"eyebrow",children:"Diagnostics & Readiness"}),(0,t.jsx)("h2",{children:"Saiba se a máquina está pronta antes de aplicar."}),(0,t.jsx)("p",{children:"Execute o preflight no Windows. Ele não altera contas nem políticas e gera um relatório PASS / WARN / BLOCK para importar aqui."})]}),(0,t.jsxs)("div",{className:"inventoryActions",children:[(0,t.jsx)("button",{className:"secondary",onClick:()=>K("preflight.ps1",b(h)),children:"Baixar preflight.ps1"}),(0,t.jsxs)("label",{className:"importButton",children:["Importar preflight",(0,t.jsx)("input",{type:"file",accept:".json,application/json",onChange:e=>eu(e.target.files?.[0])})]})]})]}),X&&(0,t.jsx)("p",{className:"importStatus",children:X}),z&&(0,t.jsxs)("div",{className:"readinessResults",children:[(0,t.jsxs)("div",{className:"readinessScore",children:[(0,t.jsxs)("div",{className:`scoreCircle ${z.status.toLowerCase()}`,children:[(0,t.jsx)("strong",{children:z.summary.score}),(0,t.jsx)("span",{children:"/100"})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("span",{className:`readinessBadge ${z.status.toLowerCase()}`,children:z.status}),(0,t.jsx)("h3",{children:"BLOCK"!==z.status&&0===z.summary.block?"Máquina sem bloqueios críticos":"Máquina ainda não está pronta"}),(0,t.jsxs)("p",{children:[z.summary.pass," PASS · ",z.summary.warn," WARN ·"," ",z.summary.block," BLOCK"]})]})]}),(0,t.jsx)("div",{className:"readinessChecks",children:z.checks.map(e=>(0,t.jsxs)("div",{className:"readinessCheck",children:[(0,t.jsx)("span",{className:`checkStatus ${e.status.toLowerCase()}`,children:e.status}),(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:e.label}),(0,t.jsx)("p",{children:e.message})]})]},e.id))})]})]}),(0,t.jsxs)("section",{className:"pilotPanel",children:[(0,t.jsxs)("div",{className:"pilotHeader",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("p",{className:"eyebrow",children:"0.9 · Pilot Candidate"}),(0,t.jsx)("h2",{children:"Gate final antes do primeiro PC real."}),(0,t.jsx)("p",{children:"O pacote piloto sempre usa AppLocker AuditOnly e manutenção ReportOnly. BLOCK impede a geração; WARN exige revisão, mas não impede."})]}),(0,t.jsx)("button",{className:"primary",disabled:!z||"BLOCKED"===eo.status,onClick:em,children:"Gerar pacote piloto"})]}),(0,t.jsxs)("div",{className:"pilotSummary",children:[(0,t.jsx)("span",{className:`pilotState ${eo.status.toLowerCase()}`,children:eo.status.replaceAll("_"," ")}),(0,t.jsxs)("span",{children:["Alvo: ",eo.targetComputerName??"preflight não importado"]}),(0,t.jsx)("span",{children:"AppLocker efetivo: AuditOnly"}),(0,t.jsx)("span",{children:"Limpeza efetiva: ReportOnly"})]}),(0,t.jsx)("div",{className:"pilotGates",children:eo.gates.map(e=>(0,t.jsxs)("div",{className:"pilotGate",children:[(0,t.jsx)("span",{className:`checkStatus ${e.status.toLowerCase()}`,children:e.status}),(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:e.label}),(0,t.jsx)("p",{children:e.message})]})]},e.id))})]}),(0,t.jsxs)("div",{className:"grid",children:[(0,t.jsxs)("section",{className:"panel",children:[(0,t.jsx)("h2",{children:"Identidade"}),(0,t.jsxs)("label",{children:["Nome do perfil",(0,t.jsx)("input",{value:h.profileName,onChange:e=>es("profileName",e.target.value)})]}),(0,t.jsxs)("div",{className:"two",children:[(0,t.jsxs)("label",{children:["Usuário restrito",(0,t.jsx)("input",{value:h.studentUser,onChange:e=>es("studentUser",e.target.value)})]}),(0,t.jsxs)("label",{children:["Administrador",(0,t.jsx)("input",{value:h.adminUser,onChange:e=>es("adminUser",e.target.value)})]})]}),(0,t.jsx)(J,{label:"Criar/ajustar as contas automaticamente",value:h.createAccounts,onChange:e=>es("createAccounts",e)}),et.length>0&&(0,t.jsxs)("div",{className:"validationErrors",role:"alert",children:[(0,t.jsx)("strong",{children:"Corrija antes de gerar"}),et.map((e,o)=>(0,t.jsx)("span",{children:e.message},`${e.field}-${o}`))]})]}),(0,t.jsxs)("section",{className:"panel important",children:[(0,t.jsx)("h2",{children:"Modo de implantação"}),(0,t.jsxs)("label",{children:["AppLocker",(0,t.jsxs)("select",{value:h.enforcementMode,onChange:e=>es("enforcementMode",e.target.value),children:[(0,t.jsx)("option",{value:"AuditOnly",children:"Auditoria — não bloqueia ainda"}),(0,t.jsx)("option",{value:"Enabled",children:"Bloqueio ativo"})]})]}),(0,t.jsx)("p",{className:"notice",children:"AuditOnly"===h.enforcementMode?"Recomendado no primeiro teste: o Windows registra o que seria bloqueado sem interromper a aula.":"Bloqueio real ativado. Use somente depois de validar a allowlist em um PC piloto."})]}),(0,t.jsxs)("section",{className:"panel",children:[(0,t.jsx)("h2",{children:"Aplicativos permitidos"}),(0,t.jsx)("p",{className:"muted",children:"O usuário restrito recebe uma allowlist. O administrador continua irrestrito."}),(0,t.jsx)("div",{className:"apps",children:Object.keys(r.APP_CATALOG).map(e=>(0,t.jsxs)("button",{className:h.allowedApps.includes(e)?"app active":"app",onClick:()=>{es("allowedApps",h.allowedApps.includes(e)?h.allowedApps.filter(t=>t!==e):[...h.allowedApps,e])},children:[(0,t.jsx)("span",{children:h.allowedApps.includes(e)?"✓":"+"}),r.APP_CATALOG[e].label]},e))}),(0,t.jsxs)("div",{className:"custom",children:[(0,t.jsx)("input",{placeholder:"C:\\Program Files\\Aplicativo\\app.exe",value:L,onChange:e=>R(e.target.value),onKeyDown:e=>"Enter"===e.key&&el()}),(0,t.jsx)("button",{onClick:el,children:"Adicionar"})]}),h.customAllowedPaths.length>0&&(0,t.jsx)("ul",{className:"paths",children:h.customAllowedPaths.map(e=>{let o=(0,N.pathRisk)(e);return(0,t.jsxs)("li",{className:o?"path risky":"path",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("code",{children:e}),o&&(0,t.jsx)("small",{children:o})]}),(0,t.jsx)("button",{onClick:()=>es("customAllowedPaths",h.customAllowedPaths.filter(t=>t!==e)),children:"remover"})]},e)})})]}),(0,t.jsxs)("section",{className:"panel",children:[(0,t.jsx)("h2",{children:"Windows"}),(0,t.jsx)(J,{label:"Bloquear instaladores MSI",value:h.blockInstallers,onChange:e=>es("blockInstallers",e)}),(0,t.jsx)(J,{label:"Bloquear apps empacotados / Microsoft Store",value:h.blockStoreApps,onChange:e=>es("blockStoreApps",e)}),(0,t.jsx)(J,{label:"Bloquear CMD",value:h.blockCmd,onChange:e=>es("blockCmd",e)}),(0,t.jsx)(J,{label:"Bloquear PowerShell",value:h.blockPowerShell,onChange:e=>es("blockPowerShell",e)}),(0,t.jsx)(J,{label:"Bloquear Regedit",value:h.blockRegedit,onChange:e=>es("blockRegedit",e)}),(0,t.jsx)(J,{label:"Permitir adicionar contas locais (continua exigindo credencial de administrador)",value:h.allowLocalAccountManagement,onChange:e=>es("allowLocalAccountManagement",e)})]}),(0,t.jsxs)("section",{className:"panel",children:[(0,t.jsx)("h2",{children:"Google Chrome · somente usuário restrito"}),(0,t.jsx)(J,{label:"Bloquear extensões",value:h.blockChromeExtensions,onChange:e=>es("blockChromeExtensions",e)}),(0,t.jsx)(J,{label:"Bloquear modo convidado",value:h.blockChromeGuest,onChange:e=>es("blockChromeGuest",e)}),(0,t.jsx)(J,{label:"Bloquear novos perfis",value:h.blockChromeNewProfiles,onChange:e=>es("blockChromeNewProfiles",e)}),(0,t.jsx)(J,{label:"Bloquear modo anônimo",value:h.blockChromeIncognito,onChange:e=>es("blockChromeIncognito",e)}),(0,t.jsx)(J,{label:"Bloquear novas senhas",value:h.blockChromePasswordManager,onChange:e=>es("blockChromePasswordManager",e)})]}),(0,t.jsxs)("section",{className:"panel",children:[(0,t.jsx)("h2",{children:"Sites · Chrome e Edge"}),(0,t.jsxs)("label",{children:["Regra de navegação",(0,t.jsxs)("select",{value:h.browserUrlMode,onChange:e=>es("browserUrlMode",e.target.value),children:[(0,t.jsx)("option",{value:"Unrestricted",children:"Sem restrição por URL"}),(0,t.jsx)("option",{value:"BlockList",children:"Bloquear sites específicos"}),(0,t.jsx)("option",{value:"AllowListOnly",children:"Permitir somente sites da lista"})]})]}),"BlockList"===h.browserUrlMode&&(0,t.jsxs)("label",{className:"textAreaField",children:["Sites bloqueados · um por linha",(0,t.jsx)("textarea",{rows:5,placeholder:"youtube.com\nroblox.com\n*.exemplo.com",value:h.blockedUrls.join("\n"),onChange:e=>es("blockedUrls",e.target.value.split("\n").map(e=>e.trim()).filter(Boolean))})]}),"Unrestricted"!==h.browserUrlMode&&(0,t.jsxs)("label",{className:"textAreaField",children:["AllowListOnly"===h.browserUrlMode?"Sites permitidos · um por linha":"Exceções permitidas · um por linha",(0,t.jsx)("textarea",{rows:5,placeholder:"microlins.com.br\noffice.com\ngoogle.com",value:h.allowedUrls.join("\n"),onChange:e=>es("allowedUrls",e.target.value.split("\n").map(e=>e.trim()).filter(Boolean))})]}),(0,t.jsx)("p",{className:"muted",children:"As regras são aplicadas somente ao usuário restrito e usam as políticas URLBlocklist/URLAllowlist dos navegadores."})]}),(0,t.jsxs)("section",{className:"panel",children:[(0,t.jsx)("h2",{children:"USB / armazenamento removível"}),(0,t.jsx)(J,{label:"Bloquear leitura de pendrive",value:h.blockUsbRead,onChange:e=>es("blockUsbRead",e)}),(0,t.jsx)(J,{label:"Bloquear gravação em pendrive",value:h.blockUsbWrite,onChange:e=>es("blockUsbWrite",e)}),(0,t.jsx)(J,{label:"Bloquear execução de programas pelo USB",value:h.blockUsbExecute,onChange:e=>es("blockUsbExecute",e)}),(0,t.jsx)("p",{className:"muted",children:"Leitura e gravação são políticas por usuário. Execução usa AppLocker; em AuditOnly ela é registrada, mas ainda não bloqueada."})]}),(0,t.jsxs)("section",{className:"panel important",children:[(0,t.jsx)("h2",{children:"Manutenção de perfis e armazenamento"}),(0,t.jsxs)("label",{children:["Perfis antigos",(0,t.jsxs)("select",{value:h.profileCleanupMode,onChange:e=>es("profileCleanupMode",e.target.value),children:[(0,t.jsx)("option",{value:"Off",children:"Desativado"}),(0,t.jsx)("option",{value:"ReportOnly",children:"Somente relatório"}),(0,t.jsx)("option",{value:"Delete",children:"Excluir quando maintenance.ps1 for executado"})]})]}),(0,t.jsxs)("div",{className:"two",children:[(0,t.jsxs)("label",{className:"numberField",children:["Considerar inativo após",(0,t.jsxs)("div",{children:[(0,t.jsx)("input",{type:"number",min:1,max:3650,value:h.profileCleanupDays,onChange:e=>es("profileCleanupDays",Math.max(1,Math.min(3650,Number(e.target.value)||30)))}),(0,t.jsx)("span",{children:"dias"})]})]}),(0,t.jsxs)("label",{className:"numberField",children:["Alertar disco abaixo de",(0,t.jsxs)("div",{children:[(0,t.jsx)("input",{type:"number",min:1,max:99,value:h.storageWarningFreePercent,onChange:e=>es("storageWarningFreePercent",Math.max(1,Math.min(99,Number(e.target.value)||20)))}),(0,t.jsx)("span",{children:"% livre"})]})]})]}),(0,t.jsx)("p",{className:"Delete"===h.profileCleanupMode?"warningBox":"notice",children:"Delete"===h.profileCleanupMode?"Modo destrutivo: maintenance.ps1 poderá remover perfis inativos. As contas configuradas como Aluno e Admin são protegidas, assim como perfis carregados e especiais.":"O padrão é relatório: você enxerga candidatos à limpeza e o estado do disco sem apagar dados."})]}),(0,t.jsxs)("section",{className:"panel",children:[(0,t.jsx)("h2",{children:"Personalização"}),(0,t.jsx)(J,{label:"Bloquear wallpaper",value:h.blockWallpaper,onChange:e=>es("blockWallpaper",e)}),(0,t.jsx)(J,{label:"Bloquear ponteiro do mouse",value:h.blockMousePointers,onChange:e=>es("blockMousePointers",e)}),(0,t.jsx)(J,{label:"Bloquear esquema de sons",value:h.blockSoundScheme,onChange:e=>es("blockSoundScheme",e)}),(0,t.jsxs)("label",{className:"numberField",children:["Liberação temporária do wallpaper",(0,t.jsxs)("div",{children:[(0,t.jsx)("input",{type:"number",min:5,max:480,value:h.wallpaperUnlockMinutes,onChange:e=>es("wallpaperUnlockMinutes",Math.max(5,Math.min(480,Number(e.target.value)||90)))}),(0,t.jsx)("span",{children:"minutos"})]})]})]}),(0,t.jsxs)("section",{className:"panel safetyPanel",children:[(0,t.jsx)("h2",{children:"Safety & Recovery"}),(0,t.jsx)("p",{className:"muted",children:"O pacote foi desenhado para falhar antes de alterar a máquina e manter um caminho de volta."}),(0,t.jsxs)("div",{className:"safetyGrid",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:"Preview por padrão"}),(0,t.jsxs)("span",{children:["setup e rollback só alteram o Windows com ",(0,t.jsx)("code",{children:"-Apply"}),"."]})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:"Preflight"}),(0,t.jsx)("span",{children:"Valida contas, AppLocker e comandos essenciais antes da aplicação."})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:"Baseline preservado"}),(0,t.jsx)("span",{children:"AppLocker e políticas de usuário anteriores são snapshotados uma única vez."})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:"Rollback seguro"}),(0,t.jsxs)("span",{children:["Sem ",(0,t.jsx)("code",{children:"state.json"})," e backups válidos, o rollback se recusa a executar."]})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:"Primeiro login"}),(0,t.jsx)("span",{children:"Se a conta ainda não tiver perfil, as políticas HKCU são aplicadas por tarefa temporária no primeiro logon."})]}),(0,t.jsxs)("div",{children:[(0,t.jsx)("strong",{children:"Reaplicação idempotente"}),(0,t.jsx)("span",{children:"Novas aplicações preservam o baseline original em vez de sobrescrevê-lo."})]})]})]}),(0,t.jsxs)("section",{className:"panel reviewPanel",children:[(0,t.jsx)("h2",{children:"Revisão antes de gerar"}),(0,t.jsx)("p",{className:"muted",children:"Confira o que merece atenção antes de levar o pacote para um PC."}),(0,t.jsx)("div",{className:"reviewList",children:ee.map((e,o)=>(0,t.jsxs)("div",{className:"warning"===e.level?"review warning":"review info",children:[(0,t.jsx)("strong",{children:"warning"===e.level?"Atenção":"Info"}),(0,t.jsx)("span",{children:e.text})]},`${e.level}-${o}`))})]}),(0,t.jsxs)("section",{className:"panel packagePanel",children:[(0,t.jsx)("h2",{children:"Pacote gerado"}),(0,t.jsxs)("div",{className:"fileList",children:[(0,t.jsx)(_,{name:"setup.ps1",description:"Aplica a configuração."}),(0,t.jsx)(_,{name:"rollback.ps1",description:"Restaura o baseline anterior do AppLocker/registro sem apagar as contas."}),(0,t.jsx)(_,{name:"audit.ps1",description:"Lê os eventos do AppLocker dos últimos 7 dias."}),(0,t.jsx)(_,{name:"liberar-wallpaper.ps1",description:"Libera o wallpaper e agenda o rebloqueio."}),(0,t.jsx)(_,{name:"verify.ps1",description:"Verifica Windows, AppLocker, contas e caminhos dos aplicativos."}),(0,t.jsx)(_,{name:"preflight.ps1",description:"Gera readiness PASS/WARN/BLOCK e relatório JSON antes do Apply."}),(0,t.jsx)(_,{name:"scan-pc.ps1",description:"Gera inventário JSON para importar novamente no WinLab."}),(0,t.jsx)(_,{name:"maintenance.ps1",description:"Relata espaço em disco e perfis antigos; pode removê-los quando explicitamente configurado."}),(0,t.jsx)(_,{name:"config.json",description:"Permite reproduzir a mesma configuração."}),(0,t.jsx)(_,{name:"README.txt",description:"Instruções para o técnico."})]}),en.length>0&&(0,t.jsxs)("p",{className:"warningBox",children:["Existem ",en.length," caminho(s) personalizado(s) com alerta de segurança. Revise-os antes de usar o modo de bloqueio."]})]}),(0,t.jsxs)("section",{className:"panel preview",children:[(0,t.jsxs)("div",{className:"previewHeader",children:[(0,t.jsxs)("div",{children:[(0,t.jsx)("h2",{children:"Prévia do setup.ps1"}),(0,t.jsxs)("p",{className:"muted",children:[Z.split("\n").length," linhas ·"," ","AuditOnly"===h.enforcementMode?"auditoria":"bloqueio ativo"]})]}),(0,t.jsx)("button",{disabled:et.length>0,onClick:()=>{et.length||K("setup.ps1",Z)},children:"Baixar só setup.ps1"})]}),(0,t.jsx)("pre",{children:Z.slice(0,12e3)})]})]})]})}],52683)}]);