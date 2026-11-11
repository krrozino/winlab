using System;
using System.Collections.Generic;
using System.IO;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;
using Xunit;

namespace WinLab.Tests
{
    public class TransactionEngineTests
    {
        private static string CreateTempTransactionDir()
        {
            string dir = Path.Combine(Path.GetTempPath(), "WinLab_Test_Tx_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            return dir;
        }

        [Fact]
        public async Task Transaction_HappyPath_CompletesAsCommitted()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-12345-1002";

                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-happy-1",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.mouse_pointers", DesiredState = "Blocked" },
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "Blocked" },
                        new() { PolicyId = "browser.chrome.guest", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.True(result.Success);
                Assert.Equal(TransactionStatus.Committed, result.Status);
                Assert.Equal(5, result.AppliedCount);
                Assert.Equal(0, result.RolledBackCount);
                Assert.Null(result.FailedPolicyId);

                // Verify live registry values
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));
                Assert.Equal(0, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "BrowserGuestModeEnabled"));
                Assert.Equal(0, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "BrowserGuestModeEnabled"));

                // Verify file persisted
                var txRecord = await engine.GetTransactionAsync("tx-happy-1");
                Assert.NotNull(txRecord);
                Assert.Equal(TransactionStatus.Committed, txRecord.Status);
                Assert.Equal(5, txRecord.Actions.Count);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Apply_FailureMidway_TriggersAutomatedRollback()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-12345-1002";

                // Seed pre-existing value for Policy 1 to ensure it gets restored (not deleted)
                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper", 99, RegistryValueType.DWord);

                // Inject write fault on Policy 3: "NoChangingMousePointers"
                registry.SetWriteFault("NoChangingMousePointers", new UnauthorizedAccessException("Simulated write access denied"));

                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-midway-failure",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.mouse_pointers", DesiredState = "Blocked" }, // FAILS HERE
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "Blocked" },
                        new() { PolicyId = "browser.chrome.guest", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal("personalization.mouse_pointers", result.FailedPolicyId);
                Assert.Contains("Simulated write access denied", result.FailureReason);
                Assert.Equal(2, result.AppliedCount);
                Assert.Equal(2, result.RolledBackCount);

                // Zero unverified forward progress: policies 4 and 5 were NEVER applied
                Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "BrowserGuestModeEnabled"));

                // Automated rollback: Policy 2 (Sounds) was absent prior, so it was DELETED (not set to 0!)
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));

                // Automated rollback: Policy 1 (Wallpaper) had pre-existing value 99, so it was RESTORED to 99
                Assert.Equal(99, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));

                // Verify final transaction state in persistence
                var txRecord = await engine.GetTransactionAsync("tx-midway-failure");
                Assert.NotNull(txRecord);
                Assert.Equal(TransactionStatus.RolledBack, txRecord.Status);
                Assert.Equal("personalization.mouse_pointers", txRecord.FailedPolicyId);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task VerificationProbe_Mismatch_TriggersAutomatedRollback()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-12345-1002";

                // Inject probe fault on sounds scheme probe: causes probe to throw/fail
                registry.SetProbeFault("NoChangingSoundScheme", new InvalidOperationException("Simulated probe read failure"));

                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-probe-failure",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }, // PROBE FAILS HERE
                        new() { PolicyId = "personalization.mouse_pointers", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal("personalization.sounds", result.FailedPolicyId);

                // Policy 1 (Wallpaper) was rolled back cleanly
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Rollback_ExecutedTwice_IsIdempotent()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-12345-1002";

                // 1. Commit transaction
                var applyResult = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-idempotent-1",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyResult.Success);

                // 2. First Rollback
                var rollback1 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-idempotent-1"
                });
                Assert.True(rollback1.Success);
                Assert.Equal(TransactionStatus.RolledBack, rollback1.Status);

                // 3. Second Rollback (Idempotent)
                var rollback2 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-idempotent-1"
                });
                Assert.True(rollback2.Success);
                Assert.Equal(TransactionStatus.RolledBack, rollback2.Status);
                Assert.Contains("já havia sido revertida", rollback2.Message);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task AdministratorImmunity_RejectsTransactionTargetingAdmin()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string adminSid = "S-1-5-32-544"; // Builtin Administrators

                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-admin-reject",
                    TargetUserName = "Administrador",
                    TargetUserSid = adminSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Contains("imunidade", result.Message);

                // Invariant: zero registry writes
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{adminSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task Transaction_PersistsToDisk_AndReloadsCleanly()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string txId = "tx-persist-check-42";

                await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = txId,
                    TargetUserName = "Aluno",
                    TargetUserSid = "S-1-5-21-1002",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });

                string expectedFile = Path.Combine(testDir, $"{txId}.json");
                Assert.True(File.Exists(expectedFile));

                var list = await engine.ListTransactionsAsync();
                Assert.Single(list);
                Assert.Equal(txId, list[0].TransactionId);
                Assert.Equal(TransactionStatus.Committed, list[0].Status);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task AdministratorImmunity_RID500_Blocked()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string rid500Sid = "S-1-5-21-987654321-123456789-500"; // Built-in Administrator RID 500

                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-rid500-reject",
                    TargetUserName = "Administrator",
                    TargetUserSid = rid500Sid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Contains("imunidade", result.Message);
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{rid500Sid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task DualBrowser_PreExistingValues_RestoredProperlyOnRollback()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                // Set pre-existing values (Chrome = 2, Edge = 2)
                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability", 2, RegistryValueType.DWord);
                registry.SetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability", 2, RegistryValueType.DWord);

                // Apply Blocked (enforces 1)
                var txId = "tx-browser-restore-test";
                var applyResult = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = txId,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyResult.Success);
                Assert.Equal(1, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));

                // Rollback -> Restores to 2
                var rollbackResult = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = txId });
                Assert.True(rollbackResult.Success);
                Assert.Equal(2, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                Assert.Equal(2, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task UnknownPolicyId_FailsTransactionImmediately()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-unknown-policy",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "invalid.policy.id", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);
                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal("invalid.policy.id", result.FailedPolicyId);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }
    }
}
