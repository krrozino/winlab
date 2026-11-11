# BRIEFING — 2026-11-10T20:25:00Z

## Mission
Survey existing CI workflows, build scripts, packaging configs, test runners, vercel.json, Next.js static export settings, and offline Windows x64 packaging requirements.

## 🔒 My Identity
- Archetype: explorer
- Roles: CI & Packaging Explorer, Investigator, Synthesizer
- Working directory: /home/antigravity/krrozino/winlab/.agents/teamwork/survey_ci_packaging_1
- Original parent: 0b7fefcdb266ef2c358377a3938321e9
- Milestone: initial-survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify source code
- Strictly verify `vercel.json` has `git.deploymentEnabled: false`
- Document all findings in handoff.md following 5-component format
- Write only to working directory: /home/antigravity/krrozino/winlab/.agents/teamwork/survey_ci_packaging_1

## Current Parent
- Conversation ID: 0b7fefcdb266ef2c358377a3938321e9
- Updated: not yet

## Investigation State
- **Explored paths**:
  - `ORIGINAL_REQUEST.md` (complete, lines 1-945)
  - `vercel.json` (verified `git.deploymentEnabled: false` intact)
  - `.github/workflows/ci.yml` (analyzed ubuntu and windows-powershell jobs; noted complete absence of .NET/WPF compilation and packaging)
  - `package.json` (Next.js 16.3.3, React 19.2.0, tsx native test runner)
  - `desktop/` (`WinLab.sln`, `WinLab.Contracts`, `WinLab.Agent.Mock`, `WinLab.Desktop`)
  - `desktop/src/WinLab.Desktop/MainWindow.xaml.cs` (WebView2 setup, `winlab.local` virtual host mapping, localhost fallback, lack of origin check on messages)
  - `desktop/src/WinLab.Desktop/app.manifest` (`asInvoker` confirmed)
  - `src/app/` (`layout.tsx`, `page.tsx`, `desktop/page.tsx` - client components, fully static-prerenderable)
  - `tests/` (`core.test.ts`, `desktop-ipc.test.ts` - 56 tests passing)
  - PR #24 review feedback from repo owner `krrozino`
  - GitHub Actions `windows-latest` capabilities for .NET 10 SDK and Inno Setup / WiX
- **Key findings**:
  1. `vercel.json` has `git.deploymentEnabled: false` intact. Default `npm run build` must preserve `.next` output for web compatibility.
  2. No `next.config.mjs` currently exists. A conditional configuration supporting `output: 'export'` with `trailingSlash: true` is necessary so `/desktop/index.html` is generated to match `MainWindow.xaml.cs` (`https://winlab.local/desktop/index.html`).
  3. CI workflow completely lacks .NET/WPF build, test, and packaging jobs.
  4. .NET 8 support ended on 10/11/2026; upgrade to .NET 10 LTS (`net10.0-windows` and `net10.0`) is required.
  5. 0 C# tests exist; a C# test project (`WinLab.Tests`) targeting .NET 10 is needed for CI.
  6. Inno Setup is the optimal packaging tool for M1 offline installer (`WinLabSetup-x64.exe`), with self-contained .NET 10 publishing (`--self-contained true -p:PublishSingleFile=true`), installing to Program Files with admin privileges, Start Menu shortcuts, WebView2 detection, and no SDK requirement on target machines. WiX v4 can be added as a secondary target for GPO deployment.
- **Unexplored areas**: None within the survey scope.

## Key Decisions Made
- Confirmed Inno Setup + `dotnet publish --self-contained` as recommended M1 packaging strategy.
- Confirmed `trailingSlash: true` is required for Next.js static export to match WebView2 virtual host routing.
- Confirmed `vercel.json` compliance.

## Artifact Index
- DISPATCH.md — Dispatch log
- progress.md — Liveness heartbeat and milestone tracking
- BRIEFING.md — Persistent context
- handoff.md — Final investigation report
