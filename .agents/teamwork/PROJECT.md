# Project: WinLab Desktop — Funcional, Seguro e Instalável

## Architecture
WinLab Desktop is structured as a security-hardened, offline-capable hybrid Windows application built on **WPF (.NET 10 LTS)** hosting **WebView2** and an offline static export of the **React/Next.js** companion interface.

```
┌────────────────────────────────────────────────────────┐
│ WinLab Desktop UI (WPF + WebView2 + React SPA)         │
│ - Unprivileged standard user execution (asInvoker)    │
│ - Offline bundle loaded via https://winlab.local/      │
│ - Origin-restricted IPC bridge via postMessage         │
│ - Visual policies, Dashboard, Drift & Wizard UI        │
└───────────────────────────┬────────────────────────────┘
                            │ Typed IPC Envelopes (JSON DTOs)
                            │ (No arbitrary shell commands)
                            ▼
┌────────────────────────────────────────────────────────┐
│ WinLab Policy Engine & Core Contracts                  │
│ - Declarative Policy Catalog with schemas & validation │
│ - Tri-State Machine: Desired vs Configured vs Effective│
│ - Baseline Snapshot & Rollback Engine                  │
│ - Preflight Capability & Drift Detection               │
└───────────────────────────┬────────────────────────────┘
                            │ UAC Elevation (runas)
                            │ Signed DTO Action Dispatch
                            ▼
┌────────────────────────────────────────────────────────┐
│ WinLab Windows Executor (Elevated Helper)              │
│ - Isolated process with UAC elevation                  │
│ - Token authentication & Windows Identity validation   │
│ - Windows Registry, AppLocker, Local Accounts mutations│
│ - Windows Event Log audit trail                        │
└────────────────────────────────────────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | .NET 10 LTS Migration | Upgrade WPF and desktop libraries to .NET 10 LTS | M1 | Survey |
| 2 | Offline Next.js Static Export | Dedicated `build:desktop` script exporting SPA to `wwwroot` | M1 | Survey |
| 3 | Offline WebView2 Virtual Host | Map `winlab.local` to `wwwroot` avoiding localhost:3000 | M1 | Survey |
| 4 | WebView2 Security Hardening | Origin check, navigation guards, DevTools disabled in Release | M1 | Survey |
| 5 | Bi-directional Typed IPC Bridge | Typed `postMessage` bridge with web fallback to MockAgent | M1 | Survey |
| 6 | Persistent Demo Banner | Visible banner on UI when running in demonstration mode | M1 | Survey |
| 7 | Typed Schema Validation | Replace substring blacklists with strict action/field schemas | M1 | Survey |
| 8 | Windows CI with WPF & Tests | GitHub Actions job for .NET 10 SDK, WPF build, and C# tests | M1 | Survey |
| 9 | Inno Setup Packaging Script | Installer script for Program Files, shortcuts, admin install | M1 | Survey |
| 10 | C# Unit Test Suite | Test project `WinLab.Tests` covering contracts and validation | M1 | Survey |
| 11 | Real Windows System Scanner | Query OS edition, version, build, computer name via WMI/API | M2 | Survey |
| 12 | Local Accounts Scanner | Enumerate local users and identify administrators | M2 | Survey |
| 13 | Installed Software Scanner | Query Registry Uninstall keys and Appx packages | M2 | Survey |
| 14 | First-Run Configuration Wizard | Setup wizard for admin choice, preset, baseline creation | M2 | Survey |
| 15 | Elevated Executor Architecture | On-demand elevated helper (`WinLab.Executor`) with UAC | M2 | Survey |
| 16 | Real vs Demo Mode Toggle | Eliminate mock data in Real Computer mode | M2 | Survey |
| 17 | Declarative Policy Catalog | Centralized registry of policy schemas, risks, and probes | M3 | Survey |
| 18 | Policy: Wallpaper Lock | Lock wallpaper via `ActiveDesktop\NoChangingWallPaper` | M3 | Survey |
| 19 | Policy: Sounds Lock | Lock sound scheme via `Personalization\NoChangingSoundScheme` | M3 | Survey |
| 20 | Policy: Mouse Pointers Lock | Lock mouse pointers via `Personalization\NoChangingMousePointers` | M3 | Survey |
| 21 | Policy: Chrome Incognito Lock | Block Chrome incognito via `IncognitoModeAvailability` | M3 | Survey |
| 22 | Policy: Chrome Guest Lock | Block Chrome guest browsing via `BrowserGuestModeEnabled` | M3 | Survey |
| 23 | Baseline & Transaction Capture | Snapshot `.reg` and AppLocker XML with UUID transaction | M3 | Survey |
| 24 | Automated Failure Rollback | Auto-restore baseline upon partial failure during apply | M3 | Survey |
| 25 | Tri-State Policy Architecture | Model Desired State, Configured State, and Effective State | M4 | Survey |
| 26 | 12 UI Lifecycle States | Implement statuses from `NotConfigured` to `Reverted` | M4 | Survey |
| 27 | Startup Drift Detection | Compare live OS configuration against desired state | M4 | Survey |
| 28 | Pending Actions Batching | Group reboot/logoff/app restart requirements into one prompt | M4 | Survey |
| 29 | Deferred First-Logon HKCU Task | Scheduled task applying user policies when profile mounts | M4 | Survey |
| 30 | Audit History & Log Storage | Persist audit log in protected `C:\ProgramData\WinLab` | M4 | Survey |
| 31 | Accounts: Aluno User Creation | Assisted standard user creation with validated credentials | M5 | Survey |
| 32 | Accounts: Protect Admin Group | Inviolable block against restricting administrators | M5 | Survey |
| 33 | Accounts: Hide User Settings | Restrict access to `ms-settings:otherusers` | M5 | Survey |
| 34 | Accounts: Fast User Switching | Restrict fast user switching on shared workstations | M5 | Survey |
| 35 | System: CMD Restriction | Block `cmd.exe` execution for student account | M5 | Survey |
| 36 | System: PowerShell Restriction | Block `powershell.exe` execution for student account | M5 | Survey |
| 37 | System: Regedit Restriction | Block `regedit.exe` access for student account | M5 | Survey |
| 38 | System: Task Manager Lock | Disable Task Manager for student account | M5 | Survey |
| 39 | System: Run Dialog Lock | Remove Run command (Win+R) for student account | M5 | Survey |
| 40 | System: Control Panel Lock | Restrict classic Control Panel applets | M5 | Survey |
| 41 | System: Store Restriction | Disable Microsoft Store app downloads | M5 | Survey |
| 42 | Browsers: Profile Lock | Block new profile creation in Chrome/Edge | M5 | Survey |
| 43 | Browsers: Password Manager Lock | Block saving passwords on shared computers | M5 | Survey |
| 44 | Browsers: Extension Filtering | Block extensions or enforce school allowlist | M5 | Survey |
| 45 | Browsers: Web URL Filtering | Enforce blocklist or allowlist-only URL navigation | M5 | Survey |
| 46 | Browsers: SafeSearch Force | Force SafeSearch on Google and Bing | M5 | Survey |
| 47 | Apps: AppLocker AuditOnly | Enforce AppLocker audit-only logging | M5 | Survey |
| 48 | Apps: AppLocker Enforcement | Enforce AppLocker binary allowlist after validation | M5 | Survey |
| 49 | Apps: MSI Installer Blocking | Restrict execution of MSI installers for student | M5 | Survey |
| 50 | Hardware: USB Read Deny | Block reading from USB storage devices | M5 | Survey |
| 51 | Hardware: USB Write Deny | Block writing to USB storage devices | M5 | Survey |
| 52 | Hardware: USB Binary Block | Block running executables from USB while permitting files | M5 | Survey |
| 53 | Personalization: Temp Unlock | Temporary wallpaper unlock with auto-expiration timer | M5 | Survey |
| 54 | Storage: Free Space Monitor | Monitor disk capacity and alert if free space < threshold | M5 | Survey |
| 55 | Storage: OneDrive Sync Block | Disable OneDrive personal cloud sync | M5 | Survey |
| 56 | Presets: Microlins Lab | Complete bundled preset for computer school labs | M5 | Survey |
| 57 | Presets: Company & Home | Bundled presets for corporate workstations and home study | M5 | Survey |
| 58 | Installer Artifact Generation | Produce installable `WinLabSetup-0.9.0-x64.exe` | M6 | Survey |
| 59 | Clean Machine Preflight | Installer dependency detection (WebView2 runtime check) | M6 | Survey |
| 60 | Offline E2E Validation | Full lifecycle test in clean Windows environment | M6 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation Audit, .NET 10 LTS & Offline WebView2 | Features 1–10 (Fix PR #24 blockers, .NET 10, static export, WebView2 hardening, IPC bridge, CI WPF, C# tests, Inno Setup) | none | IN_PROGRESS |
| M2 | Real Windows Scanner & Administrative Auth | Features 11–16 (OS/user/app scanners, setup wizard, elevated helper architecture, real mode) | M1 | PLANNED |
| M3 | First Functional Policy Engine | Features 17–24 (5 low-risk reversible policies, baseline, apply, verify, persist, rollback) | M2 | PLANNED |
| M4 | Persistent States, Drift & Reboot/Logoff | Features 25–30 (Tri-state model, 12 UI states, startup drift detection, reboot batching, deferred HKCU) | M3 | PLANNED |
| M5 | Microlins Catalog Expansion | Features 31–57 (Accounts, System, Browsers, Apps, Hardware, Storage, Presets) | M4 | PLANNED |
| M6 | Installable Release Candidate & E2E Verification | Features 58–60 (Installer build, clean machine preflight, complete verification, pilot runbook) | M5 | PLANNED |

## Interface Contracts

### 1. UI (React) ↔ Host (WPF / WebView2) IPC Contract
- **Transport**: `window.chrome.webview.postMessage(json)` and `window.chrome.webview.addEventListener('message', handler)`
- **Origin**: Strictly restricted to `https://winlab.local`
- **Envelope**:
  ```typescript
  interface IpcEnvelope<T = unknown> {
    id: string;             // UUID v4
    action: string;         // e.g. "query.inventory", "query.policy_states", "policy.preview"
    payload?: T;
    replyToId?: string;
    error?: { code: string; message: string; details?: unknown };
  }
  ```

### 2. UI / Policy Engine ↔ Elevated Windows Executor Contract
- **Invocation**: Out-of-process elevated executable (`WinLab.Executor.exe`) launched with `Verb = "runas"` (UAC prompt) receiving command parameters and secure pipe.
- **DACL**: Named Pipe restricted to Administrators (`BA`) and SYSTEM (`SY`).
- **Mutual Authentication**: Executor checks caller token role `WindowsBuiltInRole.Administrator`.
- **Payload**: Typed DTO commands only. Zero arbitrary shell strings or raw PowerShell scripts accepted.

### 3. Tri-State Policy Model Schema
- `DesiredState`: `"NotConfigured" | "Allowed" | "Blocked"`
- `ConfiguredState`: `"NotConfigured" | "Allowed" | "Blocked"` (as recorded in `C:\ProgramData\WinLab\state.json`)
- `EffectiveState`: Evaluated dynamically via read-only OS probe:
  - `NotConfigured`: No policy applied
  - `Applying`: In transition
  - `Applied`: Confirmed active in OS
  - `PendingRefresh`: Configured, requires user/desktop refresh
  - `PendingLogoff`: Configured, requires user sign-out
  - `PendingReboot`: Configured, requires system reboot
  - `PendingAppRestart`: Configured, requires browser/app restart
  - `Drifted`: Desired state differs from live OS state
  - `Failed`: Operation failed, rollback triggered
  - `NotSupported`: Feature not supported on this Windows edition
  - `Inconclusive`: Verification probe could not conclusively prove effect
  - `Reverted`: Successfully rolled back to prior baseline

## Code Layout
- `desktop/src/WinLab.Contracts/`: Shared C# DTOs, interfaces, and typed validators (`net10.0`)
- `desktop/src/WinLab.Agent.Mock/`: In-memory development mock service (`net10.0`)
- `desktop/src/WinLab.Desktop/`: WPF application shell and WebView2 host (`net10.0-windows`)
  - `desktop/src/WinLab.Desktop/wwwroot/`: Bundled offline static web assets
  - `desktop/src/WinLab.Desktop/Bridge/`: Native IPC bridge
- `desktop/tests/WinLab.Tests/`: C# unit tests for contracts and validators (`net10.0`)
- `desktop/packaging/`: Inno Setup installer scripts (`winlab.iss`)
- `src/app/`: Next.js React application (Web configurator and Desktop companion UI)
- `src/desktop/`: TypeScript IPC bridge, contracts, and web-mode mock agent
- `src/lib/`: Core policy definitions, schemas, baseline and script generators
- `tests/`: TypeScript unit tests (Vitest / Node.js test runner)
- `.github/workflows/ci.yml`: GitHub Actions CI pipeline (Linux Node.js + Windows .NET 10)
