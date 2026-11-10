# ADR 001: Arquitetura do WinLab Desktop (WPF/.NET + WebView2 vs Tauri) e Modelo de Ameaças

- **Status:** Proposto / Aprovado para Fundação
- **Data:** 10 de novembro de 2026
- **Autores:** Antigravity / Time WinLab
- **Contexto:** Issue [#15](https://github.com/krrozino/winlab/issues/15) (WinLab Windows Companion), Issue [#23](https://github.com/krrozino/winlab/issues/23) (Piloto Físico 0.9), Issue [#9](https://github.com/krrozino/winlab/issues/9) (Policy Engine V2)

---

## 1. Contexto e Motivação

O **WinLab Configurator** 0.9 opera como um gerador web local-first de scripts PowerShell e pacotes ZIP. Embora essa abordagem seja excelente para gerar configurações portáteis sem dependências de infraestrutura, escolas (como a rede de laboratórios Microlins), totens e estações corporativas demandam uma experiência integrada:

1. **Aplicação Local Sem Gerar ZIPs Manualmente:** Capacidade de ligar/desligar políticas por toggles na interface local do próprio PC.
2. **Offline-First Absoluto:** O computador do laboratório não deve depender de conexão com a internet, servidor Next.js em execução em segundo plano ou endpoints da Vercel.
3. **Preservação do WinLab Web:** O site atual continua ativo como catálogo, documentação e gerador portátil.
4. **Segurança por Design e Separação de Privilégios:** A interface gráfica não pode rodar com elevação administrativa permanente, impedindo que alunos em estações compartilhadas explorem brechas da UI para escalada de privilégios.
5. **Rollback e Transacionalidade:** Qualquer alteração no Windows deve ser precedida de diagnóstico (preflight), snapshot do estado original, preview/diff, verificação pós-aplicação e rollback imediato se necessário.

---

## 2. Comparativo Técnico de Stack: WPF/.NET + WebView2 versus Tauri 2.x

Para viabilizar uma aplicação instalável no Windows que reaproveite componentes da interface React existente, avaliamos as duas opções principais:

### Opção A: WPF / .NET 8/9 + WebView2
- **Shell:** Aplicativo C# (.NET 8/9 LTS) hospedando o controle nativo `Microsoft.Web.WebView2.Wpf`.
- **UI:** Pacote SPA React/TypeScript estático pré-compilado, servido localmente via mapeamento de domínio virtual (`CoreWebView2.SetVirtualHostNameToFolderMapping("winlab.local", "assets", ...)`), sem servidor HTTP/Next.js.
- **Agente de Execução:** Serviço Windows nativo (`BackgroundService` / `ServiceBase`) em C# com Named Pipes protegidos por DACL Win32.

### Opção B: Tauri 2.x (Rust + WebView2)
- **Shell:** Launcher binário em Rust utilizando os crates `tao` e `wry` (que também inicializam o WebView2 no Windows).
- **UI:** Mesmos arquivos estáticos React/TypeScript (`frontendDist`).
- **Agente de Execução:** Binário auxiliar em Rust rodando como serviço Windows ou processo elevado via IPC customizado.

### Matriz Comparativa

| Critério | WPF / .NET 8/9 + WebView2 | Tauri 2.x (Rust + WebView2) | Veredito Técnico |
| :--- | :--- | :--- | :--- |
| **Integração com Subssistemas Windows** | **Nativa e Imediata.** O .NET possui suporte de primeira classe a Windows Services, Named Pipes (`System.IO.Pipes`), ACLs/DACLs (`PipeSecurity`), Token Impersonation (`WindowsIdentity`), UAC (`runas`), WMI/CIM, EventLog e Registro (`RegistryKey`). | **Requer FFI / Crates Win32.** Operações de baixo nível (DACLs de Named Pipes, SID checking, serviços Windows) dependem de FFI unsafe via crates `windows` / `windows-sys` e wrappers manuais. | **WPF/.NET vence com ampla folga.** |
| **Alinhamento do Ecossistema** | O WinLab gerencia Windows (AppLocker, Contas Locais, Políticas de Grupo, Registro). Administradores de TI, escolas e técnicos de laboratório dominam PowerShell, C# e ferramentas .NET. | Rust introduz uma barreira severa de manutenção para equipes de infraestrutura Windows corporativa/educacional. | **WPF/.NET vence.** |
| **Separação de Privilégios (UI vs Service)** | Padrão arquitetural amplamente validado na indústria Windows (ex.: 1Password, Docker Desktop, antivírus corporativos): UI desprivilegiada conectando a um Windows Service local via Named Pipe autenticado. | Tauri é arquitetado primariamente para modelo processo-único (UI + Core Rust no mesmo binário). Separar um Windows Service de um shell Tauri exige desenvolver IPC de rede/pipe manual sem suporte out-of-the-box. | **WPF/.NET vence.** |
| **Tamanho do Instalador e Memória** | Com .NET Framework-dependent ou self-contained com NativeAOT/Trimming: ~20-50 MB. Uso de RAM dominado pelos processos do WebView2 (~60-90 MB). | Binário ultra-leve (~5-10 MB). Uso de RAM dominado igualmente pelo WebView2 (~50-80 MB). | **Tauri vence em tamanho bruto de disco.** |
| **Disponibilidade do WebView2 Runtime** | O WebView2 Evergreen Runtime já é componente padrão integrado no Windows 11 e em versões atualizadas do Windows 10 (após KB5024351). | Idêntico: Tauri depende do mesmo WebView2 Runtime nativo no Windows. | **Empate.** |
| **Reaproveitamento de UI e Lógica TypeScript** | Permite embutir os mesmos componentes React, validações de schema, cálculos de risco e contratos JSON. Comunicação via `window.chrome.webview.postMessage` estritamente tipada. | Permite embutir a mesma UI via comandos `invoke` de Tauri. | **Empate.** |
| **Pipeline de CI / CD** | Runners Windows do GitHub Actions (`windows-latest`) contam com .NET SDK 8 pré-instalado. Compilação rápida e suporte direto a MSIX / WiX Toolset v4. | Exige instalação da toolchain Rust + targets Windows na CI, resultando em builds mais lentos. | **WPF/.NET vence.** |

---

## 3. Decisão Arquitetural

Adotamos a **Opção A: WPF / .NET 8+ com WebView2 e Separação Estrita de Processos**.

### Componentes da Arquitetura:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        SESSÃO DO USUÁRIO (Aluno / Operador)             │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                    WinLab.Desktop (UI Shell)                     │  │
│  │  • Executado sem privilégios (asInvoker, sem elevação UAC)       │  │
│  │  • Hospeda WebView2 apontando para assets estáticos offline      │  │
│  │  • Interface React: Dashboard, Inventário, Presets, Configs      │  │
│  │  • Controlador WebViewBridge (validação de mensagens JSON)       │  │
│  └───────────────────────────────┬──────────────────────────────────┘  │
└──────────────────────────────────┼─────────────────────────────────────┘
                                   │
              IPC: Named Pipe Seguro ("\\.\pipe\WinLabService")
              • DACL restritiva: Acesso exclusivo BUILTIN\Administrators e SYSTEM
              • Autenticação de token Windows & Verificação de SID
              • Mensagens e comandos estritamente tipados (WinLab.Contracts)
              • PROIBIDO: Execução de shell arbitrário (powershell/cmd)
                                   │
┌──────────────────────────────────┴─────────────────────────────────────┐
│                    CONTEXTO DO SISTEMA (Privilegiado)                  │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     WinLab.Service (Agente)                      │  │
│  │  • Serviço Windows / Agente em C#                                │  │
│  │  • Valida permissão administrativa do chamador a cada comando    │  │
│  │  • Executa Preflight, Snapshot, Apply, Verify e Rollback         │  │
│  │  • Gerencia baselines em C:\ProgramData\WinLab com ACL restrita  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Escopo da Etapa Atual (Fase 1 - Fundação Desktop):
Em rigorosa conformidade com o handoff e com as regras de segurança:
1. **Nenhum executor privilegiado ou serviço é instalado** nesta etapa.
2. Desenvolvemos o **Shell Unprivileged** (`WinLab.Desktop`), os **Contratos Tipados IPC** (`WinLab.Contracts`), o **Mock de Serviço em Memória** (`WinLab.Agent.Mock`) e o **Dashboard Offline** (inventário somente leitura, catálogo de presets, import/export de configurações e visão de políticas).
3. Implementamos testes unitários automatizados para serialização dos contratos e **testes negativos de segurança** (rejeição de comandos não homologados, payloads corrompidos, tentativas de execução de shell e falta de privilégios).

---

## 4. Modelo de Ameaças (Threat Model - STRIDE)

| Ameaça (STRIDE) | Vetor / Cenário | Severidade | Mitigação Arquitetural do WinLab Desktop |
| :--- | :--- | :--- | :--- |
| **Spoofing (Identidade falsa)** | Um processo não autorizado ou malware conecta no Named Pipe fingindo ser o WinLab Desktop. | **Alta** | O Named Pipe aplica Security Descriptor explícito (`DACL: (A;;GA;;;BA)(A;;GA;;;SY)`), recusando qualquer conexão de contas não-administradoras. O servidor obtém o token de segurança do cliente via `NamedPipeServerStream.GetImpersonationUserName()` e confere se pertence ao grupo de administradores. |
| **Tampering (Adulteração)** | Um usuário restrito altera arquivos de configuração, scripts ou snapshots de baseline para desarmar proteções. | **Crítica** | Todos os baselines, logs de auditoria e `state.json` residem em `C:\ProgramData\WinLab`, protegidos por ACLs que concedem controle total apenas a `SYSTEM` e `BUILTIN\Administrators`. Usuários comuns possuem permissão `Deny Write`. |
| **Repudiation (Repúdio)** | Um operador aplica políticas restritivas e alega não ter executado a alteração. | **Média** | O serviço grava eventos de auditoria no Windows Event Viewer (`WinLab-Provider`), com registro do SID da conta chamadora, timestamp UTC, resumo das políticas alteradas e identificador da transação. |
| **Information Disclosure (Vazamento)** | O scanner de inventário ou relatório expõe credenciais, senhas ou arquivos pessoais de alunos. | **Alta** | **O WinLab não armazena nem trafega senhas.** O inventário de hardware e software é estritamente restrito a métricas do sistema operacional (`Win32_OperatingSystem`, `Win32_LogicalDisk`) e registro de aplicativos instalados (`Uninstall`). Pastas pessoais (`Documents`, `Desktop`, `Downloads`) são ignoradas por design. |
| **Denial of Service (Bloqueio do Admin)** | Uma configuração acidental bloqueia a conta administrativa, o Explorer ou o subsistema de recuperação. | **Crítica** | **Proteção Inviolável do Administrador:** O gerador e o motor de políticas recusam qualquer configuração em que a conta restrita coincida com a conta de administrador ou que restrinja o grupo `Administrators`. O AppLocker opera em `AuditOnly` por padrão até homologação explícita. |
| **Elevation of Privilege (Escalada de privilégios)** | Um aluno manipula a interface gráfica ou forja comandos IPC para executar scripts como SYSTEM. | **Crítica** | **1.** A interface gráfica roda como usuário comum (`asInvoker`), sem elevação.<br>**2.** O protocolo IPC **NUNCA** aceita strings de script ou comandos de shell genéricos (`cmd.exe`, `powershell.exe`). Ele aceita exclusivamente DTOs de comandos enumerados e homologados (`QueryInventory`, `GetPolicyStatus`, `PreviewPolicyChange`).<br>**3.** O serviço valida a autorização e rejeita comandos de modificação sem token administrativo válido. |

---

## 5. Contrato de IPC e Máquina de Estados de Política

As mensagens entre a UI e o Serviço são envelopes JSON com o seguinte formato canônico:

```typescript
export interface IpcEnvelope<T = unknown> {
  id: string;             // UUID da requisição
  timestamp: string;      // ISO 8601
  type: "command" | "query" | "event" | "response";
  action: string;         // Nome homologado da ação (ex: "inventory.query", "policy.preview")
  payload: T;
  securityContext?: {
    callerPid: number;
    requiresAdmin: boolean;
  };
}
```

### Estados Possíveis de uma Política:
1. `NotConfigured` — Política inalterada pelo WinLab (preserva o padrão do Windows).
2. `Applied` — Política aplicada e verificada em conformidade com o baseline.
3. `PendingLogoff` — Política gravada em HKCU / registro, mas dependente de novo logon do usuário.
4. `PendingReboot` — Alteração que exige reinicialização do sistema operacional.
5. `Failed` — Falha na aplicação ou divergência detectada na verificação.
6. `Reverted` — Política restaurada ao baseline anterior.

---

## 6. Próximos Passos
1. Implementar a estrutura de projetos C# e classes do IPC unprivileged (`WinLab.Contracts`, `WinLab.Desktop`, `WinLab.Agent.Mock`).
2. Implementar a interface do Dashboard Desktop Offline (somente leitura, presets, import/export de config).
3. Adicionar suíte de testes automatizados TypeScript/Node para os contratos e validação negativa.
4. Validar `npm test`, `npm run typecheck`, `npm run build`.
5. Submeter branch e abrir PR Draft no GitHub.
