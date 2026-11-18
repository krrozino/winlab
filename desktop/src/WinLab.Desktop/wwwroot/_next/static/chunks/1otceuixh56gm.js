(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,22016,(e,t,r)=>{"use strict";e.i(47167),Object.defineProperty(r,"__esModule",{value:!0});var o={default:function(){return g},useLinkStatus:function(){return A}};for(var a in o)Object.defineProperty(r,a,{enumerable:!0,get:o[a]});let i=e.r(90809),n=e.r(43476),s=i._(e.r(71645)),l=e.r(95057),c=e.r(8372),d=e.r(18581),u=e.r(18967),p=e.r(5550),$=e.r(88540),m=e.r(91949),f=e.r(73668),h=e.r(9396);function g(t){var r;let o,a,i,[g,A]=(0,s.useOptimistic)(m.IDLE_LINK_STATUS),S=(0,s.useRef)(null),{href:y,as:C,children:b,prefetch:x=null,passHref:k,replace:v,shallow:E,scroll:R,onClick:L,onMouseEnter:W,onTouchStart:N,legacyBehavior:w=!1,onNavigate:U,transitionTypes:I,ref:D,unstable_dynamicOnHover:B,...O}=t;o=b,w&&("string"==typeof o||"number"==typeof o)&&(o=(0,n.jsx)("a",{children:o}));let T=s.default.useContext(c.AppRouterContext),F=!1!==x,M=!1===x?"none":!0===x?"full":"auto",G="none"!==M?"auto"===M?h.FetchStrategy.PPR:h.FetchStrategy.Full:h.FetchStrategy.PPR,H="string"==typeof(r=C||y)?r:(0,l.formatUrl)(r);if(w){if(o?.$$typeof===Symbol.for("react.lazy"))throw Object.defineProperty(Error("`<Link legacyBehavior>` received a direct child that is either a Server Component, or JSX that was loaded with React.lazy(). This is not supported. Either remove legacyBehavior, or make the direct child a Client Component that renders the Link's `<a>` tag."),"__NEXT_ERROR_CODE",{value:"E863",enumerable:!1,configurable:!0});a=s.default.Children.only(o)}let V=w?a&&"object"==typeof a&&a.ref:D,_,j=s.default.useCallback(e=>(null!==T&&(S.current=(0,m.mountLinkInstance)(e,H,T,G,F,A,_)),()=>{S.current&&((0,m.unmountLinkForCurrentNavigation)(S.current),S.current=null),(0,m.unmountPrefetchableInstance)(e)}),[F,H,T,G,A,_]),q={ref:(0,d.useMergedRef)(j,V),onClick(t){w||"function"!=typeof L||L(t),w&&a.props&&"function"==typeof a.props.onClick&&a.props.onClick(t),!T||t.defaultPrevented||function(t,r,o,a,i,n,l,c="none"){if("u">typeof window){let d,{nodeName:u}=t.currentTarget;if("A"===u.toUpperCase()&&((d=t.currentTarget.getAttribute("target"))&&"_self"!==d||t.metaKey||t.ctrlKey||t.shiftKey||t.altKey||t.nativeEvent&&2===t.nativeEvent.which)||t.currentTarget.hasAttribute("download"))return;if(!(0,f.isLocalURL)(r)){a&&(t.preventDefault(),location.replace(r));return}if(t.preventDefault(),n){let e=!1;if(n({preventDefault:()=>{e=!0}}),e)return}let{dispatchNavigateAction:p}=e.r(99781);s.default.startTransition(()=>{p(r,a?"replace":"push",!1===i?$.ScrollBehavior.NoScroll:$.ScrollBehavior.Default,o.current,l,c)})}}(t,H,S,v,R,U,I,M)},onMouseEnter(e){w||"function"!=typeof W||W(e),w&&a.props&&"function"==typeof a.props.onMouseEnter&&a.props.onMouseEnter(e),T&&F&&(0,m.onNavigationIntent)(e.currentTarget,!0===B)},onTouchStart:function(e){w||"function"!=typeof N||N(e),w&&a.props&&"function"==typeof a.props.onTouchStart&&a.props.onTouchStart(e),T&&F&&(0,m.onNavigationIntent)(e.currentTarget,!0===B)}};return(0,u.isAbsoluteUrl)(H)?q.href=H:w&&!k&&("a"!==a.type||"href"in a.props)||(q.href=(0,p.addBasePath)(H)),i=w?s.default.cloneElement(a,q):(0,n.jsx)("a",{...O,...q,children:o}),(0,n.jsx)(P.Provider,{value:g,children:i})}let P=(0,s.createContext)(m.IDLE_LINK_STATUS),A=()=>(0,s.useContext)(P);("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},18581,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"useMergedRef",{enumerable:!0,get:function(){return a}});let o=e.r(71645);function a(e,t){let r=(0,o.useRef)(null),a=(0,o.useRef)(null);return(0,o.useCallback)(o=>{if(null===o){let e=r.current;e&&(r.current=null,e());let t=a.current;t&&(a.current=null,t())}else e&&(r.current=i(e,o)),t&&(a.current=i(t,o))},[e,t])}function i(e,t){if("function"!=typeof e)return e.current=t,()=>{e.current=null};{let r=e(t);return"function"==typeof r?r:()=>e(null)}}("function"==typeof r.default||"object"==typeof r.default&&null!==r.default)&&void 0===r.default.__esModule&&(Object.defineProperty(r.default,"__esModule",{value:!0}),Object.assign(r.default,r),t.exports=r.default)},18967,(e,t,r)=>{"use strict";e.i(47167),Object.defineProperty(r,"__esModule",{value:!0});var o={DecodeError:function(){return g},MiddlewareNotFoundError:function(){return y},MissingStaticPage:function(){return S},NormalizeError:function(){return P},PageNotFoundError:function(){return A},SP:function(){return f},ST:function(){return h},WEB_VITALS:function(){return i},execOnce:function(){return n},getDisplayName:function(){return u},getLocationOrigin:function(){return c},getURL:function(){return d},isAbsoluteUrl:function(){return l},isResSent:function(){return p},loadGetInitialProps:function(){return m},normalizeRepeatedSlashes:function(){return $},stringifyError:function(){return C}};for(var a in o)Object.defineProperty(r,a,{enumerable:!0,get:o[a]});let i=["CLS","FCP","FID","INP","LCP","TTFB"];function n(e){let t,r=!1;return(...o)=>(r||(r=!0,t=e(...o)),t)}let s=/^[a-zA-Z][a-zA-Z\d+\-.]*?:/,l=e=>{let t=e.charCodeAt(0);return!!(t>=65&&t<=90||t>=97&&t<=122)&&s.test(e)};function c(){let{protocol:e,hostname:t,port:r}=window.location;return`${e}//${t}${r?":"+r:""}`}function d(){let{href:e}=window.location,t=c();return e.substring(t.length)}function u(e){return"string"==typeof e?e:e.displayName||e.name||"Unknown"}function p(e){return e.finished||e.headersSent}function $(e){let t=e.split("?");return t[0].replace(/\\/g,"/").replace(/\/\/+/g,"/")+(t[1]?`?${t.slice(1).join("?")}`:"")}async function m(e,t){let r=t.res||t.ctx&&t.ctx.res;if(!e.getInitialProps)return t.ctx&&t.Component?{pageProps:await m(t.Component,t.ctx)}:{};let o=await e.getInitialProps(t);if(r&&p(r))return o;if(!o)throw Object.defineProperty(Error(`"${u(e)}.getInitialProps()" should resolve to an object. But found "${o}" instead.`),"__NEXT_ERROR_CODE",{value:"E1025",enumerable:!1,configurable:!0});return o}let f="u">typeof performance,h=f&&["mark","measure","getEntriesByName"].every(e=>"function"==typeof performance[e]);class g extends Error{}class P extends Error{}class A extends Error{constructor(e){super(),this.code="ENOENT",this.name="PageNotFoundError",this.message=`Cannot find module for page: ${e}`}}class S extends Error{constructor(e,t){super(),this.message=`Failed to load static file for page: ${e} ${t}`}}class y extends Error{constructor(){super(),this.code="ENOENT",this.message="Cannot find the middleware module"}}function C(e){return JSON.stringify({message:e.message,stack:e.stack})}},73668,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0}),Object.defineProperty(r,"isLocalURL",{enumerable:!0,get:function(){return i}});let o=e.r(18967),a=e.r(52817);function i(e){if(!(0,o.isAbsoluteUrl)(e))return!0;try{let t=(0,o.getLocationOrigin)(),r=new URL(e,t);return r.origin===t&&(0,a.hasBasePath)(r.pathname)}catch(e){return!1}}},98183,(e,t,r)=>{"use strict";Object.defineProperty(r,"__esModule",{value:!0});var o={assign:function(){return l},searchParamsToUrlQuery:function(){return i},urlQueryToSearchParams:function(){return s}};for(var a in o)Object.defineProperty(r,a,{enumerable:!0,get:o[a]});function i(e){let t={};for(let[r,o]of e.entries()){let e=t[r];void 0===e?t[r]=o:Array.isArray(e)?e.push(o):t[r]=[e,o]}return t}function n(e){return"string"==typeof e?e:("number"!=typeof e||isNaN(e))&&"boolean"!=typeof e?"":String(e)}function s(e){let t=new URLSearchParams;for(let[r,o]of Object.entries(e))if(Array.isArray(o))for(let e of o)t.append(r,n(e));else t.set(r,n(o));return t}function l(e,...t){for(let r of t){for(let t of r.keys())e.delete(t);for(let[t,o]of r.entries())e.append(t,o)}return e}},95057,(e,t,r)=>{"use strict";e.i(47167),Object.defineProperty(r,"__esModule",{value:!0});var o={formatUrl:function(){return s},formatWithValidation:function(){return c},urlObjectKeys:function(){return l}};for(var a in o)Object.defineProperty(r,a,{enumerable:!0,get:o[a]});let i=e.r(90809)._(e.r(98183)),n=/https?|ftp|gopher|file/;function s(e){let{auth:t,hostname:r}=e,o=e.protocol||"",a=e.pathname||"",s=e.hash||"",l=e.query||"",c=!1;t=t?encodeURIComponent(t).replace(/%3A/i,":")+"@":"",e.host?c=t+e.host:r&&(c=t+(~r.indexOf(":")?`[${r}]`:r),e.port&&(c+=":"+e.port)),l&&"object"==typeof l&&(l=String(i.urlQueryToSearchParams(l)));let d=e.search||l&&`?${l}`||"";return o&&!o.endsWith(":")&&(o+=":"),e.slashes||(!o||n.test(o))&&!1!==c?(c="//"+(c||""),a&&"/"!==a[0]&&(a="/"+a)):c||(c=""),s&&"#"!==s[0]&&(s="#"+s),d&&"?"!==d[0]&&(d="?"+d),a=a.replace(/[?#]/g,encodeURIComponent),d=d.replace("#","%23"),`${o}${c}${a}${d}${s}`}let l=["auth","hash","host","hostname","href","path","pathname","port","protocol","query","search","slashes"];function c(e){return s(e)}},41045,e=>{"use strict";var t=e.i(95060),r=e.i(14265);function o(e){return e?"$true":"$false"}function a(e){return`'${e.replaceAll("'","''")}'`}function i(e){return e.length?`@(
${e.map(e=>`    ${a(e)}`).join(",\n")}
)`:"@()"}function n(e,t,r=""){let o=r?`${r}

`:"";return`#requires -version 5.1
<#
${t}
Gerado por WinLab Configurator
Perfil: ${e.profileName}

Teste primeiro em uma m\xe1quina piloto.
Nenhuma senha \xe9 armazenada neste arquivo.
#>
${o}$ErrorActionPreference = "Stop"
$Aluno = ${a(e.studentUser)}
$Admin = ${a(e.adminUser)}

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
`}e.s(["generateAuditScript",0,function(e){return`${n(e,"RELATÓRIO DE AUDITORIA")}
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
`},"generateConfigJson",0,function(e){return(0,r.serializeConfig)(e)},"generateMaintenanceScript",0,function(e){return`${n(e,"MANUTENÇÃO E LIMPEZA DE PERFIS",`[CmdletBinding()]
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
`},"generateReadme",0,function(e){return`WINLAB CONFIGURATOR
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

Configurar-Computador.cmd
  Atalho guiado p\xf3s-formata\xe7\xe3o. Solicita eleva\xe7\xe3o UAC se necess\xe1rio, confere os hashes SHA-256
  via verify-package.ps1, exibe o plano de mudan\xe7as, pede confirma\xe7\xe3o e executa setup.ps1 -Apply
  seguido de verify.ps1 sem alterar a pol\xedtica global de execu\xe7\xe3o do PowerShell.

Reverter-Configuracao.cmd
  Atalho guiado para restaurar os baselines anteriores (rollback.ps1 -Apply) ap\xf3s valida\xe7\xe3o SHA-256.

verify-package.ps1
  Verifica SHA-256 e tamanho de todos os arquivos listados no manifest.

manifest.json
  Registra Package ID, vers\xe3o, gera\xe7\xe3o e hashes SHA-256.
  O manifesto verifica integridade, mas ainda n\xe3o fornece assinatura/autenticidade criptogr\xe1fica.

config.json
  Configura\xe7\xe3o versionada usada para gerar este pacote.
  Pode ser importada novamente no WinLab.

EXECU\xc7\xc3O R\xc1PIDA P\xd3S-FORMATA\xc7\xc3O
------------------------------
1. Extraia TODOS os arquivos deste ZIP para uma pasta local (ex.: C:TempWinLab-Setup).
2. Clique duas vezes em Configurar-Computador.cmd e aprove a permiss\xe3o de Administrador (UAC).
3. Confira o resumo exibido na tela e digite S para confirmar a aplica\xe7\xe3o.
4. Caso precise desfazer tudo depois, execute Reverter-Configuracao.cmd.

FLUXO RECOMENDADO EM LABORAT\xd3RIO
--------------------------------
1. Execute verify.ps1 como administrador e confira a m\xe1quina (ou use Configurar-Computador.cmd).
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
`},"generateRollbackScript",0,function(e){return`${n(e,"ROLLBACK",`[CmdletBinding()]
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
`},"generateSetupScript",0,function(e){let r=[...e.allowedApps.flatMap(e=>t.APP_CATALOG[e].paths),...e.customAllowedPaths.map(e=>e.trim()).filter(Boolean)],s=e.enforcementMode;return`${n(e,"SETUP",`[CmdletBinding()]
param([switch]$Apply, [switch]$UserPoliciesOnly)`)}
$ProfileName = ${a(e.profileName)}
$CreateAccounts = ${o(e.createAccounts)}
$BlockInstallers = ${o(e.blockInstallers)}
$BlockStoreApps = ${o(e.blockStoreApps)}
$BlockCmd = ${o(e.blockCmd)}
$BlockPowerShell = ${o(e.blockPowerShell)}
$BlockRegedit = ${o(e.blockRegedit)}
$AllowLocalAccountManagement = ${o(e.allowLocalAccountManagement)}

$BlockChromeExtensions = ${o(e.blockChromeExtensions)}
$BlockChromeGuest = ${o(e.blockChromeGuest)}
$BlockChromeNewProfiles = ${o(e.blockChromeNewProfiles)}
$BlockChromeIncognito = ${o(e.blockChromeIncognito)}
$BlockChromePasswordManager = ${o(e.blockChromePasswordManager)}

$BrowserUrlMode = "${e.browserUrlMode}"
$BlockedUrls = ${i(e.blockedUrls)}
$AllowedUrls = ${i(e.allowedUrls)}

$BlockUsbRead = ${o(e.blockUsbRead)}
$BlockUsbWrite = ${o(e.blockUsbWrite)}
$BlockUsbExecute = ${o(e.blockUsbExecute)}

$BlockWallpaper = ${o(e.blockWallpaper)}
$BlockMousePointers = ${o(e.blockMousePointers)}
$BlockSoundScheme = ${o(e.blockSoundScheme)}

$AllowedExecutables = ${i(r)}
$EnforcementMode = "${s}"

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
`},"generateUnlockWallpaperScript",0,function(e){let t=Math.max(5,Math.min(480,Math.round(e.wallpaperUnlockMinutes||90)));return`${n(e,"LIBERAÇÃO TEMPORÁRIA DE WALLPAPER",`[CmdletBinding()]
param([switch]$Apply)`)}
$Minutos = ${t}

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
$Aluno = ${a(e.studentUser)}
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
`},"generateVerifyScript",0,function(e){let r=e.allowedApps.map(e=>({label:t.APP_CATALOG[e].label,paths:t.APP_CATALOG[e].paths})).map(e=>`    @{
        Name = ${a(e.label)}
        Paths = ${i([...e.paths])}
    }`).join(",\n");return`${n(e,"VERIFICAÇÃO DO PC")}

Assert-Administrator

$KnownApps = @(
${r}
)
$CustomAllowedPaths = ${i(e.customAllowedPaths)}

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
Write-Check "Conta restrita" ($null -ne $student -or ${o(e.createAccounts)}) $(if ($student) { "existe: $Aluno" } else { "ser\xe1 criada pelo setup: $Aluno" })
Write-Check "Conta administrativa" ($null -ne $admin -or ${o(e.createAccounts)}) $(if ($admin) { "existe: $Admin" } else { "ser\xe1 criada pelo setup: $Admin" })

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
`}])},79529,65086,e=>{"use strict";var t=e.i(95060);function r(e){return`'${e.replaceAll("'","''")}'`}function o(e){return"'"+e.replaceAll("'","''")+"'"}function a(e){return e.length?"@("+e.map(o).join(", ")+")":"@()"}e.s(["generateInventoryScannerScript",0,function(){let e=Object.entries(t.APP_CATALOG).map(([e,t])=>{var o;return`    @{
        Id = ${r(e)}
        Label = ${r(t.label)}
        Paths = ${!(o=t.paths).length?"@()":`@(
${o.map(e=>`        ${r(e)}`).join(",\n")}
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
`}],79529),e.s(["generatePreflightScript",0,function(e){let r=e.allowedApps.map(e=>{let r=t.APP_CATALOG[e];return"@{ Id = "+o(e)+"; Label = "+o(r.label)+"; Paths = "+a(r.paths)+" }"}).join(",\n    ");return String.raw`#requires -version 5.1
[CmdletBinding()]
param([string]$OutputPath = $null)

<#
WINLAB PREFLIGHT / READINESS
Somente diagnóstico. Não aplica políticas nem altera contas.
#>

$ErrorActionPreference = "Stop"
$ProfileName = ${o(e.profileName)}
$Aluno = ${o(e.studentUser)}
$Admin = ${o(e.adminUser)}
$CreateAccounts = ${e.createAccounts?"$true":"$false"}
$EnforcementMode = ${o(e.enforcementMode)}
$StorageWarningFreePercent = ${e.storageWarningFreePercent}
$BrowserUrlMode = ${o(e.browserUrlMode)}
$AllowedUrls = ${a(e.allowedUrls)}
$CustomAllowedPaths = ${a(e.customAllowedPaths)}

$KnownApps = @(
    ${r}
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
`}],65086)},65334,83489,e=>{"use strict";var t=e.i(79529),r=e.i(41045),o=e.i(65086);function a(e){return new TextEncoder().encode(e)}async function i(e){return[...new Uint8Array(await crypto.subtle.digest("SHA-256",a(e)))].map(e=>e.toString(16).padStart(2,"0")).join("")}function n(e){let a,i;return[{name:"Configurar-Computador.cmd",content:(a=e.profileName.replace(/["&|<>^%\r\n]/g,"").trim()||"WinLab",`@echo off\r
setlocal EnableExtensions\r
chcp 65001 >nul 2>&1\r
title WinLab - Configurar Computador (${a})\r
echo ================================================================\r
echo   WinLab - Configuracao Pos-Formatacao (${a})\r
echo ================================================================\r
echo.\r
if not "%OS%"=="Windows_NT" (\r
  echo [ERRO] Este pacote deve ser executado em um computador Windows.\r
  pause\r
  exit /b 1\r
)\r
cd /d "%~dp0"\r
if not exist "%~dp0setup.ps1" (\r
  echo [ERRO] Extraia TODOS os arquivos do ZIP para uma pasta antes de abrir Configurar-Computador.cmd.\r
  pause\r
  exit /b 1\r
)\r
if not exist "%~dp0manifest.json" (\r
  echo [ERRO] manifest.json nao encontrado. Extraia o pacote ZIP completo antes de continuar.\r
  pause\r
  exit /b 1\r
)\r
net session >nul 2>&1\r
if not %errorLevel%==0 (\r
  echo Solicitando permissao de Administrador do Windows ^(UAC^)...\r
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"\r
  exit /b %errorLevel%\r
)\r
echo [1/4] Verificando integridade SHA-256 do pacote...\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-package.ps1"\r
if not %errorLevel%==0 (\r
  echo.\r
  echo [BLOQUEADO] A verificacao de integridade do pacote falhou. Nenhuma alteracao foi feita.\r
  pause\r
  exit /b 1\r
)\r
echo.\r
echo [2/4] Exibindo plano de configuracao (modo simulacao)...\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1"\r
if not %errorLevel%==0 (\r
  echo.\r
  echo [ERRO] Falha ao exibir o plano inicial.\r
  pause\r
  exit /b 1\r
)\r
echo.\r
set /p WINLAB_CONFIRM="Deseja aplicar esta configuracao neste computador agora? (S/N): "\r
if /I not "%WINLAB_CONFIRM%"=="S" (\r
  echo Operacao cancelada pelo operador. Nenhuma alteracao foi aplicada.\r
  pause\r
  exit /b 0\r
)\r
echo.\r
echo [3/4] Aplicando configuracao e preservando baseline para reversao...\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -Apply\r
if not %errorLevel%==0 (\r
  echo.\r
  echo [ERRO] A aplicacao encontrou um problema. Verifique as mensagens acima.\r
  pause\r
  exit /b 1\r
)\r
echo.\r
echo [4/4] Verificando estado final aplicado...\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify.ps1"\r
echo.\r
echo ================================================================\r
echo   Concluido! Se solicitado acima, reinicie o computador ou\r
echo   encerre a sessao da conta comum para efetivar todas as regras.\r
echo ================================================================\r
pause\r
exit /b 0\r
`)},{name:"Reverter-Configuracao.cmd",content:(i=e.profileName.replace(/["&|<>^%\r\n]/g,"").trim()||"WinLab",`@echo off\r
setlocal EnableExtensions\r
chcp 65001 >nul 2>&1\r
title WinLab - Reverter Configuracao (${i})\r
cd /d "%~dp0"\r
if not exist "%~dp0rollback.ps1" (\r
  echo [ERRO] Extraia todos os arquivos do pacote ZIP antes de executar Reverter-Configuracao.cmd.\r
  pause\r
  exit /b 1\r
)\r
net session >nul 2>&1\r
if not %errorLevel%==0 (\r
  echo Solicitando permissao de Administrador do Windows ^(UAC^)...\r
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -WorkingDirectory '%~dp0' -Verb RunAs"\r
  exit /b %errorLevel%\r
)\r
echo [1/2] Verificando integridade SHA-256 do pacote...\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0verify-package.ps1"\r
if not %errorLevel%==0 (\r
  echo [BLOQUEADO] Integridade do pacote invalida.\r
  pause\r
  exit /b 1\r
)\r
set /p WINLAB_RB="Confirma a reversao para o baseline anterior deste computador? (S/N): "\r
if /I not "%WINLAB_RB%"=="S" (\r
  echo Operacao cancelada.\r
  pause\r
  exit /b 0\r
)\r
echo [2/2] Executando rollback.ps1 -Apply...\r
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0rollback.ps1" -Apply\r
pause\r
exit /b %errorLevel%\r
`)},{name:"setup.ps1",content:(0,r.generateSetupScript)(e)},{name:"rollback.ps1",content:(0,r.generateRollbackScript)(e)},{name:"audit.ps1",content:(0,r.generateAuditScript)(e)},{name:"liberar-wallpaper.ps1",content:(0,r.generateUnlockWallpaperScript)(e)},{name:"verify.ps1",content:(0,r.generateVerifyScript)(e)},{name:"preflight.ps1",content:(0,o.generatePreflightScript)(e)},{name:"scan-pc.ps1",content:(0,t.generateInventoryScannerScript)()},{name:"maintenance.ps1",content:(0,r.generateMaintenanceScript)(e)},{name:"config.json",content:(0,r.generateConfigJson)(e)},{name:"README.txt",content:(0,r.generateReadme)(e)},{name:"verify-package.ps1",content:`#requires -version 5.1
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
`}]}async function s(e,t,r){let o=await Promise.all(t.map(async e=>({name:e.name,sha256:await i(e.content),bytes:a(e.content).byteLength})));return{schemaVersion:1,packageVersion:"0.9.0",packageId:r?.packageId??crypto.randomUUID(),generatedAt:r?.generatedAt??new Date().toISOString(),profileName:e.profileName,configSchemaVersion:1,channel:r?.channel??"standard",targetComputerName:r?.targetComputerName??null,integrity:{algorithm:"SHA-256",manifestSelfHashed:!1,authenticity:"unsigned"},files:o}}async function l(e,t){let r=[...n(e),...t?.extraFiles??[]],o=await s(e,r,t);return[...r,{name:"manifest.json",content:JSON.stringify(o,null,2)+"\n"}]}e.s(["buildWinLabPackageFiles",0,l,"getBasePackageFiles",0,n],65334);let c=new TextEncoder;function d(e){return new Uint8Array(e)}function u(e,t,r){e.setUint16(t,r,!0)}function p(e,t,r){e.setUint32(t,r>>>0,!0)}e.s(["createZip",0,function(e){var t;let r,o=(r=Math.max(1980,(t=new Date).getFullYear()),{time:t.getHours()<<11|t.getMinutes()<<5|Math.floor(t.getSeconds()/2),date:r-1980<<9|t.getMonth()+1<<5|t.getDate()}),a=[],i=[],n=0;for(let t of e){let e=c.encode(t.name),r=c.encode(t.content),s=function(e){let t=0xffffffff;for(let r of e){t^=r;for(let e=0;e<8;e++)t=t>>>1^0xedb88320&-(1&t)}return(0xffffffff^t)>>>0}(r),l=d(30),$=new DataView(l.buffer);p($,0,0x4034b50),u($,4,20),u($,6,2048),u($,8,0),u($,10,o.time),u($,12,o.date),p($,14,s),p($,18,r.length),p($,22,r.length),u($,26,e.length),u($,28,0),i.push({name:e,data:r,crc:s,offset:n}),a.push(l,e,r),n+=l.length+e.length+r.length}let s=[],l=0;for(let e of i){let t=d(46),r=new DataView(t.buffer);p(r,0,0x2014b50),u(r,4,20),u(r,6,20),u(r,8,2048),u(r,10,0),u(r,12,o.time),u(r,14,o.date),p(r,16,e.crc),p(r,20,e.data.length),p(r,24,e.data.length),u(r,28,e.name.length),u(r,30,0),u(r,32,0),u(r,34,0),u(r,36,0),p(r,38,0),p(r,42,e.offset),s.push(t,e.name),l+=t.length+e.name.length}let $=d(22),m=new DataView($.buffer);p(m,0,0x6054b50),u(m,4,0),u(m,6,0),u(m,8,i.length),u(m,10,i.length),p(m,12,l),p(m,16,n),u(m,20,0);let f=function(e){let t=new Uint8Array(e.reduce((e,t)=>e+t.length,0)),r=0;for(let o of e)t.set(o,r),r+=o.length;return t}([...a,...s,$]),h=new ArrayBuffer(f.byteLength);return new Uint8Array(h).set(f),new Blob([h],{type:"application/zip"})}],83489)}]);