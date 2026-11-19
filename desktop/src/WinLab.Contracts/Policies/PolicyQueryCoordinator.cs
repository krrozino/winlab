using System;
using System.Collections.Generic;
using System.Linq;
using WinLab.Contracts.RegistryServices;

namespace WinLab.Contracts.Policies
{
    public sealed class PolicyQueryOutcome
    {
        public bool Success { get; init; }
        public string? Error { get; init; }
        public string? ErrorCode { get; init; }
        public PolicyStateSummaryDto? Summary { get; init; }

        public static PolicyQueryOutcome Ok(PolicyStateSummaryDto summary) => new()
        {
            Success = true,
            Summary = summary
        };

        public static PolicyQueryOutcome Fail(string error, string errorCode) => new()
        {
            Success = false,
            Error = error,
            ErrorCode = errorCode
        };
    }

    /// <summary>
    /// Coordenador canônico de consulta de estados de políticas.
    /// Garante validação estrita da conta-alvo (SID real, existente, habilitada, não-administradora),
    /// impede fallback acidental ao HKCU do administrador/executor e preserva estados inconclusivos/pendentes.
    /// </summary>
    public static class PolicyQueryCoordinator
    {
        public static PolicyQueryOutcome QueryStates(
            IPolicyCatalog catalog,
            IRegistryService registry,
            IUserHiveManager hiveManager,
            string? targetUserSid,
            IEnumerable<LocalUserDto>? knownAccounts = null)
        {
            if (catalog == null) throw new ArgumentNullException(nameof(catalog));
            if (registry == null) throw new ArgumentNullException(nameof(registry));
            if (hiveManager == null) throw new ArgumentNullException(nameof(hiveManager));

            bool hasTargetSid = !string.IsNullOrWhiteSpace(targetUserSid);
            string? cleanSid = hasTargetSid ? targetUserSid!.Trim() : null;

            if (hasTargetSid)
            {
                var hivePrivilege = hiveManager.ClassifyAccountPrivilege(targetUserSid);
                var adminCheck = SecurityValidator.ValidateTargetNotAdministrator(targetUserSid, knownAccounts);
                if (hivePrivilege == AccountPrivilegeClassification.Administrator)
                {
                    return PolicyQueryOutcome.Fail(
                        "Contas administrativas possuem imunidade e não podem ser selecionadas como alvo de restrições.",
                        "ADMIN_TARGET_FORBIDDEN");
                }

                var sidCheck = SecurityValidator.ValidateTargetUserSid(targetUserSid);
                if (!sidCheck.IsValid)
                {
                    return PolicyQueryOutcome.Fail(
                        sidCheck.Error ?? "SID da conta-alvo inválido.",
                        "INVALID_TARGET_SID");
                }

                if (knownAccounts != null)
                {
                    var accountList = knownAccounts.ToList();
                    var matched = accountList.FirstOrDefault(u =>
                        u != null && string.Equals(u.Sid?.Trim(), cleanSid, StringComparison.OrdinalIgnoreCase));

                    if (matched == null)
                    {
                        return PolicyQueryOutcome.Fail(
                            $"A conta com SID '{cleanSid}' não foi encontrada entre os usuários locais deste computador.",
                            "TARGET_USER_NOT_FOUND");
                    }

                    if (!matched.Enabled)
                    {
                        return PolicyQueryOutcome.Fail(
                            $"A conta '{matched.Name}' está desativada no Windows e não pode receber políticas ativas.",
                            "TARGET_USER_DISABLED");
                    }

                    var matchedPrivilege = matched.GetEffectivePrivilegeClassification();
                    if (matchedPrivilege == AccountPrivilegeClassification.Administrator)
                    {
                        return PolicyQueryOutcome.Fail(
                            $"A conta '{matched.Name}' pertence ao grupo de Administradores e está protegida pelo WinLab.",
                            "ADMIN_TARGET_FORBIDDEN");
                    }

                    if (matchedPrivilege == AccountPrivilegeClassification.Unknown)
                    {
                        return PolicyQueryOutcome.Fail(
                            matched.ClassificationDetail ?? $"Não foi possível confirmar os privilégios da conta '{matched.Name}' (classificação desconhecida).",
                            "TARGET_PRIVILEGE_UNKNOWN");
                    }
                }

                if (!adminCheck.IsValid)
                {
                    return PolicyQueryOutcome.Fail(
                        adminCheck.Error ?? "Contas administrativas possuem imunidade e não podem ser selecionadas como alvo de restrições.",
                        "ADMIN_TARGET_FORBIDDEN");
                }

                if (hivePrivilege == AccountPrivilegeClassification.Unknown)
                {
                    return PolicyQueryOutcome.Fail(
                        "Não foi possível confirmar os privilégios da conta-alvo (classificação desconhecida). Operação bloqueada por segurança.",
                        "TARGET_PRIVILEGE_UNKNOWN");
                }
            }

            var items = new List<PolicyItemDto>();
            int appliedCount = 0;
            int notConfiguredCount = 0;
            int pendingCount = 0;

            foreach (var policy in catalog.GetAllPolicies())
            {
                if (policy.Scope == PolicyScope.User && !hasTargetSid)
                {
                    items.Add(new PolicyItemDto
                    {
                        Id = policy.PolicyId,
                        Category = policy.Category,
                        Title = policy.Title,
                        Description = policy.Description,
                        Scope = policy.Scope,
                        Risk = policy.Risk,
                        CurrentState = PolicyState.Inconclusive,
                        DesiredState = PolicyState.NotConfigured,
                        ConfiguredState = PolicyState.NotConfigured,
                        EffectiveState = PolicyEffectiveState.Inconclusive,
                        RequiresLogoff = policy.RequiresLogoff,
                        RequiresRestart = policy.RequiresRestart,
                        RequiresAppRestart = policy.RequiresAppRestart,
                        Reversible = policy.Reversible,
                        Evidence = "Selecione uma conta comum para consultar o estado desta política.",
                        LastVerified = DateTime.UtcNow.ToString("o")
                    });
                    continue;
                }

                var probe = policy.Probe(cleanSid, registry, hiveManager);
                var mappedCurrentState = MapEffectiveToPolicyState(probe);
                var configuredState = probe.IsActive
                    ? PolicyState.Applied
                    : (probe.EffectiveState == PolicyEffectiveState.NotConfigured
                        ? PolicyState.NotConfigured
                        : mappedCurrentState);

                items.Add(new PolicyItemDto
                {
                    Id = policy.PolicyId,
                    Category = policy.Category,
                    Title = policy.Title,
                    Description = policy.Description,
                    Scope = policy.Scope,
                    Risk = policy.Risk,
                    CurrentState = mappedCurrentState,
                    DesiredState = configuredState,
                    ConfiguredState = configuredState,
                    EffectiveState = probe.EffectiveState,
                    RequiresLogoff = policy.RequiresLogoff,
                    RequiresRestart = policy.RequiresRestart,
                    RequiresAppRestart = policy.RequiresAppRestart,
                    Reversible = policy.Reversible,
                    Evidence = probe.DetailMessage,
                    LastVerified = probe.ProbedAtUtc.ToString("o")
                });

                if (probe.EffectiveState == PolicyEffectiveState.PendingLogoff ||
                    probe.EffectiveState == PolicyEffectiveState.PendingAppRestart ||
                    probe.EffectiveState == PolicyEffectiveState.PendingRefresh ||
                    probe.EffectiveState == PolicyEffectiveState.PendingFirstLogon ||
                    probe.EffectiveState == PolicyEffectiveState.PendingReboot)
                {
                    pendingCount++;
                }
                else if (probe.IsActive || probe.EffectiveState == PolicyEffectiveState.Applied)
                {
                    appliedCount++;
                }
                else if (probe.EffectiveState == PolicyEffectiveState.NotConfigured)
                {
                    notConfiguredCount++;
                }
            }

            return PolicyQueryOutcome.Ok(new PolicyStateSummaryDto
            {
                TotalPolicies = items.Count,
                AppliedCount = appliedCount,
                NotConfiguredCount = notConfiguredCount,
                PendingCount = pendingCount,
                Items = items
            });
        }

        public static PolicyState MapEffectiveToPolicyState(PolicyProbeResult probe)
        {
            return probe.EffectiveState switch
            {
                PolicyEffectiveState.Applied => PolicyState.Applied,
                PolicyEffectiveState.PendingLogoff => PolicyState.PendingLogoff,
                PolicyEffectiveState.PendingReboot => PolicyState.PendingReboot,
                PolicyEffectiveState.PendingAppRestart => PolicyState.PendingAppRestart,
                PolicyEffectiveState.PendingRefresh => PolicyState.Applied,
                PolicyEffectiveState.PendingFirstLogon => PolicyState.PendingFirstLogon,
                PolicyEffectiveState.Drifted => PolicyState.Drifted,
                PolicyEffectiveState.Inconclusive => PolicyState.Inconclusive,
                PolicyEffectiveState.Failed => PolicyState.Failed,
                PolicyEffectiveState.NotSupported => PolicyState.NotSupported,
                PolicyEffectiveState.NotConfigured => probe.IsActive ? PolicyState.Inconclusive : PolicyState.NotConfigured,
                _ => probe.IsActive ? PolicyState.Applied : PolicyState.Inconclusive
            };
        }
    }
}
