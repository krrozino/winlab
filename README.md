# WinLab Configurator

Gerador local-first de configurações PowerShell para computadores Windows compartilhados em escolas, laboratórios, totens e pequenas empresas.

O WinLab gera os scripts no navegador. Senhas não são armazenadas pelo projeto.

## MVP 0.6 — Safety & Recovery

Esta versão prioriza robustez antes do primeiro teste físico.

### Preview por padrão

Scripts que alteram o computador exigem confirmação explícita:

```powershell
.\setup.ps1
# mostra o plano; não altera o Windows

.\setup.ps1 -Apply
# aplica depois do preflight

.\rollback.ps1
# mostra o que seria restaurado

.\rollback.ps1 -Apply
# restaura o baseline preservado

.\maintenance.ps1
# relatório / preview

.\maintenance.ps1 -Apply
# necessário para exclusões quando Delete estiver configurado
```

### Preflight

Antes de `setup.ps1 -Apply`, o pacote valida:

- nomes diferentes para usuário restrito e administrador;
- presença dos cmdlets de contas locais;
- presença dos cmdlets do AppLocker;
- presença dos cmdlets de Scheduled Tasks;
- serviço Application Identity;
- existência das contas quando criação automática estiver desativada;
- compatibilidade com um estado WinLab já existente.

Se o preflight falhar, a aplicação é interrompida antes das políticas.

### Estado persistente

A primeira aplicação cria:

```text
C:\ProgramData\WinLab\state.json
```

O estado registra:

- perfil WinLab;
- usuário restrito;
- administrador;
- modo AppLocker;
- baseline AppLocker;
- baseline de registro;
- status Applying/Applied;
- número de aplicações;
- políticas por usuário aplicadas ou pendentes;
- timestamps de criação e aplicação.

O status `Applying` é gravado antes das mudanças principais para ajudar na recuperação após uma falha parcial.

### Baseline AppLocker

Na primeira aplicação, o WinLab salva a política AppLocker local existente:

```text
C:\ProgramData\WinLab\Backups\AppLocker-Baseline-*.xml
```

Reaplicações reutilizam o mesmo baseline original. Elas não substituem o backup pela política WinLab atual.

Se o estado apontar para um baseline que desapareceu, o setup se recusa a sobrescrevê-lo.

### Baseline de registro

Quando o perfil do usuário já existe, a primeira aplicação exporta as famílias de políticas que o WinLab poderá modificar:

- Chrome;
- Microsoft Edge;
- Personalization;
- ActiveDesktop;
- Explorer;
- RemovableStorageDevices.

Os snapshots ficam em:

```text
C:\ProgramData\WinLab\Backups\Registry-Baseline-*
```

No rollback, primeiro são retiradas as políticas gerenciadas pelo WinLab e depois as chaves anteriores são importadas novamente.

### Primeiro login da conta restrita

Uma conta local recém-criada ainda pode não possuir `NTUSER.DAT`.

Nesse caso, o WinLab não trata o setup como sucesso silencioso:

1. aplica as políticas que não dependem do hive do usuário;
2. copia temporariamente o setup para `C:\ProgramData\WinLab\setup-deferred.ps1`;
3. agenda uma tarefa para o primeiro login da conta restrita;
4. a tarefa roda como SYSTEM com `-Apply -UserPoliciesOnly`;
5. após aplicar as políticas HKCU, atualiza `state.json`;
6. remove a própria tarefa.

### Rollback seguro

O rollback não zera mais o AppLocker.

`rollback.ps1 -Apply` exige:

- `state.json` válido;
- usuário/admin compatíveis com o pacote;
- baseline AppLocker existente.

Quando as condições são atendidas:

1. restaura o AppLocker anterior;
2. remove as políticas por usuário criadas pelo WinLab;
3. restaura as chaves de registro anteriores;
4. remove a tarefa de primeiro login, se existir;
5. arquiva o estado em `C:\ProgramData\WinLab\History`;
6. preserva as contas locais.

Sem estado ou baseline válido, o rollback se recusa a executar.

## Controles de laboratório

O WinLab também inclui:

- presets Microlins, Escola, Empresa e Totem;
- importação de `config.json`;
- inventário do computador;
- detecção e sugestão de aplicativos;
- AppLocker AuditOnly/Enabled;
- Chrome: extensões, convidado, novos perfis, incógnito e gerenciador de senhas;
- Chrome/Edge: URL blocklist e allowlist;
- USB: leitura, gravação e execução separadas;
- acesso à página de contas locais;
- wallpaper, ponteiro e esquema de sons;
- liberação temporária de wallpaper;
- manutenção de perfis;
- alertas de armazenamento;
- auditoria e verificação.

## Pacote gerado

```text
setup.ps1
rollback.ps1
audit.ps1
verify.ps1
scan-pc.ps1
maintenance.ps1
liberar-wallpaper.ps1
config.json
README.txt
```

## Validação automatizada

Toda alteração precisa passar por dois grupos de checks.

### Aplicação web

Runner Linux:

- testes;
- TypeScript;
- build Next.js.

### Scripts Windows

Runner Windows descartável:

- gera scripts para todos os presets;
- gera configurações de estresse;
- parser do Windows PowerShell 5.1;
- parser do PowerShell 7;
- executa os scripts mutáveis sem `-Apply` para confirmar comportamento de preview;
- constrói o XML AppLocker com um usuário simulado;
- valida o XML gerado.

Isso reduz a necessidade de usar computadores reais durante o desenvolvimento, mas não elimina a necessidade de uma homologação física final.

## Fluxo planejado antes do primeiro PC real

```text
Testes TypeScript
      ↓
Build Next.js
      ↓
Fixtures de vários perfis
      ↓
Windows PowerShell 5.1
      ↓
PowerShell 7
      ↓
Validação AppLocker XML
      ↓
Preview Vercel
      ↓
Safety & Recovery verde
      ↓
UM PC piloto real
```

## Desenvolvimento

```bash
npm install
npm test
npm run typecheck
npm run build
npm run fixtures
npm run dev
```

## Pesquisa e roadmap

- `docs/market-research-2026-09.md`
- Issue #4 — roadmap pós-pesquisa
- Issue #6 — Safety & Recovery
