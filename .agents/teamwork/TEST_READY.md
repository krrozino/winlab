# E2E Test Suite Ready

## Test Runner
- Command: `npm test` (or `npx tsx --test tests/e2e/*.test.ts`)
- Expected: all tests pass with exit code 0
- Typecheck: `npm run typecheck` passes with exit code 0

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 10 | .NET LTS, offline wwwroot, virtual host, DevTools guard, IPC roundtrip, scanner SIDs, system info, baseline UUID, wallpaper policy, rollback |
| 2. Boundary & Corner | 8 | Shell injection blocking, unauthorized origin rejection, admin/student collision, missing wwwroot fatal error, low storage, unmounted NTUSER.DAT, idempotency, manifest tampering |
| 3. Cross-Feature | 4 | Pending actions consolidation, automated failure rollback, startup drift detection, Demo vs Real mode toggle |
| 4. Real-World Application | 5 | Microlins Lab workstation setup, teacher emergency rollback, offline installation & launch, temporary wallpaper unlock lifecycle, external drift recovery |
| **Total E2E Tests** | **27** | **85 total repository tests (58 unit + 27 E2E)** |

## Feature Checklist
| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---------|:------:|:------:|:------:|:------:|
| .NET 10 LTS Desktop | ✓ | - | - | ✓ |
| Offline Static Bundle | ✓ | ✓ | - | ✓ |
| WebView2 Virtual Host | ✓ | ✓ | - | ✓ |
| WebView2 Origin & DevTools Security | ✓ | ✓ | - | - |
| Bi-directional Typed IPC Bridge | ✓ | ✓ | - | - |
| Shell Injection Protection | - | ✓ | - | - |
| Local Accounts & Admin Protection | ✓ | ✓ | - | ✓ |
| Baseline & Snapshot Capture | ✓ | ✓ | ✓ | ✓ |
| Policy Execution & Verification | ✓ | - | ✓ | ✓ |
| Automated Failure Rollback | - | - | ✓ | ✓ |
| Consolidated Pending Actions | - | - | ✓ | - |
| Startup Drift Detection | - | - | ✓ | ✓ |
| Temporary Unlock Lifecycle | - | - | - | ✓ |
| Demo vs Real Mode Toggle | - | - | ✓ | - |
