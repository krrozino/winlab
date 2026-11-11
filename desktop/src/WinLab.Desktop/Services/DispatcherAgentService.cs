using System;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Agent.Mock;
using WinLab.Contracts;

namespace WinLab.Desktop.Services
{
    /// <summary>
    /// Despachante inteligente de agente para WinLab.Desktop.
    /// Permite alternar perfeitamente entre Modo Demonstração (MockAgentService) e
    /// Modo Computador Real (RealAgentService), com isolamento estrito de dados e zero masquerade.
    /// </summary>
    public class DispatcherAgentService : IAgentService
    {
        private readonly MockAgentService _mockService;
        private readonly RealAgentService _realService;
        private string _activeMode = "Demo"; // "Demo" or "Real"

        public DispatcherAgentService(MockAgentService? mockService = null, RealAgentService? realService = null)
        {
            _mockService = mockService ?? new MockAgentService();
            _realService = realService ?? new RealAgentService();
        }

        public bool IsRunning => true;
        public string ExecutionMode => _activeMode == "Real" ? _realService.ExecutionMode : _mockService.ExecutionMode;
        public string ActiveMode => _activeMode;

        public void SetMode(string mode)
        {
            _activeMode = string.Equals(mode, "Real", StringComparison.OrdinalIgnoreCase) ? "Real" : "Demo";
        }

        public async Task<IpcResponse<object>> HandleRequestAsync(string rawJson)
        {
            // Intercepta requisições de alternância de modo
            try
            {
                using var doc = JsonDocument.Parse(rawJson);
                var root = doc.RootElement;
                if (root.TryGetProperty("action", out var actionProp))
                {
                    string action = actionProp.GetString() ?? string.Empty;
                    if (string.Equals(action, "mode.set", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(action, "system.set_mode", StringComparison.OrdinalIgnoreCase))
                    {
                        if (root.TryGetProperty("payload", out var payloadProp) && payloadProp.TryGetProperty("mode", out var modeProp))
                        {
                            SetMode(modeProp.GetString() ?? "Demo");
                        }
                        string reqId = root.TryGetProperty("id", out var idProp) ? idProp.GetString() ?? Guid.NewGuid().ToString() : Guid.NewGuid().ToString();
                        return IpcResponse<object>.Ok(reqId, new { mode = _activeMode });
                    }
                }
            }
            catch { }

            if (string.Equals(_activeMode, "Real", StringComparison.OrdinalIgnoreCase))
            {
                return await _realService.HandleRequestAsync(rawJson);
            }
            else
            {
                return await _mockService.HandleRequestAsync(rawJson);
            }
        }
    }
}
