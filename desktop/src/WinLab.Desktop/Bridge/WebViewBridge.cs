using System;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using WinLab.Agent.Mock;
using WinLab.Contracts;

namespace WinLab.Desktop.Bridge
{
    /// <summary>
    /// Ponte de comunicação entre o JavaScript do WebView2 e o mock de serviço IPC.
    /// Valida e filtra cada mensagem antes do despacho.
    /// </summary>
    public class WebViewBridge
    {
        private readonly MockAgentService _mockService;
        private readonly CoreWebView2 _coreWebView2;

        public WebViewBridge(CoreWebView2 coreWebView2, MockAgentService mockService)
        {
            _coreWebView2 = coreWebView2 ?? throw new ArgumentNullException(nameof(coreWebView2));
            _mockService = mockService ?? throw new ArgumentNullException(nameof(mockService));
        }

        public async Task HandleWebMessageReceivedAsync(string rawJson)
        {
            try
            {
                var response = await _mockService.HandleRequestAsync(rawJson);
                string responseJson = JsonSerializer.Serialize(response);
                _coreWebView2.PostWebMessageAsString(responseJson);
            }
            catch (Exception ex)
            {
                var errResponse = IpcResponse<object>.Fail(string.Empty, $"Internal bridge failure: {ex.Message}", "BRIDGE_EXCEPTION");
                _coreWebView2.PostWebMessageAsString(JsonSerializer.Serialize(errResponse));
            }
        }
    }
}
