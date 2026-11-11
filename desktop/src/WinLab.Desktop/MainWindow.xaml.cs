using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using WinLab.Desktop.Bridge;
using WinLab.Desktop.Services;

namespace WinLab.Desktop
{
    public partial class MainWindow : Window
    {
        private readonly DispatcherAgentService _agentService = new DispatcherAgentService();
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
                WebView.CoreWebView2.Settings.IsWebMessageEnabled = true;

#if DEBUG
                WebView.CoreWebView2.Settings.AreDevToolsEnabled = true; // Habilitado apenas para depuração técnica em desenvolvimento
                WebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
#else
                WebView.CoreWebView2.Settings.AreDevToolsEnabled = false; // Desabilitado em builds de distribuição/Release
                WebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false; // Desabilita menu de contexto para evitar acesso a ferramentas de inspeção
#endif

                // Restrição de navegação: cancela qualquer navegação fora da origem autorizada
                WebView.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
                WebView.CoreWebView2.NewWindowRequested += (s, args) => args.Handled = true;

                // Inicializa ponte IPC
                _bridge = new WebViewBridge(WebView.CoreWebView2, _agentService);
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
#if DEBUG
                    // Fallback para desenvolvimento local: navega para página local de desenvolvimento
                    WebView.CoreWebView2.Navigate("http://localhost:3000/desktop");
#else
                    // Em Release, ausência de wwwroot é erro fatal de distribuição
                    StatusText.Text = "Erro crítico: diretório de ativos offline (wwwroot) não encontrado.";
                    MessageBox.Show(
                        "O pacote do WinLab Desktop está incompleto ou corrompido.\nO diretório 'wwwroot' com os arquivos da interface offline não foi encontrado na instalação.",
                        "WinLab Desktop — Erro de Integridade",
                        MessageBoxButton.OK,
                        MessageBoxImage.Error
                    );
                    Close();
                    return;
#endif
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

        private void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (string.IsNullOrEmpty(e.Uri))
            {
                e.Cancel = true;
                return;
            }

            bool isAllowed = e.Uri.StartsWith("https://winlab.local/", StringComparison.OrdinalIgnoreCase) ||
                             string.Equals(e.Uri, "https://winlab.local", StringComparison.OrdinalIgnoreCase);

#if DEBUG
            if (!isAllowed && (e.Uri.StartsWith("http://localhost:3000/", StringComparison.OrdinalIgnoreCase) ||
                               string.Equals(e.Uri, "http://localhost:3000", StringComparison.OrdinalIgnoreCase)))
            {
                isAllowed = true;
            }
#endif

            if (!isAllowed)
            {
                e.Cancel = true;
            }
        }

        private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            // Validação estrita de origem: aceita mensagens apenas da origem autorizada https://winlab.local
            string source = e.Source ?? string.Empty;
            bool isAuthorized = source.StartsWith("https://winlab.local/", StringComparison.OrdinalIgnoreCase) || string.Equals(source, "https://winlab.local", StringComparison.OrdinalIgnoreCase);

#if DEBUG
            if (!isAuthorized && source.StartsWith("http://localhost:3000", StringComparison.OrdinalIgnoreCase))
            {
                isAuthorized = true;
            }
#endif

            if (!isAuthorized)
            {
                // Rejeita qualquer mensagem proveniente de origem não autorizada
                return;
            }

            if (_bridge != null)
            {
                string rawMessage = e.TryGetWebMessageAsString();
                await _bridge.HandleWebMessageReceivedAsync(rawMessage);
            }
        }
    }
}
