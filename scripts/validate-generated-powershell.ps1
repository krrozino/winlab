param(
    [string]$Root = "artifacts/ci-scripts",
    [switch]$ParserOnly
)

$ErrorActionPreference = "Stop"

$resolved = Resolve-Path $Root
$files = Get-ChildItem -Path $resolved -Filter *.ps1 -Recurse

if (-not $files) {
    throw "Nenhum fixture PowerShell encontrado em $resolved"
}

Write-Host ("Validando {0} scripts com PowerShell {1}" -f $files.Count, $PSVersionTable.PSVersion)

foreach ($file in $files) {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $file.FullName,
        [ref]$tokens,
        [ref]$errors
    )

    if ($errors.Count -gt 0) {
        $messages = ($errors | ForEach-Object {
            "{0}:{1} {2}" -f $file.FullName, $_.Extent.StartLineNumber, $_.Message
        }) -join [Environment]::NewLine

        throw "Erro de sintaxe PowerShell:$([Environment]::NewLine)$messages"
    }
}

Write-Host "Parser: OK" -ForegroundColor Green

if ($ParserOnly) {
    exit 0
}

# Preview smoke tests: these scripts must not mutate the runner without -Apply.
foreach ($file in Get-ChildItem -Path $resolved -Filter setup.ps1 -Recurse) {
    & {
        param($Path)
        . $Path
    } $file.FullName
}

foreach ($file in Get-ChildItem -Path $resolved -Filter rollback.ps1 -Recurse) {
    & {
        param($Path)
        . $Path
    } $file.FullName
}

foreach ($file in Get-ChildItem -Path $resolved -Filter liberar-wallpaper.ps1 -Recurse) {
    & {
        param($Path)
        . $Path
    } $file.FullName
}

Write-Host "Preview smoke tests: OK" -ForegroundColor Green

# Run the actual preflight for presets that create their test accounts on apply.
foreach ($file in Get-ChildItem -Path $resolved -Filter setup.ps1 -Recurse) {
    if ($file.Directory.Name -eq "stress-open") {
        continue
    }

    & {
        param($Path)

        . $Path

        $tempRoot = Join-Path $env:RUNNER_TEMP ("winlab-preflight-" + [guid]::NewGuid().ToString("N"))
        New-Item -Path $tempRoot -ItemType Directory -Force | Out-Null

        try {
            $WinLabRoot = $tempRoot
            $StatePath = Join-Path $WinLabRoot "state.json"
            Test-WinLabPreflight
        }
        finally {
            Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
        }
    } $file.FullName
}

Write-Host "Preflight smoke tests: OK" -ForegroundColor Green

# Verify that the original AppLocker baseline is reused on reapply.
$baselineFixture = Get-ChildItem -Path $resolved -Filter setup.ps1 -Recurse |
    Where-Object { $_.Directory.Name -eq "preset-microlins" } |
    Select-Object -First 1

if (-not $baselineFixture) {
    throw "Fixture preset-microlins não encontrado para teste de baseline."
}

& {
    param($Path)

    . $Path

    $tempRoot = Join-Path $env:RUNNER_TEMP ("winlab-baseline-" + [guid]::NewGuid().ToString("N"))
    $WinLabRoot = $tempRoot
    $StatePath = Join-Path $WinLabRoot "state.json"
    New-Item -Path $WinLabRoot -ItemType Directory -Force | Out-Null

    function Get-AppLockerPolicy {
        param([switch]$Local, [switch]$Xml)

        '<AppLockerPolicy Version="1"><RuleCollection Type="Exe" EnforcementMode="NotConfigured" /></AppLockerPolicy>'
    }

    function Get-LocalUser {
        param(
            [string]$Name,
            [string]$ErrorAction
        )

        $sidSuffix = if ($Name -eq $Aluno) { "1001" } else { "1002" }

        [PSCustomObject]@{
            Name = $Name
            SID = [PSCustomObject]@{
                Value = "S-1-5-21-1000000000-1000000000-1000000000-$sidSuffix"
            }
        }
    }

    try {
        $first = Ensure-AppLockerBaseline
        if (-not (Test-Path $first)) {
            throw "Primeiro baseline AppLocker não foi criado."
        }

        $registry = Join-Path $WinLabRoot "registry-dummy"
        New-Item -Path $registry -ItemType Directory -Force | Out-Null

        Save-WinLabAppliedState -BaselineAppLockerBackup $first -RegistryBaselineDir $registry -UserPoliciesDeferred $false -Status "Applied"
        $second = Ensure-AppLockerBaseline

        if ($first -ne $second) {
            throw "Reaplicação substituiu o baseline AppLocker original."
        }
    }
    finally {
        Remove-Item -Path $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
} $baselineFixture.FullName

Write-Host "Baseline idempotency: OK" -ForegroundColor Green

# Build the AppLocker XML from every generated setup with a mocked local user.
foreach ($file in Get-ChildItem -Path $resolved -Filter setup.ps1 -Recurse) {
    & {
        param($Path)

        . $Path

        function Get-LocalUser {
            param([string]$Name)

            [PSCustomObject]@{
                Name = $Name
                SID = [PSCustomObject]@{
                    Value = "S-1-5-21-1000000000-1000000000-1000000000-1001"
                }
            }
        }

        $xmlText = New-WinLabAppLockerXml
        [xml]$xml = $xmlText

        if ($xml.DocumentElement.Name -ne "AppLockerPolicy") {
            throw "Raiz AppLockerPolicy ausente em $Path"
        }

        $collections = @($xml.AppLockerPolicy.RuleCollection)
        if ($collections.Count -lt 5) {
            throw "Coleções AppLocker incompletas em $Path"
        }

        $exeCollection = @($collections | Where-Object { $_.Type -eq "Exe" })[0]
        if (-not $exeCollection) {
            throw "Coleção EXE ausente em $Path"
        }
    } $file.FullName
}

Write-Host "AppLocker XML: OK" -ForegroundColor Green

# Validate package manifests and SHA-256 integrity.
$packageRoot = Join-Path (Get-Location) "artifacts\ci-packages"
$packageDirs = @(Get-ChildItem -Path $packageRoot -Directory)

if ($packageDirs.Count -eq 0) {
    throw "Nenhum fixture de pacote encontrado em $packageRoot"
}

foreach ($package in $packageDirs) {
    $verifyScript = Join-Path $package.FullName "verify-package.ps1"

    if (-not (Test-Path $verifyScript)) {
        throw "verify-package.ps1 ausente em $($package.FullName)"
    }

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifyScript -PackageRoot $package.FullName
    if ($LASTEXITCODE -ne 0) {
        throw "Verificação de integridade falhou para pacote intacto: $($package.Name)"
    }
}

Write-Host "Package integrity intact fixtures: OK" -ForegroundColor Green

# Execute one standalone preflight and validate its JSON contract.
$preflightPackage = Join-Path $packageRoot "preset-microlins"
$preflightScript = Join-Path $preflightPackage "preflight.ps1"
$preflightReportPath = Join-Path $env:RUNNER_TEMP "winlab-preflight-ci.json"

& $preflightScript -OutputPath $preflightReportPath

if (-not (Test-Path $preflightReportPath)) {
    throw "preflight.ps1 não gerou relatório JSON."
}

$preflight = Get-Content -Path $preflightReportPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($preflight.schemaVersion -ne 1) {
    throw "Schema de preflight inesperado: $($preflight.schemaVersion)"
}

if (@("PASS", "WARN", "BLOCK") -notcontains [string]$preflight.status) {
    throw "Status de preflight inválido: $($preflight.status)"
}

$checks = @($preflight.checks)
$passCount = @($checks | Where-Object { $_.status -eq "PASS" }).Count
$warnCount = @($checks | Where-Object { $_.status -eq "WARN" }).Count
$blockCount = @($checks | Where-Object { $_.status -eq "BLOCK" }).Count

if ($passCount -ne [int]$preflight.summary.pass -or
    $warnCount -ne [int]$preflight.summary.warn -or
    $blockCount -ne [int]$preflight.summary.block) {
    throw "Resumo de preflight não corresponde aos checks."
}

if ([int]$preflight.summary.score -lt 0 -or [int]$preflight.summary.score -gt 100) {
    throw "Readiness score fora de 0-100."
}

Write-Host ("Preflight report contract: OK ({0}, score {1})" -f $preflight.status, $preflight.summary.score) -ForegroundColor Green

# A deliberately modified package must fail verification.
$tamperPackage = Join-Path $packageRoot "preset-microlins"
$tamperFile = Join-Path $tamperPackage "README.txt"
$original = Get-Content -Path $tamperFile -Raw -Encoding UTF8

try {
    Set-Content -Path $tamperFile -Value ($original + [Environment]::NewLine + "CI-TAMPER") -Encoding UTF8

    $verifyScript = Join-Path $tamperPackage "verify-package.ps1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verifyScript -PackageRoot $tamperPackage

    if ($LASTEXITCODE -eq 0) {
        throw "Pacote adulterado foi aceito pela verificação de integridade."
    }
}
finally {
    Set-Content -Path $tamperFile -Value $original -Encoding UTF8
}

& cmd.exe /c "exit 0" | Out-Null

Write-Host "Package tamper detection: OK" -ForegroundColor Green

# Validate the 0.9 pilot candidate contract.
$pilotRoot = Join-Path (Get-Location) "artifacts\ci-pilot"
$pilotManifestPath = Join-Path $pilotRoot "manifest.json"
$pilotConfigPath = Join-Path $pilotRoot "config.json"
$pilotReadinessPath = Join-Path $pilotRoot "pilot-readiness.json"
$pilotVerifyScript = Join-Path $pilotRoot "verify-package.ps1"

foreach ($required in @(
    $pilotManifestPath,
    $pilotConfigPath,
    $pilotReadinessPath,
    $pilotVerifyScript,
    (Join-Path $pilotRoot "PILOT-DEPLOYMENT-CHECKLIST.txt"),
    (Join-Path $pilotRoot "PILOT-ROLLBACK-CHECKLIST.txt"),
    (Join-Path $pilotRoot "preflight-source.json")
)) {
    if (-not (Test-Path $required)) {
        throw "Arquivo obrigatório do pacote piloto ausente: $required"
    }
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $pilotVerifyScript -PackageRoot $pilotRoot
if ($LASTEXITCODE -ne 0) {
    throw "Pacote piloto íntegro falhou na verificação SHA-256."
}

$pilotManifest = Get-Content -Path $pilotManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$pilotConfig = Get-Content -Path $pilotConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$pilotReadiness = Get-Content -Path $pilotReadinessPath -Raw -Encoding UTF8 | ConvertFrom-Json

if ($pilotManifest.packageVersion -ne "0.9.0") {
    throw "Versão inesperada no manifesto piloto: $($pilotManifest.packageVersion)"
}

if ($pilotManifest.channel -ne "pilot") {
    throw "Manifesto piloto sem channel=pilot."
}

if ($pilotManifest.targetComputerName -ne "CI-PILOT") {
    throw "Pacote piloto não está vinculado à máquina CI-PILOT."
}

if ($pilotConfig.enforcementMode -ne "AuditOnly") {
    throw "Pacote piloto não forçou AppLocker AuditOnly."
}

if ($pilotConfig.profileCleanupMode -ne "ReportOnly") {
    throw "Pacote piloto não forçou manutenção ReportOnly."
}

if ($pilotReadiness.status -eq "BLOCKED") {
    throw "Fixture piloto foi gerada com readiness BLOCKED."
}

Write-Host "Pilot candidate contract: OK" -ForegroundColor Green
