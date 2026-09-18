# Pesquisa de mercado e feedback — setembro de 2026

## Posicionamento sugerido

O WinLab não deve tentar substituir plataformas completas de MDM/UEM como Microsoft Intune, ManageEngine Endpoint Central, Hexnode ou Scalefusion. O espaço mais interessante é:

> configurador local-first, visual, reversível e sem servidor obrigatório para Windows compartilhados, laboratórios, escolas, pequenas empresas e totens.

A proposta é compilar escolhas simples da interface em políticas nativas do Windows, scripts verificáveis e pacotes portáteis.

## Soluções comparáveis

### Microsoft Intune + Assigned Access + Shared PC

Pontos fortes:
- kiosk de um ou vários aplicativos;
- perfis restritos;
- gestão de contas e limpeza automática de perfis;
- configuração centralizada;
- integração com Microsoft Entra e MDM.

Lacunas para o público do WinLab:
- depende de infraestrutura/licenciamento/MDM em muitos cenários;
- configuração avançada usa CSP/XML/políticas;
- algumas políticas de Assigned Access afetam todos os usuários não administradores;
- excesso de complexidade para laboratórios pequenos.

Fontes:
- https://learn.microsoft.com/windows/configuration/assigned-access/
- https://learn.microsoft.com/windows/configuration/shared-pc/shared-devices-concepts
- https://learn.microsoft.com/windows/client-management/mdm/sharedpc-csp

### Faronics Deep Freeze

Pontos fortes:
- reboot-to-restore;
- console centralizado;
- kiosk;
- restrições de navegador;
- controle de aplicativos;
- restrições de impressora;
- janelas de manutenção e Windows Update.

Oportunidade para o WinLab:
- oferecer controles preventivos e configuração nativa sem depender de driver de restauração;
- futuramente detectar Windows Education/Enterprise e oferecer integração com UWF.

Fontes:
- https://www.faronics.com/products/deep-freeze
- https://www.faronics.com/solution/classroomandlabs

### Reboot Restore Rx

Pontos fortes:
- restaura baseline após reinicialização;
- historicamente voltado também a escolas e bibliotecas pequenas.

Feedback relevante:
- produtos de restore-on-reboot resolvem vandalismo/config drift, mas atualizações e manutenção do baseline podem virar ponto operacional crítico.

Fonte:
- https://support.horizondatasys.com/Default/Knowledgebase/Article/View/95/0/reboot-restore-rx-user-guide

### ManageEngine Endpoint Central

Pontos fortes:
- descoberta de aplicativos;
- allowlist/blocklist;
- regras por publisher, produto, executável, hash e caminho;
- gestão centralizada de privilégios.

Oportunidade para o WinLab:
- o scanner do 0.4 já aponta nessa direção;
- priorizar geração de regras por publisher e descoberta de dependências.

Fonte:
- https://www.manageengine.com/br/desktop-central/help/application-control/ac-overview.html

### Hexnode / Scalefusion

Pontos fortes:
- multi-app kiosk;
- allowlist/blocklist;
- app groups;
- instalação obrigatória;
- controle de configurações do dispositivo;
- website kiosk e allowlist/blocklist de URLs.

Fontes:
- https://www.hexnode.com/mobile-device-management/help/how-to-blacklist-whitelist-apps-on-windows-devices-using-hexnode-mdm/
- https://www.hexnode.com/mobile-device-management/help/getting-started-with-windows-kiosk-management/
- https://help.scalefusion.com/docs/configure-multi-app-kiosk-custom-launcher-ui-on-windows

## Feedback recorrente de administradores

### 1. Perfis acumulando e enchendo o SSD

Em laboratórios com muitos alunos, perfis locais se acumulam e exigem limpeza manual. Há relatos recentes de dezenas/centenas de perfis e armazenamento acabando.

Oportunidade:
- modo "Limpeza de perfis";
- excluir perfis não usados há X dias;
- alertar sobre espaço livre;
- integrar opções de Shared PC.

### 2. Provisionamento manual consome tempo

Admins reclamam de instalar software, preparar conta, validar sincronização e repetir os mesmos passos em vários PCs.

Oportunidade:
- configuração reproduzível;
- presets por sala;
- pacote único;
- "estado esperado" versus "estado detectado";
- lista do que falta instalar.

### 3. Kiosk tradicional é rígido demais

Há relatos de cenários educacionais em que o kiosk resolve segurança, mas bloqueia comportamentos legítimos como copiar/colar ou usar várias ferramentas.

Oportunidade:
- políticas granulares;
- "modo aula" temporário;
- exceções com prazo;
- desktop Windows normal, mas controlado.

### 4. AppLocker dá trabalho para manter

Dores recorrentes:
- atualizadores executados em AppData;
- dependências inesperadas;
- regras por hash quebrando após atualização;
- paths amplos demais viram risco.

Oportunidade:
- sugerir publisher rules;
- detectar dependências;
- analisar audit logs;
- botão "permitir este executável";
- indicar risco de path rule;
- catálogo de apps conhecido.

### 5. Restore-on-reboot complica manutenção

Admins gostam do efeito "reiniciou, voltou ao normal", mas relatam preocupação com feature updates, janelas de manutenção e baseline.

Oportunidade:
- não depender de restore-on-reboot no Windows Pro;
- quando Windows Education/Enterprise for detectado, oferecer UWF como módulo avançado;
- sempre expor o impacto sobre Windows Update.

## Roadmap sugerido

### P0 — próximas versões

- [ ] Limpeza automática de perfis por idade/inatividade
- [ ] Indicador de espaço livre e risco de disco cheio
- [ ] Regras por publisher/assinatura
- [ ] Importar audit logs e sugerir correções
- [ ] Transformar programas detectados fora do catálogo em allowlist
- [ ] Website allowlist/blocklist para Chrome/Edge
- [ ] Controles USB: leitura, gravação e execução
- [ ] Permissão para acessar/adicionar contas locais
- [ ] "Modo aula" temporário genérico, além de wallpaper
- [ ] Perfis/presets por sala e exportação/importação

### P1

- [ ] Limpeza de perfis baseada em Shared PC
- [ ] Gerenciamento do menu Iniciar/barra de tarefas
- [ ] Restrições de impressora
- [ ] Windows Update: horários e política de reinicialização
- [ ] Kiosk / Assigned Access single-app e multi-app
- [ ] Autologon opcional para kiosk
- [ ] Comparar configuração atual x desejada
- [ ] Relatório pós-aplicação
- [ ] Backup/restore mais granular das políticas anteriores

### P2

- [ ] UWF para Windows Education/Enterprise
- [ ] Console opcional para múltiplas máquinas
- [ ] Aplicação remota de presets
- [ ] Inventário histórico e config drift
- [ ] Alertas de máquina fora de conformidade
- [ ] Grupos de máquinas / salas
- [ ] Controle de versão de políticas
- [ ] Integrações com Intune/MDM para quem já possui infraestrutura

## Princípios de produto

1. local-first;
2. sem senha em arquivo;
3. reversível;
4. transparente — mostrar exatamente o que o script fará;
5. piloto/auditoria antes de enforcement;
6. administrador sempre recuperável;
7. aproveitar políticas nativas do Windows;
8. não prometer suporte onde a edição do Windows não suporta a tecnologia;
9. diferenciar "esconder interface" de "remover privilégio";
10. documentação clara de impacto e rollback.
