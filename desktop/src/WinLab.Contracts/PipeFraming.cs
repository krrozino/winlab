using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace WinLab.Contracts
{
    /// <summary>
    /// Protocolo de framing binário com prefixo de comprimento para comunicação via Named Pipe.
    /// Header: 4 bytes (Int32 little-endian) contendo o tamanho do payload em bytes.
    /// Payload: Sequência UTF-8 do envelope JSON.
    /// Limite máximo: 16 MB para proteção contra ataques de DoS por esgotamento de memória.
    /// </summary>
    public static class PipeFraming
    {
        public const int MaxFrameSize = 16 * 1024 * 1024; // 16 MB limit

        public static async Task WriteFrameAsync(Stream stream, string json, CancellationToken ct = default)
        {
            if (stream == null) throw new ArgumentNullException(nameof(stream));
            if (json == null) throw new ArgumentNullException(nameof(json));

            byte[] payloadBytes = Encoding.UTF8.GetBytes(json);
            if (payloadBytes.Length > MaxFrameSize)
            {
                throw new InvalidOperationException($"Payload size {payloadBytes.Length} exceeds maximum permitted frame size ({MaxFrameSize} bytes).");
            }

            byte[] lengthBytes = BitConverter.GetBytes(payloadBytes.Length);
            await stream.WriteAsync(lengthBytes.AsMemory(0, 4), ct);
            await stream.WriteAsync(payloadBytes.AsMemory(0, payloadBytes.Length), ct);
            await stream.FlushAsync(ct);
        }

        public static async Task<string> ReadFrameAsync(Stream stream, CancellationToken ct = default)
        {
            if (stream == null) throw new ArgumentNullException(nameof(stream));

            byte[] lengthBytes = new byte[4];
            int read = 0;
            while (read < 4)
            {
                int chunk = await stream.ReadAsync(lengthBytes.AsMemory(read, 4 - read), ct);
                if (chunk == 0)
                {
                    throw new EndOfStreamException("Pipe disconnected while reading frame header.");
                }
                read += chunk;
            }

            int payloadLength = BitConverter.ToInt32(lengthBytes, 0);
            if (payloadLength <= 0 || payloadLength > MaxFrameSize)
            {
                throw new InvalidDataException($"Invalid frame length: {payloadLength} bytes. Must be between 1 and {MaxFrameSize}.");
            }

            byte[] payloadBuffer = new byte[payloadLength];
            read = 0;
            while (read < payloadLength)
            {
                int chunk = await stream.ReadAsync(payloadBuffer.AsMemory(read, payloadLength - read), ct);
                if (chunk == 0)
                {
                    throw new EndOfStreamException("Pipe disconnected while reading frame payload.");
                }
                read += chunk;
            }

            return Encoding.UTF8.GetString(payloadBuffer);
        }
    }
}
