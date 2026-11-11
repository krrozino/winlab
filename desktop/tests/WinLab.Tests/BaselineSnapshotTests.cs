using System;
using System.Linq;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;
using Xunit;

namespace WinLab.Tests
{
    public class BaselineSnapshotTests
    {
        [Fact]
        public void Baseline_Captures_AllThreeTriStates_Correctly()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var snapshotManager = new BaselineSnapshotManager(registry, hiveManager);

            string studentSid = "S-1-5-21-99999-1002";

            // Policy 1: Key does not exist at all
            var policy1 = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Wallpaper",
                description: "Wallpaper",
                relativeSubKeyPath: @"Software\NonExistentSubKey\Test",
                valueName: "NoChangingWallPaper"
            );

            // Policy 2: Key exists, but value does NOT exist
            string soundsKey = $@"Software\Policies\Microsoft\Windows\Personalization";
            registry.CreateSubKey(RegistryHiveType.Users, $@"{studentSid}\{soundsKey}");
            var policy2 = new RegistryDWordPolicyHandler(
                policyId: "personalization.sounds",
                category: "Personalização",
                title: "Sounds",
                description: "Sounds",
                relativeSubKeyPath: soundsKey,
                valueName: "NoChangingSoundScheme"
            );

            // Policy 3: Key and value both exist (original value = 42)
            string chromeKey = @"SOFTWARE\Policies\Google\Chrome";
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability", 42, RegistryValueType.DWord);
            string edgeKey = @"SOFTWARE\Policies\Microsoft\Edge";
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability", 99, RegistryValueType.DWord);

            var policy3 = new DualBrowserPolicyHandler(
                policyId: "browser.chrome.incognito",
                title: "Chrome Incognito",
                description: "Incognito",
                chromeSubKey: chromeKey,
                chromeValueName: "IncognitoModeAvailability",
                chromeEnforcedValue: 1,
                edgeSubKey: edgeKey,
                edgeValueName: "InPrivateModeAvailability",
                edgeEnforcedValue: 1
            );

            var (snapshot, rollbackPlan) = snapshotManager.CaptureBaseline(
                new IPolicyHandler[] { policy1, policy2, policy3 },
                studentSid);

            // Verify Snapshot Tri-States
            var entry1 = snapshot.Entries.First(e => e.PolicyId == "personalization.wallpaper");
            Assert.Equal(BaselineValueState.KeyDoesNotExist, entry1.State);
            Assert.Null(entry1.OriginalValue);

            var entry2 = snapshot.Entries.First(e => e.PolicyId == "personalization.sounds");
            Assert.Equal(BaselineValueState.DoesNotExist, entry2.State);
            Assert.Null(entry2.OriginalValue);

            var entry3Chrome = snapshot.Entries.First(e => e.PolicyId == "browser.chrome.incognito" && e.SubKey == chromeKey);
            Assert.Equal(BaselineValueState.Exists, entry3Chrome.State);
            Assert.Equal(42, Convert.ToInt32(entry3Chrome.OriginalValue));

            var entry3Edge = snapshot.Entries.First(e => e.PolicyId == "browser.chrome.incognito" && e.SubKey == edgeKey);
            Assert.Equal(BaselineValueState.Exists, entry3Edge.State);
            Assert.Equal(99, Convert.ToInt32(entry3Edge.OriginalValue));

            // Verify Pre-computed Rollback Plan Rules
            // 1. Never defaults to 0: DoesNotExist and KeyDoesNotExist MUST yield DeleteValue
            var step1 = rollbackPlan.First(s => s.PolicyId == "personalization.wallpaper");
            Assert.Equal("DeleteValue", step1.Operation);
            Assert.Null(step1.RestoreValue);

            var step2 = rollbackPlan.First(s => s.PolicyId == "personalization.sounds");
            Assert.Equal("DeleteValue", step2.Operation);
            Assert.Null(step2.RestoreValue);

            // 2. Pre-existing values MUST yield RestoreValue with original data
            var stepChrome = rollbackPlan.First(s => s.PolicyId == "browser.chrome.incognito" && s.SubKey == chromeKey);
            Assert.Equal("RestoreValue", stepChrome.Operation);
            Assert.Equal(42, Convert.ToInt32(stepChrome.RestoreValue));
        }

        [Fact]
        public void Baseline_RollbackPlan_IsSequencedInStrictReverseOrder()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var snapshotManager = new BaselineSnapshotManager(registry, hiveManager);

            var p1 = new RegistryDWordPolicyHandler("p1", "Cat", "P1", "D", "K1", "V1");
            var p2 = new RegistryDWordPolicyHandler("p2", "Cat", "P2", "D", "K2", "V2");
            var p3 = new RegistryDWordPolicyHandler("p3", "Cat", "P3", "D", "K3", "V3");

            var (_, rollbackPlan) = snapshotManager.CaptureBaseline(new[] { p1, p2, p3 }, null);

            Assert.Equal(3, rollbackPlan.Count);
            Assert.Equal("p3", rollbackPlan[0].PolicyId);
            Assert.Equal(1, rollbackPlan[0].Sequence);

            Assert.Equal("p2", rollbackPlan[1].PolicyId);
            Assert.Equal(2, rollbackPlan[1].Sequence);

            Assert.Equal("p1", rollbackPlan[2].PolicyId);
            Assert.Equal(3, rollbackPlan[2].Sequence);
        }
    }
}
