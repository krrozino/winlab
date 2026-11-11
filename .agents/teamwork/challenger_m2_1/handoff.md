# Challenger Handoff Report: Milestone 2 Adversarial Boundary & Stress Verification

**Subagent ID:** `challenger_m2_1`  
**Parent Orchestrator:** `e7faf97beb4089c3940985d95c82590f`  
**Date:** 2026-11-10  
**Scope:** Milestone 2 (Real Windows Scanner, Pipe Framing & Administrative Auth)  
**Target Path:** `/home/antigravity/krrozino/winlab/.agents/teamwork/challenger_m2_1/handoff.md`  
**Final Verdict:** **`DEFECT_FOUND`** (Account Invariants in C# `SecurityValidator.ValidateAccountNames` accept forbidden Windows username characters and lack Administrator Immunity validation; `PipeFraming` is verified robust across all 5 boundary vectors)

---

## 1. Observation

### 1.1 Objective 1: Baseline Test Suite Execution in Release Mode
We executed the official test suite command:
```bash
/home/antigravity/.dotnet/dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release
```

**Verbatim Execution Output:**
```text
  Determining projects to restore...
  All projects are up-to-date for restore.
  WinLab.Contracts -> /home/antigravity/krrozino/winlab/desktop/src/WinLab.Contracts/bin/Release/net10.0/WinLab.Contracts.dll
  WinLab.Agent.Mock -> /home/antigravity/krrozino/winlab/desktop/src/WinLab.Agent.Mock/bin/Release/net10.0/WinLab.Agent.Mock.dll
  WinLab.Tests -> /home/antigravity/krrozino/winlab/desktop/tests/WinLab.Tests/bin/Release/net10.0/WinLab.Tests.dll
Test run for /home/antigravity/krrozino/winlab/desktop/tests/WinLab.Tests/bin/Release/net10.0/WinLab.Tests.dll (.NETCoreApp,Version=v10.0)
A total of 1 test files matched the specified pattern.

Passed!  - Failed:     0, Passed:   149, Skipped:     0, Total:   149, Duration: 1 s - WinLab.Tests.dll (net10.0)
```
- **Result:** All 149 pre-existing unit tests pass in Release mode.

---

### 1.2 Objective 2: Adversarial Boundary & Stress Verification of `PipeFraming`
We tested all 5 required boundary vectors against `desktop/src/WinLab.Contracts/PipeFraming.cs`:

| Test Vector | Adversarial Input | Expected Behavior | Observed Behavior | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Vector 1: Zero-length payload** | 4-byte header `0x00000000` | Must throw `InvalidDataException` | Throws `InvalidDataException: Invalid frame length: 0 bytes. Must be between 1 and 16777216.` | **CONFIRMED ROBUST** |
| | `WriteFrameAsync(s, "")` followed by `ReadFrameAsync(s)` | Writer emits 4-byte 0 header; reader rejects | Emits 4 bytes; reader throws `InvalidDataException: Invalid frame length: 0` | **CONFIRMED ROBUST** |
| | 0-byte empty stream | Must throw `EndOfStreamException` | Throws `EndOfStreamException: Pipe disconnected while reading frame header.` | **CONFIRMED ROBUST** |
| **Vector 2: Exact 16 MB max boundary** | Payload of exact 16,777,216 UTF-8 bytes | Must roundtrip byte-for-byte | `WriteFrameAsync` writes 16,777,220 bytes. `ReadFrameAsync` reads exact 16,777,216 bytes. Content matches 100%. | **CONFIRMED ROBUST** |
| **Vector 3: Exceeding 16 MB limit** | Writer: 16,777,217 bytes (16 MB + 1 byte) | Writer throws `InvalidOperationException` without writing | Throws `InvalidOperationException: Payload size 16777217 exceeds maximum permitted frame size (16777216 bytes).` Stream length remains 0. | **CONFIRMED ROBUST** |
| | Reader: Header `16,777,217` | Reader throws `InvalidDataException` before buffer alloc | Throws `InvalidDataException: Invalid frame length: 16777217 bytes. Must be between 1 and 16777216.` | **CONFIRMED ROBUST** |
| | Reader: Header `int.MaxValue` (2,147,483,647) | Must reject without OOM/crash | Throws `InvalidDataException: Invalid frame length: 2147483647 bytes.` Zero memory allocated. No CLR crash. | **CONFIRMED ROBUST** |
| **Vector 4: Negative length headers** | Headers: `-1`, `-5`, `-1000`, `int.MinValue` | Must reject without negative array allocation | Throws `InvalidDataException: Invalid frame length: <negative> bytes.` | **CONFIRMED ROBUST** |
| **Vector 5: Truncated streams & EOF** | Stream with 1, 2, or 3 bytes (partial header) | Must throw `EndOfStreamException` | Throws `EndOfStreamException: Pipe disconnected while reading frame header.` | **CONFIRMED ROBUST** |
| | Header specifies 5,000 bytes, stream provides 100 bytes and closes | Must throw `EndOfStreamException` | Throws `EndOfStreamException: Pipe disconnected while reading frame payload.` | **CONFIRMED ROBUST** |

---

### 1.3 Objective 3: Adversarial Verification of Account Invariants

#### A. Invariant 1: Rejecting target student account equal to administrator
- **In C# (`SecurityValidator.ValidateAccountNames`):**
  - Tested: `("Aluno", "Aluno")`, `("aluno", "ALUNO")`, `("  Aluno  ", "aluno")`, `("ADMIN", "admin")`.
  - Result: All return `isValid: false, error: "A conta restrita não pode ser idêntica à conta de administrador."`. **PASS.**
- **In TypeScript (`validateAccountsSafety`):**
  - Tested: `("Aluno", "Aluno")`, `("aluno", "ALUNO")`.
  - Result: Returns `isValid: false, error: "Usuário restrito e administrador precisam ter nomes diferentes."`. **PASS.**

#### B. Invariant 2: Handling empty account names
- **In C# (`SecurityValidator.ValidateAccountNames`):**
  - Tested: `("", "Admin")`, `("   ", "Admin")`, `(null, "Admin")`, `("Aluno", "")`, `("Aluno", "   ")`, `("Aluno", null)`.
  - Result: All return `isValid: false, error: "Nome da conta de aluno/restrita é obrigatório."` or `"Nome da conta de administrador é obrigatório."`. **PASS.**
- **In TypeScript (`validateAccountsSafety`):**
  - Tested: `("", "Admin")`, `("Aluno", "")`.
  - Result: Returns `isValid: false, error: "...não pode ficar vazio."`. **PASS.**

#### C. Invariant 3: Handling invalid characters in account names (DEFECT FOUND)
Windows SAM local account naming rules forbid characters: `"` `/` `\` `[` `]` `:` `;` `|` `=` `,` `+` `*` `?` `<` `>` `@`.
- **In TypeScript (`src/lib/validation.ts`):**
  - All 15 characters are rejected: `validateAccountsSafety("Aluno/Test", "Admin")` returns `isValid: false, error: "Usuário restrito contém caractere inválido: /"`. **PASS.**
- **In C# (`desktop/src/WinLab.Contracts/SecurityValidator.cs` lines 178–190):**
  - **Empirical test:** We passed all 15 illegal characters to `SecurityValidator.ValidateAccountNames(invalidName, "Administrador")`:
    - `"Aluno/Slash"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno\\Backslash"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno\"Quote"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno[Bracket]"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno:Colon"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno;Semicolon"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno|Pipe"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno=Equal"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno,Comma"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno+Plus"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno*Asterisk"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno?Question"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno<Less"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno>Greater"` -> Returns `isValid: true, error: null` (**DEFECT**)
    - `"Aluno@At"` -> Returns `isValid: true, error: null` (**DEFECT**)
  - Additionally, names longer than 20 characters and names consisting only of periods (`"..."`) return `isValid: true`.
  - **Verdict on Invariant 3:** **DEFECT_FOUND.** The C# contract layer does not validate illegal Windows account characters.

#### D. Invariant 4: Rejecting target student account if student is in Administrators group (DEFECT FOUND)
- **In TypeScript (`FirstRunWizard.tsx:146-156` and `tests/wizard-and-mode.test.ts:136-150`):**
  - The wizard checks `inventory.localUsers` to ensure that `selectedStudentObj.isAdmin` is false:
    `"A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador."`. **PASS.**
- **In C# (`WinLab.Contracts`):**
  - `SecurityValidator.cs` only exposes `ValidateAccountNames(string? studentUser, string? adminUser)`.
  - There is **no method or overload** in `SecurityValidator` (e.g. `ValidateAccountSafety(string? studentUser, string? adminUser, IEnumerable<LocalUserDto>? scannedUsers)`) or anywhere in `WinLab.Contracts` / `WinLab.Executor` to reject a student account if it possesses administrative privileges.
  - While `LocalAccountsScanner.cs` correctly identifies `IsAdmin = true`, the C# contracts layer lacks any validator for this invariant. Any backend consumer or non-UI caller invoking C# validation receives no protection against targeting an administrative user as student.
  - **Verdict on Invariant 4:** **DEFECT_FOUND.** The Administrator Immunity Rule is absent from the C# contracts layer.

---

## 2. Logic Chain

1. **Premise 1 (Framing Defense-in-Depth):**
   `PipeFraming.cs` was engineered to protect the named pipe IPC channel against denial-of-service and memory exhaustion attacks.
   - Reader enforces `payloadLength <= 0 || payloadLength > MaxFrameSize` immediately after reading 4 bytes.
   - Because the guard condition occurs *before* `new byte[payloadLength]`, oversized headers (`int.MaxValue`) cannot trigger unhandled `OutOfMemoryException`.
   - Reader and writer consistently guard against negative and zero-length boundaries.

2. **Premise 2 (Account Invariants Specification):**
   The WinLab specification defines four mandatory Account Safety Invariants for Desktop Milestone 2:
   1. Student account cannot be empty.
   2. Student account cannot equal administrator account.
   3. Student account cannot contain forbidden Windows local-account characters or exceed 20 characters.
   4. Student account cannot be a member of the Administrators group (Administrator Immunity Rule).

3. **Premise 3 (Divergence between TS and C# Contract Layers):**
   - The TypeScript frontend correctly implements all four invariants (`src/lib/validation.ts` and `src/desktop/FirstRunWizard.tsx`).
   - The C# contract validator `desktop/src/WinLab.Contracts/SecurityValidator.cs` only implements Invariants 1 and 2 (empty and equality checks).
   - Invariant 3 (forbidden characters) is completely missing from `SecurityValidator.cs`:
     ```csharp
     // Current implementation in desktop/src/WinLab.Contracts/SecurityValidator.cs:
     public static (bool IsValid, string? Error) ValidateAccountNames(string? studentUser, string? adminUser)
     {
         if (string.IsNullOrWhiteSpace(studentUser))
             return (false, "Nome da conta de aluno/restrita é obrigatório.");

         if (string.IsNullOrWhiteSpace(adminUser))
             return (false, "Nome da conta de administrador é obrigatório.");

         if (string.Equals(studentUser!.Trim(), adminUser!.Trim(), StringComparison.OrdinalIgnoreCase))
             return (false, "A conta restrita não pode ser idêntica à conta de administrador.");

         return (true, null); // BUG: Accepts "Aluno/Slash", "Aluno*Star", "Aluno;Calc"
     }
     ```
   - Invariant 4 (Administrator Immunity) is completely missing from C# contracts; `SecurityValidator` provides no API to validate account safety against scanned local users.

4. **Inference & Risk:**
   - Any backend verification (e.g. `WinLab.Executor` processing `config.validate` or future CLI / IPC callers) that delegates to `SecurityValidator.ValidateAccountNames` will fail open on invalid account names containing characters that break Win32 `NetUserAdd` or PowerShell `New-LocalUser`.
   - The contract parity between the TypeScript client and C# host is broken.

---

## 3. Caveats

1. **Frontend Defense Coverage:**
   In normal end-user operation through `WinLab.Desktop`'s WebView2 UI, `FirstRunWizard.tsx` (`validateStep2`) and `validateAccountsSafety` intercept invalid characters and administrative accounts before the operator can proceed to Step 3. Therefore, the defect does not currently allow an end-user to submit illegal account names via the UI wizard.
2. **Platform Dependency on Administrator SID Enumeration:**
   On Linux development hosts, `LocalAccountsScanner` returns a mock fallback user with `IsAdmin = true`. Real canonical SID translation (`S-1-5-32-544` Builtin Administrators) only executes on Windows.
3. **No Code Modification Constraint:**
   In accordance with the `Review-only / Challenger` mandate, this agent did not modify `SecurityValidator.cs` or production source files. The reproduction is provided for remediation by the worker subagent in the next iteration.

---

## 4. Conclusion

**FINAL VERDICT: `DEFECT_FOUND`**

### Summary:
- **`PipeFraming`:** **CONFIRMED ROBUST.** Passes all boundary tests (zero-length, exact 16 MB max boundary payload, >16 MB writer and reader rejection, negative headers, truncated streams, unexpected EOF) with 100% predictable exceptions and zero process crashes.
- **`Account Invariants`:**
  - Equal accounts check: **CONFIRMED ROBUST** in both C# and TS.
  - Empty accounts check: **CONFIRMED ROBUST** in both C# and TS.
  - Invalid characters check: **DEFECT FOUND in C#** (`SecurityValidator.ValidateAccountNames` accepts `" / \ [ ] : ; | = , + * ? < > @`).
  - Administrator Immunity check: **DEFECT FOUND in C#** (`SecurityValidator` lacks any method/overload to validate student account against Administrators group).

---

## 5. Verification Method

### 5.1 Verifying C# Unit Test Suite
```bash
/home/antigravity/.dotnet/dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release
```
*Expected:* 149/149 tests pass.

### 5.2 Verifying TypeScript Account Invariants (Frontend Layer)
```bash
npx tsx -e '
import { validateAccountsSafety } from "./src/lib/validation";
const check = validateAccountsSafety("Aluno/Invalid", "Administrador");
console.log("TS rejects invalid chars:", check.isValid === false, check.error);
'
```
*Expected Output:* `TS rejects invalid chars: true Usuário restrito contém caractere inválido: /`

### 5.3 Empirical Reproduction of C# `SecurityValidator` Defect
Execute the following verification script in C# against `WinLab.Contracts.dll`:
```csharp
using System;
using WinLab.Contracts;

// Reproducing Defect 1: Illegal characters accepted by SecurityValidator
string[] illegalChars = { "Aluno/Slash", "Aluno\\Backslash", "Aluno\"Quote", "Aluno*Asterisk", "Aluno:Colon" };
foreach (var name in illegalChars)
{
    var (isValid, error) = SecurityValidator.ValidateAccountNames(name, "Administrador");
    Console.WriteLine($"Name: '{name}' => IsValid: {isValid}, Error: '{error}'");
    // Observed: IsValid = True, Error = null (DEFECT)
}

// Reproducing Defect 2: Missing Administrator Immunity validator in C#
bool hasAdminImmunityMethod = typeof(SecurityValidator).GetMethod("ValidateAccountSafety") != null;
Console.WriteLine($"SecurityValidator has ValidateAccountSafety: {hasAdminImmunityMethod}");
// Observed: False (DEFECT)
```
