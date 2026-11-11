using System;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Agent.Mock;
using WinLab.Contracts;
using Xunit;

namespace WinLab.Tests
{
    public class MockAgentServiceTests
    {
        private readonly MockAgentService _service = new MockAgentService();

        [Fact]
        public async Task HandleRequestAsync_QueryInventory_ReturnsStructuredInventory()
        {
            string reqJson = """
            {
                "id": "req-inv-test",
                "version": "1.0.0",
                "type": "query",
                "action": "inventory.query"
            }
            """;

            var response = await _service.HandleRequestAsync(reqJson);

            Assert.True(response.Success);
            Assert.Equal("req-inv-test", response.ReplyToId);
            Assert.NotNull(response.Data);

            var inventory = Assert.IsType<MachineInventoryDto>(response.Data);
            Assert.Equal("LAB-MICROLINS-01", inventory.ComputerName);
            Assert.Equal("Windows 11 Pro", inventory.Windows.Caption);
            Assert.NotEmpty(inventory.DetectedApps);
            Assert.NotEmpty(inventory.LocalUsers);
            Assert.NotEmpty(inventory.Disks);
        }

        [Fact]
        public async Task HandleRequestAsync_QueryPolicyState_ReturnsUnconfiguredPolicies()
        {
            string reqJson = """
            {
                "id": "req-pol-test",
                "version": "1.0.0",
                "type": "query",
                "action": "policy.query_state"
            }
            """;

            var response = await _service.HandleRequestAsync(reqJson);

            Assert.True(response.Success);
            Assert.Equal("req-pol-test", response.ReplyToId);

            var summary = Assert.IsType<PolicyStateSummaryDto>(response.Data);
            Assert.Equal(6, summary.TotalPolicies);
            Assert.Equal(0, summary.AppliedCount);
            Assert.Equal(6, summary.NotConfiguredCount);
            Assert.All(summary.Items, item => Assert.Equal(PolicyState.NotConfigured, item.CurrentState));
        }

        [Fact]
        public async Task HandleRequestAsync_QueryPreflight_ReturnsPassStatus()
        {
            string reqJson = """
            {
                "id": "req-pre-test",
                "version": "1.0.0",
                "type": "query",
                "action": "preflight.query"
            }
            """;

            var response = await _service.HandleRequestAsync(reqJson);

            Assert.True(response.Success);
            Assert.Equal("req-pre-test", response.ReplyToId);
            Assert.NotNull(response.Data);
        }

        [Fact]
        public async Task HandleRequestAsync_ListPresets_ReturnsPresets()
        {
            string reqJson = """
            {
                "id": "req-pre-list",
                "version": "1.0.0",
                "type": "query",
                "action": "presets.list"
            }
            """;

            var response = await _service.HandleRequestAsync(reqJson);

            Assert.True(response.Success);
            Assert.NotNull(response.Data);
        }

        [Fact]
        public async Task HandleRequestAsync_ShellInjectionInJson_RejectsImmediately()
        {
            string maliciousJson = """
            {
                "id": "req-attack-1",
                "version": "1.0.0",
                "type": "command",
                "action": "inventory.query",
                "payload": "powershell.exe -NoProfile -Command Write-Host evil"
            }
            """;

            var response = await _service.HandleRequestAsync(maliciousJson);

            Assert.False(response.Success);
            Assert.Equal("FORBIDDEN_SHELL_INJECTION", response.ErrorCode);
            Assert.Contains("Forbidden executable or script pattern detected", response.Error);
        }

        [Fact]
        public async Task HandleRequestAsync_UnlistedAction_RejectsWithUnauthorizedAction()
        {
            string reqJson = """
            {
                "id": "req-unlisted",
                "version": "1.0.0",
                "type": "command",
                "action": "unauthorized.system_action"
            }
            """;

            var response = await _service.HandleRequestAsync(reqJson);

            Assert.False(response.Success);
            Assert.Equal("UNAUTHORIZED_ACTION", response.ErrorCode);
        }

        [Fact]
        public async Task HandleRequestAsync_ApplyPoliciesInFoundation_RejectsWithPrivilegedExecutorDisabled()
        {
            string reqJson = """
            {
                "id": "req-apply-mutation",
                "version": "1.0.0",
                "type": "command",
                "action": "policy.apply",
                "payload": { "targetUser": "Aluno" }
            }
            """;

            var response = await _service.HandleRequestAsync(reqJson);

            Assert.False(response.Success);
            Assert.Equal("PRIVILEGED_EXECUTOR_DISABLED", response.ErrorCode);
        }

        [Fact]
        public async Task HandleRequestAsync_MalformedJson_ReturnsMalformedJsonError()
        {
            string brokenJson = "{ this is not valid json }";

            var response = await _service.HandleRequestAsync(brokenJson);

            Assert.False(response.Success);
            Assert.Equal("MALFORMED_JSON", response.ErrorCode);
        }

        [Fact]
        public async Task HandleRequestAsync_NullJson_FailsWithInvalidEnvelopeSchema()
        {
            var response = await _service.HandleRequestAsync("null");

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_SCHEMA", response.ErrorCode);
            Assert.Contains("must be a valid JSON object envelope", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }

        [Fact]
        public async Task HandleRequestAsync_ArrayJson_FailsWithInvalidEnvelopeSchema()
        {
            var response = await _service.HandleRequestAsync("[1, 2, 3]");

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_SCHEMA", response.ErrorCode);
            Assert.Contains("must be a valid JSON object envelope", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }

        [Fact]
        public async Task HandleRequestAsync_NumberJson_FailsWithInvalidEnvelopeSchema()
        {
            var response = await _service.HandleRequestAsync("12345");

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_SCHEMA", response.ErrorCode);
            Assert.Contains("must be a valid JSON object envelope", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }

        [Fact]
        public async Task HandleRequestAsync_StringJson_FailsWithInvalidEnvelopeSchema()
        {
            var response = await _service.HandleRequestAsync("\"hello\"");

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_SCHEMA", response.ErrorCode);
            Assert.Contains("must be a valid JSON object envelope", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }

        [Fact]
        public async Task HandleRequestAsync_BooleanJson_FailsWithInvalidEnvelopeSchema()
        {
            var response = await _service.HandleRequestAsync("true");

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_SCHEMA", response.ErrorCode);
            Assert.Contains("must be a valid JSON object envelope", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }

        [Theory]
        [InlineData("null")]
        [InlineData("[1, 2, 3]")]
        [InlineData("12345")]
        [InlineData("\"hello\"")]
        [InlineData("true")]
        public async Task HandleRequestAsync_NonObjectJsonTokens_FailsWithInvalidEnvelopeSchema(string nonObjectJson)
        {
            var response = await _service.HandleRequestAsync(nonObjectJson);

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_SCHEMA", response.ErrorCode);
            Assert.Contains("must be a valid JSON object envelope", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }

        [Fact]
        public async Task HandleRequestAsync_NonStringId_FailsWithInvalidEnvelopeId()
        {
            string reqJson = """
            {
                "id": 12345,
                "type": "query",
                "action": "inventory.query"
            }
            """;

            var response = await _service.HandleRequestAsync(reqJson);

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_ID", response.ErrorCode);
            Assert.Contains("Envelope 'id' must be a non-empty string", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }

        [Theory]
        [InlineData("{\"id\": 12345, \"type\": \"query\", \"action\": \"inventory.query\"}")]
        [InlineData("{\"id\": true, \"type\": \"query\", \"action\": \"inventory.query\"}")]
        [InlineData("{\"id\": [1, 2, 3], \"type\": \"query\", \"action\": \"inventory.query\"}")]
        [InlineData("{\"id\": {\"key\": \"value\"}, \"type\": \"query\", \"action\": \"inventory.query\"}")]
        public async Task HandleRequestAsync_VariousNonStringIdVariants_FailsWithInvalidEnvelopeId(string payload)
        {
            var response = await _service.HandleRequestAsync(payload);

            Assert.False(response.Success);
            Assert.Equal("INVALID_ENVELOPE_ID", response.ErrorCode);
            Assert.Contains("Envelope 'id' must be a non-empty string", response.Error);
            Assert.False(string.IsNullOrWhiteSpace(response.ReplyToId));
        }
    }
}
