# Adversarial QA Challenger Report: Milestone 3 (Transactions, Rollback & Administrator Immunity)

**Challenger ID**: `challenger_m3_1`  
**Milestone**: Milestone 3 — First Functional Policy Engine (Features 17–24)  
**Target Systems**: `TransactionEngine`, `BaselineSnapshotManager`, `SecurityValidator`, `DualBrowserPolicyHandler`, `RegistryDWordPolicyHandler`  
**Date**: November 2026  
**Final Verdict**: **`DEFECT_FOUND`**

---

## 1. Executive Summary

Milestone 3 implements transactional policy execution, pre-flight baseline capture, atomic commit/rollback, verification probes, and administrator immunity invariants.

As the Adversarial QA Challenger, the milestone was subjected to comprehensive stress testing, fault injection, fuzzing, whitespace boundary probing, probe tampering, rollback idempotency checks, path traversal attacks, and administrator immunity evasion tests.

While the core rollback sequencing, tri-state baseline capture (preventing 0-defaulting), and probe failure detection mechanisms demonstrated solid engineering, **critical security defects and evasion vectors were uncovered** in `TransactionEngine`, `MockUserHiveManager`, and `WindowsUserHiveManager`:
1. **Critical Defect (Administrator Immunity Bypass via Whitespace/Control Chars)**: SIDs with leading/trailing spaces, tabs, or newlines (e.g., `"  S-1-5-32-544  "`, `"\tS-1-5-32-544\t"`, `"S-1-5-21-*-500\n"`) bypass the immunity check in both `MockUserHiveManager` and `WindowsUserHiveManager`, causing restrictions to be directly applied to the Administrator registry hive.
2. **High Defect (Administrator Immunity Bypass via Target Account Name)**: Transactions targeting `"Administrator"` or `"Administrador"` with null or whitespace `TargetUserSid` bypass immunity detection and fall back to `HKEY_CURRENT_USER`, mutating the active Administrator session.
3. **High Defect (Directory Traversal via Transaction ID)**: Unsanitized `TransactionId` in `TransactionEngine` allows directory traversal (e.g. `../traversal_escape`), writing transaction logs outside the designated transaction directory.
4. **Medium Defect (Unchecked Null Reference on Policies Collection)**: Providing a null `Policies` list results in an unhandled `NullReferenceException` instead of returning a controlled transaction failure result.

---

## 2. Adversarial Test Matrix & Results

Comprehensive adversarial tests were implemented in [`AdversarialTransactionEngineTests.cs`](file:///home/antigravity/krrozino/winlab/desktop/tests/WinLab.Tests/AdversarialTransactionEngineTests.cs).

| Test Vector | Method | Target Scenario | Result |
| :--- | :--- | :--- | :--- |
| **Fault Injection Step 1** | `MultiPolicyBatch_FailureAtStepN_HaltsImmediatelyAndRollsBackInReverse(1)` | Step 1 fails on write; verify zero forward progress and no mutations | **PASS** |
| **Fault Injection Step 2** | `MultiPolicyBatch_FailureAtStepN_HaltsImmediatelyAndRollsBackInReverse(2)` | Step 2 fails on write; verify step 1 rolled back in reverse | **PASS** |
| **Fault Injection Step 3** | `MultiPolicyBatch_FailureAtStepN_HaltsImmediatelyAndRollsBackInReverse(3)` | Step 3 fails on write; verify steps 2 & 1 rolled back in reverse | **PASS** |
| **Fault Injection Step 4** | `MultiPolicyBatch_FailureAtStepN_HaltsImmediatelyAndRollsBackInReverse(4)` | Step 4 (dual browser) fails; verify steps 3, 2, 1 rolled back | **PASS** |
| **Fault Injection Step 5** | `MultiPolicyBatch_FailureAtStepN_HaltsImmediatelyAndRollsBackInReverse(5)` | Step 5 fails; verify all 4 prior steps rolled back in reverse | **PASS** |
| **Tri-State 0-Defaulting Defense** | `Rollback_AbsentValuesDeleted_PreExistingValuesRestored_NoZeroDefaulting` | Verify absent values are completely deleted (`ValueExists == false`), pre-existing restored | **PASS** |
| **Probe Failure Trigger** | `ProbeFailure_SimulatedUnexpectedProbeValue_TriggersAutomatedRollback` | Simulated probe read failure triggers automated rollback of applied policies | **PASS** |
| **Rollback Idempotency** | `Rollback_ExecutedMultipleTimes_DoesNotCorruptStateOrThrow` | Rollback executed 3 consecutive times; state remains clean and uncorrupted | **PASS** |
| **Exact Admin SID S-1-5-32-544** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("S-1-5-32-544")` | Exact SID rejected, zero mutations | **PASS** |
| **Lowercase Admin SID** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("s-1-5-32-544")` | Lowercase SID rejected, zero mutations | **PASS** |
| **Exact RID 500** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("S-1-5-21-*-500")` | Built-in Administrator RID 500 rejected | **PASS** |
| **Padded Admin SID (Spaces)** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("  S-1-5-32-544  ")` | Whitespace padding bypasses immunity check; mutations applied to admin hive | **FAIL (DEFECT)** |
| **Padded Admin SID (Tabs)** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("\tS-1-5-32-544\t")` | Tab padding bypasses immunity check; mutations applied to admin hive | **FAIL (DEFECT)** |
| **Padded Admin SID (CRLF)** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("S-1-5-32-544\r\n")` | Newline bypasses immunity check; mutations applied to admin hive | **FAIL (DEFECT)** |
| **Padded RID 500 (Spaces)** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("  S-1-5-21-*-500  ")` | Whitespace bypasses RID 500 immunity check | **FAIL (DEFECT)** |
| **Padded RID 500 (Newline)** | `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations("S-1-5-21-*-500\n")` | Trailing newline bypasses RID 500 immunity check | **FAIL (DEFECT)** |
| **Admin UserName with Null SID** | `AdministratorImmunity_AdminUserNameWithEmptyOrNullSid_MustRejectWithZeroMutations("Administrator", null)` | Bypasses immunity, mutates live HKCU (current admin) | **FAIL (DEFECT)** |
| **Admin UserName with Empty SID** | `AdministratorImmunity_AdminUserNameWithEmptyOrNullSid_MustRejectWithZeroMutations("Administrador", "")` | Bypasses immunity, mutates live HKCU (current admin) | **FAIL (DEFECT)** |
| **Admin UserName with Spaces** | `AdministratorImmunity_AdminUserNameWithEmptyOrNullSid_MustRejectWithZeroMutations("  Administrator  ", "   ")` | Bypasses immunity, mutates live HKCU (current admin) | **FAIL (DEFECT)** |
| **Path Traversal in Tx ID** | `TransactionId_PathTraversal_MustBeSanitizedOrRejected` | `../traversal_escape` writes JSON outside transaction directory | **FAIL (DEFECT)** |

**Suite Summary**: 304 tests executed; 293 Passed, 11 Failed (all 11 failures reproduce the identified defects).

---

## 3. Detailed Defect Analysis & Reproduction

### Defect 1: Whitespace / Control Character Bypass of Administrator Immunity
- **Severity**: **Critical**
- **Affected Files**:
  - [`desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs`](file:///home/antigravity/krrozino/winlab/desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs#L114)
  - [`desktop/src/WinLab.Contracts/Registry/InMemoryRegistryService.cs`](file:///home/antigravity/krrozino/winlab/desktop/src/WinLab.Contracts/Registry/InMemoryRegistryService.cs#L323-L328)
  - [`desktop/src/WinLab.Executor/Services/WindowsUserHiveManager.cs`](file:///home/antigravity/krrozino/winlab/desktop/src/WinLab.Executor/Services/WindowsUserHiveManager.cs#L102-L130)
- **Reproduction**:
  Submit an `ApplyTransactionRequestDto` with `TargetUserSid = "  S-1-5-32-544  "` or `TargetUserSid = "S-1-5-21-123456789-123-500  "`.
- **Mechanism**:
  1. `TransactionEngine.cs` line 114 executes:
     ```csharp
     bool isTargetAdmin = _hiveManager.IsUserAdministrator(request.TargetUserSid);
     ```
  2. In `MockUserHiveManager.cs`:
     ```csharp
     public bool IsUserAdministrator(string? userSid)
     {
         if (string.IsNullOrWhiteSpace(userSid)) return false;
         if (_adminSids.Contains(userSid)) return true;
         if (userSid.EndsWith("-500", StringComparison.OrdinalIgnoreCase)) return true;
         return false;
     }
     ```
     Because `userSid` is un-trimmed, `_adminSids.Contains("  S-1-5-32-544  ")` evaluates to `false`, and `"  S-1-5-32-544  ".EndsWith("-500")` evaluates to `false`.
  3. In `WindowsUserHiveManager.cs`:
     ```csharp
     if (string.Equals(userSid, "S-1-5-32-544", StringComparison.OrdinalIgnoreCase)) return true;
     if (userSid.EndsWith("-500", StringComparison.OrdinalIgnoreCase)) return true;
     ```
     `string.Equals` and `EndsWith` fail. `new SecurityIdentifier(userSid)` throws an unhandled `ArgumentException: Value was invalid`, caught by the fallback block which evaluates `userSid.EndsWith("-500")` (still `false`).
  4. `TransactionEngine` treats the user as non-admin, captures baseline, and invokes `handler.Apply()`.
  5. Registry mutation occurs on `HKEY_USERS\  S-1-5-32-544  \...`, breaching Administrator Immunity.

### Defect 2: TargetUserName Bypass when TargetUserSid is Null or Empty
- **Severity**: **High**
- **Affected Files**:
  - [`desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs`](file:///home/antigravity/krrozino/winlab/desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs#L114)
  - [`desktop/src/WinLab.Contracts/Policies/RegistryDWordPolicyHandler.cs`](file:///home/antigravity/krrozino/winlab/desktop/src/WinLab.Contracts/Policies/RegistryDWordPolicyHandler.cs#L60-L73)
- **Reproduction**:
  Submit an `ApplyTransactionRequestDto` with `TargetUserName = "Administrator"` and `TargetUserSid = null`.
- **Mechanism**:
  1. `_hiveManager.IsUserAdministrator(request.TargetUserSid)` receives `null` and returns `false`.
  2. `TransactionEngine` does NOT inspect `request.TargetUserName`, bypassing the immunity check.
  3. `RegistryDWordPolicyHandler.ResolveTargetHiveAndKey`:
     ```csharp
     if (string.IsNullOrWhiteSpace(targetUserSid))
     {
         return (RegistryHiveType.CurrentUser, RelativeSubKeyPath);
     }
     ```
  4. Policy writes to `RegistryHiveType.CurrentUser` (`HKEY_CURRENT_USER`), which is the elevated administrator's live hive.

### Defect 3: Path Traversal via TransactionId
- **Severity**: **High**
- **Affected File**:
  - [`desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs`](file:///home/antigravity/krrozino/winlab/desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs#L420)
- **Reproduction**:
  Submit an `ApplyTransactionRequestDto` or `RollbackTransactionRequestDto` with `TransactionId = "../traversal_escape"`.
- **Mechanism**:
  ```csharp
  string finalPath = Path.Combine(_transactionDir, $"{tx.TransactionId}.json");
  ```
  `Path.Combine` resolves relative sequences (`../`), causing files to be written or loaded outside `_transactionDir`.

---

## 4. Concrete Remediation Recommendations

### Recommendation 1: Sanitize and Trim Target SIDs & User Names in `TransactionEngine` and Hive Managers

In `desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs`:
```csharp
// 2. Administrator Immunity Guard
string? cleanSid = request.TargetUserSid?.Trim();
string? cleanName = request.TargetUserName?.Trim();

var sidValidation = SecurityValidator.ValidateTargetNotAdministrator(cleanSid);
var nameValidation = SecurityValidator.ValidateTargetNotAdministrator(cleanName);

bool isTargetAdmin = (!sidValidation.IsValid) 
                  || (!nameValidation.IsValid)
                  || _hiveManager.IsUserAdministrator(cleanSid);

if (isTargetAdmin)
{
    bool hasUserPolicy = handlers.Any(h => h.Handler.Scope == PolicyScope.User);
    if (hasUserPolicy)
    {
        tx.Status = TransactionStatus.Failed;
        tx.FailureReason = "Violação de segurança: Contas de Administrador possuem imunidade e não podem receber restrições de laboratório.";
        await SaveTransactionAsync(tx, ct);

        return new ApplyTransactionResultDto
        {
            TransactionId = txId,
            Status = TransactionStatus.Failed,
            Success = false,
            Message = tx.FailureReason
        };
    }
}
```

In `desktop/src/WinLab.Contracts/Registry/InMemoryRegistryService.cs` and `desktop/src/WinLab.Executor/Services/WindowsUserHiveManager.cs`:
```csharp
public bool IsUserAdministrator(string? userSid)
{
    if (string.IsNullOrWhiteSpace(userSid)) return false;
    string trimmed = userSid.Trim();
    if (_adminSids.Contains(trimmed) || string.Equals(trimmed, "S-1-5-32-544", StringComparison.OrdinalIgnoreCase)) return true;
    if (trimmed.EndsWith("-500", StringComparison.OrdinalIgnoreCase)) return true;
    if (string.Equals(trimmed, "Administrator", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(trimmed, "Administrador", StringComparison.OrdinalIgnoreCase)) return true;
    return false;
}
```

### Recommendation 2: Sanitize TransactionId Against Path Traversal

In `desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs`:
```csharp
private static string SanitizeTransactionId(string transactionId)
{
    if (string.IsNullOrWhiteSpace(transactionId)) return Guid.NewGuid().ToString("D");
    // Strip directory separators and invalid file name characters
    string fileName = Path.GetFileName(transactionId);
    foreach (char c in Path.GetInvalidFileNameChars())
    {
        fileName = fileName.Replace(c, '_');
    }
    return string.IsNullOrWhiteSpace(fileName) ? Guid.NewGuid().ToString("D") : fileName;
}
```

### Recommendation 3: Add Guard for Null `request.Policies`

In `desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs`:
```csharp
if (request.Policies == null || request.Policies.Count == 0)
{
    return new ApplyTransactionResultDto
    {
        TransactionId = txId,
        Status = TransactionStatus.Failed,
        Success = false,
        Message = "A lista de políticas solicitadas não pode ser nula ou vazia."
    };
}
```

---

## 5. Conclusion & Verdict

**Verdict**: **`DEFECT_FOUND`**  
The Milestone 3 policy engine correctly implements the reverse rollback state machine and zero-defaulting protections, but possesses exploitable Administrator Immunity bypass vectors (whitespace padding, control characters, and username fallback) as well as path traversal in transaction persistence. These defects must be resolved before proceeding to Milestone 4.
