using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Desktop.Services
{
    /// <summary>
    /// Cliente para o executor elevado (WinLab.Executor).
    /// Gerencia o ciclo de vida do processo elevado sob UAC, autenticação mútua por token efêmero de 256 bits
    /// e validação estrita de PID no kernel do Windows via Named Pipes.
    /// </summary>
    public class ElevatedExecutorClient : IAgentService, IDisposable
    {
        public bool IsRunning => _serverStream != null && _serverStream.IsConnected;
        public string ExecutionMode => "Elevated Windows Executor (Real)";

        private NamedPipeServerStream? _serverStream;
        private Process? _executorProcess;
        private readonly SemaphoreSlim _lock = new SemaphoreSlim(1, 1);
        private bool _isDisposed;

        [DllImport("kernel32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool GetNamedPipeClientProcessId(SafeHandle Pipe, out uint ClientProcessId);

        public async Task<IpcResponse<object>> HandleRequestAsync(string rawJson)
        {
            await _lock.WaitAsync();
            try
            {
                var connectionResult = await EnsureConnectedAsync();
                if (!connectionResult.Success)
                {
                    return IpcResponse<object>.Fail(string.Empty, connectionResult.Error ?? "Falha na conexão com executor elevado.", connectionResult.ErrorCode ?? "ELEVATOR_CONNECT_FAILED");
                }

                await PipeFraming.WriteFrameAsync(_serverStream!, rawJson);
                string responseJson = await PipeFraming.ReadFrameAsync(_serverStream!);
                var response = JsonSerializer.Deserialize<IpcResponse<object>>(responseJson);
                return response ?? IpcResponse<object>.Fail(string.Empty, "Resposta vazia do executor.", "EMPTY_RESPONSE");
            }
            catch (Exception ex)
            {
                Disconnect();
                return IpcResponse<object>.Fail(string.Empty, $"Erro de comunicação com executor elevado: {ex.Message}", "EXECUTOR_COMMUNICATION_ERROR");
            }
            finally
            {
                _lock.Release();
            }
        }

        public async Task<(bool Success, string? Error, string? ErrorCode)> EnsureConnectedAsync(CancellationToken cancellationToken = default)
        {
            if (_serverStream != null && _serverStream.IsConnected && _executorProcess != null && !_executorProcess.HasExited)
            {
                return (true, null, null);
            }

            Disconnect();

            string pipeId = Guid.NewGuid().ToString("N");
            string pipeName = $"WinLab_Exec_{pipeId}";

            // Generate 256-bit crypto session token
            byte[] secretBytes = new byte[32];
            using (var rng = RandomNumberGenerator.Create())
            {
                rng.GetBytes(secretBytes);
            }
            string sessionToken = Convert.ToHexString(secretBytes);

            try
            {
                // Create named pipe server stream
                _serverStream = new NamedPipeServerStream(
                    pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous
                );

                string exePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "WinLab.Executor.exe");
                if (!File.Exists(exePath))
                {
                    // Fallback para desenvolvimento / testes
                    string altPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "WinLab.Executor", "WinLab.Executor.exe");
                    if (File.Exists(altPath)) exePath = altPath;
                }

                var startInfo = new ProcessStartInfo
                {
                    FileName = exePath,
                    Arguments = $"--pipe \"{pipeName}\" --token \"{sessionToken}\" --parent-pid {Environment.ProcessId}",
                    UseShellExecute = true,
                    Verb = OperatingSystem.IsWindows() ? "runas" : string.Empty,
                    WindowStyle = ProcessWindowStyle.Hidden,
                    CreateNoWindow = true
                };

                try
                {
                    _executorProcess = Process.Start(startInfo);
                }
                catch (Win32Exception w32Ex) when (w32Ex.NativeErrorCode == 1223) // ERROR_CANCELLED
                {
                    Disconnect();
                    return (false, "Elevação UAC cancelada pelo operador.", "UAC_ELEVATION_CANCELLED");
                }
                catch (Win32Exception w32Ex)
                {
                    Disconnect();
                    return (false, $"Falha ao iniciar processo elevado: {w32Ex.Message} (código {w32Ex.NativeErrorCode})", "UAC_ELEVATION_FAILED");
                }

                if (_executorProcess == null)
                {
                    Disconnect();
                    return (false, "Processo executor não pôde ser instanciado.", "EXECUTOR_SPAWN_FAILED");
                }

                // Wait for client connection with 45s timeout (accounting for user typing admin credentials)
                using var waitCts = new CancellationTokenSource(TimeSpan.FromSeconds(45));
                using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, waitCts.Token);

                await _serverStream.WaitForConnectionAsync(linkedCts.Token);

                // Mutual PID check via kernel API on Windows
                if (OperatingSystem.IsWindows())
                {
                    if (GetNamedPipeClientProcessId(_serverStream.SafePipeHandle, out uint clientPid))
                    {
                        if (clientPid != (uint)_executorProcess.Id)
                        {
                            Disconnect();
                            return (false, $"Incompatibilidade de PID no canal nomeado (esperado: {_executorProcess.Id}, recebido: {clientPid}). Abortando por segurança.", "AUTH_FAILED_PID_MISMATCH");
                        }
                    }
                }

                // Handshake authentication
                string reqJson = await PipeFraming.ReadFrameAsync(_serverStream, linkedCts.Token);
                var handshakeReq = JsonSerializer.Deserialize<HandshakeRequest>(reqJson);

                if (handshakeReq == null)
                {
                    Disconnect();
                    return (false, "Handshake nulo recebido.", "AUTH_FAILED");
                }

                byte[] expectedBytes = System.Text.Encoding.UTF8.GetBytes(sessionToken);
                byte[] actualBytes = System.Text.Encoding.UTF8.GetBytes(handshakeReq.Token ?? string.Empty);

                bool tokenValid = CryptographicOperations.FixedTimeEquals(expectedBytes, actualBytes);
                bool pidValid = handshakeReq.ClientPid == _executorProcess.Id;

                if (!tokenValid || !pidValid)
                {
                    var failResp = new HandshakeResponse { Success = false, Error = "AUTH_FAILED", ServerPid = Environment.ProcessId };
                    try { await PipeFraming.WriteFrameAsync(_serverStream, JsonSerializer.Serialize(failResp), linkedCts.Token); } catch { }
                    Disconnect();
                    return (false, "Token de autenticação ou PID incorreto.", "AUTH_FAILED");
                }

                var successResp = new HandshakeResponse { Success = true, ServerPid = Environment.ProcessId };
                await PipeFraming.WriteFrameAsync(_serverStream, JsonSerializer.Serialize(successResp), linkedCts.Token);

                return (true, null, null);
            }
            catch (OperationCanceledException)
            {
                Disconnect();
                return (false, "Tempo limite esgotado aguardando autorização administrativa do Windows.", "UAC_TIMEOUT");
            }
            catch (Exception ex)
            {
                Disconnect();
                return (false, $"Falha no estabelecimento do canal seguro: {ex.Message}", "PIPE_ESTABLISH_FAILED");
            }
        }

        public void Disconnect()
        {
            try
            {
                if (_serverStream != null)
                {
                    if (_serverStream.IsConnected)
                    {
                        _serverStream.Disconnect();
                    }
                    _serverStream.Dispose();
                }
            }
            catch { }
            finally
            {
                _serverStream = null;
            }

            try
            {
                if (_executorProcess != null && !_executorProcess.HasExited)
                {
                    _executorProcess.Kill();
                    _executorProcess.Dispose();
                }
            }
            catch { }
            finally
            {
                _executorProcess = null;
            }
        }

        public void Dispose()
        {
            if (_isDisposed) return;
            _isDisposed = true;
            Disconnect();
            _lock.Dispose();
        }
    }
}
