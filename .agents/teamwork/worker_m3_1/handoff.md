# Handoff Report: Milestone 3 — Policy Engine, Declarative Catalog & Automated Rollback

**Worker ID**: `worker_m3_1`  
**Task**: Implementation of Milestone 3 — Declarative Policy Catalog, 5 Core Policies, Pre-flight Baseline Capture, 7-State Transaction Engine, and Automated Failure Rollback with 100% Linux CI Testability.  
**Date**: November 2026  
**Status**: COMPLETE (0 compiler warnings, 0 compiler errors, 100% test pass rate)

---

## 1. Executive Summary

Milestone 3 implements the core engine for atomic policy management in WinLab Desktop. It introduces a declarative policy catalog with 5 foundational policies, a pre-flight tri-state baseline capture mechanism, a 7-state transactional lifecycle manager with automated rollback on apply or probe failure, administrator immunity guards, and full TypeScript/mock parity.

All abstractions are designed for 100% cross-platform testability on Linux, with Windows-specific APIs (`Microsoft.Win32.Registry`, `advapi32.dll` `RegLoadKey`/`RegUnLoadKey`) cleanly isolated and guarded by `OperatingSystem.IsWindows()`.

---

## 2. Implemented Features & Architecture

### 2.1 Declarative Policy Catalog (`WinLab.Contracts.Policies`)
The declarative catalog (`IPolicyCatalog`, `PolicyCatalog`) registers 5 core policies:
1. **`personalization.wallpaper`** (Feature 18):
   - Category: Personalização
   - Scope: User (`HKCU` or `HKU\<SID>\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop`)
   - Value: `NoChangingWallPaper` (REG_DWORD = 1)
   - Activation: RequiresLogoff = true
   - Protected by Administrator Immunity Guard

2. **`personalization.sounds`** (Feature 19):
   - Category: Personalização
   - Scope: User (`HKCU` or `HKU\<SID>\Software\Policies\Microsoft\Windows\Personalization`)
   - Value: `NoChangingSoundScheme` (REG_DWORD = 1)
   - Activation: Instantaneous (no restart required)
   - Protected by Administrator Immunity Guard

3. **`personalization.mouse_pointers`** (Feature 20):
   - Category: Personalização
   - Scope: User (`HKCU` or `HKU\<SID>\Software\Policies\Microsoft\Windows\Personalization`)
   - Value: `NoChangingMousePointers` (REG_DWORD = 1)
   - Activation: Instantaneous (no restart required)
   - Protected by Administrator Immunity Guard

4. **`browser.chrome.incognito`** (Feature 21):
   - Category: Navegadores
   - Scope: Machine (`HKLM`)
   - Dual policy target:
     - Google Chrome: `SOFTWARE\Policies\Google\Chrome\IncognitoModeAvailability` = 1
     - Microsoft Edge: `SOFTWARE\Policies\Microsoft\Edge\InPrivateModeAvailability` = 1
   - Activation: RequiresAppRestart = true (`chrome`, `msedge`)
   - Detects running browser processes: active state probes as `PendingAppRestart` when running, transitioning to `Applied` once processes terminate. Partial missing registry keys probe as `Drifted`.

5. **`browser.chrome.guest`** (Feature 22):
   - Category: Navegadores
   - Scope: Machine (`HKLM`)
   - Dual policy target:
     - Google Chrome: `SOFTWARE\Policies\Google\Chrome\BrowserGuestModeEnabled` = 0
     - Microsoft Edge: `SOFTWARE\Policies\Microsoft\Edge\BrowserGuestModeEnabled` = 0
   - Activation: RequiresAppRestart = true (`chrome`, `msedge`)

### 2.2 Baseline Snapshot Engine (`BaselineSnapshotManager`)
Before mutating any registry value:
- Pre-flight scan inspects key and value existence across 3 tri-states:
  - `KeyDoesNotExist`: Subkey hierarchy is absent.
  - `DoesNotExist`: Subkey exists, but specific policy value name is absent.
  - `Exists`: Pre-existing value is present (captures exact value and `RegistryValueType`).
- Pre-computes reverse rollback plan:
  - Absent values (`DoesNotExist` / `KeyDoesNotExist`) are mapped to `DeleteValue` operation (cleanly deleting entries rather than defaulting or zeroing out unconfigured settings).
  - Existing values are mapped to `RestoreValue` with captured original payload and type.
  - Rollback steps are inverted to execute in strict reverse order of application.

### 2.3 7-State Transaction Engine (`TransactionEngine`)
- Lifecycle: `Pending` -> `Applying` -> `Verifying` -> `Committed` (or `RollingBack` -> `RolledBack` / `Failed`).
- Sequential application: iterates through policies one by one.
- Immediate verification probe: immediately after applying each policy, probes the live system/hive to confirm the applied state.
- Automated Failure Rollback:
  - If any mutation fails OR if the post-apply verification probe fails:
    1. Forward progress halts immediately (subsequent policies are never attempted).
    2. Automated rollback is triggered for all applied policies in reverse order.
    3. Baseline restoration is verified.
    4. Transaction is marked `RolledBack`.
    5. Persistence log records the failure reason and rolled-back sequence.
- Idempotent rollback: rolling back an already rolled-back transaction succeeds without altering state.
- Atomic file persistence: writes transactions to `<TxId>.json.tmp` and atomic `File.Move` to `<TxId>.json`. Resolves to `C:\ProgramData\WinLab\transactions` on Windows and `~/.winlab/transactions` (or `WINLAB_TRANSACTION_DIR`) on Linux.

### 2.4 Administrator Immunity Guard
- Prevents applying user policies to administrator accounts:
  - WellKnown Administrator Group SID: `S-1-5-32-544`
  - Built-in Administrator RID 500: `*-500`
  - Account names: `Administrador`, `Administrator`
- Any transaction attempting to apply user policies to an administrator is rejected immediately with zero mutations.

### 2.5 Cross-Platform Isolation & Testing
- `IRegistryService` & `IUserHiveManager` in `WinLab.Contracts.RegistryServices`.
- `InMemoryRegistryService` & `MockUserHiveManager` for 100% Linux CI test execution with fault injection hooks (`SetWriteFault`, `SetProbeFault`).
- `WindowsRegistryService` & `WindowsUserHiveManager` in `WinLab.Executor.Services` using `Microsoft.Win32.Registry` and `advapi32.dll` (`RegLoadKey`, `RegUnLoadKey`) guarded by `OperatingSystem.IsWindows()`.

### 2.6 IPC Actions & Security Allowlist
Added and allowed across `IpcConstants.cs`, `SecurityValidator.cs`, `RealAgentService.cs`, `ExecutorHost.cs`, and `mock-agent.ts`:
- `policy.query_catalog`: queries declarative catalog metadata.
- `policy.query_states`: queries live or mock policy status across catalog.
- `policy.apply_transaction`: executes atomic apply with pre-flight baseline and automated rollback.
- `policy.rollback_transaction`: reverses transaction to baseline.
- `policy.query_status`: inspects transaction record by ID.

---

## 3. Files Modified and Created

### C# / .NET Files
- `desktop/src/WinLab.Contracts/PolicyModels.cs`: Enriched with `PolicyDefinitionDto`, `TriStateDto`, `PolicyCategory`, `PolicyRiskLevel`, `PolicyDesiredState`, `PolicyEffectiveState`, `PolicyProbeResult`, `PolicyApplyResult`, `PolicyRevertResult`.
- `desktop/src/WinLab.Contracts/Transactions/TransactionModels.cs` *(new)*: `TransactionStatus`, `BaselineValueState`, `RegistryHiveType`, `RegistryValueType`, `RegistryValueSnapshotDto`, `BaselineSnapshotDto`, `TransactionActionRecordDto`, `RollbackStepDto`, `TransactionDto`, `ApplyTransactionRequestDto`, `ApplyTransactionResultDto`, `RollbackTransactionRequestDto`, `RollbackResultDto`.
- `desktop/src/WinLab.Contracts/Registry/IRegistryService.cs` *(new)*: Core registry service interface.
- `desktop/src/WinLab.Contracts/Registry/IUserHiveManager.cs` *(new)*: User hive management interface with `IUserHiveScope`.
- `desktop/src/WinLab.Contracts/Registry/InMemoryRegistryService.cs` *(new)*: In-memory registry service and `MockUserHiveManager` with fault injection.
- `desktop/src/WinLab.Contracts/Policies/IPolicyHandler.cs` *(new)*: Policy handler interface and `IPolicyCatalog`.
- `desktop/src/WinLab.Contracts/Policies/RegistryDWordPolicyHandler.cs` *(new)*: User-scoped DWORD policy handler.
- `desktop/src/WinLab.Contracts/Policies/DualBrowserPolicyHandler.cs` *(new)*: Machine-scoped dual Chrome & Edge policy handler.
- `desktop/src/WinLab.Contracts/Policies/PolicyCatalog.cs` *(new)*: Implementation of `IPolicyCatalog` with 5 Milestone 3 policies.
- `desktop/src/WinLab.Contracts/Transactions/BaselineSnapshotManager.cs` *(new)*: Tri-state baseline capture and reverse rollback plan builder.
- `desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs` *(new)*: 7-state transactional engine with automated failure rollback.
- `desktop/src/WinLab.Contracts/IpcConstants.cs`: Registered Milestone 3 IPC actions.
- `desktop/src/WinLab.Contracts/IpcEnvelope.cs`: Extended `IpcResponse<T>.Fail` with optional data payload.
- `desktop/src/WinLab.Contracts/SecurityValidator.cs`: Added `ValidateTargetNotAdministrator` and allowed M3 actions.
- `desktop/src/WinLab.Executor/Services/WindowsRegistryService.cs` *(new)*: Windows registry service implementation.
- `desktop/src/WinLab.Executor/Services/WindowsUserHiveManager.cs` *(new)*: Windows user hive manager with `RegLoadKey`/`RegUnLoadKey`.
- `desktop/src/WinLab.Executor/ExecutorHost.cs`: Wired M3 IPC actions into elevated request processing loop.
- `desktop/src/WinLab.Desktop/Services/RealAgentService.cs`: Wired M3 actions into desktop real agent service.

### C# Unit & Integration Tests
- `desktop/tests/WinLab.Tests/PolicyCatalogTests.cs` *(new)*: 4 tests for catalog registration, scopes, flags, metadata, and case insensitivity.
- `desktop/tests/WinLab.Tests/PolicyHandlerTests.cs` *(new)*: 7 tests for full lifecycles of Wallpaper, Sounds, Mouse Pointers, Chrome Incognito, Chrome Guest Mode, administrator immunity, and uninitialized profile logon deferral.
- `desktop/tests/WinLab.Tests/BaselineSnapshotTests.cs` *(new)*: 2 tests for tri-state capture (`KeyDoesNotExist`, `DoesNotExist`, `Exists`), absence deletion rule, and reverse sequencing.
- `desktop/tests/WinLab.Tests/TransactionEngineTests.cs` *(new)*: 10 tests for happy path commit, midway failure automated rollback, verification probe mismatch rollback, idempotency of rollback, administrator immunity guard (group SID & RID 500), pre-existing browser values restoration, unknown policy rejection, and JSON disk persistence.

### TypeScript / Next.js Files
- `src/lib/policies.ts` *(new)*: Declarative policy catalog with full metadata for the 5 policies.
- `src/desktop/contracts.ts`: Added IPC action constants and TypeScript interfaces matching C# DTOs.
- `src/desktop/mock-agent.ts`: Added state tracking and handlers for `policy.query_catalog`, `policy.query_states`, `policy.apply_transaction`, `policy.rollback_transaction`, and `policy.query_status`.
- `tests/milestone3-policies.test.ts` *(new)*: 5 parity tests for policy metadata, catalog queries, states, apply/rollback cycles, and administrator immunity in TypeScript.

---

## 4. Verification Results

All verification commands executed cleanly on Linux CI:

1. **.NET Unit & Integration Tests**:
   ```bash
   /home/antigravity/.dotnet/dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release
   ```
   **Result**: `Passed! - Failed: 0, Passed: 281, Skipped: 0, Total: 281, Duration: 857 ms` (23 new M3 tests, 258 existing tests preserved).

2. **TypeScript / Next.js Unit Tests**:
   ```bash
   npm test
   ```
   **Result**: `pass 100, fail 0, skipped 0, duration: 1275 ms` (5 new M3 tests, 95 existing tests preserved).

3. **Complete .NET Solution Build**:
   ```bash
   /home/antigravity/.dotnet/dotnet build desktop/WinLab.sln -c Release -p:EnableWindowsTargeting=true
   ```
   **Result**: `Build succeeded. 0 Warning(s), 0 Error(s)`.

4. **Next.js Desktop Export & Offline Asset Verification**:
   ```bash
   npm run build:desktop
   ```
   **Result**: Compiled successfully, verified offline static assets in `wwwroot/desktop/index.html`.
