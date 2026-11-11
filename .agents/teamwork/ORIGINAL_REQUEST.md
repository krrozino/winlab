# Original User Request

## 2026-11-10T20:14:15Z

# MISSÃO — WINLAB DESKTOP: APLICATIVO WINDOWS FUNCIONAL, SEGURO E INSTALÁVEL

Você assumirá a evolução do **WinLab Desktop**, um aplicativo profissional para configurar, restringir, administrar e recuperar computadores Windows.

**Repositório:** https://github.com/krrozino/winlab

**PR existente:** #24 — Fundação WinLab Desktop  
**Issue Desktop:** #15  
**Issue Policy Engine:** #9  
**Issue Piloto:** #23

**Objetivo prioritário:** transformar a atual fundação demonstrativa em um aplicativo instalável para uso real em computadores da Microlins, mantendo o WinLab Web funcionando.

Quero um produto de verdade, não apenas um protótipo visual.

Trabalhe de maneira autônoma na implementação e validação, dentro dos limites de segurança definidos abaixo. Não interrompa o desenvolvimento apenas para apresentar planejamento. Resolva os problemas, execute os testes, corrija as falhas e entregue código funcional em PRs revisáveis.

Não faça merge, publicação em produção, instalação de serviço privilegiado ou alteração restritiva em um computador real sem minha autorização explícita.

---

# 1. PRIMEIRA TAREFA — AUDITORIA E CORREÇÃO DA PR #24

Leia integralmente:

- `docs/ANTIGRAVITY_HANDOFF.md`
- `docs/superapp-master-plan.md`
- `docs/adr/ADR-001-desktop-architecture.md`
- `docs/pilot-compatibility.md`
- `desktop/README.md`
- Issues #9, #15 e #23
- Comentários de revisão da PR #24

Verifique o estado real do repositório, incluindo a branch, arquivos alterados, testes, dependências e problemas de segurança.

Resolva obrigatoriamente:

1. Migrar WPF e bibliotecas de .NET 8 para **.NET 10 LTS**, incluindo dependências compatíveis, documentação, testes e SDK.
2. Adicionar compilação nativa .NET/WPF à CI Windows.
3. Corrigir o funcionamento offline do WebView2.
4. Criar um fluxo real para compilar e distribuir os arquivos estáticos da interface React.
5. Eliminar dependência de `localhost:3000` nas builds de distribuição.
6. Separar claramente dados demonstrativos de informações reais do computador.
7. Revisar a segurança do WebView2: origens autorizadas, navegações, mensagens recebidas e ferramentas de desenvolvimento.
8. Não confundir mock, contratos IPC e serviço privilegiado já implementado.
9. Substituir validações baseadas apenas em palavras proibidas por contratos tipados, schemas e autorização efetiva.
10. Corrigir erros, warnings, fragilidades de arquitetura e inconsistências documentadas.

**Importante:** preservar o WinLab Web 0.9 e seus recursos existentes. Não fazer uma reescrita desnecessária.

---

# 2. ENTREGA PRIORITÁRIA — WINLAB DESKTOP INSTALÁVEL

Quero poder instalar o WinLab como um aplicativo normal do Windows.

O usuário deverá conseguir:

- Executar um instalador `.exe` ou `.msi`.
- Instalar o WinLab com autorização administrativa.
- Encontrá-lo no Menu Iniciar.
- Criar atalho na área de trabalho opcionalmente.
- Abrir o aplicativo sem terminal, Node.js, npm ou servidor local.
- Utilizá-lo sem internet.
- Desinstalar ou atualizar o aplicativo adequadamente.
- Manter configurações e backups conforme opções explícitas de manutenção/desinstalação.

Adote WPF + .NET 10 + WebView2 como direção inicial, conforme a ADR, mas revise a melhor estratégia de distribuição dos arquivos React.

O instalador deve detectar as dependências necessárias. Não deve exigir instalar o SDK de desenvolvimento na máquina do cliente.

Criar um pipeline capaz de gerar artefatos de distribuição Windows x64.

Caso não haja certificado confiável de assinatura, identificar claramente o pacote como build de teste não assinada. Não improvisar uma assinatura que transmita falsa confiança.

## Critério de aceitação

O aplicativo deverá abrir diretamente por seu executável em um computador Windows limpo e compatível, sem Next.js rodando e sem conexão com a Vercel.

Criar teste de distribuição offline e verificar que todos os arquivos necessários estão presentes.

---

# 3. PRIMEIRA INSTALAÇÃO E AUTENTICAÇÃO ADMINISTRATIVA

Quero um assistente de configuração inicial.

Durante a instalação, com autorização administrativa do Windows, permitir:

- Identificar as contas administrativas existentes.
- Escolher os administradores autorizados a controlar o WinLab.
- Configurar o perfil inicial do computador.
- Escolher um preset: Microlins, Escola, Empresa, Casa ou Personalizado.
- Criar um backup do estado inicial.
- Exibir resumo das configurações selecionadas.
- Confirmar explicitamente antes de aplicar qualquer alteração.

**Não armazenar senhas administrativas.**

A segurança deve usar os mecanismos de identidade e autorização do Windows, incluindo UAC quando necessário.

Um usuário comum pode abrir uma interface limitada, mas não pode alterar políticas.

Para desbloquear alterações administrativas, exigir autenticação e autorização efetiva do Windows. Um PIN próprio do aplicativo pode ser estudado como proteção adicional, nunca como substituto da autorização do sistema.

Implementar bloqueio automático do painel administrativo após inatividade e nova autenticação quando necessário.

O WinLab nunca deve conceder privilégios administrativos permanentes à conta Aluno.

O administrador deve poder restaurar acesso mesmo se a interface principal estiver indisponível.

---

# 4. ARQUITETURA PARA ALTERAÇÕES REAIS DO WINDOWS

O WinLab Desktop precisa deixar de depender somente do Mock Agent.

Projetar uma arquitetura com:

**WinLab Desktop UI**
- Interface visual não privilegiada.
- Seleção de políticas.
- Dashboard.
- Histórico.
- Preview de alterações.
- Confirmação administrativa.

**WinLab Policy Engine**
- Catálogo central de políticas.
- Validação de compatibilidade.
- Detecção de dependências e conflitos.
- Cálculo de diferenças.
- Planejamento de aplicação.
- Verificação de estado.
- Rollback.

**Executor Windows**
- Componente separado da UI.
- Autorização administrativa efetiva em cada operação privilegiada.
- Execução apenas de comandos internos tipados e homologados.
- Sem shell arbitrário vindo da interface.
- Registro auditável das operações.
- Proteção dos backups.

Avaliar se o primeiro MVP funcional deve usar um helper elevado sob demanda, e em quais circunstâncias um Windows Service persistente será realmente necessário.

Não instalar um serviço SYSTEM simplesmente por conveniência.

Para futuras operações persistentes, usar IPC autenticado/autorizado, ACLs restritivas, verificação real do token do cliente e proteção contra mensagens malformadas, repetição e acesso indevido.

---

# 5. PRINCIPAL FUNCIONALIDADE — ALTERAR POLÍTICAS PELO PAINEL

Quero marcar ou desmarcar opções diretamente no aplicativo.

Exemplo:

**Microsoft Store**
- Não alterar
- Permitir
- Bloquear

**Prompt de Comando**
- Não alterar
- Permitir
- Bloquear

**Alteração do papel de parede**
- Não alterar
- Permitir
- Bloquear

O WinLab deverá suportar o estado **Não alterar**, preservando as configurações anteriores.

Ao modificar uma configuração, o fluxo deverá ser:

1. Identificar o usuário ou dispositivo afetado.
2. Ler o estado atual real.
3. Validar se a política é suportada.
4. Detectar conflitos e dependências.
5. Mostrar o que será alterado.
6. Mostrar o risco.
7. Informar se precisa de reinício, logoff ou reabertura de aplicativo.
8. Solicitar autorização administrativa para aplicar.
9. Criar ou preservar o baseline.
10. Aplicar a alteração.
11. Consultar novamente o estado.
12. Registrar resultado e evidências.
13. Apresentar opções de rollback.

**Não mostrar "Ativado" simplesmente porque um comando terminou sem erro.**

---

# 6. EXIGÊNCIA CRÍTICA — ESTADO REAL E PERSISTENTE DAS CONFIGURAÇÕES

Esta é uma das funcionalidades mais importantes do aplicativo.

Se eu bloquear determinada função e fechar o WinLab, quando abrir novamente ele deve identificar que o bloqueio continua configurado e, sempre que verificável, efetivamente ativo.

Não depender apenas de estado React, localStorage ou de valores salvos no próprio WinLab.

Implementar três conceitos separados:

- **Estado desejado:** o que o administrador pediu.
- **Estado configurado:** o que foi gravado pelo Windows.
- **Estado efetivo/verificado:** o que realmente está em vigor, segundo o mecanismo de verificação daquela política.

Exemplo:

**Microsoft Store**

Estado desejado: Bloqueado  
Estado configurado: Bloqueado  
Estado efetivo: Bloqueio confirmado  
Última verificação: data/hora

Outro exemplo:

**Papel de parede**

Estado desejado: Bloqueado  
Estado configurado: Bloqueado  
Estado efetivo: Aguardando novo logon

Criar estados de interface como:

- Não configurado
- Aplicando
- Aplicado e verificado
- Configurado, aguardando atualização
- Requer reinício
- Requer novo login
- Requer reiniciar aplicativo
- Falhou
- Divergente
- Não suportado
- Verificação inconclusiva
- Revertido

Na inicialização do WinLab:

1. Identificar computador, versão do Windows e usuário.
2. Carregar o estado desejado salvo.
3. Ler novamente as políticas reais.
4. Comparar estado desejado e observado.
5. Verificar se há alterações pendentes.
6. Identificar configurações que não foram preservadas.
7. Atualizar o dashboard.
8. Registrar alterações externas ou divergências.

Não reaplicar silenciosamente políticas de alto risco.

Exemplo de divergência:

"Você configurou o bloqueio do CMD, mas a política não está mais presente no Windows."

Oferecer:
- Revalidar
- Ver detalhes
- Reaplicar com autorização
- Aceitar estado atual
- Reverter

Quando uma política não puder ser comprovada automaticamente, mostrar isso honestamente. Não declarar proteção efetiva apenas pela existência de uma chave de registro.

---

# 7. REINICIALIZAÇÃO, LOGOFF E APLICAÇÃO AUTOMATIZADA

Quero que o WinLab seja inteligente.

Para cada política, identificar o tipo de atualização necessário:

- Aplicação imediata.
- Atualização de políticas do Windows.
- Reinício do aplicativo afetado.
- Encerramento e novo login do usuário.
- Reinicialização do computador.
- Aplicação diferida no primeiro login.

O usuário deve ser avisado **antes** de confirmar a mudança.

Exemplo:

"Esta configuração exige sair e entrar novamente na conta Aluno para ter efeito completo."

Após aplicar várias políticas, agrupar os requisitos.

Se cinco alterações exigirem reinício, mostrar um único aviso, em vez de cinco mensagens.

Implementar painel de pendências:

**3 alterações aguardando reinicialização**

- Configuração A
- Configuração B
- Configuração C

Oferecer:
- Reiniciar agora
- Reiniciar mais tarde
- Ver alterações pendentes

Nunca reiniciar automaticamente sem autorização.

Quando o computador reiniciar e o WinLab for aberto novamente, executar verificação e atualizar os estados.

Se alguma política continuar pendente ou falhar, mostrar o motivo.

Para configurações de primeiro login, implementar tentativa diferida confiável, com status, retry controlado, tratamento de falhas e limpeza de tarefas concluídas.

Evitar loops de reaplicação e reinicialização.

---

# 8. EXPANDIR O CATÁLOGO DE BLOQUEIOS DO WINLAB

Quero um aplicativo abrangente, mantendo foco escolar, empresarial e doméstico.

Antes de implementar cada controle, pesquisar o mecanismo oficial do Windows, a compatibilidade, o escopo, o risco e a possibilidade de reversão.

Não criar toggles sem funcionamento comprovável.

## 8.1 Contas e usuários

Implementar progressivamente:

- Criação assistida de usuário local padrão.
- Identificação de administradores existentes.
- Bloqueio de acesso às páginas de gerenciamento de contas.
- Restrições de alteração de configurações do usuário.
- Restrição de troca rápida de usuário, quando suportada.
- Controle de permissões de contas restritas.
- Detecção de usuários desativados.
- Diagnóstico de perfis locais.
- Limpeza opcional de perfis inativos, inicialmente somente relatório.
- Proteção explícita da conta administrativa.

Separar bloquear a interface de gerenciamento de contas de efetivamente impedir operações privilegiadas. Nunca prometer que esconder uma tela é um mecanismo de autorização.

## 8.2 Sistema Windows

- Prompt de Comando.
- PowerShell.
- Windows Terminal.
- Editor do Registro.
- Gerenciador de Tarefas.
- Executar.
- Painel de Controle.
- Páginas específicas de Configurações.
- Microsoft Store.
- Ferramentas administrativas.
- Gerenciador de Dispositivos.
- Configurações de data e hora.
- Alterações de idioma/região.
- Acesso a determinadas opções avançadas.
- Menu Iniciar.
- Pesquisa do Windows.
- Widgets.
- Personalização da barra de tarefas.
- Ícones da área de trabalho.
- Recursos opcionais do Windows, conforme compatibilidade.

Não bloquear mecanismos necessários à manutenção e recuperação administrativa.

## 8.3 Navegadores

Chrome e Edge devem possuir seções próprias.

Controles desejados:

- Navegação anônima/InPrivate.
- Modo convidado.
- Criação de novos perfis.
- Gerenciamento de extensões.
- Lista de extensões permitidas.
- Salvamento de senhas.
- Sincronização de contas.
- Página inicial.
- Página de nova guia.
- URLs permitidas.
- URLs bloqueadas.
- Downloads.
- Diretório de downloads, quando suportado.
- SafeSearch.
- Políticas de impressão.
- Políticas de navegação segura.
- Gerenciamento de perfis compartilhados.

Preservar logins necessários aos cursos da Microlins quando solicitado.

Evitar impedir atualizações de segurança dos navegadores.

## 8.4 Aplicativos

- Inventário real de programas instalados.
- Lista de softwares permitidos.
- Lista de softwares bloqueados.
- AppLocker AuditOnly.
- AppLocker Enforcement, somente após homologação.
- Regras por assinatura/publicador.
- Regras por caminho seguro.
- Regras por hash.
- Identificação de executáveis não assinados.
- Verificação de dependências.
- Detecção de programas ausentes.
- Importação de eventos de auditoria.
- Relatórios de tentativas de execução.
- Permissões temporárias quando seguras e suportadas.

Considerar executáveis, instaladores MSI, scripts e aplicativos empacotados de acordo com o mecanismo utilizado.

Não presumir que AppLocker em AuditOnly está bloqueando aplicativos.

Proteger executáveis essenciais do Windows e ferramentas de recuperação administrativa.

## 8.5 Hardware e periféricos

- USB leitura.
- USB gravação.
- Execução de arquivos em USB.
- Armazenamento removível.
- Bluetooth.
- Câmera.
- Microfone.
- Impressoras.
- Scanners.
- Localização.
- Dispositivos de armazenamento externos.
- Configurações de energia.
- Suspensão e desligamento.
- Opções de áudio, quando controláveis por política.

Separar restrições de dispositivo, usuário e aplicativo.

## 8.6 Personalização

- Papel de parede.
- Tela de bloqueio.
- Temas.
- Cores.
- Sons.
- Ponteiros.
- Protetor de tela.
- Ícones.
- Barra de tarefas.
- Menu Iniciar.

Criar opção de **liberação temporária**, com expiração e restauração verificável.

## 8.7 Arquivos e armazenamento

- Acesso a unidades.
- Exibição de unidades no Explorer.
- Restrições de pastas.
- Downloads.
- Arquivos temporários.
- Pastas compartilhadas.
- OneDrive.
- Limpeza de caches.
- Limpeza de perfis.
- Relatório de espaço utilizado.
- Diagnóstico de armazenamento.

Nenhuma limpeza destrutiva automática na primeira versão.

## 8.8 Privacidade e segurança

- Câmera.
- Microfone.
- Localização.
- Permissões de aplicativos.
- Recursos de telemetria configuráveis quando suportados.
- Recursos de IA do Windows quando houver política documentada.
- Histórico e recomendações.
- Políticas de sessão compartilhada.

O WinLab deve diagnosticar Defender, firewall e Windows Update, mas **não desativar proteções essenciais** por padrão.

## 8.9 Escola, empresa e casa

Preparar presets:

**Microlins / Escola**
- Usuário Aluno padrão.
- Administrador preservado.
- Chrome/Edge.
- Office.
- Power BI.
- PDF.
- Impressão.
- USB para documentos.
- Restrição de execução de aplicativos não aprovados.
- Proteção contra alterações indevidas.
- Preservação de contas e arquivos conforme necessidade.

**Empresa**
- Estação de trabalho.
- Recepção.
- Computador compartilhado.
- Aplicativos corporativos.
- Kiosk opcional.

**Casa**
- Criança.
- Adolescente.
- Convidado.
- Estudo.
- Lazer.
- Horários e restrições quando houver mecanismo confiável.

**Não implementar dezenas de políticas simultaneamente sem validação.** Criar um catálogo abrangente e entregar funcionalidades operacionais em lotes progressivos.

---

# 9. DASHBOARD E EXPERIÊNCIA VISUAL

Quero uma interface profissional, moderna, rápida e intuitiva.

Não quero que pareça um painel técnico improvisado.

Criar navegação com:

- Visão geral
- Contas
- Aplicativos
- Internet e navegadores
- Windows
- Hardware
- Personalização
- Privacidade
- Arquivos e armazenamento
- Segurança
- Manutenção
- Presets
- Histórico
- Recuperação
- Configurações do WinLab

## Dashboard principal

Mostrar:

- Nome real do computador.
- Windows instalado.
- Usuário atual.
- Estado de autorização administrativa.
- Perfil selecionado.
- Quantidade de políticas configuradas.
- Quantidade de políticas verificadas.
- Quantidade de configurações pendentes.
- Quantidade de falhas.
- Alertas de compatibilidade.
- Última verificação.
- Estado da recuperação/backup.

Não utilizar dados fictícios quando o sistema estiver em modo real.

Criar dois modos claramente identificados:

**Demonstração**
Dados simulados, sem qualquer aplicação de políticas.

**Computador real**
Inventário e estados obtidos do Windows.

No modo de demonstração, usar banner persistente indicando que os dados são fictícios.

## UX dos controles

Cada opção deverá possuir:

- Nome claro.
- Descrição.
- Escopo.
- Estado desejado.
- Estado real.
- Compatibilidade.
- Risco.
- Necessidade de reinício/logoff.
- Botão de detalhes.
- Possibilidade de reversão.

Adicionar busca geral de configurações.

Permitir marcar várias opções e depois usar:

**Revisar e aplicar alterações**

O usuário deve visualizar o resumo antes de confirmar.

Implementar indicador de progresso real e tratamento de erros.

Não apresentar mensagens de sucesso falsas.

---

# 10. BACKUP, HISTÓRICO E ROLLBACK

Esta é uma exigência central.

Antes de aplicar alterações:

- Capturar baseline relevante.
- Preservar valores anteriores.
- Registrar identificadores de usuário/SID.
- Registrar políticas anteriores.
- Criar um ID de transação.
- Validar que a recuperação é possível.

Após a aplicação:

- Registrar alterações.
- Confirmar estado configurado.
- Executar verificação efetiva quando possível.
- Guardar erros.
- Registrar pendências.

O aplicativo deverá apresentar histórico como:

**Configuração alterada**
- Política: Bloquear alteração do papel de parede
- Usuário: Aluno
- Estado anterior: Não configurado
- Estado solicitado: Bloqueado
- Estado verificado: Aplicado
- Data/hora
- Administrador responsável
- ID da transação

Implementar restauração controlada de políticas anteriores.

Se uma operação falhar parcialmente, executar recuperação compatível com o mecanismo e informar claramente o que foi ou não revertido.

Não apagar backups automaticamente sem política explícita de retenção.

Se houver alterações externas, preservar evidências em vez de sobrescrevê-las silenciosamente.

---

# 11. AUTOMAÇÕES INTELIGENTES

Automatizar o máximo possível sem esconder efeitos importantes.

Prioridades:

1. Detectar Windows e suas capacidades.
2. Detectar contas locais.
3. Detectar programas instalados.
4. Identificar as políticas aplicáveis.
5. Sugerir presets apropriados.
6. Validar conflitos.
7. Gerar preview automaticamente.
8. Identificar requisitos de reinicialização.
9. Aplicar operações homologadas após autorização.
10. Verificar resultado após aplicação.
11. Salvar estado e evidências.
12. Revalidar ao abrir o aplicativo.
13. Detectar configurações divergentes.
14. Notificar falhas e pendências.
15. Oferecer correção ou rollback.

Em versões posteriores, estudar:

- Modos Aula/Prova.
- Configuração temporária.
- Expiração automática.
- Agendamento de manutenção.
- Exportação de relatório.
- Aplicação repetível em vários PCs.

Não adicionar monitoramento remoto nem coleta de dados pessoais como requisito do MVP.

---

# 12. SEGURANÇA OBRIGATÓRIA

O WinLab precisa continuar seguro mesmo quando utilizado em um computador com alunos.

Requisitos:

- Interface sem privilégios permanentes.
- Autorização administrativa real para mutações.
- Nenhuma senha administrativa armazenada.
- Sem execução de comandos arbitrários enviados pela UI.
- Contratos IPC com validação estrita.
- Proteção de arquivos de configuração e backups.
- Proteção contra alteração não autorizada das políticas.
- Auditoria de operações administrativas.
- Verificação de permissões para cada operação.
- Tratamento de configurações corrompidas.
- Recuperação de falha parcial.
- Idempotência de aplicação.
- Compatibilidade explícita por versão/edição Windows.
- Proteção do acesso administrativo.
- Aplicação AppLocker em AuditOnly até homologação.
- Nenhum bloqueio silencioso de ferramentas de recuperação.

**Não desativar Defender, firewall, Windows Update, WinRE, mecanismos de recuperação ou proteções fundamentais para fazer um recurso funcionar.**

Não executar políticas restritivas no computador principal/PEDAGOGICO.

Para validação de alterações privilegiadas, usar VM Windows descartável com snapshot e contas de teste.

---

# 13. TESTES E CI/CD

Ampliar a CI do GitHub.

Executar:

- Testes TypeScript.
- Typecheck.
- Next.js build.
- Testes do Policy Engine.
- Testes de schema.
- Testes de importação/exportação.
- Testes de conflitos.
- Testes de rollback.
- Testes de estados persistentes.
- Testes com configuração corrompida.
- Testes de autorização negativa.
- Testes do WebView2.
- Compilação WPF Release no Windows.
- Testes C#/.NET.
- Testes de empacotamento.
- Smoke do instalável offline.

Criar testes específicos:

**Teste A — Persistência**

1. Aplicar política de baixo risco em VM.
2. Fechar WinLab.
3. Abrir WinLab novamente.
4. Confirmar estado desejado e estado real.
5. Reiniciar Windows.
6. Abrir WinLab novamente.
7. Confirmar persistência e verificar efeito real.

**Teste B — Reversão**

1. Capturar baseline.
2. Aplicar alteração.
3. Confirmar efeito.
4. Reverter.
5. Verificar retorno ao estado anterior.

**Teste C — Falha**

1. Simular erro controlado em uma operação.
2. Confirmar que o WinLab não apresenta sucesso.
3. Confirmar registro de erro.
4. Validar recuperação ou bloqueio seguro.

**Teste D — Segurança**

1. Usuário padrão tenta alterar política.
2. Autorização deve ser negada.
3. Usuário tenta manipular arquivo de configuração.
4. Serviço/executor deve rejeitar mutações não autorizadas.
5. Garantir que o acesso administrativo não seja bloqueado.

**Teste E — Instalação**

1. Instalar em VM Windows limpa.
2. Abrir sem Node.js e sem servidor local.
3. Utilizar interface offline.
4. Fechar e reabrir.
5. Desinstalar.
6. Validar tratamento correto dos dados.

Não considerar testes com mocks suficientes para aprovar operações privilegiadas reais.

---

# 14. DISTRIBUIÇÃO E ENTREGÁVEIS

Quero uma entrega concreta.

Ao concluir cada milestone:

- Código na branch.
- PR Draft.
- Documentação.
- Resultado dos testes.
- Lista das políticas efetivamente funcionais.
- Lista das políticas ainda simuladas/não implementadas.
- Riscos conhecidos.
- Artefato de distribuição Windows quando validado.
- Instruções de instalação.
- Instruções de recuperação.
- Próximos passos.

Criar preferencialmente um build instalável interno do **WinLab Desktop — Microlins Pilot**.

Entretanto, não entregar executável como seguro para uso real até passar pelos testes correspondentes.

Build de demonstração, build de teste e release homologada devem ser identificados de forma diferente.

Não publicar automaticamente no GitHub Releases nem fazer deploy em Vercel sem autorização.

**A configuração `git.deploymentEnabled: false` deve permanecer intacta.**

---

# 15. ORDEM DE EXECUÇÃO

Organize o desenvolvimento nos seguintes marcos:

## M1 — Fundação corrigida e instalável

- Corrigir todos os bloqueios da PR #24.
- Migrar .NET 10.
- Corrigir assets offline.
- Endurecer WebView2.
- Adicionar CI WPF.
- Gerar pacote instalável de demonstração.
- Confirmar execução offline.

## M2 — Inventário real e autenticação

- Scanner real de Windows.
- Contas locais.
- Programas.
- Estado das políticas.
- Autorização administrativa.
- Assistente de primeira configuração.
- Eliminar dados fictícios do modo real.

## M3 — Primeiro motor funcional de políticas

Escolher de três a cinco políticas de baixo risco e realmente reversíveis.

Implementar fluxo completo:

Detectar → Preview → Autorizar → Backup → Aplicar → Verificar → Persistir → Reverter.

## M4 — Persistência e reinicialização

- Estado desejado/configurado/efetivo.
- Revalidação na abertura.
- Tratamento de logout/reboot.
- Detecção de divergências.
- Histórico.
- Recuperação de falhas.

## M5 — Expansão Microlins

Implementar progressivamente os controles de maior valor para laboratórios escolares:

- Contas.
- Navegadores.
- Aplicativos.
- USB.
- Personalização.
- Ferramentas do Windows.
- Impressão.
- Arquivos.
- Manutenção.

Cada conjunto deve ser homologado antes do próximo.

## M6 — Versão candidata para uso real

- Instalador.
- Preflight.
- Backup.
- Aplicação.
- Verificação.
- Rollback.
- Documentação.
- Testes em VM Windows cliente.
- Checklist de homologação física.

---

# 16. REGRAS DE EXECUÇÃO DO AGENTE

Trabalhe com autonomia técnica, mas preserve o controle do produto.

Você pode:
- Analisar o repositório.
- Refatorar código na branch apropriada.
- Criar arquivos.
- Corrigir bugs.
- Escrever testes.
- Compilar.
- Gerar pacotes de teste.
- Documentar.
- Abrir e atualizar PRs Draft.
- Executar testes seguros em VM isolada.

Você não pode, sem minha autorização:
- Fazer merge na main.
- Fazer deploy Vercel.
- Instalar serviço privilegiado em PC real.
- Aplicar restrições em computador real.
- Modificar minha máquina principal.
- Desativar mecanismos de segurança do Windows.
- Excluir arquivos de usuários.
- Criar custos pagos.
- Publicar release de produção.

Evite microcommits desnecessários. Faça mudanças coesas e valide cada marco.

Se uma funcionalidade não puder ser implementada corretamente, documente o bloqueio e mantenha-a desativada. Não substitua funcionalidade real por um toggle falso.

**Prioridade final:** qualidade, segurança, estabilidade, funcionamento offline e aplicabilidade real no Windows.

---

# 17. RESULTADO QUE ESPERO

Quero chegar ao ponto em que eu consiga:

1. Instalar o WinLab no computador da Microlins.
2. Abrir o aplicativo normalmente.
3. Autorizar o acesso administrativo.
4. Selecionar a conta Aluno.
5. Visualizar os controles disponíveis.
6. Bloquear ou permitir uma funcionalidade.
7. Receber aviso caso precise reiniciar.
8. Aplicar a configuração.
9. Fechar o WinLab.
10. Reiniciar o computador se necessário.
11. Abrir o WinLab novamente.
12. Encontrar a configuração identificada como ativa **somente quando seu efeito for realmente verificado**.
13. Desfazer a alteração quando desejar, com restauração correta do estado anterior.

Tudo isso sem precisar editar scripts PowerShell manualmente.

**Comece imediatamente pelo M1, mas avance pelos próximos marcos conforme conseguir concluir e validar cada etapa.**

Não declare o projeto pronto com base em mocks, compilação isolada ou sucesso visual.

Entregue o máximo de progresso concreto possível, com testes e evidências, até termos um aplicativo Windows instalável, administrável, recuperável e confiável para a Microlins.
