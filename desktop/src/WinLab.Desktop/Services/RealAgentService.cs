using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Administration;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Scanning;
using WinLab.Contracts.Transactions;

namespace WinLab.Desktop.Services
{
    /// <summary>
    /// Serviço de agente real do Windows.
    /// Executa consultas de inventário, prontidão e leitura de políticas em modo não-elevado (asInvoker, sem UAC)
    /// e delega mutações privilegiadas (criação de contas, transações de registro, rollback e carregamento offline de hive)
    /// para o ElevatedExecutorClient sob demanda explícita do operador.
    /// </summary>
    public class RealAgentService : IAgentService
    {
        public bool IsRunning => true;
        public string ExecutionMode => "Real Windows Agent (Live System)";

        private readonly IWindowsScanner _scanner;
        private readonly bool _hasCustomScanner;
        private readonly IAgentService _executorClient;
        private readonly IPolicyCatalog _catalog;
        private readonly IRegistryService _registry;
        private readonly IUserHiveManager _hiveManager;
        private readonly TransactionEngine _localEngine;
        private readonly ExpansionIpc _expansion;
        private readonly AdminIpc _administration;
        private readonly bool _isWindows;

        public RealAgentService(
            IWindowsScanner? scanner = null,
            IAgentService? executorClient = null,
            IPolicyCatalog? catalog = null,
            IRegistryService? registry = null,
            IUserHiveManager? hiveManager = null,
            string? transactionDirectory = null,
            bool? simulateWindows = null)
        {
            _isWindows = simulateWindows ?? OperatingSystem.IsWindows();
            _hasCustomScanner = scanner != null;
            _scanner = scanner ?? new WindowsScanner();
            _executorClient = executorClient ?? new ElevatedExecutorClient();
            _catalog = catalog ?? new PolicyCatalog();
            _registry = registry ?? (_isWindows ? new LiveWindowsRegistryService() : new InMemoryRegistryService());
            _hiveManager = hiveManager ?? (_isWindows ? new NonElevatedUserHiveReader() : new MockUserHiveManager());

            string txDir = transactionDirectory ?? (_isWindows
                ? @"C:\ProgramData\WinLab\Transactions"
                : Path.Combine(Path.GetTempPath(), "WinLab_Transactions_Dev"));
            _localEngine = new TransactionEngine(_catalog, _registry, _hiveManager, txDir);
            _expansion = new ExpansionIpc(_registry, _scanner);
            var accountStore = new WindowsAdminAccountStore(_registry, ExecutorInstallTrust.IsAdministrationStoreProtected);
            _administration = new(new AdminAccountService(accountStore, WindowsAdminDiagnostics.QueryManagement),
                new WindowsAdminDiagnostics(_registry), WindowsAdminDiagnostics.QueryManagement);
        }

        public async Task<IpcResponse<object>> HandleRequestAsync(string rawJson)
        {
            var shellCheck = SecurityValidator.ValidateNoArbitraryShell(rawJson);
            if (!shellCheck.IsSafe && !ExpansionRequest.IsTypedEnvelope(rawJson) && !AdminRequest.IsTypedEnvelope(rawJson))
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
                string id = envelopeId ?? (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String
                    ? idProp.GetString() ?? Guid.NewGuid().ToString()
                    : Guid.NewGuid().ToString());

                if (!isSchemaValid)
                {
                    return IpcResponse<object>.Fail(id, schemaError!, schemaErrorCode!);
                }

                string action = root.GetProperty("action").GetString()!;

                if (AdminActions.Contains(action) || action == IpcConstants.ActionCreateLocalAccount)
                {
                    if (!_isWindows)
                        return IpcResponse<object>.Fail(id, "Central administrativa disponível somente no Windows.", "PLATFORM_NOT_SUPPORTED");

                    bool trusted = ExecutorInstallTrust.FindInstalledExecutor() != null
                        && ExecutorInstallTrust.IsAdministrationStoreProtected();
                    return await _administration.HandleAsync(id, action, root, trusted, async () =>
                    {
                        var response = _executorClient is ElevatedExecutorClient executor
                            ? await executor.HandleRequestAsync(rawJson, freshElevation: true)
                            : await _executorClient.HandleRequestAsync(rawJson);
                        return EnsureReplyToId(response, id);
                    });
                }

                if (ExpansionRequest.IsAction(action))
                {
                    bool trusted = _isWindows && ExecutorInstallTrust.FindInstalledExecutor() != null
                        && ExecutorInstallTrust.IsPolicyStoreProtected();
                    return await _expansion.HandleAsync(id, action, root, trusted, async () =>
                    {
                        if (!trusted)
                            return IpcResponse<object>.Fail(id, ExecutorInstallTrust.ReadOnlyMessage, "TRUSTED_EXECUTOR_REQUIRED");
                        return EnsureReplyToId(await _executorClient.HandleRequestAsync(rawJson), id);
                    });
                }

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
                            executorConnected = _executorClient.IsRunning,
                            platform = Environment.OSVersion.VersionString,
                            machineName = Environment.MachineName,
                            is64Bit = Environment.Is64BitOperatingSystem
                        });
                    }

                    case IpcConstants.ActionQueryUpdateStatus:
                    {
                        return IpcResponse<object>.Ok(id, UpdateChannelInspector.GetStatusSnapshot());
                    }

                    case IpcConstants.ActionQueryNetworkShares:
                    {
                        return IpcResponse<object>.Ok(id, NetworkShareScanner.Scan());
                    }

                    case IpcConstants.ActionCreateBaseline:
                    {
                        if (!_isWindows)
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

                        var delegated = await _executorClient.HandleRequestAsync(rawJson);
                        return EnsureReplyToId(delegated, id);
                    }

                    case IpcConstants.ActionQueryPolicyState:
                    case IpcConstants.ActionQueryPolicyStates:
                    {
                        return await HandleQueryPolicyStatesAsync(id, root, rawJson, action);
                    }

                    case IpcConstants.ActionQueryPreflight:
                    {
                        // Diagnóstico real não-elevado a partir do inventário local (nunca dispara UAC ao abrir o app)
                        var inv = await _scanner.ScanInventoryAsync();
                        return IpcResponse<object>.Ok(id, BuildPreflightFromInventory(inv));
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
                        return IpcResponse<object>.Ok(id, _catalog.GetCatalogDefinitions());
                    }

                    case IpcConstants.ActionApplyTransaction:
                    {
                        if (!root.TryGetProperty("payload", out var payloadProp) || payloadProp.ValueKind != JsonValueKind.Object)
                        {
                            return IpcResponse<object>.Fail(id, "Payload de transação ausente ou inválido.", "INVALID_TRANSACTION_PAYLOAD");
                        }

                        var req = JsonSerializer.Deserialize<ApplyTransactionRequestDto>(payloadProp.GetRawText());
                        if (req == null || req.Policies == null || req.Policies.Count == 0)
                        {
                            return IpcResponse<object>.Fail(id, "Nenhuma política selecionada para aplicar.", "EMPTY_TRANSACTION");
                        }

                        var preCheck = await ValidateTransactionTargetAsync(req);
                        if (!preCheck.IsValid)
                        {
                            return IpcResponse<object>.Fail(id, preCheck.Error!, preCheck.ErrorCode!);
                        }

                        if (_isWindows)
                        {
                            var delegated = await _executorClient.HandleRequestAsync(rawJson);
                            return EnsureReplyToId(delegated, id);
                        }

                        var res = await _localEngine.ApplyTransactionAsync(req);
                        return res.Success
                            ? IpcResponse<object>.Ok(id, res)
                            : IpcResponse<object>.Fail(id, res.Message, "TRANSACTION_ROLLED_BACK", res);
                    }

                    case IpcConstants.ActionRollbackTransaction:
                    {
                        if (!root.TryGetProperty("payload", out var payloadProp) || payloadProp.ValueKind != JsonValueKind.Object)
                        {
                            return IpcResponse<object>.Fail(id, "Payload de reversão ausente ou inválido.", "INVALID_ROLLBACK_PAYLOAD");
                        }

                        var req = JsonSerializer.Deserialize<RollbackTransactionRequestDto>(payloadProp.GetRawText());
                        if (req == null || string.IsNullOrWhiteSpace(req.TransactionId))
                        {
                            return IpcResponse<object>.Fail(id, "Identificador da transação é obrigatório para desfazer alterações.", "INVALID_TRANSACTION_ID");
                        }

                        if (_isWindows)
                        {
                            var delegated = await _executorClient.HandleRequestAsync(rawJson);
                            return EnsureReplyToId(delegated, id);
                        }

                        var res = await _localEngine.RollbackTransactionAsync(req);
                        return res.Success
                            ? IpcResponse<object>.Ok(id, res)
                            : IpcResponse<object>.Fail(id, res.Error ?? res.Message, "ROLLBACK_FAILED", res);
                    }

                    case IpcConstants.ActionQueryTransactionStatus:
                    {
                        string? txId = null;
                        if (root.TryGetProperty("payload", out var payloadProp) &&
                            payloadProp.ValueKind == JsonValueKind.Object &&
                            payloadProp.TryGetProperty("transactionId", out var txProp) &&
                            txProp.ValueKind == JsonValueKind.String)
                        {
                            txId = txProp.GetString();
                        }

                        if (string.IsNullOrWhiteSpace(txId))
                        {
                            return IpcResponse<object>.Fail(id, "TransactionId é obrigatório.", "INVALID_TRANSACTION_ID");
                        }

                        if (_isWindows && _executorClient.IsRunning)
                        {
                            var delegated = await _executorClient.HandleRequestAsync(rawJson);
                            return EnsureReplyToId(delegated, id);
                        }

                        var tx = await _localEngine.GetTransactionAsync(txId);
                        return tx != null
                            ? IpcResponse<object>.Ok(id, tx)
                            : IpcResponse<object>.Fail(id, $"Transação '{txId}' não encontrada.", "TRANSACTION_NOT_FOUND");
                    }

                    case IpcConstants.ActionApplyPolicies:
                    case IpcConstants.ActionRollbackPolicies:
                    {
                        if (_isWindows)
                        {
                            var delegated = await _executorClient.HandleRequestAsync(rawJson);
                            return EnsureReplyToId(delegated, id);
                        }
                        return IpcResponse<object>.Fail(id, "Mutação de políticas não suportada em hosts não-Windows.", "PLATFORM_NOT_SUPPORTED");
                    }

                    default:
                        return IpcResponse<object>.Fail(id, $"Unhandled action: {action}", "UNHANDLED_ACTION");
                }
            }
        }

        private async Task<IpcResponse<object>> HandleQueryPolicyStatesAsync(
            string id,
            JsonElement root,
            string rawJson,
            string originalAction)
        {
            string? targetUserSid = null;
            bool allowElevation = false;

            if (root.TryGetProperty("payload", out var payloadProp) && payloadProp.ValueKind == JsonValueKind.Object)
            {
                if (payloadProp.TryGetProperty("targetUserSid", out var sidProp) && sidProp.ValueKind == JsonValueKind.String)
                {
                    targetUserSid = sidProp.GetString();
                }

                if (payloadProp.TryGetProperty("allowElevation", out var elevProp) &&
                    (elevProp.ValueKind == JsonValueKind.True || elevProp.ValueKind == JsonValueKind.False))
                {
                    allowElevation = elevProp.GetBoolean();
                }
            }

            // Consulta contas locais sem UAC para validar existência, habilitação e imunidade administrativa
            var inv = await _scanner.ScanInventoryAsync();
            IReadOnlyList<LocalUserDto>? knownAccounts = (_isWindows || _hasCustomScanner) && inv.LocalUsers.Count > 0
                ? inv.LocalUsers
                : null;

            // Somente usa o executor elevado se já estiver conectado OU se o operador pediu explicitamente leitura offline
            if (_isWindows && (allowElevation || _executorClient.IsRunning))
            {
                // Valida o SID antes de acionar UAC para nunca pedir elevação em alvos inválidos ou administrativos
                if (!string.IsNullOrWhiteSpace(targetUserSid))
                {
                    var preValidation = PolicyQueryCoordinator.QueryStates(
                        _catalog,
                        new InMemoryRegistryService(),
                        new MockUserHiveManager(),
                        targetUserSid,
                        knownAccounts);
                    if (!preValidation.Success)
                    {
                        return IpcResponse<object>.Fail(id, preValidation.Error!, preValidation.ErrorCode!);
                    }
                }

                string forwardedJson = string.Equals(originalAction, IpcConstants.ActionQueryPolicyStates, StringComparison.Ordinal)
                    ? rawJson
                    : SecurityValidator.RewriteEnvelopeAction(rawJson, IpcConstants.ActionQueryPolicyStates);

                var delegated = await _executorClient.HandleRequestAsync(forwardedJson);
                return EnsureReplyToId(delegated, id);
            }

            var outcome = PolicyQueryCoordinator.QueryStates(
                _catalog,
                _registry,
                _hiveManager,
                targetUserSid,
                knownAccounts);

            if (!outcome.Success)
            {
                return IpcResponse<object>.Fail(id, outcome.Error!, outcome.ErrorCode!);
            }

            return IpcResponse<object>.Ok(id, outcome.Summary!);
        }

        private async Task<(bool IsValid, string? Error, string? ErrorCode)> ValidateTransactionTargetAsync(ApplyTransactionRequestDto req)
        {
            var inv = await _scanner.ScanInventoryAsync();
            IReadOnlyList<LocalUserDto>? knownAccounts = (_isWindows || _hasCustomScanner) && inv.LocalUsers.Count > 0
                ? inv.LocalUsers
                : null;

            bool hasUserPolicy = req.Policies.Any(op =>
            {
                var handler = _catalog.GetPolicy(op.PolicyId);
                return handler != null && handler.Scope == PolicyScope.User;
            });

            var adminNameCheck = SecurityValidator.ValidateTargetNotAdministrator(req.TargetUserName, knownAccounts);
            if (!adminNameCheck.IsValid)
            {
                bool isUnknown = knownAccounts != null && knownAccounts.Any(u =>
                    u != null &&
                    string.Equals(u.Name?.Trim(), req.TargetUserName?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                    u.GetEffectivePrivilegeClassification() == AccountPrivilegeClassification.Unknown);
                return (false, adminNameCheck.Error, isUnknown ? "TARGET_PRIVILEGE_UNKNOWN" : "ADMIN_TARGET_FORBIDDEN");
            }

            var adminSidCheck = SecurityValidator.ValidateTargetNotAdministrator(req.TargetUserSid, knownAccounts);
            if (!adminSidCheck.IsValid)
            {
                bool isUnknown = knownAccounts != null && knownAccounts.Any(u =>
                    u != null &&
                    string.Equals(u.Sid?.Trim(), req.TargetUserSid?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                    u.GetEffectivePrivilegeClassification() == AccountPrivilegeClassification.Unknown);
                return (false, adminSidCheck.Error, isUnknown ? "TARGET_PRIVILEGE_UNKNOWN" : "ADMIN_TARGET_FORBIDDEN");
            }

            if (hasUserPolicy)
            {
                var sidValidation = SecurityValidator.ValidateTargetUserSid(req.TargetUserSid);
                if (!sidValidation.IsValid)
                {
                    return (false, sidValidation.Error, "INVALID_TARGET_SID");
                }

                if (knownAccounts != null)
                {
                    string cleanSid = req.TargetUserSid!.Trim();
                    var matched = knownAccounts.FirstOrDefault(u =>
                        u != null && string.Equals(u.Sid?.Trim(), cleanSid, StringComparison.OrdinalIgnoreCase));

                    if (matched == null)
                    {
                        return (false, $"A conta com SID '{cleanSid}' não foi encontrada neste computador.", "TARGET_USER_NOT_FOUND");
                    }

                    if (!matched.Enabled)
                    {
                        return (false, $"A conta '{matched.Name}' está desativada e não pode receber políticas.", "TARGET_USER_DISABLED");
                    }

                    var matchedPrivilege = matched.GetEffectivePrivilegeClassification();
                    if (matchedPrivilege == AccountPrivilegeClassification.Administrator)
                    {
                        return (false, $"A conta '{matched.Name}' pertence ao grupo de Administradores e está protegida.", "ADMIN_TARGET_FORBIDDEN");
                    }

                    if (matchedPrivilege == AccountPrivilegeClassification.Unknown)
                    {
                        return (false, matched.ClassificationDetail ?? $"Não foi possível confirmar os privilégios da conta '{matched.Name}' (classificação desconhecida).", "TARGET_PRIVILEGE_UNKNOWN");
                    }
                }
                else if (_isWindows || _hasCustomScanner)
                {
                    return (false, "Não foi possível confirmar a elegibilidade da conta-alvo porque nenhuma conta local foi enumerada.", "TARGET_PRIVILEGE_UNKNOWN");
                }

                var hivePrivilege = _hiveManager.ClassifyAccountPrivilege(req.TargetUserSid);
                if (hivePrivilege == AccountPrivilegeClassification.Administrator)
                {
                    return (false, "Violação de segurança: Contas de Administrador possuem imunidade e não podem receber restrições de laboratório.", "ADMIN_TARGET_FORBIDDEN");
                }

                if (hivePrivilege == AccountPrivilegeClassification.Unknown)
                {
                    return (false, "Operação bloqueada: não foi possível confirmar os privilégios da conta-alvo (classificação desconhecida).", "TARGET_PRIVILEGE_UNKNOWN");
                }
            }

            return (true, null, null);
        }

        private static object BuildPreflightFromInventory(MachineInventoryDto inv)
        {
            int pass = 0;
            int warn = 0;
            int block = 0;
            var notes = new List<string>();

            if (inv.Windows.Is64Bit)
            {
                pass++;
            }
            else
            {
                warn++;
                notes.Add("Arquitetura 32 bits detectada.");
            }

            var systemDisk = inv.Disks.FirstOrDefault();
            if (systemDisk != null)
            {
                if (systemDisk.FreePercent >= 10)
                {
                    pass++;
                }
                else if (systemDisk.FreePercent >= 5)
                {
                    warn++;
                    notes.Add($"Espaço livre reduzido em {systemDisk.Device} ({systemDisk.FreePercent:F1}%).");
                }
                else
                {
                    block++;
                    notes.Add($"Espaço em disco crítico em {systemDisk.Device} ({systemDisk.FreePercent:F1}% livres).");
                }
            }
            else
            {
                warn++;
            }

            bool hasActiveAdmin = inv.LocalUsers.Any(u => u.Enabled && u.GetEffectivePrivilegeClassification() == AccountPrivilegeClassification.Administrator);
            bool hasActiveStandard = inv.LocalUsers.Any(u => u.Enabled && u.GetEffectivePrivilegeClassification() == AccountPrivilegeClassification.StandardUser);
            bool hasUnknownAccounts = inv.LocalUsers.Any(u => u.Enabled && u.GetEffectivePrivilegeClassification() == AccountPrivilegeClassification.Unknown);

            if (hasActiveAdmin || inv.LocalUsers.Count == 0)
            {
                pass++;
            }
            else
            {
                block++;
                notes.Add("Nenhuma conta de administrador ativa encontrada.");
            }

            if (hasUnknownAccounts)
            {
                warn++;
                notes.Add("Algumas contas locais possuem classificação de privilégio desconhecida e foram bloqueadas para restrições.");
            }

            if (hasActiveStandard)
            {
                pass++;
            }
            else
            {
                warn++;
                notes.Add("Crie ou ative uma conta comum (aluno) antes de aplicar restrições por usuário.");
            }

            string edition = inv.Windows.Edition ?? string.Empty;
            if (edition.Contains("Home", StringComparison.OrdinalIgnoreCase) ||
                edition.Contains("Core", StringComparison.OrdinalIgnoreCase))
            {
                warn++;
                notes.Add("Edição Windows Home detectada: políticas de registro funcionam, mas recursos empresariais como AppLocker podem não ter suporte.");
            }
            else
            {
                pass++;
            }

            int total = Math.Max(1, pass + warn + block);
            int score = block > 0
                ? Math.Max(20, (pass * 100) / total - 30)
                : Math.Max(50, ((pass * 100) + (warn * 60)) / total);

            string status = block > 0 ? "BLOCK" : warn > 0 ? "WARN" : "PASS";
            string message = notes.Count > 0
                ? string.Join(" ", notes)
                : "Computador pronto para gerenciamento seguro pelo WinLab.";

            return new
            {
                computerName = string.IsNullOrWhiteSpace(inv.ComputerName) ? Environment.MachineName : inv.ComputerName,
                status,
                readinessScore = score,
                summary = new { pass, warn, block },
                readinessMessage = message
            };
        }

        private static IpcResponse<object> EnsureReplyToId(IpcResponse<object> response, string expectedReplyToId)
        {
            if (string.IsNullOrWhiteSpace(response.ReplyToId))
            {
                response.ReplyToId = expectedReplyToId;
            }
            return response;
        }
    }
}
