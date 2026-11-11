using System;
using System.Text.Json;
using WinLab.Contracts;
using Xunit;

namespace WinLab.Tests
{
    public class IpcContractTests
    {
        [Fact]
        public void IpcEnvelope_SerializationAndDeserialization_RoundTripsSuccessfully()
        {
            var original = new IpcEnvelope<ConfigValidationPayload>
            {
                Id = Guid.NewGuid().ToString("D"),
                Version = "1.0.0",
                Timestamp = DateTime.UtcNow.ToString("o"),
                Type = "command",
                Action = IpcConstants.ActionValidateConfig,
                Payload = new ConfigValidationPayload
                {
                    ProfileName = "Microlins Test",
                    StudentUser = "Aluno",
                    AdminUser = "Administrador"
                },
                SecurityContext = new SecurityContextDto
                {
                    CallerPid = 1234,
                    CallerSid = "S-1-5-21-1234-500",
                    IsElevated = false,
                    RequiresAdmin = false
                }
            };

            string json = JsonSerializer.Serialize(original);
            var deserialized = JsonSerializer.Deserialize<IpcEnvelope<ConfigValidationPayload>>(json);

            Assert.NotNull(deserialized);
            Assert.Equal(original.Id, deserialized.Id);
            Assert.Equal(original.Version, deserialized.Version);
            Assert.Equal(original.Type, deserialized.Type);
            Assert.Equal(original.Action, deserialized.Action);
            Assert.NotNull(deserialized.Payload);
            Assert.Equal("Microlins Test", deserialized.Payload.ProfileName);
            Assert.Equal("Aluno", deserialized.Payload.StudentUser);
            Assert.NotNull(deserialized.SecurityContext);
            Assert.Equal(1234, deserialized.SecurityContext.CallerPid);
            Assert.False(deserialized.SecurityContext.IsElevated);
        }

        [Fact]
        public void IpcResponse_OkFactory_ProducesValidSuccessResponse()
        {
            string replyToId = Guid.NewGuid().ToString("D");
            var sampleData = new { Status = "Ready", Count = 42 };

            var response = IpcResponse<object>.Ok(replyToId, sampleData);

            Assert.True(response.Success);
            Assert.Equal(replyToId, response.ReplyToId);
            Assert.Null(response.Error);
            Assert.Null(response.ErrorCode);
            Assert.NotNull(response.Data);

            string json = JsonSerializer.Serialize(response);
            Assert.Contains("\"success\":true", json);
            Assert.Contains($"\"replyToId\":\"{replyToId}\"", json);
        }

        [Fact]
        public void IpcResponse_FailFactory_ProducesValidFailureResponse()
        {
            string replyToId = Guid.NewGuid().ToString("D");

            var response = IpcResponse<object>.Fail(replyToId, "Custom error occurred.", "CUSTOM_ERROR_CODE");

            Assert.False(response.Success);
            Assert.Equal(replyToId, response.ReplyToId);
            Assert.Equal("Custom error occurred.", response.Error);
            Assert.Equal("CUSTOM_ERROR_CODE", response.ErrorCode);
            Assert.Null(response.Data);

            string json = JsonSerializer.Serialize(response);
            Assert.Contains("\"success\":false", json);
            Assert.Contains("\"errorCode\":\"CUSTOM_ERROR_CODE\"", json);
        }

        private class ConfigValidationPayload
        {
            public string? ProfileName { get; set; }
            public string? StudentUser { get; set; }
            public string? AdminUser { get; set; }
        }
    }
}
