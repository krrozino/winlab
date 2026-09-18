# WinLab Configurator

Gerador de configurações PowerShell para preparar computadores Windows usados em escolas, laboratórios, totens e pequenas empresas.

O WinLab gera os scripts no próprio navegador. Senhas não são armazenadas pelo projeto.

## MVP 0.4

O WinLab agora possui um fluxo de **inventário da máquina**.

1. Baixe `scan-pc.ps1` pelo WinLab.
2. Execute o scanner no computador Windows.
3. Ele cria `winlab-inventory-NOMEDOPC.json`.
4. Importe o JSON no WinLab.
5. O app mostra a máquina e sugere aplicativos detectados para a allowlist.

### O inventário coleta

- nome do computador;
- edição, versão, build e arquitetura do Windows;
- disponibilidade do AppLocker;
- estado do serviço Application Identity;
- nomes e estado das contas locais;
- quais contas locais são administradoras;
- aplicativos conhecidos encontrados em caminhos padrão;
- lista de programas registrados no Windows.

### O inventário não coleta

- senhas;
- documentos;
- fotos;
- conteúdo de arquivos;
- histórico do navegador;
- cookies;
- mensagens;
- credenciais.

O JSON só é processado localmente pela interface do WinLab.

## Funcionalidades acumuladas

- Presets Microlins, Escola, Empresa e Totem
- Importação de `config.json`
- Formato versionado com `schemaVersion`
- Revisão de riscos antes da geração
- Catálogo de aplicativos conhecidos
- AppLocker em `AuditOnly` ou `Enabled`
- Conta administrativa fora das políticas por usuário
- Políticas do Chrome somente para o usuário restrito
- Bloqueio opcional de MSI, Store/Appx, CMD, PowerShell e Regedit
- Controle da página de Contas > Outros usuários para a conta restrita
- Wallpaper, ponteiro e sons controláveis
- Liberação temporária de wallpaper
- `verify.ps1`
- `audit.ps1`
- `scan-pc.ps1`
- Scanner + importação de inventário
- Sugestões de allowlist a partir da máquina
- Busca nos programas instalados
- ZIP criado localmente no navegador
- Testes automatizados + CI

## Pacote gerado

```text
setup.ps1
rollback.ps1
audit.ps1
verify.ps1
scan-pc.ps1
liberar-wallpaper.ps1
config.json
README.txt
```

## Fluxo recomendado

```text
PC piloto
   ↓
scan-pc.ps1
   ↓
winlab-inventory.json
   ↓
Importar no WinLab
   ↓
Revisar apps / allowlist
   ↓
Gerar em AuditOnly
   ↓
verify.ps1
   ↓
setup.ps1
   ↓
Uso real
   ↓
audit.ps1
   ↓
Ajustes
   ↓
Enabled
   ↓
Replicar
```

## Desenvolvimento

```bash
npm install
npm test
npm run typecheck
npm run build
npm run dev
```

A CI executa testes, typecheck e build em todo pull request para `main`.

## Estrutura

```text
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
└── lib/
    ├── apps.ts
    ├── config-io.ts
    ├── default-config.ts
    ├── generator.ts
    ├── inventory-script.ts
    ├── inventory-types.ts
    ├── inventory.ts
    ├── presets.ts
    ├── review.ts
    ├── security.ts
    ├── types.ts
    └── zip.ts

tests/
└── core.test.ts
```

## Próximos passos

- permitir transformar um programa detectado fora do catálogo em regra customizada;
- importar e interpretar automaticamente os logs do AppLocker;
- sugerir regras por publisher/assinatura;
- presets personalizados salvos localmente;
- companion app opcional para fluxo de inventário ainda mais simples;
- testes em matriz real Windows 10/11.
