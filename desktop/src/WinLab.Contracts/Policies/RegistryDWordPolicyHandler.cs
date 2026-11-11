using System;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Policies
{
    public class RegistryDWordPolicyHandler : IPolicyHandler
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
        public int EnforcedValue { get; }
        public int UnconfiguredValue { get; }

        public RegistryDWordPolicyHandler(
            string policyId,
            string category,
            string title,
            string description,
            string relativeSubKeyPath,
            string valueName,
            int enforcedValue = 1,
            int unconfiguredValue = 0,
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
            EnforcedValue = enforcedValue;
            UnconfiguredValue = unconfiguredValue;
            RequiresLogoff = requiresLogoff;
            RequiresRestart = requiresRestart;
            RequiresAppRestart = requiresAppRestart;
            Risk = risk;
            Scope = scope;
            Reversible = true;
            TargetProcesses = Array.Empty<string>();
        }

        private (RegistryHiveType hive, string subKey) ResolveTargetHiveAndKey(string? targetUserSid, IUserHiveScope hiveScope)
        {
            if (string.IsNullOrWhiteSpace(targetUserSid))
            {
                return (RegistryHiveType.CurrentUser, RelativeSubKeyPath);
            }

            // Elevated or explicit SID execution: open under HKU\<SID>\<SubKey>
            string cleanSid = targetUserSid.Trim();
            string root = string.IsNullOrWhiteSpace(hiveScope.RootPath) ? cleanSid : hiveScope.RootPath.Trim();
            if (root.Equals("Software", StringComparison.OrdinalIgnoreCase))
            {
                return (RegistryHiveType.CurrentUser, RelativeSubKeyPath);
            }

            return (RegistryHiveType.Users, $@"{root}\{RelativeSubKeyPath}");
        }

        public PolicyProbeResult Probe(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            using var hiveScope = hiveManager.OpenUserHive(targetUserSid);
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
                    DetailMessage = $"Falha ao consultar registro de personalização: {ex.Message}",
                    TargetSid = targetUserSid,
                    RequiresLogoff = RequiresLogoff,
                    RequiresRestart = RequiresRestart,
                    RequiresAppRestart = RequiresAppRestart
                };
            }

            bool isDwordType = (kind == null || kind == RegistryValueType.DWord) && !(rawValue is string) && !(rawValue is bool);

            bool isActive = false;
            if (rawValue != null && isDwordType)
            {
                try
                {
                    int val = Convert.ToInt32(rawValue);
                    isActive = (val == EnforcedValue);
                }
                catch
                {
                    isActive = false;
                }
            }

            PolicyEffectiveState state;
            if (isActive)
            {
                state = RequiresLogoff ? PolicyEffectiveState.PendingLogoff : PolicyEffectiveState.Applied;
            }
            else
            {
                state = PolicyEffectiveState.NotConfigured;
            }

            return new PolicyProbeResult
            {
                PolicyId = PolicyId,
                IsActive = isActive,
                LiveValue = rawValue,
                EffectiveState = state,
                RequiresLogoff = RequiresLogoff,
                RequiresRestart = RequiresRestart,
                RequiresAppRestart = RequiresAppRestart,
                TargetSid = targetUserSid,
                ProbedAtUtc = DateTime.UtcNow
            };
        }

        public PolicyApplyResult Apply(string? targetUserSid, PolicyDesiredState desiredState, IRegistryService registry, IUserHiveManager hiveManager)
        {
            // Administrator Immunity Invariant
            if (hiveManager.IsUserAdministrator(targetUserSid))
            {
                return new PolicyApplyResult
                {
                    PolicyId = PolicyId,
                    Success = false,
                    Error = "Violação de segurança: Não é permitido aplicar bloqueios de personalização à conta de administrador (imunidade de administrador).",
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }

            using var hiveScope = hiveManager.OpenUserHive(targetUserSid);
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

            var (hive, subKey) = ResolveTargetHiveAndKey(targetUserSid, hiveScope);

            try
            {
                if (desiredState == PolicyDesiredState.Blocked)
                {
                    registry.SetValue(hive, subKey, ValueName, EnforcedValue, RegistryValueType.DWord);
                    return new PolicyApplyResult
                    {
                        PolicyId = PolicyId,
                        Success = true,
                        EffectiveState = RequiresLogoff ? PolicyEffectiveState.PendingLogoff : PolicyEffectiveState.Applied,
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
        }

        public PolicyRevertResult Revert(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            using var hiveScope = hiveManager.OpenUserHive(targetUserSid);
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

            try
            {
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
        }
    }
}
