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
