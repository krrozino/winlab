# Code Review Report: Milestone 2 Iteration 2 — SecurityValidator & Account Safety Invariants

**Verdict: APPROVE**

**Reviewer:** reviewer_m2_2_1  
**Scope:** Milestone 2 Iteration 2 (C# Contracts & Account Safety Invariants)  
**Target Files:**  
- `desktop/src/WinLab.Contracts/SecurityValidator.cs`  
- `desktop/tests/WinLab.Tests/SecurityValidatorTests.cs`  

---

### 1. Observation
- `SecurityValidator.cs`:
  - `ForbiddenAccountChars`: Static array defining all 16 Windows SAM forbidden characters: `"` `/` `\` `[` `]` `:` `;` `|` `=` `,` `+` `*` `?` `<` `>` `@`.
  - `ValidateSingleAccount(string? user, string emptyMessage)`:
    - Enforces non-empty, non-whitespace account names.
    - Trims input and enforces maximum length of 20 characters (`trimmed.Length > 20`).
    - Detects and rejects names consisting only of periods and whitespace (`trimmed.All(c => c == '.' || char.IsWhiteSpace(c))`), permitting names like `aluno.lab01`.
    - Checks for any forbidden character with `user.IndexOfAny(ForbiddenAccountChars) >= 0`.
  - `ValidateAccountNames(string? studentUser, string? adminUser)`:
    - Sequentially validates restricted/student user followed by administrator user.
    - Rejects identical accounts with trimmed, case-insensitive ordinal comparison (`StringComparison.OrdinalIgnoreCase`).
  - `ValidateStudentNotAdministrator(string? studentUser, IEnumerable<LocalUserDto>? accounts)`:
    - Gracefully handles null/whitespace student username or null accounts list.
    - Safely navigates `accounts` handling potential null elements and null `Name` properties (`u != null && string.Equals(u.Name?.Trim(), trimmed, StringComparison.OrdinalIgnoreCase)`).
    - If student matches an account with `IsAdmin == true`, returns failure with safety explanation.
  - Localized Portuguese error messages: High-quality, clear user-facing messages matching the pedagogical requirements of WinLab.
- `SecurityValidatorTests.cs`:
  - 17 comprehensive test methods, covering empty/whitespace cases, unlisted actions, mutating actions, shell injection patterns, envelope schema validation, payload command field rejections, and new account safety tests.
  - Parameterized theory (`ValidateAccountNames_ForbiddenCharacters_RejectedForStudentAndAdmin`) testing all 16 forbidden characters independently for both student and admin roles.
  - Boundary tests for length 20 vs. 21 characters (`ValidateAccountNames_LengthGreaterThan20_RejectedForStudentAndAdmin`, `ValidateAccountNames_LengthUpTo20AfterTrim_Accepted`).
  - Boundary tests for period-only inputs (`ValidateAccountNames_NamesConsistingOnlyOfPeriods_Rejected`, `ValidateAccountNames_NamesWithPeriodsAndValidCharacters_Accepted`).
  - Whitespace-padded equality tests (`ValidateAccountNames_WhitespacePaddedEquality_Rejected`).
  - Full matrix of `ValidateStudentNotAdministrator` (admin user, standard user, null inputs, missing user).

---

### 2. Logic Chain & Quality Evaluation

1. **Completeness & Correctness of Forbidden Characters:**
   - The array `ForbiddenAccountChars` contains all 16 characters prohibited by Windows Security Account Manager (SAM): `"`, `/`, `\`, `[`, `]`, `:`, `;`, `|`, `=`, `,`, `+`, `*`, `?`, `<`, `>`, `@`.
   - Tested exhaustively with 16 test cases covering both student and admin fields.

2. **Length Boundary & Period-Only Validation:**
   - Post-trim length limit of 20 characters adheres strictly to Windows NetUser/SAM max username constraints (20 chars max).
   - Names containing 20 chars after trimming are correctly accepted; names with 21 or more chars are rejected with a clear message.
   - Names consisting solely of periods (e.g. `.`, `..`, `...`, `. . .`) are rejected, while legitimate composite names (e.g. `aluno.lab01`) pass.

3. **Account Safety Invariants & Administrator Immunity:**
   - Account non-equality correctly uses `string.Equals(studentUser!.Trim(), adminUser!.Trim(), StringComparison.OrdinalIgnoreCase)` preventing case-spoofing or whitespace bypass (e.g. `"Aluno "` vs `"aluno"`).
   - `ValidateStudentNotAdministrator` successfully enforces administrator immunity: if the target student account is already an administrator in the scanned accounts list, WinLab blocks application of restricted student policies to prevent catastrophic lockout.

4. **Contract Parity with TypeScript:**
   - Parity between `desktop/src/WinLab.Contracts/SecurityValidator.cs` and `src/lib/validation.ts` is 100% aligned across character sets, length limits, period rejection rules, and case-insensitive comparison semantics.

5. **Cleanliness & Execution of Tests:**
   - All tests execute real validation assertions. No tautological or skipped tests (`[Fact(Skip=...)]`).
   - The full test suite in `desktop/tests/WinLab.Tests` executed with 188 passed tests, 0 failed, 0 skipped.
   - The companion TypeScript suite in `npm test` executed with 93 passed tests, 0 failed, 0 skipped.

---

### 3. Caveats & Observations
- In `ValidateStudentNotAdministrator`, when `accounts` is null or the student user is not found in `accounts`, it returns `(true, null)`. This is the intended behavior because during dry-run configurations or machine staging, an account may not yet exist or the live scan may be deferred.
- Error messages are standardized in Portuguese across both C# backend contracts and TypeScript frontend bridges.

---

### 4. Conclusion & Verdict

**VERDICT: APPROVE**

The changes in `desktop/src/WinLab.Contracts/SecurityValidator.cs` and `desktop/tests/WinLab.Tests/SecurityValidatorTests.cs` satisfy all architecture, security, and invariant requirements with full test coverage and clean contract parity.
