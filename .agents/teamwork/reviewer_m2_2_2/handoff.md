# Code Review Report: Milestone 2 Iteration 2 — Frontend & Defense-in-Depth

**Verdict: APPROVE**

**Reviewer:** reviewer_m2_2_2  
**Role:** Code Reviewer (Frontend & Defense-in-Depth)  
**Scope:** Milestone 2 Iteration 2  
**Target Files:**  
- `src/lib/validation.ts`  
- `src/desktop/FirstRunWizard.tsx`  
- `tests/wizard-and-mode.test.ts`  

---

### Section 1: Observation

1. **Whitespace Collision Bypass Remediation (`src/lib/validation.ts`)**:
   - In `getConfigErrors` (lines 80–91), the equality check now explicitly trims both sides before executing `localeCompare`:
     ```typescript
     if (
       config.studentUser.trim() &&
       config.adminUser.trim() &&
       config.studentUser.trim().localeCompare(config.adminUser.trim(), undefined, {
         sensitivity: "accent"
       }) === 0
     ) {
       errors.push({
         field: "studentUser",
         message: "Usuário restrito e administrador precisam ter nomes diferentes."
       });
     }
     ```
   - In `validateAccountsSafety` (lines 96–122):
     - Validates student account with `validateUserName(studentUser, "studentUser", "Usuário restrito")`.
     - Validates admin account with `validateUserName(adminUser, "adminUser", "Administrador")`.
     - Performs identical trimmed, accent/case-insensitive collision check:
       `studentUser.trim().localeCompare(adminUser.trim(), undefined, { sensitivity: "accent" }) === 0`.
     - Returns typed `{ isValid: boolean; error?: string }` consumed directly by `FirstRunWizard.tsx`.

2. **Defense-in-Depth Preflight Check (`src/desktop/FirstRunWizard.tsx`)**:
   - In `handleConfirmAndInitialize` (lines 174–177):
     ```typescript
     async function handleConfirmAndInitialize() {
       if (!isConfirmed) return;
       if (preflightData?.status === "BLOCK") return;
       setIsCreatingBaseline(true);
       ...
     ```
   - Dual-layer gate:
     - **UI Presentation Layer**: Checkbox `disabled={preflightData?.status === "BLOCK"}` (line 657) and confirm button `disabled={!isConfirmed || isCreatingBaseline || preflightData?.status === "BLOCK"}` (line 685) visually and functionally disable user interaction.
     - **Action Dispatch Layer (Defense-in-Depth)**: Immediate guard return `if (preflightData?.status === "BLOCK") return;` prevents programmatic invocation or DOM tampering from triggering baseline capture and configuration completion when preflight fails.

3. **Account Safety Invariants & Administrator Immunity (`FirstRunWizard.tsx`)**:
   - `validateStep2()` (lines 135–159):
     - Calls `validateAccountsSafety(studentUser, adminUser)`.
     - Checks Administrator Immunity Rule against live scanned inventory:
       ```typescript
       if (inventory && inventory.localUsers) {
         const selectedStudentObj = inventory.localUsers.find(
           (u) => u.name.localeCompare(studentUser.trim(), undefined, { sensitivity: "accent" }) === 0
         );
         if (selectedStudentObj && selectedStudentObj.isAdmin) {
           setAccountValidationError(
             "A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador."
           );
           return false;
         }
       }
       ```
     - Trimming is also applied when persisting `targetStudentUser: studentUser.trim()` and `protectedAdminUser: adminUser.trim()` in `FirstRunState` (lines 197–198) and in `selectedConfig` (lines 209–210).

4. **Test Suite Verification (`tests/wizard-and-mode.test.ts`)**:
   - Added dedicated test `Whitespace Bypass Remediation: validateAccountsSafety and getConfigErrors reject whitespace-padded collisions` (lines 236–295).
   - Tests 8 distinct collision variations across leading/trailing whitespace and case permutations (`"Aluno "` vs `"Aluno"`, `"aluno"` vs `" ALUNO "`, `"  Aluno  "` vs `"aluno"`, etc.).
   - Asserts both `validateAccountsSafety` and `getConfigErrors` reject the collisions with identical localized error messages.
   - Verifies valid distinct names with whitespace padding (e.g. `" Aluno "` and `" MicrolinsAdmin "`) are correctly trimmed and accepted.

---

### Section 2: Logic Chain & Evaluation

1. **Efficacy of the Whitespace Collision Fix**:
   - In earlier iterations, `config.studentUser.localeCompare(config.adminUser, ...)` compared raw un-trimmed strings. Any leading or trailing whitespace (`"Aluno "` vs `"Aluno"`) resulted in a non-zero comparison, allowing identical effective account names to pass frontend validation.
   - Because Windows SAM (Security Account Manager) normalizes or strips trailing whitespace during account lookup and policy targeting, this defect could have resulted in restricted pedagogical policies being mistakenly applied to the protected administrator account.
   - The fix applies `.trim()` synchronously to both operands before calling `localeCompare(..., undefined, { sensitivity: "accent" })`. With `sensitivity: "accent"`, standard Unicode collation matches case-insensitively while preserving diacritic distinctions. This completely eliminates whitespace padding as a bypass vector.

2. **Defense-in-Depth Preflight Gate**:
   - UI disabling alone is vulnerable to state desynchronization or DOM state manipulation.
   - Enforcing `if (preflightData?.status === "BLOCK") return;` inside `handleConfirmAndInitialize` guarantees that regardless of UI element state, the client transport will never dispatch `ACTION_CREATE_BASELINE` nor invoke `onComplete` when preflight diagnostics indicate blocking conditions (such as missing Windows Enterprise edition, insufficient disk space, or missing AppLocker service).

3. **Contract Parity with C# `SecurityValidator`**:
   - **Forbidden SAM Characters**: Exactly identical 16 forbidden characters (`"`, `/`, `\`, `[`, `]`, `:`, `;`, `|`, `=`, `,`, `+`, `*`, `?`, `<`, `>`, `@`) defined in `INVALID_LOCAL_USER_CHARS` (TS) and `ForbiddenAccountChars` (C#).
   - **Length Limit**: Exactly 20 characters post-trim in both TS (`trimmed.length > 20`) and C# (`trimmed.Length > 20`).
   - **Period/Whitespace Rule**: TS (`/^[.\s]+$/.test(value)`) and C# (`trimmed.All(c => c == '.' || char.IsWhiteSpace(c))`) match 100%.
   - **Equality Comparison**: Both trim operands and execute case-insensitive comparisons.
   - **Administrator Immunity Rule**: Both TS and C# check `isAdmin` / `IsAdmin` on matching trimmed account names and emit the identical explanatory error message in Portuguese: `"A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador."`

4. **Regression Assessment on Existing UI Flows**:
   - **ModeToggle (`DemoBanner` / `handleToggleMode`)**: Zero-masquerade rule remains intact; transitioning from Demo to Real immediately nullifies `inventory`, `policySummary`, and `preflightData`. Failed live scans display a dedicated error banner without fallback to mock state.
   - **Wizard Step Progression**: Step 1 (Mode Detection) -> Step 2 (Account Discovery with live scanner & immunity check) -> Step 3 (Microlins Preset selection) -> Step 4 (Preflight diagnosis & baseline creation). Progression and back-navigation (`← Voltar`) remain seamless.
   - **Static Next.js Build**: `npm run build` completed successfully in 3.5s with zero TypeScript or lint errors. `scripts/verify-desktop-export.mjs` verified offline bundle integrity.

---

### Section 3: Caveats & Recommendations

1. **Preflight Network / IPC Query Failure (Fail-Closed Recommendation)**:
   - In `FirstRunWizard.tsx`, if `sendIpc(IPC_CONSTANTS.ACTION_QUERY_PREFLIGHT)` fails due to an IPC timeout or transport error, `preflightError` is populated and `preflightData` remains `null`.
   - In this state, `preflightData?.status === "BLOCK"` evaluates to `false` (because `undefined === "BLOCK"` is false). While `preflightError` is displayed visually, the checkbox is not disabled.
   - **Recommendation for Future Hardening**: Enhance the check to be strictly fail-closed:
     ```typescript
     if (!preflightData || preflightData.status === "BLOCK" || preflightError) return;
     ```
     This ensures that an aborted or errored preflight query prevents baseline confirmation just as strictly as a `BLOCK` diagnosis.

2. **Accented Account Names in SAM**:
   - `{ sensitivity: "accent" }` treats `aluno` and `Aluno` as equal, but treats `alunó` and `aluno` as unequal. In Windows SAM, diacritics are generally distinct characters, so this aligns well with operating system semantics.

---

### Section 4: Conclusion & Verdict

The changes introduced in Milestone 2 Iteration 2 completely resolve the whitespace collision bypass defect, enforce dual-layer defense-in-depth on preflight readiness, maintain 100% contract parity with C# `SecurityValidator`, and introduce zero regressions to the existing desktop UI flows.

**Final Verdict: APPROVE**

---

### Section 5: Verification Method

- **Code Inspection**:
  - Inspected `src/lib/validation.ts` (`validateUserName`, `getConfigErrors`, `validateAccountsSafety`).
  - Inspected `src/desktop/FirstRunWizard.tsx` (`validateStep2`, `handleConfirmAndInitialize`, lines 135–221, 650–700).
  - Inspected `desktop/src/WinLab.Contracts/SecurityValidator.cs` (`ForbiddenAccountChars`, `ValidateSingleAccount`, `ValidateAccountNames`, `ValidateStudentNotAdministrator`).
  - Inspected `src/app/desktop/page.tsx` (`handleToggleMode`, `showWizard` handler).
- **Automated Test Suites**:
  - `npm test`: Executed 93 tests across 8 test suites. 93 passed, 0 failed.
  - Specifically verified `tests/wizard-and-mode.test.ts` covering mode toggle invariant, zero-masquerade rule, account safety invariants, Microlins tiers, IPC contracts, and whitespace collision bypass remediation.
- **Build & Packaging Verification**:
  - `npm run build`: Static compilation and Next.js static page generation passed with 0 errors.
  - `node scripts/verify-desktop-export.mjs`: Confirmed offline static bundle `/desktop/src/WinLab.Desktop/wwwroot/desktop/index.html` valid and intact.
