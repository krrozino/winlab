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
using Xunit;

namespace WinLab.Tests
{
    public class RealAgentAndCoordinatorTests
    {
        private sealed class FakeScanner : IWindowsScanner
        {
            private readonly List<LocalUserDto> _users;

            public FakeScanner(List<LocalUserDto>? users = null)
            {
                _users = users ?? new List<LocalUserDto>
                {
                    new() { Name = "Administrador", Enabled = true, IsAdmin = true, Sid = "S-1-5-21-9000-500" },
                    new() { Name = "AlunoAtivo", Enabled = true, IsAdmin = false, Sid = "S-1-5-21-9000-1002" },
                    new() { Name = "AlunoOutro", Enabled = true, IsAdmin = false, Sid = "S-1-5-21-9000-1003" },
                    new() { Name = "AlunoDesativado", Enabled = false, IsAdmin = false, Sid = "S-1-5-21-9000-1004" }
                };
            }

            public Task<MachineInventoryDto> ScanInventoryAsync(CancellationToken cancellationToken = default)
            {
                return Task.FromResult(new MachineInventoryDto
                {
                    ComputerName = "ESTACAO-LAB-01",
                    IsMock = false,
                    Windows = new WindowsInfoDto
                    {
                        Caption = "Windows 11 Pro",
                        Edition = "Professional",
                        BuildNumber = "26100",
                        Architecture = "64 bits",
                        Is64Bit = true
                    },
                    Disks = new List<DiskInfoDto>
                    {
                        new() { Device = "C:", TotalGb = 250, FreeGb = 120, FreePercent = 48.0 }
                    },
                    LocalUsers = _users
                });
            }
        }

        private sealed class RecordingExecutorStub : IAgentService
        {
            public bool IsRunning { get; set; }
            public string ExecutionMode => "Stub Elevated Executor";
            public List<string> ReceivedRawEnvelopes { get; } = new();
            public Func<string, Task<IpcResponse<object>>>? Handler { get; set; }

            public async Task<IpcResponse<object>> HandleRequestAsync(string rawJson)
            {
                ReceivedRawEnvelopes.Add(rawJson);
                if (Handler != null)
                {
                    return await Handler(rawJson);
                }
                return IpcResponse<object>.Ok("stub", new { delegated = true });
            }
        }

        [Fact]
        public async Task StartupReads_InventoryPreflightAndPolicyStates_NeverTriggerElevatedExecutor()
        {
            var scanner = new FakeScanner();
            var executorStub = new RecordingExecutorStub { IsRunning = false };
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            hiveManager.SetUserLoggedOn("S-1-5-21-9000-1002", true);
            var catalog = new PolicyCatalog(processChecker: _ => false);

            var service = new RealAgentService(
                scanner: scanner,
                executorClient: executorStub,
                catalog: catalog,
                registry: registry,
                hiveManager: hiveManager,
                simulateWindows: true);

            // 1. inventory.query
            var invResp = await service.HandleRequestAsync("""
            {
                "id": "req-1",
                "version": "1.0.0",
                "type": "query",
                "action": "inventory.query"
            }
            """);
            Assert.True(invResp.Success);

            // 2. preflight.query
            var preResp = await service.HandleRequestAsync("""
            {
                "id": "req-2",
                "version": "1.0.0",
                "type": "query",
                "action": "preflight.query"
            }
            """);
            Assert.True(preResp.Success);

            // 3. policy.query_state (legacy alias) without allowElevation
            var polSingularResp = await service.HandleRequestAsync("""
            {
                "id": "req-3",
                "version": "1.0.0",
                "type": "query",
                "action": "policy.query_state",
                "payload": { "targetUserSid": "S-1-5-21-9000-1002" }
            }
            """);
            Assert.True(polSingularResp.Success);

            // 4. policy.query_states (canonical) without allowElevation
            var polPluralResp = await service.HandleRequestAsync("""
            {
                "id": "req-4",
                "version": "1.0.0",
                "type": "query",
                "action": "policy.query_states",
                "payload": { "targetUserSid": "S-1-5-21-9000-1002" }
            }
            """);
            Assert.True(polPluralResp.Success);

            // Nenhum prompt UAC / executor elevado foi disparado nas leituras iniciais!
            Assert.Empty(executorStub.ReceivedRawEnvelopes);
        }

        [Fact]
        public async Task QueryPolicyState_WhenExecutorAlreadyRunning_RewritesEnvelopeActionSafelyWithoutCorruption()
        {
            var scanner = new FakeScanner();
            var executorStub = new RecordingExecutorStub { IsRunning = true };
            var service = new RealAgentService(
                scanner: scanner,
                executorClient: executorStub,
                simulateWindows: true);

            var resp = await service.HandleRequestAsync("""
            {
                "id": "req-singular-rewrite",
                "version": "1.0.0",
                "timestamp": "2026-11-17T12:00:00Z",
                "type": "query",
                "action": "policy.query_state",
                "payload": {
                    "targetUserSid": "S-1-5-21-9000-1002",
                    "note": "policy.query_state literal inside payload must stay intact"
                }
            }
            """);

            Assert.True(resp.Success);
            Assert.Single(executorStub.ReceivedRawEnvelopes);

            using var forwardedDoc = JsonDocument.Parse(executorStub.ReceivedRawEnvelopes[0]);
            var root = forwardedDoc.RootElement;
            Assert.Equal("req-singular-rewrite", root.GetProperty("id").GetString());
            Assert.Equal(IpcConstants.ActionQueryPolicyStates, root.GetProperty("action").GetString());
            Assert.Equal(
                "policy.query_state literal inside payload must stay intact",
                root.GetProperty("payload").GetProperty("note").GetString());
        }

        [Fact]
        public async Task UserPolicies_WithoutTargetSid_NeverReadCurrentAdminUserAndReturnInconclusive()
        {
            var scanner = new FakeScanner();
            var executorStub = new RecordingExecutorStub { IsRunning = false };
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            var catalog = new PolicyCatalog(processChecker: _ => false);

            // Simula chave contaminada no HKCU/Software atual (como se o admin tivesse uma chave local)
            registry.SetValue(
                RegistryHiveType.Users,
                @"Software\Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                "NoChangingWallPaper",
                1);

            var service = new RealAgentService(
                scanner: scanner,
                executorClient: executorStub,
                catalog: catalog,
                registry: registry,
                hiveManager: hiveManager,
                simulateWindows: true);

            var resp = await service.HandleRequestAsync("""
            {
                "id": "req-no-sid",
                "version": "1.0.0",
                "type": "query",
                "action": "policy.query_states"
            }
            """);

            Assert.True(resp.Success);
            var summary = Assert.IsType<PolicyStateSummaryDto>(resp.Data);
            var wallpaper = summary.Items.Single(i => i.Id == "personalization.wallpaper");

            Assert.Equal(PolicyScope.User, wallpaper.Scope);
            Assert.Equal(PolicyState.Inconclusive, wallpaper.CurrentState);
            Assert.Equal(PolicyEffectiveState.Inconclusive, wallpaper.EffectiveState);
        }

        [Theory]
        [InlineData("S-1-5-21-9000-500", "ADMIN_TARGET_FORBIDDEN")]
        [InlineData("S-1-5-21-9000-9999", "TARGET_USER_NOT_FOUND")]
        [InlineData("S-1-5-21-9000-1004", "TARGET_USER_DISABLED")]
        [InlineData("SID-INVALIDO-123", "INVALID_TARGET_SID")]
        public async Task QueryPolicyStates_InvalidAdminMissingOrDisabledUser_FailsClosed(string targetSid, string expectedErrorCode)
        {
            var scanner = new FakeScanner();
            var executorStub = new RecordingExecutorStub { IsRunning = false };
            var service = new RealAgentService(
                scanner: scanner,
                executorClient: executorStub,
                simulateWindows: true);

            var resp = await service.HandleRequestAsync($$"""
            {
                "id": "req-invalid-target",
                "version": "1.0.0",
                "type": "query",
                "action": "policy.query_states",
                "payload": { "targetUserSid": "{{targetSid}}" }
            }
            """);

            Assert.False(resp.Success);
            Assert.Equal(expectedErrorCode, resp.ErrorCode);
            Assert.Empty(executorStub.ReceivedRawEnvelopes);
        }

        [Fact]
        public async Task PerUserIsolation_ApplyingPolicyToStudentA_NeverAffectsStudentBOrExecutorHostQuery()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), $"WinLab_TestTx_{Guid.NewGuid():N}");
            try
            {
                var scanner = new FakeScanner();
                var registry = new InMemoryRegistryService();
                var hiveManager = new MockUserHiveManager();
                hiveManager.SetUserLoggedOn("S-1-5-21-9000-1002", true);
                hiveManager.SetUserLoggedOn("S-1-5-21-9000-1003", true);
                var catalog = new PolicyCatalog(processChecker: _ => false);
                var engine = new TransactionEngine(catalog, registry, hiveManager, tempDir);

                var executorHost = new ExecutorHost(
                    pipeName: "WinLab_Test_Pipe",
                    sessionToken: "0123456789ABCDEF",
                    parentPid: 0,
                    scanner: scanner,
                    catalog: catalog,
                    registry: registry,
                    hiveManager: hiveManager,
                    engine: engine);

                // Aplica bloqueio de papel de parede apenas em AlunoAtivo (1002)
                string applyRespRaw = await executorHost.ProcessRequestAsync("""
                {
                    "id": "tx-apply-1002",
                    "version": "1.0.0",
                    "type": "command",
                    "action": "policy.apply_transaction",
                    "payload": {
                        "targetUserName": "AlunoAtivo",
                        "targetUserSid": "S-1-5-21-9000-1002",
                        "policies": [
                            { "policyId": "personalization.wallpaper", "desiredState": "Blocked" }
                        ]
                    }
                }
                """);

                using (var applyDoc = JsonDocument.Parse(applyRespRaw))
                {
                    Assert.True(applyDoc.RootElement.GetProperty("success").GetBoolean());
                }

                // Consulta AlunoAtivo (1002): política está ativa (PendingLogoff pois sessão está aberta)
                string query1002Raw = await executorHost.ProcessRequestAsync("""
                {
                    "id": "q-1002",
                    "version": "1.0.0",
                    "type": "query",
                    "action": "policy.query_states",
                    "payload": { "targetUserSid": "S-1-5-21-9000-1002" }
                }
                """);
                using (var doc1002 = JsonDocument.Parse(query1002Raw))
                {
                    var items = doc1002.RootElement.GetProperty("data").GetProperty("items").EnumerateArray().ToList();
                    var wp1002 = items.Single(i => i.GetProperty("id").GetString() == "personalization.wallpaper");
                    Assert.Equal("PendingLogoff", wp1002.GetProperty("currentState").GetString());
                    Assert.Equal("Applied", wp1002.GetProperty("configuredState").GetString());
                }

                // Consulta AlunoOutro (1003): política permanece NotConfigured!
                string query1003Raw = await executorHost.ProcessRequestAsync("""
                {
                    "id": "q-1003",
                    "version": "1.0.0",
                    "type": "query",
                    "action": "policy.query_states",
                    "payload": { "targetUserSid": "S-1-5-21-9000-1003" }
                }
                """);
                using (var doc1003 = JsonDocument.Parse(query1003Raw))
                {
                    var items = doc1003.RootElement.GetProperty("data").GetProperty("items").EnumerateArray().ToList();
                    var wp1003 = items.Single(i => i.GetProperty("id").GetString() == "personalization.wallpaper");
                    Assert.Equal("NotConfigured", wp1003.GetProperty("currentState").GetString());
                }
            }
            finally
            {
                if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
            }
        }

        [Fact]
        public async Task TransactionEngine_WhenRollbackStepFails_ReportsIncompleteRecoveryInsteadOfRolledBack()
        {
            string tempDir = Path.Combine(Path.GetTempPath(), $"WinLab_IncompleteRb_{Guid.NewGuid():N}");
            try
            {
                var registry = new InMemoryRegistryService();
                var hiveManager = new MockUserHiveManager();
                hiveManager.SetUserLoggedOn("S-1-5-21-9000-1002", true);
                var catalog = new PolicyCatalog(processChecker: _ => false);
                var engine = new TransactionEngine(catalog, registry, hiveManager, tempDir);

                // Aplica transação válida primeiro
                var applyRes = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
                {
                    TransactionId = "tx-rollback-fault",
                    TargetUserName = "AlunoAtivo",
                    TargetUserSid = "S-1-5-21-9000-1002",
                    Policies = new List<PolicyApplyItemDto>
                    {
                        new() { PolicyId = "personalization.wallpaper", DesiredState = "Blocked" }
                    }
                });
                Assert.True(applyRes.Success);

                // Injeta falha de exclusão no registro durante o rollback manual
                registry.SetDeleteFault("NoChangingWallPaper", new UnauthorizedAccessException("Chave bloqueada por ACL simulada"));

                var rollbackRes = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
                {
                    TransactionId = "tx-rollback-fault",
                    TargetUserSid = "S-1-5-21-9000-1002"
                });

                Assert.False(rollbackRes.Success);
                Assert.Equal(TransactionStatus.Failed, rollbackRes.Status);
                Assert.Contains("Recuperação incompleta", rollbackRes.Message);
            }
            finally
            {
                if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
            }
        }
    }
}
