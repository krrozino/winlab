# Especificação Técnica e Blueprint de Implementação — Milestone 2 (Features 11, 12 e 13)
**WinLab Desktop — Real Windows Scanner & Administrative Architecture**

- **Data**: 10 de novembro de 2026
- **Autor**: Explorer Subagent (`explorer_m2_1`)
- **Destinatário**: Project Orchestrator (`e7faf97beb4089c3940985d95c82590f`)
- **Escopo**:
  1. Feature 11: Real Windows System Scanner (OS caption/edition, versão, build, computer name, arquitetura 64-bit, status TPM e Secure Boot).
  2. Feature 12: Local Accounts Scanner (enumeração de contas locais, detecção do grupo Administradores, SIDs, status ativo/desabilitado).
  3. Feature 13: Installed Software Scanner (enumeração de softwares via HKLM/HKCU Uninstall de 64-bit, WOW6432Node de 32-bit e pacotes Appx/MSIX).

---

## 1. Observation (Análise e Mapeamento de Estado Atual)

### 1.1 Modelos Atuais em `desktop/src/WinLab.Contracts/InventoryModels.cs`
A inspeção do arquivo `InventoryModels.cs` revelou os seguintes contratos vigentes:
- `MachineInventoryDto`: Contém `ComputerName`, `ScannedAt`, `Windows` (`WindowsInfoDto`), `DetectedApps` (`List<DetectedAppDto>`), `InstalledApps` (`List<InstalledAppDto>`), `LocalUsers` (`List<LocalUserDto>`) e `Disks` (`List<DiskInfoDto>`).
- `WindowsInfoDto`: Possui apenas 4 campos:
  - `caption`: string (ex: `"Windows 11 Pro"`)
  - `version`: string (ex: `"10.0.26100"`)
  - `buildNumber`: string (ex: `"26100"`)
  - `architecture`: string (ex: `"64 bits"`)
  - **Lacuna identificada**: Não possui campos para `edition` (ex: `"Professional"`), `displayVersion` (ex: `"24H2"`), `ubr` (Update Build Revision), nem para **status de TPM** (`tpmPresent`, `tpmVersion`) e **Secure Boot** (`secureBootEnabled`).
- `LocalUserDto`:
  - `name`: string
  - `enabled`: bool
  - `isAdmin`: bool
  - `sid`: string?
  - **Status**: Cobre perfeitamente os requisitos da Feature 12.
- `InstalledAppDto`:
  - `displayName`: string
  - `displayVersion`: string
  - `publisher`: string
  - **Oportunidade**: Pode ser enriquecido com campos opcionais úteis para auditoria: `installLocation` (string?) e `isAppx` (bool?).
- `DetectedAppDto`:
  - `id`: string, `name`: string, `path`: string, `detected`: bool, `allowed`: bool.
  - Alinhado com o catálogo de 10 aplicativos homologados do WinLab (Chrome, Edge, Firefox, Word, Excel, PowerPoint, Power BI, Acrobat, VS Code, VLC).

### 1.2 Ausência de Implementação Real (Apenas Mock em Memória)
- O projeto `WinLab.Agent.Mock/MockAgentService.cs` apenas gera dados estáticos simulados (`LAB-MICROLINS-01`, 3 usuários mockados, 3 apps mockados).
- O script legado `artifacts/ci-scripts/scan-pc.ps1` executava `Get-CimInstance Win32_OperatingSystem`, `Get-LocalUser`, `Get-LocalGroupMember` e varredura de registro via PowerShell 5.1.
- No ambiente desktop, **não podemos nem devemos invocar `powershell.exe` ou `cmd.exe`** para fazer scanner:
  1. A política de segurança estrita do WinLab proíbe execução de shell arbitrário (`ValidateNoArbitraryShell`).
  2. O AppLocker em modo estrito bloqueia `powershell.exe` para alunos.
  3. O spawn de processos de shell adiciona 1.5 a 3.0 segundos de latência desnecessária.
  4. Antivírus e EDRs geram alertas de telemetria desnecessários para scripts de varredura.

### 1.3 Ambiente .NET 10 e Restrições de Plataforma no Repositório
- O SDK .NET instalado no ambiente é o **.NET 10 LTS (`10.0.404`)**.
- A biblioteca `Microsoft.NETCore.App.Ref/10.0.15` inclui nativamente em `net10.0`:
  - `Microsoft.Win32.Registry.dll` (acesso a hives HKLM, HKCU, views 64-bit e 32-bit).
  - `System.Security.Principal.Windows.dll` (`SecurityIdentifier`, `NTAccount`, `WellKnownSidType`).
- A biblioteca `System.DirectoryServices.AccountManagement` **NÃO** está no runtime padrão e exigiria um pacote NuGet externo pesado, com dependências complexas de COM/ADSI.
- **Ambiente de Testes / CI**: O repositório executa testes C# tanto em Linux (`ubuntu-latest` / ambiente de desenvolvimento) quanto em Windows (`desktop-windows` no GitHub Actions).
- Os testes locais executam via `/home/antigravity/.dotnet/dotnet test desktop/tests/WinLab.Tests/WinLab.Tests.csproj` (127 testes passando em ~2 segundos).
- **Implicação Arquitetural Crítica**: Qualquer scanner com chamadas P/Invoke (como `netapi32.dll` ou `tbs.dll`) falharia no Linux com `DllNotFoundException` ou `PlatformNotSupportedException` se não for estritamente guardado por `OperatingSystem.IsWindows()` e suportado por interfaces mockáveis para testes unitários em Linux.

---

## 2. Logic Chain (Cadeia Lógica de Decisões Técnicas e Arquitetura)

### 2.1 Princípio de Execução Não-Privilegiada (`asInvoker`)
A UI do WinLab Desktop roda em contexto de usuário comum (`asInvoker`). Para que o inventário funcione de imediato ao abrir o app (inclusive na primeira execução ou sob conta restrita), **todas as leituras do inventário devem ser realizáveis sem elevação UAC**:
- Leitura do registro em `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion` é permitida a usuários comuns.
- Leitura de `HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State` é permitida a usuários comuns.
- Consulta de TPM via `tbs.dll!Tbsi_GetDeviceInfo` é permitida a usuários comuns.
- Enumeração de usuários via `netapi32.dll!NetUserEnum` (nível 1) e membros de grupo local via `NetLocalGroupGetMembers` é permitida a usuários comuns.
- Leitura de chaves de desinstalação em `HKLM\SOFTWARE\...\Uninstall` e `HKCU\...\Uninstall` é permitida a usuários comuns.
- Enumeração de pacotes Appx em `HKCU\Software\Classes\Local Settings\...` é permitida ao usuário logado.
- *Nota de Segurança*: A hive `HKLM\SAM` **exige** SYSTEM/Administrador e portanto é rejeitada como método de listagem de contas locais. O NetAPI (`netapi32.dll`) é o canal oficial homologado pela Microsoft.

### 2.2 Feature 11: Real Windows System Scanner — Decisões de API
1. **OS Caption, Version, Build e Edition**:
   - Fonte primária: Registro em `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`:
     - `ProductName` (ex: `"Windows 10 Pro"` ou `"Windows 11 Pro"`).
     - `EditionID` (ex: `"Professional"`).
     - `DisplayVersion` (ex: `"24H2"`, com fallback para `ReleaseId`).
     - `CurrentBuild` / `CurrentBuildNumber` (ex: `"26100"`).
     - `UBR` (DWORD, ex: `1742`).
   - *Correção de Branding do Windows 11*: Se `CurrentBuildNumber >= 22000`, mas `ProductName` retornar `"Windows 10 Pro"` (comportamento de compatibilidade de legado da Microsoft em algumas instalações), o scanner substitui `"Windows 10"` por `"Windows 11"`.
   - Versão completa do kernel: `10.0.{CurrentBuildNumber}.{UBR}`.
2. **TPM (Trusted Platform Module)**:
   - Abordagem selecionada: P/Invoke nativo para `tbs.dll!Tbsi_GetDeviceInfo`.
   - Vantagens:
     - Sub-milissegundo (<0.2 ms), sem alocação pesada.
     - Não depende do serviço WMI estar rodando.
     - Retorna código `TBS_SUCCESS (0)` e a versão exata do TPM (`tpmVersion = 2` para TPM 2.0; `1` para TPM 1.2).
     - Se retornar `TBS_E_TPM_NOT_FOUND (0x80284000)`, o TPM está ausente ou desabilitado na BIOS/UEFI.
   - Fallback passivo: Inspeção da chave de registro de drivers `HKLM\SYSTEM\CurrentControlSet\Services\TPM`.
3. **Secure Boot**:
   - Abordagem selecionada: Registro do kernel do Windows em `HKLM\SYSTEM\CurrentControlSet\Control\SecureBoot\State`.
   - Valor DWORD `UEFISecureBootEnabled`:
     - `1` = Secure Boot Ativo e Verificado pelo UEFI.
     - `0` = Secure Boot Desabilitado no firmware.
     - Chave ausente = Boot em Legacy BIOS (sem suporte a UEFI).
   - Por que registro em vez de `kernel32.dll!GetFirmwareEnvironmentVariable`? Porque `GetFirmwareEnvironmentVariable` exige o privilégio administrativo `SE_SYSTEM_ENVIRONMENT_NAME`, que falharia no contexto padrão (`asInvoker`), enquanto a chave de registro do kernel é legível por qualquer processo padrão.
4. **Armazenamento e Discos**:
   - `System.IO.DriveInfo.GetDrives()` nativo do .NET 10.
   - Filtra unidades prontas (`IsReady`) e do tipo `Fixed` ou drive do sistema.
   - Calcula `TotalGb`, `FreeGb` e `FreePercent`.

### 2.3 Feature 12: Local Accounts Scanner — Decisões de API
1. **Enumeração de Usuários Locais**:
   - Abordagem selecionada: `netapi32.dll!NetUserEnum` com nível `USER_INFO_1` e filtro `FILTER_NORMAL_ACCOUNT (0x0002)`.
   - Vantagens sobre WMI: Executa em 2ms versus 5000ms+ do WMI em computadores de rede.
   - Vantagens sobre `DirectoryServices`: Zero pacotes externos, sem travamentos caso o computador esteja desplugado de um domínio.
   - Status Ativo/Desabilitado: Avaliado pelo bit `UF_ACCOUNTDISABLE (0x0002)` em `usri1_flags`. Se ativo no bit, `Enabled = false`.
2. **Identificação do Grupo de Administradores**:
   - **Problema de Localização**: No Windows em português o grupo chama-se `"Administradores"`, em inglês `"Administrators"`, em alemão `"Administratoren"`. Nunca se deve filtrar pelo nome literal em string!
   - **Solução Determinística por SID**:
     O SID do grupo Builtin Administrators é universal e imutável: `S-1-5-32-544` (`WellKnownSidType.BuiltinAdministratorsSid`).
     Resolvemos o nome localizado através de:
     ```csharp
     var adminSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
     var localizedName = ((NTAccount)adminSid.Translate(typeof(NTAccount))).Value;
     ```
   - Consultamos os membros via `netapi32.dll!NetLocalGroupGetMembers` (nível 2, que retorna os SIDs diretamente via ponteiro `PSID`).
3. **Resolução de SIDs dos Usuários**:
   - Para cada conta retornada por `NetUserEnum`, resolve-se o SID via:
     ```csharp
     var account = new NTAccount(Environment.MachineName, user.usri1_name);
     var sid = (SecurityIdentifier)account.Translate(typeof(SecurityIdentifier));
     ```
   - O usuário com RID 500 (`*-500`, Administrador interno) é sempre marcado como administrador por definição de segurança.

### 2.4 Feature 13: Installed Software Scanner — Decisões de API
1. **Chaves de Desinstalação do Registro**:
   - Para cobrir todos os aplicativos sem depender do bitness do processo de execução, usamos `RegistryKey.OpenBaseKey` com as views adequadas:
     - View 64-bit: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` (aplicativos x64 nativos).
     - View 32-bit: `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` em `RegistryView.Registry32` (mapeia automaticamente para `WOW6432Node` em sistemas x64).
     - View Current User: `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall` (aplicativos instalados por usuário, como Chrome, VS Code ou Teams instalados em AppData).
2. **Critérios de Filtro e Higienização**:
   - Descartar entradas onde `DisplayName` é nulo, vazio ou somente espaços.
   - Descartar entradas com `SystemComponent == 1` (componentes internos do SO).
   - Descartar entradas com `ParentKeyName != null` (patches e add-ons de outros programas).
   - Descartar entradas onde `ReleaseType` contenha `"Update"`, `"Hotfix"` ou `"Security Update"`.
   - Tratar chaves de registro corrompidas ou com tipos de dados inesperados com bloco `try/catch` individual por subchave.
3. **Pacotes Appx / Modern / MSIX**:
   - Usuário logado: `HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages`.
   - Filtrar frameworks internos da Microsoft (`Microsoft.VCLibs`, `Microsoft.NET.Native`, `Microsoft.UI.Xaml`).
   - Resolver nomes indiretos (`@{...}`) via P/Invoke `shlwapi.dll!SHLoadIndirectString` ou derivar o nome amigável a partir do prefixo do pacote.
4. **Deduplicação e Ordenação**:
   - Deduplicar pela tupla normalizada `(DisplayName.Trim(), DisplayVersion.Trim())`.
   - Ordenação alfabética por `DisplayName`.
5. **Verificação do Catálogo de Aplicativos Conhecidos (`DetectedApps`)**:
   - Varredura nos 10 aplicativos do catálogo com `Environment.ExpandEnvironmentVariables` e `File.Exists`.

---

## 3. Caveats (Ressalvas, Riscos de Borda e Mitigações)

| # | Risco / Ressalva | Impacto | Mitigação Arquitetural |
|---|-------------------|---------|------------------------|
| 1 | Execução de testes no Linux (`WinLab.Tests`) | Falha catastrófica ao tentar carregar `netapi32.dll` ou `tbs.dll`. | Isolar todo P/Invoke e acesso a registro sob checagens `OperatingSystem.IsWindows()`. Criar interfaces mockáveis (`IRegistryAccessor`, `IAccountAccessor`) para possibilitar testes de 100% da lógica de negócio e parsing no Linux. |
| 2 | String de `ProductName` enganosa no Windows 11 | Algumas compilações do Win11 mantêm `"Windows 10 Pro"` na chave `ProductName` para compatibilidade com instaladores legados. | Checar se `CurrentBuildNumber >= 22000`. Se for verdadeiro, renomear explicitamente `"Windows 10"` para `"Windows 11"`. |
| 3 | Localização de grupos do Windows | Nomes literais como `"Administrators"` falham em Windows PT-BR (`"Administradores"`), FR, DE, etc. | Utilizar exclusivamente o SID fixo `S-1-5-32-544` e resolver o nome localizado via `SecurityIdentifier.Translate(typeof(NTAccount))` em tempo de execução. |
| 4 | Permissão insuficiente em chaves SAM | Tentar ler contas locais via registro `HKLM\SAM` falha com `UnauthorizedAccessException` em processos não elevados (`asInvoker`). | Jamais acessar `HKLM\SAM`. Utilizar `netapi32.dll!NetUserEnum` nível 1, que é garantido pela Microsoft para usuários não elevados. |
| 5 | Chaves de desinstalação de registro corrompidas | Valores inválidos (ex: `DisplayName` gravado como binário DWORD ou string gigante) quebram a iteração. | Leitura defensiva `as string` com bloco de tratamento individual por chave, garantindo que uma chave corrompida não aborte a listagem dos outros 200 softwares. |
| 6 | Nomes indiretos de Appx (`@{resource}`) | Aplicativos da Windows Store exibem nomes crípticos como `@{Microsoft.WindowsTerminal_1.18...}` em vez do título visual. | Empregar `shlwapi.dll!SHLoadIndirectString` com fallback limpo para o nome da família de pacotes sem a extensão hash. |
| 7 | Computador em domínio corporativo | `NetUserEnum` pode tentar contatar o Active Directory se o parâmetro do servidor for incorreto. | Passar explicitamente `servername = null` (força escopo estritamente local da máquina) e `filter = FILTER_NORMAL_ACCOUNT`. |

---

## 4. Conclusion (Especificação Completa das Interfaces, DTOs e Implementações)

### 4.1 Atualização de Modelos em `WinLab.Contracts`

#### 4.1.1 Enriquecimento de `WindowsInfoDto`
```csharp
namespace WinLab.Contracts
{
    public class WindowsInfoDto
    {
        [JsonPropertyName("caption")]
        public string Caption { get; set; } = string.Empty;

        [JsonPropertyName("version")]
        public string Version { get; set; } = string.Empty;

        [JsonPropertyName("buildNumber")]
        public string BuildNumber { get; set; } = string.Empty;

        [JsonPropertyName("architecture")]
        public string Architecture { get; set; } = string.Empty;

        [JsonPropertyName("edition")]
        public string Edition { get; set; } = string.Empty;

        [JsonPropertyName("displayVersion")]
        public string DisplayVersion { get; set; } = string.Empty;

        [JsonPropertyName("ubr")]
        public int? Ubr { get; set; }

        [JsonPropertyName("is64Bit")]
        public bool Is64Bit { get; set; } = true;

        [JsonPropertyName("tpmPresent")]
        public bool TpmPresent { get; set; }

        [JsonPropertyName("tpmVersion")]
        public string? TpmVersion { get; set; }

        [JsonPropertyName("secureBootEnabled")]
        public bool SecureBootEnabled { get; set; }
    }
}
```

#### 4.1.2 Enriquecimento de `InstalledAppDto`
```csharp
namespace WinLab.Contracts
{
    public class InstalledAppDto
    {
        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("displayVersion")]
        public string DisplayVersion { get; set; } = string.Empty;

        [JsonPropertyName("publisher")]
        public string Publisher { get; set; } = string.Empty;

        [JsonPropertyName("installLocation")]
        public string? InstallLocation { get; set; }

        [JsonPropertyName("isAppx")]
        public bool IsAppx { get; set; }
    }
}
```

### 4.2 Interfaces do Scanner

```csharp
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace WinLab.Contracts
{
    /// <summary>
    /// Orquestrador unificado de scanner do Windows.
    /// </summary>
    public interface IWindowsScanner
    {
        Task<MachineInventoryDto> ScanInventoryAsync(CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Scanner de dados do Sistema Operacional, Discos, TPM e Secure Boot (Feature 11).
    /// </summary>
    public interface ISystemInfoScanner
    {
        WindowsInfoDto ScanWindowsInfo();
        List<DiskInfoDto> ScanDisks();
    }

    /// <summary>
    /// Scanner de Contas Locais e Grupos de Administração (Feature 12).
    /// </summary>
    public interface ILocalAccountsScanner
    {
        List<LocalUserDto> ScanAccounts();
    }

    /// <summary>
    /// Scanner de Softwares Instalados no Registro e Appx (Feature 13).
    /// </summary>
    public interface IInstalledSoftwareScanner
    {
        List<InstalledAppDto> ScanInstalledSoftware();
        List<DetectedAppDto> ScanCatalogApps();
    }

    /// <summary>
    /// Contrato de serviço do agente para permitir alternância transparente
    /// entre MockAgentService (Demo/Testes) e RealAgentService (Computador Real).
    /// </summary>
    public interface IAgentService
    {
        bool IsRunning { get; }
        string ExecutionMode { get; }
        Task<IpcResponse<object>> HandleRequestAsync(string rawJson);
    }
}
```

### 4.3 Blueprint de Implementação: Feature 11 (`SystemInfoScanner.cs`)

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace WinLab.Contracts.Scanning
{
    public class SystemInfoScanner : ISystemInfoScanner
    {
        public WindowsInfoDto ScanWindowsInfo()
        {
            if (!OperatingSystem.IsWindows())
            {
                return new WindowsInfoDto
                {
                    Caption = RuntimeInformation.OSDescription,
                    Version = Environment.OSVersion.Version.ToString(),
                    BuildNumber = "0",
                    Architecture = RuntimeInformation.OSArchitecture.ToString(),
                    Edition = "Non-Windows Host",
                    DisplayVersion = "N/A",
                    Is64Bit = Environment.Is64BitOperatingSystem,
                    TpmPresent = false,
                    TpmVersion = null,
                    SecureBootEnabled = false
                };
            }

            var info = new WindowsInfoDto
            {
                Architecture = Environment.Is64BitOperatingSystem ? "64 bits" : "32 bits",
                Is64Bit = Environment.Is64BitOperatingSystem
            };

            // 1. Registro do Windows NT: CurrentVersion
            try
            {
                using var cvKey = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
                if (cvKey != null)
                {
                    string productName = cvKey.GetValue("ProductName") as string ?? "Windows";
                    string editionId = cvKey.GetValue("EditionID") as string ?? string.Empty;
                    string displayVersion = cvKey.GetValue("DisplayVersion") as string 
                                            ?? cvKey.GetValue("ReleaseId") as string 
                                            ?? string.Empty;
                    string buildNumber = cvKey.GetValue("CurrentBuildNumber") as string 
                                         ?? cvKey.GetValue("CurrentBuild") as string 
                                         ?? Environment.OSVersion.Version.Build.ToString();
                    int ubr = Convert.ToInt32(cvKey.GetValue("UBR", 0));

                    info.Edition = editionId;
                    info.DisplayVersion = displayVersion;
                    info.BuildNumber = buildNumber;
                    info.Ubr = ubr > 0 ? ubr : null;
                    info.Version = ubr > 0 ? $"10.0.{buildNumber}.{ubr}" : $"10.0.{buildNumber}";

                    // Correção inteligente para Windows 11
                    if (int.TryParse(buildNumber, out int buildInt) && buildInt >= 22000)
                    {
                        if (productName.StartsWith("Windows 10", StringComparison.OrdinalIgnoreCase))
                        {
                            info.Caption = productName.Replace("Windows 10", "Windows 11");
                        }
                        else
                        {
                            info.Caption = string.IsNullOrEmpty(productName) ? $"Windows 11 {editionId}".Trim() : productName;
                        }
                    }
                    else
                    {
                        info.Caption = productName;
                    }
                }
            }
            catch
            {
                info.Caption = RuntimeInformation.OSDescription;
                info.Version = Environment.OSVersion.Version.ToString();
                info.BuildNumber = Environment.OSVersion.Version.Build.ToString();
            }

            // 2. Status do Secure Boot (Registro do Kernel)
            try
            {
                using var sbKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\SecureBoot\State");
                if (sbKey != null)
                {
                    int uefiSecureBoot = Convert.ToInt32(sbKey.GetValue("UEFISecureBootEnabled", 0));
                    info.SecureBootEnabled = (uefiSecureBoot == 1);
                }
                else
                {
                    info.SecureBootEnabled = false;
                }
            }
            catch
            {
                info.SecureBootEnabled = false;
            }

            // 3. Status do TPM via tbs.dll
            try
            {
                var tpmResult = NativeTpm.GetTpmStatus();
                info.TpmPresent = tpmResult.IsPresent;
                info.TpmVersion = tpmResult.Version;
            }
            catch
            {
                info.TpmPresent = false;
                info.TpmVersion = null;
            }

            return info;
        }

        public List<DiskInfoDto> ScanDisks()
        {
            var result = new List<DiskInfoDto>();
            try
            {
                string systemRoot = Path.GetPathRoot(Environment.SystemDirectory) ?? "C:\\";
                foreach (var drive in DriveInfo.GetDrives())
                {
                    if (!drive.IsReady) continue;
                    if (drive.DriveType != DriveType.Fixed && !drive.Name.Equals(systemRoot, StringComparison.OrdinalIgnoreCase))
                        continue;

                    double totalGb = Math.Round((double)drive.TotalSize / (1024 * 1024 * 1024), 1);
                    double freeGb = Math.Round((double)drive.AvailableFreeSpace / (1024 * 1024 * 1024), 1);
                    double freePercent = totalGb > 0 ? Math.Round((freeGb / totalGb) * 100, 1) : 0;

                    result.Add(new DiskInfoDto
                    {
                        Device = drive.Name.TrimEnd('\\'),
                        TotalGb = totalGb,
                        FreeGb = freeGb,
                        FreePercent = freePercent
                    });
                }
            }
            catch
            {
                // Fallback seguro caso haja restrição
                result.Add(new DiskInfoDto { Device = "C:", TotalGb = 0, FreeGb = 0, FreePercent = 0 });
            }

            return result;
        }

        private static class NativeTpm
        {
            [StructLayout(LayoutKind.Sequential)]
            private struct TPM_DEVICE_INFO
            {
                public uint structVersion;
                public uint tpmVersion;
                public uint tpmInterfaceType;
                public uint tpmImpVersion;
            }

            [DllImport("tbs.dll", CharSet = CharSet.Unicode)]
            private static extern uint Tbsi_GetDeviceInfo(uint size, out TPM_DEVICE_INFO info);

            public static (bool IsPresent, string? Version) GetTpmStatus()
            {
                if (!OperatingSystem.IsWindows()) return (false, null);

                try
                {
                    var info = new TPM_DEVICE_INFO { structVersion = 1 };
                    uint status = Tbsi_GetDeviceInfo((uint)Marshal.SizeOf<TPM_DEVICE_INFO>(), out info);
                    if (status == 0) // TBS_SUCCESS
                    {
                        string version = info.tpmVersion == 2 ? "2.0" : (info.tpmVersion == 1 ? "1.2" : $"v{info.tpmVersion}");
                        return (true, version);
                    }
                }
                catch
                {
                    // Fallback passivo no registro
                    try
                    {
                        using var tpmKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\TPM");
                        if (tpmKey != null) return (true, "Detectado via Driver");
                    }
                    catch { }
                }

                return (false, null);
            }
        }
    }
}
```

### 4.4 Blueprint de Implementação: Feature 12 (`LocalAccountsScanner.cs`)

```csharp
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;

namespace WinLab.Contracts.Scanning
{
    public class LocalAccountsScanner : ILocalAccountsScanner
    {
        public List<LocalUserDto> ScanAccounts()
        {
            if (!OperatingSystem.IsWindows())
            {
                return new List<LocalUserDto>
                {
                    new LocalUserDto { Name = Environment.UserName, Enabled = true, IsAdmin = true, Sid = "S-1-5-21-NON-WINDOWS" }
                };
            }

            var adminSids = GetAdminMemberSids();
            var users = new List<LocalUserDto>();

            IntPtr bufPtr = IntPtr.Zero;
            try
            {
                uint entriesRead = 0;
                uint totalEntries = 0;
                uint resumeHandle = 0;

                // Nível 1: USER_INFO_1
                uint status = NativeNetApi.NetUserEnum(
                    null,
                    1,
                    NativeNetApi.FILTER_NORMAL_ACCOUNT,
                    out bufPtr,
                    NativeNetApi.MAX_PREFERRED_LENGTH,
                    out entriesRead,
                    out totalEntries,
                    ref resumeHandle
                );

                if (status == 0 && bufPtr != IntPtr.Zero)
                {
                    int structSize = Marshal.SizeOf<NativeNetApi.USER_INFO_1>();
                    for (int i = 0; i < entriesRead; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(bufPtr, i * structSize);
                        var user = Marshal.PtrToStructure<NativeNetApi.USER_INFO_1>(currentPtr);

                        string name = user.usri1_name ?? string.Empty;
                        if (string.IsNullOrWhiteSpace(name)) continue;

                        bool isEnabled = (user.usri1_flags & NativeNetApi.UF_ACCOUNTDISABLE) == 0;
                        string? sid = ResolveUserSid(name);

                        // Administrador se estiver no grupo Administradores ou se for a conta de RID 500
                        bool isAdmin = (sid != null && adminSids.Contains(sid)) ||
                                       (sid != null && sid.EndsWith("-500", StringComparison.OrdinalIgnoreCase));

                        users.Add(new LocalUserDto
                        {
                            Name = name,
                            Enabled = isEnabled,
                            IsAdmin = isAdmin,
                            Sid = sid
                        });
                    }
                }
            }
            catch
            {
                // Fallback defensivo: conta atual
                users.Add(new LocalUserDto
                {
                    Name = Environment.UserName,
                    Enabled = true,
                    IsAdmin = IsCurrentProcessElevated(),
                    Sid = WindowsIdentity.GetCurrent().User?.Value
                });
            }
            finally
            {
                if (bufPtr != IntPtr.Zero)
                {
                    NativeNetApi.NetApiBufferFree(bufPtr);
                }
            }

            return users;
        }

        private HashSet<string> GetAdminMemberSids()
        {
            var adminSids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!OperatingSystem.IsWindows()) return adminSids;

            IntPtr bufPtr = IntPtr.Zero;
            try
            {
                // 1. Resolução do nome localizado do grupo a partir do SID canônico S-1-5-32-544
                var adminGroupSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
                var adminGroupAccount = (NTAccount)adminGroupSid.Translate(typeof(NTAccount));
                string groupFullName = adminGroupAccount.Value;
                string groupName = groupFullName.Contains('\\') ? groupFullName.Split('\\')[1] : groupFullName;

                uint entriesRead = 0;
                uint totalEntries = 0;
                IntPtr resumeHandle = IntPtr.Zero;

                // Nível 2: LOCALGROUP_MEMBERS_INFO_2 (contém o ponteiro de SID lgrmi2_sid)
                uint status = NativeNetApi.NetLocalGroupGetMembers(
                    null,
                    groupName,
                    2,
                    out bufPtr,
                    NativeNetApi.MAX_PREFERRED_LENGTH,
                    out entriesRead,
                    out totalEntries,
                    ref resumeHandle
                );

                if (status == 0 && bufPtr != IntPtr.Zero)
                {
                    int structSize = Marshal.SizeOf<NativeNetApi.LOCALGROUP_MEMBERS_INFO_2>();
                    for (int i = 0; i < entriesRead; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(bufPtr, i * structSize);
                        var member = Marshal.PtrToStructure<NativeNetApi.LOCALGROUP_MEMBERS_INFO_2>(currentPtr);
                        if (member.lgrmi2_sid != IntPtr.Zero)
                        {
                            try
                            {
                                var sid = new SecurityIdentifier(member.lgrmi2_sid);
                                adminSids.Add(sid.Value);
                            }
                            catch { }
                        }
                    }
                }
            }
            catch { }
            finally
            {
                if (bufPtr != IntPtr.Zero)
                {
                    NativeNetApi.NetApiBufferFree(bufPtr);
                }
            }

            return adminSids;
        }

        private static string? ResolveUserSid(string userName)
        {
            try
            {
                var account = new NTAccount(Environment.MachineName, userName);
                return ((SecurityIdentifier)account.Translate(typeof(SecurityIdentifier))).Value;
            }
            catch
            {
                try
                {
                    var account = new NTAccount(userName);
                    return ((SecurityIdentifier)account.Translate(typeof(SecurityIdentifier))).Value;
                }
                catch
                {
                    return null;
                }
            }
        }

        private static bool IsCurrentProcessElevated()
        {
            try
            {
                var identity = WindowsIdentity.GetCurrent();
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }

        private static class NativeNetApi
        {
            public const uint FILTER_NORMAL_ACCOUNT = 0x0002;
            public const uint MAX_PREFERRED_LENGTH = 0xFFFFFFFF;
            public const uint UF_ACCOUNTDISABLE = 0x0002;

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public struct USER_INFO_1
            {
                public string usri1_name;
                public string usri1_password;
                public uint usri1_password_age;
                public uint usri1_priv;
                public string usri1_home_dir;
                public string usri1_comment;
                public uint usri1_flags;
                public string usri1_script_path;
            }

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public struct LOCALGROUP_MEMBERS_INFO_2
            {
                public IntPtr lgrmi2_sid;
                public int lgrmi2_sidusage;
                public string lgrmi2_domainandname;
            }

            [DllImport("netapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern uint NetUserEnum(
                string? servername,
                uint level,
                uint filter,
                out IntPtr bufptr,
                uint prefmaxlen,
                out uint entriesread,
                out uint totalentries,
                ref uint resume_handle);

            [DllImport("netapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern uint NetLocalGroupGetMembers(
                string? servername,
                string groupname,
                uint level,
                out IntPtr bufptr,
                uint prefmaxlen,
                out uint entriesread,
                out uint totalentries,
                ref IntPtr resumehandle);

            [DllImport("netapi32.dll", SetLastError = true)]
            public static extern uint NetApiBufferFree(IntPtr buffer);
        }
    }
}
```

### 4.5 Blueprint de Implementação: Feature 13 (`InstalledSoftwareScanner.cs`)

```csharp
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

namespace WinLab.Contracts.Scanning
{
    public class InstalledSoftwareScanner : IInstalledSoftwareScanner
    {
        public List<InstalledAppDto> ScanInstalledSoftware()
        {
            if (!OperatingSystem.IsWindows())
            {
                return new List<InstalledAppDto>
                {
                    new InstalledAppDto { DisplayName = ".NET SDK", DisplayVersion = Environment.Version.ToString(), Publisher = "Microsoft" }
                };
            }

            var apps = new List<InstalledAppDto>();

            // 1. Registro de Desinstalação (64-bit, 32-bit e HKCU)
            var targets = new (RegistryHive Hive, RegistryView View, string SubKey)[]
            {
                (RegistryHive.LocalMachine, RegistryView.Registry64, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                (RegistryHive.LocalMachine, RegistryView.Registry32, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                (RegistryHive.CurrentUser, RegistryView.Default, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
            };

            foreach (var target in targets)
            {
                try
                {
                    using var baseKey = RegistryKey.OpenBaseKey(target.Hive, target.View);
                    using var uninstallKey = baseKey.OpenSubKey(target.SubKey, false);
                    if (uninstallKey == null) continue;

                    foreach (var subKeyName in uninstallKey.GetSubKeyNames())
                    {
                        try
                        {
                            using var appKey = uninstallKey.OpenSubKey(subKeyName, false);
                            if (appKey == null) continue;

                            string? displayName = appKey.GetValue("DisplayName") as string;
                            if (string.IsNullOrWhiteSpace(displayName)) continue;

                            int systemComponent = Convert.ToInt32(appKey.GetValue("SystemComponent", 0));
                            if (systemComponent == 1) continue;

                            string? parentKeyName = appKey.GetValue("ParentKeyName") as string;
                            if (!string.IsNullOrEmpty(parentKeyName)) continue;

                            string? releaseType = appKey.GetValue("ReleaseType") as string;
                            if (!string.IsNullOrEmpty(releaseType) &&
                                (releaseType.Contains("Update", StringComparison.OrdinalIgnoreCase) ||
                                 releaseType.Contains("Hotfix", StringComparison.OrdinalIgnoreCase)))
                            {
                                continue;
                            }

                            string displayVersion = appKey.GetValue("DisplayVersion") as string ?? string.Empty;
                            string publisher = appKey.GetValue("Publisher") as string ?? string.Empty;
                            string? installLocation = appKey.GetValue("InstallLocation") as string;

                            apps.Add(new InstalledAppDto
                            {
                                DisplayName = displayName.Trim(),
                                DisplayVersion = displayVersion.Trim(),
                                Publisher = publisher.Trim(),
                                InstallLocation = string.IsNullOrWhiteSpace(installLocation) ? null : installLocation.Trim(),
                                IsAppx = false
                            });
                        }
                        catch { }
                    }
                }
                catch { }
            }

            // 2. Pacotes Appx / Store instalados para o usuário
            try
            {
                using var appxKey = Registry.CurrentUser.OpenSubKey(@"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages");
                if (appxKey != null)
                {
                    foreach (var pkgName in appxKey.GetSubKeyNames())
                    {
                        if (pkgName.StartsWith("Microsoft.VCLibs", StringComparison.OrdinalIgnoreCase) ||
                            pkgName.StartsWith("Microsoft.NET.", StringComparison.OrdinalIgnoreCase) ||
                            pkgName.StartsWith("Microsoft.UI.Xaml", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        try
                        {
                            using var pkgSubKey = appxKey.OpenSubKey(pkgName, false);
                            if (pkgSubKey == null) continue;

                            string? rawDisplayName = pkgSubKey.GetValue("DisplayName") as string;
                            string? publisher = pkgSubKey.GetValue("PublisherDisplayName") as string ?? "Microsoft Corporation";

                            string cleanName = ResolveAppxDisplayName(rawDisplayName, pkgName);
                            if (string.IsNullOrWhiteSpace(cleanName)) continue;

                            string version = ExtractVersionFromPackageName(pkgName);

                            apps.Add(new InstalledAppDto
                            {
                                DisplayName = cleanName,
                                DisplayVersion = version,
                                Publisher = publisher,
                                IsAppx = true
                            });
                        }
                        catch { }
                    }
                }
            }
            catch { }

            // 3. Deduplicação e Ordenação
            return apps
                .GroupBy(a => (a.DisplayName.ToLowerInvariant(), a.DisplayVersion.ToLowerInvariant()))
                .Select(g => g.First())
                .OrderBy(a => a.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        public List<DetectedAppDto> ScanCatalogApps()
        {
            var detected = new List<DetectedAppDto>();

            var catalog = new (string Id, string Name, string[] CandidatePaths)[]
            {
                ("chrome", "Google Chrome", new[]
                {
                    @"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
                    @"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
                    @"%LocalAppData%\Google\Chrome\Application\chrome.exe"
                }),
                ("edge", "Microsoft Edge", new[]
                {
                    @"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
                    @"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
                }),
                ("firefox", "Mozilla Firefox", new[]
                {
                    @"%ProgramFiles%\Mozilla Firefox\firefox.exe",
                    @"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
                }),
                ("word", "Microsoft Word", new[]
                {
                    @"%ProgramFiles%\Microsoft Office\root\Office16\WINWORD.EXE",
                    @"%ProgramFiles(x86)%\Microsoft Office\root\Office16\WINWORD.EXE"
                }),
                ("excel", "Microsoft Excel", new[]
                {
                    @"%ProgramFiles%\Microsoft Office\root\Office16\EXCEL.EXE",
                    @"%ProgramFiles(x86)%\Microsoft Office\root\Office16\EXCEL.EXE"
                }),
                ("powerpoint", "Microsoft PowerPoint", new[]
                {
                    @"%ProgramFiles%\Microsoft Office\root\Office16\POWERPNT.EXE",
                    @"%ProgramFiles(x86)%\Microsoft Office\root\Office16\POWERPNT.EXE"
                }),
                ("powerbi", "Power BI Desktop", new[]
                {
                    @"%ProgramFiles%\Microsoft Power BI Desktop\bin\PBIDesktop.exe",
                    @"%ProgramFiles(x86)%\Microsoft Power BI Desktop\bin\PBIDesktop.exe"
                }),
                ("acrobat", "Adobe Acrobat / Reader", new[]
                {
                    @"%ProgramFiles%\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
                    @"%ProgramFiles(x86)%\Adobe\Acrobat Reader\Reader\AcroRd32.exe"
                }),
                ("vscode", "Visual Studio Code", new[]
                {
                    @"%ProgramFiles%\Microsoft VS Code\Code.exe",
                    @"%ProgramFiles(x86)%\Microsoft VS Code\Code.exe",
                    @"%LocalAppData%\Programs\Microsoft VS Code\Code.exe"
                }),
                ("vlc", "VLC Media Player", new[]
                {
                    @"%ProgramFiles%\VideoLAN\VLC\vlc.exe",
                    @"%ProgramFiles(x86)%\VideoLAN\VLC\vlc.exe"
                })
            };

            foreach (var item in catalog)
            {
                string? matchedPath = null;
                foreach (var candidate in item.CandidatePaths)
                {
                    string expanded = Environment.ExpandEnvironmentVariables(candidate);
                    if (File.Exists(expanded))
                    {
                        matchedPath = expanded;
                        break;
                    }
                }

                detected.Add(new DetectedAppDto
                {
                    Id = item.Id,
                    Name = item.Name,
                    Path = matchedPath ?? string.Empty,
                    Detected = matchedPath != null,
                    Allowed = matchedPath != null
                });
            }

            return detected;
        }

        private static string ResolveAppxDisplayName(string? rawDisplayName, string packageName)
        {
            if (string.IsNullOrWhiteSpace(rawDisplayName))
            {
                return CleanPackageFamilyName(packageName);
            }

            if (rawDisplayName.StartsWith("@", StringComparison.Ordinal) && OperatingSystem.IsWindows())
            {
                try
                {
                    var sb = new StringBuilder(512);
                    int hr = NativeShlwapi.SHLoadIndirectString(rawDisplayName, sb, (uint)sb.Capacity, IntPtr.Zero);
                    if (hr == 0 && sb.Length > 0)
                    {
                        return sb.ToString();
                    }
                }
                catch { }

                return CleanPackageFamilyName(packageName);
            }

            return rawDisplayName;
        }

        private static string CleanPackageFamilyName(string packageName)
        {
            // Exemplo: Microsoft.WindowsTerminal_1.18.3181.0_x64__8wekyb3d8bbwe -> Windows Terminal
            var parts = packageName.Split('_');
            if (parts.Length > 0)
            {
                string id = parts[0];
                if (id.StartsWith("Microsoft.", StringComparison.OrdinalIgnoreCase))
                {
                    id = id.Substring("Microsoft.".Length);
                }
                return id;
            }
            return packageName;
        }

        private static string ExtractVersionFromPackageName(string packageName)
        {
            var parts = packageName.Split('_');
            return parts.Length >= 2 ? parts[1] : string.Empty;
        }

        private static class NativeShlwapi
        {
            [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
            public static extern int SHLoadIndirectString(
                string pszSource,
                StringBuilder pszOutBuf,
                uint cchOutBuf,
                IntPtr ppvReserved);
        }
    }
}
```

### 4.6 Blueprint do Orquestrador Unificado: `WindowsScanner.cs`

```csharp
using System;
using System.Threading;
using System.Threading.Tasks;

namespace WinLab.Contracts.Scanning
{
    public class WindowsScanner : IWindowsScanner
    {
        private readonly ISystemInfoScanner _systemInfoScanner;
        private readonly ILocalAccountsScanner _accountsScanner;
        private readonly IInstalledSoftwareScanner _softwareScanner;

        public WindowsScanner(
            ISystemInfoScanner? systemInfoScanner = null,
            ILocalAccountsScanner? accountsScanner = null,
            IInstalledSoftwareScanner? softwareScanner = null)
        {
            _systemInfoScanner = systemInfoScanner ?? new SystemInfoScanner();
            _accountsScanner = accountsScanner ?? new LocalAccountsScanner();
            _softwareScanner = softwareScanner ?? new InstalledSoftwareScanner();
        }

        public async Task<MachineInventoryDto> ScanInventoryAsync(CancellationToken cancellationToken = default)
        {
            await Task.Yield();

            var winInfo = _systemInfoScanner.ScanWindowsInfo();
            var disks = _systemInfoScanner.ScanDisks();
            var users = _accountsScanner.ScanAccounts();
            var installedApps = _softwareScanner.ScanInstalledSoftware();
            var detectedCatalog = _softwareScanner.ScanCatalogApps();

            return new MachineInventoryDto
            {
                ComputerName = Environment.MachineName,
                ScannedAt = DateTime.UtcNow.ToString("o"),
                Windows = winInfo,
                Disks = disks,
                LocalUsers = users,
                InstalledApps = installedApps,
                DetectedApps = detectedCatalog
            };
        }
    }
}
```

---

## 5. Verification Method (Plano de Testes, Cobertura Cruzada e Validação)

### 5.1 Testes Unitários Multiplataforma (Linux & Windows)
Adicionar classe `desktop/tests/WinLab.Tests/WindowsScannerTests.cs` cobrindo:
1. **Guarda de Plataforma Segura**:
   - Executar `SystemInfoScanner`, `LocalAccountsScanner` e `InstalledSoftwareScanner` no Linux via `/home/antigravity/.dotnet/dotnet test`.
   - Assegurar que nenhum método lança exceções de plataforma (`PlatformNotSupportedException` ou `DllNotFoundException`).
   - Validar que o `MachineInventoryDto` retornado possui valores padrão consistentes e serializa perfeitamente para JSON.
2. **Deduplicação de Aplicativos**:
   - Testar que softwares repetidos em views diferentes de registro são agrupados sem duplicatas no array final.
3. **Filtro de Componentes de Sistema**:
   - Testar que entradas com `SystemComponent == 1` e `ReleaseType == "Hotfix"` são descartadas.
4. **Resolução de Windows 11**:
   - Testar o algoritmo de branding que converte `"Windows 10 Pro"` com build 26100 para `"Windows 11 Pro"`.
5. **Compatibilidade com o Schema IPC**:
   - Validar que a resposta de `WindowsScanner.ScanInventoryAsync()` quando envelopada em `IpcResponse<MachineInventoryDto>` é validada com sucesso pelo `SecurityValidator.ValidateEnvelopeSchema()`.

### 5.2 Testes de Integração no Windows (GitHub Actions CI)
No job `desktop-windows` do `.github/workflows/ci.yml`:
1. Executar `dotnet test desktop/WinLab.sln -c Release` na VM `windows-latest`.
2. Validar que:
   - `Windows.Caption` contém `"Windows Server"` ou `"Windows 11"`.
   - `Windows.BuildNumber` é numérico e > 19000.
   - `Windows.Architecture` é `"64 bits"`.
   - `Disks` contém o drive `C:` com capacidade > 0.
   - `LocalUsers` contém pelo menos um usuário administrador.
   - `InstalledApps` contém pacotes de runtime instalados pela VM do GitHub Actions.

---
**Status da Especificação**: PRONTO PARA EXECUÇÃO PELOS WORKERS E AUDITORES DO MILESTONE 2.
