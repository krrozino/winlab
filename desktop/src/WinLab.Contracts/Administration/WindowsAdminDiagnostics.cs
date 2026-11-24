using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Administration;

public sealed class WindowsAdminDiagnostics(IRegistryService registry)
{
    private const RegistryHiveType Machine = RegistryHiveType.LocalMachine;
    private const string SystemPolicies = @"SOFTWARE\Policies\Microsoft\Windows\System";
    private const string Explorer = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer";
    private const string CodeIntegrityPolicy = @"SYSTEM\CurrentControlSet\Control\CI\Policy";

    public static AdminManagementDto QueryManagement()
    {
        if (!OperatingSystem.IsWindows())
            return new("Inconclusive", "Inconclusive", "Inconclusive", "Inconclusive");

        string domain = GetDomainEvidence();
        string entra = GetEntraEvidence();
        string mdm = GetMdmEvidence();
        string status = domain == "Detected" || entra == "Detected" || mdm == "Detected" ? "Detected"
            : domain == "NotDetected" && entra == "NotDetected" && mdm == "NotDetected" ? "NotDetected"
            : "Inconclusive";
        return new(status, domain, entra, mdm);
    }

    public IReadOnlyList<AdminDiagnosticSignalDto> QuerySignals(AdminManagementDto management)
    {
        if (!OperatingSystem.IsWindows()) return [];

        var screenPolicy = registry.GetValue(Machine, SystemPolicies, "EnableSmartScreen");
        var screenSetting = registry.GetValue(Machine, Explorer, "SmartScreenEnabled");
        var smartScreen = new AdminDiagnosticSignalDto("windows.smartscreen", "Microsoft Defender SmartScreen",
            "Machine", screenPolicy switch
            {
                0 => "DisabledByPolicy",
                1 => "EnabledByPolicy",
                null => screenSetting switch { "RequireAdmin" => "RequireAdmin", "Prompt" => "Prompt", "Off" => "Off", _ => "Inconclusive" },
                _ => "Inconclusive"
            }, screenPolicy != null ? ExternalOrigin(management) : "Inconclusive", "NotVerified",
            "Observação da política ou preferência do Explorer. A reputação do arquivo e a decisão de execução não foram testadas.");

        var sacSetting = registry.GetValue(Machine, CodeIntegrityPolicy, "VerifiedAndReputablePolicyState");
        var smartAppControl = new AdminDiagnosticSignalDto("windows.smart_app_control", "Controle Inteligente de Aplicativos",
            "Machine", !OperatingSystem.IsWindowsVersionAtLeast(10, 0, 22621) ? "NotSupported" : sacSetting switch
            {
                0 => "Off",
                1 => "Enforced",
                2 => "Evaluation",
                _ => "Inconclusive"
            }, "Inconclusive", "NotVerified",
            "Estado configurado observado. A ausência do valor não confirma que a proteção esteja desligada.");

        string? directory = Path.GetDirectoryName(Environment.ProcessPath);
        return [smartScreen, smartAppControl, Signature(directory, "Desktop"), Signature(directory, "Executor")];
    }

    internal static string ExternalOrigin(AdminManagementDto management) =>
        management.Status == "NotDetected" ? "ExternalLocal" : "InstitutionalPossible";

    private static AdminDiagnosticSignalDto Signature(string? directory, string component)
    {
        string? path = directory == null ? null : Path.Combine(directory, $"WinLab.{component}.exe");
        string state = path == null || !File.Exists(path) ? "FileNotFound" : VerifyAuthenticode(path);
        return new($"winlab.signature.{component.ToLowerInvariant()}", $"Assinatura do WinLab {component}", "Machine",
            state, "None", state == "Trusted" ? "SignatureVerified" : "NotVerified",
            "Confiança Authenticode local para o executável observado. A verificação usa informações locais e não prova reputação SmartScreen ou autorização de execução.");
    }

    private static string GetDomainEvidence()
    {
        try
        {
            int result = NetGetJoinInformation(null, out var name, out var joinStatus);
            if (name != IntPtr.Zero) NetApiBufferFree(name);
            return result != 0 ? "Inconclusive" : joinStatus switch
            {
                3 => "Detected",
                1 or 2 => "NotDetected",
                _ => "Inconclusive"
            };
        }
        catch (Exception ex) when (MissingApi(ex)) { return "Inconclusive"; }
    }

    private static string GetEntraEvidence()
    {
        try
        {
            int result = NetGetAadJoinInformation(null, out var info);
            try
            {
                if (result != 0) return "Inconclusive";
                if (info == IntPtr.Zero) return "NotDetected";
                return Marshal.ReadInt32(info) is 1 or 2 ? "Detected" : "Inconclusive";
            }
            finally { if (info != IntPtr.Zero) NetFreeAadJoinInformation(info); }
        }
        catch (Exception ex) when (MissingApi(ex)) { return "Inconclusive"; }
    }

    private static string GetMdmEvidence()
    {
        try
        {
            int result = IsDeviceRegisteredWithManagement(out bool registered, 0, IntPtr.Zero);
            return result == 0 ? registered ? "Detected" : "NotDetected" : "Inconclusive";
        }
        catch (Exception ex) when (MissingApi(ex)) { return "Inconclusive"; }
    }

    private static bool MissingApi(Exception ex) => ex is DllNotFoundException or EntryPointNotFoundException;

    private static string VerifyAuthenticode(string path)
    {
        var action = new Guid("00AAC56B-CD44-11D0-8CC2-00C04FC295EE");
        IntPtr filePath = Marshal.StringToCoTaskMemUni(path);
        IntPtr info = Marshal.AllocCoTaskMem(Marshal.SizeOf<TrustFile>());
        var data = new TrustData
        {
            Size = (uint)Marshal.SizeOf<TrustData>(),
            UiChoice = 2,              // WTD_UI_NONE
            UnionChoice = 1,           // WTD_CHOICE_FILE
            File = info,
            StateAction = 1,           // WTD_STATEACTION_VERIFY
            ProviderFlags = 0x1000    // WTD_CACHE_ONLY_URL_RETRIEVAL
        };
        try
        {
            Marshal.StructureToPtr(new TrustFile { Size = (uint)Marshal.SizeOf<TrustFile>(), Path = filePath }, info, false);
            int result = WinVerifyTrust(new IntPtr(-1), ref action, ref data);
            return unchecked((uint)result) switch
            {
                0 => "Trusted",
                0x800B0100 => "SignatureNotFound",
                0x80096010 => "InvalidDigest",
                0x800B0101 or 0x800B0109 or 0x800B0111 => "NotTrusted",
                _ => "Inconclusive"
            };
        }
        catch (Exception ex) when (MissingApi(ex)) { return "Inconclusive"; }
        finally
        {
            if (data.StateData != IntPtr.Zero)
            {
                data.StateAction = 2; // WTD_STATEACTION_CLOSE
                WinVerifyTrust(new IntPtr(-1), ref action, ref data);
            }
            Marshal.FreeCoTaskMem(info);
            Marshal.FreeCoTaskMem(filePath);
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TrustFile
    {
        public uint Size;
        public IntPtr Path;
        public IntPtr Handle;
        public IntPtr KnownSubject;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct TrustData
    {
        public uint Size;
        public IntPtr PolicyCallback;
        public IntPtr SipClient;
        public uint UiChoice;
        public uint RevocationChecks;
        public uint UnionChoice;
        public IntPtr File;
        public uint StateAction;
        public IntPtr StateData;
        public IntPtr UrlReference;
        public uint ProviderFlags;
        public uint UiContext;
        public IntPtr SignatureSettings;
    }

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetGetJoinInformation(string? server, out IntPtr name, out int status);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetGetAadJoinInformation(string? tenantId, out IntPtr info);

    [DllImport("netapi32.dll")]
    private static extern void NetFreeAadJoinInformation(IntPtr info);

    [DllImport("netapi32.dll")]
    private static extern int NetApiBufferFree(IntPtr pointer);

    [DllImport("mdmregistration.dll")]
    private static extern int IsDeviceRegisteredWithManagement([MarshalAs(UnmanagedType.Bool)] out bool registered, uint length, IntPtr upn);

    [DllImport("wintrust.dll", ExactSpelling = true)]
    private static extern int WinVerifyTrust(IntPtr window, ref Guid action, ref TrustData data);
}
