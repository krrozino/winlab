using System;
using System.Diagnostics;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Policies
{
    public class DualBrowserPolicyHandler : IPolicyHandler
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

        public string ChromeSubKey { get; }
        public string ChromeValueName { get; }
        public int ChromeEnforcedValue { get; }

        public string EdgeSubKey { get; }
        public string EdgeValueName { get; }
        public int EdgeEnforcedValue { get; }

        private readonly Func<string, bool> _processChecker;

        public DualBrowserPolicyHandler(
            string policyId,
            string title,
            string description,
            string chromeSubKey,
            string chromeValueName,
            int chromeEnforcedValue,
            string edgeSubKey,
            string edgeValueName,
            int edgeEnforcedValue,
            Func<string, bool>? processChecker = null)
        {
            PolicyId = policyId;
            Category = "Navegadores";
            Title = title;
            Description = description;
            Scope = PolicyScope.Machine;
            Risk = PolicyRisk.Low;
            RequiresRestart = false;
            RequiresLogoff = false;
            RequiresAppRestart = true;
            Reversible = true;
            TargetProcesses = new[] { "chrome", "msedge" };

            ChromeSubKey = chromeSubKey.Trim('\\');
            ChromeValueName = chromeValueName;
            ChromeEnforcedValue = chromeEnforcedValue;

            EdgeSubKey = edgeSubKey.Trim('\\');
            EdgeValueName = edgeValueName;
            EdgeEnforcedValue = edgeEnforcedValue;

            _processChecker = processChecker ?? DefaultProcessChecker;
        }

        private static bool DefaultProcessChecker(string processName)
        {
            try
            {
                var procs = Process.GetProcessesByName(processName);
                bool running = procs.Length > 0;
                foreach (var p in procs)
                {
                    try { p.Dispose(); } catch { }
                }
                return running;
            }
            catch
            {
                return false;
            }
        }

        private bool AnyBrowserRunning()
        {
            foreach (var proc in TargetProcesses)
            {
                try
                {
                    if (_processChecker(proc))
                    {
                        return true;
                    }
                }
                catch
                {
                    // Fault resilience: if process checking throws, swallow gracefully
                }
            }
            return false;
        }

        public PolicyProbeResult Probe(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            object? chromeRaw = null;
            object? edgeRaw = null;
            RegistryValueType? chromeKind = null;
            RegistryValueType? edgeKind = null;

            try
            {
                chromeRaw = registry.GetValue(RegistryHiveType.LocalMachine, ChromeSubKey, ChromeValueName, null);
                chromeKind = registry.GetValueKind(RegistryHiveType.LocalMachine, ChromeSubKey, ChromeValueName);

                edgeRaw = registry.GetValue(RegistryHiveType.LocalMachine, EdgeSubKey, EdgeValueName, null);
                edgeKind = registry.GetValueKind(RegistryHiveType.LocalMachine, EdgeSubKey, EdgeValueName);
            }
            catch (Exception ex)
            {
                return new PolicyProbeResult
                {
                    PolicyId = PolicyId,
                    IsActive = false,
                    EffectiveState = PolicyEffectiveState.Inconclusive,
                    DetailMessage = $"Falha ao consultar registro de navegadores: {ex.Message}",
                    TargetSid = targetUserSid,
                    RequiresAppRestart = RequiresAppRestart
                };
            }

            bool chromeIsDword = (chromeKind == null || chromeKind == RegistryValueType.DWord) && !(chromeRaw is string) && !(chromeRaw is bool);
            bool edgeIsDword = (edgeKind == null || edgeKind == RegistryValueType.DWord) && !(edgeRaw is string) && !(edgeRaw is bool);

            bool chromeMatch = false;
            if (chromeRaw != null && chromeIsDword)
            {
                try { chromeMatch = Convert.ToInt32(chromeRaw) == ChromeEnforcedValue; } catch { }
            }

            bool edgeMatch = false;
            if (edgeRaw != null && edgeIsDword)
            {
                try { edgeMatch = Convert.ToInt32(edgeRaw) == EdgeEnforcedValue; } catch { }
            }

            bool isFullyEnforced = chromeMatch && edgeMatch;
            bool isNeitherConfigured = (chromeRaw == null && edgeRaw == null);

            PolicyEffectiveState state;
            if (isFullyEnforced)
            {
                state = AnyBrowserRunning() ? PolicyEffectiveState.PendingAppRestart : PolicyEffectiveState.Applied;
            }
            else if (isNeitherConfigured)
            {
                state = PolicyEffectiveState.NotConfigured;
            }
            else
            {
                state = PolicyEffectiveState.Drifted;
            }

            return new PolicyProbeResult
            {
                PolicyId = PolicyId,
                IsActive = isFullyEnforced,
                LiveValue = new { chrome = chromeRaw, edge = edgeRaw },
                EffectiveState = state,
                RequiresLogoff = RequiresLogoff,
                RequiresRestart = RequiresRestart,
                RequiresAppRestart = RequiresAppRestart,
                TargetSid = targetUserSid,
                DetailMessage = $"Chrome={chromeRaw ?? "null"}, Edge={edgeRaw ?? "null"}",
                ProbedAtUtc = DateTime.UtcNow
            };
        }

        public PolicyApplyResult Apply(string? targetUserSid, PolicyDesiredState desiredState, IRegistryService registry, IUserHiveManager hiveManager)
        {
            try
            {
                if (desiredState == PolicyDesiredState.Blocked)
                {
                    registry.SetValue(RegistryHiveType.LocalMachine, ChromeSubKey, ChromeValueName, ChromeEnforcedValue, RegistryValueType.DWord);
                    registry.SetValue(RegistryHiveType.LocalMachine, EdgeSubKey, EdgeValueName, EdgeEnforcedValue, RegistryValueType.DWord);

                    bool isRunning = AnyBrowserRunning();
                    return new PolicyApplyResult
                    {
                        PolicyId = PolicyId,
                        Success = true,
                        EffectiveState = isRunning ? PolicyEffectiveState.PendingAppRestart : PolicyEffectiveState.Applied,
                        RequiresLogoff = RequiresLogoff,
                        RequiresRestart = RequiresRestart,
                        RequiresAppRestart = RequiresAppRestart
                    };
                }
                else
                {
                    registry.DeleteValue(RegistryHiveType.LocalMachine, ChromeSubKey, ChromeValueName);
                    registry.DeleteValue(RegistryHiveType.LocalMachine, EdgeSubKey, EdgeValueName);

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
                    Error = $"Falha ao gravar registro de navegadores: {ex.Message}",
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }
        }

        public PolicyRevertResult Revert(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
        {
            try
            {
                registry.DeleteValue(RegistryHiveType.LocalMachine, ChromeSubKey, ChromeValueName);
                registry.DeleteValue(RegistryHiveType.LocalMachine, EdgeSubKey, EdgeValueName);

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
                    Error = $"Falha ao reverter registro de navegadores: {ex.Message}",
                    EffectiveState = PolicyEffectiveState.Failed
                };
            }
        }
    }
}
