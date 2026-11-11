using System;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using WinLab.Contracts;
using Xunit;

namespace WinLab.Tests
{
    public class HandshakeSecurityTests
    {
        [Fact]
        public void HandshakeRequest_Serialization_RoundTripsSuccessfully()
        {
            var req = new HandshakeRequest
            {
                Token = "4f8a12bc90de",
                ClientPid = 5432
            };

            string json = JsonSerializer.Serialize(req);
            var deserialized = JsonSerializer.Deserialize<HandshakeRequest>(json);

            Assert.NotNull(deserialized);
            Assert.Equal("4f8a12bc90de", deserialized.Token);
            Assert.Equal(5432, deserialized.ClientPid);
        }

        [Fact]
        public void HandshakeResponse_Serialization_RoundTripsSuccessfully()
        {
            var resp = new HandshakeResponse
            {
                Success = true,
                Error = null,
                ServerPid = 1024
            };

            string json = JsonSerializer.Serialize(resp);
            var deserialized = JsonSerializer.Deserialize<HandshakeResponse>(json);

            Assert.NotNull(deserialized);
            Assert.True(deserialized.Success);
            Assert.Null(deserialized.Error);
            Assert.Equal(1024, deserialized.ServerPid);
        }

        [Fact]
        public void FixedTimeEquals_AuthenticatesIdenticalTokens()
        {
            string token1 = "secret-token-abc-123456789";
            string token2 = "secret-token-abc-123456789";

            byte[] b1 = Encoding.UTF8.GetBytes(token1);
            byte[] b2 = Encoding.UTF8.GetBytes(token2);

            Assert.True(CryptographicOperations.FixedTimeEquals(b1, b2));
        }

        [Fact]
        public void FixedTimeEquals_RejectsMismatchedTokens()
        {
            string validToken = "secret-token-abc-123456789";
            string forgedToken = "secret-token-abc-999999999";

            byte[] b1 = Encoding.UTF8.GetBytes(validToken);
            byte[] b2 = Encoding.UTF8.GetBytes(forgedToken);

            Assert.False(CryptographicOperations.FixedTimeEquals(b1, b2));
        }

        [Fact]
        public void FixedTimeEquals_RejectsDifferentLengthTokens()
        {
            string validToken = "secret-token-123";
            string truncated = "secret-token";

            byte[] b1 = Encoding.UTF8.GetBytes(validToken);
            byte[] b2 = Encoding.UTF8.GetBytes(truncated);

            Assert.False(CryptographicOperations.FixedTimeEquals(b1, b2));
        }
    }
}
