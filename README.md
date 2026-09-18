# WinLab Configurator

Gerador de configurações PowerShell para preparar computadores Windows usados em escolas, laboratórios, totens e pequenas empresas.

O WinLab não armazena senhas. A interface gera um pacote portátil que pode ser levado em um pendrive e executado localmente como administrador.

## MVP 0.3

- Presets Microlins, Escola, Empresa e Totem
- Importação de `config.json` do WinLab 0.2 e 0.3
- `schemaVersion` para evolução segura do formato de configuração
- Revisão de riscos antes de gerar o pacote
- Catálogo ampliado de aplicativos:
  - Chrome
  - Edge
  - Firefox
  - Word
  - Excel
  - PowerPoint
  - Power BI
  - Adobe Acrobat / Reader
  - Visual Studio Code
  - VLC
- Caminhos personalizados com alerta para diretórios graváveis pelo usuário
- AppLocker em `AuditOnly` ou `Enabled`
- Políticas do Chrome aplicadas somente ao usuário restrito
- Conta administrativa fora das restrições por usuário
- Bloqueio opcional de MSI, Store/Appx, CMD, PowerShell e Regedit
- Controle de wallpaper, ponteiro e esquema de sons
- Liberação temporária do wallpaper com rebloqueio automático
- `verify.ps1` para validar o PC antes da implantação
- `audit.ps1` para revisar eventos do AppLocker
- Testes automatizados do importador e dos geradores
- ZIP criado localmente no navegador, sem backend

## Pacote gerado

```text
setup.ps1
rollback.ps1
audit.ps1
verify.ps1
liberar-wallpaper.ps1
config.json
README.txt
```

## Fluxo recomendado

1. Configure o perfil no WinLab.
2. Gere o ZIP em `AuditOnly`.
3. Rode `verify.ps1` no PC piloto.
4. Rode `setup.ps1`.
5. Reinicie e use a conta restrita normalmente.
6. Rode `audit.ps1`.
7. Ajuste a allowlist se necessário.
8. Gere novamente com `Enabled`.
9. Só depois replique para as demais máquinas.

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
    ├── presets.ts
    ├── review.ts
    ├── security.ts
    ├── types.ts
    └── zip.ts

tests/
└── core.test.ts
```

## Próximos passos

- importar relatórios do `verify.ps1`
- interpretar automaticamente os logs do AppLocker
- companion app para detectar softwares instalados
- regras AppLocker por publisher/assinatura quando apropriado
- presets personalizados salvos no navegador
- testes em matriz real de Windows 10/11
