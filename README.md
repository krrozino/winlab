# WinLab Configurator

Gerador de configurações PowerShell para preparar computadores Windows usados em escolas, laboratórios, totens e pequenas empresas.

O WinLab não armazena senhas. A interface gera um pacote portátil que pode ser levado em um pendrive e executado localmente como administrador.

## MVP 0.2

- Presets:
  - Microlins
  - Escola
  - Empresa
  - Totem
- Conta restrita + conta administrativa
- Administrador fora das políticas por usuário
- Políticas do Chrome aplicadas somente ao usuário restrito
- Allowlist de Chrome, Word, Excel, PowerPoint e Power BI
- Caminhos personalizados com alerta para diretórios graváveis pelo usuário
- AppLocker em:
  - `AuditOnly`
  - `Enabled`
- Bloqueio opcional de:
  - MSI
  - apps empacotados / Microsoft Store
  - CMD
  - PowerShell
  - Regedit
- Personalização:
  - wallpaper
  - ponteiro do mouse
  - esquema de sons
- Liberação temporária de wallpaper com rebloqueio agendado
- Pacote ZIP gerado no navegador com:
  - `setup.ps1`
  - `rollback.ps1`
  - `audit.ps1`
  - `liberar-wallpaper.ps1`
  - `config.json`
  - `README.txt`

## Segurança de implantação

A configuração padrão usa AppLocker em `AuditOnly`.

Fluxo recomendado:

1. Gere um pacote em modo de auditoria.
2. Aplique em um único PC piloto.
3. Use a conta restrita durante as atividades normais.
4. Execute `audit.ps1`.
5. Ajuste a allowlist conforme os eventos.
6. Só então gere um pacote em `Enabled`.

O AppLocker ainda precisa ser validado com os softwares reais de cada curso antes de uma implantação ampla.

## Executar o projeto

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Estrutura

```text
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
└── lib/
    ├── default-config.ts
    ├── generator.ts
    ├── presets.ts
    ├── security.ts
    ├── types.ts
    └── zip.ts
```

## Próximas etapas

### MVP 0.3
- importar `config.json`
- catálogo maior de aplicativos
- relatório visual das políticas antes da geração
- parser dos logs de auditoria
- testes automatizados para o gerador

### MVP 0.4
- companion app para Windows
- detectar softwares instalados
- descobrir executáveis automaticamente
- montar allowlist a partir da máquina analisada

### 1.0
- catálogo versionado de políticas
- assinatura/verificação dos scripts
- histórico de presets
- testes em matriz Windows 10/11
- publicação estável
