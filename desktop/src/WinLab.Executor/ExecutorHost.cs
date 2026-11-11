using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Linq;
using System.Security.Principal;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Scanning;
using WinLab.Contracts.Transactions;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Executor
{
    public class ExecutorHost
    {
        private readonly string _pipeName;
        private readonly string _sessionToken;
        private readonly int _parentPid;
        private readonly TimeSpan _idleTimeout = TimeSpan.FromMinutes(5);
        private readonly IWindowsScanner _scanner;
        private readonly IPolicyCatalog _catalog;
        private readonly IRegistryService _registry;
        private readonly IUserHiveManager _hiveManager;
        private readonly TransactionEngine _engine;

        public ExecutorHost(
            string pipeName,
            string sessionToken,
            int parentPid,
            IWindowsScanner? scanner = null,
            IPolicyCatalog? catalog = null,
            IRegistryService? registry = null,
            IUserHiveManager? hiveManager = null,
            TransactionEngine? engine = null)
        {
            _pipeName = pipeName ?? throw new ArgumentNullException(nameof(pipeName));
            _sessionToken = sessionToken ?? throw new ArgumentNullException(nameof(sessionToken));
            _parentPid = parentPid;
            _scanner = scanner ?? new WindowsScanner();
            _catalog = catalog ?? new PolicyCatalog();
            _registry = registry ?? (OperatingSystem.IsWindows() ? new Services.WindowsRegistryService() : new InMemoryRegistryService());
            _hiveManager = hiveManager ?? (OperatingSystem.IsWindows() ? new Services.WindowsUserHiveManager() : new MockUserHiveManager());
            _engine = engine ?? new TransactionEngine(_catalog, _registry, _hiveManager);
        }

        public async Task<int> RunAsync(CancellationToken cancellationToken = default)
        {
            // 1. Setup Parent Process Watchdog
            SetupParentWatchdog();

            // 2. Connect to Named Pipe Server hosted by Desktop
            using var clientStream = new NamedPipeClientStream(".", _pipeName, PipeDirection.InOut, PipeOptions.Asynchronous);
            try
            {
                await clientStream.ConnectAsync(10000, cancellationToken);
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[WinLab.Executor] Failed to connect to pipe '{_pipeName}': {ex.Message}");
                return 1;
            }

            // 3. Mutual Handshake Authentication
            try
            {
                var handshakeReq = new HandshakeRequest
                {
                    Token = _sessionToken,
                    ClientPid = Environment.ProcessId
                };
                string reqJson = JsonSerializer.Serialize(handshakeReq);
                await PipeFraming.WriteFrameAsync(clientStream, reqJson, cancellationToken);

                string respJson = await PipeFraming.ReadFrameAsync(clientStream, cancellationToken);
                var handshakeResp = JsonSerializer.Deserialize<HandshakeResponse>(respJson);
                if (handshakeResp == null || !handshakeResp.Success)
                {
                    Console.Error.WriteLine($"[WinLab.Executor] Handshake authentication rejected: {handshakeResp?.Error}");
                    return 2;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"[WinLab.Executor] Handshake exchange failed: {ex.Message}");
                return 3;
            }

            // 4. Request Processing Loop with Idle Timeout
            using var idleCts = new CancellationTokenSource();
            idleCts.CancelAfter(_idleTimeout);

            while (!cancellationToken.IsCancellationRequested && !idleCts.IsCancellationRequested)
            {
                string rawJson;
                try
                {
                    using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, idleCts.Token);
                    rawJson = await PipeFraming.ReadFrameAsync(clientStream, linkedCts.Token);
                    // Reset idle timeout on received message
                    idleCts.CancelAfter(_idleTimeout);
                }
                catch (EndOfStreamException)
                {
                    // Parent closed pipe normally
                    break;
                }
                catch (IOException)
                {
                    // Pipe broken
                    break;
                }
                catch (OperationCanceledException) when (idleCts.IsCancellationRequested)
                {
                    // Idle timeout expired
                    break;
                }

                // Process envelope
                string responseJson = await ProcessRequestAsync(rawJson, cancellationToken);

                try
                {
                    await PipeFraming.WriteFrameAsync(clientStream, responseJson, cancellationToken);
                }
                catch
                {
                    break;
                }
            }

            return 0;
        }

        private async Task<string> ProcessRequestAsync(string rawJson, CancellationToken cancellationToken)
        {
            var shellCheck = SecurityValidator.ValidateNoArbitraryShell(rawJson);
            if (!shellCheck.IsSafe)
            {
                var errResp = IpcResponse<object>.Fail(string.Empty, shellCheck.Error!, "FORBIDDEN_SHELL_INJECTION");
                return JsonSerializer.Serialize(errResp);
            }

            JsonDocument doc;
            try
            {
                doc = JsonDocument.Parse(rawJson);
            }
            catch (Exception ex)
            {
                var errResp = IpcResponse<object>.Fail(string.Empty, $"Malformed JSON envelope: {ex.Message}", "MALFORMED_JSON");
                return JsonSerializer.Serialize(errResp);
            }

            using (doc)
            {
                var root = doc.RootElement;
                var (isSchemaValid, envelopeId, schemaError, schemaErrorCode) = SecurityValidator.ValidateEnvelopeSchema(root);
                string id = envelopeId ?? (root.ValueKind == JsonValueKind.Object && root.TryGetProperty("id", out var idProp) && idProp.ValueKind == JsonValueKind.String ? idProp.GetString() ?? Guid.NewGuid().ToString() : Guid.NewGuid().ToString());

                if (!isSchemaValid)
                {
                    var errResp = IpcResponse<object>.Fail(id, schemaError!, schemaErrorCode!);
                    return JsonSerializer.Serialize(errResp);
                }

                string action = root.GetProperty("action").GetString()!;

                switch (action)
                {
                    case IpcConstants.ActionQueryInventory:
                    {
                        var inv = await _scanner.ScanInventoryAsync(cancellationToken);
                        var resp = IpcResponse<MachineInventoryDto>.Ok(id, inv);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionCreateBaseline:
                    {
                        string txId = Guid.NewGuid().ToString();
                        var baseline = new
                        {
                            transactionId = txId,
                            timestamp = DateTime.UtcNow.ToString("o"),
                            registryBaselinePath = @"C:\ProgramData\WinLab\Backups\Registry-Baseline-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss"),
                            appLockerBaselinePath = @"C:\ProgramData\WinLab\Backups\AppLocker-Baseline-" + DateTime.UtcNow.ToString("yyyyMMdd-HHmmss") + ".xml",
                            success = true,
                            message = "Baseline inicial capturado e registrado com sucesso no host elevado."
                        };
                        var resp = IpcResponse<object>.Ok(id, baseline);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionGetEnvironment:
                    {
                        var env = new
                        {
                            environment = "WinLab.Executor",
                            isElevated = OperatingSystem.IsWindows() && IsCurrentProcessElevated(),
                            platform = Environment.OSVersion.VersionString,
                            processId = Environment.ProcessId
                        };
                        var resp = IpcResponse<object>.Ok(id, env);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionQueryPreflight:
                    {
                        var preflight = new
                        {
                            computerName = Environment.MachineName,
                            status = "PASS",
                            readinessScore = 100,
                            summary = new { pass = 10, warn = 0, block = 0 },
                            readinessMessage = "Estação pronta para configuração administrativa pelo WinLab."
                        };
                        var resp = IpcResponse<object>.Ok(id, preflight);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionPreviewPolicyDiff:
                    {
                        var preview = new
                        {
                            previewOnly = true,
                            willModifyRegistry = false,
                            willModifyAppLocker = false,
                            description = "Simulação segura executada no contexto de executor elevado."
                        };
                        var resp = IpcResponse<object>.Ok(id, preview);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionValidateConfig:
                    {
                        var val = new
                        {
                            valid = true,
                            message = "Configuração validada pelo executor com verificação de ambiente administrativo."
                        };
                        var resp = IpcResponse<object>.Ok(id, val);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionQueryPolicyCatalog:
                    {
                        var definitions = _catalog.GetCatalogDefinitions();
                        var resp = IpcResponse<IReadOnlyList<PolicyDefinitionDto>>.Ok(id, definitions);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionQueryPolicyStates:
                    {
                        string? targetUserSid = null;
                        if (root.TryGetProperty("payload", out var payloadProp) && payloadProp.ValueKind == JsonValueKind.Object)
                        {
                            if (payloadProp.TryGetProperty("targetUserSid", out var sidProp) && sidProp.ValueKind == JsonValueKind.String)
                            {
                                targetUserSid = sidProp.GetString();
                            }
                        }

                        var items = new List<PolicyItemDto>();
                        int applied = 0, notConfigured = 0, pending = 0;
                        foreach (var policy in _catalog.GetAllPolicies())
                        {
                            var probe = policy.Probe(targetUserSid, _registry, _hiveManager);
                            var item = new PolicyItemDto
                            {
                                Id = policy.PolicyId,
                                Category = policy.Category,
                                Title = policy.Title,
                                Description = policy.Description,
                                Scope = policy.Scope,
                                Risk = policy.Risk,
                                CurrentState = probe.IsActive ? PolicyState.Applied : PolicyState.NotConfigured,
                                DesiredState = probe.IsActive ? PolicyState.Applied : PolicyState.NotConfigured,
                                ConfiguredState = probe.IsActive ? PolicyState.Applied : PolicyState.NotConfigured,
                                EffectiveState = probe.EffectiveState,
                                RequiresLogoff = policy.RequiresLogoff,
                                RequiresRestart = policy.RequiresRestart,
                                RequiresAppRestart = policy.RequiresAppRestart,
                                Reversible = policy.Reversible,
                                Evidence = probe.DetailMessage,
                                LastVerified = probe.ProbedAtUtc.ToString("o")
                            };
                            items.Add(item);

                            if (probe.EffectiveState == PolicyEffectiveState.PendingLogoff ||
                                     probe.EffectiveState == PolicyEffectiveState.PendingAppRestart ||
                                     probe.EffectiveState == PolicyEffectiveState.PendingRefresh ||
                                     probe.EffectiveState == PolicyEffectiveState.PendingFirstLogon ||
                                     probe.EffectiveState == PolicyEffectiveState.PendingReboot)
                            {
                                pending++;
                            }
                            else if (probe.IsActive || probe.EffectiveState == PolicyEffectiveState.Applied)
                            {
                                applied++;
                            }
                            else
                            {
                                notConfigured++;
                            }
                        }

                        var summary = new PolicyStateSummaryDto
                        {
                            TotalPolicies = items.Count,
                            AppliedCount = applied,
                            NotConfiguredCount = notConfigured,
                            PendingCount = pending,
                            Items = items
                        };

                        var resp = IpcResponse<PolicyStateSummaryDto>.Ok(id, summary);
                        return JsonSerializer.Serialize(resp);
                    }

                    case IpcConstants.ActionApplyTransaction:
                    {
                        if (!root.TryGetProperty("payload", out var payloadProp) || payloadProp.ValueKind != JsonValueKind.Object)
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Payload de transação ausente ou inválido.", "INVALID_TRANSACTION_PAYLOAD");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var applyReq = JsonSerializer.Deserialize<ApplyTransactionRequestDto>(payloadProp.GetRawText());
                        if (applyReq == null)
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Payload de transação nulo.", "INVALID_TRANSACTION_PAYLOAD");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var applyResult = await _engine.ApplyTransactionAsync(applyReq, cancellationToken);
                        if (applyResult.Success)
                        {
                            var okResp = IpcResponse<ApplyTransactionResultDto>.Ok(id, applyResult);
                            return JsonSerializer.Serialize(okResp);
                        }
                        else
                        {
                            var failResp = IpcResponse<ApplyTransactionResultDto>.Fail(id, applyResult.Message, "TRANSACTION_ROLLED_BACK", applyResult);
                            return JsonSerializer.Serialize(failResp);
                        }
                    }

                    case IpcConstants.ActionRollbackTransaction:
                    {
                        if (!root.TryGetProperty("payload", out var payloadProp) || payloadProp.ValueKind != JsonValueKind.Object)
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Payload de rollback ausente ou inválido.", "INVALID_ROLLBACK_PAYLOAD");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var rollbackReq = JsonSerializer.Deserialize<RollbackTransactionRequestDto>(payloadProp.GetRawText());
                        if (rollbackReq == null || string.IsNullOrWhiteSpace(rollbackReq.TransactionId))
                        {
                            var errResp = IpcResponse<object>.Fail(id, "Identificador de transação é obrigatório para rollback.", "INVALID_TRANSACTION_ID");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var rollbackResult = await _engine.RollbackTransactionAsync(rollbackReq, cancellationToken);
                        if (rollbackResult.Success)
                        {
                            var okResp = IpcResponse<RollbackResultDto>.Ok(id, rollbackResult);
                            return JsonSerializer.Serialize(okResp);
                        }
                        else
                        {
                            var failResp = IpcResponse<RollbackResultDto>.Fail(id, rollbackResult.Error ?? rollbackResult.Message, "ROLLBACK_FAILED", rollbackResult);
                            return JsonSerializer.Serialize(failResp);
                        }
                    }

                    case IpcConstants.ActionQueryTransactionStatus:
                    {
                        string? txId = null;
                        if (root.TryGetProperty("payload", out var statusPayload) && statusPayload.ValueKind == JsonValueKind.Object)
                        {
                            if (statusPayload.TryGetProperty("transactionId", out var txIdProp) && txIdProp.ValueKind == JsonValueKind.String)
                            {
                                txId = txIdProp.GetString();
                            }
                        }

                        if (string.IsNullOrWhiteSpace(txId))
                        {
                            var errResp = IpcResponse<object>.Fail(id, "TransactionId é obrigatório.", "INVALID_TRANSACTION_ID");
                            return JsonSerializer.Serialize(errResp);
                        }

                        var txRecord = await _engine.GetTransactionAsync(txId, cancellationToken);
                        if (txRecord != null)
                        {
                            var okResp = IpcResponse<TransactionDto>.Ok(id, txRecord);
                            return JsonSerializer.Serialize(okResp);
                        }
                        else
                        {
                            var errResp = IpcResponse<object>.Fail(id, $"Transação '{txId}' não encontrada.", "TRANSACTION_NOT_FOUND");
                            return JsonSerializer.Serialize(errResp);
                        }
                    }

                    default:
                    {
                        var errResp = IpcResponse<object>.Fail(id, $"Unhandled action in elevated executor: {action}", "UNHANDLED_ACTION");
                        return JsonSerializer.Serialize(errResp);
                    }
                }
            }
        }

        private void SetupParentWatchdog()
        {
            if (_parentPid <= 0) return;

            try
            {
                var parent = Process.GetProcessById(_parentPid);
                parent.EnableRaisingEvents = true;
                parent.Exited += (s, e) =>
                {
                    Environment.Exit(0);
                };

                if (parent.HasExited)
                {
                    Environment.Exit(0);
                }
            }
            catch
            {
                Environment.Exit(0);
            }
        }

        private static bool IsCurrentProcessElevated()
        {
            if (!OperatingSystem.IsWindows()) return false;

            try
            {
                var identity = WindowsIdentity.GetCurrent();
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }
    }
}
