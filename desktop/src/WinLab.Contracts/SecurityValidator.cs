using System;
using System.Linq;

namespace WinLab.Contracts
{
    /// <summary>
    /// Validador de segurança do IPC: aplica filtros de allowlist, bloqueia execução de shell arbitrário
    /// e garante que na etapa de fundação nenhuma mutação de sistema seja disparada.
    /// </summary>
    public static class SecurityValidator
    {
        public static (bool IsValid, string? Error, string? ErrorCode) ValidateAction(string action)
        {
            if (string.IsNullOrWhiteSpace(action))
            {
                return (false, "Action cannot be empty.", "EMPTY_ACTION");
            }

            if (!IpcConstants.AllowedActions.Contains(action))
            {
                return (false, $"Action '{action}' is not in the strict IPC allowlist.", "UNAUTHORIZED_ACTION");
            }

            // Na etapa de fundação, o executor privilegiado está estritamente desabilitado por especificação.
            if (action == IpcConstants.ActionApplyPolicies || action == IpcConstants.ActionRollbackPolicies)
            {
                return (false, 
                    "Privileged policy execution is disabled in the foundation desktop stage. Only read-only queries and dry-run previews are permitted.", 
                    "PRIVILEGED_EXECUTOR_DISABLED");
            }

            return (true, null, null);
        }

        public static (bool IsSafe, string? Error) ValidateNoArbitraryShell(string rawPayload)
        {
            if (string.IsNullOrWhiteSpace(rawPayload))
            {
                return (true, null);
            }

            string lower = rawPayload.ToLowerInvariant();
            string[] forbiddenPatterns = new[]
            {
                "powershell.exe",
                "powershell -c",
                "pwsh.exe",
                "cmd.exe",
                "cmd /c",
                "bash",
                "eval(",
                "invoke-expression",
                "iex ",
                "downloadstring",
                "system.diagnostics.process",
                "wscript.shell"
            };

            foreach (var pattern in forbiddenPatterns)
            {
                if (lower.Contains(pattern))
                {
                    return (false, $"Forbidden executable or script pattern detected: '{pattern}'. Arbitrary shell execution is strictly blocked by WinLab security policy.");
                }
            }

            return (true, null);
        }

        public static (bool IsValid, string? Error) ValidateAccountNames(string? studentUser, string? adminUser)
        {
            if (string.IsNullOrWhiteSpace(studentUser))
                return (false, "Nome da conta de aluno/restrita é obrigatório.");

            if (string.IsNullOrWhiteSpace(adminUser))
                return (false, "Nome da conta de administrador é obrigatório.");

            if (string.Equals(studentUser!.Trim(), adminUser!.Trim(), StringComparison.OrdinalIgnoreCase))
                return (false, "A conta restrita não pode ser idêntica à conta de administrador.");

            return (true, null);
        }
    }
}
