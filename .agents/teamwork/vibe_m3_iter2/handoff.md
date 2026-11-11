# Handoff — M3 Iteration 2 Remediation (Vibe Code / Mistral)

**Branch:** `vibe/m3-iter2-remediation-67f764` (derivada de `feat/winlab-desktop-foundation` @ `0d67237`)
**Commit:** `e81c3a8` — `fix(desktop): close M3 iteration 2 remediation gaps (null policies guard, TS PolicyState typing, adversarial regression tests)`
**Data:** 2026-11-11
**Ambiente:** Linux (Debian 13), .NET SDK 10.0.201 (`DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1`), Node 22

---

## 1. Diagnóstico dos 6 itens pendentes do M3

| # | Item | Status | Evidência |
|---|------|--------|-----------|
| 1 | SIDs administrativos com espaços/tabs/caracteres de controle | **RESOLVIDO (pré-existente, não reapplicado)** | `InMemoryRegistryService.cs:322-331` (`MockUserHiveManager`) e `WindowsUserHiveManager.cs:102-134` fazem `.Trim()` antes de todas as verificações; `TransactionEngine.cs:114-117` valida via `SecurityValidator.ValidateTargetNotAdministrator` (que trima internamente, `SecurityValidator.cs:259`). Coberto por `AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations` (5 variações padded passando). |
| 2 | Nomes Administrator/Administrador com SID ausente/vazio | **RESOLVIDO (pré-existente)** | `TransactionEngine.cs:115-117` valida `TargetUserName` e `TargetUserSid` via `SecurityValidator` + `_hiveManager.IsUserAdministrator`; hive managers também rejeitam nomes administrativos. Coberto por `AdministratorImmunity_AdminUserNameWithEmptyOrNullSid_MustRejectWithZeroMutations` (5 variações). |
| 3 | Directory traversal em `TransactionId` | **RESOLVIDO (pré-existente)** | `TransactionEngine.SanitizeTransactionId` (`Path.GetFileName` + remoção de caracteres inválidos) aplicado em `SaveTransactionAsync`, `LoadTransactionAsync` e no início de `ApplyTransactionAsync`. Coberto por `TransactionId_PathTraversal_MustBeSanitizedOrRejected` + nova theory de hardening. |
| 4 | Listas de políticas nulas ou vazias | **PENDENTE → CORRIGIDO nesta branch** | `ApplyTransactionRequestDto.Policies` inicializa com `new()`, mas desserialização JSON com `"policies": null` produz `null`, causando NRE no `foreach` do motor. Correção: guarda `request.Policies == null \|\| Count == 0` → `TransactionStatus.Failed` controlado (`TransactionEngine.cs:89-99`). |
| 5 | Tipagem de `PolicyState` em `src/desktop/mock-agent.ts` | **PENDENTE → CORRIGIDO nesta branch** | `npm run typecheck` falhava em `mock-agent.ts(537,11)` (`string` não atribuível a `PolicyState`). Correção: `Map<string, PolicyState>`, `raw/effective/current: PolicyState`, allowlist `VALID_POLICY_STATES` validando entrada de IPC antes de gravar no mapa (linha ~327). |
| 6 | Testes adversariais de imunidade, transações, persistência e rollback | **PARCIAL → COMPLETADO nesta branch** | Os 20 vetores do Challenger já estavam implementados e passando em `AdversarialTransactionEngineTests.cs`. Adicionados: `ApplyTransaction_NullPolicies_MustFailGracefullyWithoutException`, `ApplyTransaction_EmptyPolicies_MustFailGracefullyWithoutCommit` e `SanitizeTransactionId_AdversarialInputs_MustNeverEscapeTransactionDirectory` (5 casos). |

**Regressões encontradas:** nenhuma. Os 3 defeitos do Challenger 1 já haviam sido corrigidos na branch antes deste trabalho (o checkpoint estava desatualizado, como previsto na missão).

## 2. Arquivos modificados

1. `desktop/src/WinLab.Contracts/Transactions/TransactionEngine.cs` — guarda de lista nula/vazia antes do loop de handlers (falha controlada, sem NRE, sem commit vazio).
2. `src/desktop/mock-agent.ts` — tipagem estrita `PolicyState` no mapa e nos campos do resumo; validação de `desiredState` vindo de IPC contra allowlist antes de gravar estado.
3. `desktop/tests/WinLab.Tests/AdversarialTransactionEngineTests.cs` — 7 novos casos de regressão (2 Facts + 1 Theory com 5 InlineData).

## 3. Verificação executada (Linux)

| Comando | Resultado |
|---|---|
| `dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release` | **PASS — 337/337** (antes: 330/330) |
| `npm run typecheck` | **PASS** (antes: FAIL 1 erro em mock-agent.ts:537) |
| `npm test` | **PASS — 102/102** |
| `npm run build` | **PASS** (rotas `/` e `/desktop` estáticas) |
| `npm run build:desktop` | **PASS** — bundle offline verificado (`verify-desktop-export.mjs` OK; artefatos de build restaurados para não poluir o diff) |

## 4. Não executado (impedimentos)

- **Build WPF nativo / instalador / UAC / execução real:** o ambiente é Linux. `WinLab.Desktop` e `WinLab.Executor` (`net10.0-windows`) compilam via `EnableWindowsTargeting` apenas como dependências dos testes; homologação real requer VM Windows. Nenhum resultado de Windows foi simulado.
- **Registro Windows / `-Apply` / deploy:** não executados, conforme restrições da missão.

## 5. Bloqueio de entrega

- `git push` → **403 "Permission to krrozino/winlab.git denied to krrozino"**; criação de branch via API GitHub App → **403 "Resource not accessible by integration"**. O token da integração GitHub não possui `contents:write` neste repositório.
- A Draft PR contra `feat/winlab-desktop-foundation` (nunca `main`) não pôde ser criada por falta de permissão de escrita — não é limitação de seleção de base.
- **Para liberar:** conceder permissão *Contents: Read and write* ao GitHub App (Settings → Integrations → GitHub App) ou fazer push manual do commit `e81c3a8` a partir de uma cópia local da branch `vibe/m3-iter2-remediation-67f764`.

## 6. Próximos passos

1. Push da branch e abertura da Draft PR com base `feat/winlab-desktop-foundation`.
2. Gate M3 Iteration 2 (Reviewers/Challengers/Auditor) sobre esta branch.
3. Declarar M3 concluído e iniciar M4 (drift detection, painel de reboot/logoff) — **não iniciado nesta tarefa**.
