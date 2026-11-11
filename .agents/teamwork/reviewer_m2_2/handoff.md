# Milestone 2 Code Review: Elevated Executor Architecture & UI Components

**Verdict**: **APPROVE**

---

### Section 1: Observation

1. **Privilege Boundary Enforcement**:
   - `desktop/src/WinLab.Desktop/app.manifest`: Explicitly configured with `<requestedExecutionLevel level="asInvoker" uiAccess="false" />`. The UI host runs without persistent elevation, strictly isolating WebView2 and UI controls from administrative escalation.
   - `desktop/src/WinLab.Executor/app.manifest`: Explicitly configured with `<requestedExecutionLevel level="requireAdministrator" uiAccess="false" />`.
   - `desktop/src/WinLab.Executor/Program.cs` (lines 14–24): Performs mandatory Windows identity check via `WindowsPrincipal.IsInRole(WindowsBuiltInRole.Administrator)`. If unprivileged, it exits immediately with error code `5` (`ERROR_ACCESS_DENIED`).
   - `desktop/src/WinLab.Desktop/Services/ElevatedExecutorClient.cs` (lines 102–126): Spawns the executor with `Verb = "runas"`, `UseShellExecute = true`, and dedicated handling for operator cancellation (`Win32Exception` code `1223` / `ERROR_CANCELLED`), yielding a typed error `UAC_ELEVATION_CANCELLED`.

2. **Named Pipe Security & Architecture**:
   - **Dynamic GUID Pipe Naming**: Generated per session via `Guid.NewGuid().ToString("N")` yielding pipe names like `WinLab_Exec_{pipeId}`, preventing pipe squatting.
   - **256-Bit Cryptographic Session Token**: `ElevatedExecutorClient.cs` generates 32 cryptographically secure random bytes via `RandomNumberGenerator.Create()`, converted to hex and passed via `--token`. In line 165, verification is performed using `CryptographicOperations.FixedTimeEquals` to resist timing analysis.
   - **Mutual PID Verification**: Kernel32 `GetNamedPipeClientProcessId` verifies the client connecting to the named pipe matches the spawned executor PID (`clientPid == _executorProcess.Id`). In reverse, the executor receives `--parent-pid` and attaches a termination watchdog. Handshake exchange (`HandshakeRequest` / `HandshakeResponse`) validates both PID and token before any command processing begins.
   - **16MB Framing Boundary**: `desktop/src/WinLab.Contracts/PipeFraming.cs` defines `MaxFrameSize = 16 * 1024 * 1024` (16MB). Both `WriteFrameAsync` and `ReadFrameAsync` validate frame sizes against `<= 0 || > MaxFrameSize`, throwing `InvalidDataException` on corruption and `EndOfStreamException` on disconnects. Chunked loops guarantee complete reads of header and payload buffers.

3. **Parent Termination Watchdog & Idle Timeout in ExecutorHost**:
   - `desktop/src/WinLab.Executor/ExecutorHost.cs` (`SetupParentWatchdog`, lines 239–261): Hooks `parent.Exited` and checks `parent.HasExited` on startup; if the parent process terminates or is unreachable, the executor exits immediately (`Environment.Exit(0)`), preventing orphaned elevated processes.
   - `ExecutorHost.cs` (lines 75–103): Rolling 5-minute idle timeout (`_idleTimeout = TimeSpan.FromMinutes(5)`) resets upon each valid frame received and cancels the read loop on expiration.

4. **Zero-Masquerade Rule & UI Components**:
   - `src/app/desktop/page.tsx` (`handleToggleMode`, lines 140–212): Switching from Demo to Real immediately and synchronously clears all mock state (`setInventory(null)`, `setPolicySummary(null)`, `setPreflightData(null)`, `setScanError(null)`).
   - If the live scan fails, `scanError` is set and rendered in an explicit error banner (`Falha de Conexão com o Host Windows`), never falling back to mock data silently.
   - `src/desktop/DemoBanner.tsx`: Clear, distinct UI states with high contrast badges: Demo mode displays `[MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]` with warning styling, while Real mode displays `[MODO COMPUTADOR REAL — CONECTADO AO WINDOWS: ...]` with success styling.
   - `src/desktop/FirstRunWizard.tsx`: 4-step wizard implementing mode detection, system discovery with Administrator Immunity Rule (blocks restricting accounts with `isAdmin === true`), Microlins pedagogical profile selection, preflight readiness gate (disables baseline commit if status is `BLOCK`), and initial baseline capture (`ACTION_CREATE_BASELINE`).

5. **Web 0.9 Preservation & Deployment Safety**:
   - `src/app/page.tsx`: Web 0.9 standalone configurator workflow remains preserved and fully functional, with an unobtrusive link to `/desktop`.
   - `vercel.json`: `"git": { "deploymentEnabled": false }` is strictly maintained.

---

### Section 2: Logic Chain

- The privilege separation design is clean: the Desktop UI (`asInvoker`) delegates elevated actions exclusively through a controlled IPC boundary to `WinLab.Executor` (`requireAdministrator`).
- Attacks via pipe impersonation or pre-creation are eliminated by dynamic GUID naming and mutual kernel PID validation (`GetNamedPipeClientProcessId`).
- Command injection / arbitrary script execution is blocked at multiple layers:
  1. Closed IPC action allowlist in `SecurityValidator.cs` and `ExecutorHost.ProcessRequestAsync`.
  2. `SecurityValidator.ValidateNoArbitraryShell` scanning for forbidden scripting patterns (`powershell`, `cmd`, `wscript`, `bash`, `eval`, etc.).
  3. `SecurityValidator.ValidateEnvelopeSchema` rejecting envelopes containing forbidden command fields.
- The Zero-Masquerade rule is preserved in code: mock data and real inventory are completely partitioned; `WindowsScanner` produces DTOs with `IsMock = false`, while state is synchronously wiped on mode toggle.

---

### Section 3: Caveats

1. **UAC Elevation Latency on Slow Machines**: `ElevatedExecutorClient` uses a 45-second timeout (`TimeSpan.FromSeconds(45)`) to wait for pipe connection. This is appropriate for human credential entry, but automated tests running on headless environments should mock `IAgentService` rather than attempting UAC elevation.
2. **Environment Exits on Orphan Detection**: `SetupParentWatchdog` calls `Environment.Exit(0)`. While optimal for preventing orphaned administrator backends, it terminates immediately without running graceful cleanup handlers. Because the executor does not hold open transactions during idle state, this is safe.

---

### Section 4: Conclusion

The implementation of the Elevated Executor Architecture, Named Pipe Framing, Mutual Handshake Authentication, First-Run Configuration Wizard, and Zero-Masquerade UI components meets all architectural, security, and pedagogical requirements of Milestone 2.

**Final Verdict**: **APPROVE**

---

### Section 5: Verification Method

The inspection verified:
- `desktop/src/WinLab.Executor/WinLab.Executor.csproj` & `app.manifest`: confirmed `requireAdministrator` level.
- `desktop/src/WinLab.Desktop/app.manifest`: confirmed `asInvoker` level.
- `desktop/src/WinLab.Executor/Program.cs`: verified role assertion and CLI parameter parsing.
- `desktop/src/WinLab.Executor/ExecutorHost.cs`: verified parent watchdog, idle timeout, JSON schema validation, and action dispatch.
- `desktop/src/WinLab.Contracts/PipeFraming.cs`: verified 16MB boundary check, framing prefix, and stream read loops.
- `desktop/src/WinLab.Desktop/Services/ElevatedExecutorClient.cs`: verified GUID pipe naming, 256-bit crypto token generation, `FixedTimeEquals` comparison, kernel PID check, and UAC cancellation handling.
- `src/desktop/FirstRunWizard.tsx`: verified 4-step wizard, administrator immunity enforcement, and preflight BLOCK handling.
- `src/desktop/DemoBanner.tsx` & `src/app/desktop/page.tsx`: verified synchronous state purging and explicit error banner on connection failure.
- `src/app/page.tsx` & `vercel.json`: verified Web 0.9 code preservation and disabled deployment lock.
