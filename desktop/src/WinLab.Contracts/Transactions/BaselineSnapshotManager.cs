using System;
using System.Collections.Generic;
using System.Linq;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;

namespace WinLab.Contracts.Transactions
{
    public class BaselineSnapshotManager
    {
        private readonly IRegistryService _registry;
        private readonly IUserHiveManager _hiveManager;

        public BaselineSnapshotManager(IRegistryService registry, IUserHiveManager hiveManager)
        {
            _registry = registry ?? throw new ArgumentNullException(nameof(registry));
            _hiveManager = hiveManager ?? throw new ArgumentNullException(nameof(hiveManager));
        }

        public (BaselineSnapshotDto Snapshot, List<RollbackStepDto> RollbackPlan) CaptureBaseline(
            IEnumerable<IPolicyHandler> policies,
            string? targetUserSid)
        {
            var snapshot = new BaselineSnapshotDto
            {
                CapturedAt = DateTime.UtcNow,
                Entries = new List<RegistryValueSnapshotDto>()
            };

            var rollbackSteps = new List<RollbackStepDto>();

            var policyList = new List<IPolicyHandler>(policies);
            bool needsUserHive = policyList.Exists(p => p.Scope == PolicyScope.User);
            IUserHiveScope? hiveScope = null;

            try
            {
                if (needsUserHive)
                {
                    hiveScope = _hiveManager.OpenUserHive(targetUserSid);
                    if (hiveScope == null || !hiveScope.IsAvailable)
                    {
                        throw new InvalidOperationException(
                            hiveScope?.ErrorMessage ?? $"Hive do usuário '{targetUserSid}' indisponível para captura de baseline.");
                    }
                }

                foreach (var policy in policyList)
                {
                    if (policy is RegistryDWordPolicyHandler dwordPolicy)
                    {
                        var (hive, subKey) = dwordPolicy.Scope == PolicyScope.Machine
                            ? (RegistryHiveType.LocalMachine, dwordPolicy.RelativeSubKeyPath)
                            : ResolveTargetKey(dwordPolicy.RelativeSubKeyPath, targetUserSid, hiveScope);
                        var entry = CaptureEntry(
                            dwordPolicy.PolicyId,
                            dwordPolicy.Scope,
                            hive,
                            subKey,
                            dwordPolicy.RelativeSubKeyPath,
                            dwordPolicy.ValueName);
                        snapshot.Entries.Add(entry);

                        rollbackSteps.Add(CreateRollbackStep(entry));
                    }
                    else if (policy is DualBrowserPolicyHandler browserPolicy)
                    {
                        // Chrome entry
                        var chromeEntry = CaptureEntry(
                            browserPolicy.PolicyId,
                            PolicyScope.Machine,
                            RegistryHiveType.LocalMachine,
                            browserPolicy.ChromeSubKey,
                            browserPolicy.ChromeSubKey,
                            browserPolicy.ChromeValueName);
                        snapshot.Entries.Add(chromeEntry);
                        rollbackSteps.Add(CreateRollbackStep(chromeEntry));

                        // Edge entry
                        var edgeEntry = CaptureEntry(
                            browserPolicy.PolicyId,
                            PolicyScope.Machine,
                            RegistryHiveType.LocalMachine,
                            browserPolicy.EdgeSubKey,
                            browserPolicy.EdgeSubKey,
                            browserPolicy.EdgeValueName);
                        snapshot.Entries.Add(edgeEntry);
                        rollbackSteps.Add(CreateRollbackStep(edgeEntry));
                    }
                }
            }
            finally
            {
                hiveScope?.Dispose();
            }

            // Invert the rollback steps so they execute in strict reverse order of application
            rollbackSteps.Reverse();
            for (int i = 0; i < rollbackSteps.Count; i++)
            {
                rollbackSteps[i].Sequence = i + 1;
            }

            return (snapshot, rollbackSteps);
        }

        private RegistryValueSnapshotDto CaptureEntry(
            string policyId,
            PolicyScope scope,
            RegistryHiveType hive,
            string subKey,
            string relativeSubKey,
            string valueName)
        {
            if (!_registry.KeyExists(hive, subKey))
            {
                return new RegistryValueSnapshotDto
                {
                    PolicyId = policyId,
                    Scope = scope,
                    Hive = hive.ToString(),
                    SubKey = subKey,
                    RelativeSubKey = relativeSubKey,
                    ValueName = valueName,
                    State = BaselineValueState.KeyDoesNotExist,
                    ValueKind = null,
                    OriginalValue = null
                };
            }

            if (!_registry.ValueExists(hive, subKey, valueName))
            {
                return new RegistryValueSnapshotDto
                {
                    PolicyId = policyId,
                    Scope = scope,
                    Hive = hive.ToString(),
                    SubKey = subKey,
                    RelativeSubKey = relativeSubKey,
                    ValueName = valueName,
                    State = BaselineValueState.DoesNotExist,
                    ValueKind = null,
                    OriginalValue = null
                };
            }

            var valKind = _registry.GetValueKind(hive, subKey, valueName);
            if (!valKind.HasValue)
            {
                throw new InvalidOperationException(
                    $"Não foi possível determinar o tipo do valor de registro '{hive}\\{subKey}\\{valueName}' durante a captura de baseline.");
            }

            var val = CloneSnapshotValue(_registry.GetValue(hive, subKey, valueName));

            return new RegistryValueSnapshotDto
            {
                PolicyId = policyId,
                Scope = scope,
                Hive = hive.ToString(),
                SubKey = subKey,
                RelativeSubKey = relativeSubKey,
                ValueName = valueName,
                State = BaselineValueState.Exists,
                ValueKind = valKind.Value.ToString(),
                OriginalValue = val
            };
        }

        private static object? CloneSnapshotValue(object? value)
        {
            return value switch
            {
                byte[] bytes => bytes.ToArray(),
                string[] strings => strings.ToArray(),
                _ => value
            };
        }

        private static RollbackStepDto CreateRollbackStep(RegistryValueSnapshotDto entry)
        {
            if (entry.State == BaselineValueState.Exists)
            {
                return new RollbackStepDto
                {
                    PolicyId = entry.PolicyId,
                    Scope = entry.Scope,
                    Hive = entry.Hive,
                    SubKey = entry.SubKey,
                    RelativeSubKey = entry.RelativeSubKey,
                    ValueName = entry.ValueName,
                    Operation = "RestoreValue",
                    RestoreKind = entry.ValueKind,
                    RestoreValue = CloneSnapshotValue(entry.OriginalValue),
                    Status = "Pending"
                };
            }

            // If it did not exist prior, cleanly delete it rather than zeroing it out
            return new RollbackStepDto
            {
                PolicyId = entry.PolicyId,
                Scope = entry.Scope,
                Hive = entry.Hive,
                SubKey = entry.SubKey,
                RelativeSubKey = entry.RelativeSubKey,
                ValueName = entry.ValueName,
                Operation = "DeleteValue",
                RestoreKind = null,
                RestoreValue = null,
                Status = "Pending"
            };
        }

        public static (RegistryHiveType hive, string subKey) ResolveTargetKey(
            string relativeSubKey,
            string? targetUserSid,
            IUserHiveScope? hiveScope)
        {
            string cleanRelative = (relativeSubKey ?? string.Empty).Trim('\\');
            if (string.IsNullOrWhiteSpace(targetUserSid))
            {
                return (RegistryHiveType.CurrentUser, cleanRelative);
            }

            string root = hiveScope == null || string.IsNullOrWhiteSpace(hiveScope.RootPath)
                ? targetUserSid.Trim()
                : hiveScope.RootPath.Trim();
            if (root.Equals("Software", StringComparison.OrdinalIgnoreCase))
            {
                return (RegistryHiveType.CurrentUser, cleanRelative);
            }

            return (RegistryHiveType.Users, $@"{root}\{cleanRelative}");
        }
    }
}
