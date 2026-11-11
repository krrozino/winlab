# WinLab — Checkpoint de Desenvolvimento e Pausa Controlada

- **Data do Checkpoint:** 11 de novembro de 2026 (01:20 UTC / 10/11/2026 17:20 PST)
- **Branch de Trabalho:** `feat/winlab-desktop-foundation`
- **SHA do Commit de Código (M1 + M2 + M3 Iter 1):** `e20ac87a1067ca1619773688894ebbb7a0c1b4ae` (`e20ac87`)
- **SHA do Commit de Documentação e Estado Teamwork (Pai Imediato):** `157e29db6a58e32677138112b6b77258c88e609d` (`157e29d`)
- **Estado da Sincronização com o GitHub:** 100% Sincronizado em `origin/feat/winlab-desktop-foundation`
- **Pull Request Draft:** [PR #24](https://github.com/krrozino/winlab/pull/24) (`https://github.com/krrozino/winlab/pull/24`)
- **Trava de Deploy Vercel:** `vercel.json` com `"deploymentEnabled": false` preservada intacta (0 diffs).
- **Backup Local Compactado:** `/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p/5b58788a-d24e-4782-a615-98284886bdab/winlab-workspace-checkpoint.tar.gz` e `/tmp/winlab-backup-2026-11-10/winlab-workspace-checkpoint.tar.gz`

---

## 1. Estado Geral e Resumo Executivo

O desenvolvimento do **WinLab Desktop** avançou de uma fundação demonstrativa inicial para uma arquitetura funcional em **.NET 10 LTS + WPF + WebView2** com empacotamento offline (`wwwroot`), helper privilegiado sob demanda (`WinLab.Executor`), varredores reais do Windows, assistente de primeira configuração e o primeiro motor transacional de políticas com captura de baseline e rollback reverso (LIFO).

Devido ao atingimento do limite de uso (quota) da sessão do Antigravity durante a transição para a Iteração 2 do **Marco M3**, todas as atividades ativas de subagentes e crons foram encerradas de forma controlada e todo o código-fonte, suítes de testes e relatórios de auditoria de `.agents/teamwork/` foram preservados integralmente na branch `feat/winlab-desktop-foundation`.

---

## 2. Classificação e Status dos Marcos (Baseado nos Arquivos Reais)

| Marco | Status Real | Resumo do que está Concluído vs. Pendente |
| :--- | :--- | :--- |
| **M1 — Fundação Desktop, .NET 10, WebView2 e Instalador** | **Concluído (100%)** | **Concluído:** Migração de todos os `.csproj` para `net10.0` / `net10.0-windows`; exportação estática offline do Next.js para `desktop/src/WinLab.Desktop/wwwroot` mapeada em `https://winlab.local/`; endurecimento do WebView2 (bloqueio de navegação externa, DevTools desativadas em Release, isolamento de `WebView2Data`); paridade de contratos IPC C#/TS; script de instalador Inno Setup (`desktop/packaging/winlab.iss`); job nativo Windows na CI (`.github/workflows/ci.yml`).<br>**Pendente:** Nada. Aprovado por unanimidade no Gate M1 (Iteração 4). |
| **M2 — Inventário Real, Autenticação e Executor** | **Concluído (100%)** | **Concluído:** Scanners reais em `WinLab.Contracts/Scanning/` (`SystemInfoScanner.cs`, `LocalAccountsScanner.cs`, `InstalledSoftwareScanner.cs`, `WindowsScanner.cs`); helper elevado sob demanda `WinLab.Executor` (`ExecutorHost.cs`, `Program.cs`, `app.manifest` com `requireAdministrator`, enquadramento binário `PipeFraming.cs`, handshake com token efêmero de 256 bits e verificação de PID em `HandshakeModels.cs`); `FirstRunWizard.tsx` com imunidade administrativa e presets Microlins; `DemoBanner.tsx` com purga estrita de dados fictícios no modo real.<br>**Pendente:** Nada. Aprovado por unanimidade no Gate M2 (Iteração 2). |
| **M3 — Primeiro Motor Funcional de Políticas** | **Em andamento (~90% — Iteração 1 concluída, Iteração 2 pendente)** | **Concluído (Iteração 1):** Catálogo declarativo (`PolicyCatalog.cs` e `src/lib/policies.ts`) com 5 políticas reais de baixo risco (`personalization.wallpaper`, `personalization.sounds`, `personalization.mouse_pointers`, `browser.incognito_lock`, `browser.guest_mode_lock`); handlers (`RegistryDWordPolicyHandler.cs`, `DualBrowserPolicyHandler.cs`); abstração de registro (`IRegistryService.cs`, `WindowsRegistryService.cs`, `WindowsUserHiveManager.cs`, `InMemoryRegistryService.cs`); motor de transações de 7 estados e rollback reverso (`TransactionEngine.cs`, `BaselineSnapshotManager.cs`).<br>**Pendente (Iteração 2):** Corrigir os 3 defeitos de borda apontados pelo Challenger 1 em `.agents/teamwork/challenger_m3_1/handoff.md` e 1 erro de tipagem em `src/desktop/mock-agent.ts(537,11)`. |
| **M4 — Persistência, Estados Verificados e Reinicialização** | **Parcial (Fundação de contratos pronta, motor de drift pendente)** | **Concluído parcial:** Os contratos em `PolicyModels.cs` e `src/desktop/contracts.ts` já suportam os três estados separados (`desiredState`, `configuredState`, `effectiveState`) e estados de pendência (`PendingLogoff`, `PendingAppRestart`, `PendingReboot`, `PendingFirstLogon`). Testes de cenários em `tests/e2e/tier3-cross-feature.test.ts` já validam a estrutura.<br>**Pendente:** Revalidação automática ao iniciar o app real, painel consolidado de pendências de reboot/logoff na UI e ações de resolução de divergência (*drift*). |
| **M5 — Expansão do Catálogo Microlins** | **Não iniciado** | Aguardando fechamento do Gate M3 e implementação do M4. Especificação completa já minerada em `.agents/teamwork/spec_miner_policies_1/handoff.md`. |
| **M6 — Versão Candidata para Uso Real (RC)** | **Não iniciado** | Depende da conclusão de M4 e M5 e bateria de testes de instalação em VM Windows cliente limpa. |

---

## 3. Detalhamento da Implementação e Arquitetura Atual

### 3.1 Funcionalidades Efetivamente Implementadas
1. **Solução .NET 10 LTS (`desktop/WinLab.sln`) com 5 projetos:**
   - `WinLab.Contracts` (`net10.0`): DTOs IPC, validadores de segurança SAM (`SecurityValidator.cs`), protocolo de pipe binário (`PipeFraming.cs`), scanners do Windows (`Scanning/*`), catálogo e handlers de políticas (`Policies/*`), abstração de registro (`Registry/*`) e motor transacional (`Transactions/*`).
   - `WinLab.Agent.Mock` (`net10.0`): Agente simulado em memória para Modo Demonstração e testes de contrato.
   - `WinLab.Desktop` (`net10.0-windows`): Aplicativo WPF não privilegiado (`asInvoker`), hospedando WebView2 com mapeamento virtual `winlab.local` para `wwwroot`, `DispatcherAgentService.cs`, `RealAgentService.cs` e `ElevatedExecutorClient.cs`.
   - `WinLab.Executor` (`net10.0-windows`): Processo helper elevado sob demanda (`requireAdministrator`), servidor Named Pipe com DACL restrita (`BUILTIN\Administrators` e `SYSTEM`), verificação de PID e execução real no registro (`WindowsRegistryService.cs`, `WindowsUserHiveManager.cs`).
   - `WinLab.Tests` (`net10.0`): Suíte com **330 testes xUnit** cobrindo contratos, segurança adversarial, framing binário, scanners, catálogo de políticas, snapshots de baseline e motor de transações.
2. **Frontend e Configurador (`src/`):**
   - **WinLab Web 0.9 (`src/app/page.tsx`):** Intacto e funcional.
   - **WinLab Desktop UI (`src/app/desktop/page.tsx`):** Painel administrativo local integrado com `FirstRunWizard.tsx`, `DemoBanner.tsx` e `ipc-bridge.ts`.
   - **Catálogo e Contratos TS (`src/lib/policies.ts`, `src/desktop/contracts.ts`, `src/desktop/mock-agent.ts`):** Paridade com os modelos C#.
3. **Empacotamento e Distribuição:**
   - `next.config.mjs` e `scripts/verify-desktop-export.mjs`: Geram e verificam o bundle estático offline em `desktop/src/WinLab.Desktop/wwwroot` garantindo ausência de links externos/CDNs.
   - `desktop/packaging/winlab.iss`: Script Inno Setup para gerar o instalador `WinLab-Desktop-Setup-0.9.0-TestBuild.exe` (claramente identificado como build de teste não assinada).

### 3.2 Funcionalidades Simuladas vs. Reais
- **Modo Demonstração (`DemoMode`):** Utiliza `MockAgentService` / `MockDesktopAgent` e `InMemoryRegistryService` com dados estáticos da estação fictícia `LAB-MICROLINS-01`, exibindo o banner persistente `DemoBanner.tsx`.
- **Modo Computador Real (`RealMode`):** Aciona `RealAgentService`, que consulta o sistema real via `WindowsScanner` e despacha transações de políticas ao `WinLab.Executor` via Named Pipe autenticado. Em caso de falha na leitura real, aplica a regra de *zero-masquerade* (nunca faz fallback silencioso para dados fictícios).

### 3.3 Funcionalidades Ainda Incompletas (No Momento da Pausa)
1. **Remediação da Iteração 2 do M3 (4 itens pontuais):**
   - **Defeito 1 (Crítico — Challenger M3):** Em `MockUserHiveManager.IsUserAdministrator` (`InMemoryRegistryService.cs`), `WindowsUserHiveManager.IsUserAdministrator` (`WindowsUserHiveManager.cs`) e `TransactionEngine.cs`, fazer `.Trim()` no `TargetUserSid` antes de verificar `_adminSids.Contains`, `Equals("S-1-5-32-544")` e `EndsWith("-500")`.
   - **Defeito 2 (Alto — Challenger M3):** Em `TransactionEngine.cs`, validar também `request.TargetUserName?.Trim()` contra `SecurityValidator.ValidateTargetNotAdministrator` para impedir que uma transação com `TargetUserSid = null` e `TargetUserName = "Administrator"` caia no fallback `HKEY_CURRENT_USER` da sessão administrativa.
   - **Defeito 3 (Alto — Challenger M3):** Em `TransactionEngine.cs`, sanitizar `TransactionId` (`Path.GetFileName` + remoção de caracteres inválidos) antes de `Path.Combine(_transactionDir, $"{tx.TransactionId}.json")` para bloquear *directory traversal* (`../`). Também tratar `request.Policies == null` sem lançar `NullReferenceException`.
   - **Ajuste de Tipagem TS:** Em `src/desktop/mock-agent.ts` (linha 537/565), tipar explicitamente `raw` como `PolicyState` (em vez de `string` genérico) para eliminar o erro do `npm run typecheck`. Note que `AdversarialTransactionEngineTests.cs` contém os testes escritos pelo Challenger; verificar se há asserções pendentes que devem passar assim que os 3 defeitos acima forem corrigidos.

---

## 4. Qualidade, Compilação e Testes Confirmados

### Testes Executados Diretamente Antes de Salvar Este Checkpoint:
1. **Testes C# (`.NET 10.0.201` — `dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release`):**
   - **Resultado:** `Passed! - Failed: 0, Passed: 330, Skipped: 0, Total: 330` (Duração: ~1s).
   - **Compilação C#:** `WinLab.Contracts`, `WinLab.Agent.Mock`, `WinLab.Desktop`, `WinLab.Executor` e `WinLab.Tests` compilam com **0 erros e 0 warnings**.
2. **Testes TypeScript (`npm test`):**
   - **Resultado:** `pass: 102, fail: 0, skipped: 0, total: 102` (incluindo os 47 testes core originais, testes de IPC, testes de wizard/modo, testes de políticas M3 e as 4 camadas E2E em `tests/e2e/`).
3. **Typecheck TypeScript (`npm run typecheck`):**
   - **Resultado atual:** Falha com 1 erro de anotação de tipo em `src/desktop/mock-agent.ts(537,11)` (`Type 'string' is not assignable to type 'PolicyState'`), introduzido no final da Iteração 1 do M3 e ainda não corrigido porque a pausa ocorreu antes da Iteração 2.
4. **Limitações de Homologação Física:**
   - Todos os testes foram executados no ambiente Linux de desenvolvimento e validados contra o SDK `.NET 10.0.201` (com `EnableWindowsTargeting=true`). A validação em máquina real ou VM Windows 10/11 com UAC interativo e instalador Inno Setup será executada na CI Windows (`windows-latest`) e na homologação física.

---

## 5. Preservação do Estado do Teamwork (`.agents/teamwork/`)

Todo o diretório `.agents/teamwork/` (~1.3 MB, 112 arquivos markdown, zero segredos ou binários) foi versionado na branch para garantir que o próximo orquestrador ou desenvolvedor tenha o contexto completo sem gastar créditos redescobrindo o repositório:
- `.agents/teamwork/ORIGINAL_REQUEST.md` — Prompt original da missão.
- `.agents/teamwork/PROJECT.md` — Inventário completo de 60 funcionalidades (M1 a M6).
- `.agents/teamwork/TEST_INFRA.md` e `TEST_READY.md` — Arquitetura das 4 camadas de testes E2E.
- `.agents/teamwork/orchestrator/BRIEFING.md`, `progress.md`, `GATE_STATUS.md`, `handoff.md` — Memória do orquestrador (Gen 2) e histórico de todos os Gates (M1 Iter 1–4, M2 Iter 1–2, M3 Iter 1).
- `.agents/teamwork/spec_miner_policies_1/handoff.md` — Especificação técnica detalhada de todas as políticas das seções 8.1 a 8.9.
- `.agents/teamwork/challenger_m3_1/handoff.md` — Relatório exato dos 3 defeitos de borda da Iteração 1 do M3 com o código de correção recomendado nas seções 4.1 a 4.3.

---

## 6. Próximos Passos — Como Retomar na Próxima Sessão

### Comandos para Restaurar e Verificar o Ambiente:
```bash
# 1. Verificar branch e estado do Git
git checkout feat/winlab-desktop-foundation
git status

# 2. Verificar instalação do .NET 10 SDK (se em nova VM Linux do Antigravity)
export PATH="$HOME/.dotnet:$PATH"
dotnet --version || (curl -sSL https://dot.net/v1/dotnet-install.sh | bash -s -- --channel 10.0)

# 3. Instalar dependências Node (se node_modules não estiver presente)
npm install --no-audit --no-fund

# 4. Rodar suítes de testes atuais
dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj -c Release
npm test
```

### Primeira Tarefa Recomendada na Retomada (Fechamento do M3 — Iteração 2):
1. Ler `.agents/teamwork/challenger_m3_1/handoff.md` e `.agents/teamwork/orchestrator/progress.md`.
2. Aplicar as 4 correções rápidas da Iteração 2 do M3:
   - Sanitizar `.Trim()` em SIDs e validar `TargetUserName` contra contas administrativas em `TransactionEngine.cs`, `InMemoryRegistryService.cs` e `WindowsUserHiveManager.cs`.
   - Sanitizar `TransactionId` contra *path traversal* e proteger contra `request.Policies == null` em `TransactionEngine.cs`.
   - Corrigir a tipagem de `desiredState` / `configuredState` em `src/desktop/mock-agent.ts:537`.
   - Descomentar/ativar as asserções de regressão correspondentes em `AdversarialTransactionEngineTests.cs`.
3. Executar `npm run typecheck`, `npm test`, `npm run build:desktop` e `dotnet test -c Release`.
4. Declarar o **Marco M3 Concluído** e iniciar o **Marco M4 (Persistência, Detecção de Drift na Inicialização e Painel de Reinicialização/Logoff)**.
