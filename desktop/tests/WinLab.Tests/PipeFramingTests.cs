using System;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using WinLab.Contracts;
using Xunit;

namespace WinLab.Tests
{
    public class PipeFramingTests
    {
        [Fact]
        public async Task PipeFraming_RoundTrip_Succeeds()
        {
            using var memoryStream = new MemoryStream();
            string originalJson = "{\"action\":\"inventory.query\",\"payload\":{\"test\":\"accentuation — áéíóú çãõ\"}}";

            await PipeFraming.WriteFrameAsync(memoryStream, originalJson);
            memoryStream.Position = 0;

            string readJson = await PipeFraming.ReadFrameAsync(memoryStream);
            Assert.Equal(originalJson, readJson);
        }

        [Fact]
        public async Task PipeFraming_LargePayload_RoundTripsSuccessfully()
        {
            using var memoryStream = new MemoryStream();
            string largePayload = new string('A', 256 * 1024); // 256 KB
            string json = $"{{\"data\":\"{largePayload}\"}}";

            await PipeFraming.WriteFrameAsync(memoryStream, json);
            memoryStream.Position = 0;

            string readJson = await PipeFraming.ReadFrameAsync(memoryStream);
            Assert.Equal(json, readJson);
        }

        [Fact]
        public async Task PipeFraming_PayloadExceedingMax_ThrowsInvalidOperationException()
        {
            using var memoryStream = new MemoryStream();
            // MaxFrameSize is 16 MB.
            // Rather than allocating 17 MB in tests, we verify the exception on oversize or invalid header:
            byte[] header = BitConverter.GetBytes(PipeFraming.MaxFrameSize + 1);
            using var testStream = new MemoryStream(header);

            await Assert.ThrowsAsync<InvalidDataException>(async () =>
            {
                await PipeFraming.ReadFrameAsync(testStream);
            });
        }

        [Fact]
        public async Task PipeFraming_NegativeLengthHeader_ThrowsInvalidDataException()
        {
            byte[] header = BitConverter.GetBytes(-5);
            using var testStream = new MemoryStream(header);

            await Assert.ThrowsAsync<InvalidDataException>(async () =>
            {
                await PipeFraming.ReadFrameAsync(testStream);
            });
        }

        [Fact]
        public async Task PipeFraming_ZeroLengthHeader_ThrowsInvalidDataException()
        {
            byte[] header = BitConverter.GetBytes(0);
            using var testStream = new MemoryStream(header);

            await Assert.ThrowsAsync<InvalidDataException>(async () =>
            {
                await PipeFraming.ReadFrameAsync(testStream);
            });
        }

        [Fact]
        public async Task PipeFraming_TruncatedHeader_ThrowsEndOfStreamException()
        {
            byte[] truncated = new byte[] { 0x01, 0x02 }; // only 2 bytes instead of 4
            using var testStream = new MemoryStream(truncated);

            await Assert.ThrowsAsync<EndOfStreamException>(async () =>
            {
                await PipeFraming.ReadFrameAsync(testStream);
            });
        }

        [Fact]
        public async Task PipeFraming_TruncatedPayload_ThrowsEndOfStreamException()
        {
            using var memoryStream = new MemoryStream();
            byte[] header = BitConverter.GetBytes(100);
            byte[] partialPayload = new byte[10];

            memoryStream.Write(header, 0, header.Length);
            memoryStream.Write(partialPayload, 0, partialPayload.Length);
            memoryStream.Position = 0;

            await Assert.ThrowsAsync<EndOfStreamException>(async () =>
            {
                await PipeFraming.ReadFrameAsync(memoryStream);
            });
        }
    }
}
