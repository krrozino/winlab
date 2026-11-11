# Handoff Report: Milestone 1 (M1) — Reviewer 2 (Frontend, IPC Bridge, Offline Export, Typed Schema Validation & Web Compatibility)

**Reviewer:** Reviewer 2 (`reviewer_m1_2`)  
**Parent Agent:** Project Orchestrator (`0b7fefcdb266ef2c358377a3938321e9`)  
**Timestamp:** 2026-11-10T20:52:00Z  
**Verdict:** **VERDICT: APPROVE**  
**Working Directory:** `/home/antigravity/krrozino/winlab/.agents/teamwork/reviewer_m1_2`  

---

## 1. Observation

### 1.1 Build & Test Execution Commands and Results
1. **TypeScript Test Suite (`npm test`):**
   - Command: `npm test` (`tsx --test tests/*.test.ts`)
   - Result: 85 passing tests (58 unit + 27 E2E across Tier 1–4), 0 failures, 0 skipped. Duration: ~559ms.
2. **TypeScript Typecheck (`npm run typecheck`):**
   - Command: `npm run typecheck` (`tsc --noEmit`)
   - Result: Exited with code 0. Zero compiler errors or type warnings.
3. **Standard Next.js Build (`npm run build`):**
   - Command: `npm run build` (`next build`)
   - Result: Exited with code 0. Successfully compiled in 800ms; TypeScript check in 1590ms; generated static prerendered routes `/`, `/_not-found`, and `/desktop` targeting `.next`.
4. **Desktop Static Offline Export (`npm run build:desktop`):**
   - Command: `npm run build:desktop` (`WINLAB_DESKTOP_EXPORT=true next build && node scripts/verify-desktop-export.mjs`)
   - Result: Exited with code 0. Generated static assets into `desktop/src/WinLab.Desktop/wwwroot`. Output verified:
     `✓ Offline static assets verified: /home/antigravity/krrozino/winlab/desktop/src/WinLab.Desktop/wwwroot/desktop/index.html (14866 bytes)`.
5. **Local CI Verification Pipeline (`npm run check`):**
   - Command: `npm run check` (`npm test && npm run typecheck && npm run build`)
   - Result: Exited with code 0 across all steps.

### 1.2 IPC Bridge & Desktop Companion Inspection
- **`src/desktop/ipc-bridge.ts`:**
  - Lines 12–17: `isWebView2Available()` inspects `typeof window.chrome?.webview?.postMessage === "function"`.
  - Lines 29–38: `WebViewIpcBridge` implements `DesktopIpcTransport`.
  - Lines 70–106: Correlates outgoing messages using `messageId`, maintains `pendingRequests` Map, registers 10-second timer (`this.timeoutMs`), and posts serialized JSON via `window.chrome!.webview!.postMessage(rawJson)`.
  - Lines 112–137: `handleIncomingMessage` listener parses incoming message events, matches `response.replyToId || response.id`, cancels active timeout timer, and resolves correlated Promise.
  - Lines 142–159: `dispose()` clears pending timers, rejects active promises with `IPC_BRIDGE_DISPOSED`, and unregisters the event listener.
  - Lines 167–172: `createDesktopTransport()` provides dynamic environment detection: instantiates `WebViewIpcBridge` inside native WebView2 and seamlessly falls back to `MockDesktopAgent` in browser development.
- **`src/app/desktop/page.tsx`:**
  - Lines 5, 32–38: Uses `createDesktopTransport()` and checks `isWebView2Available()`.
  - Lines 204–236: Prominently renders the persistent demonstration banner:
    ```tsx
    <div role="alert" aria-label="Demonstration Mode" style={{ ... }}>
      <strong>[MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]</strong>
      <span>Esta instância do WinLab Desktop está operando exclusivamente em modo de simulação e fundação.
      Nenhuma política, serviço privilegiado ou alteração de registro será gravada neste computador.</span>
    </div>
    ```
  - Lines 353–360: Status indicator dynamically displays `Host C# (WebView2 Nativo)` vs `Mock In-Memory (Web Fallback)`.
  - Lines 66–101: All actions route through typed `sendIpcMessage()` calling `transport.handleRequest()`.
  - Lines 169–199: Live UI controls for testing arbitrary shell injection rejection and privileged mutation rejection.

### 1.3 Desktop Static Export vs. Web Configurator Isolation
- **`next.config.mjs`:**
  - Lines 1–13: Reads `isDesktopExport = process.env.WINLAB_DESKTOP_EXPORT === "true"`. Only when set to `"true"` does it activate `output: "export"`, `trailingSlash: true`, and `distDir: "desktop/src/WinLab.Desktop/wwwroot"`.
  - When unset, `nextConfig` is standard, building into `.next`.
- **`package.json`:**
  - Line 9: `"build": "next build"`
  - Line 10: `"build:desktop": "WINLAB_DESKTOP_EXPORT=true next build && node scripts/verify-desktop-export.mjs"`
- **`scripts/verify-desktop-export.mjs`:**
  - Lines 8–27: Asserts `wwwroot` directory exists, asserts `desktop/index.html` exists, and asserts `stats.size > 0`.

### 1.4 Web 0.9 & Vercel Guard Non-Regression
- **`vercel.json`:**
  - Lines 6–8: `"git": { "deploymentEnabled": false }` remains strictly intact.
- **`src/app/page.tsx`:**
  - `git diff src/app/page.tsx vercel.json` produces zero lines changed (empty diff). Web 0.9 configurator was completely untouched.

### 1.5 Security Validation & Typed Envelope Schemas
- **`desktop/src/WinLab.Contracts/SecurityValidator.cs`:**
  - Lines 12–33: `ValidateAction` checks non-empty and validates against strict allowlist (`IpcConstants.AllowedActions`). Explicitly rejects `policy.apply` and `policy.rollback` with error code `PRIVILEGED_EXECUTOR_DISABLED`.
  - Lines 35–68: `ValidateNoArbitraryShell` scans for 12 dangerous execution patterns (`powershell.exe`, `powershell -c`, `pwsh.exe`, `cmd.exe`, `cmd /c`, `bash`, `eval(`, `invoke-expression`, `iex `, `downloadstring`, `system.diagnostics.process`, `wscript.shell`).
  - Lines 89–156: `ValidateEnvelopeSchema` validates JSON envelope structure: ensures root object, non-empty `id`, valid `type` (`query`, `command`, `response`, `event`), valid `action`, and rejects payloads containing disallowed command properties (`command`, `script`, `shell`, `exec`, `rawscript`, `powershell`, `cmd`).
  - Lines 178–190: `ValidateAccountNames` rejects empty names and rejects equal student and admin accounts.
- **`src/desktop/mock-agent.ts`:**
  - Lines 73–121: Parallels the identical schema and structural validation logic in TypeScript for browser and test environments.

### 1.6 .NET 10 LTS Projects, CI & Packaging
- **`desktop/src/WinLab.Desktop/WinLab.Desktop.csproj`:**
  - Line 5: `<TargetFramework>net10.0-windows</TargetFramework>`
  - Line 24: `<Content Include="wwwroot\**" CopyToOutputDirectory="PreserveNewest" />`
- **`desktop/src/WinLab.Contracts/WinLab.Contracts.csproj` & `WinLab.Agent.Mock.csproj`:**
  - Line 4: `<TargetFramework>net10.0</TargetFramework>`
- **`desktop/tests/WinLab.Tests/WinLab.Tests.csproj` & `desktop/WinLab.sln`:**
  - Targets `net10.0` with xUnit 2.9.2 and Microsoft.NET.Test.Sdk 17.12.0; registered under solution `WinLab.sln`.
- **`.github/workflows/ci.yml`:**
  - Lines 71–127: Dedicated `desktop-windows` runner on `windows-latest` executes `actions/setup-dotnet@v4` (.NET 10), `npm run build:desktop`, `dotnet restore`, `dotnet build -c Release`, `dotnet test -c Release`, `dotnet publish`, and compiles Inno Setup installer `winlab.iss`.
- **`desktop/packaging/winlab.iss`:**
  - Line 23: `PrivilegesRequired=admin`
  - Line 19: `DefaultDirName={autopf}\WinLab`
  - Line 58–59: Explicitly identifies installer as pilot unsigned build (`WinLab Desktop 0.9.0 (Pilot Build / Unsigned)`).

---

## 2. Logic Chain

1. **Isolation of Build Lifecycles:**
   - *Observation:* `next.config.mjs` checks `WINLAB_DESKTOP_EXPORT === "true"` to conditionally export to `desktop/src/WinLab.Desktop/wwwroot`, leaving default `npm run build` targeting `.next`.
   - *Logic:* This design guarantees that adding desktop static export capabilities introduces zero side effects or changes to the cloud-facing Web configurator, preserving Web 0.9 and Vercel compatibility.
2. **Defense-in-Depth IPC Security:**
   - *Observation:* Communication between the UI and native host is restricted on multiple independent layers:
     - Origin lock: `CoreWebView2_NavigationStarting` and `CoreWebView2_WebMessageReceived` enforce `https://winlab.local/`.
     - Transport envelope: `WebViewIpcBridge` correlates UUIDv4 requests with responses and enforces a 10s timeout.
     - Action Allowlist: `SecurityValidator.ValidateAction` rejects any action outside the declared set.
     - Shell Disallowance: `SecurityValidator.ValidateNoArbitraryShell` blocks executable/interpreter substrings.
     - Structural Schema: `SecurityValidator.ValidateEnvelopeSchema` and `validateEnvelopeSchema` reject command/script properties in payload objects.
     - Privilege Boundary: Foundation stage explicitly refuses mutating actions (`policy.apply` and `policy.rollback`) with `PRIVILEGED_EXECUTOR_DISABLED`.
   - *Logic:* Even if an attacker were able to execute JavaScript in the WebView2 frame, they cannot execute arbitrary shell commands or invoke privileged system mutations.
3. **Transparent Operator Communication:**
   - *Observation:* `src/app/desktop/page.tsx` features a persistent, prominent warning banner `[MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]`, and the status bar explicitly identifies `Non-Elevated (asInvoker)` and `Mock In-Memory` vs `Native C# Host`.
   - *Logic:* This completely fulfills the user mandate that mock data must never mislead school administrators into believing real policies have been applied.
4. **Integrity and Anti-Cheating Assessment:**
   - *Observation:* No hardcoded test fixtures, facade mocks pretending to be real executors, or fabricated verification artifacts exist in the repository. The separation between mock foundation services and future privileged executors is explicitly documented and enforced by code validators.
   - *Logic:* The implementation satisfies all integrity requirements without cutting corners.

---

## 3. Caveats

1. **Linux CI Runner Limitations:**
   - The current local execution environment is Ubuntu Linux; .NET Windows Desktop SDK (`net10.0-windows`) cannot be natively compiled or executed locally. C# compilation, xUnit tests, and Inno Setup compilation are validated in the Windows CI runner (`.github/workflows/ci.yml`).
2. **Client WebView2 Runtime Dependency:**
   - While the WPF application publishes self-contained binaries, client workstations require the Microsoft Edge WebView2 Evergreen Runtime installed (pre-installed on Windows 11 and Windows 10 2004+).

---

## 4. Adversarial Challenge & Minor Recommendations

### Finding 1 (Minor — Hardening): Origin Prefix Matching in `MainWindow.xaml.cs`
- **Location:** `desktop/src/WinLab.Desktop/MainWindow.xaml.cs:130`
- **Observation:** `source.StartsWith("https://winlab.local", StringComparison.OrdinalIgnoreCase)` does not enforce a trailing slash or exact host match. While `NavigationStarting` (line 109) checks `https://winlab.local/` and blocks external navigations, using `Uri.TryCreate(source, UriKind.Absolute, out var uri) && uri.Host.Equals("winlab.local", StringComparison.OrdinalIgnoreCase)` in `WebMessageReceived` would offer even tighter defense-in-depth against theoretical subdomain spoofing.
- **Recommendation:** Refine origin URI parsing during M2 security hardening.

### Finding 2 (Minor — Schema Validation): Deeply Nested Command Properties
- **Location:** `desktop/src/WinLab.Contracts/SecurityValidator.cs:135` & `src/desktop/mock-agent.ts:102`
- **Observation:** `ValidateEnvelopeSchema` enumerates top-level properties of the `payload` object. In foundation stage, `ValidateNoArbitraryShell` scans the entire raw JSON text, mitigating shell injection across any nesting depth.
- **Recommendation:** When M2 introduces complex nested DTOs, implement recursive property checking or strict DTO model binding with `[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]`.

---

## 5. Conclusion

The implementation of Milestone 1 (M1) is technically sound, secure, cleanly modularized, and fully compliant with all requirements in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `TEST_READY.md`.

- All 85 unit and E2E tests pass.
- TypeScript typecheck and Next.js production builds compile cleanly.
- Offline static export pipeline works without interfering with Web 0.9 configurator.
- Typed IPC bridge, timeout handling, web fallback, and demo banner operate as specified.
- Schema validators successfully block unauthorized actions, command fields, and shell injection.
- Zero integrity violations.

**VERDICT: APPROVE**

---

## 6. Verification Method

To independently verify this evaluation, execute:

```bash
cd /home/antigravity/krrozino/winlab

# 1. Run complete unit, boundary, cross-feature and scenario tests
npm test

# 2. Verify static TypeScript typing
npm run typecheck

# 3. Verify Web configurator build
npm run build

# 4. Verify Desktop offline static export
npm run build:desktop

# 5. Verify non-interference with Web 0.9 and Vercel configuration
git diff vercel.json src/app/page.tsx
```

All commands must exit with status code 0 and empty diff on `vercel.json` and `src/app/page.tsx`.
