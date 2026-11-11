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
            string testDir = CreateTempTransactionDir();
            string escapeTarget = Path.GetFullPath(Path.Combine(testDir, "..", "traversal_escape.json"));

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
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
                if (File.Exists(escapeTarget)) File.Delete(escapeTarget);
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

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-null-policies-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = "S-1-5-21-999-1002",
                    Policies = null!
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.False(string.IsNullOrWhiteSpace(result.Message));
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

            try
            {
                var engine = new TransactionEngine(catalog, registry, hiveManager, testDir);
                var request = new ApplyTransactionRequestDto
                {
                    TransactionId = $"tx-empty-policies-{Guid.NewGuid():N}",
                    TargetUserName = "Aluno",
                    TargetUserSid = "S-1-5-21-999-1002",
                    Policies = new List<PolicyApplyItemDto>()
                };

                var result = await engine.ApplyTransactionAsync(request);

                Assert.False(result.Success);
                Assert.Equal(TransactionStatus.Failed, result.Status);
                Assert.Equal(0, result.AppliedCount);
            }
            finally
            {
                if (Directory.Exists(testDir)) Directory.Delete(testDir, true);
            }
        }

        // =========================================================================
        // 8. TransactionId Sanitization Hardening (No Path Separators Escape)
        // =========================================================================

        [Theory]
        [InlineData("../traversal_escape")]
        [InlineData("..\\..\\traversal_escape")]
        [InlineData("sub/dir/escape")]
        [InlineData("   ")]
        [InlineData("")]
        public void SanitizeTransactionId_AdversarialInputs_MustNeverEscapeTransactionDirectory(string rawId)
        {
            string sanitized = TransactionEngine.SanitizeTransactionId(rawId);

            Assert.False(string.IsNullOrWhiteSpace(sanitized));
            Assert.DoesNotContain('/', sanitized);
            Assert.Equal(Path.GetFileName(sanitized), sanitized);
        }
    }
}

