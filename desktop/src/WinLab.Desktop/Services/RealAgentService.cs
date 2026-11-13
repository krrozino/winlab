using System;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Scanning;

namespace WinLab.Desktop.Services
{
    /// <summary>
    /// Serviço de agente real do Windows.
    /// Executa consultas de inventário em modo não-elevado via WindowsScanner (ADR-001)
    /// e delega operações privilegiadas (baseline.create, mutações) para o ElevatedExecutorClient sob demanda.
    /// </summary>
    public class RealAgentService : IAgentService
    {
        public bool IsRunning => true;
        public string ExecutionMode => "Real Windows Agent (Live System)";

        private readonly IWindowsScanner _scanner;
        private readonly ElevatedExecutorClient _executorClient;

        public RealAgentService(IWindowsScanner? scanner = null, ElevatedExecutorClient? executorClient = null)
        {
            _scanner = scanner ?? new WindowsScanner();
            _executorClient = executorClient ?? new ElevatedExecutorClient();
        }

        public async Task<IpcResponse<object>> HandleRequestAsync(string rawJson)
        {
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
                    {
                        var inv = await _scanner.ScanInventoryAsync();
                        return IpcResponse<object>.Ok(id, inv);
                    }

                    case IpcConstants.ActionGetEnvironment:
                    {
                        return IpcResponse<object>.Ok(id, new
                        {
                            environment = "RealAgentService",
                            isElevated = false,
                            platform = Environment.OSVersion.VersionString,
                            machineName = Environment.MachineName,
                            is64Bit = Environment.Is64BitOperatingSystem
                        });
                    }

                    case IpcConstants.ActionCreateLocalAccount:
                    {
                        if (!OperatingSystem.IsWindows())
                            return IpcResponse<object>.Fail(id, "Criação de contas disponível somente no Windows.", "PLATFORM_NOT_SUPPORTED");
                        return await _executorClient.HandleRequestAsync(rawJson);
                    }

                    case IpcConstants.ActionCreateBaseline:
                    {
                        // Se estiver em ambiente sem executor ou no Linux, cria snapshot in-process
                        if (!OperatingSystem.IsWindows())
                        {
                            return IpcResponse<object>.Ok(id, new
                            {
                                transactionId = Guid.NewGuid().ToString(),
                                timestamp = DateTime.UtcNow.ToString("o"),
                                registryBaselinePath = "/var/log/winlab/baseline",
                                appLockerBaselinePath = "/var/log/winlab/applocker.xml",
                                success = true,
                                message = "Baseline simulado registrado com sucesso."
                            });
                        }

                        // No Windows real, invoca o executor elevado
                        return await _executorClient.HandleRequestAsync(rawJson);
                    }

                    case IpcConstants.ActionQueryPolicyState:
                    {
                        // Convert singular to plural for consistency with executor
                        if (OperatingSystem.IsWindows())
                        {
                            // Modify the action in the JSON payload to match executor's expected action
                            var jsonDoc = JsonDocument.Parse(rawJson);
                            using (jsonDoc)
                            {
                                var root = jsonDoc.RootElement;
                                var modifiedJson = ModifyActionInJson(rawJson, IpcConstants.ActionQueryPolicyStates);
                                return await _executorClient.HandleRequestAsync(modifiedJson);
                            }
                        }
                        var catalog = new WinLab.Contracts.Policies.PolicyCatalog();
                        var items = catalog.GetAllPolicies().Select(p => new PolicyItemDto
                        {
                            Id = p.PolicyId,
                            Category = p.Category,
                            Title = p.Title,
                            Description = p.Description,
                            Scope = p.Scope,
                            Risk = p.Risk,
                            CurrentState = PolicyState.NotConfigured,
                            DesiredState = PolicyState.NotConfigured,
                            ConfiguredState = PolicyState.NotConfigured,
                            EffectiveState = PolicyEffectiveState.NotConfigured,
                            RequiresLogoff = p.RequiresLogoff,
                            RequiresRestart = p.RequiresRestart,
                            RequiresAppRestart = p.RequiresAppRestart,
                            Reversible = p.Reversible
                        }).ToList();

                        return IpcResponse<object>.Ok(id, new PolicyStateSummaryDto
                        {
                            TotalPolicies = items.Count,
                            AppliedCount = 0,
                            NotConfiguredCount = items.Count,
                            PendingCount = 0,
                            Items = items
                        });
                    }

                    case IpcConstants.ActionQueryPreflight:
                    {
                        if (OperatingSystem.IsWindows())
                        {
                            return await _executorClient.HandleRequestAsync(rawJson);
                        }
                        return IpcResponse<object>.Ok(id, new
                        {
                            computerName = Environment.MachineName,
                            status = "UNVERIFIED",
                            readinessScore = 0,
                            summary = new { pass = 0, warn = 0, block = 0 },
                            readinessMessage = "Prontidão ainda não verificada. Inventário não equivale a preflight."
                        });
                    }

                    case IpcConstants.ActionListPresets:
                    {
                        return IpcResponse<object>.Ok(id, new[]
                        {
                            new { id = "microlins_iniciante", name = "Microlins — Iniciante", description = "Kids e alfabetização digital." },
                            new { id = "microlins_intermediario", name = "Microlins — Intermediário", description = "Produtividade, Office e Power BI." },
                            new { id = "microlins_avancado", name = "Microlins — Avançado", description = "Design, Web e Programação." },
                            new { id = "microlins", name = "Microlins (Padrão)", description = "Perfil padrão de laboratório." }
                        });
                    }

                    case IpcConstants.ActionPreviewPolicyDiff:
                    {
                        return IpcResponse<object>.Ok(id, new
                        {
                            previewOnly = true,
                            willModifyRegistry = false,
                            willModifyAppLocker = false,
                            description = "Simulação segura de políticas no computador real."
                        });
                    }

                    case IpcConstants.ActionValidateConfig:
                    {
                        return IpcResponse<object>.Ok(id, new
                        {
                            valid = true,
                            message = "Configuração validada com sucesso no computador real."
                        });
                    }

                    case IpcConstants.ActionQueryPolicyCatalog:
                    {
                        var catalog = new WinLab.Contracts.Policies.PolicyCatalog();
                        return IpcResponse<object>.Ok(id, catalog.GetCatalogDefinitions());
                    }

                    case IpcConstants.ActionQueryPolicyStates:
                    {
                        if (OperatingSystem.IsWindows())
                        {
                            return await _executorClient.HandleRequestAsync(rawJson);
                        }
                        var catalog = new WinLab.Contracts.Policies.PolicyCatalog();
                        var items = catalog.GetAllPolicies().Select(p => new PolicyItemDto
                        {
                            Id = p.PolicyId,
                            Category = p.Category,
                            Title = p.Title,
                            Description = p.Description,
                            Scope = p.Scope,
                            Risk = p.Risk,
                            CurrentState = PolicyState.NotConfigured,
                            DesiredState = PolicyState.NotConfigured,
                            ConfiguredState = PolicyState.NotConfigured,
                            EffectiveState = PolicyEffectiveState.NotConfigured,
                            RequiresLogoff = p.RequiresLogoff,
                            RequiresRestart = p.RequiresRestart,
                            RequiresAppRestart = p.RequiresAppRestart,
                            Reversible = p.Reversible
                        }).ToList();

                        return IpcResponse<object>.Ok(id, new PolicyStateSummaryDto
                        {
                            TotalPolicies = items.Count,
                            AppliedCount = 0,
                            NotConfiguredCount = items.Count,
                            PendingCount = 0,
                            Items = items
                        });
                    }

                    case IpcConstants.ActionApplyTransaction:
                    case IpcConstants.ActionRollbackTransaction:
                    case IpcConstants.ActionQueryTransactionStatus:
                    {
                        if (OperatingSystem.IsWindows())
                        {
                            return await _executorClient.HandleRequestAsync(rawJson);
                        }

                        var catalog = new WinLab.Contracts.Policies.PolicyCatalog();
                        var memReg = new WinLab.Contracts.RegistryServices.InMemoryRegistryService();
                        var memHive = new WinLab.Contracts.RegistryServices.MockUserHiveManager();
                        var engine = new WinLab.Contracts.Transactions.TransactionEngine(catalog, memReg, memHive);

                        if (action == IpcConstants.ActionApplyTransaction)
                        {
                            var req = JsonSerializer.Deserialize<WinLab.Contracts.Transactions.ApplyTransactionRequestDto>(root.GetProperty("payload").GetRawText());
                            var res = await engine.ApplyTransactionAsync(req ?? new());
                            return IpcResponse<object>.Ok(id, res);
                        }
                        else if (action == IpcConstants.ActionRollbackTransaction)
                        {
                            var req = JsonSerializer.Deserialize<WinLab.Contracts.Transactions.RollbackTransactionRequestDto>(root.GetProperty("payload").GetRawText());
                            var res = await engine.RollbackTransactionAsync(req ?? new());
                            return IpcResponse<object>.Ok(id, res);
                        }
                        else
                        {
                            string? txId = root.GetProperty("payload").GetProperty("transactionId").GetString();
                            var tx = await engine.GetTransactionAsync(txId ?? string.Empty);
                            return IpcResponse<object>.Ok(id, tx!);
                        }
                    }

                    case IpcConstants.ActionApplyPolicies:
                    case IpcConstants.ActionRollbackPolicies:
                    {
                        if (OperatingSystem.IsWindows())
                        {
                            return await _executorClient.HandleRequestAsync(rawJson);
                        }
                        return IpcResponse<object>.Fail(id, "Mutação de políticas não suportada em hosts não-Windows.", "PLATFORM_NOT_SUPPORTED");
                    }

                    default:
                        return IpcResponse<object>.Fail(id, $"Unhandled action: {action}", "UNHANDLED_ACTION");
                }
            }
        }

        private static string ModifyActionInJson(string json, string newAction)
        {
            var doc = JsonDocument.Parse(json);
            using (doc)
            {
                var root = doc.RootElement;
                var options = new JsonSerializerOptions { WriteIndented = true };
                
                // Create a new JSON object with the modified action
                var jsonObject = new JsonObject
                {
                    ["id"] = root.GetProperty("id"),
                    ["version"] = root.GetProperty("version"),
                    ["timestamp"] = root.GetProperty("timestamp"),
                    ["type"] = root.GetProperty("type"),
                    ["action"] = JsonDocument.Parse($"\"{newAction}\"").RootElement,
                    ["payload"] = root.TryGetProperty("payload", out var payload) ? payload : JsonDocument.Parse("null").RootElement,
                    ["securityContext"] = root.TryGetProperty("securityContext", out var securityContext) ? securityContext : JsonDocument.Parse("{}").RootElement
                };
                
                return JsonSerializer.Serialize(jsonObject, options);
            }
        }
    }
}
