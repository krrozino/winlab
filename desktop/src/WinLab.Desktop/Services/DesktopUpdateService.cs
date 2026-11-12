using System;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using Velopack;
using Velopack.Sources;

namespace WinLab.Desktop.Services
{
    /// <summary>
    /// Em instalações Velopack, verifica atualizações estáveis publicadas no GitHub.
    /// Baixa silenciosamente e deixa a aplicação para o próximo início.
    /// Instalações Inno e builds de desenvolvimento continuam funcionando sem feed.
    /// </summary>
    internal static class DesktopUpdateService
    {
        private static int _started;
        private static readonly Uri ReleaseRepository = new("https://github.com/krrozino/winlab");

        public static void Start()
        {
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

        private static async Task CheckAndDownloadAsync()
        {
            try
            {
                // Apenas releases estáveis do projeto; nunca PRs ou artefatos de CI.
                var manager = new UpdateManager(new GithubSource(ReleaseRepository.AbsoluteUri, null, false));
                var update = await manager.CheckForUpdatesAsync();
                if (update == null) return;

                // Integridade e seleção da versão são gerenciadas pelo Velopack.
                await manager.DownloadUpdatesAsync(update);
                // VelopackApp.Build().Run() instalará a versão no próximo início
                // para não interromper aulas nem apagar trabalhos não salvos.
                Debug.WriteLine("[WinLab] Atualização transferida para aplicação no próximo início.");
            }
            catch (Exception error)
            {
                // Instalação Inno/portátil, modo offline, rate limit ou feed ainda inexistente.
                // Nunca bloqueia a execução normal do computador.
                Debug.WriteLine("[WinLab] Verificação de atualização indisponível: " + error.Message);
            }
        }
    }
}
