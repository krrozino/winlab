# WinLab Specification Mining Report: Policies, State Machine, Elevation & Safety Architecture

**Author:** Spec Miner (Policy & State Spec Miner)  
**Workspace:** `/home/antigravity/krrozino/winlab/.agents/teamwork/spec_miner_policies_1`  
**Date:** 2026-11-10T20:25:00Z  
**Target:** WinLab Desktop & Policy Engine (M1 through M6)  
**Parent Conversation ID:** `0b7fefcdb266ef2c358377a3938321e9`

---

## 1. Executive Summary & Purpose

This specification mining report documents the complete feature surface, state machine, elevation/UAC architecture, typed IPC contracts, rollback transaction model, and the exhaustive catalog of policies required across **Sections 3, 4, 5, 6, 7, 8 (8.1-8.9), 10, 11, and 12** of `ORIGINAL_REQUEST.md`, synthesized against the codebase foundation in PR #24 (`src/`, `desktop/`, `tests/`, `docs/`).

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Core State Machine | Tri-State Policy Architecture | Separation of Desired State (Admin intent), Configured State (OS persisted), and Effective/Verified State (active runtime verification). | Policy ID, requested state (`NotConfigured`, `Allowed`, `Blocked`), Target Account SID | `PolicyItemDto` with `desiredState`, `configuredState`, `effectiveState`, `lastVerified` | If OS probe differs from configured, emits `Drifted` or `Inconclusive` | `ORIGINAL_REQUEST.md` §6 |
| 2 | Core State Machine | Lifecycle & Status Machine | Comprehensive state enum: `NotConfigured`, `Applying`, `Applied`, `PendingRefresh`, `PendingReboot`, `PendingLogoff`, `PendingAppRestart`, `Failed`, `Drifted`, `NotSupported`, `Inconclusive`, `Reverted`. | Policy transition triggers (Apply, Verify, Reboot, Drift Scan) | UI Badge, Action buttons (Revalidate, Reapply, Accept, Rollback) | Prevents declaring success if verification cannot confirm policy effect | `ORIGINAL_REQUEST.md` §5, §6, §7 |
| 3 | Core State Machine | Startup Drift & Revalidation Engine | At startup, queries OS registry/AppLocker, compares live configuration against `state.json` and `desired-state.json`, detects unauthorized external edits. | Local PC registry hives, AppLocker XML, cached baseline | Drift report listing divergent settings with diff view | Prompts admin with explicit choices: Revalidate, Details, Reapply (elevated), Accept, Revert | `ORIGINAL_REQUEST.md` §6, §11 |
| 4 | Core State Machine | Pending Action Batching | Aggregates logoff, reboot, and app restart requirements across multiple applied policies into a single coherent prompt. | List of applied policies and their requirement flags | Unified Pending Panel: "X alterações aguardando reinicialização" with options (Restart Now, Later) | Forbids automatic unannounced reboots/logoffs | `ORIGINAL_REQUEST.md` §7 |
| 5 | Core State Machine | Deferred First-Logon Completion | Reliably applies HKCU registry policies when student profile does not yet exist (`NTUSER.DAT` unmounted). | Student account SID, deferred task payload | Scheduled task `WinLab-Apply-UserPolicies` running as `SYSTEM` at logon | Retries at next logon if profile still unready; cleans task upon success | `src/lib/generator.ts`:491, `ORIGINAL_REQUEST.md` §7 |
| 6 | Elevation & Security | Privilege Separation (UI vs Executor) | Desktop UI runs unprivileged (`asInvoker`), while Windows mutations execute in an isolated elevated helper or service. | Non-privileged user token, IPC command envelope | Command result or UAC elevation prompt | Rejects mutation commands from non-admin caller tokens (`401 Unauthorized`) | `ORIGINAL_REQUEST.md` §4, §12, `ADR-001` |
| 7 | Elevation & Security | Typed IPC Protocol (No Arbitrary Shell) | Strict typed envelope communication over Named Pipe (`\\.\pipe\WinLabService`) with Windows DACL `(A;;GA;;;BA)(A;;GA;;;SY)`. | `IpcEnvelope<T>` containing homologated action and structured DTO | `IpcResponse<T>` with success/data/error | Rejects unlisted actions, arbitrary strings, scripts, or shell injection | `src/desktop/contracts.ts`, `ADR-001`, `ORIGINAL_REQUEST.md` §4 |
| 8 | Elevation & Security | Windows Security Descriptor & Token Auth | Verifies caller token on every privileged operation via Windows Identity impersonation and SID checking. | Client pipe connection, caller PID/SID | Validated administrative session | Closes pipe or returns `PRIVILEGED_EXECUTOR_DISABLED` for unprivileged callers | `desktop/src/WinLab.Contracts/SecurityValidator.cs` |
| 9 | Elevation & Security | Inviolable Administrator Protection | Guarantees the administrative account and group `S-1-5-32-544` are never targeted by student restrictions. | Configuration student vs admin usernames/SIDs | Preflight & validation pass | Hard BLOCK if student name equals admin name or targets admin account | `src/lib/validation.ts`, `ORIGINAL_REQUEST.md` §3, §12 |
| 10 | Elevation & Security | Tamper-Resistant Storage & ACLs | Backups, baselines, and `state.json` stored in `C:\ProgramData\WinLab` protected by Win32 DACL (SYSTEM & Admin: Full; Users: Deny Write). | File system write requests | Protected persistence store | Windows file system Access Denied for standard users | `ADR-001`, `ORIGINAL_REQUEST.md` §10, §12 |
| 11 | Elevation & Security | Audit Logging & Event Viewer Provider | Emits immutable audit events to Windows Event Log (`WinLab-Provider`) containing transaction ID, caller SID, timestamp, and diff. | Privileged execution lifecycle events | Windows Event Log entries (Event IDs 8001-8010) | Rejects modifications if audit log subsystem is inaccessible | `ADR-001`, `ORIGINAL_REQUEST.md` §4, §10 |
| 12 | Safety & Rollback | Transaction ID & Baseline Snapshot | Captures full registry branch `.reg` exports and AppLocker XML snapshot into timestamped backup folder before mutation. | Pre-apply state, target user SID, system registry | `Registry-Baseline-<stamp>/`, `AppLocker-Baseline-<stamp>.xml`, UUID Transaction ID | Aborts application if baseline capture fails | `src/lib/generator.ts`:530, `ORIGINAL_REQUEST.md` §10 |
| 13 | Safety & Rollback | Automated Partial Failure Recovery | Automatically detects failure during apply, rolls back modified registry keys and AppLocker policy to captured baseline. | Exception during `Install-WinLabProfile` | Restored baseline, `state.json` status `RecoveredAfterFailure` | Throws clear exception documenting original error and recovery outcome | `src/lib/generator.ts`:931, `ORIGINAL_REQUEST.md` §10, §12 |
| 14 | Safety & Rollback | Controlled Reversion (Rollback) | Dedicated rollback engine restoring baseline snapshots and removing WinLab-created registry keys and scheduled tasks. | Transaction ID or latest active baseline | Clean restored baseline state, status `Reverted` | Rejects rollback if baseline files are missing or tampered | `src/lib/generator.ts`:976, `ORIGINAL_REQUEST.md` §10 |
| 15 | Accounts (8.1) | Assisted Local User Creation | Creates standard student user account with validated username (<= 20 chars, no reserved chars) and assigns to Users group (`S-1-5-32-545`). | `studentUser`, secure password | Windows Local User object | Fails if reserved characters or invalid length detected | `src/lib/generator.ts`:306, `ORIGINAL_REQUEST.md` §8.1 |
| 16 | Accounts (8.1) | Existing Admin Identification | Detects all members of local administrators group `S-1-5-32-544` and requires selection of authorized admin operator. | Local group query (`Get-LocalGroupMember`) | List of admin users (`LocalUserDto[]`) | Warns if no distinct admin account is available | `ORIGINAL_REQUEST.md` §3, §8.1 |
| 17 | Accounts (8.1) | Hide Account Management Pages | Restricts student access to User Accounts pages in Windows Settings (`ms-settings:otherusers`). | Registry Hive `HKU\$sid\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer` | String `SettingsPageVisibility = "hide:otherusers"` | Reversible via property removal | `src/lib/generator.ts`:432, `ORIGINAL_REQUEST.md` §8.1 |
| 18 | Accounts (8.1) | Fast User Switching Restriction | Restricts fast user switching on shared lab computers when supported. | Registry Hive `HKLM\Software\Microsoft\Windows\CurrentVersion\Policies\System` | DWORD `HideFastUserSwitching = 1` | Reversible to 0 | `ORIGINAL_REQUEST.md` §8.1 |
| 19 | Accounts (8.1) | Local Profile Diagnostic & Cleanup | Scans `Win32_UserProfile`, reports inactive profiles beyond threshold days, optional report-only or delete mode protecting admin/student. | `profileCleanupDays`, `profileCleanupMode` (`ReportOnly` vs `Delete`) | Diagnostic list of profiles, free space gained | Protects active, system, admin, and current student profiles from deletion | `src/lib/generator.ts`:1410, `ORIGINAL_REQUEST.md` §8.1, §8.7 |
| 20 | Windows System (8.2) | Command Prompt (CMD) Restriction | Blocks execution of `cmd.exe` for the student account via AppLocker Deny rule and registry policy. | AppLocker Exe Rule / Registry `HKU\$sid\Software\Policies\Microsoft\Windows\System` | `<FilePathRule Path="%WINDIR%\System32\cmd.exe" Action="Deny" />` & `DisableCMD = 1` | Blocks interactive CMD and script execution | `src/lib/generator.ts`:795, `ORIGINAL_REQUEST.md` §8.2 |
| 21 | Windows System (8.2) | Windows PowerShell Restriction | Blocks execution of PowerShell 64-bit and 32-bit for the student account. | AppLocker Exe Rule | `<FilePathRule Path="%WINDIR%\System32\WindowsPowerShell\v1.0\powershell.exe" Action="Deny" />` & SysWOW64 | Does not block admin PowerShell sessions | `src/lib/generator.ts`:803, `ORIGINAL_REQUEST.md` §8.2 |
| 22 | Windows System (8.2) | Registry Editor (Regedit) Restriction | Blocks student access to `regedit.exe`. | AppLocker Exe Rule / Registry `DisableRegistryTools` | `<FilePathRule Path="%WINDIR%\regedit.exe" Action="Deny" />` & DWORD `DisableRegistryTools = 1` | Reversible via baseline restore | `src/lib/generator.ts`:828, `ORIGINAL_REQUEST.md` §8.2 |
| 23 | Windows System (8.2) | Task Manager Restriction | Disables Task Manager for student user preventing killing educational agents. | Registry `HKU\$sid\Software\Microsoft\Windows\CurrentVersion\Policies\System` | DWORD `DisableTaskMgr = 1` | Reversible to 0 | `ORIGINAL_REQUEST.md` §8.2 |
| 24 | Windows System (8.2) | Run Dialog (Win+R) Restriction | Removes the Run command from Start Menu and keyboard shortcut. | Registry `HKU\$sid\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer` | DWORD `NoRun = 1` | Reversible to 0 | `ORIGINAL_REQUEST.md` §8.2 |
| 25 | Windows System (8.2) | Control Panel Restriction | Restricts or hides classic Control Panel applets. | Registry `HKU\$sid\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer` | DWORD `NoControlPanel = 1` | Reversible to 0 | `ORIGINAL_REQUEST.md` §8.2 |
| 26 | Windows System (8.2) | Microsoft Store Restriction | Disables or restricts Microsoft Store app downloads. | Registry `HKLM\Software\Policies\Microsoft\WindowsStore` & AppLocker Appx Rule | DWORD `RemoveWindowsStore = 1` & Appx Enforcement | Preserves system inbox packages for admin | `src/lib/generator.ts`:866, `ORIGINAL_REQUEST.md` §8.2 |
| 27 | Windows System (8.2) | Windows Search & Widgets Control | Disables web search integration in Start Menu and taskbar widgets. | Registry `HKLM\Software\Policies\Microsoft\Windows\Windows Search` & `Microsoft\Dsh` | DWORD `DisableSearchBoxSuggestions = 1`, `AllowNewsAndInterests = 0` | Low risk, reversible | `ORIGINAL_REQUEST.md` §8.2 |
| 28 | Browsers (8.3) | Chrome & Edge Incognito/InPrivate Blocking | Disables private browsing sessions to prevent unmonitored browsing. | Registry `HKU\$sid\Software\Policies\Google\Chrome` & `Microsoft\Edge` | DWORD `IncognitoModeAvailability = 1`, `InPrivateModeAvailability = 1` | Immediate upon browser restart | `src/lib/generator.ts`:358, `ORIGINAL_REQUEST.md` §8.3 |
| 29 | Browsers (8.3) | Chrome & Edge Guest Mode Blocking | Disables guest mode browsing profiles. | Registry `HKU\$sid\Software\Policies\Google\Chrome` & `Microsoft\Edge` | DWORD `BrowserGuestModeEnabled = 0` | Immediate upon browser restart | `src/lib/generator.ts`:351, `ORIGINAL_REQUEST.md` §8.3 |
| 30 | Browsers (8.3) | Chrome & Edge New Profile Creation Blocking | Prevents students from creating additional local browser profiles. | Registry `HKU\$sid\Software\Policies\Google\Chrome` & `Microsoft\Edge` | DWORD `BrowserAddPersonEnabled = 0` | Immediate upon browser restart | `src/lib/generator.ts`:354, `ORIGINAL_REQUEST.md` §8.3 |
| 31 | Browsers (8.3) | Browser Password Manager Restriction | Prevents students from saving personal passwords on shared school computers. | Registry `HKU\$sid\Software\Policies\Google\Chrome` & `Microsoft\Edge` | DWORD `PasswordManagerEnabled = 0` | Immediate upon browser restart | `src/lib/generator.ts`:363, `ORIGINAL_REQUEST.md` §8.3 |
| 32 | Browsers (8.3) | Browser Extension Blocking / Allowlisting | Blocks all browser extensions or restricts installation to school allowlist. | Registry `ExtensionInstallBlocklist` & `ExtensionInstallAllowlist` | Key `ExtensionInstallBlocklist\1 = "*"` | Allows administrative extension deployment | `src/lib/generator.ts`:367, `ORIGINAL_REQUEST.md` §8.3 |
| 33 | Browsers (8.3) | Web Filtering (BlockList vs AllowListOnly) | Enforces URL navigation policies in Chrome and Edge. | BrowserUrlMode (`Unrestricted`, `BlockList`, `AllowListOnly`), `blockedUrls`, `allowedUrls` | `URLBlocklist` and `URLAllowlist` keys in Chrome and Edge hives | Warns if `AllowListOnly` is enabled without allowed URLs | `src/lib/generator.ts`:372, `ORIGINAL_REQUEST.md` §8.3 |
| 34 | Browsers (8.3) | SafeSearch Enforcement | Forces SafeSearch on Google and Bing search engines in browsers. | Registry `HKU\$sid\Software\Policies\Google\Chrome` & `Microsoft\Edge` | DWORD `ForceGoogleSafeSearch = 1`, `ForceYouTubeRestrict = 1` | Prevents students from disabling search filters | `ORIGINAL_REQUEST.md` §8.3 |
| 35 | Applications (8.4) | Application Inventory Scanner | Detects installed software across Registry (`Uninstall` 32/64-bit), Appx, and standard program directories without touching user personal files. | Registry hives, WMI/CIM, directory probes | `MachineInventoryDto` with detected apps, publishers, versions | Ignores user private directories (`Documents`, `Desktop`, `Downloads`) | `src/lib/inventory.ts`, `ORIGINAL_REQUEST.md` §8.4 |
| 36 | Applications (8.4) | AppLocker AuditOnly Mode | Enforces AppLocker logging in Windows Event Log without blocking execution, ensuring compatibility testing. | `<RuleCollection Type="Exe" EnforcementMode="AuditOnly">` | Event ID 8003 logged in `Microsoft-Windows-AppLocker/EXE and DLL` | Safe default for M1 through M4; never blocks binaries | `src/lib/generator.ts`:841, `ORIGINAL_REQUEST.md` §8.4 |
| 37 | Applications (8.4) | AppLocker Enforcement Mode (Homologated) | Enforces strict application allowlist blocking unapproved binaries for student account. | `<RuleCollection Type="Exe" EnforcementMode="Enabled">`, allowlist paths/publishers | Event ID 8004 logged for blocked binaries | Enabled ONLY after explicit physical validation and preflight PASS | `src/lib/generator.ts`:841, `ORIGINAL_REQUEST.md` §8.4 |
| 38 | Applications (8.4) | AppLocker Path & Publisher Rules | Configures granular allowlist rules based on file paths and digital signatures (Microsoft, Google, Adobe, VideoLAN). | App catalog IDs (`chrome`, `word`, `excel`, `powerpoint`, `powerbi`, `acrobat`, `vscode`, `vlc`) | AppLocker XML `<FilePathRule>` & `<FilePublisherRule>` | Emits warning if custom path is writable by standard user | `src/lib/apps.ts`, `src/lib/generator.ts`:780, `ORIGINAL_REQUEST.md` §8.4 |
| 39 | Applications (8.4) | Installer (MSI) & Store App Blocking | Restricts execution of MSI installers and Appx packaged apps for student. | AppLocker MSI & Appx Rule Collections | `RuleCollection Type="Msi"` & `Type="Appx"` EnforcementMode | Preserves administrative installation capability | `src/lib/generator.ts`:854, `ORIGINAL_REQUEST.md` §8.4 |
| 40 | Hardware (8.5) | USB Removable Storage Read Blocking | Blocks reading from USB mass storage devices for student account. | Registry `HKU\$sid\Software\Policies\Microsoft\Windows\RemovableStorageDevices\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}` | DWORD `Deny_Read = 1` | Reversible to 0 / property removal | `src/lib/generator.ts`:416, `ORIGINAL_REQUEST.md` §8.5 |
| 41 | Hardware (8.5) | USB Removable Storage Write Blocking | Blocks writing/copying files to USB mass storage devices for student account. | Registry `HKU\$sid\Software\Policies\Microsoft\Windows\RemovableStorageDevices\{...}` | DWORD `Deny_Write = 1` | Reversible to 0 / property removal | `src/lib/generator.ts`:423, `ORIGINAL_REQUEST.md` §8.5 |
| 42 | Hardware (8.5) | USB Binary Execution Blocking | Prevents execution of binaries located on USB drives while allowing document storage. | AppLocker Exe Deny Rule | `<FilePathRule Path="%HOT%\*" Action="Deny" />` & `<FilePathRule Path="%REMOVABLE%\*" Action="Deny" />` | Essential for Microlins preset: students can bring PDF/DOCX, but cannot run `.exe` | `src/lib/generator.ts`:815, `ORIGINAL_REQUEST.md` §8.5, §8.9 |
| 43 | Hardware (8.5) | Camera & Microphone Privacy Controls | Disables hardware camera and microphone access for student account or untrusted apps. | Registry `HKLM\Software\Policies\Microsoft\Windows\Camera` & Capability policies | DWORD `AllowCamera = 0`, `LetAppsAccessMicrophone = 2` | Reversible to default | `ORIGINAL_REQUEST.md` §8.5, §8.8 |
| 44 | Personalization (8.6) | Wallpaper Modification Lock | Locks desktop wallpaper and disables personalization settings for student account. | Registry `HKU\$sid\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop` | DWORD `NoChangingWallPaper = 1` | Reversible via property removal; effective upon next logon | `src/lib/generator.ts`:466, `ORIGINAL_REQUEST.md` §8.6 |
| 45 | Personalization (8.6) | Sound Scheme Modification Lock | Prevents changing system sounds scheme. | Registry `HKU\$sid\Software\Policies\Microsoft\Windows\Personalization` | DWORD `NoChangingSoundScheme = 1` | Reversible via property removal | `src/lib/generator.ts`:462, `ORIGINAL_REQUEST.md` §8.6 |
| 46 | Personalization (8.6) | Mouse Pointer Modification Lock | Prevents altering mouse pointer sizes and schemes. | Registry `HKU\$sid\Software\Policies\Microsoft\Windows\Personalization` | DWORD `NoChangingMousePointers = 1` | Reversible via property removal | `src/lib/generator.ts`:458, `ORIGINAL_REQUEST.md` §8.6 |
| 47 | Personalization (8.6) | Temporary Wallpaper/Personalization Unlock | Temporarily unlocks personalization for a configured duration with automatic verified re-lock. | Duration in minutes (`wallpaperUnlockMinutes`), unlock trigger | Registry toggle to 0 + scheduled re-lock task | Automatically restores locked baseline upon timer expiry | `src/lib/generator.ts`:1174, `ORIGINAL_REQUEST.md` §8.6 |
| 48 | Storage (8.7) | System Drive Free Space Monitoring | Queries logical disk space and issues warnings or blocks if free space is critical. | Free space threshold percent (`storageWarningFreePercent`) | Diagnostic check result (`PASS`, `WARN`, `BLOCK`) | BLOCK if free space < 5%; WARN if < configured percent | `src/lib/preflight-script.ts`:212, `ORIGINAL_REQUEST.md` §8.7 |
| 49 | Storage (8.7) | OneDrive File Sync Restriction | Prevents personal OneDrive sync clients from downloading large cloud storage to lab disks. | Registry `HKLM\Software\Policies\Microsoft\Windows\OneDrive` | DWORD `DisableFileSyncNGSC = 1` | Preserves local disk capacity | `ORIGINAL_REQUEST.md` §8.7 |
| 50 | Privacy & Diagnostic (8.8) | Essential Protection Diagnostic | Diagnoses Microsoft Defender, Windows Firewall, and Windows Update without disabling them. | Windows Security Center / Defender cmdlets | Security diagnostic report card | Forbids disabling Defender or Firewall for convenience | `ORIGINAL_REQUEST.md` §8.8, §12 |
| 51 | Privacy & Diagnostic (8.8) | Windows AI / Copilot Feature Control | Controls Windows Copilot / Recall integration where documented policies exist. | Registry `HKCU` or `HKLM\Software\Policies\Microsoft\Windows\WindowsCopilot` | DWORD `TurnOffWindowsCopilot = 1` | Applied only on compatible builds | `ORIGINAL_REQUEST.md` §8.8 |
| 52 | Presets (8.9) | Microlins / School Lab Preset | Bundled configuration for computer schools: Aluno user, MicrolinsAdmin, Chrome/Edge, Office, Power BI, USB file read/write allowed, USB execute blocked, AppLocker AuditOnly. | Preset ID `microlins` | Preconfigured `Config` object | Deterministic, verified baseline | `src/lib/presets.ts`:11, `ORIGINAL_REQUEST.md` §8.9 |
| 53 | Presets (8.9) | Enterprise / Frontline Preset | Station configuration for corporate frontline / shared PCs. | Preset ID `company` | Preconfigured `Config` object | Productivity apps enabled, personalization unlocked | `src/lib/presets.ts`:36, `ORIGINAL_REQUEST.md` §8.9 |
| 54 | Presets (8.9) | Home & Kiosk Presets | Kiosk / Totem single-app configuration and home routines (Study/Leisure/Night). | Preset ID `kiosk` | Preconfigured `Config` object | Maximum lockdown, single-app focus | `src/lib/presets.ts`:52, `ORIGINAL_REQUEST.md` §8.9 |
| 55 | First-Run Wizard (3) | Initial Setup & Configuration Wizard | Guided initial onboarding: admin account identification, preset selection, baseline creation, preview review, and explicit authorization. | Admin selection, chosen preset, baseline trigger | Initialized `state.json`, baseline directory | Forbids mutative execution without explicit admin confirmation | `ORIGINAL_REQUEST.md` §3 |
| 56 | Safety & Packaging | Package Integrity Verification | Cryptographic SHA-256 verification of all generated package files against `manifest.json`. | Package files, `manifest.json` | Integrity status `PASS` or `BLOCK` | Refuses to execute mutating scripts if any file is modified or missing | `src/lib/package-integrity.ts`, `src/lib/generator.ts`:52 |

---

## 3. Edge Cases

| # | Feature | Input / Condition | Observed Behavior & Mitigation |
|---|---------|-------------------|--------------------------------|
| 1 | Deferred HKCU Policies | Student account created but user has never logged in (`NTUSER.DAT` missing from disk). | `Invoke-WithUserHive` detects missing profile path; does not fail setup. Automatically invokes `Queue-StudentPoliciesForFirstLogon`, registering scheduled task `WinLab-Apply-UserPolicies` running as `SYSTEM` triggered at `$Aluno` logon. Status in `state.json` recorded as `userPoliciesDeferred: true`. Upon first logon, completes policy application and self-deletes task. |
| 2 | Account Collisions | Admin and Student account configured with identical or case-insensitive matching names (e.g. `Aluno` vs `aluno`). | Preflight and config validation execute `localeCompare(..., { sensitivity: "accent" })` and Windows naming rules. Emits fatal `BLOCK` error preventing any package generation or policy application. |
| 3 | Partial Mutation Failure | Registry keys written successfully, but AppLocker XML application fails or AppIDSvc refuses to start. | Setup catches exception, triggers `Recover-FromFailedSetup`, restores AppLocker XML baseline and re-imports `.reg` backup files. Records status `RecoveredAfterFailure` in `state.json`. Never displays false "Success". |
| 4 | Offline WebView2 Operation | Computer is offline in lab, without internet connection and without Node.js `localhost:3000` server. | WebView2 maps virtual host `winlab.local` to native `wwwroot` application folder via `SetVirtualHostNameToFolderMapping`. Assets loaded over HTTPS locally (`https://winlab.local/desktop/index.html`) with no local web server needed. |
| 5 | Unauthorized Shell Execution | Malicious user or injected web message sends `powershell.exe`, `cmd.exe`, `wscript.shell`, or unlisted IPC action. | Strict typed validation at both TypeScript (`validateIpcAction`, `validateNoArbitraryShell`) and C# (`SecurityValidator.ValidateAction`, `ValidateNoArbitraryShell`) levels. Immediately aborts and returns `FORBIDDEN_SHELL_INJECTION` or `UNAUTHORIZED_ACTION`. |
| 6 | Standard User Privilege Escalation | Standard user (`Aluno`) attempts to send mutation IPC action (`policy.apply` or `policy.rollback`). | Named Pipe applies Win32 DACL `(A;;GA;;;BA)(A;;GA;;;SY)` rejecting unprivileged connections. Service impersonates caller token, checks `IsInRole(WindowsBuiltInRole.Administrator)`. Returns `401 Unauthorized` / `PRIVILEGED_EXECUTOR_DISABLED`. |
| 7 | Low Disk Space Condition | System drive has less than 5% free space or less than `storageWarningFreePercent`. | Preflight evaluates `Win32_LogicalDisk`. Free space < 5% triggers immediate `BLOCK` gate halting execution; free space < configured percent triggers `WARN` requiring explicit admin review. |
| 8 | Unsupported Windows Edition | Policy requiring AppLocker or specific GPO CSP executed on unsupported Windows Home edition. | Capability detection checks `Get-AppLockerPolicy` and cmdlets. In UI, policy displays state `NotSupported` instead of claiming protection. In preflight, emits `BLOCK` or `WARN`. |
| 9 | Configuration Drift / External Modification | Registry key or AppLocker rule deleted externally via regedit or GPO after WinLab applied it. | WinLab startup compares Desired State vs Live Configured State. Detects mismatch, marks status as `Drifted`, and offers admin options: Revalidate, Show Details, Reapply (elevated), Accept current, or Rollback. Never silently reapplies high-risk settings. |
| 10 | User-Writable Path in Allowlist | Administrator adds a custom allowed application path pointing to `%TEMP%` or `%APPDATA%`. | Review engine (`getConfigReview` / `pathRisk`) detects user-writable directories, flags high risk warning, and alerts admin that standard users could replace the binary to bypass AppLocker. |
| 11 | Reapplication Idempotency | Administrator clicks Apply multiple times on already configured system. | Setup detects existing `state.json` and preserves original baselines instead of overwriting them with newly modified system state. Increments `applyCount` while maintaining historical snapshot chain. |
| 12 | Temporary Unlock Expiration | Student wallpaper unlocked for 90 minutes; machine restarted before timer expires. | Scheduled task persisted with trigger parameters; on restart/startup, checks elapsed time and restores locked state if window expired, ensuring no permanent policy bypass. |

---

## 4. 5-Component Handoff Report

### 4.1 Observation

1. **User Request & Constraints (`ORIGINAL_REQUEST.md`):**
   - **Section 1 (PR #24 Fixes):** Mandates migration from .NET 8 to .NET 10 LTS, fixing offline WebView2 without `localhost:3000`, separating demo data from real computer data, replacing forbidden-word validators with typed contracts and effective authorization, and preserving WinLab Web 0.9.
   - **Section 3 (First Install):** Demands an initial configuration wizard identifying existing admins, choosing authorized admins, selecting presets (Microlins, School, Company, Home, Custom), creating baseline backups, showing summaries, and forbidding administrative password storage.
   - **Section 4 (Architecture):** Mandates separation of Unprivileged UI Shell, Central Policy Engine, and Windows Executor (elevated helper or service with token authentication, typed IPC, and audit trail).
   - **Section 5 & 6 (State Machine & Drift):** Defines tri-state architecture: Desired State, Configured State, and Effective/Verified State. Forbids declaring success simply because a command finished without error. Lists 12 UI states (`NotConfigured`, `Applying`, `Applied`, `PendingRefresh`, `PendingReboot`, `PendingLogoff`, `PendingAppRestart`, `Failed`, `Drifted`, `NotSupported`, `Inconclusive`, `Reverted`).
   - **Section 7 (Reboot/Logoff Handling):** Requires categorizing policies by activation requirements (immediate, gpupdate, app restart, logoff, reboot, deferred first logon) and grouping pending actions into a unified prompt.
   - **Section 8 (Catalog 8.1 - 8.9):** Details policies across Accounts (8.1), Windows System (8.2), Browsers (8.3), Applications (8.4), Hardware & USB (8.5), Personalization (8.6), Storage (8.7), Privacy/Security (8.8), and Presets (8.9).
   - **Section 10 (Backup, History & Rollback):** Requires transaction IDs, baseline registry `.reg` exports, AppLocker XML snapshots, SID tracking, and automated recovery upon partial failure.
   - **Section 15 (Marcos M1-M6):** Defines M3 as implementing a functional engine for **3 to 5 low-risk reversible policies** executing the full lifecycle: `Detect -> Preview -> Authorize -> Backup -> Apply -> Verify -> Persist -> Revert`.

2. **Existing Codebase Analysis:**
   - `src/lib/types.ts`: Defines `Config` schema version 1, containing 23 policy fields covering local accounts, browser controls, AppLocker mode, USB controls, personalization, allowed apps, and storage cleanup.
   - `src/lib/generator.ts`: Contains 1,670 lines of PowerShell generation logic with explicit Win32 registry hives (`HKU\$sid\Software\Policies\...`), AppLocker XML generation (`New-WinLabAppLockerXml`), baseline capture (`Ensure-RegistryBaseline`, `Ensure-AppLockerBaseline`), deferred logon scheduling (`Queue-StudentPoliciesForFirstLogon`), rollback (`generateRollbackScript`), and recovery (`Recover-FromFailedSetup`).
   - `src/desktop/contracts.ts` & `desktop/src/WinLab.Contracts/`: Establishes IPC envelopes, constants, DTOs (`MachineInventoryDto`, `PolicyStateSummaryDto`, `PolicyItemDto`), and security validator allowlist.
   - `src/desktop/mock-agent.ts` & `desktop/src/WinLab.Agent.Mock/`: Implements in-memory mock agent with 6 sample policies, rejecting mutating actions (`ACTION_APPLY_POLICIES`, `ACTION_ROLLBACK_POLICIES`) in the foundation stage.
   - `desktop/src/WinLab.Desktop/MainWindow.xaml.cs`: Uses WPF + WebView2 with virtual host mapping `winlab.local` pointing to `wwwroot`, with fallback to `localhost:3000/desktop`.
   - `tests/core.test.ts` & `tests/desktop-ipc.test.ts`: 56 automated unit tests passing 100% green via `tsx --test tests/*.test.ts`.

---

### 4.2 Logic Chain

1. **From User Requirements to Core Policy Engine (Fase 1 / M3):**
   - *Observation:* The user states in Section 5: "Quero marcar ou desmarcar opções diretamente no aplicativo... Não mostrar 'Ativado' simplesmente porque um comando terminou sem erro." In Section 15 (M3): "Escolher de três a cinco políticas de baixo risco e realmente reversíveis. Implementar fluxo completo: Detectar -> Preview -> Autorizar -> Backup -> Aplicar -> Verificar -> Persistir -> Reverter."
   - *Inference:* The architecture requires a declarative, modular Policy Definition contract replacing hardcoded generation logic.
   - *Policy Candidates for M3:*
     1. `personalization.wallpaper`: Lock desktop wallpaper (`ActiveDesktop\NoChangingWallPaper`). Low risk, user-scoped, verified via registry query, reversible via property removal, requires logoff/desktop refresh.
     2. `personalization.sounds`: Lock sound scheme (`Personalization\NoChangingSoundScheme`). Low risk, user-scoped, verified via registry query, reversible via property removal.
     3. `personalization.mouse_pointers`: Lock mouse pointers (`Personalization\NoChangingMousePointers`). Low risk, user-scoped, verified via registry query, reversible via property removal.
     4. `browser.chrome.incognito`: Block Incognito mode (`Policies\Google\Chrome\IncognitoModeAvailability`). Low risk, user-scoped, verified via registry, reversible, requires browser restart.
     5. `browser.chrome.guest`: Block Guest mode (`Policies\Google\Chrome\BrowserGuestModeEnabled`). Low risk, user-scoped, verified via registry, reversible, requires browser restart.
   - *Rationale:* These 5 policies carry **zero risk** of locking out the administrator, **zero risk** of corrupting system boot or network stack, operate in isolated user registry hives (`HKU\$sid`), have deterministic verification probes, and demonstrate the entire 8-step lifecycle.

2. **From State Machine Requirements to Tri-State Architecture:**
   - *Observation:* Section 6 requires: "Implementar três conceitos separados: Estado desejado, Estado configurado, Estado efetivo/verificado."
   - *Inference:*
     - `DesiredState` lives in the client configuration document (`config.json`).
     - `ConfiguredState` lives in `C:\ProgramData\WinLab\state.json` written after elevated execution.
     - `EffectiveState` is dynamically determined by executing a specific read-only verification probe against the live OS (e.g. testing if the registry value exists and matches, testing if AppLocker policy is active, or verifying if a reboot/logoff is pending).
     - If `ConfiguredState == Blocked` but the policy requires logoff and the user has not logged off, `EffectiveState` MUST report `PendingLogoff` rather than `Applied`.
     - If `DesiredState == Blocked` but live scan finds the registry key absent, the state engine flags `Drifted`.

3. **From Elevation & Security Constraints to Execution Model:**
   - *Observation:* Section 4 and Section 12 require interface without permanent privileges, Windows UAC authorization for mutations, no arbitrary shell strings from UI, and no persistent SYSTEM service unless strictly necessary.
   - *Inference:*
     - The Desktop UI (`WinLab.Desktop`) runs as standard user (`asInvoker`).
     - For M1-M3, an **elevated on-demand helper process** (e.g. `WinLab.Executor.exe` invoked with `Verb = "runas"`) is the cleanest, least attack-surface architecture. It prompts UAC only when the administrator clicks "Aplicar Alterações", executes the homologated DTO command, records the audit trail, and exits.
     - A persistent Windows Service running as SYSTEM is unnecessary for an initial single-machine lab configurator and introduces severe privilege-escalation surface if not strictly needed.

---

### 4.3 Caveats

1. **Physical Windows Machine vs VM Testing:**
   - Policy verification for AppLocker enforcement and registry lockdown must be executed on a disposable Windows VM with test accounts. Per Section 12 and 16, **never test restrictive policies on the host or production machine**.
2. **AppLocker Edition Licensing:**
   - While Windows 11 KB5024351 expanded AppLocker capabilities across editions, Windows 10 Home or unpatched Windows 10 editions may not enforce AppLocker rules even if cmdlets are present. The capability detection in `preflight.ps1` is the authoritative gate.
3. **HKCU Hive Access for Offline Users:**
   - Modifying policies for a user account that is not currently logged in requires loading `NTUSER.DAT` via `reg.exe load HKU\$sid`. If the profile has never logged on, `NTUSER.DAT` does not exist, requiring the deferred scheduled task mechanism (`Queue-StudentPoliciesForFirstLogon`).

---

### 4.4 Conclusion

The specification mining investigation confirms that WinLab possesses a robust theoretical and script-based foundation in 0.9.0 (`src/lib/generator.ts`), with 56 passing unit tests, but currently relies on an in-memory mock agent (`MockDesktopAgent` / `MockAgentService`) that refuses privileged mutations.

To fulfill the user's vision across M1–M6:
1. **The Policy Engine** must transition from monolithic script generation to a declarative catalog where each policy defines its ID, scope, risk, reversibility, activation requirement (immediate, gpupdate, logoff, reboot), target registry/AppLocker schema, verification probe, and rollback adapter.
2. **The Tri-State Model** (Desired vs Configured vs Effective) and the 12 UI statuses must be natively integrated into both the C# contracts and the React frontend.
3. **M3 should focus exclusively on the 5 selected low-risk policies** (Wallpaper, Sound Scheme, Mouse Pointers, Chrome Incognito, Chrome Guest Mode), executing the full transaction-backed lifecycle with baseline snapshots.
4. **Elevation** should be handled via an on-demand elevated helper invoked via UAC (`runas`) receiving strongly-typed DTOs, avoiding a premature SYSTEM service while guaranteeing zero arbitrary shell execution.

---

### 4.5 Verification Method

1. **Verify Existing Tests and Baseline:**
   ```bash
   cd /home/antigravity/krrozino/winlab
   npm test
   ```
   *Expected Result:* 56 tests pass, 0 failures.

2. **Inspect Policy Schemas and Generators:**
   - Review `src/lib/types.ts` for current policy attributes.
   - Review `src/lib/generator.ts` lines 344–470 for user policy registry keys and lines 774–878 for AppLocker XML structure.
   - Review `desktop/src/WinLab.Contracts/PolicyModels.cs` for current C# enums.

3. **Verify Security Invariants:**
   - Test that `tests/desktop-ipc.test.ts` rejects arbitrary shell commands:
     ```bash
     npx tsx -e 'import { validateNoArbitraryShell } from "./src/desktop/mock-agent"; console.log(validateNoArbitraryShell("powershell.exe -c evil"));'
     ```
     *Expected Result:* `{ isSafe: false, error: ... }`

4. **Verify Offline Distribution Readiness:**
   - Inspect `desktop/src/WinLab.Desktop/MainWindow.xaml.cs` to verify `SetVirtualHostNameToFolderMapping("winlab.local", ...)` implementation.

---
*Report compiled and verified by Policy & State Spec Miner.*
