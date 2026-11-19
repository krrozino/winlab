using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;

namespace WinLab.Contracts.Transactions
{
    public class TransactionEngine
    {
        private readonly IPolicyCatalog _catalog;
        private readonly IRegistryService _registry;
        private readonly IUserHiveManager _hiveManager;
        private readonly BaselineSnapshotManager _snapshotManager;
        private readonly string _transactionDir;
        private readonly SemaphoreSlim _lock = new(1, 1);

        public TransactionEngine(
            IPolicyCatalog catalog,
            IRegistryService registry,
            IUserHiveManager hiveManager,
            string? transactionDirectory = null)
        {
            _catalog = catalog ?? throw new ArgumentNullException(nameof(catalog));
            _registry = registry ?? throw new ArgumentNullException(nameof(registry));
            _hiveManager = hiveManager ?? throw new ArgumentNullException(nameof(hiveManager));
            _snapshotManager = new BaselineSnapshotManager(_registry, _hiveManager);
            _transactionDir = ResolveTransactionDirectory(transactionDirectory);

            if (!Directory.Exists(_transactionDir))
            {
                try
                {
                    Directory.CreateDirectory(_transactionDir);
                }
                catch
                {
                    // Ignore directory creation issues if running in memory-only or restricted test environment
                }
            }
        }

        public static string ResolveTransactionDirectory(string? overridePath = null)
        {
            if (!string.IsNullOrWhiteSpace(overridePath))
                return overridePath;

            string? env = Environment.GetEnvironmentVariable("WINLAB_TRANSACTION_DIR");
            if (!string.IsNullOrWhiteSpace(env))
                return env;

            if (OperatingSystem.IsWindows())
            {
                return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WinLab", "transactions");
            }

            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".winlab", "transactions");
        }

        public static string SanitizeTransactionId(string? transactionId)
        {
            if (string.IsNullOrWhiteSpace(transactionId))
            {
                return Guid.NewGuid().ToString("D");
            }

            string clean = transactionId.Trim();

            // OS-independent hardening: neutralize path separators, traversal components,
            // invalid filename characters and control characters regardless of the host
            // platform's Path semantics, so the final file can never leave the transaction dir.
            clean = clean.Replace('/', '_').Replace('\\', '_');
            foreach (char c in Path.GetInvalidFileNameChars())
            {
                clean = clean.Replace(c, '_');
            }

            var chars = clean.ToCharArray();
            for (int i = 0; i < chars.Length; i++)
            {
                if (char.IsControl(chars[i]))
                {
                    chars[i] = '_';
                }
            }
            clean = new string(chars);

            if (string.IsNullOrWhiteSpace(clean) || clean == "." || clean == "..")
            {
                return Guid.NewGuid().ToString("D");
            }

            return clean;
        }

        private static readonly string[] ExecutableDesiredStateNames =
        {
            nameof(PolicyDesiredState.NotConfigured),
            nameof(PolicyDesiredState.Blocked)
        };

        public static bool TryResolveDesiredState(string? rawDesiredState, out PolicyDesiredState desired, out string? error)
        {
            desired = PolicyDesiredState.NotConfigured;
            error = null;

            if (string.IsNullOrWhiteSpace(rawDesiredState))
            {
                error = "DesiredState ausente ou vazio. Valores suportados: NotConfigured, Blocked.";
                return false;
            }

            if (rawDesiredState.Trim().Length != rawDesiredState.Length)
            {
                error = $"DesiredState '{rawDesiredState}' contém espaços não permitidos. Use o nome exato do estado (NotConfigured, Blocked).";
                return false;
            }

            if (rawDesiredState.IndexOfAny(new[] { '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' }) >= 0)
            {
                error = $"DesiredState '{rawDesiredState}' usa representação numérica, que não é aceita. Use o nome do estado (NotConfigured, Blocked).";
                return false;
            }

            if (string.Equals(rawDesiredState, nameof(PolicyDesiredState.Allowed), StringComparison.OrdinalIgnoreCase))
            {
                error = "BLOCKED — CONTRACT DECISION REQUIRED: DesiredState 'Allowed' é reservado no contrato e não é executável no M3; não pode ser convertido silenciosamente para NotConfigured ou Blocked.";
                return false;
            }

            foreach (string name in ExecutableDesiredStateNames)
            {
                if (string.Equals(rawDesiredState, name, StringComparison.OrdinalIgnoreCase))
                {
                    desired = string.Equals(name, nameof(PolicyDesiredState.Blocked), StringComparison.OrdinalIgnoreCase)
                        ? PolicyDesiredState.Blocked
                        : PolicyDesiredState.NotConfigured;
                    return true;
                }
            }

            error = $"DesiredState '{rawDesiredState}' é desconhecido, composto, operacional ou incompatível com o contrato. Valores executáveis no M3: NotConfigured, Blocked.";
            return false;
        }

        private bool TryResolveTransactionFilePath(string transactionId, out string finalPath)
        {
            finalPath = string.Empty;
            string safeId = SanitizeTransactionId(transactionId);
            if (string.IsNullOrWhiteSpace(safeId))
            {
                return false;
            }

            string fullDir = Path.GetFullPath(_transactionDir);
            if (!fullDir.EndsWith(Path.DirectorySeparatorChar.ToString(), StringComparison.Ordinal) &&
                !fullDir.EndsWith(Path.AltDirectorySeparatorChar.ToString(), StringComparison.Ordinal))
            {
                fullDir += Path.DirectorySeparatorChar;
            }

            string candidate = Path.Combine(_transactionDir, $"{safeId}.json");
            string fullFile = Path.GetFullPath(candidate);
            if (!fullFile.StartsWith(fullDir, StringComparison.Ordinal))
            {
                return false;
            }

            finalPath = candidate;
            return true;
        }

        public async Task<ApplyTransactionResultDto> ApplyTransactionAsync(
            ApplyTransactionRequestDto request,
            CancellationToken ct = default)
        {
            await _lock.WaitAsync(ct);
            try
            {
                string txId = SanitizeTransactionId(request.TransactionId);

                if (request.Policies == null || request.Policies.Count == 0)
                {
                    return new ApplyTransactionResultDto
                    {
                        TransactionId = txId,
                        Status = TransactionStatus.Failed,
                        Success = false,
                        Message = "A lista de políticas solicitadas não pode ser nula ou vazia."
                    };
                }

                var tx = new TransactionDto
                {
                    TransactionId = txId,
                    Status = TransactionStatus.Pending,
                    CreatedAt = DateTime.UtcNow,
                    TargetUserName = request.TargetUserName,
                    TargetUserSid = request.TargetUserSid
                };

                // Atomic cross-instance reservation of the normalized TransactionId.
                // FileMode.CreateNew fails when the file already exists (O_CREAT|O_EXCL on
                // POSIX, CREATE_NEW on NTFS), so exactly one engine — in-process or
                // cross-process — can claim an id before any baseline capture or registry
                // mutation. A crash after the reservation leaves an orphan record that
                // squats the id (fail-safe: nothing pre-existing is ever overwritten).
                if (!TryResolveTransactionFilePath(txId, out string reservedPath))
                {
                    return new ApplyTransactionResultDto
                    {
                        TransactionId = txId,
                        Status = TransactionStatus.Failed,
                        Success = false,
                        Message = $"TransactionId '{txId}' não pôde ser resolvido para o diretório autorizado de transações."
                    };
                }

                try
                {
                    await WriteTransactionRecordAsync(tx, reservedPath, FileMode.CreateNew, ct);
                }
                catch (IOException) when (File.Exists(reservedPath))
                {
                    return new ApplyTransactionResultDto
                    {
                        TransactionId = txId,
                        Status = TransactionStatus.Failed,
                        Success = false,
                        Message = $"TransactionId '{txId}' já pertence a uma transação persistida. A solicitação foi rejeitada sem modificar o registro anterior (baseline e rollback preservados)."
                    };
                }

                // 1. Resolve requested policy handlers
                var handlers = new List<(IPolicyHandler Handler, PolicyDesiredState DesiredState)>();
                foreach (var item in request.Policies)
                {
                    if (item == null || string.IsNullOrWhiteSpace(item.PolicyId))
                    {
                        tx.Status = TransactionStatus.Failed;
                        tx.FailureReason = "Item de política nulo ou sem identificador. A solicitação foi rejeitada sem aplicar nenhuma política.";
                        await SaveTransactionAsync(tx, ct);

                        return new ApplyTransactionResultDto
                        {
                            TransactionId = txId,
                            Status = TransactionStatus.Failed,
                            Success = false,
                            Message = tx.FailureReason ?? string.Empty
                        };
                    }

                    // Canonical PolicyId rule (shared with the TS mock): identifiers must be
                    // canonical — no leading/trailing whitespace — while matching stays
                    // case-insensitive, consistent with the catalog's OrdinalIgnoreCase lookup.
                    if (item.PolicyId.Trim().Length != item.PolicyId.Length)
                    {
                        tx.Status = TransactionStatus.Failed;
                        tx.FailedPolicyId = item.PolicyId;
                        tx.FailureReason = $"PolicyId '{item.PolicyId}' contém espaços nas extremidades. Use o identificador canônico do catálogo.";
                        await SaveTransactionAsync(tx, ct);

                        return new ApplyTransactionResultDto
                        {
                            TransactionId = txId,
                            Status = TransactionStatus.Failed,
                            Success = false,
                            FailedPolicyId = item.PolicyId,
                            Message = tx.FailureReason ?? string.Empty
                        };
                    }

                    var handler = _catalog.GetPolicy(item.PolicyId);
                    if (handler == null)
                    {
                        tx.Status = TransactionStatus.Failed;
                        tx.FailedPolicyId = item.PolicyId;
                        tx.FailureReason = $"Política desconhecida no catálogo: '{item.PolicyId}'";
                        await SaveTransactionAsync(tx, ct);

                        return new ApplyTransactionResultDto
                        {
                            TransactionId = txId,
                            Status = TransactionStatus.Failed,
                            Success = false,
                            FailedPolicyId = item.PolicyId,
                            Message = tx.FailureReason ?? string.Empty
                        };
                    }

                    if (!TryResolveDesiredState(item.DesiredState, out var desired, out var desiredError))
                    {
                        tx.Status = TransactionStatus.Failed;
                        tx.FailedPolicyId = item.PolicyId;
                        tx.FailureReason = desiredError;
                        await SaveTransactionAsync(tx, ct);

                        return new ApplyTransactionResultDto
                        {
                            TransactionId = txId,
                            Status = TransactionStatus.Failed,
                            Success = false,
                            FailedPolicyId = item.PolicyId,
                            Message = tx.FailureReason ?? string.Empty
                        };
                    }

                    handlers.Add((handler, desired));
                }

                // 2. Administrator Immunity Guard & User-Scope Target SID Guard
                bool hasUserPolicy = handlers.Any(h => h.Handler.Scope == PolicyScope.User);
                var sidAdminCheck = SecurityValidator.ValidateTargetNotAdministrator(request.TargetUserSid);
                var nameAdminCheck = SecurityValidator.ValidateTargetNotAdministrator(request.TargetUserName);
                var sidPrivilege = !string.IsNullOrWhiteSpace(request.TargetUserSid)
                    ? _hiveManager.ClassifyAccountPrivilege(request.TargetUserSid)
                    : AccountPrivilegeClassification.Unknown;
                var namePrivilege = !string.IsNullOrWhiteSpace(request.TargetUserName)
                    ? _hiveManager.ClassifyAccountPrivilege(request.TargetUserName)
                    : AccountPrivilegeClassification.Unknown;

                bool isTargetAdmin = !sidAdminCheck.IsValid ||
                                     !nameAdminCheck.IsValid ||
                                     sidPrivilege == AccountPrivilegeClassification.Administrator ||
                                     namePrivilege == AccountPrivilegeClassification.Administrator;
                if (isTargetAdmin && hasUserPolicy)
                {
                    tx.Status = TransactionStatus.Failed;
                    tx.FailureReason = "Violação de segurança: Contas de Administrador possuem imunidade e não podem receber restrições de laboratório.";
                    await SaveTransactionAsync(tx, ct);

                    return new ApplyTransactionResultDto
                    {
                        TransactionId = txId,
                        Status = TransactionStatus.Failed,
                        Success = false,
                        Message = tx.FailureReason ?? string.Empty
                    };
                }

                if (hasUserPolicy)
                {
                    var sidValidation = SecurityValidator.ValidateTargetUserSid(request.TargetUserSid);
                    if (!sidValidation.IsValid)
                    {
                        tx.Status = TransactionStatus.Failed;
                        tx.FailureReason = sidValidation.Error ?? "Conta-alvo com SID válido é obrigatória para políticas de usuário.";
                        await SaveTransactionAsync(tx, ct);

                        return new ApplyTransactionResultDto
                        {
                            TransactionId = txId,
                            Status = TransactionStatus.Failed,
                            Success = false,
                            Message = tx.FailureReason
                        };
                    }

                    if (sidPrivilege != AccountPrivilegeClassification.StandardUser)
                    {
                        tx.Status = TransactionStatus.Failed;
                        tx.FailureReason = "Operação bloqueada: não foi possível confirmar os privilégios da conta-alvo (classificação desconhecida).";
                        await SaveTransactionAsync(tx, ct);

                        return new ApplyTransactionResultDto
                        {
                            TransactionId = txId,
                            Status = TransactionStatus.Failed,
                            Success = false,
                            Message = tx.FailureReason
                        };
                    }
                }

                // 3. Pre-flight Baseline Capture
                BaselineSnapshotDto baseline;
                List<RollbackStepDto> rollbackPlan;
                try
                {
                    (baseline, rollbackPlan) = _snapshotManager.CaptureBaseline(
                        handlers.Select(h => h.Handler),
                        request.TargetUserSid);
                }
                catch (Exception ex)
                {
                    tx.Status = TransactionStatus.Failed;
                    tx.FailureReason = $"Falha na captura de baseline: {ex.Message}";
                    await SaveTransactionAsync(tx, ct);

                    return new ApplyTransactionResultDto
                    {
                        TransactionId = txId,
                        Status = TransactionStatus.Failed,
                        Success = false,
                        Message = tx.FailureReason
                    };
                }

                tx.Baseline = baseline;
                tx.RollbackPlan = rollbackPlan;
                await SaveTransactionAsync(tx, ct);

                // 4. Sequential Apply with Immediate Verification
                tx.Status = TransactionStatus.Applying;
                await SaveTransactionAsync(tx, ct);

                var appliedHandlers = new List<IPolicyHandler>();
                var initiatedPolicyIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                bool failureOccurred = false;

                foreach (var (handler, desiredState) in handlers)
                {
                    ct.ThrowIfCancellationRequested();

                    // Record before mutation starts so partial writes inside a multi-write handler are always rolled back
                    initiatedPolicyIds.Add(handler.PolicyId);

                    // Mutation step
                    PolicyApplyResult applyResult;
                    try
                    {
                        applyResult = handler.Apply(request.TargetUserSid, desiredState, _registry, _hiveManager);
                    }
                    catch (Exception ex)
                    {
                        applyResult = new PolicyApplyResult
                        {
                            PolicyId = handler.PolicyId,
                            Success = false,
                            Error = ex.Message,
                            EffectiveState = PolicyEffectiveState.Failed
                        };
                    }

                    if (!applyResult.Success)
                    {
                        tx.FailedPolicyId = handler.PolicyId;
                        tx.FailureReason = applyResult.Error ?? "Falha na mutação do registro.";
                        failureOccurred = true;
                        break;
                    }

                    // Verification Probe step
                    tx.Status = TransactionStatus.Verifying;
                    PolicyProbeResult probeResult;
                    try
                    {
                        probeResult = handler.Probe(request.TargetUserSid, _registry, _hiveManager);
                    }
                    catch (Exception ex)
                    {
                        probeResult = new PolicyProbeResult
                        {
                            PolicyId = handler.PolicyId,
                            IsActive = false,
                            EffectiveState = PolicyEffectiveState.Failed,
                            DetailMessage = $"Exceção no probe de verificação: {ex.Message}"
                        };
                    }

                    bool probeMatches;
                    if (desiredState == PolicyDesiredState.Blocked)
                    {
                        probeMatches = probeResult.IsActive && IsConfirmedActiveState(probeResult.EffectiveState);
                    }
                    else
                    {
                        bool singleValueAbsent = handler is not RegistryDWordPolicyHandler || probeResult.LiveValue == null;
                        probeMatches = !probeResult.IsActive &&
                                       probeResult.EffectiveState == PolicyEffectiveState.NotConfigured &&
                                       singleValueAbsent;
                    }

                    if (!probeMatches)
                    {
                        tx.FailedPolicyId = handler.PolicyId;
                        string expectedDesc = desiredState == PolicyDesiredState.Blocked
                            ? "estado ativo confirmado"
                            : nameof(PolicyEffectiveState.NotConfigured);
                        tx.FailureReason = $"Divergência na verificação imediata para '{handler.PolicyId}': esperado {expectedDesc} (ativo={desiredState == PolicyDesiredState.Blocked}), obtido estado={probeResult.EffectiveState} (ativo={probeResult.IsActive}). {probeResult.DetailMessage}";
                        failureOccurred = true;
                        appliedHandlers.Add(handler); // Needs rollback
                        break;
                    }

                    // Policy successfully applied and verified
                    appliedHandlers.Add(handler);
                    tx.Actions.Add(new TransactionActionRecordDto
                    {
                        Sequence = tx.Actions.Count + 1,
                        PolicyId = handler.PolicyId,
                        AppliedValue = desiredState == PolicyDesiredState.Blocked ? 1 : 0,
                        AppliedAt = DateTime.UtcNow,
                        VerifiedAt = probeResult.ProbedAtUtc,
                        Status = "AppliedAndVerified"
                    });

                    tx.Status = TransactionStatus.Applying;
                    await SaveTransactionAsync(tx, ct);
                }

                // 5. Handle Outcome: Commit or Automated Rollback
                if (!failureOccurred)
                {
                    tx.Status = TransactionStatus.Committed;
                    tx.UpdatedAt = DateTime.UtcNow;
                    await SaveTransactionAsync(tx, ct);

                    return new ApplyTransactionResultDto
                    {
                        TransactionId = txId,
                        Status = TransactionStatus.Committed,
                        AppliedCount = tx.Actions.Count,
                        RolledBackCount = 0,
                        Success = true,
                        Message = $"Todas as {tx.Actions.Count} políticas foram aplicadas, verificadas e confirmadas com sucesso."
                    };
                }
                else
                {
                    // Trigger Automated Rollback for all initiated/applied items in reverse order
                    tx.Status = TransactionStatus.RollingBack;
                    await SaveTransactionAsync(tx, ct);

                    var appliedPolicyIds = appliedHandlers.Select(h => h.PolicyId).ToHashSet(StringComparer.OrdinalIgnoreCase);
                    var (rolledBackCount, rollbackFailures, rollbackErrors) = await ExecuteRollbackPlanAsync(
                        tx,
                        initiatedPolicyIds,
                        ct,
                        appliedPolicyIds);

                    if (rollbackFailures > 0)
                    {
                        tx.Status = TransactionStatus.Failed;
                        tx.FailureReason = $"{tx.FailureReason} | Recuperação incompleta: {string.Join("; ", rollbackErrors)}";
                        tx.UpdatedAt = DateTime.UtcNow;
                        await SaveTransactionAsync(tx, ct);

                        return new ApplyTransactionResultDto
                        {
                            TransactionId = txId,
                            Status = TransactionStatus.Failed,
                            Success = false,
                            FailedPolicyId = tx.FailedPolicyId,
                            FailureReason = tx.FailureReason,
                            AppliedCount = appliedHandlers.Count,
                            RolledBackCount = rolledBackCount,
                            Message = $"Aplicação interrompida em '{tx.FailedPolicyId}' com recuperação incompleta: {rolledBackCount} item(ns) revertido(s) e {rollbackFailures} falha(s) no rollback."
                        };
                    }

                    tx.Status = TransactionStatus.RolledBack;
                    tx.UpdatedAt = DateTime.UtcNow;
                    await SaveTransactionAsync(tx, ct);

                    return new ApplyTransactionResultDto
                    {
                        TransactionId = txId,
                        Status = TransactionStatus.RolledBack,
                        Success = false,
                        FailedPolicyId = tx.FailedPolicyId,
                        FailureReason = tx.FailureReason,
                        AppliedCount = appliedHandlers.Count,
                        RolledBackCount = rolledBackCount,
                        Message = $"Aplicação interrompida em '{tx.FailedPolicyId}'. Rollback automático reverteu {rolledBackCount} política(s) para a baseline original."
                    };
                }
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task<RollbackResultDto> RollbackTransactionAsync(
            RollbackTransactionRequestDto request,
            CancellationToken ct = default)
        {
            await _lock.WaitAsync(ct);
            try
            {
                var tx = await LoadTransactionAsync(request.TransactionId, ct);
                if (tx == null)
                {
                    return new RollbackResultDto
                    {
                        TransactionId = request.TransactionId,
                        Status = TransactionStatus.Failed,
                        Success = false,
                        Error = $"Transação '{request.TransactionId}' não foi encontrada nos registros de persistência."
                    };
                }

                // Idempotency: if already rolled back, return clean success
                if (tx.Status == TransactionStatus.RolledBack)
                {
                    return new RollbackResultDto
                    {
                        TransactionId = request.TransactionId,
                        Status = TransactionStatus.RolledBack,
                        Success = true,
                        RestoredCount = tx.RollbackPlan.Count(s => s.Status == "RolledBackAndVerified"),
                        Message = "A transação já havia sido revertida anteriormente para a baseline."
                    };
                }

                if (!string.IsNullOrWhiteSpace(request.TargetUserSid) &&
                    !string.IsNullOrWhiteSpace(tx.TargetUserSid) &&
                    !string.Equals(request.TargetUserSid.Trim(), tx.TargetUserSid.Trim(), StringComparison.OrdinalIgnoreCase))
                {
                    string mismatchMsg = $"TargetUserSid '{request.TargetUserSid}' diverge da transação original '{tx.TargetUserSid}'.";
                    return new RollbackResultDto
                    {
                        TransactionId = request.TransactionId,
                        Status = TransactionStatus.Failed,
                        Success = false,
                        Message = mismatchMsg,
                        Error = mismatchMsg
                    };
                }

                tx.Status = TransactionStatus.RollingBack;
                await SaveTransactionAsync(tx, ct);

                var (restored, rollbackFailures, rollbackErrors) = await ExecuteRollbackPlanAsync(tx, null, ct, null);

                if (rollbackFailures > 0)
                {
                    string incompleteMsg = $"Recuperação incompleta na transação '{request.TransactionId}': {restored} item(ns) restaurado(s), {rollbackFailures} falha(s) ({string.Join("; ", rollbackErrors)}).";
                    tx.Status = TransactionStatus.Failed;
                    tx.FailureReason = incompleteMsg;
                    tx.UpdatedAt = DateTime.UtcNow;
                    await SaveTransactionAsync(tx, ct);

                    return new RollbackResultDto
                    {
                        TransactionId = request.TransactionId,
                        Status = TransactionStatus.Failed,
                        RestoredCount = restored,
                        Success = false,
                        Message = incompleteMsg,
                        Error = incompleteMsg
                    };
                }

                tx.Status = TransactionStatus.RolledBack;
                tx.UpdatedAt = DateTime.UtcNow;
                await SaveTransactionAsync(tx, ct);

                return new RollbackResultDto
                {
                    TransactionId = request.TransactionId,
                    Status = TransactionStatus.RolledBack,
                    Success = true,
                    RestoredCount = restored,
                    Message = $"Transação '{request.TransactionId}' revertida com sucesso. {restored} item(ns) restaurados."
                };
            }
            finally
            {
                _lock.Release();
            }
        }

        private static bool IsConfirmedActiveState(PolicyEffectiveState state)
        {
            return state is PolicyEffectiveState.Applied
                or PolicyEffectiveState.PendingLogoff
                or PolicyEffectiveState.PendingReboot
                or PolicyEffectiveState.PendingAppRestart
                or PolicyEffectiveState.PendingRefresh;
        }

        private async Task<(int RestoredCount, int FailedCount, List<string> Errors)> ExecuteRollbackPlanAsync(
            TransactionDto tx,
            HashSet<string>? policyFilter,
            CancellationToken ct,
            HashSet<string>? appliedPolicyFilter = null)
        {
            await Task.CompletedTask;
            int restoredCount = 0;
            int failedCount = 0;
            var errors = new List<string>();

            var targetSteps = tx.RollbackPlan
                .Where(step => policyFilter == null || policyFilter.Contains(step.PolicyId))
                .ToList();

            bool needsUserHive = !string.IsNullOrWhiteSpace(tx.TargetUserSid) &&
                                 targetSteps.Any(step => IsUserScopedStep(step, tx.TargetUserSid));

            using var hiveScope = needsUserHive
                ? _hiveManager.OpenUserHive(tx.TargetUserSid)
                : null;

            foreach (var step in targetSteps)
            {
                ct.ThrowIfCancellationRequested();

                try
                {
                    var (hive, resolvedSubKey) = ResolveStepTarget(step, tx.TargetUserSid, hiveScope);
                    var snapshotEntry = FindMatchingSnapshotEntry(tx.Baseline, step, tx.TargetUserSid, resolvedSubKey);
                    bool stepWasPreviouslyApplied = appliedPolicyFilter == null || appliedPolicyFilter.Contains(step.PolicyId);

                    if (string.Equals(step.Operation, "DeleteValue", StringComparison.OrdinalIgnoreCase))
                    {
                        if (snapshotEntry != null && snapshotEntry.State == BaselineValueState.Exists)
                        {
                            throw new InvalidOperationException(
                                $"Divergência entre plano de rollback (DeleteValue) e snapshot original ({snapshotEntry.State}) para '{step.ValueName}'.");
                        }

                        bool alreadyAbsent = IsRegistryValueAbsent(hive, resolvedSubKey, step.ValueName);
                        if (!alreadyAbsent)
                        {
                            _registry.DeleteValue(hive, resolvedSubKey, step.ValueName);
                        }

                        if (!IsRegistryValueAbsent(hive, resolvedSubKey, step.ValueName))
                        {
                            throw new InvalidOperationException(
                                $"O valor '{step.ValueName}' permaneceu presente em '{hive}\\{resolvedSubKey}' após tentativa de remoção.");
                        }

                        step.ExecutedAt = DateTime.UtcNow;
                        step.VerifiedAt = DateTime.UtcNow;
                        step.Status = "RolledBackAndVerified";
                        if (stepWasPreviouslyApplied || !alreadyAbsent)
                        {
                            restoredCount++;
                        }
                    }
                    else if (string.Equals(step.Operation, "RestoreValue", StringComparison.OrdinalIgnoreCase))
                    {
                        if (string.IsNullOrWhiteSpace(step.RestoreKind) ||
                            !Enum.TryParse<RegistryValueType>(step.RestoreKind, true, out var kind))
                        {
                            throw new InvalidOperationException(
                                $"Tipo de registro inválido no plano de rollback para '{step.ValueName}': '{step.RestoreKind ?? "null"}'.");
                        }

                        object expectedValue = NormalizeRegistryValue(kind, step.RestoreValue);

                        if (snapshotEntry != null)
                        {
                            if (snapshotEntry.State != BaselineValueState.Exists)
                            {
                                throw new InvalidOperationException(
                                    $"Divergência entre plano de rollback (RestoreValue) e snapshot original ({snapshotEntry.State}) para '{step.ValueName}'.");
                            }

                            if (!Enum.TryParse<RegistryValueType>(snapshotEntry.ValueKind, true, out var snapKind) || snapKind != kind)
                            {
                                throw new InvalidOperationException(
                                    $"Divergência de tipo entre plano de rollback ({kind}) e snapshot original ({snapshotEntry.ValueKind ?? "null"}) para '{step.ValueName}'.");
                            }

                            object snapValue = NormalizeRegistryValue(snapKind, snapshotEntry.OriginalValue);
                            if (!RegistryValuesEqual(kind, snapValue, expectedValue))
                            {
                                throw new InvalidOperationException(
                                    $"Divergência de conteúdo entre plano de rollback ({FormatRegistryValue(expectedValue)}) e snapshot original ({FormatRegistryValue(snapValue)}) para '{step.ValueName}'.");
                            }
                        }

                        bool alreadyMatches = VerifyRestoredRegistryValue(hive, resolvedSubKey, step.ValueName, kind, expectedValue, out _);
                        if (!alreadyMatches)
                        {
                            _registry.SetValue(hive, resolvedSubKey, step.ValueName, CloneValueForWrite(kind, expectedValue), kind);
                        }

                        if (!VerifyRestoredRegistryValue(hive, resolvedSubKey, step.ValueName, kind, expectedValue, out string? mismatchReason))
                        {
                            throw new InvalidOperationException(
                                mismatchReason ?? $"O valor '{step.ValueName}' não pôde ser confirmado após restauração.");
                        }

                        step.ExecutedAt = DateTime.UtcNow;
                        step.VerifiedAt = DateTime.UtcNow;
                        step.Status = "RolledBackAndVerified";
                        if (stepWasPreviouslyApplied || !alreadyMatches)
                        {
                            restoredCount++;
                        }
                    }
                    else
                    {
                        throw new InvalidOperationException($"Operação de rollback desconhecida: '{step.Operation}'.");
                    }
                }
                catch (Exception ex)
                {
                    step.Status = $"Failed: {ex.Message}";
                    failedCount++;
                    errors.Add($"{step.PolicyId} ({step.ValueName}): {ex.Message}");
                }
            }

            return (restoredCount, failedCount, errors);
        }

        private bool IsUserScopedStep(RollbackStepDto step, string? targetUserSid)
        {
            if (step.Scope.HasValue)
            {
                return step.Scope.Value == PolicyScope.User;
            }

            var handler = _catalog.GetPolicy(step.PolicyId);
            if (handler != null)
            {
                return handler.Scope == PolicyScope.User;
            }

            var parsedHive = InMemoryRegistryService.ParseHive(step.Hive);
            if (parsedHive == RegistryHiveType.LocalMachine)
            {
                return false;
            }

            return parsedHive == RegistryHiveType.Users ||
                   parsedHive == RegistryHiveType.CurrentUser ||
                   !string.IsNullOrWhiteSpace(targetUserSid);
        }

        private (RegistryHiveType Hive, string SubKey) ResolveStepTarget(
            RollbackStepDto step,
            string? targetUserSid,
            IUserHiveScope? hiveScope)
        {
            if (!IsUserScopedStep(step, targetUserSid))
            {
                return (RegistryHiveType.LocalMachine, step.SubKey);
            }

            if (!string.IsNullOrWhiteSpace(targetUserSid) && (hiveScope == null || !hiveScope.IsAvailable))
            {
                throw new InvalidOperationException(
                    hiveScope?.ErrorMessage ?? $"Hive do usuário '{targetUserSid}' indisponível no momento da recuperação.");
            }

            string relativeSubKey = ResolveRelativeSubKey(step, targetUserSid);
            return BaselineSnapshotManager.ResolveTargetKey(relativeSubKey, targetUserSid, hiveScope);
        }

        private string ResolveRelativeSubKey(RollbackStepDto step, string? targetUserSid)
        {
            if (!string.IsNullOrWhiteSpace(step.RelativeSubKey))
            {
                return step.RelativeSubKey.Trim('\\');
            }

            if (_catalog.GetPolicy(step.PolicyId) is RegistryDWordPolicyHandler dwordHandler)
            {
                return dwordHandler.RelativeSubKeyPath.Trim('\\');
            }

            string subKey = (step.SubKey ?? string.Empty).Trim('\\');
            if (!string.IsNullOrWhiteSpace(targetUserSid))
            {
                string cleanSid = targetUserSid.Trim();
                string mountedPrefix = $"WinLab_Mounted_{cleanSid}\\";
                if (subKey.StartsWith(mountedPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    return subKey[mountedPrefix.Length..];
                }

                string sidPrefix = $"{cleanSid}\\";
                if (subKey.StartsWith(sidPrefix, StringComparison.OrdinalIgnoreCase))
                {
                    return subKey[sidPrefix.Length..];
                }
            }

            return subKey;
        }

        private RegistryValueSnapshotDto? FindMatchingSnapshotEntry(
            BaselineSnapshotDto? baseline,
            RollbackStepDto step,
            string? targetUserSid,
            string resolvedSubKey)
        {
            if (baseline?.Entries == null || baseline.Entries.Count == 0)
            {
                return null;
            }

            string stepRelative = !string.IsNullOrWhiteSpace(step.RelativeSubKey)
                ? step.RelativeSubKey.Trim('\\')
                : ResolveRelativeSubKey(step, targetUserSid);

            return baseline.Entries.FirstOrDefault(e =>
                string.Equals(e.PolicyId, step.PolicyId, StringComparison.OrdinalIgnoreCase) &&
                string.Equals(e.ValueName, step.ValueName, StringComparison.OrdinalIgnoreCase) &&
                (string.Equals(e.SubKey.Trim('\\'), step.SubKey.Trim('\\'), StringComparison.OrdinalIgnoreCase) ||
                 string.Equals(e.SubKey.Trim('\\'), resolvedSubKey.Trim('\\'), StringComparison.OrdinalIgnoreCase) ||
                 (!string.IsNullOrWhiteSpace(e.RelativeSubKey) &&
                  string.Equals(e.RelativeSubKey.Trim('\\'), stepRelative, StringComparison.OrdinalIgnoreCase))));
        }

        private bool IsRegistryValueAbsent(RegistryHiveType hive, string subKey, string valueName)
        {
            return !_registry.GetValueNames(hive, subKey).Contains(valueName, StringComparer.OrdinalIgnoreCase);
        }

        private bool VerifyRestoredRegistryValue(
            RegistryHiveType hive,
            string subKey,
            string valueName,
            RegistryValueType expectedKind,
            object expectedValue,
            out string? mismatchReason)
        {
            mismatchReason = null;

            if (!_registry.ValueExists(hive, subKey, valueName) ||
                !_registry.GetValueNames(hive, subKey).Contains(valueName, StringComparer.OrdinalIgnoreCase))
            {
                mismatchReason = $"O valor '{valueName}' não foi encontrado em '{hive}\\{subKey}' após restauração.";
                return false;
            }

            var actualKind = _registry.GetValueKind(hive, subKey, valueName);
            if (!actualKind.HasValue || actualKind.Value != expectedKind)
            {
                mismatchReason = $"Tipo restaurado divergente para '{hive}\\{subKey}\\{valueName}': esperado {expectedKind}, obtido {actualKind?.ToString() ?? "null"}.";
                return false;
            }

            var actualValue = _registry.GetValue(hive, subKey, valueName, null);
            if (!RegistryValuesEqual(expectedKind, expectedValue, actualValue))
            {
                mismatchReason = $"Conteúdo restaurado divergente para '{hive}\\{subKey}\\{valueName}': esperado {FormatRegistryValue(expectedValue)}, obtido {FormatRegistryValue(actualValue)}.";
                return false;
            }

            return true;
        }

        private static object NormalizeRegistryValue(RegistryValueType kind, object? raw)
        {
            switch (kind)
            {
                case RegistryValueType.DWord:
                    if (TryAsInt32(raw, out int dVal)) return dVal;
                    throw new InvalidOperationException($"Valor DWord inválido no snapshot: '{FormatRegistryValue(raw)}'.");

                case RegistryValueType.QWord:
                    if (TryAsInt64(raw, out long qVal)) return qVal;
                    throw new InvalidOperationException($"Valor QWord inválido no snapshot: '{FormatRegistryValue(raw)}'.");

                case RegistryValueType.String:
                case RegistryValueType.ExpandString:
                    if (raw == null) return string.Empty;
                    if (raw is string s) return s;
                    if (raw is JsonElement sElem && sElem.ValueKind == JsonValueKind.String)
                    {
                        return sElem.GetString() ?? string.Empty;
                    }
                    throw new InvalidOperationException($"Valor {kind} inválido no snapshot: '{FormatRegistryValue(raw)}'.");

                case RegistryValueType.Binary:
                    if (raw == null) return Array.Empty<byte>();
                    if (raw is byte[] bytes) return bytes.ToArray();
                    if (raw is JsonElement bElem)
                    {
                        if (bElem.ValueKind == JsonValueKind.String)
                        {
                            return bElem.GetBytesFromBase64();
                        }
                        if (bElem.ValueKind == JsonValueKind.Array)
                        {
                            return bElem.EnumerateArray().Select(e => e.GetByte()).ToArray();
                        }
                    }
                    throw new InvalidOperationException($"Valor Binary inválido no snapshot: '{FormatRegistryValue(raw)}'.");

                case RegistryValueType.MultiString:
                    if (raw == null) return Array.Empty<string>();
                    if (raw is string[] arr) return arr.ToArray();
                    if (raw is JsonElement mElem && mElem.ValueKind == JsonValueKind.Array)
                    {
                        return mElem.EnumerateArray().Select(e => e.GetString() ?? string.Empty).ToArray();
                    }
                    throw new InvalidOperationException($"Valor MultiString inválido no snapshot: '{FormatRegistryValue(raw)}'.");

                default:
                    throw new InvalidOperationException($"Tipo de registro não suportado: {kind}.");
            }
        }

        private static object CloneValueForWrite(RegistryValueType kind, object value)
        {
            return kind switch
            {
                RegistryValueType.Binary when value is byte[] bytes => bytes.ToArray(),
                RegistryValueType.MultiString when value is string[] arr => arr.ToArray(),
                _ => value
            };
        }

        private static bool RegistryValuesEqual(RegistryValueType kind, object? expected, object? actual)
        {
            if (actual == null) return false;

            switch (kind)
            {
                case RegistryValueType.DWord:
                    return TryAsInt32(expected, out int expDword) &&
                           TryAsInt32(actual, out int actDword) &&
                           expDword == actDword;

                case RegistryValueType.QWord:
                    return TryAsInt64(expected, out long expQword) &&
                           TryAsInt64(actual, out long actQword) &&
                           expQword == actQword;

                case RegistryValueType.String:
                case RegistryValueType.ExpandString:
                    return TryAsString(expected, out string? expStr) &&
                           TryAsString(actual, out string? actStr) &&
                           string.Equals(expStr, actStr, StringComparison.Ordinal);

                case RegistryValueType.Binary:
                    return TryAsBytes(expected, out byte[]? expBytes) &&
                           TryAsBytes(actual, out byte[]? actBytes) &&
                           expBytes != null && actBytes != null &&
                           expBytes.AsSpan().SequenceEqual(actBytes);

                case RegistryValueType.MultiString:
                    return TryAsMultiString(expected, out string[]? expMulti) &&
                           TryAsMultiString(actual, out string[]? actMulti) &&
                           expMulti != null && actMulti != null &&
                           expMulti.SequenceEqual(actMulti, StringComparer.Ordinal);

                default:
                    return false;
            }
        }

        private static bool TryAsInt32(object? raw, out int value)
        {
            value = 0;
            switch (raw)
            {
                case int i:
                    value = i;
                    return true;
                case uint u:
                    value = unchecked((int)u);
                    return true;
                case long l when l >= int.MinValue && l <= uint.MaxValue:
                    value = unchecked((int)l);
                    return true;
                case short s:
                    value = s;
                    return true;
                case ushort us:
                    value = us;
                    return true;
                case byte b:
                    value = b;
                    return true;
                case sbyte sb:
                    value = sb;
                    return true;
                case JsonElement je when je.ValueKind == JsonValueKind.Number:
                    if (je.TryGetInt32(out int i32))
                    {
                        value = i32;
                        return true;
                    }
                    if (je.TryGetUInt32(out uint u32))
                    {
                        value = unchecked((int)u32);
                        return true;
                    }
                    return false;
                default:
                    return false;
            }
        }

        private static bool TryAsInt64(object? raw, out long value)
        {
            value = 0;
            switch (raw)
            {
                case long l:
                    value = l;
                    return true;
                case ulong ul:
                    value = unchecked((long)ul);
                    return true;
                case int i:
                    value = i;
                    return true;
                case uint u:
                    value = u;
                    return true;
                case short s:
                    value = s;
                    return true;
                case ushort us:
                    value = us;
                    return true;
                case byte b:
                    value = b;
                    return true;
                case sbyte sb:
                    value = sb;
                    return true;
                case JsonElement je when je.ValueKind == JsonValueKind.Number:
                    if (je.TryGetInt64(out long i64))
                    {
                        value = i64;
                        return true;
                    }
                    if (je.TryGetUInt64(out ulong u64))
                    {
                        value = unchecked((long)u64);
                        return true;
                    }
                    return false;
                default:
                    return false;
            }
        }

        private static bool TryAsString(object? raw, out string? value)
        {
            if (raw is string s)
            {
                value = s;
                return true;
            }

            if (raw is JsonElement je && je.ValueKind == JsonValueKind.String)
            {
                value = je.GetString() ?? string.Empty;
                return true;
            }

            value = null;
            return false;
        }

        private static bool TryAsBytes(object? raw, out byte[]? value)
        {
            if (raw is byte[] bytes)
            {
                value = bytes;
                return true;
            }

            if (raw is JsonElement je)
            {
                try
                {
                    if (je.ValueKind == JsonValueKind.String)
                    {
                        value = je.GetBytesFromBase64();
                        return true;
                    }
                    if (je.ValueKind == JsonValueKind.Array)
                    {
                        value = je.EnumerateArray().Select(e => e.GetByte()).ToArray();
                        return true;
                    }
                }
                catch
                {
                    value = null;
                    return false;
                }
            }

            value = null;
            return false;
        }

        private static bool TryAsMultiString(object? raw, out string[]? value)
        {
            if (raw is string[] arr)
            {
                value = arr;
                return true;
            }

            if (raw is JsonElement je && je.ValueKind == JsonValueKind.Array)
            {
                var list = new List<string>();
                foreach (var elem in je.EnumerateArray())
                {
                    if (elem.ValueKind != JsonValueKind.String)
                    {
                        value = null;
                        return false;
                    }
                    list.Add(elem.GetString() ?? string.Empty);
                }
                value = list.ToArray();
                return true;
            }

            value = null;
            return false;
        }

        private static string FormatRegistryValue(object? value)
        {
            return value switch
            {
                null => "null",
                byte[] bytes => $"byte[{bytes.Length}]({Convert.ToHexString(bytes)})",
                string[] arr => $"string[{arr.Length}]({string.Join("|", arr)})",
                _ => value.ToString() ?? "null"
            };
        }

        public async Task<TransactionDto?> GetTransactionAsync(string transactionId, CancellationToken ct = default)
        {
            return await LoadTransactionAsync(transactionId, ct);
        }

        public async Task<List<TransactionDto>> ListTransactionsAsync(CancellationToken ct = default)
        {
            var list = new List<TransactionDto>();
            if (!Directory.Exists(_transactionDir)) return list;

            var files = Directory.GetFiles(_transactionDir, "*.json");
            foreach (var file in files)
            {
                try
                {
                    string json = await File.ReadAllTextAsync(file, ct);
                    var tx = JsonSerializer.Deserialize<TransactionDto>(json);
                    if (tx != null) list.Add(tx);
                }
                catch
                {
                    // Ignore corrupted individual files
                }
            }

            return list.OrderByDescending(t => t.CreatedAt).ToList();
        }

        private async Task WriteTransactionRecordAsync(TransactionDto tx, string finalPath, FileMode mode, CancellationToken ct)
        {
            if (!Directory.Exists(_transactionDir))
            {
                Directory.CreateDirectory(_transactionDir);
            }

            string json = JsonSerializer.Serialize(tx, new JsonSerializerOptions { WriteIndented = true });

            await using (var stream = new FileStream(finalPath, mode, FileAccess.Write, FileShare.None))
            await using (var writer = new StreamWriter(stream))
            {
                await writer.WriteAsync(json.AsMemory(), ct);
                await writer.FlushAsync(ct);
            }
        }

        private async Task SaveTransactionAsync(TransactionDto tx, CancellationToken ct)
        {
            try
            {
                if (!Directory.Exists(_transactionDir))
                {
                    Directory.CreateDirectory(_transactionDir);
                }

                if (!TryResolveTransactionFilePath(tx.TransactionId, out string finalPath))
                {
                    return;
                }

                string tempPath = $"{finalPath}.{Guid.NewGuid():N}.tmp";

                string json = JsonSerializer.Serialize(tx, new JsonSerializerOptions { WriteIndented = true });
                await File.WriteAllTextAsync(tempPath, json, ct);

                File.Move(tempPath, finalPath, overwrite: true);
            }
            catch
            {
                // In purely in-memory test mocks without file system permissions, continue gracefully
            }
        }

        private async Task<TransactionDto?> LoadTransactionAsync(string transactionId, CancellationToken ct)
        {
            if (string.IsNullOrWhiteSpace(transactionId)) return null;
            if (!TryResolveTransactionFilePath(transactionId, out string path)) return null;
            if (!File.Exists(path)) return null;

            string json = await File.ReadAllTextAsync(path, ct);
            return JsonSerializer.Deserialize<TransactionDto>(json);
        }
    }
}
