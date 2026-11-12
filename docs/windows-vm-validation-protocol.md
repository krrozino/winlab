# Windows/WebView2 Integration Validation Protocol (Issue #29)

Status: **protocol prepared — NOT executed**. No step below has been run on a real Windows host or VM in this iteration. Automated CI coverage (Linux + `windows-latest`) is tracked in `.github/workflows/ci.yml`; everything in this document requires a disposable Windows VM with WebView2 and must be executed before any native homologation claim.

## Scope and safety rules

- Disposable Windows VM only. Never run on a productive machine.
- No real registry mutation outside what an explicitly approved policy apply performs; do not run any generated script with `-Apply` during this protocol.
- No installer deployment beyond the disposable VM.
- The host application must never be granted persistent elevation; UAC prompts are part of the observation, not something to bypass.

## 1. Automated coverage (already wired in CI)

These run without a VM and are the only results currently claimable:

| Check | Where |
| --- | --- |
| TypeScript tests, typecheck, Next.js build | `validate` job (ubuntu) |
| Generated PowerShell fixtures, PS 5.1 + PS 7 parse | `windows-powershell` job (windows-latest) |
| `npm test`, `npm run typecheck`, offline export, .NET 10 restore/build, C# xUnit tests, `win-x64` self-contained publish, Inno Setup compile, artifact existence + SHA256 | `desktop-windows` job (windows-latest) |

Artifacts published by `desktop-windows`:

- `winlab-desktop-win-x64` — publish output plus `WinLab.Desktop.exe.sha256`.
- `WinLab-Desktop-Installer-x64` — `WinLabSetup-*.exe` plus SHA256 sidecar.

## 2. VM prerequisites

1. Windows 10/11 x64 VM snapshot (revert before each run).
2. Edge WebView2 Runtime installed.
3. .NET 10 Desktop Runtime not required (publish is self-contained).
4. Copy `WinLabSetup-*.exe` from the CI artifact and verify its SHA256 against the sidecar before running.

## 3. Dispatcher `mode.set` ordering (native host)

Goal: confirm `DispatcherAgentService._activeMode` behaves as last-writer-wins with no interleaving, and that the frontend generation guard absorbs out-of-order routing.

> **Build requirement:** use an instrumented **Debug** build for this section. `MainWindow.xaml.cs` enables `AreDevToolsEnabled` only under `#if DEBUG` and force-disables it in Release builds (`MainWindow.xaml.cs:41-45`). Never patch or enable DevTools in a Release distribution; observe IPC via the Debug build's DevTools console or via safe test log output instead.

1. Launch the Debug build; confirm DEMO mode.
2. Toggle REAL, then DEMO, then REAL in rapid succession (faster than one IPC round-trip).
3. In the WebView2 DevTools console (Debug build only), observe `mode.set` and query traffic.
4. Expected: each generation sends `mode.set` first, queries only after its own ack; no query response from a previous generation mutates the UI.
5. Record the dispatcher log lines showing `_activeMode` transitions; a query routed before a `mode.set` may return the previous service's data and must be discarded by the frontend (generation check), not by the host.

## 4. REAL-mode inventory failure after ack (seal vs. data distinction)

Goal: verify the UI never claims verified real data when `inventory.query` fails after a successful `mode.set`.

> **Harness requirement:** there is no standalone scanner service to stop. `RealAgentService` invokes `IWindowsScanner` directly in-process (`RealAgentService.cs:20-25`, `:64`). Force the failure through an injectable test harness — a fault-injecting `IWindowsScanner` (or an instrumented Debug build that rejects `inventory.query` on demand) — without stopping the executor, killing the app, or mutating real policies.

1. Connect to REAL with the harness scanner healthy; confirm the green seal.
2. Make `inventory.query` fail via the injectable `IWindowsScanner` fixture while keeping the window open.
3. Expected: `hasReadError` banner subtitle — "Conexão ao host nativo confirmada, porém a leitura dos dados desta máquina falhou. Nenhum dado real foi obtido ou verificado." — with the warning color; no claim of OS-sourced data.
4. Screenshot required as evidence.

## 5. `isMock=true` rejection in REAL mode (host side) — PENDING IMPLEMENTATION

**Status: NOT implemented. Do not treat as guaranteed behavior.**

Current state: `MachineDataSession.queryMachineData` (`machine-data-session.ts:88`) accepts any successful `inventory.query` payload without checking `isMock`. The PR #27 origin-integrity guard blocks **export** of mock-flagged data, but it does not prevent such data from being rendered in the UI as if it were real inventory.

Pending work (requires its own issue/PR, out of scope here):

1. Host-side or session-level rejection of `isMock: true` payloads while in REAL mode, before any UI exposure.
2. The VM test below only becomes executable after that implementation exists.

Test plan (once implemented):

1. Inject an IPC `inventory.query` response with `isMock: true` while in REAL mode (test harness build).
2. Expected: the payload is refused before rendering; UI shows the origin inconsistency state from PR #27 and no REAL diagnostic export.

## 6. React Strict Mode + WebView2 teardown

1. Run a development build with Strict Mode enabled inside WebView2.
2. Cycle: mount → effect cleanup → effect replay; then toggle DEMO→REAL→DEMO.
3. Expected: session is recreated per effect cycle (no permanently discarded session), no duplicate IPC listeners, no leaked `postMessage` handlers after unmount.
4. Close the window mid-request; confirm the process exits without orphaned WebView2 processes.

## 7. Installer smoke test (disposable VM)

1. Run `WinLabSetup-0.9.0-x64.exe`; accept the UAC prompt.
2. Launch the installed app; confirm offline operation with networking disabled (no Next.js server dependency): inventory, policies, preflight, and Diagnostic Report all render.
3. Confirm the green REAL seal only appears after a validated `mode.set` ack from the native host.
4. Uninstall; confirm no leftover services or scheduled tasks.

> The SHA256 sidecar produced by CI proves artifact integrity in transit, not authenticity: the installer is **not code-signed**, and an installation homologation (UAC flow, WebView2 runtime matrix, clean uninstall) remains pending per this protocol.

## 8. Interactive homologation — explicitly pending

The following remain **pending interactive homologation** and are not covered by any automated check:

- UAC elevation flow and `PrivilegesRequired=admin` behavior.
- Real registry snapshot/rollback on an actual Windows host (still without `-Apply` beyond an explicitly approved policy).
- WebView2 runtime version matrix.
- Multi-monitor/DPI rendering of the WinLab UI.

Until sections 3–8 are executed on a VM with recorded evidence, the project status remains: **CI gate green ≠ native Windows homologation complete**.
