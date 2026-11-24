using System;
using System.IO;
using System.Linq;
using System.Security;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Runtime.Versioning;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Administration;

public sealed class AdminIpc(AdminAccountService accounts, WindowsAdminDiagnostics diagnostics,
    AdminPermissionService permissions)
{
    public const string AdministrativeWriteLock = @"Global\WinLab.Administration.Sprint03";

    public bool CanRestoreBatch(TransactionDto transaction, AdminPolicyHistory history) =>
        permissions.CanRestoreBatch(transaction, history);

    public static AdminIpc ForWindows(IAdminAccountStore accountStore, IRegistryService registry,
        IUserHiveManager hives, IWindowsScanner scanner)
    {
        var catalog = new PolicyCatalog(includeAdminPermissions: true);
        var journal = new AdminPolicyJournal(catalog, registry, hives);
        var capabilities = new AdminWindowsPolicyCapabilities();
        var expansion = new ExpansionEngine(registry, WindowsPolicyCapabilities.Query);
        var appLocker = new AppLockerAudit(registry, new WindowsAppLocker(scanner));
        var service = new AdminPermissionService(catalog, registry, new NonElevatedUserHiveReader(), journal, accountStore,
            WindowsAdminDiagnostics.QueryManagement, capabilities.Query, expansion, appLocker.QueryAsync,
            ExecutorInstallTrust.IsPolicyStoreProtected);
        return new(new AdminAccountService(accountStore, WindowsAdminDiagnostics.QueryManagement),
            new WindowsAdminDiagnostics(registry), service);
    }

    public async Task<IpcResponse<object>> HandleAsync(string id, string action, JsonElement root, bool authorized,
        Func<Task<IpcResponse<object>>>? callExecutor = null, CancellationToken ct = default)
    {
        try
        {
            bool legacy = action == IpcConstants.ActionCreateLocalAccount;
            var request = legacy ? AdminRequest.ParseLegacyAccount(root) : AdminRequest.Parse(action, root);
            if (request.ElevatedRead && callExecutor != null)
                return authorized ? await callExecutor()
                    : IpcResponse<object>.Fail(id, ExecutorInstallTrust.ReadOnlyMessage, "TRUSTED_EXECUTOR_REQUIRED");

            if (legacy || AdminActions.IsMutation(action))
            {
                if (!authorized)
                    return IpcResponse<object>.Fail(id, ExecutorInstallTrust.ReadOnlyMessage, "TRUSTED_EXECUTOR_REQUIRED");
                if (callExecutor != null) return await callExecutor();

                ct.ThrowIfCancellationRequested();
                using var operation = OperatingSystem.IsWindows()
                    ? OpenProtectedWriteLock(AdministrativeWriteLock) : new Semaphore(1, 1);
                if (!operation.WaitOne(0))
                    return IpcResponse<object>.Fail(id, "Outra alteração administrativa está em andamento.", "ADMIN_BUSY");
                try
                {
                    if (request.PermissionPlan != null)
                        return Success(id, await permissions.ApplyAsync(request.PermissionPlan, request.Revision!, ct));
                    var result = accounts.Apply(request.AccountPlan!,
                        request.Revision ?? accounts.Preview(request.AccountPlan!, true).Revision, request.ReadCredential());
                    if (legacy)
                        return Success(id, new { name = result.Account.Name, role = result.Account.Role == "Superadmin" ? "Administrator" : "Standard",
                            sid = result.Account.Sid, message = result.Message });
                    return Success(id, result);
                }
                finally { operation.Release(); }
            }

            return action switch
            {
                AdminActions.AccountsQuery => Success(id, accounts.Query(authorized)),
                AdminActions.AccountsPreview => Success(id, accounts.Preview(request.AccountPlan!, authorized)),
                AdminActions.DiagnosticsQuery => Success(id, await QueryDiagnosticsAsync(request.TargetUserSid, authorized, ct)),
                AdminActions.PermissionsQuery => Success(id, await permissions.QueryAsync(request.TargetUserSid, authorized, ct)),
                AdminActions.PermissionsPreview => Success(id, await permissions.PreviewAsync(request.PermissionPlan!, authorized, ct)),
                _ => IpcResponse<object>.Fail(id, "Consulta administrativa indisponível.", "ADMIN_UNAVAILABLE")
            };
        }
        catch (ArgumentException ex)
        {
            return IpcResponse<object>.Fail(id, ex.Message, "INVALID_ADMIN_PAYLOAD");
        }
        catch (InvalidOperationException ex)
        {
            return IpcResponse<object>.Fail(id, ex.Message, "ADMIN_PRECONDITION");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SecurityException or JsonException
            or System.ComponentModel.Win32Exception or OperationCanceledException or WaitHandleCannotBeOpenedException
            or IdentityNotMappedException)
        {
            return IpcResponse<object>.Fail(id, "O Windows não confirmou a operação administrativa. Atualize a consulta.",
                "ADMIN_UNKNOWN_RESULT");
        }
    }

    private async Task<AdminDiagnosticsDto> QueryDiagnosticsAsync(string? targetUserSid, bool authorized, CancellationToken ct)
    {
        var catalog = await permissions.QueryAsync(targetUserSid, authorized, ct);
        var environment = catalog.Management;
        return new(environment, diagnostics.QuerySignals(environment), catalog.Permissions.Where(
            permission => permission.State.ConfiguredState != "NotConfigured").ToArray(),
            ["O diagnóstico mostra evidências disponíveis de domínio, Microsoft Entra e MDM. Outras ferramentas de administração podem existir.",
             "Estados observados do registro não comprovam o comportamento de um usuário ou aplicativo."]);
    }

    private static IpcResponse<object> Success<T>(string id, T data) =>
        IpcResponse<object>.Ok(id, JsonSerializer.SerializeToElement(data, AdminAccountService.Json));

    [SupportedOSPlatform("windows")]
    public static Semaphore OpenProtectedWriteLock(string name)
    {
        var administrators = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var security = new SemaphoreSecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        security.SetOwner(administrators);
        security.AddAccessRule(new SemaphoreAccessRule(administrators, SemaphoreRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new SemaphoreAccessRule(system, SemaphoreRights.FullControl, AccessControlType.Allow));
        var handle = SemaphoreAcl.Create(1, 1, name, out bool created, security);
        if (created) return handle;
        try
        {
            var actual = handle.GetAccessControl();
            var owner = actual.GetOwner(typeof(SecurityIdentifier));
            if ((administrators.Equals(owner) || system.Equals(owner)) &&
                actual.GetAccessRules(true, true, typeof(SecurityIdentifier)).OfType<SemaphoreAccessRule>().All(
                    rule => rule.AccessControlType != AccessControlType.Allow || administrators.Equals(rule.IdentityReference) ||
                        system.Equals(rule.IdentityReference)))
                return handle;
            throw new UnauthorizedAccessException("O objeto de sincronização administrativa não é confiável.");
        }
        catch { handle.Dispose(); throw; }
    }
}
