using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Scanning;
using WinLab.Contracts.Transactions;
using WinLab.Desktop.Services;
using WinLab.Executor;
using WinLab.Executor.Services;
using Xunit;

namespace WinLab.Tests
{
    public class TransactionReliabilitySprint01ATests
    {
        private static string CreateTempTransactionDir()
        {
            string dir = Path.Combine(Path.GetTempPath(), "WinLab_Sprint01A_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            return dir;
        }

        // =========================================================================
        // Task 1 — Partial Rollback (DualBrowserPolicyHandler & initiated policies)
        // =========================================================================

        [Fact]
        public async Task Task1_DualBrowser_FailureOnSecondWrite_RollsBackFirstWriteAndPriorPolicies()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                // First write (Chrome: IncognitoModeAvailability) succeeds;
                // Second write inside the same DualBrowserPolicyHandler (Edge: InPrivateModeAvailability) fails.
                registry.SetWriteFault("InPrivateModeAvailability", new UnauthorizedAccessException("Edge registry key locked"));

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-partial-dual-absent",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal("browser.chrome.incognito", result.FailedPolicyId);
                Assert.Equal(1, result.AppliedCount);
                Assert.True(result.RolledBackCount >= 2); // wallpaper + Chrome partial write

                // Partial Chrome mutation MUST be reverted (absent)
                Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));

                // Prior policy MUST be reverted
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));

                // Subsequent policy was never applied
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task1_DualBrowser_FailureOnSecondWriteWithPreExistingValues_RestoresChromeAndKeepsEdgeOriginal()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                // Seed pre-existing values (2 = forced incognito/inprivate)
                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability", 2, RegistryValueType.DWord);
                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability", 2, RegistryValueType.DWord);

                // Chrome write (1) succeeds, Edge write (1) fails
                registry.SetWriteFault("InPrivateModeAvailability", new UnauthorizedAccessException("Edge write denied"));

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-partial-dual-preexisting",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "Blocked" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal(0, result.AppliedCount);
                Assert.Equal(1, result.RolledBackCount); // Chrome restored from 1 back to 2

                Assert.Equal(2, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.Equal(2, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task1_DualBrowser_DeactivationFailureOnSecondDelete_RestoresFirstDeletedValue()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability", 1, RegistryValueType.DWord);
                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability", 1, RegistryValueType.DWord);

                // Chrome deletion succeeds, Edge deletion fails
                registry.SetDeleteFault("InPrivateModeAvailability", new UnauthorizedAccessException("Edge delete denied"));

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-partial-dual-delete",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "NotConfigured" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal(1, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task1_UnhandledExceptionAfterPartialMutation_StillRollsBackInitiatedPolicy()
        {
            var innerRegistry = new InMemoryRegistryService();
            // Throw on Edge write when using the real DualBrowserPolicyHandler
            innerRegistry.SetWriteFault("InPrivateModeAvailability", new InvalidOperationException("Fault on second write"));
            var registry = new ThrowingSetValueRegistry(innerRegistry, "InPrivateModeAvailability");
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-throwing-handler",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "Blocked" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.False(innerRegistry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // Task 2 — Deactivation Verification (NotConfigured requires reliable readback)
        // =========================================================================

        [Fact]
        public async Task Task2_NotConfigured_WhenProbeIsInconclusive_FailsAndRollsBack()
        {
            var innerRegistry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                // Seed active policy first
                innerRegistry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 1, RegistryValueType.DWord);
                // Fail readback ONLY during the verification probe (1st GetValue after DeleteValue), then allow rollback readback verification
                var registry = new TransientProbeFaultRegistry(innerRegistry, "NoChangingSoundScheme", failOnGetValueCallNumber: 2);
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-deact-inconclusive",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "NotConfigured" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal("personalization.sounds", result.FailedPolicyId);
                Assert.Contains("Inconclusive", result.FailureReason);
                // Original value 1 restored because deactivation was not confirmed
                Assert.Equal(1, innerRegistry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task2_NotConfigured_WhenProbeIsFailed_FailsAndRollsBack()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var realCatalog = new PolicyCatalog(processChecker: _ => false);
            var stubHandler = new StubProbeStateHandler(
                "stub.failed_probe",
                PolicyEffectiveState.Failed,
                isActive: false);
            var catalog = new CompositePolicyCatalog(realCatalog, stubHandler);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 1, RegistryValueType.DWord);

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-deact-failed",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "NotConfigured" },
                        new() { PolicyId = "stub.failed_probe", DesiredState = "NotConfigured" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal("stub.failed_probe", result.FailedPolicyId);
                Assert.Contains("Failed", result.FailureReason);
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task2_NotConfigured_WhenProbeIsDrifted_FailsAndRollsBack()
        {
            var innerRegistry = new InMemoryRegistryService();
            // Edge DeleteValue silently leaves Edge value behind, so DualBrowser Probe reports Drifted (IsActive=false)
            var registry = new SilentNoOpDeleteRegistry(innerRegistry, "InPrivateModeAvailability");
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                innerRegistry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability", 1, RegistryValueType.DWord);
                innerRegistry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability", 1, RegistryValueType.DWord);

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-deact-drifted",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "NotConfigured" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Contains("Drifted", result.FailureReason);
                // Chrome was restored back to 1 because deactivation was Drifted, not NotConfigured
                Assert.Equal(1, innerRegistry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.Equal(1, innerRegistry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task2_NotConfigured_WhenValueRemainsPresentAsNonEnforced_FailsAndRollsBack()
        {
            var innerRegistry = new InMemoryRegistryService();
            var registry = new SilentNoOpDeleteRegistry(innerRegistry, "NoChangingSoundScheme");
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                innerRegistry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 0, RegistryValueType.DWord);

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-deact-leftover",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "NotConfigured" }
                    }
                });

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal(0, innerRegistry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task2_NotConfigured_CleanReadback_CommitsSuccessfully()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 1, RegistryValueType.DWord);
                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability", 1, RegistryValueType.DWord);
                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability", 1, RegistryValueType.DWord);

                var result = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-deact-clean",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "NotConfigured" },
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "NotConfigured" }
                    }
                });

                Assert.True(result.Success);
                Assert.Equal(TransactionStatus.Committed, result.Status);
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
                Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public void Task2_PolicyQueryCoordinator_DoesNotReportInconclusiveFailedOrDriftedAsNotConfigured()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            const string studentSid = "S-1-5-21-5555-1002";
            var accounts = new List<LocalUserDto>
            {
                new() { Name = "Aluno", Enabled = true, IsAdmin = false, PrivilegeClassification = AccountPrivilegeClassification.StandardUser, Sid = studentSid }
            };

            registry.SetProbeFault("NoChangingSoundScheme", new UnauthorizedAccessException("Denied"));
            registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability", 1, RegistryValueType.DWord);

            var outcome = PolicyQueryCoordinator.QueryStates(catalog, registry, hiveManager, studentSid, accounts);
            Assert.True(outcome.Success);

            var sounds = outcome.Summary!.Items.Single(i => i.Id == "personalization.sounds");
            Assert.Equal(PolicyState.Inconclusive, sounds.CurrentState);
            Assert.NotEqual(PolicyState.NotConfigured, sounds.ConfiguredState);

            var incognito = outcome.Summary.Items.Single(i => i.Id == "browser.chrome.incognito");
            Assert.Equal(PolicyState.Drifted, incognito.CurrentState);
            Assert.NotEqual(PolicyState.NotConfigured, incognito.ConfiguredState);
        }

        // =========================================================================
        // Task 3 — Verifiable Rollback (Value/Type/Content comparison & Hive resolution)
        // =========================================================================

        [Theory]
        [InlineData(RegistryValueType.DWord, 42)]
        [InlineData(RegistryValueType.QWord, 9876543210123L)]
        [InlineData(RegistryValueType.String, "OriginalStringValue")]
        [InlineData(RegistryValueType.ExpandString, @"%SystemRoot%\System32\calc.exe")]
        public async Task Task3_Rollback_RestoresExactValueAndType_AcrossDiskReload(RegistryValueType originalKind, object originalValue)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";
            string subKey = $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization";

            try
            {
                registry.SetValue(RegistryHiveType.Users, subKey, "NoChangingSoundScheme", originalValue, originalKind);

                var engine1 = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var applyRes = await engine1.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-restore-kind-{originalKind}",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);

                // Reload in a fresh TransactionEngine instance so JsonElement deserialization is exercised
                var engine2 = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var rollbackRes = await engine2.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = $"tx-restore-kind-{originalKind}"
                });

                Assert.True(rollbackRes.Success);
                Assert.Equal(TransactionStatus.RolledBack, rollbackRes.Status);
                Assert.Equal(originalKind, registry.GetValueKind(RegistryHiveType.Users, subKey, "NoChangingSoundScheme"));
                Assert.Equal(originalValue, registry.GetValue(RegistryHiveType.Users, subKey, "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task3_Rollback_RestoresExactBinaryAndMultiStringContent_AcrossDiskReload()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            byte[] originalBytes = new byte[] { 0x01, 0xAB, 0xFF, 0x10 };
            string[] originalMulti = new[] { "alpha", "beta", "gamma" };

            try
            {
                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", originalBytes, RegistryValueType.Binary);
                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers", originalMulti, RegistryValueType.MultiString);

                var engine1 = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var applyRes = await engine1.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-restore-complex",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.mouse_pointers", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);

                var engine2 = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var rollbackRes = await engine2.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-restore-complex"
                });

                Assert.True(rollbackRes.Success);
                Assert.Equal(TransactionStatus.RolledBack, rollbackRes.Status);

                Assert.Equal(RegistryValueType.Binary, registry.GetValueKind(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
                var restoredBytes = Assert.IsType<byte[]>(registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
                Assert.Equal(originalBytes, restoredBytes);

                Assert.Equal(RegistryValueType.MultiString, registry.GetValueKind(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"));
                var restoredMulti = Assert.IsType<string[]>(registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"));
                Assert.Equal(originalMulti, restoredMulti);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task3_Rollback_WhenRestoredValueOrKindDiverges_DoesNotReportSuccess()
        {
            var innerRegistry = new InMemoryRegistryService();
            var corruptingRegistry = new CorruptingRestoreRegistry(innerRegistry, "NoChangingSoundScheme", corruptKind: RegistryValueType.String, corruptValue: "42");
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                innerRegistry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 42, RegistryValueType.DWord);

                var engine = new TransactionEngine(catalog, corruptingRegistry, hiveManager, testDir);
                var applyRes = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-corrupt-restore-kind",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);

                corruptingRegistry.EnableCorruption = true;

                var rollbackRes = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-corrupt-restore-kind"
                });

                Assert.False(rollbackRes.Success);
                Assert.Equal(TransactionStatus.Failed, rollbackRes.Status);
                Assert.Contains("Recuperação incompleta", rollbackRes.Message);
                Assert.Contains("Tipo restaurado divergente", rollbackRes.Error);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task3_Rollback_WhenRestoredContentDiverges_DoesNotReportSuccess()
        {
            var innerRegistry = new InMemoryRegistryService();
            var corruptingRegistry = new CorruptingRestoreRegistry(innerRegistry, "NoChangingSoundScheme", corruptKind: RegistryValueType.DWord, corruptValue: 777);
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                innerRegistry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 42, RegistryValueType.DWord);

                var engine = new TransactionEngine(catalog, corruptingRegistry, hiveManager, testDir);
                var applyRes = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-corrupt-restore-value",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);

                corruptingRegistry.EnableCorruption = true;

                var rollbackRes = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-corrupt-restore-value"
                });

                Assert.False(rollbackRes.Success);
                Assert.Equal(TransactionStatus.Failed, rollbackRes.Status);
                Assert.Contains("Recuperação incompleta", rollbackRes.Message);
                Assert.Contains("Conteúdo restaurado divergente", rollbackRes.Error);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task3_Rollback_WhenPlanDivergesFromOriginalSnapshot_FailsWithoutAnnouncingSuccess()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 42, RegistryValueType.DWord);

                var engine1 = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var applyRes = await engine1.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-tampered-plan",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);

                // Tamper RollbackPlan on disk while leaving Baseline intact
                string txPath = Path.Combine(testDir, "tx-tampered-plan.json");
                var dto = JsonSerializer.Deserialize<TransactionDto>(await File.ReadAllTextAsync(txPath))!;
                dto.RollbackPlan[0].RestoreValue = 999;
                await File.WriteAllTextAsync(txPath, JsonSerializer.Serialize(dto));

                var engine2 = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var rollbackRes = await engine2.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-tampered-plan"
                });

                Assert.False(rollbackRes.Success);
                Assert.Equal(TransactionStatus.Failed, rollbackRes.Status);
                Assert.Contains("Recuperação incompleta", rollbackRes.Message);
                Assert.Contains("Divergência de conteúdo", rollbackRes.Error);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task3_Rollback_ResolvesRealHive_WhenProfileTransitionsOfflineToLoggedOn_AndViceVersa()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager { UseOfflineMountPrefix = true };
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";
            const string relSubKey = @"Software\Policies\Microsoft\Windows\Personalization";
            string offlineSubKey = $@"WinLab_Mounted_{studentSid}\{relSubKey}";
            string loggedOnSubKey = $@"{studentSid}\{relSubKey}";

            try
            {
                // Phase 1: User starts OFFLINE (pre-existing value = 7 in offline hive)
                hiveManager.SetUserLoggedOn(studentSid, false);
                registry.SetValue(RegistryHiveType.Users, offlineSubKey, "NoChangingSoundScheme", 7, RegistryValueType.DWord);

                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var applyRes = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-hive-transition-1",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, offlineSubKey, "NoChangingSoundScheme"));

                // Simulate Windows loading the user's NTUSER.DAT at HKU\<SID> upon logon (offline mount key is no longer used)
                registry.DeleteSubKeyTree(RegistryHiveType.Users, $"WinLab_Mounted_{studentSid}");
                registry.SetValue(RegistryHiveType.Users, loggedOnSubKey, "NoChangingSoundScheme", 1, RegistryValueType.DWord);
                hiveManager.SetUserLoggedOn(studentSid, true);

                var rollbackRes1 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-hive-transition-1"
                });

                Assert.True(rollbackRes1.Success);
                Assert.Equal(TransactionStatus.RolledBack, rollbackRes1.Status);
                Assert.Equal(7, registry.GetValue(RegistryHiveType.Users, loggedOnSubKey, "NoChangingSoundScheme"));
                Assert.False(registry.ValueExists(RegistryHiveType.Users, offlineSubKey, "NoChangingSoundScheme"));

                // Phase 2: User starts LOGGED ON (pre-existing value = 7), applies, then logs OFF before rollback
                var applyRes2 = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-hive-transition-2",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes2.Success);
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, loggedOnSubKey, "NoChangingSoundScheme"));

                // Simulate user logoff: HKU\<SID> unloaded, NTUSER.DAT mounted at WinLab_Mounted_<SID>
                registry.DeleteSubKeyTree(RegistryHiveType.Users, studentSid);
                registry.SetValue(RegistryHiveType.Users, offlineSubKey, "NoChangingSoundScheme", 1, RegistryValueType.DWord);
                hiveManager.SetUserLoggedOn(studentSid, false);

                var rollbackRes2 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-hive-transition-2"
                });

                Assert.True(rollbackRes2.Success);
                Assert.Equal(TransactionStatus.RolledBack, rollbackRes2.Status);
                Assert.Equal(7, registry.GetValue(RegistryHiveType.Users, offlineSubKey, "NoChangingSoundScheme"));
                Assert.False(registry.ValueExists(RegistryHiveType.Users, loggedOnSubKey, "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Task3_Rollback_WhenUserHiveBecomesUnavailable_FailsWithoutFakeRecovery()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();
            const string studentSid = "S-1-5-21-5555-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var applyRes = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-hive-unavailable-rb",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);

                // Make user hive unavailable at rollback time
                hiveManager.SetUserUninitialized(studentSid);

                var rollbackRes = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-hive-unavailable-rb"
                });

                Assert.False(rollbackRes.Success);
                Assert.Equal(TransactionStatus.Failed, rollbackRes.Status);
                Assert.Contains("Recuperação incompleta", rollbackRes.Message);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public void Task3_WindowsRegistryAdapters_PreserveLiteralRegExpandSzEnvironmentVariables()
        {
            if (!OperatingSystem.IsWindows())
            {
                return;
            }

            var winRegistry = new WindowsRegistryService();
            var liveReader = new LiveWindowsRegistryService();
            string tempSubKey = $@"Software\WinLab\TestTemp_ExpandSz_{Guid.NewGuid():N}";
            const string valueName = "TestExpandPath";
            const string literalValue = @"%SystemRoot%\System32\winlab-test.exe";

            try
            {
                winRegistry.SetValue(RegistryHiveType.CurrentUser, tempSubKey, valueName, literalValue, RegistryValueType.ExpandString);

                Assert.Equal(RegistryValueType.ExpandString, winRegistry.GetValueKind(RegistryHiveType.CurrentUser, tempSubKey, valueName));
                Assert.Equal(literalValue, winRegistry.GetValue(RegistryHiveType.CurrentUser, tempSubKey, valueName));
                Assert.Equal(literalValue, winRegistry.SnapshotKey(RegistryHiveType.CurrentUser, tempSubKey)[valueName]);

                Assert.Equal(RegistryValueType.ExpandString, liveReader.GetValueKind(RegistryHiveType.CurrentUser, tempSubKey, valueName));
                Assert.Equal(literalValue, liveReader.GetValue(RegistryHiveType.CurrentUser, tempSubKey, valueName));
                Assert.Equal(literalValue, liveReader.SnapshotKey(RegistryHiveType.CurrentUser, tempSubKey)[valueName]);

                // Verify BaselineSnapshotManager also captures the unexpanded literal value
                var snapshotMgr = new BaselineSnapshotManager(winRegistry, new MockUserHiveManager());
                var tempHandler = new RegistryDWordPolicyHandler(
                    policyId: "test.temp.expand",
                    category: "Test",
                    title: "Test",
                    description: "Test",
                    relativeSubKeyPath: tempSubKey,
                    valueName: valueName,
                    scope: PolicyScope.User);

                var (snapshot, rollbackPlan) = snapshotMgr.CaptureBaseline(new IPolicyHandler[] { tempHandler }, null);
                var entry = Assert.Single(snapshot.Entries);
                Assert.Equal(BaselineValueState.Exists, entry.State);
                Assert.Equal(nameof(RegistryValueType.ExpandString), entry.ValueKind);
                Assert.Equal(literalValue, entry.OriginalValue);

                var step = Assert.Single(rollbackPlan);
                Assert.Equal("RestoreValue", step.Operation);
                Assert.Equal(nameof(RegistryValueType.ExpandString), step.RestoreKind);
                Assert.Equal(literalValue, step.RestoreValue);
            }
            finally
            {
                winRegistry.DeleteSubKeyTree(RegistryHiveType.CurrentUser, tempSubKey);
            }
        }

        [Fact]
        public async Task Task3_LegacyTransactionRecord_WithoutReliableTarget_RejectsRecoveryInsteadOfAssumingHkcu()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                // Seed HKCU value that must NEVER be touched by a user-scoped transaction missing TargetUserSid
                registry.SetValue(RegistryHiveType.CurrentUser, @"Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 1, RegistryValueType.DWord);

                // Legacy record (no Scope/RelativeSubKey, TargetUserSid = null)
                var legacyMissingSid = new TransactionDto
                {
                    TransactionId = "tx-legacy-missing-sid",
                    Status = TransactionStatus.Committed,
                    TargetUserSid = null,
                    RollbackPlan = new List<RollbackStepDto>
                    {
                        new()
                        {
                            Sequence = 1,
                            PolicyId = "personalization.sounds",
                            Operation = "DeleteValue",
                            Hive = "Users",
                            SubKey = @"Software\Policies\Microsoft\Windows\Personalization",
                            ValueName = "NoChangingSoundScheme"
                        }
                    }
                };
                await File.WriteAllTextAsync(
                    Path.Combine(testDir, "tx-legacy-missing-sid.json"),
                    JsonSerializer.Serialize(legacyMissingSid));

                // Legacy record with unknown/empty Hive and unknown PolicyId
                var legacyUnknownHive = new TransactionDto
                {
                    TransactionId = "tx-legacy-unknown-hive",
                    Status = TransactionStatus.Committed,
                    RollbackPlan = new List<RollbackStepDto>
                    {
                        new()
                        {
                            Sequence = 1,
                            PolicyId = "unknown.legacy.policy",
                            Operation = "DeleteValue",
                            Hive = "",
                            SubKey = @"SOFTWARE\Policies\Example",
                            ValueName = "ExampleValue"
                        }
                    }
                };
                await File.WriteAllTextAsync(
                    Path.Combine(testDir, "tx-legacy-unknown-hive.json"),
                    JsonSerializer.Serialize(legacyUnknownHive));

                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                var resMissingSid = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-legacy-missing-sid" });
                Assert.False(resMissingSid.Success);
                Assert.Equal(TransactionStatus.Failed, resMissingSid.Status);
                Assert.Contains("HKCU", resMissingSid.Error);
                // HKCU remained untouched!
                Assert.Equal(1, registry.GetValue(RegistryHiveType.CurrentUser, @"Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));

                var resUnknownHive = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-legacy-unknown-hive" });
                Assert.False(resUnknownHive.Success);
                Assert.Equal(TransactionStatus.Failed, resUnknownHive.Status);
                Assert.Contains("Hive de destino inválido", resUnknownHive.Error);

                // Valid legacy record with explicit TargetUserSid and known PolicyId still recovers cleanly
                const string validSid = "S-1-5-21-5555-1002";
                registry.SetValue(RegistryHiveType.Users, $@"{validSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme", 1, RegistryValueType.DWord);
                var legacyValid = new TransactionDto
                {
                    TransactionId = "tx-legacy-valid",
                    Status = TransactionStatus.Committed,
                    TargetUserSid = validSid,
                    RollbackPlan = new List<RollbackStepDto>
                    {
                        new()
                        {
                            Sequence = 1,
                            PolicyId = "personalization.sounds",
                            Operation = "DeleteValue",
                            Hive = "Users",
                            SubKey = $@"{validSid}\Software\Policies\Microsoft\Windows\Personalization",
                            ValueName = "NoChangingSoundScheme"
                        }
                    }
                };
                await File.WriteAllTextAsync(
                    Path.Combine(testDir, "tx-legacy-valid.json"),
                    JsonSerializer.Serialize(legacyValid));

                var resValid = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-legacy-valid" });
                Assert.True(resValid.Success);
                Assert.Equal(TransactionStatus.RolledBack, resValid.Status);
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{validSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // Task 4 — Administrative Protection (No silent fallback to StandardUser)
        // =========================================================================

        [Fact]
        public void Task4_LocalAccountsScanner_AdminGroupQueryFailure_MarksUnknownNeverStandardUser()
        {
            var probe = new FakeLocalAccountsProbe
            {
                IsWindowsPlatform = true,
                LocalizedAdministratorsGroupName = "Administradores",
                AdminGroupSnapshot = new AdminGroupMembersSnapshot(
                    Succeeded: false,
                    MemberSids: Array.Empty<string>(),
                    HasNestedGroupMembers: false,
                    Error: "NetLocalGroupGetMembers failed with Win32 error 5"),
                EnumUsersResult = (true, new[]
                {
                    new EnumeratedLocalUser("Administrador", true, false, "S-1-5-21-100-500"),
                    new EnumeratedLocalUser("AdminSecundario", true, false, "S-1-5-21-100-1001"),
                    new EnumeratedLocalUser("Aluno", true, false, "S-1-5-21-100-1002")
                }, null),
                UserLocalGroupsFactory = _ => new UserLocalGroupsSnapshot(false, Array.Empty<string>(), "Access denied")
            };

            var scanner = new LocalAccountsScanner(probe);
            var accounts = scanner.ScanAccounts();

            var builtInAdmin = accounts.Single(a => a.Name == "Administrador");
            Assert.True(builtInAdmin.IsAdmin);
            Assert.Equal(AccountPrivilegeClassification.Administrator, builtInAdmin.PrivilegeClassification);

            // Secondary admin MUST NOT be classified as StandardUser when admin group lookup fails!
            var secondaryAdmin = accounts.Single(a => a.Name == "AdminSecundario");
            Assert.False(secondaryAdmin.IsAdmin);
            Assert.Equal(AccountPrivilegeClassification.Unknown, secondaryAdmin.PrivilegeClassification);

            // Standard account also cannot be confirmed as StandardUser when admin group lookup failed!
            var student = accounts.Single(a => a.Name == "Aluno");
            Assert.False(student.IsAdmin);
            Assert.Equal(AccountPrivilegeClassification.Unknown, student.PrivilegeClassification);
        }

        [Fact]
        public void Task4_LocalAccountsScanner_NestedAdminGroupWithFailedIndirectLookup_MarksUnknown()
        {
            var probe = new FakeLocalAccountsProbe
            {
                IsWindowsPlatform = true,
                LocalizedAdministratorsGroupName = "Administrators",
                AdminGroupSnapshot = new AdminGroupMembersSnapshot(
                    Succeeded: true,
                    MemberSids: new[] { "S-1-5-21-100-512" }, // Domain Admins group SID, not user SID
                    HasNestedGroupMembers: true),
                EnumUsersResult = (true, new[]
                {
                    new EnumeratedLocalUser("NestedAdmin", true, false, "S-1-5-21-100-1005")
                }, null),
                UserLocalGroupsFactory = _ => new UserLocalGroupsSnapshot(false, Array.Empty<string>(), "NetUserGetLocalGroups failed")
            };

            var scanner = new LocalAccountsScanner(probe);
            var accounts = scanner.ScanAccounts();

            var user = Assert.Single(accounts);
            Assert.Equal(AccountPrivilegeClassification.Unknown, user.PrivilegeClassification);
        }

        [Fact]
        public void Task4_LocalAccountsScanner_HealthyQueries_DifferentiatesAdminStandardAndUnresolvedSid()
        {
            var probe = new FakeLocalAccountsProbe
            {
                IsWindowsPlatform = true,
                LocalizedAdministratorsGroupName = "Administrators",
                AdminGroupSnapshot = new AdminGroupMembersSnapshot(
                    Succeeded: true,
                    MemberSids: new[] { "S-1-5-21-100-1001" },
                    HasNestedGroupMembers: false),
                EnumUsersResult = (true, new[]
                {
                    new EnumeratedLocalUser("AdminLocal", true, false, "S-1-5-21-100-1001"),
                    new EnumeratedLocalUser("Aluno", true, false, "S-1-5-21-100-1002"),
                    new EnumeratedLocalUser("SemSid", true, false, null)
                }, null),
                UserLocalGroupsFactory = _ => new UserLocalGroupsSnapshot(true, new[] { "Users" })
            };

            var scanner = new LocalAccountsScanner(probe);
            var accounts = scanner.ScanAccounts();

            Assert.Equal(AccountPrivilegeClassification.Administrator, accounts.Single(a => a.Name == "AdminLocal").PrivilegeClassification);
            Assert.True(accounts.Single(a => a.Name == "AdminLocal").IsAdmin);

            Assert.Equal(AccountPrivilegeClassification.StandardUser, accounts.Single(a => a.Name == "Aluno").PrivilegeClassification);
            Assert.False(accounts.Single(a => a.Name == "Aluno").IsAdmin);

            Assert.Equal(AccountPrivilegeClassification.Unknown, accounts.Single(a => a.Name == "SemSid").PrivilegeClassification);
            Assert.False(accounts.Single(a => a.Name == "SemSid").IsAdmin);
        }

        [Fact]
        public void Task4_LocalAccountsScanner_NetUserEnumFailureUnelevated_ReturnsUnknownFallback()
        {
            var probe = new FakeLocalAccountsProbe
            {
                IsWindowsPlatform = true,
                IsCurrentProcessElevated = false,
                CurrentUserName = "AdminUnelevated",
                CurrentUserSid = "S-1-5-21-100-1001",
                AdminGroupSnapshot = new AdminGroupMembersSnapshot(false, Array.Empty<string>(), false, "Denied"),
                EnumUsersResult = (false, Array.Empty<EnumeratedLocalUser>(), "NetUserEnum failed")
            };

            var scanner = new LocalAccountsScanner(probe);
            var accounts = scanner.ScanAccounts();

            var fallback = Assert.Single(accounts);
            Assert.Equal(AccountPrivilegeClassification.Unknown, fallback.PrivilegeClassification);
            Assert.False(fallback.IsAdmin);
        }

        [Fact]
        public void Task4_WindowsUserHiveManager_And_NonElevatedReader_DifferentiateAdminStandardAndUnknown()
        {
            Func<string, AccountPrivilegeClassification> probe = sid => sid switch
            {
                "S-1-5-21-100-1001" => AccountPrivilegeClassification.Administrator,
                "S-1-5-21-100-1002" => AccountPrivilegeClassification.StandardUser,
                _ => throw new UnauthorizedAccessException("Group query failed")
            };

            var executorHiveMgr = new WindowsUserHiveManager(probe);
            var readerHiveMgr = new NonElevatedUserHiveReader(probe);

            foreach (IUserHiveManager mgr in new IUserHiveManager[] { executorHiveMgr, readerHiveMgr })
            {
                Assert.Equal(AccountPrivilegeClassification.Administrator, mgr.ClassifyAccountPrivilege("S-1-5-32-544"));
                Assert.Equal(AccountPrivilegeClassification.Administrator, mgr.ClassifyAccountPrivilege("S-1-5-21-100-500"));
                Assert.Equal(AccountPrivilegeClassification.Administrator, mgr.ClassifyAccountPrivilege("S-1-5-21-100-1001"));
                Assert.True(mgr.IsUserAdministrator("S-1-5-21-100-1001"));

                Assert.Equal(AccountPrivilegeClassification.StandardUser, mgr.ClassifyAccountPrivilege("S-1-5-21-100-1002"));
                Assert.False(mgr.IsUserAdministrator("S-1-5-21-100-1002"));

                // When probe fails -> Unknown (NEVER StandardUser!)
                Assert.Equal(AccountPrivilegeClassification.Unknown, mgr.ClassifyAccountPrivilege("S-1-5-21-100-1099"));
                Assert.Equal(AccountPrivilegeClassification.Unknown, mgr.ClassifyAccountPrivilege(null));
            }
        }

        [Fact]
        public async Task Task4_AuthorizationPoints_BlockRestrictiveOperationsWhenClassificationIsUnknown()
        {
            const string unknownSid = "S-1-5-21-5555-1099";
            var unknownAccount = new LocalUserDto
            {
                Name = "ContaIncerta",
                Enabled = true,
                IsAdmin = false,
                PrivilegeClassification = AccountPrivilegeClassification.Unknown,
                ClassificationDetail = "Falha ao consultar grupo Administradores.",
                Sid = unknownSid
            };
            var accounts = new List<LocalUserDto>
            {
                new() { Name = "Administrador", Enabled = true, IsAdmin = true, PrivilegeClassification = AccountPrivilegeClassification.Administrator, Sid = "S-1-5-21-5555-500" },
                unknownAccount
            };

            // 1. SecurityValidator
            var (targetValid, targetErr) = SecurityValidator.ValidateTargetNotAdministrator(unknownSid, accounts);
            Assert.False(targetValid);
            Assert.Contains("desconhecida", targetErr, StringComparison.OrdinalIgnoreCase);

            var (studentValid, _) = SecurityValidator.ValidateStudentNotAdministrator("ContaIncerta", accounts);
            Assert.False(studentValid);

            // 2. PolicyQueryCoordinator
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            hiveManager.SetUnknownPrivilege(unknownSid, true);
            var catalog = new PolicyCatalog(processChecker: _ => false);

            var queryOutcome = PolicyQueryCoordinator.QueryStates(catalog, registry, hiveManager, unknownSid, accounts);
            Assert.False(queryOutcome.Success);
            Assert.Equal("TARGET_PRIVILEGE_UNKNOWN", queryOutcome.ErrorCode);

            // 3. RegistryDWordPolicyHandler.Apply
            var handler = catalog.GetPolicy("personalization.sounds")!;
            var directApply = handler.Apply(unknownSid, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.False(directApply.Success);
            Assert.Equal(PolicyEffectiveState.Failed, directApply.EffectiveState);
            Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{unknownSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));

            // 4. TransactionEngine.ApplyTransactionAsync
            string testDir = CreateTempTransactionDir();
            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var txResult = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-block-unknown-priv",
                    TargetUserName = "ContaIncerta",
                    TargetUserSid = unknownSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.False(txResult.Success);
                Assert.Equal(TransactionStatus.Failed, txResult.Status);
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{unknownSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));

                // 5. ExecutorHost
                var scanner = new FakeScanner(accounts);
                var executorHost = new ExecutorHost(
                    pipeName: "WinLab_Test_Pipe",
                    sessionToken: "0123456789ABCDEF",
                    parentPid: 0,
                    scanner: scanner,
                    catalog: catalog,
                    registry: registry,
                    hiveManager: hiveManager,
                    engine: engine);

                string execRespRaw = await executorHost.ProcessRequestAsync($$"""
                {
                    "id": "tx-exec-unknown",
                    "version": "1.0.0",
                    "type": "command",
                    "action": "policy.apply_transaction",
                    "payload": {
                        "targetUserName": "ContaIncerta",
                        "targetUserSid": "{{unknownSid}}",
                        "policies": [
                            { "policyId": "personalization.sounds", "desiredState": "Blocked" }
                        ]
                    }
                }
                """);
                using (var doc = JsonDocument.Parse(execRespRaw))
                {
                    Assert.False(doc.RootElement.GetProperty("success").GetBoolean());
                    Assert.Equal("TARGET_PRIVILEGE_UNKNOWN", doc.RootElement.GetProperty("errorCode").GetString());
                }

                // 6. RealAgentService
                var realAgent = new RealAgentService(
                    scanner: scanner,
                    executorClient: new RejectingExecutorStub(),
                    catalog: catalog,
                    registry: registry,
                    hiveManager: hiveManager,
                    transactionDirectory: testDir,
                    simulateWindows: true);

                var agentResp = await realAgent.HandleRequestAsync($$"""
                {
                    "id": "tx-agent-unknown",
                    "version": "1.0.0",
                    "type": "command",
                    "action": "policy.apply_transaction",
                    "payload": {
                        "targetUserName": "ContaIncerta",
                        "targetUserSid": "{{unknownSid}}",
                        "policies": [
                            { "policyId": "personalization.sounds", "desiredState": "Blocked" }
                        ]
                    }
                }
                """);
                Assert.False(agentResp.Success);
                Assert.Equal("TARGET_PRIVILEGE_UNKNOWN", agentResp.ErrorCode);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // Test Helpers / Doubles
        // =========================================================================

        private sealed class StubProbeStateHandler : IPolicyHandler
        {
            private readonly PolicyEffectiveState _probeState;
            private readonly bool _isActive;

            public StubProbeStateHandler(string policyId, PolicyEffectiveState probeState, bool isActive)
            {
                PolicyId = policyId;
                _probeState = probeState;
                _isActive = isActive;
            }

            public string PolicyId { get; }
            public string Category => "Personalização";
            public string Title => "Stub";
            public string Description => "Stub";
            public PolicyScope Scope => PolicyScope.User;
            public PolicyRisk Risk => PolicyRisk.Low;
            public bool RequiresRestart => false;
            public bool RequiresLogoff => false;
            public bool RequiresAppRestart => false;
            public bool Reversible => true;
            public string[] TargetProcesses => Array.Empty<string>();

            public PolicyProbeResult Probe(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
                => new()
                {
                    PolicyId = PolicyId,
                    IsActive = _isActive,
                    EffectiveState = _probeState,
                    DetailMessage = $"Simulated {_probeState}"
                };

            public PolicyApplyResult Apply(string? targetUserSid, PolicyDesiredState desiredState, IRegistryService registry, IUserHiveManager hiveManager)
                => new() { PolicyId = PolicyId, Success = true, EffectiveState = _probeState };

            public PolicyRevertResult Revert(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager)
                => new() { PolicyId = PolicyId, Success = true };
        }

        private sealed class CompositePolicyCatalog : IPolicyCatalog
        {
            private readonly IPolicyCatalog _inner;
            private readonly IPolicyHandler _extra;
            public CompositePolicyCatalog(IPolicyCatalog inner, IPolicyHandler extra)
            {
                _inner = inner;
                _extra = extra;
            }
            public IReadOnlyList<IPolicyHandler> GetAllPolicies() => _inner.GetAllPolicies().Append(_extra).ToList();
            public IPolicyHandler? GetPolicy(string policyId)
                => string.Equals(policyId, _extra.PolicyId, StringComparison.OrdinalIgnoreCase) ? _extra : _inner.GetPolicy(policyId);
            public IReadOnlyList<PolicyDefinitionDto> GetCatalogDefinitions() => _inner.GetCatalogDefinitions();
        }

        private sealed class ThrowingSetValueRegistry : IRegistryService
        {
            private readonly InMemoryRegistryService _inner;
            private readonly string _throwOnValueName;
            public ThrowingSetValueRegistry(InMemoryRegistryService inner, string throwOnValueName)
            {
                _inner = inner;
                _throwOnValueName = throwOnValueName;
            }
            public bool KeyExists(RegistryHiveType hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(RegistryHiveType hive, string subKeyPath, string valueName, object? defaultValue = null) => _inner.GetValue(hive, subKeyPath, valueName, defaultValue);
            public RegistryValueType? GetValueKind(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(RegistryHiveType hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord)
            {
                if (string.Equals(valueName, _throwOnValueName, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidOperationException("Simulated unhandled write fault");
                _inner.SetValue(hive, subKeyPath, valueName, value, valueType);
            }
            public void DeleteValue(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.DeleteValue(hive, subKeyPath, valueName);
            public void CreateSubKey(RegistryHiveType hive, string subKeyPath) => _inner.CreateSubKey(hive, subKeyPath);
            public void DeleteSubKeyTree(RegistryHiveType hive, string subKeyPath) => _inner.DeleteSubKeyTree(hive, subKeyPath);
            public string[] GetSubKeyNames(RegistryHiveType hive, string subKeyPath) => _inner.GetSubKeyNames(hive, subKeyPath);
            public string[] GetValueNames(RegistryHiveType hive, string subKeyPath) => _inner.GetValueNames(hive, subKeyPath);
            public IDictionary<string, object?> SnapshotKey(RegistryHiveType hive, string subKeyPath) => _inner.SnapshotKey(hive, subKeyPath);
            public bool KeyExists(string hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(string hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null) => _inner.GetValue(hive, subKeyPath, valueName, defaultValue);
            public RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => SetValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName, value, valueType);
            public void DeleteValue(string hive, string subKeyPath, string valueName) => _inner.DeleteValue(hive, subKeyPath, valueName);
        }

        private sealed class TransientProbeFaultRegistry : IRegistryService
        {
            private readonly InMemoryRegistryService _inner;
            private readonly string _targetValueName;
            private readonly int _failOnCall;
            private int _getCalls;

            public TransientProbeFaultRegistry(InMemoryRegistryService inner, string targetValueName, int failOnGetValueCallNumber)
            {
                _inner = inner;
                _targetValueName = targetValueName;
                _failOnCall = failOnGetValueCallNumber;
            }

            public bool KeyExists(RegistryHiveType hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(RegistryHiveType hive, string subKeyPath, string valueName, object? defaultValue = null)
            {
                if (string.Equals(valueName, _targetValueName, StringComparison.OrdinalIgnoreCase))
                {
                    _getCalls++;
                    if (_getCalls == _failOnCall)
                    {
                        throw new UnauthorizedAccessException("Readback blocked during verification probe");
                    }
                }
                return _inner.GetValue(hive, subKeyPath, valueName, defaultValue);
            }
            public RegistryValueType? GetValueKind(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(RegistryHiveType hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => _inner.SetValue(hive, subKeyPath, valueName, value, valueType);
            public void DeleteValue(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.DeleteValue(hive, subKeyPath, valueName);
            public void CreateSubKey(RegistryHiveType hive, string subKeyPath) => _inner.CreateSubKey(hive, subKeyPath);
            public void DeleteSubKeyTree(RegistryHiveType hive, string subKeyPath) => _inner.DeleteSubKeyTree(hive, subKeyPath);
            public string[] GetSubKeyNames(RegistryHiveType hive, string subKeyPath) => _inner.GetSubKeyNames(hive, subKeyPath);
            public string[] GetValueNames(RegistryHiveType hive, string subKeyPath) => _inner.GetValueNames(hive, subKeyPath);
            public IDictionary<string, object?> SnapshotKey(RegistryHiveType hive, string subKeyPath) => _inner.SnapshotKey(hive, subKeyPath);
            public bool KeyExists(string hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(string hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null) => GetValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName, defaultValue);
            public RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => _inner.SetValue(hive, subKeyPath, valueName, value, valueType);
            public void DeleteValue(string hive, string subKeyPath, string valueName) => _inner.DeleteValue(hive, subKeyPath, valueName);
        }

        private sealed class SilentNoOpDeleteRegistry : IRegistryService
        {
            private readonly InMemoryRegistryService _inner;
            private readonly string _noOpDeleteValueName;

            public SilentNoOpDeleteRegistry(InMemoryRegistryService inner, string noOpDeleteValueName)
            {
                _inner = inner;
                _noOpDeleteValueName = noOpDeleteValueName;
            }

            public bool KeyExists(RegistryHiveType hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(RegistryHiveType hive, string subKeyPath, string valueName, object? defaultValue = null) => _inner.GetValue(hive, subKeyPath, valueName, defaultValue);
            public RegistryValueType? GetValueKind(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(RegistryHiveType hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => _inner.SetValue(hive, subKeyPath, valueName, value, valueType);
            public void DeleteValue(RegistryHiveType hive, string subKeyPath, string valueName)
            {
                if (string.Equals(valueName, _noOpDeleteValueName, StringComparison.OrdinalIgnoreCase))
                {
                    return; // Simulate silent deletion failure
                }
                _inner.DeleteValue(hive, subKeyPath, valueName);
            }
            public void CreateSubKey(RegistryHiveType hive, string subKeyPath) => _inner.CreateSubKey(hive, subKeyPath);
            public void DeleteSubKeyTree(RegistryHiveType hive, string subKeyPath) => _inner.DeleteSubKeyTree(hive, subKeyPath);
            public string[] GetSubKeyNames(RegistryHiveType hive, string subKeyPath) => _inner.GetSubKeyNames(hive, subKeyPath);
            public string[] GetValueNames(RegistryHiveType hive, string subKeyPath) => _inner.GetValueNames(hive, subKeyPath);
            public IDictionary<string, object?> SnapshotKey(RegistryHiveType hive, string subKeyPath) => _inner.SnapshotKey(hive, subKeyPath);
            public bool KeyExists(string hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(string hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null) => _inner.GetValue(hive, subKeyPath, valueName, defaultValue);
            public RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => _inner.SetValue(hive, subKeyPath, valueName, value, valueType);
            public void DeleteValue(string hive, string subKeyPath, string valueName) => DeleteValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName);
        }

        private sealed class CorruptingRestoreRegistry : IRegistryService
        {
            private readonly InMemoryRegistryService _inner;
            private readonly string _targetValueName;
            private readonly RegistryValueType _corruptKind;
            private readonly object _corruptValue;
            public bool EnableCorruption { get; set; }

            public CorruptingRestoreRegistry(InMemoryRegistryService inner, string targetValueName, RegistryValueType corruptKind, object corruptValue)
            {
                _inner = inner;
                _targetValueName = targetValueName;
                _corruptKind = corruptKind;
                _corruptValue = corruptValue;
            }

            public bool KeyExists(RegistryHiveType hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(RegistryHiveType hive, string subKeyPath, string valueName, object? defaultValue = null) => _inner.GetValue(hive, subKeyPath, valueName, defaultValue);
            public RegistryValueType? GetValueKind(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(RegistryHiveType hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord)
            {
                if (EnableCorruption && string.Equals(valueName, _targetValueName, StringComparison.OrdinalIgnoreCase))
                {
                    _inner.SetValue(hive, subKeyPath, valueName, _corruptValue, _corruptKind);
                    return;
                }
                _inner.SetValue(hive, subKeyPath, valueName, value, valueType);
            }
            public void DeleteValue(RegistryHiveType hive, string subKeyPath, string valueName) => _inner.DeleteValue(hive, subKeyPath, valueName);
            public void CreateSubKey(RegistryHiveType hive, string subKeyPath) => _inner.CreateSubKey(hive, subKeyPath);
            public void DeleteSubKeyTree(RegistryHiveType hive, string subKeyPath) => _inner.DeleteSubKeyTree(hive, subKeyPath);
            public string[] GetSubKeyNames(RegistryHiveType hive, string subKeyPath) => _inner.GetSubKeyNames(hive, subKeyPath);
            public string[] GetValueNames(RegistryHiveType hive, string subKeyPath) => _inner.GetValueNames(hive, subKeyPath);
            public IDictionary<string, object?> SnapshotKey(RegistryHiveType hive, string subKeyPath) => _inner.SnapshotKey(hive, subKeyPath);
            public bool KeyExists(string hive, string subKeyPath) => _inner.KeyExists(hive, subKeyPath);
            public bool ValueExists(string hive, string subKeyPath, string valueName) => _inner.ValueExists(hive, subKeyPath, valueName);
            public object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null) => _inner.GetValue(hive, subKeyPath, valueName, defaultValue);
            public RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName) => _inner.GetValueKind(hive, subKeyPath, valueName);
            public void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => SetValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName, value, valueType);
            public void DeleteValue(string hive, string subKeyPath, string valueName) => _inner.DeleteValue(hive, subKeyPath, valueName);
        }

        private sealed class FakeLocalAccountsProbe : ILocalAccountsProbe
        {
            public bool IsWindowsPlatform { get; set; } = true;
            public bool IsCurrentProcessElevated { get; set; }
            public string CurrentUserName { get; set; } = "Tester";
            public string? CurrentUserSid { get; set; } = "S-1-5-21-100-1000";
            public string? LocalizedAdministratorsGroupName { get; set; } = "Administrators";
            public AdminGroupMembersSnapshot AdminGroupSnapshot { get; set; } = new(true, Array.Empty<string>(), false);
            public (bool Succeeded, IReadOnlyList<EnumeratedLocalUser> Users, string? Error) EnumUsersResult { get; set; } = (true, Array.Empty<EnumeratedLocalUser>(), null);
            public Func<string, UserLocalGroupsSnapshot> UserLocalGroupsFactory { get; set; } = _ => new(true, Array.Empty<string>());

            public AdminGroupMembersSnapshot QueryAdminGroupMembers() => AdminGroupSnapshot;
            public (bool Succeeded, IReadOnlyList<EnumeratedLocalUser> Users, string? Error) EnumerateNormalUsers() => EnumUsersResult;
            public UserLocalGroupsSnapshot QueryUserLocalGroups(string userName) => UserLocalGroupsFactory(userName);
        }

        private sealed class FakeScanner : IWindowsScanner
        {
            private readonly List<LocalUserDto> _users;
            public FakeScanner(List<LocalUserDto> users) => _users = users;
            public Task<MachineInventoryDto> ScanInventoryAsync(CancellationToken cancellationToken = default)
                => Task.FromResult(new MachineInventoryDto { ComputerName = "LAB-TEST", LocalUsers = _users, IsMock = false });
        }

        private sealed class RejectingExecutorStub : IAgentService
        {
            public bool IsRunning => false;
            public string ExecutionMode => "Stub";
            public Task<IpcResponse<object>> HandleRequestAsync(string rawJson)
                => throw new InvalidOperationException("Elevated executor should not have been invoked.");
        }
    }
}
