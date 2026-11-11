# WinLab Desktop — Code Review Report
**Milestone:** Milestone 3 (First Functional Policy Engine: Features 17–24)  
**Reviewer:** `reviewer_m3_1` (Senior Code Reviewer — Architecture, C# Contracts, Engine & P/Invoke)  
**Date:** 2026-11-10  
**Verdict:** **APPROVE**

---

## 1. Executive Summary

Milestone 3 implements the first fully functional, declarative policy engine for WinLab Desktop, replacing hardcoded foundation scripts with a robust transactional engine, pre-flight baseline capture, immediate verification probes, and automated rollback capabilities.

All core C# components, contracts, policies, registry abstractions, and tests were thoroughly inspected:
- `desktop/src/WinLab.Contracts/PolicyModels.cs`
- `desktop/src/WinLab.Contracts/Transactions/` (`TransactionModels.cs`, `BaselineSnapshotManager.cs`, `TransactionEngine.cs`)
- `desktop/src/WinLab.Contracts/Policies/` (`IPolicyHandler.cs`, `PolicyCatalog.cs`, `RegistryDWordPolicyHandler.cs`, `DualBrowserPolicyHandler.cs`)
- `desktop/src/WinLab.Contracts/Registry/` (`IRegistryService.cs`, `IUserHiveManager.cs`, `InMemoryRegistryService.cs`)
- `desktop/src/WinLab.Executor/Services/` (`WindowsRegistryService.cs`, `WindowsUserHiveManager.cs`)
- `desktop/src/WinLab.Executor/ExecutorHost.cs`
- `desktop/tests/WinLab.Tests/` (`BaselineSnapshotTests.cs`, `PolicyCatalogTests.cs`, `PolicyHandlerTests.cs`, `TransactionEngineTests.cs`)

**Verdict:** **APPROVE**. The codebase demonstrates exceptional architecture, strict enforcement of all security invariants, clean cross-platform guards, and rigorous automated test coverage.

---

## 2. Detailed Technical Evaluation

### 2.1 Declarative Policy Catalog (Features 17–22)
The policy catalog (`desktop/src/WinLab.Contracts/Policies/PolicyCatalog.cs`) registers exactly the 5 Milestone 3 policies with complete metadata, clear scoping, risk levels, and activation flags:

1. **Wallpaper Lock** (`personalization.wallpaper`, Feature 18):
   - **Scope:** `PolicyScope.User`
   - **Key:** `Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop`
   - **Value:** `NoChangingWallPaper` (`DWORD` = 1)
   - **Flags:** `RequiresLogoff = true`, `Reversible = true`, `Risk = Low`
2. **Sounds Lock** (`personalization.sounds`, Feature 19):
   - **Scope:** `PolicyScope.User`
   - **Key:** `Software\Policies\Microsoft\Windows\Personalization`
   - **Value:** `NoChangingSoundScheme` (`DWORD` = 1)
   - **Flags:** `RequiresLogoff = false`, `Reversible = true`, `Risk = Low`
3. **Mouse Pointers Lock** (`personalization.mouse_pointers`, Feature 20):
   - **Scope:** `PolicyScope.User`
   - **Key:** `Software\Policies\Microsoft\Windows\Personalization`
   - **Value:** `NoChangingMousePointers` (`DWORD` = 1)
   - **Flags:** `RequiresLogoff = false`, `Reversible = true`, `Risk = Low`
4. **Browser Incognito Lock** (`browser.chrome.incognito`, Feature 21):
   - **Scope:** `PolicyScope.Machine`
   - **Chrome Key:** `SOFTWARE\Policies\Google\Chrome`, `IncognitoModeAvailability` (`DWORD` = 1)
   - **Edge Key:** `SOFTWARE\Policies\Microsoft\Edge`, `InPrivateModeAvailability` (`DWORD` = 1)
   - **Flags:** `RequiresAppRestart = true`, `TargetProcesses = ["chrome", "msedge"]`, `Reversible = true`
5. **Browser Guest Mode Lock** (`browser.chrome.guest`, Feature 22):
   - **Scope:** `PolicyScope.Machine`
   - **Chrome Key:** `SOFTWARE\Policies\Google\Chrome`, `BrowserGuestModeEnabled` (`DWORD` = 0)
   - **Edge Key:** `SOFTWARE\Policies\Microsoft\Edge`, `BrowserGuestModeEnabled` (`DWORD` = 0)
   - **Flags:** `RequiresAppRestart = true`, `TargetProcesses = ["chrome", "msedge"]`, `Reversible = true`

Both `PolicyCatalog.cs` in C# and `src/lib/policies.ts` in TypeScript share 100% contract parity, ensuring identical behavior across UI, IPC, and executor layers.

---

### 2.2 Pre-Flight Tri-State Baseline Capture & Reversal Correctness
The pre-flight snapshot engine (`BaselineSnapshotManager.cs`):
- **Three Baseline States Captured:**
  - `KeyDoesNotExist`: Target registry subkey does not exist prior to transaction.
  - `DoesNotExist`: Subkey exists, but specific value entry does not exist.
  - `Exists`: Subkey and value entry exist (captures `ValueKind` and `OriginalValue`).
- **Reversal Correctness Guarantee:**
  - For `Exists`: Generates `RestoreValue` step with exact original value and kind.
  - For `DoesNotExist` and `KeyDoesNotExist`: Generates `DeleteValue` step with `RestoreValue = null`. **Critically, absent values are deleted upon rollback, never zeroed out (`0`)**, preventing configuration pollution.
- **Strict Reverse Order:** Rollback steps are inverted (`rollbackSteps.Reverse()`) and renumbered (`1..N`), ensuring LIFO (last-in, first-out) reversal order.

---

### 2.3 7-State Transaction Engine Architecture
The transaction engine (`TransactionEngine.cs`) manages state transitions through all 7 lifecycle states:
$$\text{Pending} \longrightarrow \text{Applying} \longleftrightarrow \text{Verifying} \longrightarrow \begin{cases} \text{Committed} \\ \text{RollingBack} \longrightarrow \text{RolledBack} \\ \text{Failed} \end{cases}$$

Key verified behaviors:
1. **Sequential Apply & Immediate Verification:** Applies policy mutations one by one. After each mutation, calls the policy's `Probe()` method immediately to confirm the value is live in registry before moving to the next policy.
2. **Zero Unverified Forward Progress:** If an application error or verification mismatch occurs at step $k$, execution stops immediately. Steps $k+1 \dots N$ are never executed.
3. **Automated Rollback:** Upon any failure, the engine automatically enters `RollingBack`, executes the pre-computed rollback plan for all already-applied steps in reverse order, sets the status to `RolledBack`, and returns a detailed failure response.
4. **Idempotency:** Re-invoking `RollbackTransactionAsync` on an already rolled-back transaction safely returns success without duplicate work or errors.
5. **Atomic Persistence:** Each transaction state update is persisted atomically via a `.tmp` file and `File.Move(..., overwrite: true)` to protect against corruption during power loss or abrupt termination.
6. **Thread Safety:** Enforced via `SemaphoreSlim(1, 1)` to serialize concurrent transactions safely.

---

### 2.4 Inviolable Administrator Immunity Guard
Security invariant testing confirmed that administrator accounts are completely immune from laboratory policy restrictions:
- **Enforcement Layers:**
  1. `TransactionEngine.ApplyTransactionAsync`: Validates `_hiveManager.IsUserAdministrator(request.TargetUserSid)`. If targeted at an administrator and includes user-scoped policies, transaction is rejected immediately with `TransactionStatus.Failed` and zero registry mutations.
  2. `RegistryDWordPolicyHandler.Apply`: Checks `hiveManager.IsUserAdministrator(targetUserSid)` and fails if targeted at an admin.
  3. `SecurityValidator.ValidateTargetNotAdministrator`: Blocks well-known admin SIDs and names (`S-1-5-32-544`, `*-500`, `Administrador`, `Administrator`).
  4. `WindowsUserHiveManager.IsUserAdministrator`: Checks `S-1-5-32-544`, RID 500 (`*-500`), and on Windows verifies `BuiltinAdministratorsSid` and `principal.IsInRole(WindowsBuiltInRole.Administrator)`.
- **Zero Masquerade:** Target accounts cannot bypass validation through whitespace padding, mixed case, or alternate naming representations.

---

### 2.5 Cross-Platform Safety & P/Invoke Integrity
- **Guard Architecture:** Windows-specific APIs (`Microsoft.Win32.Registry`, `advapi32.dll`) are strictly guarded with `OperatingSystem.IsWindows()`.
- **P/Invoke Signatures:**
  ```csharp
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern int RegLoadKey(IntPtr hKey, string lpSubKey, string lpFile);

  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  private static extern int RegUnLoadKey(IntPtr hKey, string lpSubKey);
  ```
- **Offline Hive Unload Protocol:** In `WindowsUserHiveManager.OpenUserHive()`, when an offline hive is mounted via `RegLoadKey`, the returned `IUserHiveScope` executes `GC.Collect()`, `GC.WaitForPendingFinalizers()`, and `RegUnLoadKey(HKEY_USERS, mountSubKey)` on disposal, eliminating hive lock leakage.
- **Uninitialized User Profile Handling:** Accounts without an existing `NTUSER.DAT` return `UserProfileStatus.NotCreated` and probe state `PendingFirstLogon`, preventing corruption of uninitialized default profiles.
- **Linux Compatibility:** On non-Windows platforms, `InMemoryRegistryService` and `MockUserHiveManager` allow complete unit testing and mock execution without P/Invoke crashes.

---

### 2.6 IPC Security & Shell Injection Prevention
- `ExecutorHost.ProcessRequestAsync` invokes `SecurityValidator.ValidateNoArbitraryShell(rawJson)` and `SecurityValidator.ValidateEnvelopeSchema(root)`.
- Malicious command strings (`cmd.exe`, `powershell.exe`, `iex`, `invoke-expression`, `bash`, etc.) and payload command keys (`command`, `script`, `shell`, `exec`) are rejected at the IPC boundary with typed error codes.
- Mutual authentication handshake (`HandshakeRequest`/`HandshakeResponse`) validates session tokens and client PIDs.

---

## 3. Test Verification Results

All unit and integration test suites were executed in the environment:

| Test Suite | Framework | Total Tests | Passed | Failed | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`WinLab.Tests`** | xUnit (.NET 10) | 281 | 281 | 0 | **PASS** |
| **`vitest`** | Vitest (TypeScript) | 100 | 100 | 0 | **PASS** |

Key verified scenarios in C#:
- `Baseline_Captures_AllThreeTriStates_Correctly`: Confirms `KeyDoesNotExist`, `DoesNotExist`, and `Exists`.
- `Baseline_RollbackPlan_IsSequencedInStrictReverseOrder`: Verifies LIFO sequencing.
- `Transaction_HappyPath_CompletesAsCommitted`: Applies 5 policies, verifies live registry and file persistence.
- `Apply_FailureMidway_TriggersAutomatedRollback`: Injects write fault on policy 3, verifies zero forward progress, pre-existing value restored (99), absent value deleted (not zeroed), and transaction status `RolledBack`.
- `VerificationProbe_Mismatch_TriggersAutomatedRollback`: Confirms immediate probe divergence initiates rollback.
- `AdministratorImmunity_RejectsTransactionTargetingAdmin`: Confirms immunity for Built-in Administrators (`S-1-5-32-544`) and RID-500.
- `Rollback_ExecutedTwice_IsIdempotent`: Verifies idempotency of rollback requests.
- `DualBrowserPolicy_Incognito_DualRegistryWriteAndProcessDetection`: Verifies Chrome + Edge synchronization and `PendingAppRestart` detection.

---

## 4. Verdict & Recommendations

### Final Verdict: **APPROVE**

The code meets all requirements of Milestone 3 with excellent engineering standards:
1. Declarative design is cleanly decoupled from low-level registry mutations.
2. The 7-state transactional engine guarantees atomicity and zero unverified forward progress.
3. Baseline and reversal logic avoids setting missing values to 0.
4. Administrator immunity is inviolable across multiple architectural boundaries.
5. P/Invoke bindings and cross-platform guards are safely isolated and tested.

### Recommendations for Subsequent Milestones:
- In Milestone 4 (AppLocker engine), reuse the `TransactionEngine` and `BaselineSnapshotManager` patterns for AppLocker policy XML backup and rollback.
- Maintain the current high test coverage bar as new policy handlers are added to `PolicyCatalog`.
