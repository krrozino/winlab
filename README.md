# WinLab Configurator

Gerador local-first de configurações PowerShell para Windows compartilhados em escolas, laboratórios, totens e pequenas empresas.

O WinLab gera os scripts no navegador. Senhas não são armazenadas pelo projeto.

## MVP 0.5

### Navegação controlada

Chrome e Microsoft Edge podem operar em três modos:

- sem restrição de URL;
- bloquear apenas sites definidos;
- permitir somente sites definidos.

O WinLab usa as políticas nativas `URLBlocklist` e `URLAllowlist` somente para o usuário restrito.

### USB granular

O usuário restrito pode ter separadamente:

- leitura de pendrive bloqueada;
- gravação bloqueada;
- execução de programas pelo USB bloqueada.

Leitura/gravação usam políticas de Removable Storage por usuário. A execução usa AppLocker com os caminhos nativos `%HOT%` e `%REMOVABLE%`.

O preset padrão continua permitindo documentos em pendrive, mas bloqueia execução de programas pelo USB.

### Manutenção

O pacote agora inclui `maintenance.ps1`.

Ele:

- mostra espaço livre do disco do sistema;
- alerta abaixo de um limite configurável;
- identifica perfis sem uso há X dias;
- protege os perfis do usuário restrito e administrador configurados;
- ignora perfis especiais e carregados;
- em `ReportOnly`, apenas relata;
- em `Delete`, remove os candidatos e grava relatório em `C:\ProgramData\WinLab\maintenance-latest.json`.

O padrão é **ReportOnly**.

### Inventário

`scan-pc.ps1` também passou a registrar:

- tamanho do disco do sistema;
- espaço livre;
- percentual livre.

## Funcionalidades acumuladas

- presets Microlins, Escola, Empresa e Totem;
- importação de `config.json`;
- inventário da máquina;
- detecção de apps conhecidos;
- sugestões de allowlist;
- AppLocker AuditOnly/Enabled;
- políticas por usuário;
- admin fora das políticas do aluno;
- Chrome/Edge URL blocklist e allowlist;
- USB leitura/gravação/execução;
- conta local: acesso à página Outros usuários;
- Chrome: extensões, convidado, perfis, incógnito e senhas;
- wallpaper, ponteiro e sons;
- liberação temporária de wallpaper;
- manutenção de perfis;
- alerta de armazenamento;
- rollback;
- auditoria;
- testes automatizados e CI;
- validação dos scripts gerados em runner Windows com PowerShell 5.1 e PowerShell 7;
- montagem e validação automática do XML AppLocker em CI.

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

## Fluxo recomendado

```text
scan-pc.ps1
   ↓
Importar inventário
   ↓
Configurar WinLab
   ↓
Gerar AuditOnly
   ↓
verify.ps1
   ↓
setup.ps1
   ↓
Uso real
   ↓
audit.ps1
   ↓
maintenance.ps1
   ↓
Ajustes
   ↓
Enabled
```

## Segurança

### Preview por padrão

Os scripts que alteram o Windows exigem confirmação explícita:

```powershell
.\setup.ps1
# apenas mostra o plano

.\setup.ps1 -Apply
# aplica a configuração

.\rollback.ps1
# apenas mostra o que seria removido

.\rollback.ps1 -Apply
# executa o rollback

.\maintenance.ps1
# relatório/previsão

.\maintenance.ps1 -Apply
# só é necessário para permitir exclusões quando o modo Delete estiver configurado
```

- teste em PC piloto;
- mantenha uma conta administrativa funcional;
- use AuditOnly antes de Enabled;
- limpeza de perfis nasce em ReportOnly;
- o rollback não remove mais toda a árvore de políticas do Chrome: remove apenas valores/subchaves gerenciados pelo WinLab;
- URLs e USB são configurados para o usuário restrito sempre que a política do Windows suporta escopo por usuário.

## Desenvolvimento

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

A CI executa testes, typecheck e build em pull requests para `main`.

## Pesquisa e roadmap

- `docs/market-research-2026-09.md`
- Issue #4: roadmap pós-pesquisa
