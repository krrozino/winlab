using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using WinLab.Contracts.Scanning;

namespace WinLab.Contracts.Expansion;

public static class WindowsPolicyCapabilities
{
    public static (bool Supported, string Detail) Query(string target)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041) || !Environment.Is64BitProcess)
            return (false, "Requer WinLab de 64 bits em Windows 10 build 19041 ou posterior.");

        var info = new SystemInfoScanner().ScanWindowsInfo();
        string platform = $"{info.Edition} · Windows {info.Version}";
        if (target == "usb")
        {
            bool supported = info.Edition.StartsWith("Professional", StringComparison.OrdinalIgnoreCase)
                || info.Edition.StartsWith("Enterprise", StringComparison.OrdinalIgnoreCase)
                || info.Edition.StartsWith("Education", StringComparison.OrdinalIgnoreCase)
                || info.Edition.StartsWith("IoTEnterprise", StringComparison.OrdinalIgnoreCase);
            return (supported && (OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000) || info.Ubr >= 1202),
                $"{platform}. Política para discos removíveis reconhecidos pelo Windows, incluindo contas administrativas.");
        }

        if (target == "apps")
        {
            int.TryParse(info.BuildNumber, out int build);
            int revision = info.Ubr ?? 0;
            bool supported = build >= 22631 || (build == 22621 && revision >= 608)
                || (build == 22000 && revision >= 1165)
                || (build is >= 19041 and <= 19045 && revision >= 2075)
                || (build is >= 19041 and <= 19045 && (info.Edition.StartsWith("Enterprise", StringComparison.OrdinalIgnoreCase)
                    || info.Edition.StartsWith("Education", StringComparison.OrdinalIgnoreCase)));
            return (supported, supported ? platform : $"{platform}. Suporte ao AppLocker local não confirmado para este build/edição.");
        }

        var browser = new InstalledSoftwareScanner().ScanCatalogApps().FirstOrDefault(app => app.Id == target);
        if (browser == null || !browser.Detected)
            return (false, $"{platform}. Navegador não detectado.");
        try
        {
            int major = FileVersionInfo.GetVersionInfo(browser.Path).FileMajorPart;
            return major >= (target == "edge" ? 77 : 86)
                ? (true, $"{platform} · navegador versão {major}. Confirme a política efetiva após reiniciar. Gerenciamento corporativo e extensões forçadas podem ter precedência."
                    + (target == "edge" ? " Perfis conectados a contas pessoais Microsoft podem ignorar as listas de sites." : ""))
                : (false, $"{platform}. Versão do navegador incompatível ou não identificada.");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.ComponentModel.Win32Exception)
        {
            return (false, $"{platform}. Versão do navegador não identificada.");
        }
    }
}
