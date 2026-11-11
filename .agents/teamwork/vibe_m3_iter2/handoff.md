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

---

# Rodada 2 — Remediation pós-revisão independente da PR #25 (2026-11-11)

## 7. Publicação e histórico do bloqueio 403

- A PR [#25](https://github.com/krrozino/winlab/pull/25) foi publicada com sucesso como **Draft** contra `feat/winlab-desktop-foundation` (head `vibe/m3-iter2-remediation-67f764`, commits `e81c3a8` + `c14e8ff`).
- O antigo erro **403** (`Permission to krrozino/winlab.git denied` / `Resource not accessible by integration`) foi **resolvido** após a instalação/autorização do GitHub App oficial com `contents:write`. Os patches de recuperação publicados na biblioteca "WinLab M3 Iteration 2 — Recovery" foram verificados íntegros (cabeçalhos `From e81c3a8...` / `From c14e8ff...`) e os SHAs originais foram preservados no push.
- **Status dos gates:** Gate M1 PASS, Gate M2 PASS, Gate M3 Iteration 1 FAIL (defeitos do Challenger), Gate M3 Iteration 2 — **aguardando nova revisão independente** desta rodada. Nenhum gate declarado aprovado nesta rodada.

## 8. Achados da revisão independente (REQUEST CHANGES) e resolução

| # | Achado | Resolução | Evidência |
|---|--------|-----------|-----------|
| A | Estados desejados e observados misturados (`PolicyState` único no contrato TS; mapa do mock aceitava qualquer estado) | Novo tipo `PolicyDesiredState` (= `NotConfigured \| Allowed \| Blocked`) em `contracts.ts`; `PolicyItemDto.desiredState/configuredState` agora tipados com ele; mapa do mock tipado `Map<string, PolicyDesiredState>`; comparação morta com `"Applied"` removida | `contracts.ts:140`, `mock-agent.ts:142,632-633` |
| B | Fallback silencioso para `Blocked`: `Enum.TryParse` + `?? ds : Blocked` no motor; `VALID_POLICY_STATES.includes(...) ? ... : "Blocked"` no mock | Motor: `TryResolveDesiredState` estrito — rejeita nulo/vazio, numérico, padding de espaços, nomes desconhecidos/operacionais e `Allowed` (fail-closed); mock: validação item a item com falha controlada (`INVALID_POLICY_REQUEST` / `UNSUPPORTED_DESIRED_STATE`), sem mutação de estado e sem registro de transação | `TransactionEngine.cs` (`TryResolveDesiredState`, loop de handlers), `mock-agent.ts` (case `ACTION_APPLY_TRANSACTION`) |
| C | Paridade mock × motor real | Ambos rejeitam: lista ausente/nula/vazia, itens nulos/malformados, `policyId` vazio/em branco, política desconhecida e `DesiredState` inválido — sempre falha controlada, zero mutações, zero commits parciais | Testes `m3-iter2-validation.test.ts` + `AdversarialTransactionEngineTests.cs` seção 9 |
| D | Cobertura adversarial insuficiente (`Success == false` não é evidência suficiente) | Novos testes verificam **zero mutações** no registro em memória, **nenhuma transação Committed**, ausência de aplicação parcial (lista válida+inválida), estados operacionais como DesiredState, valores numéricos e strings desconhecidas | `AdversarialTransactionEngineTests.cs` seção 9 (11+3+1+1+1+2 casos), `m3-iter2-validation.test.ts` (8 testes) |
| E | `SanitizeTransactionId` dependia da semântica de separadores do SO hospedeiro (`..\..\x` não era neutralizado em Linux) | Sanitização agora independente de SO: substitui `/` e `\\` explicitamente, caracteres inválidos, caracteres de controle; rejeita `.`/`..`; + verificação de contenção `TryResolveTransactionFilePath` (full-path prefix) em `SaveTransactionAsync`/`LoadTransactionAsync` | `TransactionEngine.cs`, testes seção 8 (11 casos + teste de contenção de diretório) |
| F | Teste herdado codificava comportamento inseguro (`payload: null` → commit com 0 políticas) | Atualizado para o novo contrato: falha controlada `INVALID_POLICY_REQUEST` | `milestone3-policies.test.ts` ("adversarial unexpected inputs") |

## 9. Decisão contratual sobre `Allowed` — BLOCKED — CONTRACT DECISION REQUIRED

- O contrato define `PolicyDesiredState.Allowed` (C#: `PolicyModels.cs:28`; TS: `src/lib/policies.ts:8`), porém **nenhum handler implementa sua semântica**: `RegistryDWordPolicyHandler.Apply` e `DualBrowserPolicyHandler.Apply` tratam todo não-`Blocked` como remoção do valor (semântica de `NotConfigured`), e não existe `PolicyEffectiveState` que represente "explicitamente permitido".
- **Não há equivalência comprovada** entre `Allowed` e `NotConfigured` (deletar o valor vs. gravar explicitamente `UnconfiguredValue`/0 muda a evidência observável no registro). Suportá-lo exigiria nova semântica de handler + novo estado efetivo — decisão arquitetural fora do escopo desta rodada.
- **Comportamento adotado (fail-closed):** `Allowed` é rejeitado com falha controlada contendo `BLOCKED — CONTRACT DECISION REQUIRED` (motor e mock, paridade mantida). Nenhuma conversão automática para `NotConfigured` ou `Blocked`.

## 10. Verificação da rodada 2 (Linux, .NET 10.0.201, Node 22)

| Comando | Resultado |
|---|---|
| `dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release` | **PASS — 363/363** (rodada 1: 337; +26 novos) |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 110/110** (rodada 1: 102; +8 novos) |
| `npm run build` | **PASS** |
| `npm run build:desktop` | **PASS** (bundle offline verificado; artefatos regenerados restaurados) |

## 11. Limitações de ambiente (inalteradas)

- Validação de WPF nativo, instalador, UAC e execução real em VM Windows permanece como **gate independente** — não executada (ambiente Linux). Os testes de sanitização rodam em Linux; a semântica é independente de SO por construção, mas **nenhum teste Windows nativo foi executado**.
- Nenhum registro real, `-Apply`, deploy ou merge foi executado.

# Rodada 3 — Remediation pós-segunda revisão independente da PR #25 (2026-11-11)

## 12. Resolução dos cinco achados da segunda revisão

| # | Achado | Resolução | Evidência |
|---|--------|-----------|-----------|
| 1 | `PolicyApplyItemDto.DesiredState` inicializado com `"Blocked"`: campo omitido no JSON virava ordem válida de bloqueio | Default substituído por `string.Empty` (`TransactionModels.cs:193`); `TryResolveDesiredState` rejeita nulo/vazio/whitespace. Nenhum caminho recoloca `"Blocked"` (verificado por grep) | Testes de desserialização JSON real (`JsonSerializer.Deserialize<ApplyTransactionRequestDto>`): omitido, `null`, vazio, e lista válida+sem DesiredState → rejeitados, zero mutações, 1 registro Failed, nenhum Committed |
| 2 | `Enum.TryParse` aceitava compostos por vírgula (`"Blocked,NotConfigured"` → 1\|0 = Blocked) | Substituído por comparação explícita com `ExecutableDesiredStateNames` (`NotConfigured`, `Blocked`), `StringComparison.OrdinalIgnoreCase`; rejeita compostos, numéricos, padding, estados operacionais, desconhecidos e `Allowed`. `Enum.IsDefined` não é usado como validação | `TransactionEngine.cs` (`TryResolveDesiredState`); testes C# (3 compostos) + TS (3 compostos) — paridade |
| 3 | Nova aplicação com `TransactionId` já persistido sobrescrevia o arquivo anterior, destruindo baseline e rollback plan (**prioridade máxima**) | Collision guard em `ApplyTransactionAsync`: após sanitizar, se o arquivo do ID já existe → falha controlada sem tocar o registro anterior. Atualizações legítimas de status passam por `SaveTransactionAsync` (sem guard); rollback usa `LoadTransactionAsync` (não afetado) | Teste de colisão em 7 passos: transação válida com `Baseline.Entries`/`RollbackPlan` não vazios → requisição reutilizando o ID → falha controlada → arquivo original **byte-idêntico** (`Assert.Equal` de bytes) → baseline preservado → rollback funcional restaura estado. Colisão via sanitização (`sub/dir/escape` ≡ `sub_dir_escape`) também coberta |
| 4 | Paridade de PolicyId: mock fazia `.trim()` silencioso; catálogo C# era case-insensitive sobre o valor original | Regra única documentada: **identificadores canônicos** — padding rejeitado nos dois lados; matching case-insensitive consistente com `StringComparer.OrdinalIgnoreCase` do catálogo; mock grava `canonicalPolicy.id` | `TransactionEngine.cs` (bloco de padding), `mock-agent.ts` (sem trim silencioso, rejeita padding); testes C# (`PaddedPolicyId`) + TS (3 variantes de padding) |
| 5 | `AssertZeroMutations` verificava caminho errado para sounds (ActiveDesktop em vez de `Software\Policies\Microsoft\Windows\Personalization`) e não cobria mouse_pointers nem HKLM | Corrigido com os caminhos reais do catálogo: wallpaper → ActiveDesktop, sounds/mouse_pointers → Personalization (HKU), browser → HKLM Chrome/Edge; asserções reforçadas nos testes de lista nula/vazia (`AssertZeroMutations` + `AssertNoTransactionFiles`) | `AdversarialTransactionEngineTests.cs` (`AssertZeroMutations`, seção 7 reforçada) |

## 13. Contrato operacional do M3 para DesiredState

- **Executáveis no M3:** `NotConfigured` e `Blocked` (case-insensitive, sem padding, sem representação numérica).
- **Reservado/não-executável:** `Allowed` — retorna falha controlada `BLOCKED — CONTRACT DECISION REQUIRED`; jamais convertido silenciosamente. Estados operacionais (`Applied`, `Failed`, `Drifted`, `Pending*`, `Reverted`) **não** são intenções de aplicação e são rejeitados.
- A diferença entre estados do contrato geral (`PolicyDesiredState`) e estados aceitos como comando do M3 está codificada em `ExecutableDesiredStateNames` (motor) e `SUPPORTED_DESIRED_STATES` (mock).

## 14. Autorrevisão adversarial (Round 3)

- Grep por `Enum.TryParse`/`Enum.IsDefined` em `desktop/src`: restantes apenas para `RegistryHiveType` (infra de teste) e `RegistryValueType` (restauração interna) — nenhum parsing de entrada de usuário de DesiredState.
- Nenhum literal `"Blocked"` como default em models/engine; init do out param é `PolicyDesiredState.NotConfigured` (nunca default=Blocked).
- Paridade mock×C# conferida: padding de PolicyId e de desiredState rejeitado antes do matching; matching case-insensitive idêntico.
- Persistência parcial: falhas de validação persistem exatamente 1 registro Failed (ou nenhum, para lista nula/vazia) e nenhum Committed — verificado por `Assert.Single(GetFiles("*.json"))` / `AssertNoTransactionFiles`.
- Risco residual documentado: guard de colisão é check-then-act (`File.Exists`); colisão simultânea entre **instâncias** distintas do engine no mesmo diretório tem janela TOCTOU. Escopo M3 (single-instance, lock por instância) não exige refatoração; atomicidade de escrita (temp+Move) preservada.

## 15. Verificação da rodada 3 (Linux, .NET 10.0.201, Node 22)

| Comando | Resultado |
|---|---|
| `dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release` | **PASS — 373/373** (rodada 2: 363; +10 novos casos) |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 113/113** (rodada 2: 110; +3 novos) |
| `npm run build` | **PASS** |
| `npm run build:desktop` | **PASS** (artefatos regenerados restaurados) |

Novos testes C#: desserialização JSON com DesiredState ausente/nulo/vazio (3), lista válida+sem DesiredState sem aplicação parcial (1), enums compostos (3), PolicyId com padding (1), colisão de TransactionId com preservação byte-idêntica e rollback funcional (1), colisão via sanitização (1). Novos testes TS: enums compostos (mock/real parity), PolicyId com padding (3 variantes), desiredState com padding.

## 16. Status dos gates (inalterado)

- Gate M1 PASS, Gate M2 PASS, Gate M3 Iteration 1 FAIL (defeitos do Challenger), Gate M3 Iteration 2 — **aguardando nova revisão independente** desta rodada. Nenhum gate declarado aprovado nesta rodada. Homologação Windows (WPF/UAC/instalador) permanece gate independente não executado.

# Rodada 4 — Remediation pós-terceira revisão independente da PR #25 (2026-11-11)

## 17. Resolução dos dois bloqueadores da terceira revisão

| # | Bloqueador | Resolução | Evidência |
|---|-----------|-----------|-----------|
| 1 | Concorrência entre TransactionEngines: `File.Exists` + `SemaphoreSlim` por instância não protege contra duas instâncias no mesmo diretório com o mesmo ID sanitizado | **Reserva atômica cross-platform**: a gravação inicial do registro `Pending` usa `FileMode.CreateNew` (`O_CREAT\|O_EXCL` no POSIX, `CREATE_NEW` no NTFS) — a criação do arquivo é o ponto de exclusão, antes de qualquer captura de baseline ou mutação. A segunda instância recebe `IOException` → falha controlada com a mesma mensagem de colisão, zero mutações. Atualizações legítimas de status continuam via `SaveTransactionAsync` (temp + `Move` overwrite); rollback (`LoadTransactionAsync`) não passa pela reserva. Arquivos temporários agora têm sufixo `Guid` único por gravação (elimina conflito de temp compartilhado) | `TransactionEngine.cs` (`WriteTransactionRecordAsync`, reserva em `ApplyTransactionAsync`, `SaveTransactionAsync`); testes: `ApplyTransaction_ConcurrentEngines_SameTransactionId_ExactlyOneWins` e `ApplyTransaction_ConcurrentEngines_CollidingSanitizedIds_ExactlyOneWins` (5 iterações cada, `Task.WhenAll`, invariantes determinísticas: exatamente 1 vencedor, perdedor aplica zero mutações — XOR nos valores de registro —, registro vencedor com baseline/rollback íntegros, rollback funcional) |
| 2 | Teste enumerava recursivamente o pai do diretório de teste (= `/tmp` em Linux) → `UnauthorizedAccessException` | Raiz exclusiva por execução: `WinLab_AdvTest_Root_<guid>`/`transactions` (e `WinLab_AdvTest_Trav_<guid>` no teste de traversal); a enumeração de possíveis escapes fica restrita a essa árvore (agora `*`, não só `*.json`); limpeza recursiva da raiz exclusiva no `finally`. Nenhuma dependência de `TMPDIR` | `AdversarialTransactionEngineTests.cs` (`ApplyTransaction_AdversarialTransactionId_PersistsOnlyInsideAuthorizedDirectory`, `TransactionId_PathTraversal_MustBeSanitizedOrRejected`); suíte executada em Debian 13 padrão sem `UnauthorizedAccessException` |

## 18. Verificações complementares

- **Paridade mock × motor real (TransactionId reutilizado):** o mock agora rejeita `TransactionId` já registrado com falha controlada `TRANSACTION_ID_COLLISION`, sem aplicar políticas (mesma ordem contratual do motor: lista nula/vazia → colisão → validação de itens). Teste TS `reused TransactionId is rejected without reapplying policies (mock/real parity)`.
- **CS8601:** `Message = tx.FailureReason` (5 ocorrências) → `?? string.Empty`; o aviso desapareceu do build Release.
- **Comportamento em falhas/interrupções:** crash após a reserva deixa registro órfão que *squat* o ID (fail-safe: nada pré-existente é sobrescrito); falhas de validação após a reserva sobrescrevem legitimamente com registro `Failed`.

## 19. Autorrevisão (Round 4)

- Sem deadlock: a reserva é uma escrita curta com `FileShare.None`, liberada imediatamente; nenhum lock mantido durante a aplicação.
- Reserva órfã não permite perda/sobrescrita (CreateNew nunca sobrescreve).
- Rollback não é bloqueado por reserva (não usa CreateNew) — coberto pelos testes.
- Invariantes dos testes de concorrência valem para qualquer intercalação (não dependem de timing); 5 iterações por teste.
- **Limitação declarada:** a proteção entre processos decorre da atomicidade de `FileMode.CreateNew` no SO (NTFS e POSIX), mas os testes executados cobrem **múltiplas instâncias no mesmo processo** (Linux). Nenhum teste entre processos distintos ou em Windows foi executado — declarado como gate pendente, não como evidência.

## 20. Verificação da rodada 4 (Linux/Debian 13, .NET 10.0.201, Node 22)

| Comando | Resultado |
|---|---|
| `dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release` | **PASS — 375/375** (rodada 3: 373; +2 novos de concorrência); aviso CS8601 eliminado |
| `npm run typecheck` | **PASS** |
| `npm test` | **PASS — 114/114** (rodada 3: 113; +1 novo de paridade de colisão) |
| `npm run build` | **PASS** |
| `npm run build:desktop` | **PASS** (artefatos regenerados restaurados) |

## 21. Status dos gates (inalterado)

- Gate M1 PASS, Gate M2 PASS, Gate M3 Iteration 1 FAIL (defeitos do Challenger), Gate M3 Iteration 2 — **aguardando nova revisão independente** desta rodada. Nenhum gate declarado aprovado nesta rodada. Homologação Windows (WPF/UAC/instalador/registro real) permanece gate independente não executado.
