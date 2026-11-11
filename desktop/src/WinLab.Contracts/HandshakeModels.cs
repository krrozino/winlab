using System.Text.Json.Serialization;

namespace WinLab.Contracts
{
    /// <summary>
    /// Modelo de requisição de handshake para autenticação mútua via Named Pipe.
    /// </summary>
    public class HandshakeRequest
    {
        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("clientPid")]
        public int ClientPid { get; set; }
    }

    /// <summary>
    /// Modelo de resposta do handshake de autenticação mútua via Named Pipe.
    /// </summary>
    public class HandshakeResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }

        [JsonPropertyName("serverPid")]
        public int ServerPid { get; set; }
    }
}
