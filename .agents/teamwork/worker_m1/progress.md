# Progress Tracker - Milestone 1 (M1)

Last visited: 2026-11-10T20:44:30Z

## Status
Milestone 1 Implementation and Verification COMPLETED.

## Completed Tasks
- [x] Initialized DISPATCH.md, BRIEFING.md, and progress.md
- [x] Read ORIGINAL_REQUEST.md, PROJECT.md, and survey reports
- [x] .NET 10 LTS Migration:
  - Upgraded `WinLab.Desktop.csproj` to `net10.0-windows`
  - Added `<Content Include="wwwroot\**" CopyToOutputDirectory="PreserveNewest" />`
  - Upgraded `WinLab.Contracts.csproj` and `WinLab.Agent.Mock.csproj` to `net10.0`
  - Removed external `System.Text.Json` NuGet reference (using .NET 10 BCL)
- [x] Offline Static Asset Pipeline:
  - Created `next.config.mjs` supporting `output: 'export'`, `trailingSlash: true`, `images: { unoptimized: true }`, destination `desktop/src/WinLab.Desktop/wwwroot`
  - Added `build:desktop` script and `scripts/verify-desktop-export.mjs`
  - Verified standard `npm run build` still generates `.next` for web compatibility
- [x] WebView2 Security Hardening:
  - Enforced origin validation in `CoreWebView2_WebMessageReceived` (`https://winlab.local`)
  - Added `NavigationStarting` listener to cancel navigation outside `https://winlab.local/*`
  - Release configuration: disabled DevTools, disabled context menu, removed `localhost:3000` fallback, and added error dialog if `wwwroot` is missing
- [x] Bi-directional Typed IPC Bridge:
  - Created `src/desktop/ipc-bridge.ts` with `WebViewIpcBridge` using `window.chrome.webview.postMessage`, promise correlation (`id`/`replyToId`), and timeout
  - Updated `src/app/desktop/page.tsx` to detect WebView2 runtime and dynamically connect to native C# bridge or fallback to `MockDesktopAgent`
- [x] Persistent Demonstration Banner:
  - Added persistent alert banner in `src/app/desktop/page.tsx`: `[MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]`
- [x] Typed Schema Validation:
  - Implemented `ValidateEnvelopeSchema` in `desktop/src/WinLab.Contracts/SecurityValidator.cs` and `validateEnvelopeSchema` in `src/desktop/mock-agent.ts`
  - Enforced strict allowlist and rejection of payload command fields (`command`, `script`, `shell`, `exec`, etc.)
- [x] C# Unit Test Suite:
  - Created xUnit test project `desktop/tests/WinLab.Tests/WinLab.Tests.csproj` targeting `net10.0`
  - Added `SecurityValidatorTests.cs`, `IpcContractTests.cs`, `MockAgentServiceTests.cs`
  - Added `WinLab.Tests.csproj` to `desktop/WinLab.sln`
- [x] GitHub Actions CI Enhancement:
  - Added `desktop-windows` job to `.github/workflows/ci.yml` running on `windows-latest` with `actions/setup-dotnet@v4` (`10.0.x`), `npm run build:desktop`, `dotnet restore`, `dotnet build`, `dotnet test`, `dotnet publish`, and Inno Setup compilation
- [x] Inno Setup Packaging Script:
  - Created `desktop/packaging/winlab.iss` for self-contained x64 installer `WinLabSetup-0.9.0-x64.exe` with admin privileges, Program Files installation, Start Menu shortcuts, and uninstaller
- [x] Build & Test Verification:
  - `npm test`: 85 passing tests (0 failures)
  - `npm run typecheck`: 0 errors
  - `npm run build:desktop`: static export verified (14866 bytes at `desktop/src/WinLab.Desktop/wwwroot/desktop/index.html`)
  - `npm run build`: generates `.next` for web compatibility without errors
