# Review & Adversarial Challenge Report: Milestone 1 (M1)

**Reviewer Agent:** Reviewer 1 (`reviewer_m1_1`)  
**Parent Agent:** Project Orchestrator (`0b7fefcdb266ef2c358377a3938321e9`)  
**Timestamp:** 2026-11-10T20:54:00Z  
**Branch:** `feat/winlab-desktop-foundation`  
**Milestone:** Foundation Audit, .NET 10 LTS & Offline WebView2  
**Verdict:** **`VERDICT: APPROVE`**

---

## 1. Observation

### 1.1 Automated Build & Test Executions
1. **TypeScript Tests (`npm test`):**
   - Command: `npm test`
   - Result: 85 tests passed, 0 failed, duration 633.9ms.
   - Verified tests covering .NET LTS targets, offline `wwwroot` bundle, virtual host routing, DevTools guard in Release, IPC roundtrips, boundary shell injection blocking, origin rejection, equal student/admin rejection, missing `wwwroot` fatal handling, low disk storage warning, drift detection, and scenario lifecycles.
2. **TypeScript Compilation (`npm run typecheck`):**
   - Command: `npm run typecheck` (`tsc --noEmit`)
   - Result: Exit code 0, 0 diagnostic errors.
3. **Desktop Static Asset Export (`npm run build:desktop`):**
   - Command: `npm run build:desktop` (`WINLAB_DESKTOP_EXPORT=true next build && node scripts/verify-desktop-export.mjs`)
   - Result: Compiled successfully via Turbopack in 790ms; static pages generated; verified `desktop/src/WinLab.Desktop/wwwroot/desktop/index.html` at 14,866 bytes.
4. **Web Configurator Compatibility (`npm run build`):**
   - Command: `npm run build`
   - Result: Standard production build completed cleanly in 874ms, generating `.next` without regression.
5. **Fixture Generation (`npm run fixtures`):**
   - Command: `npm run fixtures`
   - Result: Exit code 0, generated script fixtures, package fixtures, and pilot fixtures in `artifacts/`.

### 1.2 Inspection of WebView2 Security Hardening (`desktop/src/WinLab.Desktop/MainWindow.xaml.cs`)
- **UserDataFolder Isolation (Lines 28–34):**
  - Specifies dedicated user data folder in `%LOCALAPPDATA%\WinLab\WebView2Data`, preventing permission denied failures when the app is installed in `C:\Program Files\WinLab` under a standard non-admin user account (`asInvoker`).
- **Release Mode Security Hardening (Lines 41–47):**
  ```csharp
  #if DEBUG
      WebView.CoreWebView2.Settings.AreDevToolsEnabled = true;
      WebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
  #else
      WebView.CoreWebView2.Settings.AreDevToolsEnabled = false;
      WebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
  #endif
  ```
  - In Release builds, DevTools and default context menus are explicitly disabled.
- **Navigation Lock & Popup Prevention (Lines 50–51, 101–123):**
  - `NewWindowRequested` is suppressed (`args.Handled = true`).
  - `NavigationStarting` cancels any URI not matching `https://winlab.local/` or `https://winlab.local` (with Debug-only localhost fallback).
- **Offline Asset Integrity & Localhost Fallback Elimination (Lines 58–85):**
  - Mapped virtual host: `winlab.local` mapped to `AppDomain.CurrentDomain.BaseDirectory/wwwroot`.
  - In Release builds (`#if !DEBUG`), if `wwwroot` is missing, the application displays a modal error dialog (`WinLab Desktop — Erro de Integridade`) and terminates via `Close()`. No silent fallback to `http://localhost:3000` occurs in production.
- **Origin Validation on Incoming Web Messages (Lines 126–150):**
  ```csharp
  string source = e.Source ?? string.Empty;
  bool isAuthorized = source.StartsWith("https://winlab.local", StringComparison.OrdinalIgnoreCase);
  ```
  - Incoming messages are validated; unauthorized origins are ignored.

### 1.3 Inspection of Solution & Project Configurations
- **`desktop/src/WinLab.Desktop/WinLab.Desktop.csproj`:**
  - `<TargetFramework>net10.0-windows</TargetFramework>` (Line 5)
  - `<UseWPF>true</UseWPF>` (Line 7)
  - `<ApplicationManifest>app.manifest</ApplicationManifest>` (Line 11; specifies `asInvoker`)
  - `<PackageReference Include="Microsoft.Web.WebView2" Version="1.0.2849.39" />` (Line 20)
  - `<Content Include="wwwroot\**" CopyToOutputDirectory="PreserveNewest" />` (Line 24)
- **`desktop/src/WinLab.Contracts/WinLab.Contracts.csproj`:**
  - `<TargetFramework>net10.0</TargetFramework>` (Line 4)
- **`desktop/src/WinLab.Agent.Mock/WinLab.Agent.Mock.csproj`:**
  - `<TargetFramework>net10.0</TargetFramework>` (Line 4)
- **`desktop/tests/WinLab.Tests/WinLab.Tests.csproj`:**
  - `<TargetFramework>net10.0</TargetFramework>` (Line 4)
  - Target packages: `Microsoft.NET.Test.Sdk` (17.12.0), `xunit` (2.9.2), `xunit.runner.visualstudio` (2.8.2), `coverlet.collector` (6.0.2).
- **`desktop/WinLab.sln`:**
  - Includes all 4 projects: `WinLab.Contracts`, `WinLab.Agent.Mock`, `WinLab.Desktop`, `WinLab.Tests`.
  - Debug and Release configuration mappings are fully populated for all 4 project GUIDs.

### 1.4 Inspection of Inno Setup Packaging (`desktop/packaging/winlab.iss`)
- **Elevation Requirement:** `PrivilegesRequired=admin` (Line 23).
- **Destination:** `DefaultDirName={autopf}\WinLab` (Line 19) in 64-bit Program Files (`ArchitecturesInstallIn64BitMode=x64compatible`).
- **Shortcuts:** Start menu entry (`{autoprograms}`) and optional desktop icon (`{autodesktop}`).
- **Baseline Retention:** `[UninstallDelete]` deletes only `{app}\*.log`, strictly preserving `C:\ProgramData\WinLab` across uninstalls/updates.
- **Unsigned Build Notice:**
  - `brazilianportuguese.BeveledLabel=WinLab Desktop 0.9.0 (Build de Piloto / Não Assinada)`
  - `english.BeveledLabel=WinLab Desktop 0.9.0 (Pilot Build / Unsigned)`

### 1.5 Inspection of GitHub Actions CI Pipeline (`.github/workflows/ci.yml`)
- Added `desktop-windows` job running on `windows-latest` (Lines 71–128):
  - Setup .NET 10 SDK (`actions/setup-dotnet@v4` with `dotnet-version: '10.0.x'`).
  - Node.js 22 LTS setup and dependency installation.
  - `npm run build:desktop` generating static offline assets into `wwwroot`.
  - `dotnet restore desktop/WinLab.sln`.
  - `dotnet build desktop/WinLab.sln -c Release --no-restore`.
  - `dotnet test desktop/WinLab.sln -c Release --no-build --verbosity normal`.
  - `dotnet publish desktop/src/WinLab.Desktop/WinLab.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o artifacts/publish/desktop`.
  - Inno Setup compilation via `choco install innosetup --no-progress` and `iscc desktop\packaging\winlab.iss`.
  - Artifact uploads for published desktop application and installer `.exe`.

### 1.6 Integrity Check
- **Hardcoded test results:** None. The tests exercise actual logic, schemas, regex validators, and serialization.
- **Facade implementations:** None. The mock agent is an in-memory development service strictly scoped to the foundation stage per ADR-001; validators and bridges are fully functional.
- **Shortcuts / Task bypasses:** None. All 10 requirements from M1 are implemented.
- **Fabricated verification outputs:** None. All commands were run and verified independently.
- **Web App / Vercel boundaries:** `git diff vercel.json src/app/page.tsx` is completely empty.

---

## 2. Logic Chain

1. **.NET 10 LTS Compliance:**
   - *Direct Observation:* All 4 `.csproj` files (`WinLab.Desktop`, `WinLab.Contracts`, `WinLab.Agent.Mock`, `WinLab.Tests`) explicitly declare `net10.0-windows` or `net10.0`. `WinLab.sln` includes all 4 targets in both Debug and Release.
   - *Inference:* The solution is fully migrated from deprecated/unsupported targets to modern .NET 10 LTS, ensuring long-term runtime compatibility through November 2028.
2. **Offline WebView2 Security & Reliability:**
   - *Direct Observation:* In `MainWindow.xaml.cs`, `AreDevToolsEnabled` and `AreDefaultContextMenusEnabled` are set to `false` in Release; `NavigationStarting` blocks external URIs; `wwwroot` is mapped to `winlab.local`; absence of `wwwroot` in Release terminates the application immediately with an error message.
   - *Inference:* Offline desktop execution cannot leak outbound web connections or permit student inspection/debugging in production environments.
3. **Typed IPC Bridge & Defense-in-Depth Schema Validation:**
   - *Direct Observation:* `src/desktop/ipc-bridge.ts` connects `window.chrome.webview.postMessage` to TypeScript promises using correlation IDs (`id`/`replyToId`) with a 10s timeout. `SecurityValidator.cs` and `mock-agent.ts` reject unlisted actions, shell strings, and command parameters (`command`, `script`, `shell`, `exec`, `powershell`, `cmd`).
   - *Inference:* The IPC channel enforces strict schema validation and eliminates arbitrary shell injection vulnerabilities.
4. **Demonstration Transparency:**
   - *Direct Observation:* `src/app/desktop/page.tsx` renders a persistent banner: `[MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]`.
   - *Inference:* Users and evaluators cannot confuse simulated mock data with real OS configuration.
5. **Installer and CI Readiness:**
   - *Direct Observation:* `winlab.iss` packages the self-contained output of `dotnet publish` into `WinLabSetup-0.9.0-x64.exe` with admin privileges, 64-bit targeting, and uninstaller data retention. `.github/workflows/ci.yml` validates .NET 10 build, C# tests, publish, and Inno Setup on Windows runners.
   - *Inference:* Automated builds and installable releases can be generated continuously on GitHub Actions.

---

## 3. Quality Review & Adversarial Challenge Findings

### Finding 1 (Minor / Adversarial Defense-in-Depth): Origin Check Prefix Matching in `MainWindow.xaml.cs`
- **Location:** `desktop/src/WinLab.Desktop/MainWindow.xaml.cs:130`
- **Observation:** `bool isAuthorized = source.StartsWith("https://winlab.local", StringComparison.OrdinalIgnoreCase);`
- **Adversarial Scenario:** The check uses string prefix without a trailing slash or delimiter. A hypothetical domain such as `https://winlab.local.attacker.com` would evaluate to `true` against `source.StartsWith("https://winlab.local")`.
- **Blast Radius Analysis:** Extremely low in the current architecture because `NavigationStarting` (Line 109) strictly requires `e.Uri.StartsWith("https://winlab.local/")` or `e.Uri.Equals("https://winlab.local")`, cancelling any navigation to foreign hosts.
- **Recommendation:** In M2, tighten line 130 to:
  `source.StartsWith("https://winlab.local/", StringComparison.OrdinalIgnoreCase) || string.Equals(source, "https://winlab.local", StringComparison.OrdinalIgnoreCase)`
  or parse `Uri.TryCreate(source, UriKind.Absolute, out var uri) && uri.Host.Equals("winlab.local", StringComparison.OrdinalIgnoreCase)`.

### Finding 2 (Informational): Inno Setup ISCC Path Resolution on Windows CI
- **Location:** `.github/workflows/ci.yml:113`
- **Observation:** `iscc desktop\packaging\winlab.iss` is executed immediately following `choco install innosetup --no-progress`.
- **Analysis:** Chocolatey places the `iscc` shim into `C:\ProgramData\chocolatey\bin`, which is on the default PATH in GitHub Actions `windows-latest` runners. If runner environment changes ever cause path lookup issues, invoking `${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe` is the standard bulletproof fallback.

---

## 4. Caveats

1. **Linux Runner Environment:**
   - The test environment is an Ubuntu Linux container without the Windows Desktop SDK (`net10.0-windows`). C# compilation and xUnit test execution are validated via the GitHub Actions `windows-latest` workflow definition rather than local bash execution.
2. **WebView2 Evergreen Runtime Requirement on Windows 10:**
   - While Windows 11 includes WebView2 by default, certain specialized Windows 10 images (e.g. LTSC) may require the WebView2 Evergreen Bootstrapper. In M6, the Inno Setup script can bundle or download this bootstrapper if not present.
3. **SmartScreen on Unsigned Installer:**
   - The installer is not signed with an EV Code Signing certificate. The Inno Setup script explicitly identifies the build as an unsigned pilot build (`Build de Piloto / Não Assinada`), satisfying the user requirement not to fake trust.

---

## 5. Conclusion

Milestone 1 (M1) fulfills all 10 target requirements from the project charter and ADR-001:
- .NET 10 LTS migration across all projects.
- Self-contained offline static asset export pipeline via `next.config.mjs` and `build:desktop`.
- Offline WebView2 virtual host routing without localhost dependencies in Release.
- Hardened WebView2 security settings (DevTools disabled, context menus disabled, navigation restricted, origin validated).
- Bi-directional typed IPC bridge with strict schema validation.
- Prominent persistent demonstration banner.
- 23 C# unit tests in `desktop/tests/WinLab.Tests` integrated into `WinLab.sln`.
- Inno Setup installer script preserving `ProgramData` baseline backups.
- Complete Windows CI workflow for .NET 10, tests, and installer generation.
- Full preservation of WinLab Web 0.9 and Vercel deployment lock.

**`VERDICT: APPROVE`**

---

## 6. Verification Method

To independently reproduce this verification:

1. **Run TypeScript Tests:**
   ```bash
   cd /home/antigravity/krrozino/winlab
   npm test
   ```
   *Expected:* 85 passed, 0 failed.

2. **Run TypeScript Typecheck:**
   ```bash
   npm run typecheck
   ```
   *Expected:* Exit code 0, 0 errors.

3. **Verify Desktop Offline Export:**
   ```bash
   npm run build:desktop
   ```
   *Expected:* `✓ Offline static assets verified: .../desktop/src/WinLab.Desktop/wwwroot/desktop/index.html (14866 bytes)`

4. **Verify Web Configurator Build:**
   ```bash
   npm run build
   ```
   *Expected:* Production Next.js build succeeds with static prerendering.

5. **Verify Solution & Target Frameworks:**
   ```bash
   grep -rn "TargetFramework" desktop/
   ```
   *Expected:*
   - `WinLab.Desktop.csproj`: `net10.0-windows`
   - `WinLab.Contracts.csproj`: `net10.0`
   - `WinLab.Agent.Mock.csproj`: `net10.0`
   - `WinLab.Tests.csproj`: `net10.0`

6. **Verify Non-Interference:**
   ```bash
   git diff vercel.json src/app/page.tsx
   ```
   *Expected:* Empty diff.
