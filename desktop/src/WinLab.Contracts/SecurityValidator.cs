using System;
using System.Collections.Generic;
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

        private static readonly string[] DisallowedPayloadCommandFields = new[]
        {
            "command",
            "script",
            "shell",
            "exec",
            "rawscript",
            "powershell",
            "cmd"
        };

        private static readonly string[] ValidEnvelopeTypes = new[]
        {
            "query",
            "command",
            "response",
            "event"
        };

        public static (bool IsValid, string? EnvelopeId, string? Error, string? ErrorCode) ValidateEnvelopeSchema(System.Text.Json.JsonElement root)
        {
            if (root.ValueKind != System.Text.Json.JsonValueKind.Object)
            {
                return (false, null, "IPC message must be a valid JSON object envelope.", "INVALID_ENVELOPE_SCHEMA");
            }

            string? id = null;
            if (root.TryGetProperty("id", out var idProp) && idProp.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                id = idProp.GetString();
            }

            if (string.IsNullOrWhiteSpace(id))
            {
                return (false, id, "Envelope 'id' must be a non-empty string.", "INVALID_ENVELOPE_ID");
            }

            string? type = null;
            if (root.TryGetProperty("type", out var typeProp) && typeProp.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                type = typeProp.GetString();
            }

            if (string.IsNullOrWhiteSpace(type) || !ValidEnvelopeTypes.Contains(type, StringComparer.OrdinalIgnoreCase))
            {
                return (false, id, $"Envelope 'type' must be one of: {string.Join(", ", ValidEnvelopeTypes)}.", "INVALID_ENVELOPE_TYPE");
            }

            string? action = null;
            if (root.TryGetProperty("action", out var actionProp) && actionProp.ValueKind == System.Text.Json.JsonValueKind.String)
            {
                action = actionProp.GetString();
            }

            var (isActionValid, actionError, actionErrorCode) = ValidateAction(action ?? string.Empty);
            if (!isActionValid)
            {
                return (false, id, actionError, actionErrorCode);
            }

            // Schema-level validation on payload fields to reject arbitrary shell command parameters
            if (root.TryGetProperty("payload", out var payloadProp))
            {
                if (payloadProp.ValueKind == System.Text.Json.JsonValueKind.Object)
                {
                    foreach (var prop in payloadProp.EnumerateObject())
                    {
                        if (DisallowedPayloadCommandFields.Contains(prop.Name, StringComparer.OrdinalIgnoreCase))
                        {
                            return (false, id, 
                                $"Disallowed command property '{prop.Name}' detected in payload. Arbitrary command execution is forbidden by typed IPC schema.", 
                                "FORBIDDEN_COMMAND_FIELD");
                        }
                    }
                }
                else if (payloadProp.ValueKind == System.Text.Json.JsonValueKind.String)
                {
                    var shellCheck = ValidateNoArbitraryShell(payloadProp.GetString() ?? string.Empty);
                    if (!shellCheck.IsSafe)
                    {
                        return (false, id, shellCheck.Error, "FORBIDDEN_SHELL_INJECTION");
                    }
                }
            }

            return (true, id, null, null);
        }

        public static (bool IsValid, string? Error, string? ErrorCode) ValidateEnvelope<T>(IpcEnvelope<T>? envelope)
        {
            if (envelope == null)
            {
                return (false, "Envelope cannot be null.", "NULL_ENVELOPE");
            }

            if (string.IsNullOrWhiteSpace(envelope.Id))
            {
                return (false, "Envelope 'id' cannot be empty.", "INVALID_ENVELOPE_ID");
            }

            if (string.IsNullOrWhiteSpace(envelope.Type) || !ValidEnvelopeTypes.Contains(envelope.Type, StringComparer.OrdinalIgnoreCase))
            {
                return (false, $"Envelope 'type' must be one of: {string.Join(", ", ValidEnvelopeTypes)}.", "INVALID_ENVELOPE_TYPE");
            }

            return ValidateAction(envelope.Action);
        }

        private static readonly char[] ForbiddenAccountChars = new[]
        {
            '"', '/', '\\', '[', ']', ':', ';', '|', '=', ',', '+', '*', '?', '<', '>', '@'
        };

        private static (bool IsValid, string? Error) ValidateSingleAccount(string? user, string emptyMessage)
        {
            if (string.IsNullOrWhiteSpace(user))
            {
                return (false, emptyMessage);
            }

            string trimmed = user.Trim();

            if (trimmed.Length > 20)
            {
                return (false, "Nome de usuário não pode ter mais de 20 caracteres.");
            }

            if (trimmed.All(c => c == '.' || char.IsWhiteSpace(c)))
            {
                return (false, "Nome de usuário não pode conter apenas pontos.");
            }

            if (user.IndexOfAny(ForbiddenAccountChars) >= 0)
            {
                return (false, "Nome de usuário contém caracteres inválidos. Caracteres proibidos: \" / \\ [ ] : ; | = , + * ? < > @");
            }

            return (true, null);
        }

        public static (bool IsValid, string? Error) ValidateAccountNames(string? studentUser, string? adminUser)
        {
            var studentCheck = ValidateSingleAccount(studentUser, "Nome da conta de aluno/restrita é obrigatório.");
            if (!studentCheck.IsValid)
            {
                return studentCheck;
            }

            var adminCheck = ValidateSingleAccount(adminUser, "Nome da conta de administrador é obrigatório.");
            if (!adminCheck.IsValid)
            {
                return adminCheck;
            }

            if (string.Equals(studentUser!.Trim(), adminUser!.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                return (false, "A conta restrita não pode ser idêntica à conta de administrador.");
            }

            return (true, null);
        }

        public static (bool IsValid, string? Error) ValidateStudentNotAdministrator(string? studentUser, IEnumerable<LocalUserDto>? accounts)
        {
            if (string.IsNullOrWhiteSpace(studentUser) || accounts == null)
            {
                return (true, null);
            }

            string trimmed = studentUser.Trim();
            var matchingUser = accounts.FirstOrDefault(u =>
                u != null && string.Equals(u.Name?.Trim(), trimmed, StringComparison.OrdinalIgnoreCase));

            if (matchingUser != null && matchingUser.IsAdmin)
            {
                return (false, "A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador.");
            }

            return (true, null);
        }

        public static (bool IsValid, string? Error) ValidateTargetNotAdministrator(string? targetSidOrName, IEnumerable<LocalUserDto>? accounts = null)
        {
            if (string.IsNullOrWhiteSpace(targetSidOrName))
            {
                return (true, null);
            }

            string trimmed = targetSidOrName.Trim();
            if (string.Equals(trimmed, "S-1-5-32-544", StringComparison.OrdinalIgnoreCase) ||
                trimmed.EndsWith("-500", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "Administrador", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "Administrator", StringComparison.OrdinalIgnoreCase))
            {
                return (false, "Segurança violada: Contas de Administrador possuem imunidade e não podem receber restrições de laboratório.");
            }

            if (accounts != null)
            {
                var matchingUser = accounts.FirstOrDefault(u =>
                    u != null && (string.Equals(u.Name?.Trim(), trimmed, StringComparison.OrdinalIgnoreCase) ||
                                 string.Equals(u.Sid?.Trim(), trimmed, StringComparison.OrdinalIgnoreCase)));

                if (matchingUser != null && matchingUser.IsAdmin)
                {
                    return (false, "A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador.");
                }
            }

            return (true, null);
        }
    }
}
