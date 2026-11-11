# WinLab Specification & Implementation Blueprint: Milestone 3 (Features 18, 19, 20)
**Policy Engine Foundation — Wallpaper Lock, Sounds Lock & Mouse Pointers Lock**

- **Author:** Explorer Subagent (`explorer_m3_1`)
- **Recipient:** Orchestrator (`12bf6eae78a7fe11007f4aea28270901`)
- **Milestone:** Milestone 3 (First Functional Policy Engine)
- **Scope:**
  - Feature 18: Wallpaper Lock (`NoChangingWallPaper` under `Policies\ActiveDesktop`)
  - Feature 19: Sounds Lock (`NoChangingSoundScheme` under `Policies\Microsoft\Windows\Personalization`)
  - Feature 20: Mouse Pointers Lock (`NoChangingMousePointers` under `Policies\Microsoft\Windows\Personalization`)
- **Date:** 2026-11-10
- **Target File:** `/home/antigravity/krrozino/winlab/.agents/teamwork/explorer_m3_1/handoff.md`

---

## 1. Executive Summary & Context

Milestone 3 marks the transition of WinLab Desktop from read-only scanning and static previews to the **first real, functional, reversible policy engine**. As defined in `ORIGINAL_REQUEST.md` (Sections 4, 5, 6, 7, 10, 15) and `PROJECT.md`, M3 must implement the full end-to-end lifecycle for low-risk, fully reversible policies:
$$\text{Detect} \longrightarrow \text{Preview} \longrightarrow \text{Authorize} \longrightarrow \text{Backup} \longrightarrow \text{Apply} \longrightarrow \text{Verify} \longrightarrow \text{Persist} \longrightarrow \text{Revert}$$

Features 18, 19, and 20 are selected as the anchor personalization policies for Milestone 3:
1. **Feature 18: Wallpaper Lock** (`personalization.wallpaper`)
2. **Feature 19: Sounds Lock** (`personalization.sounds`)
3. **Feature 20: Mouse Pointers Lock** (`personalization.mouse_pointers`)

These three policies share vital characteristics:
- **Zero system stability risk**: They operate in the student's user profile hive (`HKEY_USERS\<StudentSID>`), never affecting system boot, drivers, network, or security tooling.
- **Inviolable Admin Protection**: Administrators (`S-1-5-32-544`) must never be restricted.
- **Deterministic Read-Only Probes**: Registry state can be conclusively verified.
- **100% Reversible**: Removing the registry property or setting value to 0 restores standard Windows customization immediately.
- **Tri-State Architecture Compliance**: Separates Desired State, Configured State, and Live Effective State, preventing false-positive "Activated" badges.

This document provides the exhaustive technical blueprint, Windows system registry specifications, elevation targeting logic, Win32 P/Invoke declarations, cross-platform unit test architecture (enabling 100% test execution on Linux), concrete C# interfaces, DTOs, classes, and worker implementation steps.

---

## 2. Windows Registry Specifications

### 2.1 Feature 18: Wallpaper Lock (`personalization.wallpaper`)

| Property | Value |
|---|---|
| **Policy ID** | `personalization.wallpaper` |
| **Category** | `Personalização` |
| **Title** | `Bloquear Alteração de Plano de Fundo` |
| **GPO Path** | User Configuration \ Administrative Templates \ Control Panel \ Personalization \ "Prevent changing desktop background" |
| **Target Registry Hive** | `HKEY_USERS\<TargetStudentSID>` (elevated execution) / `HKEY_CURRENT_USER` (user context) |
| **Relative SubKey Path** | `Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop` |
| **Full SubKey (Target SID)** | `HKEY_USERS\<TargetStudentSID>\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop` |
| **Value Name** | `NoChangingWallPaper` |
| **Value Type** | `REG_DWORD` (`RegistryValueKind.DWord`) |
| **Values** | `1` = Prevent changing wallpaper (Policy Locked/Enforced)<br>`0` = Unlocked<br>*Absent* = Default Windows behavior (Unlocked) |
| **Activation Requirement** | `PolicyActivationRequirement.LogoffOrRefresh` (`RequiresLogoff = true`) |
| **Reversibility** | 100% Reversible via `DeleteValue("NoChangingWallPaper")` or setting to `0` |
| **Risk Level** | `PolicyRisk.Low` |
| **Scope** | `PolicyScope.User` |

#### Windows Shell Impact & Observed Behavior
- **Settings App (`ms-settings:personalization-background`)**: Displays notice *"Some settings are managed by your organization"* (or *"Algumas configurações são gerenciadas pela sua organização"*). The dropdown selector *"Personalize your background"* is grayed out and disabled.
- **File Explorer Context Menu**: Right-click on image files -> *"Set as desktop background"* is either removed from the shell menu or rejected with an error when clicked.
- **Classic Control Panel**: Desktop Background applet is disabled.
- **Desktop Artifacts**: Does **not** modify or delete the current wallpaper image. It strictly prevents replacing it.
- **Activation Notes**: Windows Explorer caches `ActiveDesktop` policy settings per user session. When applied to an active session, full UI lock in Settings is immediate, but Explorer desktop context menus may require a desktop refresh (broadcasting `WM_SETTINGCHANGE` or `SHChangeNotify`) or user logoff/re-logon. If applied to an offline profile, it takes effect seamlessly when the student next logs on.

---

### 2.2 Feature 19: Sounds Lock (`personalization.sounds`)

| Property | Value |
|---|---|
| **Policy ID** | `personalization.sounds` |
| **Category** | `Personalização` |
| **Title** | `Bloquear Alteração de Esquema de Sons` |
| **GPO Path** | User Configuration \ Administrative Templates \ Control Panel \ Personalization \ "Prevent changing sound scheme" |
| **Target Registry Hive** | `HKEY_USERS\<TargetStudentSID>` / `HKEY_CURRENT_USER` |
| **Relative SubKey Path** | `Software\Policies\Microsoft\Windows\Personalization` |
| **Full SubKey (Target SID)** | `HKEY_USERS\<TargetStudentSID>\Software\Policies\Microsoft\Windows\Personalization` |
| **Value Name** | `NoChangingSoundScheme` |
| **Value Type** | `REG_DWORD` (`RegistryValueKind.DWord`) |
| **Values** | `1` = Prevent changing sound scheme (Policy Locked)<br>`0` = Unlocked<br>*Absent* = Default Windows behavior (Unlocked) |
| **Activation Requirement** | `PolicyActivationRequirement.Immediate` (`RequiresLogoff = false`, `RequiresRestart = false`) |
| **Reversibility** | 100% Reversible via `DeleteValue("NoChangingSoundScheme")` |
| **Risk Level** | `PolicyRisk.Low` |
| **Scope** | `PolicyScope.User` |

#### Windows Shell Impact & Observed Behavior
- **Sound Control Panel (`mmsys.cpl`, Sounds tab)**: The *"Sound Scheme"* dropdown menu is grayed out. The *"Save As..."* and *"Delete"* scheme buttons are disabled.
- **Settings App (`ms-settings:sounds`)**: Custom sound scheme assignment controls are grayed out.
- **Audio Output**: System audio and student applications continue playing sounds normally; only customization of the scheme is restricted.
- **Activation Notes**: Takes effect immediately for any newly opened dialog or Settings page.

---

### 2.3 Feature 20: Mouse Pointers Lock (`personalization.mouse_pointers`)

| Property | Value |
|---|---|
| **Policy ID** | `personalization.mouse_pointers` |
| **Category** | `Personalização` |
| **Title** | `Bloquear Alteração de Ponteiros do Mouse` |
| **GPO Path** | User Configuration \ Administrative Templates \ Control Panel \ Personalization \ "Prevent changing mouse pointers" |
| **Target Registry Hive** | `HKEY_USERS\<TargetStudentSID>` / `HKEY_CURRENT_USER` |
| **Relative SubKey Path** | `Software\Policies\Microsoft\Windows\Personalization` |
| **Full SubKey (Target SID)** | `HKEY_USERS\<TargetStudentSID>\Software\Policies\Microsoft\Windows\Personalization` |
| **Value Name** | `NoChangingMousePointers` |
| **Value Type** | `REG_DWORD` (`RegistryValueKind.DWord`) |
| **Values** | `1` = Prevent changing mouse pointers (Policy Locked)<br>`0` = Unlocked<br>*Absent* = Default Windows behavior (Unlocked) |
| **Activation Requirement** | `PolicyActivationRequirement.Immediate` (`RequiresLogoff = false`, `RequiresRestart = false`) |
| **Reversibility** | 100% Reversible via `DeleteValue("NoChangingMousePointers")` |
| **Risk Level** | `PolicyRisk.Low` |
| **Scope** | `PolicyScope.User` |

#### Windows Shell Impact & Observed Behavior
- **Mouse Properties Dialog (`main.cpl`, Pointers tab)**: The *"Scheme"* dropdown selector is disabled. The *"Browse..."* button for custom cursor files (.cur/.ani) is disabled. The *"Use Default"* button is disabled.
- **Settings App (`ms-settings:mousetouchpad`)**: Custom mouse pointer size and color schemes cannot be altered by the restricted user.
- **Mouse Hardware**: Cursor movement, clicks, scrolling, and primary/secondary button swaps continue functioning normally; only visual cursor scheme changes are locked.
- **Activation Notes**: Takes effect immediately for newly opened dialogs or Settings windows.

---

## 3. Target User Targeting Architecture

When executing mutative operations, `WinLab.Executor` runs elevated with High Integrity Level (`asAdministrator` or `SYSTEM`). Because Features 18, 19, and 20 are **per-user policies**, the engine must accurately resolve, validate, and target the specific standard student account (`Aluno`) without affecting administrators.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        WinLab.Executor (Elevated)                      │
│                                                                        │
│   Target Identity: "Aluno" ──▶ SecurityIdentifier: "S-1-5-21-..."       │
│                                                                        │
│   [ADMIN PROTECTION GUARD]                                             │
│   Is Admin SID (S-1-5-32-544)? ──▶ YES ──▶ REJECT (FATAL ERROR)        │
│                                ──▶ NO  ──▶ PROCEED                     │
│                                                                        │
│   [HIVE MOUNT DISPATCHER]                                              │
│   Is HKEY_USERS\<SID> mounted in memory?                               │
│       ├─▶ YES (Interactive Logon)                                      │
│       │    └─▶ Direct Access: HKEY_USERS\<SID>\...                     │
│       │                                                                │
│       └─▶ NO (Offline Profile)                                         │
│            ├─▶ Find ProfileImagePath in HKLM ProfileList               │
│            ├─▶ Does NTUSER.DAT exist?                                  │
│            │    ├─▶ YES ──▶ RegLoadKey(HKEY_USERS, SID, NTUSER.DAT)    │
│            │    │            └─▶ Mutate / Probe                        │
│            │    │            └─▶ GC.Collect() + Close Handles          │
│            │    │            └─▶ RegUnLoadKey(HKEY_USERS, SID)         │
│            │    │                                                      │
│            │    └─▶ NO  ──▶ User Profile Not Created Yet               │
│            │                 └─▶ Emit State: PendingFirstLogon         │
│            │                 └─▶ Stage for Logon Scheduled Task        │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Inviolable Administrator Protection Guard
WinLab enforces an unbreakable safety invariant:
1. The target account SID must be verified against `WellKnownSidType.BuiltinAdministratorsSid` (`S-1-5-32-544`).
2. The target account must be verified against the local Administrators group membership.
3. If the target account is an administrator or matches the current elevated operator, any mutation request targeting user lockdown policies is **aborted with an explicit error**:
   ```csharp
   if (IsTargetUserAdministrator(targetSid))
   {
       throw new InvalidOperationException(
           $"Safety Violation: Target user SID '{targetSid}' is an Administrator. " +
           "Personalization lockdown policies can NEVER be applied to administrative accounts.");
   }
   ```

### 3.2 Handling the Three Target User Profile Scenarios

#### Scenario A: Target User is Logged On (Interactive Session)
- **Condition**: Windows has already loaded the user's `NTUSER.DAT` during their logon session.
- **Detection**: `RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Default).OpenSubKey(targetSid) != null`.
- **Handling**: The executor directly opens `HKEY_USERS\<targetSid>\Software\...` with read or read/write access. No mounting or unmounting is necessary.

#### Scenario B: Target User is Offline, but Profile Exists on Disk (Offline Profile)
- **Condition**: The user has logged on at least once previously. Their profile directory exists on the system drive (typically `C:\Users\Aluno`), and `NTUSER.DAT` is present on disk, but the user is not currently logged on.
- **Authoritative Profile Discovery**:
  The executor must **never** hardcode `C:\Users\<Username>`. Instead, it queries the authoritative Windows registry path:
  `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\<TargetSID>`
  - Read value: `ProfileImagePath` (`REG_EXPAND_SZ` or `REG_SZ`).
  - Resolve hive path: `string hivePath = Path.Combine(Environment.ExpandEnvironmentVariables(profileImagePath), "NTUSER.DAT")`.
- **Hive Mounting Protocol via Win32 API**:
  To mount the hive into `HKEY_USERS`, the process requires `SeRestorePrivilege` and `SeBackupPrivilege`.
  ```csharp
  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  internal static extern int RegLoadKey(IntPtr hKey, string lpSubKey, string lpFile);

  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  internal static extern int RegUnLoadKey(IntPtr hKey, string lpSubKey);
  ```
  - `hKey`: `new IntPtr(unchecked((int)0x80000003))` (`HKEY_USERS`).
  - `lpSubKey`: `targetSid` (or a unique subkey like `WinLab_Temp_<targetSid>`).
  - `lpFile`: `hivePath` (absolute path to `NTUSER.DAT`).
- **Critical Unloading & Handle Discipline**:
  If any process holds an open registry key handle inside that hive, `RegUnLoadKey` will fail with Win32 Error `5` (`ERROR_ACCESS_DENIED`) or `32` (`ERROR_SHARING_VIOLATION`), corrupting subsequent logon attempts!
  To guarantee reliable unmounting:
  1. All `RegistryKey` objects must be created within strict `using` statements.
  2. Call `key.Flush()` and `key.Dispose()`.
  3. Explicitly trigger garbage collection before unmounting:
     ```csharp
     GC.Collect();
     GC.WaitForPendingFinalizers();
     ```
  4. Invoke `RegUnLoadKey(HKEY_USERS, targetSid)`.
  5. Check return code: `0` indicates success (`ERROR_SUCCESS`).

#### Scenario C: Target User has Never Logged On (`NTUSER.DAT` Missing)
- **Condition**: The user account was created via `LocalAccountsScanner` / Windows API, but the user has never completed their initial logon. In Windows, `NTUSER.DAT` is generated only during first interactive logon by copying `C:\Users\Default\NTUSER.DAT`.
- **Detection**: `ProfileImagePath` registry key does not exist, or `File.Exists(hivePath)` returns `false`.
- **Handling**:
  - The probe emits state: `PolicyEffectiveState.PendingFirstLogon` with message: *"Perfil do usuário ainda não inicializado no disco. Políticas serão aplicadas no primeiro logon."*
  - The apply engine stages the policy payload and registers the deferred scheduled task (Feature 29 / Section 7: `WinLab-Apply-UserPolicies`) triggered at `$Aluno` logon under `SYSTEM` credentials.

#### Scenario D: Running in Unprivileged User Context (Dev / Demo)
- When running in current user context (e.g. during local development or non-elevated testing), the engine targets `HKEY_CURRENT_USER` directly if `targetSid` is null, empty, or equals the current user SID.

---

## 4. Read-Only Verification Probes & Tri-State Engine

A foundational principle of WinLab (`ORIGINAL_REQUEST.md` §5 and §6) is:
> *"Não mostrar 'Ativado' simplesmente porque um comando terminou sem erro."*

The engine separates three distinct states for every policy:
1. **Desired State (`PolicyDesiredState`)**: What the administrator selected in the WinLab interface (`NotConfigured` or `Blocked`).
2. **Configured State (`PolicyConfiguredState`)**: What WinLab successfully committed and persisted to `state.json`.
3. **Effective State (`PolicyEffectiveState`)**: What a live, read-only registry probe conclusively proves is active in the operating system.

### 4.1 State Matrix & Drift Detection

| Desired State | Configured State | Live Registry Value | Hive Status | Effective State | UI Status Badge | UI Action |
|---|---|---|---|---|---|---|
| `NotConfigured` | `NotConfigured` | Value missing or `0` | Any | `NotConfigured` | Cinza ("Não Configurado") | Permitir Ativar |
| `NotConfigured` | `NotConfigured` | Value exists and `== 1` | Any | `Drifted` | Laranja ("Divergente") | Revalidar / Aceitar / Reverter |
| `Blocked` | `Blocked` | Value exists and `== 1` | Active Session (Sounds, Pointers) | `Applied` | Verde ("Ativado") | Permitir Desativar |
| `Blocked` | `Blocked` | Value exists and `== 1` | Active Session (Wallpaper - unrefreshed) | `PendingLogoff` | Amarelo ("Aguardando Logoff") | Notificar Reinício/Logoff |
| `Blocked` | `Blocked` | Value exists and `== 1` | Offline Profile (Mounted & verified) | `Applied` | Verde ("Ativado") | Permitir Desativar |
| `Blocked` | `Blocked` | Value missing or `0` | Any | `Drifted` | Laranja ("Divergente") | Reaplicar (Elevado) |
| `Blocked` | Any | Profile uninitialized on disk | Uninitialized | `PendingFirstLogon` | Azul ("Primeiro Logon") | Informativo |
| Any | Any | Error reading hive (Access Denied) | Error | `Inconclusive` | Roxo ("Inconclusivo") | Diagnosticar Permissões |

### 4.2 Read-Only Probe Algorithm

For Features 18, 19, and 20, the probe algorithm is deterministic and non-mutating:

```csharp
public PolicyProbeResult Probe(string targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
{
    // 1. Ensure target user hive is accessible
    using var hiveScope = hiveManager.OpenUserHive(targetUserSid);
    if (!hiveScope.IsAvailable)
    {
        if (hiveScope.ProfileStatus == UserProfileStatus.NotCreated)
        {
            return PolicyProbeResult.CreatePendingFirstLogon(PolicyId);
        }
        return PolicyProbeResult.CreateInconclusive(PolicyId, hiveScope.ErrorMessage);
    }

    // 2. Read live value from registry
    string fullSubKey = $@"{hiveScope.RootPath}\{RelativeSubKeyPath}";
    object? rawValue = registry.GetValue(RegistryHive.Users, fullSubKey, ValueName, null);

    // 3. Evaluate live state
    bool isValuePresent = rawValue != null;
    int numericValue = isValuePresent ? Convert.ToInt32(rawValue) : 0;
    bool isPolicyActive = isValuePresent && numericValue == 1;

    // 4. Return probe outcome
    return new PolicyProbeResult
    {
        PolicyId = PolicyId,
        IsActive = isPolicyActive,
        LiveValue = rawValue,
        RequiresLogoff = RequiresLogoff,
        RequiresRestart = RequiresRestart,
        TargetSid = targetUserSid,
        ProbedAtUtc = DateTime.UtcNow
    };
}
```

---

## 5. Architectural Design: Classes, Interfaces & Contracts

To ensure strict separation of concerns, testability on Linux (avoiding `PlatformNotSupportedException` in CI), and clean extensibility, the architecture is divided across `WinLab.Contracts` and `WinLab.Executor`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   WinLab.Contracts (net10.0 Standard)                  │
│                                                                        │
│   ├── Enums: PolicyDesiredState, PolicyEffectiveState, PolicyScope...  │
│   ├── DTOs: PolicyItemDto, PolicyApplyRequestDto, PolicyProbeResult... │
│   ├── Abstractions:                                                    │
│   │     ├── IRegistryService                                           │
│   │     ├── IUserHiveManager & IUserHiveScope                          │
│   │     ├── IPolicyHandler                                             │
│   │     └── IPolicyCatalog                                             │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Implements / Uses
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 WinLab.Executor (Elevated Windows Host)                │
│                                                                        │
│   ├── WindowsRegistryService : IRegistryService (Microsoft.Win32)      │
│   ├── WindowsUserHiveManager : IUserHiveManager (Advapi32 RegLoadKey)  │
│   ├── PolicyCatalog : IPolicyCatalog (Registers Features 18, 19, 20)  │
│   ├── RegistryDWordPolicyHandler : IPolicyHandler                      │
│   ├── PolicyEngine (Detect, Backup, Apply, Verify, Revert)             │
│   ├── BaselineSnapshotManager (Registry .reg & JSON snapshot storage)  │
│   └── ExecutorHost (IPC dispatcher: policy.query_state, policy.apply)  │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ Tested by
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                 WinLab.Tests (xUnit Test Suite - Cross-Platform)       │
│                                                                        │
│   ├── InMemoryRegistryService : IRegistryService (Linux compatible)    │
│   ├── MockUserHiveManager : IUserHiveManager (Linux compatible)        │
│   ├── PolicyHandlerTests (Features 18, 19, 20 test coverage)           │
│   ├── PolicyEngineLifecycleTests (Backup -> Apply -> Revert)           │
│   └── AdminProtectionInvariantTests                                    │
└────────────────────────────────────────────────────────────────────────┘
```

### 5.1 New Contracts in `desktop/src/WinLab.Contracts`

#### 5.1.1 Registry Abstraction (`IRegistryService.cs`)
File: `desktop/src/WinLab.Contracts/Registry/IRegistryService.cs`

```csharp
using System;
using System.Collections.Generic;
using Microsoft.Win32;

namespace WinLab.Contracts.Registry
{
    /// <summary>
    /// Abstração para operações no Registro do Windows.
    /// Permite execução nativa no Windows e simulação de alta fidelidade em memória no Linux.
    /// </summary>
    public interface IRegistryService
    {
        bool KeyExists(RegistryHive hive, string subKeyPath);
        bool ValueExists(RegistryHive hive, string subKeyPath, string valueName);
        object? GetValue(RegistryHive hive, string subKeyPath, string valueName, object? defaultValue = null);
        void SetValue(RegistryHive hive, string subKeyPath, string valueName, object value, RegistryValueKind valueKind);
        void DeleteValue(RegistryHive hive, string subKeyPath, string valueName);
        void CreateSubKey(RegistryHive hive, string subKeyPath);
        void DeleteSubKeyTree(RegistryHive hive, string subKeyPath);
        string[] GetSubKeyNames(RegistryHive hive, string subKeyPath);
        string[] GetValueNames(RegistryHive hive, string subKeyPath);
        IDictionary<string, object?> SnapshotKey(RegistryHive hive, string subKeyPath);
    }
}
```

#### 5.1.2 User Hive Management Abstraction (`IUserHiveManager.cs`)
File: `desktop/src/WinLab.Contracts/Registry/IUserHiveManager.cs`

```csharp
using System;

namespace WinLab.Contracts.Registry
{
    public enum UserProfileStatus
    {
        ActiveSession,
        OfflineProfileReady,
        NotCreated,
        Inaccessible
    }

    public interface IUserHiveScope : IDisposable
    {
        string UserSid { get; }
        string RootPath { get; } // Ex: "S-1-5-21-..." sob HKEY_USERS
        bool IsAvailable { get; }
        bool WasLoadedFromDisk { get; }
        UserProfileStatus ProfileStatus { get; }
        string? ErrorMessage { get; }
    }

    public interface IUserHiveManager
    {
        IUserHiveScope OpenUserHive(string userSid);
        bool IsUserLoggedOn(string userSid);
        string? GetUserProfilePath(string userSid);
        bool IsUserAdministrator(string userSid);
    }
}
```

#### 5.1.3 Policy Handler & Catalog Interfaces (`IPolicyHandler.cs`, `IPolicyCatalog.cs`)
File: `desktop/src/WinLab.Contracts/Policies/IPolicyHandler.cs`

```csharp
using System;
using System.Collections.Generic;
using WinLab.Contracts.Registry;

namespace WinLab.Contracts.Policies
{
    public enum PolicyDesiredState
    {
        NotConfigured = 0,
        Blocked = 1
    }

    public enum PolicyEffectiveState
    {
        NotConfigured,
        Applying,
        Applied,
        PendingRefresh,
        PendingLogoff,
        PendingReboot,
        PendingFirstLogon,
        Drifted,
        Failed,
        Inconclusive,
        NotSupported,
        Reverted
    }

    public class PolicyProbeResult
    {
        public string PolicyId { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public object? LiveValue { get; set; }
        public bool RequiresLogoff { get; set; }
        public bool RequiresRestart { get; set; }
        public string TargetSid { get; set; } = string.Empty;
        public PolicyEffectiveState EffectiveState { get; set; }
        public string? DetailMessage { get; set; }
        public DateTime ProbedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class PolicyApplyResult
    {
        public string PolicyId { get; set; } = string.Empty;
        public bool Success { get; set; }
        public PolicyEffectiveState EffectiveState { get; set; }
        public string? Error { get; set; }
        public bool RequiresLogoff { get; set; }
        public bool RequiresRestart { get; set; }
        public DateTime AppliedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class PolicyRevertResult
    {
        public string PolicyId { get; set; } = string.Empty;
        public bool Success { get; set; }
        public PolicyEffectiveState EffectiveState { get; set; } = PolicyEffectiveState.NotConfigured;
        public string? Error { get; set; }
        public DateTime RevertedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public interface IPolicyHandler
    {
        string PolicyId { get; }
        string Category { get; }
        string Title { get; }
        string Description { get; }
        PolicyScope Scope { get; }
        PolicyRisk Risk { get; }
        bool RequiresRestart { get; }
        bool RequiresLogoff { get; }
        bool Reversible { get; }

        PolicyProbeResult Probe(string targetUserSid, IRegistryService registry, IUserHiveManager hiveManager);
        PolicyApplyResult Apply(string targetUserSid, PolicyDesiredState desiredState, IRegistryService registry, IUserHiveManager hiveManager);
        PolicyRevertResult Revert(string targetUserSid, IRegistryService registry, IUserHiveManager hiveManager);
    }

    public interface IPolicyCatalog
    {
        IReadOnlyList<IPolicyHandler> GetAllPolicies();
        IPolicyHandler? GetPolicy(string policyId);
    }
}
```

---

### 5.2 Implementation Classes in `desktop/src/WinLab.Executor`

#### 5.2.1 Generic Registry Policy Handler (`RegistryDWordPolicyHandler.cs`)
File: `desktop/src/WinLab.Executor/Policies/RegistryDWordPolicyHandler.cs`

This generic handler powers Features 18, 19, and 20, as well as future registry policies:

```csharp
using System;
using Microsoft.Win32;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.Registry;

namespace WinLab.Executor.Policies
{
    public class RegistryDWordPolicyHandler : IPolicyHandler
    {
        public string PolicyId { get; }
        public string Category { get; }
        public string Title { get; }
        public string Description { get; }
        public PolicyScope Scope { get; }
        public PolicyRisk Risk { get; }
        public bool RequiresRestart { get; }
        public bool RequiresLogoff { get; }
        public bool Reversible { get; }

        public string RelativeSubKeyPath { get; }
        public string ValueName { get; }
        public int EnforcedValue { get; } = 1;
        public int UnconfiguredValue { get; } = 0;

        public RegistryDWordPolicyHandler(
            string policyId,
            string category,
            string title,
            string description,
            string relativeSubKeyPath,
            string valueName,
            bool requiresLogoff = false,
            bool requiresRestart = false,
            PolicyRisk risk = PolicyRisk.Low,
            PolicyScope scope = PolicyScope.User)
        {
            PolicyId = policyId;
            Category = category;
            Title = title;
            Description = description;
            RelativeSubKeyPath = relativeSubKeyPath;
            ValueName = valueName;
            RequiresLogoff = requiresLogoff;
            RequiresRestart = requiresRestart;
            Risk = risk;
            Scope = scope;
            Reversible = true;
        }

        public PolicyProbeResult Probe(string targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            using var hiveScope = hiveManager.OpenUserHive(targetUserSid);
            if (!hiveScope.IsAvailable)
            {
                if (hiveScope.ProfileStatus == UserProfileStatus.NotCreated)
                {
                    return new PolicyProbeResult
                    {
                        PolicyId = PolicyId,
                        IsActive = false,
                        EffectiveState = PolicyEffectiveState.PendingFirstLogon,
                        DetailMessage = "Perfil do usuário ainda não inicializado no disco.",
                        TargetSid = targetUserSid
                    };
                }

                return new PolicyProbeResult
                {
                    PolicyId = PolicyId,
                    IsActive = false,
                    EffectiveState = PolicyEffectiveState.Inconclusive,
                    DetailMessage = hiveScope.ErrorMessage,
                    TargetSid = targetUserSid
                };
            }

            string subKey = $@"{hiveScope.RootPath}\{RelativeSubKeyPath}";
            object? rawValue = registry.GetValue(RegistryHive.Users, subKey, ValueName, null);
            bool isActive = rawValue != null && Convert.ToInt32(rawValue) == EnforcedValue;

            PolicyEffectiveState state = isActive
                ? (RequiresLogoff ? PolicyEffectiveState.PendingLogoff : PolicyEffectiveState.Applied)
                : PolicyEffectiveState.NotConfigured;

            return new PolicyProbeResult
            {
                PolicyId = PolicyId,
                IsActive = isActive,
                LiveValue = rawValue,
                EffectiveState = state,
                RequiresLogoff = RequiresLogoff,
                RequiresRestart = RequiresRestart,
                TargetSid = targetUserSid,
                ProbedAtUtc = DateTime.UtcNow
            };
        }

        public PolicyApplyResult Apply(string targetUserSid, PolicyDesiredState desiredState, IRegistryService registry, IUserHiveManager hiveManager)
        {
            if (hiveManager.IsUserAdministrator(targetUserSid))
            {
                return new PolicyApplyResult
                {
                    PolicyId = PolicyId,
                    Success = false,
                    Error = "Violação de segurança: Não é permitido aplicar bloqueios de personalização à conta de administrador.",
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }

            using var hiveScope = hiveManager.OpenUserHive(targetUserSid);
            if (!hiveScope.IsAvailable)
            {
                return new PolicyApplyResult
                {
                    PolicyId = PolicyId,
                    Success = false,
                    Error = hiveScope.ErrorMessage,
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }

            string subKey = $@"{hiveScope.RootPath}\{RelativeSubKeyPath}";

            if (desiredState == PolicyDesiredState.Blocked)
            {
                registry.SetValue(RegistryHive.Users, subKey, ValueName, EnforcedValue, RegistryValueKind.DWord);
                return new PolicyApplyResult
                {
                    PolicyId = PolicyId,
                    Success = true,
                    EffectiveState = RequiresLogoff ? PolicyEffectiveState.PendingLogoff : PolicyEffectiveState.Applied,
                    RequiresLogoff = RequiresLogoff,
                    RequiresRestart = RequiresRestart
                };
            }
            else
            {
                registry.DeleteValue(RegistryHive.Users, subKey, ValueName);
                return new PolicyApplyResult
                {
                    PolicyId = PolicyId,
                    Success = true,
                    EffectiveState = PolicyEffectiveState.NotConfigured
                };
            }
        }

        public PolicyRevertResult Revert(string targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            using var hiveScope = hiveManager.OpenUserHive(targetUserSid);
            if (!hiveScope.IsAvailable)
            {
                return new PolicyRevertResult
                {
                    PolicyId = PolicyId,
                    Success = false,
                    Error = hiveScope.ErrorMessage,
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }

            string subKey = $@"{hiveScope.RootPath}\{RelativeSubKeyPath}";
            registry.DeleteValue(RegistryHive.Users, subKey, ValueName);

            return new PolicyRevertResult
            {
                PolicyId = PolicyId,
                Success = true,
                EffectiveState = PolicyEffectiveState.NotConfigured
            };
        }
    }
}
```

#### 5.2.2 Policy Catalog (`PolicyCatalog.cs`)
File: `desktop/src/WinLab.Executor/Policies/PolicyCatalog.cs`

```csharp
using System;
using System.Collections.Generic;
using System.Linq;
using WinLab.Contracts;
using WinLab.Contracts.Policies;

namespace WinLab.Executor.Policies
{
    public class PolicyCatalog : IPolicyCatalog
    {
        private readonly Dictionary<string, IPolicyHandler> _policies;

        public PolicyCatalog()
        {
            _policies = new Dictionary<string, IPolicyHandler>(StringComparer.OrdinalIgnoreCase);
            RegisterDefaults();
        }

        private void RegisterDefaults()
        {
            // Feature 18: Wallpaper Lock
            Register(new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Alteração de Plano de Fundo",
                description: "Fixa o papel de parede do laboratório e impede alterações pelo aluno no painel e Explorer.",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper",
                requiresLogoff: true,
                requiresRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.User
            ));

            // Feature 19: Sounds Lock
            Register(new RegistryDWordPolicyHandler(
                policyId: "personalization.sounds",
                category: "Personalização",
                title: "Bloquear Alteração de Esquema de Sons",
                description: "Impede alterar os esquemas de áudio do Windows no Painel de Sons e Configurações.",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingSoundScheme",
                requiresLogoff: false,
                requiresRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.User
            ));

            // Feature 20: Mouse Pointers Lock
            Register(new RegistryDWordPolicyHandler(
                policyId: "personalization.mouse_pointers",
                category: "Personalização",
                title: "Bloquear Alteração de Ponteiros do Mouse",
                description: "Impede alterar esquema de cursores do mouse e impede carregar ponteiros .cur/.ani.",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingMousePointers",
                requiresLogoff: false,
                requiresRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.User
            ));
        }

        public void Register(IPolicyHandler handler)
        {
            _policies[handler.PolicyId] = handler;
        }

        public IReadOnlyList<IPolicyHandler> GetAllPolicies()
        {
            return _policies.Values.ToList();
        }

        public IPolicyHandler? GetPolicy(string policyId)
        {
            _policies.TryGetValue(policyId, out var handler);
            return handler;
        }
    }
}
```

#### 5.2.3 Baseline Snapshot & Rollback Storage (`BaselineSnapshotManager.cs`)
File: `desktop/src/WinLab.Executor/Transactions/BaselineSnapshotManager.cs`

Prior to any registry mutation:
1. Generate UUID Transaction ID: `string txId = Guid.NewGuid().ToString("D")`.
2. Directory: `C:\ProgramData\WinLab\Backups\Baseline-{txId}\`.
3. Snapshot Key/Value pairs:
   - Records whether the subkey existed.
   - Records whether each value existed, its type (`REG_DWORD`), and previous data.
4. Persist `baseline.json` with cryptographic SHA-256 integrity hash.
5. In case of error during apply: `RollbackTransaction(txId)` automatically restores the captured baseline.

#### 5.2.4 Policy Engine Core (`PolicyEngine.cs`)
File: `desktop/src/WinLab.Executor/Policies/PolicyEngine.cs`

Orchestrates the complete 8-step lifecycle:
```csharp
public class PolicyEngine
{
    private readonly IPolicyCatalog _catalog;
    private readonly IRegistryService _registry;
    private readonly IUserHiveManager _hiveManager;
    private readonly BaselineSnapshotManager _snapshotManager;

    public PolicyEngine(
        IPolicyCatalog catalog,
        IRegistryService registry,
        IUserHiveManager hiveManager,
        BaselineSnapshotManager snapshotManager)
    {
        _catalog = catalog;
        _registry = registry;
        _hiveManager = hiveManager;
        _snapshotManager = snapshotManager;
    }

    public PolicyStateSummaryDto QueryPolicyStates(string targetUserSid, IDictionary<string, PolicyDesiredState>? desiredStates = null);
    public PolicyApplyResponseDto ApplyPolicies(PolicyApplyRequestDto request);
    public PolicyRollbackResponseDto Rollback(string transactionId, string targetUserSid);
}
```

---

### 5.3 Linux CI Unit Test Abstractions (`InMemoryRegistryService.cs`)

To satisfy the invariant that all C# unit tests run and pass 100% green on Linux (`dotnet test`), we provide an in-memory registry implementation mimicking Windows Registry hives, subkeys, and value kinds.

File: `desktop/tests/WinLab.Tests/Mocks/InMemoryRegistryService.cs`

```csharp
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Win32;
using WinLab.Contracts.Registry;

namespace WinLab.Tests.Mocks
{
    public class InMemoryRegistryService : IRegistryService
    {
        private readonly ConcurrentDictionary<string, ConcurrentDictionary<string, (object Value, RegistryValueKind Kind)>> _hives 
            = new(StringComparer.OrdinalIgnoreCase);

        private string MakeKey(RegistryHive hive, string subKey)
        {
            return $"{hive}::{subKey.Trim('\\')}".ToLowerInvariant();
        }

        public bool KeyExists(RegistryHive hive, string subKeyPath)
        {
            return _hives.ContainsKey(MakeKey(hive, subKeyPath));
        }

        public bool ValueExists(RegistryHive hive, string subKeyPath, string valueName)
        {
            if (_hives.TryGetValue(MakeKey(hive, subKeyPath), out var values))
            {
                return values.ContainsKey(valueName);
            }
            return false;
        }

        public object? GetValue(RegistryHive hive, string subKeyPath, string valueName, object? defaultValue = null)
        {
            if (_hives.TryGetValue(MakeKey(hive, subKeyPath), out var values))
            {
                if (values.TryGetValue(valueName, out var tuple))
                {
                    return tuple.Value;
                }
            }
            return defaultValue;
        }

        public void SetValue(RegistryHive hive, string subKeyPath, string valueName, object value, RegistryValueKind valueKind)
        {
            string key = MakeKey(hive, subKeyPath);
            var values = _hives.GetOrAdd(key, _ => new ConcurrentDictionary<string, (object, RegistryValueKind)>(StringComparer.OrdinalIgnoreCase));
            values[valueName] = (value, valueKind);
        }

        public void DeleteValue(RegistryHive hive, string subKeyPath, string valueName)
        {
            if (_hives.TryGetValue(MakeKey(hive, subKeyPath), out var values))
            {
                values.TryRemove(valueName, out _);
            }
        }

        public void CreateSubKey(RegistryHive hive, string subKeyPath)
        {
            _hives.GetOrAdd(MakeKey(hive, subKeyPath), _ => new ConcurrentDictionary<string, (object, RegistryValueKind)>(StringComparer.OrdinalIgnoreCase));
        }

        public void DeleteSubKeyTree(RegistryHive hive, string subKeyPath)
        {
            string prefix = MakeKey(hive, subKeyPath);
            var toRemove = _hives.Keys.Where(k => k.Equals(prefix, StringComparison.OrdinalIgnoreCase) || k.StartsWith(prefix + "\\")).ToList();
            foreach (var k in toRemove)
            {
                _hives.TryRemove(k, out _);
            }
        }

        public string[] GetSubKeyNames(RegistryHive hive, string subKeyPath)
        {
            string prefix = MakeKey(hive, subKeyPath) + "\\";
            return _hives.Keys
                .Where(k => k.StartsWith(prefix))
                .Select(k => k.Substring(prefix.Length).Split('\\')[0])
                .Distinct()
                .ToArray();
        }

        public string[] GetValueNames(RegistryHive hive, string subKeyPath)
        {
            if (_hives.TryGetValue(MakeKey(hive, subKeyPath), out var values))
            {
                return values.Keys.ToArray();
            }
            return Array.Empty<string>();
        }

        public IDictionary<string, object?> SnapshotKey(RegistryHive hive, string subKeyPath)
        {
            if (_hives.TryGetValue(MakeKey(hive, subKeyPath), out var values))
            {
                return values.ToDictionary(k => k.Key, v => (object?)v.Value.Value);
            }
            return new Dictionary<string, object?>();
        }
    }
}
```

---

## 6. Security & Validator Updates

### 6.1 `SecurityValidator.cs` Allowlist Adaptation
In Milestone 1, `SecurityValidator.ValidateAction` contained a temporary gate:
```csharp
// Na etapa de fundação, o executor privilegiado está estritamente desabilitado por especificação.
if (action == IpcConstants.ActionApplyPolicies || action == IpcConstants.ActionRollbackPolicies)
{
    return (false, "Privileged policy execution is disabled in the foundation desktop stage...", "PRIVILEGED_EXECUTOR_DISABLED");
}
```

In Milestone 3:
1. `IpcConstants.ActionApplyPolicies` (`"policy.apply"`) and `IpcConstants.ActionRollbackPolicies` (`"policy.rollback"`) are fully enabled in `SecurityValidator.cs` and `src/desktop/contracts.ts`.
2. The payload validator strictly verifies that:
   - `action` is one of `AllowedActions`.
   - `policyIds` in `payload` contains only valid IDs from the policy catalog (e.g. `personalization.wallpaper`, `personalization.sounds`, `personalization.mouse_pointers`).
   - `targetUserSid` is present and well-formed (`S-1-5-21-...`).
   - Inviolable admin check: Target SID is **not** an administrator.
   - Arbitrary shell pattern checks (`powershell`, `cmd`, etc.) remain in full force.

---

## 7. Concrete Step-by-Step Implementation Blueprint for Workers

### Phase 1: Contracts & Abstractions (`WinLab.Contracts`)
- **Step 1.1**: Create `desktop/src/WinLab.Contracts/Registry/IRegistryService.cs` (registry abstraction).
- **Step 1.2**: Create `desktop/src/WinLab.Contracts/Registry/IUserHiveManager.cs` (hive scope and user targeting abstraction).
- **Step 1.3**: Create `desktop/src/WinLab.Contracts/Policies/IPolicyHandler.cs` (state enums, probe/apply/revert results, policy interface).
- **Step 1.4**: Update `desktop/src/WinLab.Contracts/PolicyModels.cs` to add `PolicyApplyRequestDto`, `PolicyApplyResponseDto`, `PolicyRollbackRequestDto`, and `PolicyRollbackResponseDto`.
- **Step 1.5**: Update `desktop/src/WinLab.Contracts/SecurityValidator.cs` to allow `ActionApplyPolicies` and `ActionRollbackPolicies` when running under M3 engine.

### Phase 2: In-Memory Mocks & Unit Test Foundation (`WinLab.Tests`)
- **Step 2.1**: Create `desktop/tests/WinLab.Tests/Mocks/InMemoryRegistryService.cs`.
- **Step 2.2**: Create `desktop/tests/WinLab.Tests/Mocks/MockUserHiveManager.cs`.
- **Step 2.3**: Create `desktop/tests/WinLab.Tests/Policies/PolicyCatalogTests.cs`:
  - Verify Features 18, 19, and 20 are registered with exact keys and properties.
- **Step 2.4**: Create `desktop/tests/WinLab.Tests/Policies/PersonalizationPolicyTests.cs`:
  - Test Wallpaper Lock: Probe unconfigured -> Apply Blocked -> Verify value 1 in `Policies\ActiveDesktop\NoChangingWallPaper` -> Verify `PendingLogoff` -> Revert -> Verify value removed.
  - Test Sounds Lock: Probe unconfigured -> Apply Blocked -> Verify value 1 in `Policies\Microsoft\Windows\Personalization\NoChangingSoundScheme` -> Verify `Applied` -> Revert.
  - Test Mouse Pointers Lock: Probe unconfigured -> Apply Blocked -> Verify value 1 in `Policies\Microsoft\Windows\Personalization\NoChangingMousePointers` -> Verify `Applied` -> Revert.
- **Step 2.5**: Create `desktop/tests/WinLab.Tests/Policies/AdminProtectionTests.cs`:
  - Assert that attempting to apply personalization policies to an Administrator SID throws `InvalidOperationException` or returns failure.
- **Step 2.6**: Run `dotnet test` on Linux to ensure all new unit tests pass cleanly.

### Phase 3: Windows Implementations (`WinLab.Executor`)
- **Step 3.1**: Create `desktop/src/WinLab.Executor/Registry/WindowsRegistryService.cs` (wrapping `Microsoft.Win32.RegistryKey` with `OperatingSystem.IsWindows()` guard).
- **Step 3.2**: Create `desktop/src/WinLab.Executor/Registry/WindowsUserHiveManager.cs`:
  - Implement P/Invoke `RegLoadKey` and `RegUnLoadKey`.
  - Implement `ProfileList` lookup from `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList`.
  - Implement handle disposal and `GC.Collect()` / `GC.WaitForPendingFinalizers()`.
  - Guard against Administrator SIDs.
- **Step 3.3**: Create `desktop/src/WinLab.Executor/Policies/RegistryDWordPolicyHandler.cs`.
- **Step 3.4**: Create `desktop/src/WinLab.Executor/Policies/PolicyCatalog.cs`.
- **Step 3.5**: Create `desktop/src/WinLab.Executor/Transactions/BaselineSnapshotManager.cs`.
- **Step 3.6**: Create `desktop/src/WinLab.Executor/Policies/PolicyEngine.cs`.
- **Step 3.7**: Wire `ExecutorHost.cs`:
  - Route `IpcConstants.ActionQueryPolicyState` to `PolicyEngine.QueryPolicyStates()`.
  - Route `IpcConstants.ActionApplyPolicies` to `PolicyEngine.ApplyPolicies()`.
  - Route `IpcConstants.ActionRollbackPolicies` to `PolicyEngine.Rollback()`.

### Phase 4: Full Validation & CI Verification
- **Step 4.1**: Execute `dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj` on Linux. Verify all existing (258) + new tests pass.
- **Step 4.2**: Execute `npm test` on Linux. Verify all TypeScript IPC and mock agent tests pass.
- **Step 4.3**: Commit changes with clear commit message and submit report.

---

## 8. Verification & Acceptance Checklist

| # | Requirement | Acceptance Criteria |
|---|---|---|
| 1 | **Feature 18 Specification** | Path: `HKU\<SID>\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop`<br>Value: `NoChangingWallPaper` (DWORD 1). Requires logoff. |
| 2 | **Feature 19 Specification** | Path: `HKU\<SID>\Software\Policies\Microsoft\Windows\Personalization`<br>Value: `NoChangingSoundScheme` (DWORD 1). Immediate activation. |
| 3 | **Feature 20 Specification** | Path: `HKU\<SID>\Software\Policies\Microsoft\Windows\Personalization`<br>Value: `NoChangingMousePointers` (DWORD 1). Immediate activation. |
| 4 | **Target User Targeting** | Authoritative SID lookup via `ProfileList`. Supports logged-on users (`HKEY_USERS`) and offline users (`RegLoadKey` / `NTUSER.DAT`). Uninitialized profile emits `PendingFirstLogon`. |
| 5 | **Admin Protection Invariant** | Hard rejection if target SID is an Administrator (`S-1-5-32-544`). |
| 6 | **Read-Only Probe** | Live query returns exact state (`Applied`, `NotConfigured`, `Drifted`, `PendingLogoff`). |
| 7 | **Linux Testability** | Complete `IRegistryService` and `IUserHiveManager` abstractions with `InMemoryRegistryService` allowing 100% test execution in Linux CI. |
| 8 | **Automated Rollback** | Baseline snapshot captured before mutation; partial failure or rollback request restores previous registry values. |
