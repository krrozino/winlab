# E2E Test Infra: WinLab Desktop

## Test Philosophy
- **Opaque-box & Requirement-driven**: Derived directly from `ORIGINAL_REQUEST.md` and user specifications, independent of internal implementation artifacts.
- **Strict Verification**: No test passes based on mocks alone for privileged Windows operations. Clear separation of unit mock tests, contract tests, and physical/VM verification.
- **Methodology**: Systematic 4-tier design: Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Real-World Workload Testing.

## Test Architecture
- **Web & Engine Unit Tests**: `tsx --test tests/*.test.ts` (TypeScript / Node.js test runner)
  - Verifies policy schemas, generators, validators, mock agent, and state transformations.
- **Desktop & Contract Tests**: `dotnet test desktop/WinLab.sln` (.NET 10 xUnit)
  - Verifies C# DTO serialization, `SecurityValidator`, IPC envelopes, and mock service in .NET 10.
- **Offline Static Export Smoke Tests**: `npm run build:desktop` verification script
  - Confirms `wwwroot/desktop/index.html` exists, contains no external CDN references, and loads offline.
- **Windows Packaging Smoke Test**: `iscc desktop/packaging/winlab.iss` on Windows runner
  - Generates `WinLabSetup-0.9.0-x64.exe` and verifies uninstaller registration and shortcuts.
- **E2E Test Harness**: Node.js + C# integration test runner verifying IPC envelopes and state transitions against the contract.

## 4-Tier Test Suite Structure

### Tier 1 — Feature Coverage
Happy-path tests verifying each feature in isolation:
1. .NET 10 WPF project builds in Release mode.
2. Next.js exports static files into `desktop/src/WinLab.Desktop/wwwroot`.
3. WebView2 initializes virtual host mapping for `winlab.local` and loads `desktop/index.html`.
4. DevTools are disabled in Release builds.
5. Inbound IPC envelope with valid action dispatches and returns typed response.
6. Local accounts scanner returns list of users and flags administrators.
7. System scanner reports accurate Windows version and computer name.
8. Baseline snapshot captures registry keys and outputs valid transaction ID.
9. Wallpaper lock policy generates valid registry path and value.
10. Rollback script restores baseline and removes WinLab keys.

### Tier 2 — Boundary & Corner Cases
Boundary value and error handling tests:
1. Shell injection attempt in IPC payload (`powershell.exe -enc ...`, `cmd.exe /c ...`) is strictly blocked.
2. Unauthorized web origin (e.g. `http://evil.com`) posting to WebView2 bridge is rejected.
3. Target student account identical to administrator account triggers immediate `BLOCK`.
4. Missing `wwwroot` directory in Release mode displays a graceful fatal error dialog rather than silently navigating to localhost:3000.
5. Free disk space below 5% blocks execution with explicit storage warning.
6. Student account with no previous logon (unmounted `NTUSER.DAT`) defers policy application to scheduled task.
7. Multiple consecutive policy applies maintain idempotent state without overwriting initial baseline.
8. Corrupted or tampered `state.json` is detected and quarantined without crashing.

### Tier 3 — Cross-Feature Combinations (Pairwise Coverage)
Testing interactions between subsystems:
1. Applying multiple policies requiring mixed activation (Wallpaper requires logoff + Chrome requires browser restart + AppLocker requires immediate) produces a consolidated pending actions summary.
2. Policy apply failure halfway through a batch triggers automated rollback of previously applied policies in the same batch.
3. Startup drift scan detects externally removed registry keys while maintaining other configured policies.
4. Switching from Demo Mode to Real Mode clears all mock data and triggers real Windows scan.

### Tier 4 — Real-World Application Scenarios

| # | Scenario | Features Exercised | Expected Outcome |
|---|----------|--------------------|------------------|
| 1 | **Microlins Lab Setup** | Preset `microlins`, Aluno account creation, Wallpaper lock, CMD/PowerShell lock, Chrome incognito block, USB binary block | System restricts Aluno account while leaving Admin fully capable. Baseline created. |
| 2 | **Teacher Maintenance Rollback** | Emergency rollback of student restrictions | Administrator runs rollback via transaction ID; all original settings restored cleanly. |
| 3 | **Offline Installation & Launch** | Clean Windows 11 machine without Node.js or internet | Installer runs, installs to Program Files, creates Start Menu shortcut, opens UI offline without server. |
| 4 | **Temporary Wallpaper Release** | Temporary unlock for 60 minutes | Wallpaper unlocked for specified duration; re-locks automatically upon timer expiration or next reboot. |
| 5 | **External Drift Recovery** | Student/technician manually removes registry lock | WinLab startup detects drift, alerts admin, and offers one-click re-application with UAC elevation. |

## Coverage Goals
- Minimum 60 distinct automated test cases across TypeScript and C#.
- 100% pass rate on CI runners.
- Zero reliance on `localhost:3000` in desktop distribution builds.
