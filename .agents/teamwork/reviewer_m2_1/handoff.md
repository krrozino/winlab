# Code Review Report: Milestone 2 — Real Windows Scanner & System Contracts

**Verdict: APPROVE**

**Reviewer:** reviewer_m2_1  
**Scope:** Milestone 2 (C# Scanners and System Contracts)  
**Target Files:**  
- `desktop/src/WinLab.Contracts/InventoryModels.cs`  
- `desktop/src/WinLab.Contracts/IWindowsScanner.cs`  
- `desktop/src/WinLab.Contracts/Scanning/SystemInfoScanner.cs`  
- `desktop/src/WinLab.Contracts/Scanning/LocalAccountsScanner.cs`  
- `desktop/src/WinLab.Contracts/Scanning/InstalledSoftwareScanner.cs`  
- `desktop/src/WinLab.Contracts/Scanning/WindowsScanner.cs`  
- `desktop/src/WinLab.Desktop/Services/WindowsScanner.cs`  

---

### 1. Observation
- `InventoryModels.cs`:
  - `WindowsInfoDto`: Added `DisplayVersion`, `Ubr`, `Is64Bit`, `TpmPresent`, `TpmVersion`, `SecureBootEnabled`.
  - `MachineInventoryDto`: Added `IsMock` for zero-masquerade transparency.
  - `InstalledAppDto`: Added `InstallLocation` and `IsAppx`.
  - `LocalUserDto`: Added `Sid`.
- `IWindowsScanner.cs`: Defined unified orchestrator interface and sub-scanner interfaces (`ISystemInfoScanner`, `ILocalAccountsScanner`, `IInstalledSoftwareScanner`, `IAgentService`).
- `SystemInfoScanner.cs`: Implements registry inspection for Windows NT CurrentVersion, Windows 11 build >= 22000 caption correction, kernel Secure Boot registry status, TPM detection via `tbs.dll` with driver fallback, and fixed drive inspection via `DriveInfo`.
- `LocalAccountsScanner.cs`: Enumerates normal local accounts via `NetUserEnum` (level 1). Detects administrators via canonical SID `S-1-5-32-544` translated to localized group name, `NetLocalGroupGetMembers` (level 2), and RID 500 check.
- `InstalledSoftwareScanner.cs`: Enumerates HKLM 64-bit, HKLM 32-bit (WOW6432Node), and HKCU uninstall entries. Enumerates Appx packages with `shlwapi.dll!SHLoadIndirectString` indirect string resolution. Checks catalog of 10 standard apps.
- `WindowsScanner.cs`: Unifies all sub-scanners asynchronously and sets `IsMock = false`.

### 2. Logic Chain
- **Platform Portability & Guarding**: Every invocation of unmanaged Win32 APIs, Windows Registry, and `SecurityIdentifier` is guarded by `OperatingSystem.IsWindows()`. Non-Windows platforms return clean fallback DTOs without throwing `PlatformNotSupportedException`.
- **Win32 P/Invoke Signatures**:
  - `tbs.dll!Tbsi_GetDeviceInfo`: Struct `TPM_DEVICE_INFO` correctly mapped (`structVersion = 1`), `uint` return code.
  - `netapi32.dll!NetUserEnum`: Level 1 `USER_INFO_1` Unicode layout verified.
  - `netapi32.dll!NetLocalGroupGetMembers`: Level 2 `LOCALGROUP_MEMBERS_INFO_2` mapping `lgrmi2_sid` verified.
  - `netapi32.dll!NetApiBufferFree`: Guaranteed invocation in `finally` blocks for unmanaged memory deallocation.
  - `shlwapi.dll!SHLoadIndirectString`: Correct `StringBuilder` buffer with capacity 512, `ExactSpelling = true`.
- **Language-Neutral Administrator Detection**: Resolves canonical SID `S-1-5-32-544` via `WellKnownSidType.BuiltinAdministratorsSid` to `NTAccount` dynamically. Avoids hardcoded strings. Includes RID 500 detection.
- **WOW6432Node Handling**: Uses explicit `RegistryView.Registry64` and `RegistryView.Registry32` with `RegistryKey.OpenBaseKey` to read both native 64-bit and WOW64 32-bit entries.
- **Resource Management**: All `RegistryKey` instances use `using var`. All native NetApi buffers are freed in `finally`.

### 3. Caveats
- In environments without physical/virtual TPM, `Tbsi_GetDeviceInfo` fails safely and falls back to TPM registry service detection or `TpmPresent = false`.
- Local account scanner targets local SAM database; this is appropriate for local lab management workstations.

### 4. Conclusion
**VERDICT: APPROVE**  
The code adheres strictly to architectural specifications, memory safety, language neutrality, zero-masquerade, and cross-platform guard requirements.

### 5. Verification Method
- Static code analysis across contracts, models, scanner implementations, and P/Invoke declarations against Windows SDK headers.
- Inspection of unit test suite in `desktop/tests/WinLab.Tests/WindowsScannerTests.cs` validating platform safety, DTO serialization, catalog definition, and orchestrator integrity.
