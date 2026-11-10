# WinLab — Handoff para Antigravity (10/11/2026)

## Contexto oficial

- Repositório: https://github.com/krrozino/winlab
- Branch estável: `main`, versão `0.9.0`.
- Site atual: Next.js + React + TypeScript; gera scripts PowerShell/ZIP, não é um instalável desktop.
- Piloto físico: https://github.com/krrozino/winlab/issues/23
- Windows Companion: https://github.com/krrozino/winlab/issues/15
- Policy Engine V2: https://github.com/krrozino/winlab/issues/9
- Plano geral: `docs/superapp-master-plan.md`
- Critérios de compatibilidade: `docs/pilot-compatibility.md`
- Release notes do piloto: `docs/releases/0.9.0.md`

## Prioridades em duas frentes

### A. URGENTE — configurar um único PC real hoje

**Não inventar um instalável nem alterar um PC produtivo com versão não homologada.** Usar o configurador existente `0.9.0` e a Issue #23.

1. Abrir o repositório na branch `main`; manter `main` limpa.
2. `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, `npm run dev`.
3. Abrir `http://localhost:3000`; usar preset Microlins, conferir contas, apps, sites, USB e tarefas.
4. Baixar `preflight.ps1` no site e executá-lo **como administrador no PC de destino não crítico**. É diagnóstico, não aplicação.
5. Importar `winlab-preflight-<COMPUTADOR>.json`; revisar todos os BLOCK e WARN. Se houver BLOCK, **não aplicar**.
6. Só depois gerar o pacote **piloto**, que força **AppLocker AuditOnly** e **limpeza ReportOnly**. AuditOnly registra eventos, **não bloqueia execução de apps**; outras políticas podem ter efeitos imediatos.
7. Extrair ZIP integralmente, executar `verify-package.ps1` e exigir PASS.
8. Executar `setup.ps1` **sem** `-Apply`, revisar o preview e todos os impactos.
9. Antes de qualquer `setup.ps1 -Apply`, confirmar backup externo/recuperação, conta administrativa funcional e o checklist da Issue #23. Se houver anomalia, parar e registrar evidências.
10. **Não** aplicar política restritiva no computador principal do responsável, especialmente no ambiente PEDAGOGICO/Codex. Não alterar ferramentas CodexSandboxOffline/Online.

Se o usuário quer configuração urgente e não existe tempo para validar o pacote, usar somente configuração manual, reversível, de baixo risco, autorizada e documentada. Não marcar piloto como aprovado sem evidências.

### B. DESENVOLVIMENTO — WinLab Desktop instalável

Objetivo: aplicativo Windows **instalável**, offline-first, que abre painel administrativo e permite ligar/desligar políticas com aplicação/validação/rollback. Preservar o site web atual.

**Ainda não existe instalável pronto para distribuição.** Não declarar que existe ou publicar `.exe` sem passar pelos gates.

Arquitetura alvo:
- UI desktop local, com estudo inicial de WPF/.NET + WebView2 vs Tauri; registrar ADR curto com decisão e trade-offs;
- reutilização de contratos/schema e, quando viável, UI React do WinLab web; não exigir servidor Next.js nem acesso à Vercel no laboratório;
- agente/serviço Windows privilegiado separado da UI; interface sem elevação permanente;
- autenticação baseada no Windows (UAC/grupo administrativo), não armazenar senha de administrador; PIN do app opcional só como defesa adicional, nunca como mecanismo único de privilégio;
- IPC local autenticado/autorizado com ACL; somente comandos tipados e listados, **nunca shell arbitrário** ou políticas recebidas sem validação;
- estado observado do Windows, diff para estado desejado, snapshot, preflight, apply, verify, rollback e journal;
- mudanças podem depender de novo logon, reinício do app, gpupdate ou reboot: exibir estado 'aplicado', 'pendente', 'falhou', 'revertido';
- AppLocker AuditOnly por padrão, cuidado com políticas de sistema e proteção de acesso admin;
- sem telemetria/credenciais/controle remoto por padrão; sem deploy na Vercel.

Primeira entrega realista de desktop:
1. ADR + arquitetura e threat model.
2. Shell `WinLab Desktop` compilável/instalável **sem** executor privilegiado.
3. Dashboard com inventário somente leitura, acesso a presets, import/export de config e visão de políticas.
4. Contrato IPC e mock do serviço para testar UI; testes de autorização negativa.
5. Em PR posterior, executor para **3–5 controles de baixo risco**, com preflight, preview/diff, apply, verify e rollback.
6. Depois do primeiro piloto físico do motor `0.9`, avaliar expansão.

## Procedimento de trabalho no Antigravity

- Ler README, este handoff, Issues #23/#15/#9 e docs relevantes **antes** de implementar.
- Criar branch nova, por exemplo `feat/winlab-desktop-foundation`. Nunca desenvolver diretamente na `main`.
- Antes de editar, rodar `git status`, `npm ci`, `npm test`, `npm run typecheck`, `npm run build`; registrar o baseline.
- Não reescrever gerador monolítico nem substituir o 0.9 para iniciar o desktop; preservar compatibilidade.
- Trabalhar em marcos pequenos, reunir alterações correlatas em commits; PR Draft para revisão.
- Não fazer merge, release, publicação nem instalação/elevation/service start sem autorização explícita do usuário.
- **Proibição de deploy automático:** `vercel.json` tem `git.deploymentEnabled=false`. Não editar essa trava, não disparar Vercel manualmente sem autorização.
- Usar GitHub Actions e Windows runners para validação, sem testar scripts restritivos no computador principal.
- Toda alteração de política requer escopo user/device, compatibilidade, preview, risco, rollback e teste.
- Não alterar Microsoft Defender, firewall, WinRE, boot, administração ou credenciais na primeira versão desktop.
- Sem custos de API/cloud/creditos/serviços de terceiros sem autorização.

## Prompt de arranque (copiar no Antigravity)

> Você está assumindo o desenvolvimento do WinLab de `krrozino/winlab`.
> Primeiro leia `docs/ANTIGRAVITY_HANDOFF.md`, `README.md`, `docs/superapp-master-plan.md`, `docs/pilot-compatibility.md`, Issues #23, #15 e #9.
> Temos duas prioridades: **(A) usar o 0.9 existente para ajudar a configurar um único PC não crítico hoje, sem improvisar instalável**, e **(B) começar a base do WinLab Desktop instalável, mantendo o WinLab Web**.
> Seu primeiro trabalho de desenvolvimento é fazer uma auditoria somente leitura do repositório e dos checks, propor ADR de stack WPF/.NET + WebView2 vs Tauri e implementar **apenas um shell desktop local, não privilegiado**, com dashboard/inventário read-only e import/export de configuração. Crie branch e PR Draft, sem merge e sem deploy.
> Não execute `setup.ps1 -Apply`, `rollback.ps1 -Apply`, não instale serviços e não solicite credenciais. Não toque no PC principal/PEDAGOGICO.
> `vercel.json` desativa deploy automático por motivo de limite: preserve essa configuração e não faça Vercel deployments.
> Para o PC real, comece só por `preflight.ps1` e peça o relatório antes de recomendar qualquer Apply. Gere relatório de riscos, testes e próximos passos.
