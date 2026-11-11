# Relatório de Auditoria e Diagnóstico — WinLab Desktop & WPF (PR #24)

**Data**: 10 de novembro de 2026  
**Autor**: Explorer Subagent (Desktop & WPF Explorer)  
**Destinatário**: Project Orchestrator (`0b7fefcdb266ef2c358377a3938321e9`)  
**Contexto**: Investigação aprofundada da fundação Desktop, PR #24, shell WPF, WebView2, IPC, ativos offline e segurança.

---

## 1. Observation (Observações Diretas e Fatos Verificados)

### 1.1 Repositório, Git e Status da PR #24
- **Branch atual**: `feat/winlab-desktop-foundation` (commit `f65151f`).
- **PR #24**: Draft no GitHub (`https://github.com/krrozino/winlab/pull/24`), 27 arquivos modificados (+4291 / -17).
- **Status da Revisão**: O proprietário do repositório (`krrozino`) registrou revisão formal em 10/11/2026 com resultado **REQUEST CHANGES**, definindo 7 itens prioritários (P0) que bloqueiam a consideração do Desktop como instalável ou para uso na Microlins.
- **Configuração Vercel**: `vercel.json` contém `"git": { "deploymentEnabled": false }` intacto.

### 1.2 Estrutura da Solução .NET / WPF e Dependências
- **Solução**: `desktop/WinLab.sln` com 3 projetos em `desktop/src/`:
  1. `WinLab.Contracts` (`desktop/src/WinLab.Contracts/WinLab.Contracts.csproj`):
     - Target Framework: `netstandard2.0` (linha 4)
     - Dependência: `System.Text.Json` v8.0.5 (linha 12)
  2. `WinLab.Agent.Mock` (`desktop/src/WinLab.Agent.Mock/WinLab.Agent.Mock.csproj`):
     - Target Framework: `netstandard2.0` (linha 4)
     - Dependências: `WinLab.Contracts`, `System.Text.Json` v8.0.5
  3. `WinLab.Desktop` (`desktop/src/WinLab.Desktop/WinLab.Desktop.csproj`):
     - Output: `WinExe` (linha 4)
     - Target Framework: `net8.0-windows` (linha 5)
     - WPF: `<UseWPF>true</UseWPF>` (linha 7)
     - Manifesto: `<ApplicationManifest>app.manifest</ApplicationManifest>` (linha 11)
     - Dependências: `Microsoft.Web.WebView2` v1.0.2849.39, `System.Text.Json` v8.0.5, referências locais aos outros 2 projetos.
- **Projetos de Teste C#**: **NENHUM**. Não existe projeto de teste `.csproj` (ex: `WinLab.Contracts.Tests` ou `WinLab.Desktop.Tests`).
- **Pacotes de Instalação**: Não há arquivos WiX Toolset (`.wxs`), Inno Setup (`.iss`) ou MSIX packaging no repositório.

### 1.3 WebView2, Navegação e Inicialização
- **Arquivo**: `desktop/src/WinLab.Desktop/MainWindow.xaml.cs`
  - Linhas 38-40:
    ```csharp
    WebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
    WebView.CoreWebView2.Settings.AreDevToolsEnabled = true; // Habilitado para inspeção técnica
    WebView.CoreWebView2.Settings.IsWebMessageEnabled = true;
    ```
    `AreDevToolsEnabled = true` está ativado incondicionalmente, mesmo para compilações de Release.
  - Linhas 47-61:
    ```csharp
    string assetsDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
    if (Directory.Exists(assetsDirectory))
    {
        WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
            "winlab.local",
            assetsDirectory,
            CoreWebView2HostResourceAccessKind.Allow
        );
        WebView.CoreWebView2.Navigate("https://winlab.local/desktop/index.html");
    }
    else
    {
        // Fallback para desenvolvimento local: navega para página local de desenvolvimento
        WebView.CoreWebView2.Navigate("http://localhost:3000/desktop");
    }
    ```
  - **Diretório `wwwroot`**: O diretório `desktop/src/WinLab.Desktop/wwwroot` **não existe** no repositório (`ls` retornou código 2 - `No such file or directory`).
  - **Efeito**: Em qualquer máquina que execute o binário compilado sem o Next.js dev server rodando na porta 3000, o WebView2 tenta navegar para `http://localhost:3000/desktop` e falha com tela em branco / erro de conexão.

### 1.4 Estado da Ponte IPC entre React e C#
- **Lado C# (`desktop/src/WinLab.Desktop/Bridge/WebViewBridge.cs` e `MainWindow.xaml.cs`)**:
  - `MainWindow.xaml.cs` linhas 77-84:
    ```csharp
    private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (_bridge != null)
        {
            string rawMessage = e.TryGetWebMessageAsString();
            await _bridge.HandleWebMessageReceivedAsync(rawMessage);
        }
    }
    ```
    - **Origem não verificada**: O evento `WebMessageReceived` não inspeciona `e.Source` antes de despachar a mensagem.
    - O `_bridge` despacha para `_mockService.HandleRequestAsync(rawJson)` e responde via `_coreWebView2.PostWebMessageAsString(responseJson)`.
- **Lado React (`src/app/desktop/page.tsx`)**:
  - Linha 5: `import { MockDesktopAgent } from "@/desktop/mock-agent";`
  - Linha 30: `const agent = useMemo(() => new MockDesktopAgent(), []);`
  - Linhas 58-75 (`sendIpcMessage`): Executa diretamente `await agent.handleRequest<T>(envelope)` na memória do navegador JavaScript.
  - **Desconexão Total do IPC**: `src/app/desktop/page.tsx` **nunca** chama `window.chrome.webview.postMessage` e **nunca** escuta `window.chrome.webview.addEventListener('message', ...)`. A ponte C# implementada em `WebViewBridge.cs` é código morto na prática.

### 1.5 Pipeline de Ativos Estáticos e Next.js
- `package.json` possui dependência `next: "16.3.3"`, `react: "^19.2.0"`.
- Scripts atuais: `dev`, `test`, `typecheck`, `build`, `start`, `check`, `fixtures`.
- Não existe arquivo `next.config.js` ou `next.config.mjs`.
- O build padrão (`next build`) gera o formato para servidor Node.js em `.next/`, e **não** uma exportação estática (`output: 'export'`) em pasta HTML/CSS/JS pura (`out/`).
- Não existe script npm ou tarefa MSBuild para copiar arquivos de frontend para `desktop/src/WinLab.Desktop/wwwroot`.
- Além disso, no Next.js com App Router, a rota `/desktop` em export estático gera `desktop.html` a menos que `trailingSlash: true` esteja configurado, gerando `desktop/index.html` (que é o caminho esperado por `MainWindow.xaml.cs`: `https://winlab.local/desktop/index.html`).

### 1.6 Postura de Segurança e Validação de Entrada
- **Blacklist de Substrings (`SecurityValidator.cs` e `src/desktop/mock-agent.ts`)**:
  - Contém `ValidateNoArbitraryShell` que checa substrings como `"powershell.exe"`, `"cmd.exe"`, `"iex "`, `"wscript.shell"`.
  - Essa abordagem é frágil, suscetível a desvios triviais de codificação/ofuscação e passa uma falsa sensação de segurança.
- **Falta de Validação Rígida de Schema**: Em `MockAgentService.cs`, o JSON é inspecionado com `JsonDocument.Parse` buscando apenas propriedades soltas `"id"` e `"action"`, sem deserializar em DTOs fortemente tipados com validação de campos esperados.
- **Falta de Restrição de Navegação**: O WebView2 não implementa `NavigationStarting`, permitindo navegações arbitrárias para fora de `winlab.local` se houver links externos. Não há tratamento de `NewWindowRequested`.
- **Manifesto**: `app.manifest` declara `requestedExecutionLevel level="asInvoker"`. Embora impeça elevação automática da UI, não há mecanismo implementado para autenticar elevação administrative quando ações mutáveis forem necessárias.

### 1.7 Identificação de Dados Simulados na UI
- `src/app/desktop/page.tsx` exibe `"LAB-MICROLINS (Windows 11 Pro)"`, `"Readiness Score: 100/100"`, inventário de discos, usuários e softwares fictícios sem indicar ao operador que os dados são simulados.
- Não existe banner persistente informando: **"MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA"**.

### 1.8 Workflow de CI (`.github/workflows/ci.yml`)
- Possui dois jobs:
  1. `validate` em `ubuntu-latest`: executa `npm test`, `npm run typecheck`, `npm run build`.
  2. `windows-powershell` em `windows-latest`: executa `npm run fixtures` e `validate-generated-powershell.ps1`.
- **Ausência de CI para Desktop**: Não existe etapa de `setup-dotnet`, `dotnet restore`, `dotnet build desktop/WinLab.sln` ou testes em C#.

---

## 2. Logic Chain (Cadeia de Raciocínio Lógico)

1. **Premissa de Ciclo de Vida (.NET 8 vs .NET 10)**:
   - A política de suporte oficial da Microsoft encerra o suporte ao .NET 8 LTS em 10 de novembro de 2026.
   - O .NET 10 é a versão LTS seguinte com suporte até novembro de 2028.
   - Manter `net8.0-windows` em um produto que entra em fase de homologação em novembro de 2026 cria débito técnico imediato e viola o critério de homologação corporativa/educacional.
   - **Conclusão**: É indispensável migrar `desktop/src/WinLab.Desktop/WinLab.Desktop.csproj` para `net10.0-windows`, e atualizar os contratos e mocks para `netstandard2.0`/`net10.0`.

2. **Premissa de Distribuição Offline e Desacoplamento da Web**:
   - `MainWindow.xaml.cs` espera carregar `https://winlab.local/desktop/index.html` a partir de `wwwroot`.
   - O diretório `wwwroot` não existe e não é populado em nenhum ponto da compilação.
   - O Next.js está sem configuração de export estático (`output: 'export'`).
   - Sem export estático e sem a cópia dos artefatos para `wwwroot`, qualquer executável distribuído dependerá de ter o Node.js e `npm run dev` rodando na máquina cliente, falhando categoricamente no critério de aceitação de abrir em uma máquina Windows limpa.
   - **Conclusão**: É necessário:
     a) Adicionar `next.config.mjs` com `output: 'export'` e `trailingSlash: true` (ou script dedicado para build do frontend desktop).
     b) Criar script de empacotamento que copie o output (`out/`) para `desktop/src/WinLab.Desktop/wwwroot`.
     c) Configurar o `.csproj` do Desktop para incluir `wwwroot/**` com `<CopyToOutputDirectory>PreserveNewest</CopyToOutputDirectory>`.

3. **Premissa de Integridade e Funcionamento do IPC**:
   - O C# expõe uma ponte `WebViewBridge` que responde a `WebMessageReceived` e envia `PostWebMessageAsString`.
   - O frontend React atualmente ignora a ponte nativa e instancia um mock JavaScript local.
   - Se o frontend não utilizar `window.chrome.webview.postMessage`, a UI jamais conseguirá consultar inventário real do Windows ou executar ações reais quando o executor C# for introduzido.
   - **Conclusão**: É necessário criar uma camada de transporte IPC em TypeScript com detecção de ambiente:
     - Se `window.chrome?.webview?.postMessage` existir, despachar mensagens assíncronas para o C# com correlação de `id`/`replyToId`.
     - Se estiver rodando puramente no navegador web, usar o `MockDesktopAgent` como fallback de desenvolvimento.

4. **Premissa de Segurança do WebView2**:
   - Sem validação de `e.Source` no evento `WebMessageReceived`, qualquer origem que consiga ser carregada no controle pode enviar mensagens para o C#.
   - Sem interceptação em `NavigationStarting`, um usuário restrito ou link inadvertido pode navegar o controle para a internet aberta.
   - Com `AreDevToolsEnabled = true` em produção, o usuário Aluno pode abrir o DevTools (F12) e manipular o DOM ou chamar métodos JavaScript livremente.
   - **Conclusão**:
     - Restringir `e.Source` a `https://winlab.local/` (e em DEBUG permitir `http://localhost:3000/`).
     - Adicionar `NavigationStarting` cancelando qualquer navegação para fora das origens autorizadas.
     - Condicionar `AreDevToolsEnabled = false` em Release (`#if DEBUG`).
     - Desativar `AreDefaultContextMenusEnabled` em Release.

5. **Premissa de Segurança da Camada de Validação**:
   - Bloquear comandos por blacklist de strings (`powershell.exe`) é insuficiente e propenso a bypass.
   - O modelo de segurança deve ser baseado em:
     a) Enumeração e allowlist estrita de ações permitidas.
     b) Schemas fortemente tipados (DTOs) que não aceitam strings genéricas de comando.
     c) Separação clara de permissões por ação (leitura vs mutação com elevação).

6. **Premissa de Testabilidade e CI**:
   - A CI atual não compila os projetos C# da pasta `desktop/`. Uma quebra no C# passa despercebida na PR #24.
   - **Conclusão**: O workflow `.github/workflows/ci.yml` precisa incluir um job no runner `windows-latest` executando `dotnet restore desktop/WinLab.sln`, `dotnet build desktop/WinLab.sln -c Release` e execução de testes automatizados C#.

---

## 3. Caveats (Limitações e Áreas Não Investigadas)

1. **Ambiente Linux do Agente**:
   - O container de execução atual roda Ubuntu Linux sem .NET SDK e sem suporte a compilação WPF (que exige Windows SDK e targets específicos do Windows). A compilação do WPF e testes C# dependem dos runners Windows do GitHub Actions (`windows-latest`) ou de máquina Windows.
2. **Ausência de Serviço SYSTEM / Executor Elevado**:
   - Não foi analisada a implementação de um Windows Service real persistente, pois a especificação e o ADR-001 proíbem expressamente a instalação de serviços privilegiados nesta fase de fundação.
3. **Instaladores Avançados (WiX/MSIX)**:
   - A geração de instaladores MSI/MSIX requer ferramentas especializadas no Windows (como WiX Toolset v4 ou Inno Setup). A análise focou na viabilização da compilação e execução autocontida (`publish -r win-x64`) com `wwwroot` offline.

---

## 4. Conclusion (Conclusão e Recomendações Estruturadas)

A PR #24 estabeleceu uma base conceitual valiosa (ADR-001, contratos C# espelhados em TypeScript, mock em memória e testes unitários TypeScript). No entanto, **a fundação Desktop não está operacional como aplicativo instalável offline**:

1. **Desconexão Técnica Crítica**: A interface React roda isolada no navegador com seu próprio mock e não se comunica com a casca C# WPF.
2. **Ausência de Distribuição Offline**: Não há exportação de arquivos estáticos para `wwwroot`, gerando falha imediata na inicialização sem servidor Next.js.
3. **Débito de Plataforma**: O projeto WPF está configurado para .NET 8 (fim de suporte em 10/11/2026), precisando migrar para .NET 10 LTS.
4. **CI Incompleta**: Falta verificação automatizada de compilação da solução .NET no GitHub Actions.
5. **Lacunas de Segurança**: Faltam verificações de origem no WebView2, controle de navegação e desativação de DevTools em Release.

### Plano de Ação Recomendado para os Próximos Subagentes (M1)

| Etapa | Componente | Ação Proposta |
|---|---|---|
| **1** | `.csproj` / SDK | Migrar `WinLab.Desktop.csproj` para `<TargetFramework>net10.0-windows</TargetFramework>` e atualizar referências para .NET 10. |
| **2** | Next.js / Assets | Criar `next.config.mjs` com `output: 'export'` e `trailingSlash: true`. Criar script `npm run build:desktop` que executa a exportação e sincroniza a pasta `out/` com `desktop/src/WinLab.Desktop/wwwroot`. |
| **3** | Shell WPF (`MainWindow.xaml.cs`) | Endurecer o WebView2: validação de origem em `WebMessageReceived`, handlers para `NavigationStarting` e `NewWindowRequested`, desativar DevTools e ContextMenu em Release (`#if !DEBUG`). |
| **4** | Ponte IPC TypeScript | Atualizar `src/desktop/` para detectar `window.chrome.webview.postMessage` e implementar promessas com timeout e mapeamento de requisição/resposta, mantendo fallback para `MockDesktopAgent` em ambiente puramente web. |
| **5** | UI Desktop (`page.tsx`) | Adicionar banner persistente destacado: `[MODO DEMONSTRAÇÃO — DADOS FICTÍCIOS / NENHUMA POLÍTICA APLICADA]`. Desativar qualquer botão de aplicação real baseado no readiness simulado. |
| **6** | Contratos e Segurança | Refatorar `SecurityValidator.cs` e `mock-agent.ts` para focar na validação estrita de schema e allowlist de ações tipadas, sem depender exclusivamente de filtros de substring. |
| **7** | Testes e CI Windows | Adicionar projeto de testes C# (`WinLab.Contracts.Tests`) e integrar ao workflow `.github/workflows/ci.yml` os passos `dotnet restore`, `dotnet build` e `dotnet test` no runner Windows. |

---

## 5. Verification Method (Método de Verificação Independente)

Para auditar e reproduzir as constatações deste relatório:

1. **Inspeção de Versões e Configurações**:
   ```bash
   grep -rn "TargetFramework" desktop/
   grep -rn "AreDevToolsEnabled" desktop/
   ls -la desktop/src/WinLab.Desktop/wwwroot
   ```
   *Resultado esperado*: `net8.0-windows` no Desktop, `AreDevToolsEnabled = true` incondicional, e diretório `wwwroot` inexistente.

2. **Inspeção do Desacoplamento IPC na Interface React**:
   ```bash
   grep -rn "window.chrome" src/
   grep -rn "MockDesktopAgent" src/app/desktop/page.tsx
   ```
   *Resultado esperado*: `window.chrome` inexistente em `src/`; `new MockDesktopAgent()` instanciado diretamente no `page.tsx:30`.

3. **Verificação dos Testes Atuais**:
   ```bash
   npm test
   npm run typecheck
   ```
   *Resultado esperado*: 56 testes TypeScript passam, typecheck 100% verde, porém sem testes para o runtime C# ou compilação WPF.

4. **Verificação do Workflow de CI**:
   ```bash
   grep -rn "dotnet" .github/workflows/
   ```
   *Resultado esperado*: Nenhuma ocorrência de comandos `dotnet` na CI.
