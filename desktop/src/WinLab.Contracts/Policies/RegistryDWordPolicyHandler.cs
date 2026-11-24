using System;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Policies
{
    public class RegistryValuePolicyHandler : IPolicyHandler
    {
        public string PolicyId { get; }
        public string Category { get; }
        public string Title { get; }
        public string Description { get; }
        public PolicyScope Scope { get; }
        public PolicyRisk Risk { get; }
        public bool RequiresRestart { get; }
        public bool RequiresLogoff { get; }
        public bool RequiresAppRestart { get; }
        public bool Reversible { get; }
        public string[] TargetProcesses { get; }

        public string RelativeSubKeyPath { get; }
        public string ValueName { get; }
        public object BlockedValue { get; }
        public RegistryValueType ValueType { get; }

        public RegistryValuePolicyHandler(
            string policyId,
            string category,
            string title,
            string description,
            string relativeSubKeyPath,
            string valueName,
            object blockedValue,
            RegistryValueType valueType,
            bool requiresLogoff = false,
            bool requiresRestart = false,
            bool requiresAppRestart = false,
            PolicyRisk risk = PolicyRisk.Low,
            PolicyScope scope = PolicyScope.User)
        {
            PolicyId = policyId;
            Category = category;
            Title = title;
            Description = description;
            RelativeSubKeyPath = relativeSubKeyPath.Trim('\\');
            ValueName = valueName;
            BlockedValue = blockedValue;
            ValueType = valueType;
            RequiresLogoff = requiresLogoff;
            RequiresRestart = requiresRestart;
            RequiresAppRestart = requiresAppRestart;
            Risk = risk;
            Scope = scope;
            Reversible = true;
            TargetProcesses = Array.Empty<string>();
        }

        private (RegistryHiveType hive, string subKey) ResolveTargetHiveAndKey(string? targetUserSid, IUserHiveScope? hiveScope)
        {
            if (Scope == PolicyScope.Machine)
            {
                return (RegistryHiveType.LocalMachine, RelativeSubKeyPath);
            }

            if (string.IsNullOrWhiteSpace(targetUserSid))
            {
                return (RegistryHiveType.CurrentUser, RelativeSubKeyPath);
            }

            // Elevated or explicit SID execution: open under HKU\<SID>\<SubKey>
            string cleanSid = targetUserSid.Trim();
            string root = hiveScope == null || string.IsNullOrWhiteSpace(hiveScope.RootPath) ? cleanSid : hiveScope.RootPath.Trim();
            if (root.Equals("Software", StringComparison.OrdinalIgnoreCase))
            {
                return (RegistryHiveType.CurrentUser, RelativeSubKeyPath);
            }

            return (RegistryHiveType.Users, $@"{root}\{RelativeSubKeyPath}");
        }

        private PolicyEffectiveState ComputeActiveEffectiveState()
        {
            if (RequiresRestart) return PolicyEffectiveState.PendingReboot;
            if (RequiresLogoff) return PolicyEffectiveState.PendingLogoff;
            return PolicyEffectiveState.Applied;
        }

        public PolicyProbeResult Probe(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            IUserHiveScope? hiveScope = null;
            try
            {
                if (Scope == PolicyScope.User)
                {
                    hiveScope = hiveManager.OpenUserHive(targetUserSid);
                    if (!hiveScope.IsAvailable)
                    {
                        if (hiveScope.ProfileStatus == UserProfileStatus.NotCreated)
                        {
                            return new PolicyProbeResult
                            {
                                PolicyId = PolicyId,
                                IsActive = false,
                                EffectiveState = PolicyEffectiveState.PendingFirstLogon,
                                DetailMessage = "Perfil do usuário ainda não inicializado no disco. Políticas serão aplicadas no primeiro logon.",
                                TargetSid = targetUserSid,
                                RequiresLogoff = RequiresLogoff,
                                RequiresRestart = RequiresRestart,
                                RequiresAppRestart = RequiresAppRestart
                            };
                        }

                        return new PolicyProbeResult
                        {
                            PolicyId = PolicyId,
                            IsActive = false,
                            EffectiveState = PolicyEffectiveState.Inconclusive,
                            DetailMessage = hiveScope.ErrorMessage ?? "Hive do usuário inacessível.",
                            TargetSid = targetUserSid,
                            RequiresLogoff = RequiresLogoff,
                            RequiresRestart = RequiresRestart,
                            RequiresAppRestart = RequiresAppRestart
                        };
                    }
                }

                var (hive, subKey) = ResolveTargetHiveAndKey(targetUserSid, hiveScope);

                object? rawValue;
                RegistryValueType? kind;
                try
                {
                    rawValue = registry.GetValue(hive, subKey, ValueName, null);
                    kind = registry.GetValueKind(hive, subKey, ValueName);
                }
                catch (Exception ex)
                {
                    return new PolicyProbeResult
                    {
                        PolicyId = PolicyId,
                        IsActive = false,
                        EffectiveState = PolicyEffectiveState.Inconclusive,
                        DetailMessage = $"Falha ao consultar registro: {ex.Message}",
                        TargetSid = Scope == PolicyScope.User ? targetUserSid : null,
                        RequiresLogoff = RequiresLogoff,
                        RequiresRestart = RequiresRestart,
                        RequiresAppRestart = RequiresAppRestart
                    };
                }

                bool isActive = false;
                if (rawValue != null && (kind == null || kind == ValueType))
                {
                    if (ValueType == RegistryValueType.String)
                        isActive = Equals(rawValue, BlockedValue);
                    else if (ValueType == RegistryValueType.DWord && rawValue is not (string or bool))
                        try { isActive = Equals(Convert.ToInt32(rawValue), BlockedValue); }
                        catch (Exception ex) when (ex is InvalidCastException or FormatException or OverflowException) { }
                }

                PolicyEffectiveState state = isActive
                    ? ComputeActiveEffectiveState()
                    : PolicyEffectiveState.NotConfigured;

                return new PolicyProbeResult
                {
                    PolicyId = PolicyId,
                    IsActive = isActive,
                    LiveValue = rawValue,
                    EffectiveState = state,
                    RequiresLogoff = RequiresLogoff,
                    RequiresRestart = RequiresRestart,
                    RequiresAppRestart = RequiresAppRestart,
                    TargetSid = Scope == PolicyScope.User ? targetUserSid : null,
                    DetailMessage = $"{hive}\\{subKey}\\{ValueName}={rawValue ?? "null"}",
                    ProbedAtUtc = DateTime.UtcNow
                };
            }
            finally
            {
                hiveScope?.Dispose();
            }
        }

        public PolicyApplyResult Apply(string? targetUserSid, PolicyDesiredState desiredState, IRegistryService registry, IUserHiveManager hiveManager)
        {
            if (Scope == PolicyScope.User && !string.IsNullOrWhiteSpace(targetUserSid))
            {
                var privilege = hiveManager.ClassifyAccountPrivilege(targetUserSid);
                if (privilege == AccountPrivilegeClassification.Administrator)
                {
                    return new PolicyApplyResult
                    {
                        PolicyId = PolicyId,
                        Success = false,
                        Error = "Violação de segurança: Não é permitido aplicar bloqueios à conta de administrador (imunidade de administrador).",
                        EffectiveState = PolicyEffectiveState.Failed
                    };
                }

                if (privilege == AccountPrivilegeClassification.Unknown)
                {
                    return new PolicyApplyResult
                    {
                        PolicyId = PolicyId,
                        Success = false,
                        Error = "Operação bloqueada: não foi possível confirmar os privilégios da conta-alvo (classificação desconhecida).",
                        EffectiveState = PolicyEffectiveState.Failed
                    };
                }
            }

            IUserHiveScope? hiveScope = null;
            try
            {
                if (Scope == PolicyScope.User)
                {
                    hiveScope = hiveManager.OpenUserHive(targetUserSid);
                    if (!hiveScope.IsAvailable)
                    {
                        return new PolicyApplyResult
                        {
                            PolicyId = PolicyId,
                            Success = false,
                            Error = hiveScope.ErrorMessage ?? "Hive do usuário indisponível.",
                            EffectiveState = PolicyEffectiveState.Failed
                        };
                    }
                }

                var (hive, subKey) = ResolveTargetHiveAndKey(targetUserSid, hiveScope);

                if (desiredState == PolicyDesiredState.Blocked)
                {
                    registry.SetValue(hive, subKey, ValueName, BlockedValue, ValueType);
                    return new PolicyApplyResult
                    {
                        PolicyId = PolicyId,
                        Success = true,
                        EffectiveState = ComputeActiveEffectiveState(),
                        RequiresLogoff = RequiresLogoff,
                        RequiresRestart = RequiresRestart,
                        RequiresAppRestart = RequiresAppRestart
                    };
                }
                else
                {
                    registry.DeleteValue(hive, subKey, ValueName);
                    return new PolicyApplyResult
                    {
                        PolicyId = PolicyId,
                        Success = true,
                        EffectiveState = PolicyEffectiveState.NotConfigured
                    };
                }
            }
            catch (Exception ex)
            {
                return new PolicyApplyResult
                {
                    PolicyId = PolicyId,
                    Success = false,
                    Error = $"Falha ao gravar registro: {ex.Message}",
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }
            finally
            {
                hiveScope?.Dispose();
            }
        }

        public PolicyRevertResult Revert(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            IUserHiveScope? hiveScope = null;
            try
            {
                if (Scope == PolicyScope.User)
                {
                    hiveScope = hiveManager.OpenUserHive(targetUserSid);
                    if (!hiveScope.IsAvailable)
                    {
                        return new PolicyRevertResult
                        {
                            PolicyId = PolicyId,
                            Success = false,
                            Error = hiveScope.ErrorMessage ?? "Hive do usuário indisponível.",
                            EffectiveState = PolicyEffectiveState.Failed
                        };
                    }
                }

                var (hive, subKey) = ResolveTargetHiveAndKey(targetUserSid, hiveScope);
                registry.DeleteValue(hive, subKey, ValueName);

                return new PolicyRevertResult
                {
                    PolicyId = PolicyId,
                    Success = true,
                    EffectiveState = PolicyEffectiveState.NotConfigured
                };
            }
            catch (Exception ex)
            {
                return new PolicyRevertResult
                {
                    PolicyId = PolicyId,
                    Success = false,
                    Error = $"Falha ao reverter registro: {ex.Message}",
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }
            finally
            {
                hiveScope?.Dispose();
            }
        }
    }

    public class RegistryDWordPolicyHandler : RegistryValuePolicyHandler
    {
        public int EnforcedValue { get; }
        public int UnconfiguredValue { get; }

        public RegistryDWordPolicyHandler(string policyId, string category, string title, string description,
            string relativeSubKeyPath, string valueName, int enforcedValue = 1, int unconfiguredValue = 0,
            bool requiresLogoff = false, bool requiresRestart = false, bool requiresAppRestart = false,
            PolicyRisk risk = PolicyRisk.Low, PolicyScope scope = PolicyScope.User)
            : base(policyId, category, title, description, relativeSubKeyPath, valueName, enforcedValue,
                RegistryValueType.DWord, requiresLogoff, requiresRestart, requiresAppRestart, risk, scope)
        {
            EnforcedValue = enforcedValue;
            UnconfiguredValue = unconfiguredValue;
        }
    }
}
