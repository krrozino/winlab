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
