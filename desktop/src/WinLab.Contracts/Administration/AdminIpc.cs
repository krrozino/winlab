using System;
using System.IO;
using System.Security;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Expansion;

namespace WinLab.Contracts.Administration;

public sealed class AdminIpc(AdminAccountService accounts, WindowsAdminDiagnostics diagnostics, Func<AdminManagementDto> management)
{
    public async Task<IpcResponse<object>> HandleAsync(string id, string action, JsonElement root, bool authorized,
        Func<Task<IpcResponse<object>>>? delegateMutation = null, CancellationToken ct = default)
    {
        try
        {
            bool legacy = action == IpcConstants.ActionCreateLocalAccount;
            var request = legacy ? AdminRequest.ParseLegacyAccount(root) : AdminRequest.Parse(action, root);
            if (legacy || AdminActions.IsMutation(action))
            {
                if (!authorized)
                    return IpcResponse<object>.Fail(id, ExecutorInstallTrust.ReadOnlyMessage, "TRUSTED_EXECUTOR_REQUIRED");
                if (delegateMutation != null) return await delegateMutation();

                ct.ThrowIfCancellationRequested();
                using var operation = OperatingSystem.IsWindows()
                    ? new Semaphore(1, 1, @"Global\WinLab.Administration") : new Semaphore(1, 1);
                if (!operation.WaitOne(0))
                    return IpcResponse<object>.Fail(id, "Outra alteração administrativa está em andamento.", "ADMIN_BUSY");
                try
                {
                    if (request.AccountPlan == null)
                        return IpcResponse<object>.Fail(id, "Operação administrativa indisponível.", "ADMIN_UNAVAILABLE");
                    var result = accounts.Apply(request.AccountPlan,
                        request.Revision ?? accounts.Preview(request.AccountPlan, true).Revision, request.ReadCredential());
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
                AdminActions.DiagnosticsQuery => Success(id, QueryDiagnostics()),
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
            or System.ComponentModel.Win32Exception or OperationCanceledException)
        {
            return IpcResponse<object>.Fail(id, "O Windows não confirmou a operação administrativa. Atualize a consulta.",
                "ADMIN_UNKNOWN_RESULT");
        }
    }

    private AdminDiagnosticsDto QueryDiagnostics()
    {
        var environment = management();
        return new(environment, diagnostics.QuerySignals(environment), [],
            ["O diagnóstico mostra evidências disponíveis de domínio, Microsoft Entra e MDM. Outras ferramentas de administração podem existir.",
             "Estados observados do registro não comprovam o comportamento de um usuário ou aplicativo."]);
    }

    private static IpcResponse<object> Success<T>(string id, T data) =>
        IpcResponse<object>.Ok(id, JsonSerializer.SerializeToElement(data, AdminAccountService.Json));
}
