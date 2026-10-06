# WinLab — Plano Mestre do SuperApp

## 1. Objetivo do produto

O WinLab deve evoluir de um configurador de scripts para uma plataforma local-first de configuração, restrição, manutenção e recuperação do Windows.

Públicos principais:

1. **Escola / laboratório**
   - computadores compartilhados;
   - alunos com permissões controladas;
   - modos Aula e Prova;
   - limpeza de perfis;
   - políticas temporárias;
   - configuração repetível por sala.

2. **Empresa**
   - estações compartilhadas;
   - frontline/kiosk;
   - application control;
   - elevação controlada;
   - manutenção e compliance;
   - configuração consistente em vários PCs.

3. **Casa**
   - perfis de criança/adolescente/convidado;
   - rotinas Estudo/Lazer/Noite;
   - limites de apps/sites;
   - controles simples para usuários não técnicos.

O produto deve continuar útil sem domínio, Intune, MDM ou servidor obrigatório.

---

## 2. Princípios obrigatórios

Toda evolução do WinLab deve obedecer:

- local-first;
- preview/dry-run antes de alterações;
- `-Apply` explícito para operações mutáveis;
- rollback;
- snapshot do estado anterior;
- escopo usuário x máquina sempre visível;
- política `NotConfigured` como estado de primeira classe;
- compatibilidade por edição/build do Windows;
- risco e impacto documentados;
- nenhuma senha armazenada;
- CI Windows antes de homologação física;
- Vercel sem auto-deploy Git;
- feature branches validadas por GitHub Actions;
- deployment manual somente em checkpoints.

---

## 3. Arquitetura alvo

### 3.1 Web Configurator

Responsável por:

- catálogo de políticas;
- busca;
- presets;
- modos;
- conflitos;
- compatibilidade;
- inventário importado;
- revisão;
- geração de config;
- geração de scripts/pacote;
- interpretação de relatórios.

Não deve possuir privilégios locais nem tentar controlar diretamente o Windows pelo navegador.

### 3.2 Policy Engine

Núcleo declarativo do produto.

Cada política deve possuir metadata semelhante a:

```ts
type PolicyDefinition = {
  id: string;
  title: string;
  description: string;
  category: string;

  scope: "user" | "device";
  states: string[];

  supportedWindows: {
    minBuild?: number;
    editions?: string[];
  };

  risk: "low" | "medium" | "high" | "critical";
  reversible: boolean;
  requiresRestart: boolean;
  requiresLogoff: boolean;

  dependencies?: string[];
  conflicts?: string[];

  apply: PolicyImplementation;
  rollback: PolicyImplementation;

  docs?: {
    technology: string;
    microsoftUrl?: string;
  };
};
```

Estados padrão:

- `notConfigured`
- `allowed`
- `blocked`

Políticas específicas podem ter estados adicionais.

### 3.3 Generated Package

Pacote portátil atual:

- `setup.ps1`
- `rollback.ps1`
- `verify.ps1`
- `audit.ps1`
- `scan-pc.ps1`
- `maintenance.ps1`
- helpers temporários;
- `config.json`;
- `README.txt`.

Evolução futura:

- package manifest;
- policy manifest;
- checksums;
- assinatura;
- relatório de compatibilidade;
- state schema versionado.

### 3.4 Windows Companion

Aplicativo nativo opcional futuro.

Responsabilidades:

- executar inventário;
- aplicar uma configuração com elevação;
- acompanhar progresso;
- exibir preflight;
- realizar rollback;
- coletar audit logs;
- comparar desired state x actual state;
- operar sem depender da web durante aplicação.

A web continua sendo o configurador e o companion passa a ser o executor privilegiado.

### 3.5 Fleet Layer

Opcional e posterior.

- grupos de máquinas;
- salas;
- desired state;
- config drift;
- compliance;
- histórico;
- aplicação remota;
- relatórios.

Não deve ser requisito para uso local.

---

## 4. Fases

# Fase 0 — Safety Foundation

**Versões alvo: 0.6–0.9**

Objetivo: tornar a aplicação previsível, recuperável e testável sem PCs físicos durante o desenvolvimento diário.

Inclui:

- preflight;
- preview;
- state.json;
- baseline AppLocker;
- baseline Registry;
- rollback seguro;
- recovery após falha parcial;
- idempotência;
- política diferida no primeiro logon;
- validação por SID;
- validação de configuração;
- CI Windows PowerShell 5.1;
- PowerShell 7 parser;
- AppLocker XML validation;
- fixtures;
- deploy manual Vercel.

Critério de saída:

- nenhuma configuração mutável sem preview;
- nenhuma aplicação sem preflight;
- reaplicação segura;
- rollback restaura baseline;
- CI Windows verde;
- um pacote pode ser considerado “candidato a homologação”.

---

# Fase 1 — Policy Engine V2

**Versão alvo: 1.0**

É a fundação do SuperApp.

Objetivos:

- tirar regras específicas de dentro de `generator.ts`;
- catálogo declarativo;
- política tri-state;
- metadata;
- compatibilidade;
- conflitos;
- dependências;
- geração modular;
- rollback modular;
- busca global.

Entregas:

- `policies/catalog`;
- schema versionado;
- registry policy adapter;
- AppLocker adapter;
- Scheduled Task adapter;
- command/powershell adapter;
- CSP/LGPO adapter quando necessário;
- UI gerada a partir do catálogo;
- política “não alterar”;
- dependency resolver;
- conflict resolver;
- readiness score.

Critério de saída:

- adicionar uma nova política simples não deve exigir editar a página principal ou o gerador monolítico;
- catálogo deve suportar pelo menos 50 políticas;
- todos os presets devem usar o mesmo engine.

---

# Fase 2 — Windows Controls Pack

**Versões alvo: 1.1–1.5**

Primeira expansão grande de controles.

## Sistema

- Settings pages;
- Control Panel;
- Run;
- Task Manager;
- CMD;
- PowerShell;
- Terminal;
- Regedit;
- Device Manager;
- Services;
- Windows Features;
- Store;
- Winget.

## Interface

- Start;
- taskbar;
- Search;
- Widgets;
- notifications;
- desktop icons;
- lock screen;
- Explorer options.

## Hardware

- USB;
- removable storage;
- camera;
- microphone;
- Bluetooth;
- printer;
- scanner;
- location;
- clipboard;
- screen capture.

## Serviços Microsoft

- OneDrive;
- Windows Update;
- Defender;
- firewall visibility;
- telemetry/privacy;
- Copilot/AI features quando suportado.

Critério de saída:

- 100+ políticas catalogadas;
- busca por nome/descrição;
- filtro por escopo/risco/Windows;
- cada controle exibe impacto e rollback.

---

# Fase 3 — Smart Application Control

**Versões alvo: 1.6–1.9**

Objetivo: transformar AppLocker em uma experiência assistida.

Entregas:

- inventário de executáveis;
- publisher rules;
- hash rules;
- path rules;
- StoreApps;
- signed/unsigned detection;
- dependências;
- audit log import;
- sugestão “permitir este executável”;
- comparação de opções de regra;
- risco de path;
- executáveis em AppData/Temp;
- allowlist inteligente;
- bloquear app específico;
- software obrigatório;
- uninstall opcional;
- elevação controlada de app sem tornar usuário admin.

UX alvo:

```text
PBIDesktop.exe
Microsoft Corporation
Assinado ✅

Tentou iniciar:
WebView2Loader.exe

Sugestão:
● Publisher rule
○ Path rule
○ Hash rule
○ Bloquear

Risco: baixo
```

---

# Fase 4 — Modes Engine

**Versão alvo: 2.0**

Objetivo: uma política pode ser permanente ou temporária.

Modos:

- Aula;
- Prova;
- Estudo;
- Lazer;
- Trabalho;
- Kiosk;
- Manutenção;
- Convidado;
- Noite.

Cada modo pode definir:

- apps;
- sites;
- USB;
- clipboard;
- screenshot;
- printer;
- webcam/mic;
- Settings;
- duração;
- início/fim;
- auto-revert.

Motor:

```text
Baseline
   ↓
Modo temporário
   ↓
timer
   ↓
auto revert
   ↓
Baseline
```

---

# Fase 5 — Shared PC & Kiosk

**Versões alvo: 2.1–2.5**

- single-app kiosk;
- multi-app kiosk;
- restricted desktop;
- Assigned Access;
- Shared PC;
- guest;
- account cleanup;
- profile cleanup;
- custom Start/taskbar;
- autologon opcional;
- kiosk recovery;
- persistent/disposable data;
- UWF quando edição suportar.

---

# Fase 6 — Verticais

**Versões alvo: 2.6–2.9**

## Escola

- presets por sala;
- Aula;
- Prova;
- liberar site/app temporariamente;
- limpeza de sessão;
- compartilhamento de PC;
- políticas por curso;
- professor mode futuro.

## Empresa

- frontline;
- workstation;
- software obrigatório;
- maintenance windows;
- elevação controlada;
- compliance;
- inventory;
- update policies.

## Casa

- criança;
- adolescente;
- convidado;
- Estudo;
- Lazer;
- Noite;
- limites por app;
- limites por horário;
- sites por rotina;
- configuração simplificada.

---

# Fase 7 — Windows Companion

**Versão alvo: 3.0**

Aplicativo instalado no Windows.

Fluxo:

```text
WinLab Web
   ↓ export config
WinLab Companion
   ↓ preflight
   ↓ snapshot
   ↓ apply
   ↓ verify
   ↓ report
```

Capacidades:

- elevated helper;
- apply/rollback;
- inventory;
- logs;
- config diff;
- health;
- desired state;
- secure package validation;
- signed packages;
- offline operation.

O companion NÃO deve depender de servidor para uso local.

---

# Fase 8 — Desired State & Compliance

**Versões alvo: 3.x**

- desired config;
- actual config;
- diff;
- drift;
- health score;
- compliance;
- “repair configuration”;
- history;
- snapshots;
- restore.

Exemplo:

```text
LAB-07
Compliance 92%

⚠ Chrome Guest Mode foi reativado
⚠ VLC não está instalado
✓ AppLocker correto
✓ USB execution bloqueado

[ Corrigir diferenças ]
```

---

# Fase 9 — Fleet / Multi-PC

**Versão alvo: 4.0**

Opcional.

- máquinas;
- salas;
- grupos;
- tags;
- configs por grupo;
- deployment queue;
- status;
- heartbeat;
- compliance;
- remote apply;
- remote rollback;
- reports.

Não transformar WinLab em MDM obrigatório.

---

## 5. UX final

Navegação alvo:

```text
Dashboard
├── Visão geral
├── Readiness
├── Alertas
└── Config drift

Perfis
├── Escola
├── Empresa
├── Casa
├── Kiosk
└── Personalizado

Contas
Aplicativos
Internet
Windows
Hardware
Arquivos
Privacidade
Personalização
Kiosk / Shared PC
Modos
Manutenção
Segurança
Recovery

Inventário
Logs
Relatórios
```

Cada política deve mostrar:

- estado;
- escopo;
- impacto;
- compatibilidade;
- risco;
- reinício/logoff;
- tecnologia;
- dependências;
- conflitos;
- rollback.

---

## 6. Readiness Score

O WinLab deve calcular prontidão antes da aplicação.

Exemplo:

```text
Readiness: 86/100

✅ Conta administrativa válida
✅ AppLocker disponível
✅ Baseline pode ser criado
✅ Políticas suportadas nesta edição

⚠ 2 aplicativos sem publisher rule
⚠ Perfil do aluno ainda não existe
❌ 1 política não suportada no Windows Pro
```

Bloqueios críticos impedem `Apply`.

---

## 7. Níveis de risco

### Low
Mudança cosmética/reversível.

### Medium
Afeta funcionalidade, mas possui rollback simples.

### High
Pode bloquear apps, hardware ou login.

### Critical
Pode comprometer recuperação, boot, rede ou administração.

Políticas Critical exigem confirmação reforçada e jamais podem ser habilitadas silenciosamente por preset.

---

## 8. Compatibilidade

O scanner deve identificar:

- Windows 10/11;
- build;
- Home/Pro/Enterprise/Education;
- arquitetura;
- AppLocker;
- UWF;
- Assigned Access;
- PowerShell;
- WinGet;
- Store;
- Edge;
- Chrome;
- domínio/Entra/local;
- recursos opcionais.

UI deve esconder ou marcar controles incompatíveis.

Nunca gerar uma configuração que “parece funcionar” quando a edição do Windows não suporta o recurso.

---

## 9. Test strategy

Pirâmide:

1. unit tests;
2. policy schema tests;
3. config generation tests;
4. snapshot tests;
5. PowerShell parser 5.1;
6. PowerShell parser 7;
7. XML validation;
8. mocked behavioral tests;
9. Windows runner integration;
10. disposable Windows VM;
11. um PC piloto real;
12. rollout gradual.

Matriz futura:

- Windows 10 Pro;
- Windows 11 Pro;
- Windows 11 Education;
- Windows 11 Enterprise.

---

## 10. Definition of Done

Uma policy/feature só é considerada pronta quando:

- schema definido;
- documentação;
- compatibilidade definida;
- scope definido;
- risco definido;
- apply;
- preview;
- rollback;
- baseline;
- testes;
- conflito/dependência;
- CI verde;
- UX;
- README;
- sem deploy automático desnecessário.

---

## 11. Não fazer agora

Até Policy Engine V2 estar pronto:

- não adicionar dezenas de toggles hardcoded;
- não criar console multi-PC;
- não criar backend obrigatório;
- não depender de cloud para aplicação local;
- não adicionar monitoramento de tela ao core;
- não tentar competir diretamente com Intune;
- não implementar recurso sem rollback definido.

---

## 12. Sequência oficial

```text
0.6 Safety & Recovery
        ↓
0.7–0.9 estabilização
        ↓
1.0 Policy Engine V2
        ↓
1.x Windows Controls + Smart App Control
        ↓
2.0 Modes
        ↓
2.x Shared PC / Kiosk / Verticais
        ↓
3.0 Windows Companion
        ↓
3.x Desired State / Compliance
        ↓
4.0 Fleet opcional
```

O objetivo não é atingir rapidamente o maior número de checkboxes.

O objetivo é construir um motor confiável que consiga suportar centenas de controles sem perder segurança, reversibilidade ou clareza.
