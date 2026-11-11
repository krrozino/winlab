using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Contracts;

namespace WinLab.Agent.Mock
{
    /// <summary>
    /// Serviço de desenvolvimento e testes simulando o agente Windows em memória.
    /// Opera com inventário somente leitura, catálogo de políticas e recusa operações privilegiadas.
    /// Não instala serviços nem altera o registro ou contas do sistema operacional.
    /// </summary>
    public class MockAgentService : IAgentService
    {
        public bool IsRunning { get; private set; } = true;
        public string ExecutionMode => "Unprivileged Mock (In-Memory Development)";

        public async Task<IpcResponse<object>> HandleRequestAsync(string rawJson)
        {
            await Task.Yield();

            var shellCheck = SecurityValidator.ValidateNoArbitraryShell(rawJson);
            if (!shellCheck.IsSafe)
            {
                return IpcResponse<object>.Fail(string.Empty, shellCheck.Error!, "FORBIDDEN_SHELL_INJECTION");
            }

            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(rawJson);
            }
            catch (Exception ex)
            {
                return IpcResponse<object>.Fail(string.Empty, $"Malformed JSON envelope: {ex.Message}", "MALFORMED_JSON");
            }

            using (doc)
            {
                var root = doc.RootElement;
                var (isSchemaValid, envelopeId, schemaError, schemaErrorCode) = SecurityValidator.ValidateEnvelopeSchema(root);
                string id = envelopeId ?? (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String ? idProp.GetString() ?? Guid.NewGuid().ToString() : Guid.NewGuid().ToString());

                if (!isSchemaValid)
                {
                    return IpcResponse<object>.Fail(id, schemaError!, schemaErrorCode!);
                }

                string action = root.GetProperty("action").GetString()!;

                switch (action)
            {
                case IpcConstants.ActionQueryInventory:
                    return IpcResponse<object>.Ok(id, GetMockInventory());

                case IpcConstants.ActionQueryPolicyState:
                    return IpcResponse<object>.Ok(id, GetMockPolicyState());

                case IpcConstants.ActionQueryPreflight:
                    return IpcResponse<object>.Ok(id, GetMockPreflight());

                case IpcConstants.ActionListPresets:
                    return IpcResponse<object>.Ok(id, GetMockPresets());

                case IpcConstants.ActionPreviewPolicyDiff:
                    return IpcResponse<object>.Ok(id, new
                    {
                        previewOnly = true,
                        willModifyRegistry = false,
                        willModifyAppLocker = false,
                        description = "Simulação segura de diff. Nenhuma alteração aplicada ao sistema nesta etapa."
                    });

                case IpcConstants.ActionCreateBaseline:
                    return IpcResponse<object>.Ok(id, new
                    {
                        transactionId = Guid.NewGuid().ToString(),
                        timestamp = DateTime.UtcNow.ToString("o"),
                        registryBaselinePath = @"C:\ProgramData\WinLab\Backups\Registry-Baseline-Mock",
                        appLockerBaselinePath = @"C:\ProgramData\WinLab\Backups\AppLocker-Baseline-Mock.xml",
                        success = true,
                        message = "Baseline inicial capturado e registrado com sucesso em ambiente de simulação."
                    });

                case IpcConstants.ActionGetEnvironment:
                    return IpcResponse<object>.Ok(id, new
                    {
                        environment = "MockAgent",
                        isElevated = false,
                        platform = "Simulated Windows"
                    });

                default:
                    return IpcResponse<object>.Fail(id, $"Unhandled action: {action}", "UNHANDLED_ACTION");
            }
            }
        }

        public MachineInventoryDto GetMockInventory()
        {
            return new MachineInventoryDto
            {
                ComputerName = "LAB-MICROLINS-01",
                ScannedAt = DateTime.UtcNow.ToString("o"),
                IsMock = true,
                Windows = new WindowsInfoDto
                {
                    Caption = "Windows 11 Pro",
                    Version = "10.0.26100",
                    BuildNumber = "26100",
                    Architecture = "64 bits",
                    Edition = "Professional",
                    DisplayVersion = "24H2",
                    Ubr = 1742,
                    Is64Bit = true,
                    TpmPresent = true,
                    TpmVersion = "2.0",
                    SecureBootEnabled = true
                },
                DetectedApps = new List<DetectedAppDto>
                {
                    new DetectedAppDto { Id = "chrome", Name = "Google Chrome", Path = @"C:\Program Files\Google\Chrome\Application\chrome.exe", Detected = true, Allowed = true },
                    new DetectedAppDto { Id = "office", Name = "Microsoft Office", Path = @"C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE", Detected = true, Allowed = true },
                    new DetectedAppDto { Id = "powerbi", Name = "Power BI Desktop", Path = @"C:\Program Files\Microsoft Power BI Desktop\bin\PBIDesktop.exe", Detected = true, Allowed = true },
                    new DetectedAppDto { Id = "vlc", Name = "VLC Media Player", Path = @"C:\Program Files\VideoLAN\VLC\vlc.exe", Detected = true, Allowed = true }
                },
                InstalledApps = new List<InstalledAppDto>
                {
                    new InstalledAppDto { DisplayName = "Google Chrome", DisplayVersion = "130.0.6723.117", Publisher = "Google LLC" },
                    new InstalledAppDto { DisplayName = "Microsoft 365 Apps for enterprise", DisplayVersion = "16.0.17932.20162", Publisher = "Microsoft Corporation" },
                    new InstalledAppDto { DisplayName = "Microsoft Power BI Desktop", DisplayVersion = "2.138.1004.0", Publisher = "Microsoft Corporation" }
                },
                LocalUsers = new List<LocalUserDto>
                {
                    new LocalUserDto { Name = "Administrador", Enabled = true, IsAdmin = true, Sid = "S-1-5-21-1000-500" },
                    new LocalUserDto { Name = "AdminLocal", Enabled = true, IsAdmin = true, Sid = "S-1-5-21-1000-1001" },
                    new LocalUserDto { Name = "Aluno", Enabled = true, IsAdmin = false, Sid = "S-1-5-21-1000-1002" }
                },
                Disks = new List<DiskInfoDto>
                {
                    new DiskInfoDto { Device = "C:", TotalGb = 237.5, FreeGb = 142.1, FreePercent = 59.8 }
                }
            };
        }

        public PolicyStateSummaryDto GetMockPolicyState()
        {
            return new PolicyStateSummaryDto
            {
                TotalPolicies = 6,
                AppliedCount = 0,
                NotConfiguredCount = 6,
                PendingCount = 0,
                Items = new List<PolicyItemDto>
                {
                    new PolicyItemDto
                    {
                        Id = "account.local_management",
                        Category = "Contas Locais",
                        Title = "Bloquear Gerenciamento de Contas Locais",
                        Description = "Impede que o usuário restrito acesse a página de contas ou crie novos usuários.",
                        Scope = PolicyScope.User,
                        Risk = PolicyRisk.Medium,
                        CurrentState = PolicyState.NotConfigured,
                        DesiredState = PolicyState.NotConfigured,
                        RequiresRestart = false,
                        RequiresLogoff = true
                    },
                    new PolicyItemDto
                    {
                        Id = "applocker.mode",
                        Category = "Controle de Aplicativos",
                        Title = "Modo de Aplicação do AppLocker",
                        Description = "AuditOnly registra execuções no EventLog sem bloquear aplicativos. Enabled impõe allowlist.",
                        Scope = PolicyScope.Device,
                        Risk = PolicyRisk.High,
                        CurrentState = PolicyState.NotConfigured,
                        DesiredState = PolicyState.NotConfigured,
                        RequiresRestart = false,
                        RequiresLogoff = false
                    },
                    new PolicyItemDto
                    {
                        Id = "browser.url_mode",
                        Category = "Navegador",
                        Title = "Controle de URLs (Chrome e Edge)",
                        Description = "Bloqueio ou liberação de domínios específicos nas políticas do Chrome e Edge.",
                        Scope = PolicyScope.User,
                        Risk = PolicyRisk.Medium,
                        CurrentState = PolicyState.NotConfigured,
                        DesiredState = PolicyState.NotConfigured,
                        RequiresRestart = false,
                        RequiresLogoff = false
                    },
                    new PolicyItemDto
                    {
                        Id = "usb.execution",
                        Category = "Armazenamento e USB",
                        Title = "Bloquear Execução de Arquivos em USB",
                        Description = "Permite ler e salvar arquivos no pendrive, mas impede a execução de binários (.exe).",
                        Scope = PolicyScope.Device,
                        Risk = PolicyRisk.High,
                        CurrentState = PolicyState.NotConfigured,
                        DesiredState = PolicyState.NotConfigured,
                        RequiresRestart = false,
                        RequiresLogoff = false
                    },
                    new PolicyItemDto
                    {
                        Id = "personalization.wallpaper",
                        Category = "Personalização",
                        Title = "Bloquear Alteração de Plano de Fundo",
                        Description = "Fixa o papel de parede do laboratório e desativa a personalização pelo aluno.",
                        Scope = PolicyScope.User,
                        Risk = PolicyRisk.Low,
                        CurrentState = PolicyState.NotConfigured,
                        DesiredState = PolicyState.NotConfigured,
                        RequiresRestart = false,
                        RequiresLogoff = true
                    },
                    new PolicyItemDto
                    {
                        Id = "maintenance.cleanup_profiles",
                        Category = "Manutenção",
                        Title = "Limpeza de Perfis Locais Inativos",
                        Description = "Gera relatório de perfis temporários inativos para manter espaço em disco.",
                        Scope = PolicyScope.Device,
                        Risk = PolicyRisk.Medium,
                        CurrentState = PolicyState.NotConfigured,
                        DesiredState = PolicyState.NotConfigured,
                        RequiresRestart = false,
                        RequiresLogoff = false
                    }
                }
            };
        }

        public object GetMockPreflight()
        {
            return new
            {
                computerName = "LAB-MICROLINS-01",
                status = "PASS",
                readinessScore = 100,
                summary = new
                {
                    pass = 10,
                    warn = 0,
                    block = 0
                },
                readinessMessage = "Computador apto para configuração em modo de piloto seguro (AuditOnly)."
            };
        }

        public object GetMockPresets()
        {
            return new[]
            {
                new { id = "microlins", name = "Microlins", description = "Alinhado à grade com Chrome, Office, Power BI e bloqueio de USB executável." },
                new { id = "escola", name = "Escola Geral", description = "Laboratório de informática compartilhado com restrições balanceadas." },
                new { id = "empresa", name = "Empresa / Kiosk", description = "Estação frontline ou escritório compartilhado." },
                new { id = "totem", name = "Totem", description = "Restrição máxima com interface direcionada a aplicativo único." }
            };
        }
    }
}
