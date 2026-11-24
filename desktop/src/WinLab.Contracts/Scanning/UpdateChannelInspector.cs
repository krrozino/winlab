using System;
using System.IO;

namespace WinLab.Contracts.Scanning
{
    /// <summary>
    /// Inspetor puro e multiplataforma do canal de instalação (Velopack, InnoSetup ou Portable),
    /// versão de pré-lançamento e coexistência de instaladores legados.
    /// </summary>
    public static class UpdateChannelInspector
    {
        public const string DefaultReleaseRepositoryUrl = "https://github.com/krrozino/winlab";
        public const string FallbackVersion = "0.9.2";

        private static string? _lastCheckedAt;
        private static string _lastCheckState = "Idle";
        private static string? _pendingVersion;
        private static string _runtimeVersion = FallbackVersion;

        public static void SetRuntimeVersion(string version)
        {
            if (!string.IsNullOrWhiteSpace(version))
            {
                _runtimeVersion = version.Trim();
            }
        }

        public static void RecordCheckState(string state, string? pendingVersion = null, string? checkedAtIso = null)
        {
            _lastCheckedAt = checkedAtIso ?? DateTime.UtcNow.ToString("o");
            _lastCheckState = state;
            if (pendingVersion != null)
            {
                _pendingVersion = pendingVersion;
            }
        }

        public static string GetConfiguredFeedUrl()
        {
            string? customFeed = Environment.GetEnvironmentVariable("WINLAB_UPDATE_FEED");
            if (!string.IsNullOrWhiteSpace(customFeed) &&
                Uri.TryCreate(customFeed.Trim(), UriKind.Absolute, out var customUri) &&
                (string.Equals(customUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
                 customUri.IsFile))
            {
                return customUri.AbsoluteUri;
            }

            return DefaultReleaseRepositoryUrl;
        }

        public static UpdateStatusDto GetStatusSnapshot(
            string? baseDirectoryOverride = null,
            string? programFilesOverride = null,
            string? localAppDataOverride = null)
        {
            string baseDir = (baseDirectoryOverride ?? AppDomain.CurrentDomain.BaseDirectory)
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);

            string? parentDir = null;
            try
            {
                parentDir = Directory.GetParent(baseDir)?.FullName;
            }
            catch
            {
                parentDir = null;
            }

            bool hasVelopackUpdater = !string.IsNullOrEmpty(parentDir) &&
                File.Exists(Path.Combine(parentDir, "Update.exe"));
            bool hasInnoUninstaller = File.Exists(Path.Combine(baseDir, "unins000.exe"));

            string installChannel = hasVelopackUpdater
                ? "Velopack"
                : hasInnoUninstaller
                    ? "InnoSetup"
                    : "Portable";

            string programFiles = programFilesOverride
                ?? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string localAppData = localAppDataOverride
                ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            bool coexistingLegacy = false;
            if (installChannel == "Velopack" && !string.IsNullOrWhiteSpace(programFiles))
            {
                coexistingLegacy = File.Exists(Path.Combine(programFiles, "WinLab", "unins000.exe"));
            }
            else if (installChannel == "InnoSetup" && !string.IsNullOrWhiteSpace(localAppData))
            {
                coexistingLegacy = File.Exists(Path.Combine(localAppData, "WinLab.Desktop", "Update.exe"));
            }

            string channelSummary = installChannel switch
            {
                "Velopack" => _pendingVersion != null
                    ? $"Canal auto-atualizável (Velopack): versão {_pendingVersion} transferida e pronta para aplicar no próximo início."
                    : "Canal auto-atualizável (Velopack): verifica releases estáveis sem interromper sessões de aula.",
                "InnoSetup" => "Instalador fixo por máquina (Inno Setup em Program Files): atualizações são aplicadas manualmente pelo instalador institucional.",
                _ => "Execução portátil / desenvolvimento: atualizações automáticas desativadas neste diretório."
            };

            if (coexistingLegacy)
            {
                channelSummary += " Atenção: foi detectada coexistência entre instalação Inno Setup e instalação Velopack neste computador; remova a instalação antiga em Aplicativos Instalados para evitar atalhos duplicados.";
            }

            return new UpdateStatusDto
            {
                CurrentVersion = _runtimeVersion,
                InstallChannel = installChannel,
                AutoUpdateSupported = installChannel == "Velopack",
                FeedUrl = GetConfiguredFeedUrl(),
                LastCheckedAt = _lastCheckedAt,
                LastCheckState = _lastCheckState,
                PendingVersion = _pendingVersion,
                CoexistingLegacyInstallDetected = coexistingLegacy,
                ChannelSummary = channelSummary
            };
        }
    }
}
