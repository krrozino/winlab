using System;
using System.Collections.Generic;
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

            using var hiveScope = _hiveManager.OpenUserHive(targetUserSid);

            foreach (var policy in policies)
            {
                if (policy is RegistryDWordPolicyHandler dwordPolicy)
                {
                    var (hive, subKey) = ResolveTargetKey(dwordPolicy.RelativeSubKeyPath, targetUserSid, hiveScope);
                    var entry = CaptureEntry(dwordPolicy.PolicyId, hive, subKey, dwordPolicy.ValueName);
                    snapshot.Entries.Add(entry);

                    rollbackSteps.Add(CreateRollbackStep(entry));
                }
                else if (policy is DualBrowserPolicyHandler browserPolicy)
                {
                    // Chrome entry
                    var chromeEntry = CaptureEntry(
                        browserPolicy.PolicyId,
                        RegistryHiveType.LocalMachine,
                        browserPolicy.ChromeSubKey,
                        browserPolicy.ChromeValueName);
                    snapshot.Entries.Add(chromeEntry);
                    rollbackSteps.Add(CreateRollbackStep(chromeEntry));

                    // Edge entry
                    var edgeEntry = CaptureEntry(
                        browserPolicy.PolicyId,
                        RegistryHiveType.LocalMachine,
                        browserPolicy.EdgeSubKey,
                        browserPolicy.EdgeValueName);
                    snapshot.Entries.Add(edgeEntry);
                    rollbackSteps.Add(CreateRollbackStep(edgeEntry));
                }
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
            RegistryHiveType hive,
            string subKey,
            string valueName)
        {
            if (!_registry.KeyExists(hive, subKey))
            {
                return new RegistryValueSnapshotDto
                {
                    PolicyId = policyId,
                    Hive = hive.ToString(),
                    SubKey = subKey,
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
                    Hive = hive.ToString(),
                    SubKey = subKey,
                    ValueName = valueName,
                    State = BaselineValueState.DoesNotExist,
                    ValueKind = null,
                    OriginalValue = null
                };
            }

            var valKind = _registry.GetValueKind(hive, subKey, valueName);
            var val = _registry.GetValue(hive, subKey, valueName);

            return new RegistryValueSnapshotDto
            {
                PolicyId = policyId,
                Hive = hive.ToString(),
                SubKey = subKey,
                ValueName = valueName,
                State = BaselineValueState.Exists,
                ValueKind = valKind?.ToString() ?? "DWord",
                OriginalValue = val
            };
        }

        private static RollbackStepDto CreateRollbackStep(RegistryValueSnapshotDto entry)
        {
            if (entry.State == BaselineValueState.Exists)
            {
                return new RollbackStepDto
                {
                    PolicyId = entry.PolicyId,
                    Hive = entry.Hive,
                    SubKey = entry.SubKey,
                    ValueName = entry.ValueName,
                    Operation = "RestoreValue",
                    RestoreKind = entry.ValueKind ?? "DWord",
                    RestoreValue = entry.OriginalValue,
                    Status = "Pending"
                };
            }

            // If it did not exist prior, cleanly delete it rather than zeroing it out
            return new RollbackStepDto
            {
                PolicyId = entry.PolicyId,
                Hive = entry.Hive,
                SubKey = entry.SubKey,
                ValueName = entry.ValueName,
                Operation = "DeleteValue",
                RestoreKind = null,
                RestoreValue = null,
                Status = "Pending"
            };
        }

        private static (RegistryHiveType hive, string subKey) ResolveTargetKey(
            string relativeSubKey,
            string? targetUserSid,
            IUserHiveScope hiveScope)
        {
            if (string.IsNullOrWhiteSpace(targetUserSid))
            {
                return (RegistryHiveType.CurrentUser, relativeSubKey.Trim('\\'));
            }

            string root = string.IsNullOrWhiteSpace(hiveScope.RootPath) ? targetUserSid : hiveScope.RootPath;
            if (root.Equals("Software", StringComparison.OrdinalIgnoreCase))
            {
                return (RegistryHiveType.CurrentUser, relativeSubKey.Trim('\\'));
            }

            return (RegistryHiveType.Users, $@"{root}\{relativeSubKey.Trim('\\')}");
        }
    }
}
