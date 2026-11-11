# WinLab Desktop — Fundação Instalável (Shell Não-Privilegiado)

Este diretório contém a estrutura de código-fonte da aplicação desktop instalável do WinLab, desenvolvida em conformidade com o handoff e a decisão registrada no [ADR-001](../docs/adr/ADR-001-desktop-architecture.md).

## Princípios de Segurança Desta Etapa

1. **Sem Executor Privilegiado:** Nenhum serviço do Windows, agente com privilégios de SYSTEM ou script mutável com `-Apply` é instalado ou executado nesta fase.
2. **Interface Desprivilegiada (`asInvoker`):** O aplicativo desktop roda no nível de privilégio do usuário logado (manifesto explícito `asInvoker`).
3. **Ponte IPC Segura:** A comunicação entre o WebView2 e a camada de serviços utiliza contratos estritamente tipados (`WinLab.Contracts`), rejeitando expressamente qualquer comando de shell arbitrário ou script não homologado.
4. **Mock de Desenvolvimento Integrado:** O projeto `WinLab.Agent.Mock` fornece dados estáticos e validações em memória para que a interface gráfica e o fluxo de inventário, presets e importação/exportação de configurações possam ser testados de forma segura e determinística.

## Projetos na Solução

- **`src/WinLab.Contracts`**: Biblioteca de classes (.NET 10) contendo constantes, DTOs de inventário, políticas, envelopes IPC e validações de segurança da allowlist.
- **`src/WinLab.Agent.Mock`**: Agente em memória (.NET 10) para desenvolvimento offline e execução de testes de integração da interface.
- **`src/WinLab.Desktop`**: Aplicativo cliente WPF (.NET 10 LTS) hospedando o controle nativo `Microsoft.Web.WebView2.Wpf`, com mapeamento de virtual host (`winlab.local`) para carregar a interface React offline sem servidor web local.
- **`tests/WinLab.Tests`**: Suite de testes unitários automatizados xUnit (.NET 10) cobrindo validadores de segurança, envelopes IPC e o serviço de mock.
- **`packaging/winlab.iss`**: Script do Inno Setup para geração do instalador autocontido x64 (`WinLabSetup-0.9.0-x64.exe`).

## Compilação no Windows

Requisitos:
- Windows 10 (2004+) ou Windows 11
- .NET 10 SDK (LTS)
- Node.js 22 LTS
- Microsoft Edge WebView2 Runtime (instalado por padrão no Windows 11)

```bash
# 1. Exportar os ativos estáticos da interface web para wwwroot
npm run build:desktop

# 2. Compilar e testar a solução .NET 10
cd desktop
dotnet restore WinLab.sln
dotnet build WinLab.sln -c Release
dotnet test WinLab.sln -c Release
```

