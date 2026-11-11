# Challenger Report: Adversarial Verification of UI, Zero-Masquerade Invariant, and TypeScript IPC

**Agent ID:** `challenger_m2_2`  
**Milestone:** Milestone 2 (Real Windows Scanner & Administrative Auth)  
**Date:** 2026-11-10  
**Verdict:** **DEFECT_FOUND** (Feature 16 Zero-Masquerade Confirmed Robust; Feature 14 Account Safety Whitespace-Bypass Defect Identified)

---

## 1. Observation

Adversarial boundary checks, empirical fault injection, race condition tests, and fuzzing were conducted against:
1. **Feature 16 Zero-Masquerade Rule** (Demo vs. Real mode toggle, live scan failures, asynchronous mock pollution, and data purging).
2. **Feature 14 First-Run Wizard & Account Safety Invariants** (Character limits, forbidden characters, administrator immunity, Microlins presets, and Preflight BLOCK condition).
3. **TypeScript Desktop IPC Infrastructure** (`desktop-ipc.test.ts`, `tier2-boundary-cases.test.ts`, and full regression test suite).

### Automated Test Execution Results:
1. `npm test`: **92/92 passed** across all suites in 823.23 ms (0 failures).
2. `npx tsx --test tests/desktop-ipc.test.ts`: **13/13 passed** in 280.55 ms (0 failures). Includes 1,000 fuzz envelopes and extreme payload handling.
3. `npx tsx --test tests/e2e/tier2-boundary-cases.test.ts`: **8/8 passed** in 184.48 ms (0 failures).
4. `npx tsx --test /home/antigravity/.gemini/jetski/brain/7970b4f709ee9a1232545b8030e0f909/scratch/adversarial-verification.ts`: **9/9 adversarial tests passed** in 979.49 ms, validating zero-masquerade invariants, administrator immunity, and empirically demonstrating the whitespace validation bypass.

---

## 2. Logic Chain

### 2.1 Feature 16: Zero-Masquerade Invariant (Verified Robust — CONFIRMED)
- **Synchronous Purge on Toggle:** In `src/app/desktop/page.tsx` (`handleToggleMode`), upon switching from `Demo` to `Real`, `setInventory(null)`, `setPolicySummary(null)`, `setPreflightData(null)`, and `setScanError(null)` execute synchronously *prior* to any asynchronous IPC call. No stale mock data persists in memory during transit.
- **Strict Error Handling Without Mock Fallback:** When a live scan fails (e.g., IPC timeout, missing WebView2 runtime, or executor crash), `state.inventory` strictly remains `null`. The UI renders an explicit red error alert (`Falha de Conexão com o Host Windows`) and never backfills synthetic values or displays `LAB-MICROLINS-01`.
- **Asynchronous Race Condition Gating:** If a delayed query initiated in Demo mode resolves after the operator has switched to Real mode, the incoming payload is discarded because `isMock === true` is rejected when `mode === "Real"`.
- **Platform Separation:** In web mode without WebView2, the toggle button to Real mode is explicitly disabled (`disabled={!isWebView2Available}`), preventing unprivileged web browsers from triggering invalid native scans.

### 2.2 Feature 14: Preflight BLOCK & Baseline Initialization (Verified Robust — CONFIRMED)
- **Preflight BLOCK Enforcement:** When preflight diagnostics return `status: "BLOCK"` (e.g. disk space < 2 GB or TPM disabled), Step 4 of `FirstRunWizard` strictly disables both the confirmation checkbox (`disabled={preflightData?.status === "BLOCK"}`) and the commit button (`disabled={!isConfirmed || isCreatingBaseline || preflightData?.status === "BLOCK"}`).
- **Readiness Gate Evaluation:** Pilot readiness engine (`evaluatePilotReadiness`) halts and assigns `status: "BLOCKED"`, refusing package generation or baseline creation.

### 2.3 Feature 14: Microlins Pedagogical Tiers (Verified Robust — CONFIRMED)
- `microlins_iniciante`: AuditOnly, Chrome-only allowlist, full enforcement of system lockouts (cmd, powershell, regedit, installers, usb execution).
- `microlins_intermediario`: Productivity configuration (Chrome, Office suite, Power BI, VLC) with 15-minute wallpaper unlock and USB execution lockout.
- `microlins_avancado`: Design/Dev configuration (unrestricted installers, cmd, and powershell; regedit locked).
- All presets have unique IDs and comply with the core `Config` schema.

### 2.4 DEFECT IDENTIFIED: Account Non-Equality Whitespace Bypass in `validateAccountsSafety` & `getConfigErrors`
- **Root Cause Analysis:**
  In `src/lib/validation.ts` (lines 80–86 and lines 110–114):
  ```typescript
  // src/lib/validation.ts lines 110-114
  if (
    studentUser.trim() &&
    adminUser.trim() &&
    studentUser.localeCompare(adminUser, undefined, { sensitivity: "accent" }) === 0
  ) {
    return {
      isValid: false,
      error: "Usuário restrito e administrador precisam ter nomes diferentes."
    };
  }
  ```
  The guard tests `studentUser.trim()` and `adminUser.trim()`, but the comparison performs `studentUser.localeCompare(adminUser)` on the **untrimmed strings**.
- **Empirical Failure Reproduction:**
  When whitespace padding is provided to either account name:
  * `validateAccountsSafety("Aluno ", "Aluno")` returns `{ isValid: true }`.
  * `validateAccountsSafety("aluno", " aluno")` returns `{ isValid: true }`.
  * `getConfigErrors({ ...defaultConfig, studentUser: "Aluno ", adminUser: "Aluno" })` returns `[]` (0 errors).
- **Vulnerability / Security Impact:**
  Windows SAM and PowerShell local account management (`New-LocalUser`, `Get-LocalUser`) treat `"Aluno "` and `"Aluno"` as the same principal or fail with collision errors. In `FirstRunWizard.tsx`, step 3 normalizes accounts using `.trim()`:
  ```typescript
  // FirstRunWizard.tsx line 167-168
  studentUser: studentUser.trim(),
  adminUser: adminUser.trim()
  ```
  Consequently, an operator typing `"Aluno "` for student and `"Aluno"` for admin bypasses Step 2 validation, and Step 3 assigns `studentUser = "Aluno"` and `adminUser = "Aluno"`, resulting in an identical restricted student and administrative account in direct violation of the non-equality invariant!

---

## 3. Caveats

1. **Defense-in-Depth in `FirstRunWizard.tsx`:**  
   In `FirstRunWizard.tsx` (line 174), `handleConfirmAndInitialize()` checks `if (!isConfirmed) return;`, but does not redundantly check `if (preflightData?.status === "BLOCK") return;` inside the handler body. While the UI controls (checkbox and button) are disabled in the DOM when preflight status is BLOCK, adding an explicit programmatic guard inside `handleConfirmAndInitialize` will provide defense-in-depth against synthetic DOM click events.
2. **Windows Scanner Platform Execution:**  
   Unit tests and TypeScript IPC boundaries ran on Linux. Real native scanner execution (`SystemInfoScanner`, `LocalAccountsScanner`) was verified via mock/contract parity and schema validation, as live Windows kernel APIs (P/Invoke `Advapi32.dll`, `NetUserEnum`) require Windows NT host execution.

---

## 4. Conclusion

**Verdict: DEFECT_FOUND**

1. **Feature 16 Zero-Masquerade Rule:** Fully verified and robust. Mock data is purged synchronously on toggle; live scan errors never fall back to mock data; `LAB-MICROLINS-01` is never masqueraded.
2. **Feature 14 Account Safety Invariant:** A reproducible defect was discovered in `src/lib/validation.ts` (`validateAccountsSafety` and `getConfigErrors`), where untrimmed comparisons in `localeCompare` allow identical accounts padded with whitespace to bypass non-equality validation, resulting in identical student and admin accounts being provisioned in the First-Run Wizard.

---

## 5. Verification Method

To reproduce the findings empirically:

```bash
# 1. Run all repository test suites
npm test

# 2. Run TypeScript Desktop IPC contract suite
npx tsx --test tests/desktop-ipc.test.ts

# 3. Run Tier 2 boundary cases suite
npx tsx --test tests/e2e/tier2-boundary-cases.test.ts

# 4. Run the adversarial verification suite (Feature 16 + Feature 14 boundary & defect reproduction)
npx tsx --test /home/antigravity/.gemini/jetski/brain/7970b4f709ee9a1232545b8030e0f909/scratch/adversarial-verification.ts

# 5. Direct Node.js one-liner reproducing the whitespace collision defect
npx tsx -e "
import { validateAccountsSafety, getConfigErrors } from './src/lib/validation.ts';
import { defaultConfig } from './src/lib/default-config.ts';

console.log('validateAccountsSafety Aluno  vs Aluno:', validateAccountsSafety('Aluno ', 'Aluno'));
console.log('getConfigErrors count:', getConfigErrors({ ...defaultConfig, studentUser: 'Aluno ', adminUser: 'Aluno' }).length);
"
# Expected output:
# validateAccountsSafety Aluno  vs Aluno: { isValid: true }   <-- DEFECT (should be false)
# getConfigErrors count: 0                                    <-- DEFECT (should be 1 error)
```
