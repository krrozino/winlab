using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;
using Xunit;

namespace WinLab.Tests
{
    public class PolicyCatalogTests
    {
        private static readonly string[] ExpectedCanonicalPolicyIds =
        {
            "personalization.wallpaper",
            "personalization.sounds",
            "personalization.mouse_pointers",
            "browser.chrome.incognito",
            "browser.chrome.guest",
            "browser.password_manager",
            "browser.developer_tools",
            "system.disable_cmd",
            "system.disable_regedit",
            "system.restrict_control_panel",
            "storage.usb_write_protect",
            "apps.disable_microsoft_store"
        };

        [Fact]
        public void PolicyCatalog_RegistersAll12CanonicalPolicies()
        {
            var catalog = new PolicyCatalog();
            var all = catalog.GetAllPolicies();

            Assert.Equal(12, all.Count);

            foreach (var id in ExpectedCanonicalPolicyIds)
            {
                var policy = catalog.GetPolicy(id);
                Assert.NotNull(policy);
                Assert.Equal(id, policy.PolicyId);
                Assert.True(policy.Reversible);
                Assert.False(string.IsNullOrWhiteSpace(policy.Title));
                Assert.False(string.IsNullOrWhiteSpace(policy.Description));
            }
        }

        [Fact]
        public void PolicyCatalog_PersonalizationAndSystemPolicies_HaveUserScopeAndExpectedFlags()
        {
            var catalog = new PolicyCatalog();

            var wallpaper = catalog.GetPolicy("personalization.wallpaper");
            Assert.NotNull(wallpaper);
            Assert.Equal(PolicyScope.User, wallpaper.Scope);
            Assert.True(wallpaper.RequiresLogoff);

            var sounds = catalog.GetPolicy("personalization.sounds");
            Assert.NotNull(sounds);
            Assert.Equal(PolicyScope.User, sounds.Scope);
            Assert.False(sounds.RequiresLogoff);

            var mouse = catalog.GetPolicy("personalization.mouse_pointers");
            Assert.NotNull(mouse);
            Assert.Equal(PolicyScope.User, mouse.Scope);
            Assert.False(mouse.RequiresLogoff);

            var cmd = catalog.GetPolicy("system.disable_cmd");
            Assert.NotNull(cmd);
            Assert.Equal(PolicyScope.User, cmd.Scope);
            Assert.Equal(PolicyRisk.Medium, cmd.Risk);

            var regedit = catalog.GetPolicy("system.disable_regedit");
            Assert.NotNull(regedit);
            Assert.Equal(PolicyScope.User, regedit.Scope);
            Assert.Equal(PolicyRisk.Medium, regedit.Risk);

            var controlPanel = catalog.GetPolicy("system.restrict_control_panel");
            Assert.NotNull(controlPanel);
            Assert.Equal(PolicyScope.User, controlPanel.Scope);
            Assert.True(controlPanel.RequiresLogoff);

            var store = catalog.GetPolicy("apps.disable_microsoft_store");
            Assert.NotNull(store);
            Assert.Equal(PolicyScope.User, store.Scope);
        }

        [Fact]
        public void PolicyCatalog_MachinePolicies_HaveMachineScopeAndExpectedFlags()
        {
            var catalog = new PolicyCatalog();

            foreach (var browserId in new[]
            {
                "browser.chrome.incognito",
                "browser.chrome.guest",
                "browser.password_manager",
                "browser.developer_tools"
            })
            {
                var browserPolicy = catalog.GetPolicy(browserId);
                Assert.NotNull(browserPolicy);
                Assert.Equal(PolicyScope.Machine, browserPolicy.Scope);
                Assert.True(browserPolicy.RequiresAppRestart);
                Assert.False(browserPolicy.RequiresLogoff);
                Assert.Contains("chrome", browserPolicy.TargetProcesses);
                Assert.Contains("msedge", browserPolicy.TargetProcesses);
            }

            var usb = catalog.GetPolicy("storage.usb_write_protect");
            Assert.NotNull(usb);
            Assert.Equal(PolicyScope.Machine, usb.Scope);
            Assert.False(usb.RequiresRestart);
            Assert.False(usb.RequiresLogoff);
        }

        [Fact]
        public void PolicyCatalog_GetCatalogDefinitions_ReturnsConsistentMetadata()
        {
            var catalog = new PolicyCatalog();
            var defs = catalog.GetCatalogDefinitions();

            Assert.Equal(12, defs.Count);
            Assert.All(defs, d =>
            {
                Assert.False(string.IsNullOrWhiteSpace(d.Id));
                Assert.False(string.IsNullOrWhiteSpace(d.Name));
                Assert.False(string.IsNullOrWhiteSpace(d.Category));
                Assert.Contains(d.RiskLevel, new[] { "Low", "Medium" });
                Assert.True(d.Reversible);
            });
        }

        [Fact]
        public void PolicyCatalog_GetPolicy_CaseInsensitiveAndNullForUnknown()
        {
            var catalog = new PolicyCatalog();

            Assert.NotNull(catalog.GetPolicy("PERSONALIZATION.WALLPAPER"));
            Assert.NotNull(catalog.GetPolicy("Browser.Chrome.Incognito"));
            Assert.NotNull(catalog.GetPolicy("STORAGE.USB_WRITE_PROTECT"));
            Assert.Null(catalog.GetPolicy("unknown.policy"));
        }

        [Fact]
        public async Task ExpandedPolicies_ApplyVerifyAndRollback_WorkEndToEndAcrossMachineAndUserScopes()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), $"winlab-cat-tx-{Guid.NewGuid():N}");
            try
            {
                const string studentSid = "S-1-5-21-1000-1002";
                var registry = new InMemoryRegistryService();
                var hiveManager = new MockUserHiveManager();
                hiveManager.SetUserLoggedOn(studentSid, true);

                var catalog = new PolicyCatalog(processChecker: _ => false);
                var engine = new TransactionEngine(catalog, registry, hiveManager, tempDir);

                var applyResult = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "browser.password_manager", DesiredState = "Blocked" },
                        new() { PolicyId = "browser.developer_tools", DesiredState = "Blocked" },
                        new() { PolicyId = "storage.usb_write_protect", DesiredState = "Blocked" },
                        new() { PolicyId = "system.disable_cmd", DesiredState = "Blocked" },
                        new() { PolicyId = "system.disable_regedit", DesiredState = "Blocked" },
                        new() { PolicyId = "system.restrict_control_panel", DesiredState = "Blocked" },
                        new() { PolicyId = "apps.disable_microsoft_store", DesiredState = "Blocked" }
                    }
                });

                Assert.True(applyResult.Success, applyResult.Message);
                Assert.Equal(TransactionStatus.Committed, applyResult.Status);
                Assert.Equal(7, applyResult.AppliedCount);

                // Verify HKLM values
                Assert.Equal(0, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "PasswordManagerEnabled"));
                Assert.Equal(0, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "PasswordManagerEnabled"));
                Assert.Equal(2, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "DeveloperToolsAvailability"));
                Assert.Equal(2, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "DeveloperToolsAvailability"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.LocalMachine, @"SYSTEM\CurrentControlSet\Control\StorageDevicePolicies", "WriteProtect"));

                // Verify HKU\<studentSid> values (isolated to target user!)
                Assert.Equal(2, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\System", "DisableCMD"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\System", "DisableRegistryTools"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoControlPanel"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\WindowsStore", "RemoveWindowsStore"));

                // Rollback transaction and confirm every single key/value is removed
                var rollbackResult = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = applyResult.TransactionId
                });
                Assert.True(rollbackResult.Success, rollbackResult.Message);
                Assert.Equal(TransactionStatus.RolledBack, rollbackResult.Status);

                Assert.Null(registry.GetValue(RegistryHiveType.LocalMachine, @"SYSTEM\CurrentControlSet\Control\StorageDevicePolicies", "WriteProtect"));
                Assert.Null(registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "PasswordManagerEnabled"));
                Assert.Null(registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "DeveloperToolsAvailability"));
                Assert.Null(registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\System", "DisableCMD"));
                Assert.Null(registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\System", "DisableRegistryTools"));
                Assert.Null(registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\Explorer", "NoControlPanel"));
                Assert.Null(registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\WindowsStore", "RemoveWindowsStore"));
            }
            finally
            {
                if (Directory.Exists(tempDir))
                    Directory.Delete(tempDir, recursive: true);
            }
        }
    }
}
