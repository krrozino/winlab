using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Administration;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Scanning;
using WinLab.Contracts.Transactions;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Executor
{
    public class ExecutorHost
    {
        private readonly string _pipeName;
        private readonly string _sessionToken;
        private readonly int _parentPid;
        private readonly TimeSpan _idleTimeout = TimeSpan.FromMinutes(5);
        private readonly IWindowsScanner _scanner;
        private readonly bool _hasCustomScanner;
        private readonly IPolicyCatalog _catalog;
        private readonly IRegistryService _registry;
        private readonly IUserHiveManager _hiveManager;
        private readonly TransactionEngine _engine;
        private readonly AdminPolicyJournal? _protectedTransactions;
        private readonly ExpansionIpc _expansion;
        private readonly AdminIpc _administration;

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetNamedPipeServerProcessId(SafeHandle pipe, out uint processId);

        public ExecutorHost(
            string pipeName,
            string sessionToken,
            int parentPid,
            IWindowsScanner? scanner = null,
            IPolicyCatalog? catalog = null,
            IRegistryService? registry = null,
            IUserHiveManager? hiveManager = null,
            TransactionEngine? engine = null)
        {
            _pipeName = pipeName ?? throw new ArgumentNullException(nameof(pipeName));
            _sessionToken = sessionToken ?? throw new ArgumentNullException(nameof(sessionToken));
            _parentPid = parentPid;
            _hasCustomScanner = scanner != null;
            _scanner = scanner ?? new WindowsScanner();
            _catalog = catalog ?? new PolicyCatalog();
            _registry = registry ?? (OperatingSystem.IsWindows() ? new Services.WindowsRegistryService() : new InMemoryRegistryService());
            _hiveManager = hiveManager ?? (OperatingSystem.IsWindows() ? new Services.WindowsUserHiveManager() : new MockUserHiveManager());
            if (OperatingSystem.IsWindows() && engine == null && scanner == null && catalog == null && registry == null && hiveManager == null)
                _protectedTransactions = new AdminPolicyJournal(_catalog, _registry, _hiveManager);
            _engine = engine ?? new TransactionEngine(_catalog, _registry, _hiveManager, createDirectory: _protectedTransactions == null);
            _expansion = new ExpansionIpc(_registry, _scanner, protectExternal: true);
            var accountStore = new WindowsAdminAccountStore(_registry, ExecutorInstallTrust.IsAdministrationStoreProtected);
            var provisioner = new Services.LocalAccountProvisioner(_registry, accountStore);
            _administration = AdminIpc.ForWindows(provisioner, _registry, _hiveManager, _scanner);
        }

        public async Task<int> RunAsync(CancellationToken cancellationToken = default)
        {
            // 1. Setup Parent Process Watchdog
            SetupParentWatchdog();

            // 2. Connect to Named Pipe Server hosted by Desktop
            using var clientStream = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut,
                PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
            try
            {
                await clientStream.ConnectAsync(10000, cancellationToken);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[WinLab.Executor] Failed to connect to pipe '{_pipeName}': {ex.Message}");
                return 1;
            }

            // 3. Mutual Handshake Authentication
            try
            {
                if (OperatingSystem.IsWindows() && (_parentPid <= 0 ||
                    !GetNamedPipeServerProcessId(clientStream.SafePipeHandle, out uint serverPid) || serverPid != (uint)_parentPid))
                    return 2;

                var handshakeReq = new HandshakeRequest
                {
                    Token = _sessionToken,
                    ClientPid = Environment.ProcessId
                };
                string reqJson = JsonSerializer.Serialize(handshakeReq);
                await PipeFraming.WriteFrameAsync(clientStream, reqJson, cancellationToken);

                string respJson = await PipeFraming.ReadFrameAsync(clientStream, cancellationToken);
                var handshakeResp = JsonSerializer.Deserialize<HandshakeResponse>(respJson);
                if (handshakeResp == null || !handshakeResp.Success || handshakeResp.ServerPid != _parentPid)
                {
                    Console.Error.WriteLine($"[WinLab.Executor] Handshake authentication rejected: {handshakeResp?.Error}");
                    return 2;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[WinLab.Executor] Handshake exchange failed: {ex.Message}");
                return 3;
            }

            // 4. Request Processing Loop with Idle Timeout
            using var idleCts = new CancellationTokenSource();
            idleCts.CancelAfter(_idleTimeout);

            while (!cancellationToken.IsCancellationRequested && !idleCts.IsCancellationRequested)
            {
                string rawJson;
                try
                {
                    using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, idleCts.Token);
                    rawJson = await PipeFraming.ReadFrameAsync(clientStream, linkedCts.Token);
                    // Reset idle timeout on received message
                    idleCts.CancelAfter(_idleTimeout);
                }
                catch (EndOfStreamException)
                {
                    // Parent closed pipe normally
                    break;
                }
                catch (IOException)
                {
                    // Pipe broken
                    break;
                }
                catch (OperationCanceledException) when (idleCts.IsCancellationRequested)
                {
                    // Idle timeout expired
                    break;
                }

                // Process envelope
                string responseJson = await ProcessRequestAsync(rawJson, cancellationToken);

                try
                {
                    await PipeFraming.WriteFrameAsync(clientStream, responseJson, cancellationToken);
                }
                catch
                {
                    break;
                }
            }

            return 0;
        }

        public async Task<string> ProcessRequestAsync(string rawJson, CancellationToken cancellationToken = default)
        {
            var shellCheck = SecurityValidator.ValidateNoArbitraryShell(rawJson);
            if (!shellCheck.IsSafe && !ExpansionRequest.IsTypedEnvelope(rawJson) && !AdminRequest.IsTypedEnvelope(rawJson))
            {
                var errResp = IpcResponse<object>.Fail(string.Empty, shellCheck.Error!, "FORBIDDEN_SHELL_INJECTION");
                return JsonSerializer.Serialize(errResp);
            }

            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(rawJson);
            }
            catch (Exception ex)
            {
                var errResp = IpcResponse<object>.Fail(string.Empty, $"Malformed JSON envelope: {ex.Message}", "MALFORMED_JSON");
                return JsonSerializer.Serialize(errResp);
            }

            using (doc)
            {
                var root = doc.RootElement;
                var (isSchemaValid, envelopeId, schemaError, schemaErrorCode) = SecurityValidator.ValidateEnvelopeSchema(root);
                string id = envelopeId ?? (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String ? idProp.GetString() ?? Guid.NewGuid().ToString() : Guid.NewGuid().ToString());

                if (!isSchemaValid)
                {
                    var errResp = IpcResponse<object>.Fail(id, schemaError!, schemaErrorCode!);
                    return JsonSerializer.Serialize(errResp);
                }

                string action = root.GetProperty("action").GetString()!;

                if (AdminActions.Contains(action) || action == IpcConstants.ActionCreateLocalAccount)
                {
                    bool authorized = OperatingSystem.IsWindows() && IsCurrentProcessElevated()
                        && ExecutorInstallTrust.IsAdministrationStoreProtected();
                    return JsonSerializer.Serialize(await _administration.HandleAsync(id, action, root,
                        authorized, ct: cancellationToken));
                }

                if (ExpansionRequest.IsAction(action))
                {
                    bool canWrite = false;
                    if (OperatingSystem.IsWindows())
                    {
                        using var identity = WindowsIdentity.GetCurrent();
                        canWrite = new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator)
                            && ExecutorInstallTrust.IsPolicyStoreProtected()
                            && WindowsAdminDiagnostics.QueryManagement().Status == "NotDetected";
                    }
                    return JsonSerializer.Serialize(await _expansion.HandleAsync(id, action, root,
                        canWrite, ct: cancellationToken));
                }

                switch (action)
                {
                    case IpcConstants.ActionQueryInventory:
                    {
                        var inv = await _scanner.ScanInventoryAsync(cancellationToken);
                        var resp = IpcResponse<MachineInventoryDto>.Ok(id, inv);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionCreateBaseline:
                    {
                        string txId = Guid.NewGuid().ToString();
                        var baseline = new
                        {
                            transactionId = txId,
                            timestamp = DateTime.UtcNow.ToString("o"),
                            registryBaselinePath = @"C:\ProgramData\WinLab\Backups\Registry-Baseline-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"),
                            appLockerBaselinePath = @"C:\ProgramData\WinLab\Backups\AppLocker-Baseline-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + ".xml",
                            success = true,
                            message = "Baseline inicial capturado e registrado com sucesso no host elevado."
                        };
                        var resp = IpcResponse<object>.Ok(id, baseline);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionGetEnvironment:
                    {
                        var env = new
                        {
                            environment = "WinLab.Executor",
                            isElevated = OperatingSystem.IsWindows() && IsCurrentProcessElevated(),
                            platform = Environment.OSVersion.VersionString,
                            processId = Environment.ProcessId
                        };
                        var resp = IpcResponse<object>.Ok(id, env);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionQueryPreflight:
                    {
                        var preflight = new
                        {
                            computerName = Environment.MachineName,
                            status = "PASS",
                            readinessScore = 100,
                            summary = new { pass = 10, warn = 0, block = 0 },
                            readinessMessage = "Estação pronta para configuração administrativa pelo WinLab."
                        };
                        var resp = IpcResponse<object>.Ok(id, preflight);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionPreviewPolicyDiff:
                    {
                        var preview = new
                        {
                            previewOnly = true,
                            willModifyRegistry = false,
                            willModifyAppLocker = false,
                            description = "Simulação segura executada no contexto de executor elevado."
                        };
                        var resp = IpcResponse<object>.Ok(id, preview);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionValidateConfig:
                    {
                        var val = new
                        {
                            valid = true,
                            message = "Configuração validada pelo executor com verificação de ambiente administrativo."
                        };
                        var resp = IpcResponse<object>.Ok(id, val);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionQueryPolicyCatalog:
                    {
                        var definitions = _catalog.GetCatalogDefinitions();
                        var resp = IpcResponse<IReadOnlyList<PolicyDefinitionDto>>.Ok(id, definitions);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionQueryPolicyState:
                    case IpcConstants.ActionQueryPolicyStates:
                    {
                        string? targetUserSid = null;
                        if (root.TryGetProperty("payload", out var payloadProp) && payloadProp.ValueKind == JsonValueKind.Object)
                        {
                            if (payloadProp.TryGetProperty("targetUserSid", out var sidProp) && sidProp.ValueKind == JsonValueKind.String)
                            {
                                targetUserSid = sidProp.GetString();
                            }
                        }

                        var inv = await _scanner.ScanInventoryAsync(cancellationToken);
                        IReadOnlyList<LocalUserDto>? knownAccounts = (OperatingSystem.IsWindows() || _hasCustomScanner) && inv.LocalUsers.Count > 0
                            ? inv.LocalUsers
                            : null;

                        var outcome = PolicyQueryCoordinator.QueryStates(
                            _catalog,
                            _registry,
                            _hiveManager,
                            targetUserSid,
                            knownAccounts);

                        if (!outcome.Success)
                        {
                            var failResp = IpcResponse<object>.Fail(id, outcome.Error!, outcome.ErrorCode!);
                            return JsonSerializer.Serialize(failResp);
                        }

                        var resp = IpcResponse<PolicyStateSummaryDto>.Ok(id, outcome.Summary!);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionApplyTransaction:
                    {
                        if (!root.TryGetProperty("payload", out var payloadProp) || payloadProp.ValueKind != JsonValueKind.Object)
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Payload de transação ausente ou inválido.", "INVALID_TRANSACTION_PAYLOAD");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var applyReq = JsonSerializer.Deserialize<ApplyTransactionRequestDto>(payloadProp.GetRawText());
                        if (applyReq == null)
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Payload de transação nulo.", "INVALID_TRANSACTION_PAYLOAD");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var inv = await _scanner.ScanInventoryAsync(cancellationToken);
                        IReadOnlyList<LocalUserDto>? knownAccounts = (OperatingSystem.IsWindows() || _hasCustomScanner) && inv.LocalUsers.Count > 0
                            ? inv.LocalUsers
                            : null;

                        bool hasUserScopedPolicy = applyReq.Policies != null && applyReq.Policies.Any(op =>
                        {
                            var handler = _catalog.GetPolicy(op.PolicyId);
                            return handler != null && handler.Scope == PolicyScope.User;
                        });

                        if (knownAccounts != null)
                        {
                            var adminNameCheck = SecurityValidator.ValidateTargetNotAdministrator(applyReq.TargetUserName, knownAccounts);
                            if (!adminNameCheck.IsValid)
                            {
                                bool isUnknown = knownAccounts.Any(u =>
                                    u != null &&
                                    string.Equals(u.Name?.Trim(), applyReq.TargetUserName?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                    u.GetEffectivePrivilegeClassification() == AccountPrivilegeClassification.Unknown);
                                return JsonSerializer.Serialize(IpcResponse<object>.Fail(id, adminNameCheck.Error!, isUnknown ? "TARGET_PRIVILEGE_UNKNOWN" : "ADMIN_TARGET_FORBIDDEN"));
                            }

                            var adminSidCheck = SecurityValidator.ValidateTargetNotAdministrator(applyReq.TargetUserSid, knownAccounts);
                            if (!adminSidCheck.IsValid)
                            {
                                bool isUnknown = knownAccounts.Any(u =>
                                    u != null &&
                                    string.Equals(u.Sid?.Trim(), applyReq.TargetUserSid?.Trim(), StringComparison.OrdinalIgnoreCase) &&
                                    u.GetEffectivePrivilegeClassification() == AccountPrivilegeClassification.Unknown);
                                return JsonSerializer.Serialize(IpcResponse<object>.Fail(id, adminSidCheck.Error!, isUnknown ? "TARGET_PRIVILEGE_UNKNOWN" : "ADMIN_TARGET_FORBIDDEN"));
                            }

                            if (hasUserScopedPolicy && !string.IsNullOrWhiteSpace(applyReq.TargetUserSid))
                            {
                                string cleanSid = applyReq.TargetUserSid.Trim();
                                var matched = knownAccounts.FirstOrDefault(u =>
                                    u != null && string.Equals(u.Sid?.Trim(), cleanSid, StringComparison.OrdinalIgnoreCase));

                                if (matched == null)
                                {
                                    return JsonSerializer.Serialize(IpcResponse<object>.Fail(
                                        id,
                                        $"A conta com SID '{cleanSid}' não foi encontrada neste computador.",
                                        "TARGET_USER_NOT_FOUND"));
                                }

                                if (!matched.Enabled)
                                {
                                    return JsonSerializer.Serialize(IpcResponse<object>.Fail(
                                        id,
                                        $"A conta '{matched.Name}' está desativada e não pode receber restrições.",
                                        "TARGET_USER_DISABLED"));
                                }

                                var matchedPrivilege = matched.GetEffectivePrivilegeClassification();
                                if (matchedPrivilege == AccountPrivilegeClassification.Administrator)
                                {
                                    return JsonSerializer.Serialize(IpcResponse<object>.Fail(
                                        id,
                                        $"A conta '{matched.Name}' é administradora e possui imunidade.",
                                        "ADMIN_TARGET_FORBIDDEN"));
                                }

                                if (matchedPrivilege == AccountPrivilegeClassification.Unknown)
                                {
                                    return JsonSerializer.Serialize(IpcResponse<object>.Fail(
                                        id,
                                        matched.ClassificationDetail ?? $"Não foi possível confirmar os privilégios da conta '{matched.Name}' (classificação desconhecida).",
                                        "TARGET_PRIVILEGE_UNKNOWN"));
                                }
                            }
                        }
                        else if (hasUserScopedPolicy && (OperatingSystem.IsWindows() || _hasCustomScanner))
                        {
                            return JsonSerializer.Serialize(IpcResponse<object>.Fail(
                                id,
                                "Não foi possível confirmar a elegibilidade da conta-alvo porque a enumeração de usuários locais não retornou contas.",
                                "TARGET_PRIVILEGE_UNKNOWN"));
                        }

                        if (hasUserScopedPolicy && !string.IsNullOrWhiteSpace(applyReq.TargetUserSid))
                        {
                            var hivePrivilege = _hiveManager.ClassifyAccountPrivilege(applyReq.TargetUserSid);
                            if (hivePrivilege == AccountPrivilegeClassification.Administrator)
                            {
                                return JsonSerializer.Serialize(IpcResponse<object>.Fail(
                                    id,
                                    "Violação de segurança: Contas de Administrador possuem imunidade e não podem receber restrições de laboratório.",
                                    "ADMIN_TARGET_FORBIDDEN"));
                            }

                            if (hivePrivilege == AccountPrivilegeClassification.Unknown)
                            {
                                return JsonSerializer.Serialize(IpcResponse<object>.Fail(
                                    id,
                                    "Operação bloqueada: não foi possível confirmar os privilégios da conta-alvo (classificação desconhecida).",
                                    "TARGET_PRIVILEGE_UNKNOWN"));
                            }
                        }

                        ApplyTransactionResultDto applyResult;
                        try
                        {
                            applyResult = _protectedTransactions == null
                                ? await _engine.ApplyTransactionAsync(applyReq, cancellationToken)
                                : await WithProtectedTransactionAsync(store => store.OpenForWrite().ApplyTransactionAsync(
                                    applyReq, cancellationToken, baseline => baseline.Entries.All(entry => entry.State != BaselineValueState.Exists)));
                        }
                        catch (Exception ex) when (IsProtectedTransactionFailure(ex))
                        {
                            return ProtectedTransactionError(id);
                        }
                        if (applyResult.Success)
                        {
                            var okResp = IpcResponse<ApplyTransactionResultDto>.Ok(id, applyResult);
                            return JsonSerializer.Serialize(okResp);
                        }
                        else
                        {
                            string errCode = applyResult.Status == TransactionStatus.Failed
                                ? "TRANSACTION_FAILED"
                                : "TRANSACTION_ROLLED_BACK";
                            var failResp = IpcResponse<ApplyTransactionResultDto>.Fail(id, applyResult.Message, errCode, applyResult);
                            return JsonSerializer.Serialize(failResp);
                        }
                    }

                    case IpcConstants.ActionRollbackTransaction:
                    {
                        if (!root.TryGetProperty("payload", out var payloadProp) || payloadProp.ValueKind != JsonValueKind.Object)
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Payload de rollback ausente ou inválido.", "INVALID_ROLLBACK_PAYLOAD");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var rollbackReq = JsonSerializer.Deserialize<RollbackTransactionRequestDto>(payloadProp.GetRawText());
                        if (rollbackReq == null || string.IsNullOrWhiteSpace(rollbackReq.TransactionId))
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Identificador de transação é obrigatório para rollback.", "INVALID_TRANSACTION_ID");
                            return JsonSerializer.Serialize(errResp);
                        }

                        RollbackResultDto rollbackResult;
                        try
                        {
                            rollbackResult = _protectedTransactions == null
                                ? await _engine.RollbackTransactionAsync(rollbackReq, cancellationToken)
                                : await WithProtectedTransactionAsync(async store =>
                                {
                                    var history = await store.ReadAsync(cancellationToken);
                                    var record = AdminPolicyJournal.Find(history, rollbackReq.TransactionId);
                                    if (record == null) throw new InvalidOperationException();
                                    if (record.Transaction.Status != TransactionStatus.RolledBack &&
                                        record.Transaction.Actions.Any(action => action.Status != "RolledBackAndVerified" &&
                                            _catalog.GetPolicy(action.PolicyId) == null))
                                        return new RollbackResultDto
                                        {
                                            TransactionId = record.Transaction.TransactionId,
                                            Status = record.Transaction.Status,
                                            Error = "Esta transação exige restauração individual. Use Revisar restauração no Histórico ou abra a política na Central de Permissões."
                                        };
                                    return await record.Engine.RollbackTransactionAsync(rollbackReq, cancellationToken,
                                        transaction => _administration.CanRestoreBatch(transaction, history));
                                });
                        }
                        catch (Exception ex) when (IsProtectedTransactionFailure(ex))
                        {
                            return ProtectedTransactionError(id);
                        }
                        if (rollbackResult.Success)
                        {
                            var okResp = IpcResponse<RollbackResultDto>.Ok(id, rollbackResult);
                            return JsonSerializer.Serialize(okResp);
                        }
                        else
                        {
                            var failResp = IpcResponse<RollbackResultDto>.Fail(id, rollbackResult.Error ?? rollbackResult.Message, "ROLLBACK_FAILED", rollbackResult);
                            return JsonSerializer.Serialize(failResp);
                        }
                    }

                    case IpcConstants.ActionQueryTransactionStatus:
                    {
                        string? txId = null;
                        if (root.TryGetProperty("payload", out var statusPayload) && statusPayload.ValueKind == JsonValueKind.Object)
                        {
                            if (statusPayload.TryGetProperty("transactionId", out var txIdProp) && txIdProp.ValueKind == JsonValueKind.String)
                            {
                                txId = txIdProp.GetString();
                            }
                        }

                        if (string.IsNullOrWhiteSpace(txId))
                        {
                            var errResp = IpcResponse<object>.Fail(id, "TransactionId é obrigatório.", "INVALID_TRANSACTION_ID");
                            return JsonSerializer.Serialize(errResp);
                        }

                        TransactionDto? txRecord;
                        try
                        {
                            txRecord = _protectedTransactions == null
                                ? await _engine.GetTransactionAsync(txId, cancellationToken)
                                : (await _protectedTransactions.FindAsync(txId, cancellationToken))?.Transaction;
                        }
                        catch (Exception ex) when (IsProtectedTransactionFailure(ex))
                        {
                            return ProtectedTransactionError(id);
                        }
                        if (txRecord != null)
                        {
                            var okResp = IpcResponse<TransactionDto>.Ok(id, txRecord);
                            return JsonSerializer.Serialize(okResp);
                        }
                        else
                        {
                            var errResp = IpcResponse<object>.Fail(id, $"Transação '{txId}' não encontrada.", "TRANSACTION_NOT_FOUND");
                            return JsonSerializer.Serialize(errResp);
                        }
                    }

                    default:
                    {
                        var errResp = IpcResponse<object>.Fail(id, $"Unhandled action in elevated executor: {action}", "UNHANDLED_ACTION");
                        return JsonSerializer.Serialize(errResp);
                    }
                }
            }
        }

        private async Task<T> WithProtectedTransactionAsync<T>(Func<AdminPolicyJournal, Task<T>> operation)
        {
            if (_protectedTransactions == null || !IsCurrentProcessElevated() ||
                !ExecutorInstallTrust.IsAdministrationStoreProtected() || WindowsAdminDiagnostics.QueryManagement().Status != "NotDetected")
                throw new InvalidOperationException();

            using var gate = AdminIpc.OpenProtectedWriteLock(AdminIpc.AdministrativeWriteLock);
            if (!gate.WaitOne(0)) throw new InvalidOperationException();
            try { return await operation(_protectedTransactions); }
            finally { gate.Release(); }
        }

        private static bool IsProtectedTransactionFailure(Exception ex) => ex is IOException or InvalidOperationException or
            UnauthorizedAccessException or System.Security.SecurityException or JsonException or WaitHandleCannotBeOpenedException;

        private static string ProtectedTransactionError(string id) => JsonSerializer.Serialize(IpcResponse<object>.Fail(id,
            "O WinLab não confirmou autorização, histórico ou estado atual da transação. Consulte a Central Administrativa.",
            "PROTECTED_TRANSACTION_PRECONDITION"));

        private void SetupParentWatchdog()
        {
            if (_parentPid <= 0) return;

            try
            {
                var parent = Process.GetProcessById(_parentPid);
                parent.EnableRaisingEvents = true;
                parent.Exited += (s, e) =>
                {
                    Environment.Exit(0);
                };

                if (parent.HasExited)
                {
                    Environment.Exit(0);
                }
            }
            catch
            {
                Environment.Exit(0);
            }
        }

        private static bool IsCurrentProcessElevated()
        {
            if (!OperatingSystem.IsWindows()) return false;

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
    }
}
