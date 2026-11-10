using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using WinLab.Agent.Mock;
using WinLab.Desktop.Bridge;

namespace WinLab.Desktop
{
    public partial class MainWindow : Window
    {
        private readonly MockAgentService _mockService = new MockAgentService();
        private WebViewBridge? _bridge;

        public MainWindow()
        {
            InitializeComponent();
            Loaded += MainWindow_Loaded;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            try
            {
                StatusText.Text = "Inicializando ambiente isolado do WebView2...";

                // Inicializa CoreWebView2 com perfil e dados locais dedicados em AppData do usuário
                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "WinLab",
                    "WebView2Data"
                );

                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await WebView.EnsureCoreWebView2Async(env);

                // Configurações de segurança do WebView2
                WebView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                WebView.CoreWebView2.Settings.AreDevToolsEnabled = true; // Habilitado para inspeção técnica
                WebView.CoreWebView2.Settings.IsWebMessageEnabled = true;

                // Inicializa ponte IPC
                _bridge = new WebViewBridge(WebView.CoreWebView2, _mockService);
                WebView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                // Mapeamento de virtual host para pasta de assets estáticos offline
                string assetsDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
                if (Directory.Exists(assetsDirectory))
                {
                    WebView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                        "winlab.local",
                        assetsDirectory,
                        CoreWebView2HostResourceAccessKind.Allow
                    );
                    WebView.CoreWebView2.Navigate("https://winlab.local/desktop/index.html");
                }
                else
                {
                    // Fallback para desenvolvimento local: navega para página local de desenvolvimento
                    WebView.CoreWebView2.Navigate("http://localhost:3000/desktop");
                }

                StatusText.Text = "WinLab Desktop ativo. Conectado ao Mock Agent (Shell Não-Privilegiado).";
            }
            catch (Exception ex)
            {
                StatusText.Text = $"Falha ao inicializar WebView2: {ex.Message}";
                MessageBox.Show(
                    $"Não foi possível carregar o componente WebView2.\nDetalhes: {ex.Message}\n\nCertifique-se de que o Microsoft Edge WebView2 Runtime está instalado no sistema.",
                    "WinLab Desktop — Erro de Inicialização",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error
                );
            }
        }

        private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (_bridge != null)
            {
                string rawMessage = e.TryGetWebMessageAsString();
                await _bridge.HandleWebMessageReceivedAsync(rawMessage);
            }
        }
    }
}
