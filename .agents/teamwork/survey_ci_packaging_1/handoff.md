# Handoff Report: CI, Packaging & Offline Distribution Survey

**Subagent:** CI & Packaging Explorer (`survey_ci_packaging_1`)  
**Parent Agent:** Project Orchestrator (`0b7fefcdb266ef2c358377a3938321e9`)  
**Date:** 2026-11-10T20:26:00Z  
**Branch:** `feat/winlab-desktop-foundation`  

---

## 1. Observation

### 1.1 Vercel Configuration & Deployment Lock (`vercel.json`)
- **File path:** `/home/antigravity/krrozino/winlab/vercel.json` (lines 1–10)
- **Direct quote:**
  ```json
  {
    "$schema": "https://openapi.vercel.sh/vercel.json",
    "framework": "nextjs",
    "buildCommand": "npm run build",
    "outputDirectory": ".next",
    "git": {
      "deploymentEnabled": false
    }
  }
  ```
- **Findings:** `git.deploymentEnabled: false` is strictly present and intact. Furthermore, Vercel specifies `"buildCommand": "npm run build"` with `"outputDirectory": ".next"`.

### 1.2 GitHub Actions Workflows (`.github/workflows/ci.yml`)
- **File path:** `/home/antigravity/krrozino/winlab/.github/workflows/ci.yml` (lines 1–70)
- **Existing Jobs:**
  1. `validate` (lines 17–42): Runs on `ubuntu-latest` with Node.js 22. Executes `npm test`, `npm run typecheck`, and `npm run build`.
  2. `windows-powershell` (lines 43–70): Runs on `windows-latest` with Node.js 22. Executes `npm run fixtures` (`tsx scripts/generate-ci-fixtures.ts`), then runs `.\scripts\validate-generated-powershell.ps1` with Windows PowerShell 5.1 and PowerShell 7 (`pwsh`).
- **Gaps Observed:**
  - **Zero .NET jobs or steps:** No `actions/setup-dotnet`, no `dotnet restore`, no `dotnet build`, no `dotnet test`, and no `dotnet publish`.
  - **No desktop packaging or installer generation:** The Windows CI runner does not compile `desktop/WinLab.sln` or package an installer artifact.
  - **No static export verification:** No step generates or tests the offline `wwwroot` web assets.

### 1.3 Next.js Build, Packaging & Static Export Feasibility
- **File path:** `/home/antigravity/krrozino/winlab/package.json` (lines 1–27)
  - Dependencies: `"next": "16.3.3"`, `"react": "^19.2.0"`, `"react-dom": "^19.2.0"`.
  - DevDependencies: `"tsx": "^4.20.6"`, `"typescript": "^5.9.0"`.
  - Scripts:
    - `"dev": "next dev"`
    - `"test": "tsx --test tests/*.test.ts"`
    - `"typecheck": "tsc --noEmit"`
    - `"build": "next build"`
    - `"check": "npm test && npm run typecheck && npm run build"`
    - `"fixtures": "tsx scripts/generate-ci-fixtures.ts"`
- **Next.js Config:** No `next.config.js`, `next.config.mjs`, or `next.config.ts` exists at the repository root.
- **Route Structure in `src/app/`:**
  - `src/app/page.tsx` (`"use client"`, web configurator)
  - `src/app/desktop/page.tsx` (`"use client"`, desktop companion interface)
  - `src/app/layout.tsx` (standard layout)
  - `src/app/globals.css` (Tailwind/CSS styles)
  - **No server components, no API routes (`src/app/api`), no dynamic parameters `[id]`, no `headers()`, no `cookies()`**.
- **Build Output Verification:**
  - Executing `npm run build` completed successfully:
    ```
    Route (app)
    ┌ ○ /
    ├ ○ /_not-found
    └ ○ /desktop
    ○  (Static)  prerendered as static content
    ```
- **Export Routing Mismatch in WebView2:**
  - `desktop/src/WinLab.Desktop/MainWindow.xaml.cs` (line 55):
    `WebView.CoreWebView2.Navigate("https://winlab.local/desktop/index.html");`
  - Next.js default static export without `trailingSlash: true` writes `out/desktop.html` (which results in 404 when navigating to `desktop/index.html`).
  - Next.js static export with `trailingSlash: true` creates `out/desktop/index.html`, perfectly satisfying `https://winlab.local/desktop/index.html`.

### 1.4 Desktop Projects & TargetFrameworks
- **Solution:** `/home/antigravity/krrozino/winlab/desktop/WinLab.sln`
  - Contains three projects: `WinLab.Contracts`, `WinLab.Agent.Mock`, and `WinLab.Desktop`.
- **Project Files:**
  - `desktop/src/WinLab.Contracts/WinLab.Contracts.csproj` (line 4): `<TargetFramework>netstandard2.0</TargetFramework>`, `<PackageReference Include="System.Text.Json" Version="8.0.5" />`
  - `desktop/src/WinLab.Agent.Mock/WinLab.Agent.Mock.csproj` (line 4): `<TargetFramework>netstandard2.0</TargetFramework>`, `<PackageReference Include="System.Text.Json" Version="8.0.5" />`
  - `desktop/src/WinLab.Desktop/WinLab.Desktop.csproj` (lines 5–7): `<TargetFramework>net8.0-windows</TargetFramework>`, `<UseWPF>true</UseWPF>`, `<PackageReference Include="Microsoft.Web.WebView2" Version="1.0.2849.39" />`
- **Asset Packaging in `.csproj`:**
  - `WinLab.Desktop.csproj` has **no `<Content>` or `<None>` entry** to automatically copy `wwwroot\**` to output directory upon build or publish.
- **Manifest:**
  - `desktop/src/WinLab.Desktop/app.manifest` (line 8): `<requestedExecutionLevel level="asInvoker" uiAccess="false" />` correctly enforces unprivileged execution.
- **PR #24 Review Feedback (Owner `krrozino` on 2026-11-10):**
  - .NET 8 support terminates on 10/11/2026; upgrade to .NET 10 LTS is required.
  - Add native Windows CI with `dotnet restore`, `dotnet build desktop/WinLab.sln -c Release`, and C# tests.
  - Produce real offline static assets in `wwwroot/desktop/index.html`, remove `localhost:3000` fallback in Release, and harden WebView2 message origin checks (`e.Source == "https://winlab.local"`).

### 1.5 Test Suites Review
- **Existing Tests:**
  - Executed `npm test` (`tsx --test tests/*.test.ts`).
  - `tests/core.test.ts` (47 tests): Covers legacy configs, AppLocker generation, registry generators, preflight parsing, pilot candidate validation, and package hashing.
  - `tests/desktop-ipc.test.ts` (9 tests): Covers IPC constants, shell pattern checking, action allowlist, mutation blocking, and MockDesktopAgent in TypeScript.
  - Result: 56 passing tests (0 failures).
- **Missing Tests:**
  - **Zero C# unit tests:** No test project exists in `desktop/` or in `desktop/WinLab.sln`. `SecurityValidator.cs` and `MockAgentService.cs` are not tested in .NET.

---

## 2. Logic Chain

1. **Vercel Lock vs Desktop Export:**
   - Because `vercel.json` maps `"buildCommand": "npm run build"` to `"outputDirectory": ".next"` and `git.deploymentEnabled: false` must not be tampered with, default `npm run build` must continue producing `.next` for web compatibility.
   - Therefore, desktop static export should be driven by a dedicated npm script (e.g. `npm run export:desktop`) utilizing an environment flag (e.g. `WINLAB_DESKTOP_EXPORT=true`) inside `next.config.mjs` that enables `output: 'export'` and `trailingSlash: true`.

2. **Offline WebView2 Hosting:**
   - In `MainWindow.xaml.cs`, WebView2 registers a virtual host mapping:
     `SetVirtualHostNameToFolderMapping("winlab.local", assetsDirectory, CoreWebView2HostResourceAccessKind.Allow)`.
   - With `trailingSlash: true`, Next.js exports `/desktop/index.html` and `/_next/static/...`.
   - When WebView2 requests `https://winlab.local/desktop/index.html`, it resolves directly to `<assetsDirectory>\desktop\index.html`.
   - To make this work deterministically without manual copying, `WinLab.Desktop.csproj` must include:
     ```xml
     <ItemGroup>
       <Content Include="wwwroot\**" CopyToOutputDirectory="PreserveNewest" />
     </ItemGroup>
     ```
   - In Release builds (`#if !DEBUG`), the fallback `WebView.CoreWebView2.Navigate("http://localhost:3000/desktop")` must be removed and replaced with a fatal error dialog if `wwwroot` is absent.
   - In `MainWindow.xaml.cs`, `CoreWebView2_WebMessageReceived` must validate `e.Source == "https://winlab.local"` before dispatching to the bridge.

3. **.NET 10 Migration on Windows CI:**
   - Microsoft .NET 8 LTS reaches End of Life on November 10, 2026. .NET 10 is the active LTS release.
   - GitHub Actions `windows-latest` supports .NET 10 via `actions/setup-dotnet@v4` with `dotnet-version: '10.0.x'`.
   - Projects should migrate to:
     - `WinLab.Desktop.csproj`: `<TargetFramework>net10.0-windows</TargetFramework>`
     - `WinLab.Contracts.csproj`: `<TargetFramework>net10.0</TargetFramework>`
     - `WinLab.Agent.Mock.csproj`: `<TargetFramework>net10.0</TargetFramework>`
     - C# Unit Test Project `desktop/tests/WinLab.Tests/WinLab.Tests.csproj`: `<TargetFramework>net10.0</TargetFramework>`
   - `System.Text.Json 8.0.5` package reference should be removed as it is provided natively in the .NET 10 shared framework.

4. **Offline Packaging Tool Selection (Inno Setup vs WiX vs MSIX):**
   - **Evaluation Criteria from ORIGINAL_REQUEST.md:**
     - Must install to Program Files (`C:\Program Files\WinLab`).
     - Must request administrator privileges upon installation.
     - Must create Start Menu shortcuts and optional Desktop shortcuts.
     - Must not require Node.js, npm, or .NET 10 SDK on the client PC.
     - Must handle uninstallation cleanly while preserving `C:\ProgramData\WinLab` configurations/backups.
     - Must clearly identify builds as unsigned/test without a trusted EV/OV code-signing certificate.
   - **Tool Comparison:**
     - **Inno Setup (.exe installer):**
       - Built-in `PrivilegesRequired=admin` (triggers standard UAC prompt on install).
       - Built-in `DefaultDirName={autopf}\WinLab`.
       - Built-in Start Menu and Desktop shortcut tasks.
       - Built-in uninstallation registry registration and clean file removal.
       - Can detect Microsoft Edge WebView2 Evergreen Runtime in registry (`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-234A-4275-A142-5AB05DC8B95F}`).
       - Works smoothly on unsigned builds (Windows SmartScreen warning is standard; does not block installation like MSIX).
       - Easily compilable in GitHub Actions via `iscc` or Chocolatey (`choco install innosetup`).
     - **WiX Toolset v4/v5 (.msi installer):**
       - Excellent for enterprise Active Directory GPO deployment.
       - Requires harvesting complex XML directories (`wix harvest`) for static web assets.
       - Better positioned as a secondary packaging target for enterprise deployment in Milestone M6.
     - **MSIX / Windows Application Packaging Project:**
       - **Disqualified for test/pilot builds:** Windows 10/11 strictly blocks installing unsigned MSIX packages without manually installing a self-signed root cert or enabling Developer Mode.
   - **Standalone Distribution Strategy:**
     - Use .NET 10 self-contained single-file publish:
       `dotnet publish desktop/src/WinLab.Desktop/WinLab.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o artifacts/publish/desktop`
     - This bundles the .NET runtime and WPF host into `WinLab.Desktop.exe` along with `WebView2Loader.dll` and the `wwwroot` directory.
     - Inno Setup wraps this published folder into `WinLabSetup-0.9.0-x64.exe`.

---

## 3. Caveats

1. **Linux Runner Environment Limitation:**
   - The current development environment is Linux x86_64 without `dotnet` installed. WPF (`net10.0-windows`) cannot be compiled or tested on Linux. Real compilation and execution tests must run on GitHub Actions `windows-latest` or a Windows VM.
2. **WebView2 Evergreen Runtime Requirement:**
   - Although .NET 10 is bundled self-contained, the client machine must have Microsoft Edge WebView2 Evergreen Runtime installed. It is present out-of-the-box on Windows 11 and Windows 10 (version 2004+ with modern updates), but Windows Server or stripped editions require running the WebView2 Evergreen Bootstrapper.
3. **Code Signing:**
   - No trusted hardware security module (HSM) OV/EV certificate is configured in GitHub Secrets. Installers produced in CI will be unsigned and must display a clear disclaimer banner during setup indicating they are experimental pilot/test builds.

---

## 4. Conclusion & Concrete Recommendations

### Summary of Survey Assessment
The existing foundation demonstrates that the web configurator can be exported as a static SPA for offline hosting via WebView2's `winlab.local` virtual host mapping. However, the CI pipeline is currently incomplete (missing .NET compilation and packaging), and the desktop projects are targeting end-of-life .NET 8.

### Actionable Implementation Blueprint

#### 1. Next.js Configuration (`next.config.mjs`)
Create `next.config.mjs` at repository root:
```javascript
const isDesktopExport = process.env.WINLAB_DESKTOP_EXPORT === "true";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(isDesktopExport ? {
    output: "export",
    trailingSlash: true,
    distDir: "desktop/src/WinLab.Desktop/wwwroot",
    images: { unoptimized: true }
  } : {})
};

export default nextConfig;
```
Add to `package.json`:
```json
"scripts": {
  "build:desktop": "cross-env WINLAB_DESKTOP_EXPORT=true next build"
}
```

#### 2. .NET 10 Migration
- Update `WinLab.Desktop.csproj` to `<TargetFramework>net10.0-windows</TargetFramework>`.
- Update `WinLab.Contracts.csproj` and `WinLab.Agent.Mock.csproj` to `<TargetFramework>net10.0</TargetFramework>`.
- Remove `<PackageReference Include="System.Text.Json" Version="8.0.5" />` (use built-in .NET 10 BCL).
- Add asset bundling to `WinLab.Desktop.csproj`:
  ```xml
  <ItemGroup>
    <Content Include="wwwroot\**" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
  ```

#### 3. C# Test Suite (`desktop/tests/WinLab.Tests`)
Create a new xUnit test project `desktop/tests/WinLab.Tests/WinLab.Tests.csproj` targeting `net10.0`, covering:
- `SecurityValidatorTests.cs`: Allowlist action validation, shell pattern rejection, equal admin/student account rejection, foundation stage mutation lock.
- `IpcContractTests.cs`: `IpcEnvelope` serialization, round-trip deserialization, and schema validation.
- `MockAgentServiceTests.cs`: Handling queries and verifying structured responses.

#### 4. WebView2 Security Hardening in `MainWindow.xaml.cs`
- `#if !DEBUG`: Set `WebView.CoreWebView2.Settings.AreDevToolsEnabled = false;`.
- Remove fallback to `localhost:3000` in Release mode.
- In `CoreWebView2_WebMessageReceived`:
  ```csharp
  if (e.Source != "https://winlab.local")
  {
      return; // Reject messages from unauthorized origins
  }
  ```
- Add `NavigationStarting` listener to cancel navigation outside `https://winlab.local/*`.

#### 5. Inno Setup Packaging (`desktop/packaging/winlab.iss`)
Create an Inno Setup script with:
- `AppId={{D41640D1-84E3-4D90-8E07-1F459039E1B8}}`
- `AppName=WinLab Desktop`
- `AppVersion=0.9.0`
- `DefaultDirName={autopf}\WinLab`
- `PrivilegesRequired=admin`
- `OutputBaseFilename=WinLabSetup-0.9.0-x64`
- Shortcuts in `{autoprograms}\WinLab` and optional Desktop icon.
- Uninstaller preserving `C:\ProgramData\WinLab`.

#### 6. GitHub Actions CI Enhancement (`.github/workflows/ci.yml`)
Add a new job `build-desktop` to `.github/workflows/ci.yml`:
```yaml
  desktop-windows:
    name: Build & Package Desktop on Windows
    runs-on: windows-latest
    timeout-minutes: 25

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Setup .NET 10 SDK
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Install npm dependencies
        run: npm install --no-audit --no-fund

      - name: Export Desktop Static Assets
        run: npm run build:desktop

      - name: Restore .NET dependencies
        run: dotnet restore desktop/WinLab.sln

      - name: Build Desktop (Release)
        run: dotnet build desktop/WinLab.sln -c Release --no-restore

      - name: Run C# Tests
        run: dotnet test desktop/WinLab.sln -c Release --no-build --verbosity normal

      - name: Publish Self-Contained Win-x64
        run: dotnet publish desktop/src/WinLab.Desktop/WinLab.Desktop.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o artifacts/publish/desktop

      - name: Compile Inno Setup Installer
        run: |
          choco install innosetup --no-progress
          iscc desktop/packaging/winlab.iss

      - name: Upload Installer Artifact
        uses: actions/upload-artifact@v4
        with:
          name: WinLab-Desktop-Installer-x64
          path: artifacts/installers/*.exe
```

---

## 5. Verification Method

To independently verify the observations and conclusions in this report:

1. **Verify Vercel Lock:**
   ```bash
   cat vercel.json
   ```
   Check that line 7 shows `"deploymentEnabled": false`.

2. **Verify Existing Tests and Static Prerender:**
   ```bash
   npm test
   npm run typecheck
   npm run build
   ```
   Confirm 56 tests pass, typecheck succeeds, and `next build` static output displays routes `/`, `/_not-found`, and `/desktop`.

3. **Verify TargetFramework in Solution:**
   ```bash
   grep -rn "TargetFramework" desktop/src/
   ```
   Confirm `net8.0-windows` in `WinLab.Desktop.csproj` and `netstandard2.0` in `WinLab.Contracts.csproj`.

4. **Verify WebView2 Virtual Host URL in WPF Host:**
   ```bash
   grep -rn "winlab.local" desktop/src/
   ```
   Observe line 55 of `MainWindow.xaml.cs` referencing `"https://winlab.local/desktop/index.html"`.

5. **Invalidation Conditions:**
   - If Next.js static export fails to output static assets compatible with `CoreWebView2.SetVirtualHostNameToFolderMapping`.
   - If .NET 10 SDK is unavailable on GitHub Actions `windows-latest` via `actions/setup-dotnet@v4`.
   - If `git.deploymentEnabled: false` is removed or modified in `vercel.json`.
