using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Administration;

public sealed class AdminPermissionService(
    IPolicyCatalog catalog, IRegistryService registry, IUserHiveManager hives, IAdminPolicyJournal journal,
    IAdminAccountStore accounts, Func<AdminManagementDto> management,
    Func<IPolicyHandler, (bool Supported, string Detail)> capability, ExpansionEngine expansion,
    Func<CancellationToken, Task<ExpansionStatus>>? appLocker = null, Func<bool>? expansionStoreTrusted = null)
{
    private const string AllowLimit = "Permitir restaura a configuração anterior sem bloqueio WinLab. Outras políticas e permissões do Windows ainda se aplicam.";
    private const string ObservationLimit = "O registro confirma a configuração observada. O efeito para o usuário ou aplicativo precisa ser verificado em sessão.";
    private const string BaselineLimit = "Restaurar exige baseline confiável que corresponda ao registro atual. Alterações externas são preservadas.";
    private readonly BaselineSnapshotManager _baselines = new(registry, hives);

    public async Task<AdminPermissionsDto> QueryAsync(string? targetUserSid, bool authorized, CancellationToken ct = default)
    {
        var target = FindTarget(targetUserSid);
        var environment = management();
        var history = await journal.ReadAsync(ct);
        bool canWrite = authorized && journal.CanWrite && history.Complete && environment.Status == "NotDetected";
        var definitions = new List<AdminPermissionDto>();
        foreach (var policy in catalog.GetAllPolicies())
        {
            ct.ThrowIfCancellationRequested();
            definitions.Add(Inspect(policy, policy.Scope == PolicyScope.User ? target : null, environment, history, canWrite).Permission);
        }
        bool canWriteExpansion = authorized && environment.Status == "NotDetected" && expansionStoreTrusted?.Invoke() == true;
        foreach (string expansionTarget in new[] { "chrome", "edge", "usb", "apps" })
            definitions.Add(await InspectExpansionAsync(expansionTarget, environment, canWriteExpansion, ct));
        return new(target, environment, definitions, canWrite || canWriteExpansion);
    }

    public async Task<AdminPermissionPreviewDto> PreviewAsync(AdminPermissionPlan plan, bool authorized, CancellationToken ct = default)
    {
        var prepared = await PrepareAsync(plan, authorized, ct);
        return prepared.Preview;
    }

    public bool CanRestoreBatch(TransactionDto transaction, AdminPolicyHistory history)
    {
        if (transaction.Status == TransactionStatus.RolledBack) return true;
        if (!history.Complete || transaction.Status != TransactionStatus.Committed || transaction.Actions.Count == 0) return false;
        var actions = transaction.Actions.Where(action => action.Status != "RolledBackAndVerified").ToArray();
        var expectedIds = actions.Select(action => action.PolicyId).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (actions.Length != expectedIds.Count || transaction.RollbackPlan.Any(step =>
                !transaction.Actions.Any(action => action.PolicyId.Equals(step.PolicyId, StringComparison.OrdinalIgnoreCase))))
            return false;

        foreach (var action in actions)
        {
            var policy = catalog.GetPolicy(action.PolicyId);
            if (policy == null || action.Status != "AppliedAndVerified" || !HasValidRollbackLayout(transaction, policy))
                return false;
            string? sid = policy.Scope == PolicyScope.User ? transaction.TargetUserSid : null;
            if (policy.Scope == PolicyScope.User && (sid == null || FindTarget(sid) is not
                    { Protected: false, PrivilegeClassification: "StandardUser" }))
                return false;
            var observed = Capture(policy, sid);
            if (LatestRecord(policy, sid, history, observed)?.Transaction.TransactionId != transaction.TransactionId)
                return false;
            bool matches = AppliedState(action) switch
            {
                1 => Equal(observed, Expected(policy)),
                0 => observed.All(value => !value.Exists),
                _ => false
            };
            if (!matches) return false;
        }
        return true;
    }

    public async Task<AdminPermissionResultDto> ApplyAsync(AdminPermissionPlan plan, string revision, CancellationToken ct = default)
    {
        var prepared = await PrepareAsync(plan, true, ct);
        var preview = prepared.Preview;
        if (!preview.CanApply || preview.Revision != revision)
            throw new InvalidOperationException("Permissão ou baseline mudou desde a prévia. Atualize e revise a operação.");
        if (plan.Intent == "Preserve")
            return new(prepared.Observation.Permission, null, "Configuração preservada.");

        string? transactionId;
        if (plan.Intent == "Block")
        {
            var outcome = await journal.OpenForWrite().ApplyTransactionAsync(new ApplyTransactionRequestDto
            {
                TargetUserSid = preview.Target?.Sid,
                Policies = [new PolicyApplyItemDto { PolicyId = plan.PermissionId, DesiredState = "Blocked" }]
            }, ct, baseline => Equal(Describe(baseline.Entries), prepared.Observation.Observed));
            if (!outcome.Success)
                throw new InvalidOperationException("O Windows não confirmou o bloqueio. Consulte o estado e o histórico da operação.");
            transactionId = outcome.TransactionId;
        }
        else
        {
            var source = prepared.Observation.Record!;
            var outcome = await source.Engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
            {
                TransactionId = source.Transaction.TransactionId,
                TargetUserSid = preview.Target?.Sid
            }, ct, tx => EligibleRollback(tx, prepared.Policy) &&
                Equal(BaselineFor(tx, prepared.Policy), prepared.Observation.Baseline!) &&
                Equal(Capture(prepared.Policy, preview.Target?.Sid), prepared.Observation.Observed),
                policyId: prepared.Policy.PolicyId);
            if (!outcome.Success)
                throw new InvalidOperationException("O Windows não confirmou a restauração. Consulte o estado antes de tentar novamente.");
            transactionId = outcome.TransactionId;
        }

        var current = Inspect(prepared.Policy, preview.Target, management(), await journal.ReadAsync(ct), true);
        if (!Equal(current.Observed, plan.Intent == "Block" ? prepared.Observation.Blocked : prepared.Observation.Baseline!))
            throw new InvalidOperationException("O registro mudou antes da verificação final. Consulte a configuração atual.");
        return new(current.Permission, transactionId,
            plan.Intent == "Block" ? "Configuração de bloqueio verificada no registro." : "Configuração anterior restaurada e verificada no registro.");
    }

    private async Task<Prepared> PrepareAsync(AdminPermissionPlan plan, bool authorized, CancellationToken ct)
    {
        var policy = catalog.GetPolicy(plan.PermissionId) ?? throw new ArgumentException("Selecione uma permissão de transação do catálogo.");
        var target = FindTarget(plan.TargetUserSid);
        if (policy.Scope == PolicyScope.User ? target == null : target != null)
            throw new ArgumentException("O destino informado não corresponde ao escopo da política.");
        var environment = management();
        var history = await journal.ReadAsync(ct);
        bool canWrite = authorized && journal.CanWrite && history.Complete && environment.Status == "NotDetected";
        var observation = Inspect(policy, target, environment, history, canWrite);
        var before = observation.Permission.State;
        var after = plan.Intent switch
        {
            "Block" => DescribeState(observation.Blocked, observation.Blocked, "WinLab"),
            "Allow" or "Restore" when observation.Baseline != null =>
                DescribeState(observation.Baseline, observation.Blocked, observation.Baseline.Any(value => value.Exists)
                    ? WindowsAdminDiagnostics.ExternalOrigin(environment) : "None"),
            "Allow" or "Restore" or "Preserve" => before,
            _ => throw new ArgumentException("Intenção de alteração desconhecida.")
        };
        string revision = AdminAccountService.Revision(new
        {
            plan, target, environment, history.Complete, before, after, observation.Observed,
            transaction = observation.Record?.Transaction.TransactionId,
            transactionStatus = observation.Record?.Transaction.Status,
            observation.Permission.Supported
        });
        bool allowed = authorized && observation.Permission.Intents.Contains(plan.Intent) &&
            (plan.Intent == "Preserve" || canWrite);
        var preview = new AdminPermissionPreviewDto(revision, policy.PolicyId, plan.Intent, policy.Scope.ToString(),
            target, before, after, allowed, observation.Permission.Limitations);
        return new(policy, observation, preview);
    }

    private PolicyObservation Inspect(IPolicyHandler policy, AdminAccountDto? target, AdminManagementDto environment,
        AdminPolicyHistory history, bool canWrite)
    {
        var (supported, detail) = capability(policy);
        var limits = new List<string> { ObservationLimit, AllowLimit, BaselineLimit };
        if (policy.Scope == PolicyScope.Machine)
            limits.Add("Configuração para toda a máquina, incluindo contas administrativas.");
        if (policy.PolicyId == "apps.block_unmanaged_msi")
            limits.Add("Afeta somente Windows Installer. Executáveis e outros formatos de instalação têm controles próprios.");
        if (policy.PolicyId is "settings.hide_network_pages" or "network.lan_properties")
            limits.Add("Altera a visibilidade da interface. As permissões de rede e acesso por outros programas seguem seus próprios controles.");
        if (environment.Status != "NotDetected")
            limits.Add("Gerenciamento institucional detectado ou inconclusivo. Alterações administrativas suspensas.");
        if (!history.Complete)
            limits.Add("O histórico de baselines não pôde ser confirmado.");

        SettingsValue[] blocked = Expected(policy);
        SettingsValue[] observed = [];
        bool inconclusive = policy.Scope == PolicyScope.User && target == null || blocked.Length == 0;
        if (!inconclusive)
        {
            try { observed = Capture(policy, target?.Sid); }
            catch (Exception ex) when (ex is InvalidOperationException or IOException or UnauthorizedAccessException or SecurityException)
            {
                inconclusive = true;
                limits.Add("O perfil ou valor não pôde ser consultado. Para perfis de aluno, abra uma sessão no Windows e consulte novamente.");
            }
        }

        var record = inconclusive ? null : LatestRecord(policy, target?.Sid, history, observed);
        bool committed = record?.Transaction.Status == TransactionStatus.Committed;
        bool owned = history.Complete && committed && IsBlockedRecord(record!.Transaction, policy) && Equal(observed, blocked);
        SettingsValue[]? baseline = owned && EligibleRollback(record!.Transaction, policy)
            ? BaselineFor(record.Transaction, policy) : null;
        if (owned && baseline == null)
            limits.Add("O baseline encontrado não confirma todos os valores necessários para restaurar esta política.");
        if (record != null && !owned)
            limits.Add("Há divergência ou recuperação pendente no histórico. A central preservará os valores observados.");

        bool anyValue = observed.Any(value => value.Exists);
        string origin = inconclusive || !history.Complete ? "Inconclusive" : owned ? "WinLab" :
            anyValue ? WindowsAdminDiagnostics.ExternalOrigin(environment) : "None";
        var state = inconclusive ? new AdminPermissionStateDto("Inconclusive", "Inconclusive", "NotVerified", null, limits.Last()) :
            DescribeState(observed, blocked, origin);
        var intents = new List<string> { "Preserve" };
        bool eligibleTarget = policy.Scope == PolicyScope.Machine || target is { Protected: false, PrivilegeClassification: "StandardUser" };
        if (canWrite && supported && eligibleTarget && !inconclusive)
        {
            if (!anyValue && record == null) intents.Add("Block");
            if (baseline != null)
            {
                intents.Add("Restore");
                if (baseline.All(value => !value.Exists)) intents.Add("Allow");
            }
        }
        var permission = new AdminPermissionDto(policy.PolicyId, policy.Title, policy.Category, policy.Description,
            policy.Description, policy.Scope.ToString(), policy.Risk.ToString(), detail, supported, policy.RequiresRestart,
            policy.RequiresLogoff, policy.RequiresAppRestart, "Transaction", intents, limits, state);
        return new(permission, observed, blocked, baseline, record);
    }

    private async Task<AdminPermissionDto> InspectExpansionAsync(string target, AdminManagementDto environment,
        bool canWrite, CancellationToken ct)
    {
        ExpansionStatus status;
        try
        {
            status = target == "apps"
                ? appLocker == null ? new(target, false, "Consulta AppLocker indisponível.", "Inconclusive", null, null, false, false) :
                    await appLocker(ct)
                : expansion.Query(target);
        }
        catch (Exception ex) when (ex is InvalidOperationException or IOException or UnauthorizedAccessException or SecurityException
            or JsonException or System.ComponentModel.Win32Exception)
        {
            status = new(target, false, "O Windows não confirmou a configuração.", "Inconclusive", null, null, false, false);
        }

        var (id, name, category, effect) = target switch
        {
            "chrome" => ("browser.chrome.rules", "Sites, extensões e perfis do Chrome", "Navegadores", "Aplica regras de navegação, extensões e perfis ao Chrome instalado."),
            "edge" => ("browser.edge.rules", "Sites, extensões e perfis do Edge", "Navegadores", "Aplica regras de navegação, extensões e perfis ao Edge instalado."),
            "usb" => ("storage.usb_access", "Leitura e execução em discos removíveis", "Armazenamento", "Restringe leitura ou execução em discos removíveis reconhecidos pelo Windows."),
            _ => ("apps.audit_execution", "Auditoria de execução e instalação", "Aplicativos", "AppLocker em AuditOnly registra o que seria restringido. A execução continua permitida pelo AppLocker.")
        };
        bool winlab = expansionStoreTrusted?.Invoke() == true && status.RollbackRevision != null &&
            status.State is not ("Drifted" or "RecoveryRequired" or "Inconclusive");
        string origin = winlab ? "WinLab" : status.State == "NotConfigured" ? "None" :
            status.State is "Inconclusive" or "Drifted" or "RecoveryRequired" ? "Inconclusive" :
            WindowsAdminDiagnostics.ExternalOrigin(environment);
        var intents = new List<string> { "Preserve" };
        if (canWrite && status.Supported && (origin == "None" || winlab) && target != "apps")
            intents.Add("Block");
        if (canWrite && expansionStoreTrusted?.Invoke() == true && status.RollbackRevision != null &&
            (winlab || status.State == "RecoveryRequired")) intents.Add("Restore");
        return new(id, name, category, effect, effect, "Machine", target == "apps" ? "High" : "Medium",
            status.Detail, status.Supported, status.RequiresRestart, false, status.RequiresAppRestart,
            "Expansion", intents, ["Escopo de máquina. Use a prévia e a restauração do mecanismo de expansão.", ObservationLimit, BaselineLimit],
            new(origin, status.State, winlab && status.State == "AuditOnly" ? "ConfirmedAuditOnly" : "NotVerified", status.Configured, status.Detail), target);
    }

    private AdminAccountDto? FindTarget(string? sid)
    {
        if (sid == null) return null;
        return accounts.Read().Accounts.SingleOrDefault(account => account.Sid == sid)
            ?? throw new ArgumentException("O SID informado não identifica uma conta local observada.");
    }

    private static AdminPolicyRecord? LatestRecord(IPolicyHandler policy, string? targetSid, AdminPolicyHistory history,
        SettingsValue[] observed) => history.Records
        .Where(record => record.Transaction.Status != TransactionStatus.RolledBack &&
            (policy.Scope != PolicyScope.User || record.Transaction.TargetUserSid == targetSid))
        .OrderByDescending(record => record.Transaction.CreatedAt)
        .FirstOrDefault(record =>
        {
            var tx = record.Transaction;
            var entries = tx.Baseline.Entries.Where(entry => SamePolicy(entry.PolicyId, policy)).ToArray();
            if (entries.Length == 0 || tx.Actions.Any(action => SamePolicy(action.PolicyId, policy) &&
                    action.Status == "RolledBackAndVerified")) return false;
            return tx.Status != TransactionStatus.Failed || !Equal(Describe(entries), observed);
        });

    private static bool IsBlockedRecord(TransactionDto tx, IPolicyHandler policy) =>
        tx.Actions.LastOrDefault(action => SamePolicy(action.PolicyId, policy)) is { Status: "AppliedAndVerified" } action &&
        AppliedState(action) == 1;

    private static int? AppliedState(TransactionActionRecordDto action) =>
        action.AppliedValue is JsonElement { ValueKind: JsonValueKind.Number } value && value.TryGetInt32(out int state) ? state : null;

    private static bool EligibleRollback(TransactionDto tx, IPolicyHandler policy) =>
        tx.Status == TransactionStatus.Committed && IsBlockedRecord(tx, policy) && HasValidRollbackLayout(tx, policy);

    private static bool HasValidRollbackLayout(TransactionDto tx, IPolicyHandler policy)
    {
        var layout = Expected(policy);
        var entries = tx.Baseline.Entries.Where(entry => SamePolicy(entry.PolicyId, policy)).ToArray();
        var original = Describe(entries);
        var steps = tx.RollbackPlan.Where(step => SamePolicy(step.PolicyId, policy)).ToArray();
        return layout.Length != 0 && entries.All(entry => entry.Scope == policy.Scope) &&
            layout.Length == original.Length && layout.Length == steps.Length &&
            layout.Select(value => (value.Path, value.Name)).SequenceEqual(original.Select(value => (value.Path, value.Name))) &&
            entries.All(entry => steps.Count(step => IsValidRollbackStep(policy, entry, step)) == 1);
    }

    private static bool IsValidRollbackStep(IPolicyHandler policy, RegistryValueSnapshotDto entry, RollbackStepDto step)
    {
        if (step.Scope != policy.Scope || step.RelativeSubKey != entry.RelativeSubKey || step.ValueName != entry.ValueName)
            return false;
        if (policy.Scope == PolicyScope.Machine &&
            (step.Hive != RegistryHiveType.LocalMachine.ToString() || step.SubKey != entry.RelativeSubKey))
            return false;
        if (entry.State is BaselineValueState.DoesNotExist or BaselineValueState.KeyDoesNotExist)
            return step.Operation == "DeleteValue";
        return entry.State == BaselineValueState.Exists && step.Operation == "RestoreValue" &&
            entry.ValueKind == step.RestoreKind &&
            TransactionEngine.IsMatchingRestoreValue(entry.ValueKind, entry.OriginalValue, step.RestoreValue);
    }

    private static SettingsValue[] BaselineFor(TransactionDto transaction, IPolicyHandler policy) =>
        Describe(transaction.Baseline.Entries.Where(entry => SamePolicy(entry.PolicyId, policy)));

    private SettingsValue[] Capture(IPolicyHandler policy, string? sid) =>
        Describe(_baselines.CaptureBaseline([policy], sid).Snapshot.Entries);

    private static AdminPermissionStateDto DescribeState(SettingsValue[] values, SettingsValue[] blocked, string origin) =>
        new(origin, Equal(values, blocked) ? "Blocked" : values.Any(value => value.Exists) ? "Configured" : "NotConfigured",
            "NotVerified", values, ObservationLimit);

    private static SettingsValue[] Describe(IEnumerable<RegistryValueSnapshotDto> entries) => entries.Select(entry =>
        new SettingsValue(entry.RelativeSubKey ?? entry.SubKey, entry.ValueName, entry.State == BaselineValueState.Exists,
            entry.ValueKind, entry.OriginalValue)).ToArray();

    private static SettingsValue[] Expected(IPolicyHandler policy) => policy switch
    {
        RegistryValuePolicyHandler single =>
            [new(single.RelativeSubKeyPath, single.ValueName, true, single.ValueType.ToString(), single.BlockedValue)],
        DualBrowserPolicyHandler dual =>
            [new(dual.ChromeSubKey, dual.ChromeValueName, true, "DWord", dual.ChromeEnforcedValue),
                new(dual.EdgeSubKey, dual.EdgeValueName, true, "DWord", dual.EdgeEnforcedValue)],
        _ => []
    };

    private static bool Equal(SettingsValue[] left, SettingsValue[] right) =>
        AdminAccountService.Revision(left) == AdminAccountService.Revision(right);

    private static bool SamePolicy(string id, IPolicyHandler policy) => id.Equals(policy.PolicyId, StringComparison.OrdinalIgnoreCase);

    private sealed record SettingsValue(string Path, string Name, bool Exists, string? Kind, object? Value);
    private sealed record PolicyObservation(AdminPermissionDto Permission, SettingsValue[] Observed,
        SettingsValue[] Blocked, SettingsValue[]? Baseline, AdminPolicyRecord? Record);
    private sealed record Prepared(IPolicyHandler Policy, PolicyObservation Observation, AdminPermissionPreviewDto Preview);
}
