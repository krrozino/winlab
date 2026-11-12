# WinLab — Desktop, Web, Atualizações e Rede (incremento 0.9.1)

## Experiência compartilhada

- A tela inicial do Desktop e a página inicial da Web utilizam `src/desktop/ControlCenter.tsx` e o mesmo catálogo de opções em `Config`.
- O antigo configurador web foi preservado em `/configurador`, como interface avançada, sem ser aberto dentro do executável.
- A Web permite editar, salvar localmente (sem senhas) e exportar configurações. O navegador, isoladamente, **não consegue** criar contas nem aplicar políticas no Windows; isso exige um agente autenticado ou a execução local do pacote exportado.
- O Desktop utiliza WebView2 somente para apresentar a interface offline. Ações administrativas são processadas no executor Windows com UAC.

## Aplicar tudo

- Interruptores gerais representam configurações de perfil ainda não aplicadas.
- As cinco políticas nativas do motor atual (incógnito e convidado de Chrome/Edge, papel de parede, sons e ponteiros) são enfileiradas e enviadas como uma transação quando o usuário clica em **Aplicar alterações**.
- A transação é monitorada pelo próprio executor. Falhas são devolvidas à interface. A etapa futura é ampliar o catálogo nativo até que todas as opções sejam contempladas pelo mesmo botão, sem arquivos auxiliares.
- Nunca rotular edição de perfil como política já aplicada.

## Atualização automática

O WinLab passou a incluir Velopack 1.2.161. O Desktop consulta releases **estáveis** do repositório `krrozino/winlab` ao abrir e a cada seis horas. Quando uma versão maior é publicada, baixa o pacote e o instalador gerenciado o aplica na próxima abertura, sem reiniciar de surpresa durante uma aula.

O workflow `.github/workflows/ci.yml` agora publica `WinLab-AutoUpdate-Installer-x64` como artefato de teste, contendo o instalador Velopack, pacote completo e índice `releases.win.json`.

O workflow `.github/workflows/desktop-release.yml` publica esses arquivos em GitHub Releases quando é criada uma tag estável `desktop-vMAJOR.MINOR.PATCH`, depois de integrar o código. Exemplo: `desktop-v0.9.1`.

**Transição**: versões instaladas pelo Inno Setup não têm o mecanismo Velopack. Para ativar atualizações é necessário instalar **uma vez** o novo instalador Velopack. Verifique/desinstale a instalação anterior para não deixar atalhos duplicados. Depois, as instalações gerenciadas pelo Velopack acompanham os releases subsequentes.

**Limites**: a presença do mecanismo no executável e a geração de pacotes não comprovam atualização ponta a ponta: faltam a primeira release estável, a validação de 0.9.1→0.9.2 em uma VM Windows e a assinatura de código para distribuição ampla. Sem internet, o aplicativo continua disponível offline.

## Rede de alunos

O WinLab agora oferece um guia para criar uma pasta SMB central em um computador da rede escolar e conectar as estações por uma letra de unidade. O guia exporta:

1. `winlab-servidor-pasta-alunos.ps1`: executado **uma vez**, como administrador no servidor, cria a pasta e a compartilha para usuários SMB autenticados com permissão de alteração.
2. `winlab-conectar-pasta-alunos.ps1`: executado na sessão da conta de aluno em cada estação, cria a unidade persistente apontando para `\\SERVIDOR\Alunos`.

O servidor deve permanecer ligado. As máquinas precisam compartilhar uma rede local, resolução de nomes e credenciais válidas; a pasta não deve ser exposta diretamente à internet. O WinLab não ativa acesso de convidado anônimo.

O compartilhamento desta etapa é coletivo: usuários autenticados com permissão podem alterar arquivos de terceiros. Pastas privadas por estudante, quotas, backup agendado e distribuição automática em grupo ficam para a próxima implementação. Não ofereça a pasta compartilhada como armazenamento seguro de provas ou dados sigilosos sem isolar as permissões.

## Próximos incrementos técnicos

- Expandir o executor nativo para instaladores, Store, URL filtering e demais controles antes de marcar `Aplicar tudo` como universal.
- Implementar descoberta e vinculação de agentes de rede autenticados; configuração remota em lote e relatórios de aplicação por estação.
- Persistência e auditoria dos planos de rede; compartilhamentos individuais e backups.
- Homologar atualização real entre duas versões Velopack instaladas e publicar release estável.
