using System;
using System.IO;
using System.Security;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.RegistryServices;

namespace WinLab.Contracts.Expansion;

public sealed class ExpansionIpc(
    IRegistryService registry,
    IWindowsScanner scanner,
    Func<string, (bool Supported, string Detail)>? capability = null,
    IAppLockerAuditBackend? appLocker = null)
{
    private readonly ExpansionEngine _registryPolicies = new(registry, capability ?? WindowsPolicyCapabilities.Query);
    private readonly AppLockerAudit _audit = new(registry, appLocker ?? new WindowsAppLocker(scanner));

    public async Task<IpcResponse<object>> HandleAsync(string id, string action, JsonElement root, bool canWrite,
        Func<Task<IpcResponse<object>>>? delegateMutation = null, CancellationToken ct = default)
    {
        try
        {
            var (target, plan, revision) = ExpansionRequest.Parse(root, action);
            if (ExpansionRequest.IsMutation(action) && delegateMutation != null)
                return await delegateMutation();

            object result;
            if (ExpansionRequest.IsMutation(action))
            {
                if (!canWrite) return IpcResponse<object>.Fail(id, ExecutorInstallTrust.ReadOnlyMessage, "TRUSTED_EXECUTOR_REQUIRED");
                using var operation = OperatingSystem.IsWindows()
                    ? new Semaphore(1, 1, @"Global\WinLab.PolicyExpansion")
                    : new Semaphore(1, 1);
                if (!operation.WaitOne(0))
                    return IpcResponse<object>.Fail(id, "Outra alteração está em andamento.", "POLICY_EXPANSION_BUSY");
                try
                {
                    result = action == ExpansionRequest.Apply
                        ? target == "apps" ? await _audit.ApplyAsync(plan!, revision!, ct) : _registryPolicies.Apply(plan!, revision!)
                        : target == "apps" ? await _audit.RollbackAsync(revision!, ct) : _registryPolicies.Rollback(target, revision!);
                }
                finally
                {
                    operation.Release();
                }
            }
            else if (action == ExpansionRequest.Preview)
            {
                result = target == "apps" ? await _audit.PreviewAsync(plan!, ct) : _registryPolicies.Preview(plan!);
            }
            else
            {
                result = target == "apps" ? await _audit.QueryAsync(ct) : _registryPolicies.Query(target);
            }

            if (result is ExpansionStatus status)
                result = status with { CanWrite = canWrite };
            return IpcResponse<object>.Ok(id, JsonSerializer.SerializeToElement(result, ExpansionEngine.Json));
        }
        catch (ArgumentException ex)
        {
            return IpcResponse<object>.Fail(id, ex.Message, "INVALID_POLICY_EXPANSION_PAYLOAD");
        }
        catch (InvalidOperationException ex)
        {
            return IpcResponse<object>.Fail(id, ex.Message, "POLICY_EXPANSION_PRECONDITION");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SecurityException
            or JsonException or System.Xml.XmlException or OperationCanceledException or System.ComponentModel.Win32Exception)
        {
            return IpcResponse<object>.Fail(id, "O Windows não confirmou a operação. Atualize a consulta e verifique se há restauração pendente.",
                "POLICY_EXPANSION_UNKNOWN_RESULT");
        }
    }
}
