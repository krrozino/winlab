## 2026-11-10T20:29:59Z

You are the Implementation Worker for Milestone 1 (M1): Foundation Audit, .NET 10 LTS & Offline WebView2.
Your working directory is: /home/antigravity/krrozino/winlab/.agents/teamwork/worker_m1
Your parent is the Project Orchestrator (Conversation ID: 0b7fefcdb266ef2c358377a3938321e9).

MANDATORY FIRST STEP:
Read the authoritative user request at:
/home/antigravity/krrozino/winlab/.agents/teamwork/ORIGINAL_REQUEST.md
Also read the master project plan at:
/home/antigravity/krrozino/winlab/.agents/teamwork/PROJECT.md
And read the comprehensive survey reports:
- /home/antigravity/krrozino/winlab/.agents/teamwork/survey_desktop_1/handoff.md
- /home/antigravity/krrozino/winlab/.agents/teamwork/survey_ci_packaging_1/handoff.md
- /home/antigravity/krrozino/winlab/.agents/teamwork/spec_miner_policies_1/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Tasks for Milestone 1:
1. .NET 10 LTS Migration:
   - In `desktop/src/WinLab.Desktop/WinLab.Desktop.csproj`: Upgrade TargetFramework to `net10.0-windows`. Add `<Content Include="wwwroot\**" CopyToOutputDirectory="PreserveNewest" />`.
   - In `desktop/src/WinLab.Contracts/WinLab.Contracts.csproj` and `desktop/src/WinLab.Agent.Mock/WinLab.Agent.Mock.csproj`: Upgrade TargetFramework to `net10.0`.
   - Remove external `System.Text.Json` NuGet reference (provided by .NET 10 BCL).
2. Offline Static Asset Pipeline:
   - Create `next.config.mjs` supporting static export (`output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`, destination `desktop/src/WinLab.Desktop/wwwroot`) when `WINLAB_DESKTOP_EXPORT === "true"`.
   - Update `package.json` with script `"build:desktop": "WINLAB_DESKTOP_EXPORT=true next build"` and copy/export verification. Ensure standard `npm run build` still generates `.next` for web compatibility.
3. WebView2 Security Hardening in `desktop/src/WinLab.Desktop/MainWindow.xaml.cs`:
   - Enforce origin validation in `CoreWebView2_WebMessageReceived`: reject any message where `e.Source != "https://winlab.local"`.
   - Add `NavigationStarting` listener to cancel navigation outside `https://winlab.local/*`.
   - Release configuration (`#if !DEBUG`): disable DevTools (`AreDevToolsEnabled = false`), disable context menu, remove fallback to `http://localhost:3000/desktop` and show an error dialog if `wwwroot` is missing.
4. Bi-directional Typed IPC Bridge:
   - In `src/desktop/`: Implement typed `window.chrome.webview.postMessage` bridge with promise correlation (`id`/`replyToId`) and timeout.
   - In `src/app/desktop/page.tsx`: Detect if running inside WebView2 (`window.chrome?.webview?.postMessage`); if present, use the real IPC bridge to C# host; if in pure web browser, use `MockDesktopAgent` fallback.
5. Persistent Demonstration Banner:
   - Add a persistent banner in `src/app/desktop/page.tsx` clearly indicating: `[MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]`.
6. Typed Schema Validation:
   - In `desktop/src/WinLab.Contracts/SecurityValidator.cs` and `src/desktop/mock-agent.ts`: replace fragile substring checks with strict typed action allowlists and schema validation.
7. C# Unit Test Suite:
   - Create xUnit test project `desktop/tests/WinLab.Tests/WinLab.Tests.csproj` targeting `net10.0`.
   - Add unit tests for `SecurityValidator`, `IpcEnvelope` serialization/deserialization, and `MockAgentService`.
   - Add `WinLab.Tests.csproj` to `desktop/WinLab.sln`.
8. GitHub Actions CI Enhancement:
   - In `.github/workflows/ci.yml`: Add `desktop-windows` job running on `windows-latest` with `actions/setup-dotnet@v4` (`dotnet-version: '10.0.x'`), `npm run build:desktop`, `dotnet restore desktop/WinLab.sln`, `dotnet build desktop/WinLab.sln -c Release`, `dotnet test desktop/WinLab.sln -c Release`, and `dotnet publish`.
9. Inno Setup Packaging Script:
   - Create `desktop/packaging/winlab.iss` to package self-contained x64 build into `WinLabSetup-0.9.0-x64.exe` with admin privileges, Program Files installation, Start Menu shortcuts, and uninstaller.
10. Build & Test Verification:
   - Run `npm test`, `npm run typecheck`, `npm run build:desktop`, and `npm run build`. Verify all tests pass, TypeScript compiles cleanly, and `desktop/src/WinLab.Desktop/wwwroot/desktop/index.html` exists.

Write Boundaries:
- You exclusively own: `desktop/`, `next.config.mjs`, `package.json`, `src/desktop/`, `src/app/desktop/page.tsx`, `.github/workflows/ci.yml`.
- DO NOT MODIFY `vercel.json` (ensure `git.deploymentEnabled: false` remains intact).
- DO NOT MODIFY `src/app/page.tsx` (preserve web configurator).
- DO NOT TOUCH `.agents/teamwork/` except your own folder (`/home/antigravity/krrozino/winlab/.agents/teamwork/worker_m1`).
