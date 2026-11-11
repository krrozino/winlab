using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;
using Xunit;

namespace WinLab.Tests
{
    public class AdversarialTransactionEngineTests
    {
        private static string CreateTempTransactionDir()
        {
            string dir = Path.Combine(Path.GetTempPath(), "WinLab_AdvTest_Tx_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(dir);
            return dir;
        }

        // =========================================================================
        // 1. Step-by-Step Failure Injection (Steps 1, 2, 3, 4, 5 of 5-Policy Batch)
        // =========================================================================

        [Theory]
        [InlineData(1, "personalization.wallpaper", "NoChangingWallPaper")]
        [InlineData(2, "personalization.sounds", "NoChangingSoundScheme")]
        [InlineData(3, "personalization.mouse_pointers", "NoChangingMousePointers")]
        [InlineData(4, "browser.chrome.incognito", "IncognitoModeAvailability")]
        [InlineData(5, "browser.chrome.guest", "BrowserGuestModeEnabled")]
        public async Task MultiPolicyBatch_FailureAtStepN_HaltsImmediatelyAndRollsBackInReverse(
            int failingStep,
            string failingPolicyId,
            string failingRegistryValue)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-999-1002";

                // Seed pre-existing value for wallpaper and edge guest mode to test restoration vs deletion
                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper", 88, RegistryValueType.DWord);

                // Inject write fault at the chosen step
                registry.SetWriteFault(failingRegistryValue, new InvalidOperationException($"Fault injected at step {failingStep}: {failingPolicyId}"));

                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-fail-step-{failingStep}",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },       // Step 1
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" },          // Step 2
                        new() { PolicyId = "personalization.mouse_pointers", DesiredState = "Blocked" },    // Step 3
                        new() { PolicyId = "browser.chrome.incognito", DesiredState = "Blocked" },        // Step 4
                        new() { PolicyId = "browser.chrome.guest", DesiredState = "Blocked" }             // Step 5
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal(failingPolicyId, result.FailedPolicyId);

                // Expected number of applied items before failure is (failingStep - 1)
                int expectedPriorApplied = failingStep - 1;
                Assert.Equal(expectedPriorApplied, result.AppliedCount);

                // All prior applied items must have been rolled back
                // For browser policies (dual Chrome + Edge), rolledBackCount counts each registry step
                Assert.True(result.RolledBackCount >= expectedPriorApplied);

                // Verification of Zero Unverified Forward Progress:
                // Subsequent policies after failingStep MUST NOT have been applied
                if (failingStep < 5)
                {
                    Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "BrowserGuestModeEnabled"));
                }
                if (failingStep < 4)
                {
                    Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"));
                }
                if (failingStep < 3)
                {
                    Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"));
                }
                if (failingStep < 2)
                {
                    Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
                }

                // Verification of Pre-existing Restoration vs Absent Deletion
                if (failingStep > 1)
                {
                    // Step 1 was applied (changed from 88 to 1) then rolled back -> must be restored to 88
                    Assert.Equal(88, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));
                }
                else
                {
                    // Step 1 failed immediately -> original value 88 must be intact
                    Assert.Equal(88, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));
                }
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 2. Pre-existing Values vs Absent Values: Absolute Deletion vs Restoration
        // =========================================================================

        [Fact]
        public async Task Rollback_AbsentValuesDeleted_PreExistingValuesRestored_NoZeroDefaulting()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-999-1002";

                // Policy 1 (Wallpaper) was absent from registry originally
                // Policy 2 (Sounds) was absent from registry originally
                // Policy 3 (Mouse Pointers) HAD pre-existing value 5
                registry.SetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers", 5, RegistryValueType.DWord);

                string txId = "tx-preexisting-test";
                var applyResult = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = txId,
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.mouse_pointers", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyResult.Success);

                // All 3 now have value 1
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"));
                Assert.Equal(1, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"));

                // Rollback transaction
                var rollbackResult = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = txId });
                Assert.True(rollbackResult.Success);

                // CRITICAL SECURITY INVARIANT:
                // Absent values MUST BE COMPLETELY DELETED (ValueExists = false), NOT SET TO 0!
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
                    "VULNERABILITY DETECTED: Absent value was defaulted or retained instead of being deleted!");
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"),
                    "VULNERABILITY DETECTED: Absent value was defaulted or retained instead of being deleted!");

                // Pre-existing value MUST BE RESTORED to exactly 5 (not deleted and not set to 0)
                Assert.True(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"));
                Assert.Equal(5, registry.GetValue(RegistryHiveType.Users, $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 3. Probe Failure Detection: Unexpected Data Triggers Automated Rollback
        // =========================================================================

        [Fact]
        public async Task ProbeFailure_SimulatedUnexpectedProbeValue_TriggersAutomatedRollback()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-999-1002";

                // Policy 1 (Wallpaper): applies successfully
                // Policy 2 (Sounds): probe throws an exception
                registry.SetProbeFault("NoChangingSoundScheme", new TimeoutException("Probe verification timed out"));

                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-probe-exception",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.RolledBack, result.Status);
                Assert.Equal("personalization.sounds", result.FailedPolicyId);
                Assert.Contains("Divergência na verificação imediata", result.FailureReason);

                // Policy 1 should be rolled back cleanly
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{studentSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 4. Idempotency of Rollback: Executing Rollback 3 Times In A Row
        // =========================================================================

        [Fact]
        public async Task Rollback_ExecutedMultipleTimes_DoesNotCorruptStateOrThrow()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                string studentSid = "S-1-5-21-999-1002";

                var applyResult = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-multi-rollback",
                    TargetUserName = "Aluno",
                    TargetUserSid = studentSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyResult.Success);

                // Rollback 1
                var r1 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-multi-rollback" });
                Assert.True(r1.Success);
                Assert.Equal(TransactionStatus.RolledBack, r1.Status);

                // Rollback 2
                var r2 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-multi-rollback" });
                Assert.True(r2.Success);
                Assert.Equal(TransactionStatus.RolledBack, r2.Status);

                // Rollback 3
                var r3 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-multi-rollback" });
                Assert.True(r3.Success);
                Assert.Equal(TransactionStatus.RolledBack, r3.Status);

                // Non-existent transaction rollback
                var r4 = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-does-not-exist" });
                Assert.False(r4.Success);
                Assert.Equal(TransactionStatus.Failed, r4.Status);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 5. Administrator Immunity Bypass Attempts: Whitespace, Casing, RID 500, etc.
        // =========================================================================

        [Theory]
        [InlineData("S-1-5-32-544")]                 // Well-known Builtin Administrators SID
        [InlineData("s-1-5-32-544")]                 // Lowercase SID
        [InlineData("  S-1-5-32-544  ")]             // Whitespace padded SID
        [InlineData("S-1-5-32-544\r\n")]             // Newline padded SID
        [InlineData("\tS-1-5-32-544\t")]             // Tab padded SID
        [InlineData("S-1-5-21-123456789-123-500")]   // Administrator RID 500
        [InlineData("s-1-5-21-123456789-123-500")]   // Lowercase RID 500
        [InlineData("  S-1-5-21-123456789-123-500  ")] // Whitespace padded RID 500
        [InlineData("S-1-5-21-123456789-123-500\n")] // Trailing newline RID 500
        public async Task AdministratorImmunity_AllSidVariations_MustRejectWithZeroMutations(string adminSid)
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
                    TransactionId = $"tx-admin-bypass-{Guid.NewGuid():N}",
                    TargetUserName = "Administrator",
                    TargetUserSid = adminSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                // INVARIANT: The transaction MUST be rejected due to Administrator Immunity
                Assert.False(result.Success, $"SECURITY BYPASS DETECTED! Transaction succeeded for admin SID '{adminSid}'!");
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Contains("imunidade", result.Message, StringComparison.OrdinalIgnoreCase);

                // INVARIANT: Zero mutations must have occurred anywhere
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{adminSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
                    $"MUTATION DETECTED on admin key '{adminSid}'!");
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{adminSid.Trim()}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
                    $"MUTATION DETECTED on trimmed admin key '{adminSid.Trim()}'!");
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Theory]
        [InlineData("Administrator", null)]
        [InlineData("Administrador", "")]
        [InlineData("  Administrator  ", "   ")]
        [InlineData("administrator", "")]
        [InlineData("administrador", null)]
        public async Task AdministratorImmunity_AdminUserNameWithEmptyOrNullSid_MustRejectWithZeroMutations(
            string adminUserName,
            string? emptyOrNullSid)
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
                    TransactionId = $"tx-admin-name-bypass-{Guid.NewGuid():N}",
                    TargetUserName = adminUserName,
                    TargetUserSid = emptyOrNullSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                // If targetUserName is Administrator/Administrador, it MUST be rejected to protect the active admin user!
                Assert.False(result.Success, $"SECURITY BYPASS DETECTED! Transaction succeeded for targetUserName '{adminUserName}'!");
                Assert.Equal(TransactionStatus.Failed, result.Status);

                // Zero mutations on CurrentUser
                Assert.False(registry.ValueExists(RegistryHiveType.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
                    "MUTATION DETECTED on CurrentUser (Admin) hive!");
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 6. Path Traversal in TransactionId
        // =========================================================================

        [Fact]
        public async Task TransactionId_PathTraversal_MustBeSanitizedOrRejected()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string exclusiveRoot = Path.Combine(Path.GetTempPath(), "WinLab_AdvTest_Trav_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(exclusiveRoot);
            string testDir = Path.Combine(exclusiveRoot, "transactions");
            Directory.CreateDirectory(testDir);
            string escapeTarget = Path.Combine(exclusiveRoot, "traversal_escape.json");

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "../traversal_escape",
                    TargetUserName = "Aluno",
                    TargetUserSid = "S-1-5-21-999-1002",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                };

                await engine.ApplyTransactionAsync(request);

                Assert.False(File.Exists(escapeTarget), "SECURITY VULNERABILITY: Path traversal in TransactionId escaped transaction directory!");
            }
            finally
            {
                if (Directory.Exists(exclusiveRoot)) Directory.Delete(exclusiveRoot, true);
            }
        }

        // =========================================================================
        // 7. Null or Empty Policies Collection (Controlled Failure, No NRE)
        // =========================================================================

        [Fact]
        public async Task ApplyTransaction_NullPolicies_MustFailGracefullyWithoutException()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-null-policies-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = null!
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.False(string.IsNullOrWhiteSpace(result.Message));
                AssertZeroMutations(registry, userSid);
                AssertNoTransactionFiles(testDir);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_EmptyPolicies_MustFailGracefullyWithoutCommit()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-empty-policies-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>()
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal(0, result.AppliedCount);
                AssertZeroMutations(registry, userSid);
                AssertNoTransactionFiles(testDir);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 8. TransactionId Sanitization Hardening (OS-independent)
        // =========================================================================

        [Theory]
        [InlineData("../traversal_escape")]
        [InlineData("..\\..\\traversal_escape")]
        [InlineData("sub/dir/escape")]
        [InlineData("sub\\dir\\escape")]
        [InlineData("./nested/../escape")]
        [InlineData("tx\nwith\nnewlines")]
        [InlineData("tx\twith\ttabs")]
        [InlineData("..")]
        [InlineData(".")]
        [InlineData("   ")]
        [InlineData("")]
        public void SanitizeTransactionId_AdversarialInputs_MustNeverEscapeTransactionDirectory(string rawId)
        {
            string sanitized = TransactionEngine.SanitizeTransactionId(rawId);

            Assert.False(string.IsNullOrWhiteSpace(sanitized));
            Assert.DoesNotContain('/', sanitized);
            Assert.DoesNotContain('\\', sanitized);
            Assert.Equal(Path.GetFileName(sanitized), sanitized);
        }

        [Fact]
        public async Task ApplyTransaction_AdversarialTransactionId_PersistsOnlyInsideAuthorizedDirectory()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string exclusiveRoot = Path.Combine(Path.GetTempPath(), "WinLab_AdvTest_Root_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(exclusiveRoot);
            string testDir = Path.Combine(exclusiveRoot, "transactions");
            Directory.CreateDirectory(testDir);
            var rootFilesBefore = Directory.GetFiles(exclusiveRoot, "*", SearchOption.AllDirectories)
                .Select(f => Path.GetFullPath(f))
                .ToHashSet(StringComparer.Ordinal);

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = "..\\..\\nested_escape",
                    TargetUserName = "Aluno",
                    TargetUserSid = "S-1-5-21-999-1002",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.True(result.Success);

                var filesInside = Directory.GetFiles(testDir, "*.json", SearchOption.AllDirectories)
                    .Select(f => Path.GetFullPath(f))
                    .ToList();
                Assert.Single(filesInside);
                Assert.All(filesInside, f => Assert.StartsWith(Path.GetFullPath(testDir), f, StringComparison.Ordinal));

                var rootFilesAfter = Directory.GetFiles(exclusiveRoot, "*", SearchOption.AllDirectories)
                    .Select(f => Path.GetFullPath(f))
                    .ToHashSet(StringComparer.Ordinal);
                rootFilesAfter.ExceptWith(rootFilesBefore);
                Assert.All(rootFilesAfter, f => Assert.StartsWith(Path.GetFullPath(testDir), f, StringComparison.Ordinal));
            }
            finally
            {
                if (Directory.Exists(exclusiveRoot)) Directory.Delete(exclusiveRoot, true);
            }
        }

        // =========================================================================
        // 9. Strict DesiredState Validation (fail-closed, no silent Blocked fallback)
        // =========================================================================

        private static void AssertZeroMutations(InMemoryRegistryService registry, string userSid)
        {
            // Paths taken from the real catalog (PolicyCatalog.RegisterDefaults):
            // personalization.wallpaper  -> HKU\<sid>\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop!NoChangingWallPaper
            // personalization.sounds     -> HKU\<sid>\Software\Policies\Microsoft\Windows\Personalization!NoChangingSoundScheme
            // personalization.mouse_pointers -> HKU\<sid>\Software\Policies\Microsoft\Windows\Personalization!NoChangingMousePointers
            // browser.chrome.incognito   -> HKLM\SOFTWARE\Policies\Google\Chrome!IncognitoModeAvailability + HKLM\SOFTWARE\Policies\Microsoft\Edge!InPrivateModeAvailability
            Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
                "MUTATION DETECTED on user hive (wallpaper)!");
            Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"),
                "MUTATION DETECTED on user hive (sounds)!");
            Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingMousePointers"),
                "MUTATION DETECTED on user hive (mouse pointers)!");
            Assert.False(registry.ValueExists(RegistryHiveType.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
                "MUTATION DETECTED on CurrentUser hive!");
            Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "IncognitoModeAvailability"),
                "MUTATION DETECTED on LocalMachine hive (Chrome incognito)!");
            Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability"),
                "MUTATION DETECTED on LocalMachine hive (Edge InPrivate)!");
        }

        private static async Task AssertNoCommittedTransaction(TransactionEngine engine)
        {
            var txs = await engine.ListTransactionsAsync();
            Assert.DoesNotContain(txs, t => t.Status == TransactionStatus.Committed);
        }

        private static void AssertNoTransactionFiles(string testDir)
        {
            if (Directory.Exists(testDir))
            {
                Assert.Empty(Directory.GetFiles(testDir, "*.json"));
            }
        }

        [Theory]
        [InlineData("Restrict")]
        [InlineData("Enforce")]
        [InlineData("Applied")]
        [InlineData("Drifted")]
        [InlineData("PendingLogoff")]
        [InlineData("Reverted")]
        [InlineData("1")]
        [InlineData("2")]
        [InlineData("99")]
        [InlineData("BLOCKED!")]
        [InlineData("blocked ")]
        public async Task ApplyTransaction_InvalidDesiredState_MustFailWithZeroMutations(string invalidDesiredState)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-invalid-desired-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = invalidDesiredState }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal("personalization.wallpaper", result.FailedPolicyId);
                Assert.Equal(0, result.AppliedCount);
                Assert.False(string.IsNullOrWhiteSpace(result.Message));
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public async Task ApplyTransaction_NullOrWhitespaceDesiredState_MustFailWithoutMutations(string? invalidDesiredState)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-null-desired-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = invalidDesiredState! }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_AllowedDesiredState_MustFailClosedPendingContractDecision()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-allowed-desired-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Allowed" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "allowed" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Contains("CONTRACT DECISION REQUIRED", result.Message, StringComparison.OrdinalIgnoreCase);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_MixedValidThenInvalid_MustNotApplyPartially()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-mixed-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" },
                        new() { PolicyId = "personalization.sounds", DesiredState = "Restrict" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal("personalization.sounds", result.FailedPolicyId);
                Assert.Equal(0, result.AppliedCount);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_NullPolicyItem_MustFailGracefullyWithoutException()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-null-item-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto> { null! }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.False(string.IsNullOrWhiteSpace(result.Message));
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        public async Task ApplyTransaction_EmptyOrWhitespacePolicyId_MustFailGracefully(string invalidPolicyId)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-empty-policyid-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = invalidPolicyId, DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 10. Round 3: JSON deserialization, composed enums, TransactionId collision
        // =========================================================================

        [Theory]
        [InlineData("omitted", """{"transactionId":"tx-json-desired-omitted","targetUserName":"Aluno","targetUserSid":"S-1-5-21-999-1002","policies":[{"policyId":"personalization.wallpaper"}]}""")]
        [InlineData("null", """{"transactionId":"tx-json-desired-null","targetUserName":"Aluno","targetUserSid":"S-1-5-21-999-1002","policies":[{"policyId":"personalization.wallpaper","desiredState":null}]}""")]
        [InlineData("empty", """{"transactionId":"tx-json-desired-empty","targetUserName":"Aluno","targetUserSid":"S-1-5-21-999-1002","policies":[{"policyId":"personalization.wallpaper","desiredState":""}]}""")]
        public async Task ApplyTransaction_JsonDeserialization_MissingDesiredState_MustReject(string variant, string json)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                var request = JsonSerializer.Deserialize<ApplyTransactionRequestDto>(json);
                Assert.NotNull(request);
                Assert.True(string.IsNullOrWhiteSpace(request!.Policies[0].DesiredState),
                    $"Variante '{variant}': o DTO não deve produzir um DesiredState executável a partir de JSON incompleto.");

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal("personalization.wallpaper", result.FailedPolicyId);
                Assert.Equal(0, result.AppliedCount);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
                Assert.Single(Directory.GetFiles(testDir, "*.json"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_JsonDeserialization_MixedValidThenMissingDesiredState_MustNotApplyPartially()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";
            const string json = """{"transactionId":"tx-json-mixed-desired","targetUserName":"Aluno","targetUserSid":"S-1-5-21-999-1002","policies":[{"policyId":"personalization.wallpaper","desiredState":"Blocked"},{"policyId":"personalization.sounds"}]}""";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                var request = JsonSerializer.Deserialize<ApplyTransactionRequestDto>(json);
                Assert.NotNull(request);

                var result = await engine.ApplyTransactionAsync(request!);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal("personalization.sounds", result.FailedPolicyId);
                Assert.Equal(0, result.AppliedCount);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
                Assert.Single(Directory.GetFiles(testDir, "*.json"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Theory]
        [InlineData("Blocked,NotConfigured")]
        [InlineData("NotConfigured,Blocked")]
        [InlineData("Blocked,Blocked")]
        public async Task ApplyTransaction_ComposedDesiredStateNames_MustFailWithZeroMutations(string composedDesiredState)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-composed-desired-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = composedDesiredState }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal("personalization.wallpaper", result.FailedPolicyId);
                Assert.Equal(0, result.AppliedCount);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
                Assert.Single(Directory.GetFiles(testDir, "*.json"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_PaddedPolicyId_MustFailWithoutMutations()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-padded-policyid-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = " personalization.wallpaper", DesiredState = "Blocked" }
                    }
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal(" personalization.wallpaper", result.FailedPolicyId);
                Assert.Equal(0, result.AppliedCount);
                AssertZeroMutations(registry, userSid);
                await AssertNoCommittedTransaction(engine);
                Assert.Single(Directory.GetFiles(testDir, "*.json"));
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_TransactionIdCollision_MustRejectAndPreserveOriginalRecord()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";
            const string txId = "tx-collision-guard-test";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                var original = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = txId,
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                });
                Assert.True(original.Success);

                var persisted = await engine.GetTransactionAsync(txId);
                Assert.NotNull(persisted);
                Assert.NotEmpty(persisted!.Baseline.Entries);
                Assert.NotEmpty(persisted.RollbackPlan);

                string recordPath = Path.Combine(testDir, $"{txId}.json");
                Assert.True(File.Exists(recordPath));
                byte[] recordBefore = File.ReadAllBytes(recordPath);

                var collision = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = txId,
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.False(collision.Success);
                Assert.Equal(TransactionStatus.Failed, collision.Status);
                Assert.Contains("já pertence", collision.Message, StringComparison.Ordinal);

                byte[] recordAfter = File.ReadAllBytes(recordPath);
                Assert.Equal(recordBefore, recordAfter);

                var persistedAfterCollision = await engine.GetTransactionAsync(txId);
                Assert.NotNull(persistedAfterCollision);
                Assert.NotEmpty(persistedAfterCollision!.Baseline.Entries);
                Assert.NotEmpty(persistedAfterCollision.RollbackPlan);

                var rollback = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = txId });
                Assert.True(rollback.Success);
                Assert.False(registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"),
                    "Rollback da transação original deve permanecer funcional após tentativa de colisão.");
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        [Fact]
        public async Task ApplyTransaction_SanitizationCollision_MustReject()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: p => false);
            string testDir = CreateTempTransactionDir();
            const string userSid = "S-1-5-21-999-1002";

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);

                var first = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "sub/dir/escape",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                });
                Assert.True(first.Success);
                Assert.Equal("sub_dir_escape", first.TransactionId);

                var second = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "sub_dir_escape",
                    TargetUserName = "Aluno",
                    TargetUserSid = userSid,
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                    }
                });
                Assert.False(second.Success);
                Assert.Equal(TransactionStatus.Failed, second.Status);
                Assert.Contains("já pertence", second.Message, StringComparison.Ordinal);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 11. Cross-Instance TransactionId Reservation (atomic FileMode.CreateNew)
        // =========================================================================

        [Fact]
        public async Task ApplyTransaction_ConcurrentEngines_SameTransactionId_ExactlyOneWins()
        {
            const string userSid = "S-1-5-21-999-1002";

            for (int attempt = 0; attempt < 5; attempt++)
            {
                var registry = new InMemoryRegistryService();
                var hiveManager = new MockUserHiveManager();
                var catalog = new PolicyCatalog(processChecker: p => false);
                string testDir = CreateTempTransactionDir();

                try
                {
                    var engineA = new TransactionEngine(catalog, registry, hiveManager, testDir);
                    var engineB = new TransactionEngine(catalog, registry, hiveManager, testDir);

                    var results = await Task.WhenAll(
                        engineA.ApplyTransactionAsync(new ApplyTransactionRequestDto
                        {
                            TransactionId = "tx-race",
                            TargetUserName = "Aluno",
                            TargetUserSid = userSid,
                            Policies = new List<PolicyApplyItemDto>
                            {
                                new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                            }
                        }),
                        engineB.ApplyTransactionAsync(new ApplyTransactionRequestDto
                        {
                            TransactionId = "tx-race",
                            TargetUserName = "Aluno",
                            TargetUserSid = userSid,
                            Policies = new List<PolicyApplyItemDto>
                            {
                                new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                            }
                        }));

                    Assert.Equal(1, results.Count(r => r.Success));

                    var loser = results.Single(r => !r.Success);
                    Assert.Equal(TransactionStatus.Failed, loser.Status);
                    Assert.Contains("já pertence", loser.Message, StringComparison.Ordinal);

                    bool wallpaperApplied = registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper");
                    bool soundsApplied = registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme");
                    Assert.True(wallpaperApplied ^ soundsApplied,
                        "Exactly one engine may apply its policy; the loser must apply zero mutations.");

                    Assert.Single(Directory.GetFiles(testDir, "*.json"));

                    var winnerRecord = await engineA.GetTransactionAsync("tx-race");
                    Assert.NotNull(winnerRecord);
                    Assert.NotEmpty(winnerRecord!.Baseline.Entries);
                    Assert.NotEmpty(winnerRecord.RollbackPlan);

                    var rollback = await engineA.RollbackTransactionAsync(new RollbackTransactionRequestDto { TransactionId = "tx-race" });
                    Assert.True(rollback.Success);
                    Assert.False(wallpaperApplied
                        ? registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper")
                        : registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme"),
                        "Rollback of the winning transaction must remain functional after the race.");
                }
                finally
                {
                    if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
                }
            }
        }

        [Fact]
        public async Task ApplyTransaction_ConcurrentEngines_CollidingSanitizedIds_ExactlyOneWins()
        {
            const string userSid = "S-1-5-21-999-1002";

            for (int attempt = 0; attempt < 5; attempt++)
            {
                var registry = new InMemoryRegistryService();
                var hiveManager = new MockUserHiveManager();
                var catalog = new PolicyCatalog(processChecker: p => false);
                string testDir = CreateTempTransactionDir();

                try
                {
                    var engineA = new TransactionEngine(catalog, registry, hiveManager, testDir);
                    var engineB = new TransactionEngine(catalog, registry, hiveManager, testDir);

                    var results = await Task.WhenAll(
                        engineA.ApplyTransactionAsync(new ApplyTransactionRequestDto
                        {
                            TransactionId = "sub/dir/escape",
                            TargetUserName = "Aluno",
                            TargetUserSid = userSid,
                            Policies = new List<PolicyApplyItemDto>
                            {
                                new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                            }
                        }),
                        engineB.ApplyTransactionAsync(new ApplyTransactionRequestDto
                        {
                            TransactionId = "sub_dir_escape",
                            TargetUserName = "Aluno",
                            TargetUserSid = userSid,
                            Policies = new List<PolicyApplyItemDto>
                            {
                                new() { PolicyId = "personalization.sounds", DesiredState = "Blocked" }
                            }
                        }));

                    Assert.Equal(1, results.Count(r => r.Success));

                    var loser = results.Single(r => !r.Success);
                    Assert.Equal(TransactionStatus.Failed, loser.Status);
                    Assert.Equal("sub_dir_escape", loser.TransactionId);
                    Assert.Contains("já pertence", loser.Message, StringComparison.Ordinal);

                    bool wallpaperApplied = registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper");
                    bool soundsApplied = registry.ValueExists(RegistryHiveType.Users, $@"{userSid}\Software\Policies\Microsoft\Windows\Personalization", "NoChangingSoundScheme");
                    Assert.True(wallpaperApplied ^ soundsApplied,
                        "Exactly one engine may apply its policy; the loser must apply zero mutations.");

                    Assert.Single(Directory.GetFiles(testDir, "*.json"));

                    var winnerRecord = await engineA.GetTransactionAsync("sub_dir_escape");
                    Assert.NotNull(winnerRecord);
                    Assert.NotEmpty(winnerRecord!.Baseline.Entries);
                    Assert.NotEmpty(winnerRecord.RollbackPlan);
                }
                finally
                {
                    if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
                }
            }
        }
    }
}

