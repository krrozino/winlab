# WinLab Configurator

MVP de um gerador de scripts PowerShell para preparar computadores Windows de escolas, laboratórios e empresas.

## Objetivo

O usuário seleciona políticas numa interface e o app gera arquivos reutilizáveis:

- `setup.ps1`
- `config.json`
- `README.txt`

Nesta primeira versão toda a geração acontece localmente no navegador. Nenhuma senha é armazenada.

## MVP 0.1

- Conta de aluno e administrador
- Allowlist de Chrome, Word, Excel, PowerPoint e Power BI
- Caminhos adicionais personalizados
- Bloqueio de MSI / Store / CMD / PowerShell / Regedit
- Políticas do Google Chrome
- Bloqueio de wallpaper, ponteiro e esquema de sons
- Geração de PowerShell
- Configuração exportável em JSON
- Modo de reversão dentro do script

## Como executar

```bash
npm install
npm run dev
```

Abra http://localhost:3000

## Próximas etapas

### 0.2
- Download ZIP único em vez de arquivos individuais
- Presets: Escola / Empresa / Totem
- Liberação temporária de wallpaper
- Mais aplicações conhecidas
- Validação de caminhos

### 0.3
- Importar `config.json`
- Gerar script de auditoria
- Modo AppLocker Audit Only
- Relatório do que será alterado

### 0.4
- Aplicativo auxiliar para Windows que analisa programas instalados
- Detecção automática de executáveis
- Exportar allowlist com um clique

### 1.0
- Assinatura/verificação de scripts
- Catálogo de políticas versionado
- Testes automatizados das regras geradas
- Histórico de presets/configurações
