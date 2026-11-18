using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Velopack;
using Velopack.Sources;
using WinLab.Contracts;
using WinLab.Contracts.Scanning;

namespace WinLab.Desktop.Services
{
    /// <summary>
    /// Em instalações Velopack, verifica atualizações estáveis publicadas no GitHub (ou em WINLAB_UPDATE_FEED).
    /// Baixa silenciosamente e deixa a aplicação para o próximo início, sem interromper aulas ativas.
    /// Instalações Inno Setup e builds portáteis continuam funcionando sem feed e expõem diagnóstico transparente do canal.
    /// </summary>
    public static class DesktopUpdateService
    {
        private static int _started;

        public static void Start()
        {
            var ver = typeof(DesktopUpdateService).Assembly.GetName().Version;
            if (ver != null)
            {
                UpdateChannelInspector.SetRuntimeVersion($"{ver.Major}.{ver.Minor}.{Math.Max(0, ver.Build)}");
            }

            if (Interlocked.Exchange(ref _started, 1) != 0) return;

            _ = Task.Run(async () =>
            {
                while (true)
                {
                    await CheckAndDownloadAsync();
                    await Task.Delay(TimeSpan.FromHours(6));
                }
            });
        }

        public static UpdateStatusDto GetStatusSnapshot(
            string? baseDirectoryOverride = null,
            string? programFilesOverride = null,
            string? localAppDataOverride = null) =>
            UpdateChannelInspector.GetStatusSnapshot(baseDirectoryOverride, programFilesOverride, localAppDataOverride);

        private static async Task CheckAndDownloadAsync()
        {
            try
            {
                string feedUrl = UpdateChannelInspector.GetConfiguredFeedUrl();
                IUpdateSource source = feedUrl.StartsWith("file:", StringComparison.OrdinalIgnoreCase)
                    ? new SimpleFileSource(new DirectoryInfo(new Uri(feedUrl).LocalPath))
                    : new GithubSource(feedUrl, null, false);

                // Apenas releases estáveis do projeto; nunca PRs ou artefatos de CI.
                var manager = new UpdateManager(source);
                if (!manager.IsInstalled)
                {
                    UpdateChannelInspector.RecordCheckState("FeedUnavailable");
                    return;
                }

                var update = await manager.CheckForUpdatesAsync();
                if (update == null)
                {
                    UpdateChannelInspector.RecordCheckState("UpToDate");
                    return;
                }

                // Integridade e seleção da versão são gerenciadas pelo Velopack.
                await manager.DownloadUpdatesAsync(update);
                UpdateChannelInspector.RecordCheckState(
                    "UpdateDownloaded",
                    update.TargetFullRelease?.Version?.ToString());
                // VelopackApp.Build().Run() instalará a versão no próximo início
                // para não interromper aulas nem apagar trabalhos não salvos.
                Debug.WriteLine("[WinLab] Atualização transferida para aplicação no próximo início.");
            }
            catch (Exception error)
            {
                UpdateChannelInspector.RecordCheckState("FeedUnavailable");
                // Instalação Inno/portátil, modo offline, rate limit ou feed ainda inexistente.
                // Nunca bloqueia a execução normal do computador.
                Debug.WriteLine("[WinLab] Verificação de atualização indisponível: " + error.Message);
            }
        }
    }
}
