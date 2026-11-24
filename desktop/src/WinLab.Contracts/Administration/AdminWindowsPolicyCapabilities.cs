using System;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.Policies;
using WinLab.Contracts.Scanning;

namespace WinLab.Contracts.Administration;

internal sealed class AdminWindowsPolicyCapabilities
{
    private readonly Lazy<WindowsInfoDto> _windows = new(() => new SystemInfoScanner().ScanWindowsInfo());

    public (bool Supported, string Detail) Query(IPolicyHandler policy)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041) || !Environment.Is64BitProcess)
            return (false, "Requer WinLab de 64 bits em Windows 10 build 19041 ou posterior.");

        var windows = _windows.Value;
        string edition = windows.Edition;
        string platform = $"{edition} · build {windows.BuildNumber}";
        bool enterprise = edition.StartsWith("Enterprise", StringComparison.OrdinalIgnoreCase) ||
            edition.StartsWith("Education", StringComparison.OrdinalIgnoreCase) ||
            edition.StartsWith("IoTEnterprise", StringComparison.OrdinalIgnoreCase);
        bool managedEdition = enterprise || edition.StartsWith("Professional", StringComparison.OrdinalIgnoreCase);
        bool modernPolicy = OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22000) || windows.Ubr >= 1202;
        if (policy is DualBrowserPolicyHandler)
        {
            var chrome = WindowsPolicyCapabilities.Query("chrome");
            var edge = WindowsPolicyCapabilities.Query("edge");
            return (chrome.Supported && edge.Supported,
                $"{platform}. Esta política conjunta exige Chrome e Edge detectados em versões compatíveis.");
        }

        bool supported = policy.PolicyId switch
        {
            "apps.disable_microsoft_store" => enterprise,
            "personalization.lock_screen" or "network.lan_properties" or "system.task_manager" or "settings.hide_network_pages"
                => managedEdition && modernPolicy,
            _ => managedEdition
        };
        return (supported, $"{platform}. " + (supported
            ? "Requisitos de plataforma identificados. Confirme o efeito na sessão de destino."
            : "Compatibilidade com esta edição ou atualização do Windows não confirmada."));
    }
}
