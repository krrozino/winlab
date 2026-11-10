using System;
using System.Text.Json.Serialization;

namespace WinLab.Contracts
{
    /// <summary>
    /// Envelope canônico para troca de mensagens estruturadas via IPC entre a UI e o Serviço.
    /// Nenhuma string arbitrária ou script solto é aceito.
    /// </summary>
    public class IpcEnvelope<T>
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString("D");

        [JsonPropertyName("version")]
        public string Version { get; set; } = IpcConstants.ProtocolVersion;

        [JsonPropertyName("timestamp")]
        public string Timestamp { get; set; } = DateTime.UtcNow.ToString("o");

        [JsonPropertyName("type")]
        public string Type { get; set; } = "query"; // query, command, response, event

        [JsonPropertyName("action")]
        public string Action { get; set; } = string.Empty;

        [JsonPropertyName("payload")]
        public T? Payload { get; set; }

        [JsonPropertyName("securityContext")]
        public SecurityContextDto? SecurityContext { get; set; }
    }

    public class SecurityContextDto
    {
        [JsonPropertyName("callerPid")]
        public int CallerPid { get; set; }

        [JsonPropertyName("callerSid")]
        public string? CallerSid { get; set; }

        [JsonPropertyName("isElevated")]
        public bool IsElevated { get; set; }

        [JsonPropertyName("requiresAdmin")]
        public bool RequiresAdmin { get; set; }
    }

    public class IpcResponse<T>
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString("D");

        [JsonPropertyName("replyToId")]
        public string ReplyToId { get; set; } = string.Empty;

        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }

        [JsonPropertyName("errorCode")]
        public string? ErrorCode { get; set; }

        [JsonPropertyName("data")]
        public T? Data { get; set; }

        public static IpcResponse<T> Ok(string replyToId, T data)
        {
            return new IpcResponse<T>
            {
                ReplyToId = replyToId,
                Success = true,
                Data = data
            };
        }

        public static IpcResponse<T> Fail(string replyToId, string error, string errorCode = "GENERIC_ERROR")
        {
            return new IpcResponse<T>
            {
                ReplyToId = replyToId,
                Success = false,
                Error = error,
                ErrorCode = errorCode
            };
        }
    }
}
