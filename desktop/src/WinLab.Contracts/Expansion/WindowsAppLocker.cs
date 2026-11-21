using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Scanning;

namespace WinLab.Contracts.Expansion;

public sealed class WindowsAppLocker(IWindowsScanner scanner) : IAppLockerAuditBackend
{
    private const string Managed = "O gerenciamento por domínio, Microsoft Entra ou MDM está ativo ou não pôde ser descartado.";
    private const string ReadScript = """
        $local = AppLocker\Get-AppLockerPolicy -Local -Xml
        $effective = AppLocker\Get-AppLockerPolicy -Effective -Xml
        $running = (Get-Service -Name AppIDSvc).Status -eq 'Running'
        @{local=$local; effective=$effective; running=$running} | ConvertTo-Json -Compress
        """;
    private const string WriteScript = """
        $local = AppLocker\Get-AppLockerPolicy -Local -Xml
        $effective = AppLocker\Get-AppLockerPolicy -Effective -Xml
        function Get-PolicyHash([string] $xml) {
            $sha = [Security.Cryptography.SHA256]::Create()
            try { [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($xml))).Replace('-', '') }
            finally { $sha.Dispose() }
        }
        if ((Get-PolicyHash $local) -cne $env:WINLAB_APPL_LOCAL -or (Get-PolicyHash $effective) -cne $env:WINLAB_APPL_EFFECTIVE) {
            throw 'A política AppLocker mudou durante a operação.'
        }
        AppLocker\Set-AppLockerPolicy -XmlPolicy $env:WINLAB_APPL_XML -Confirm:$false
        """;

    public async Task<AppLockerObservation> ReadAsync(CancellationToken ct)
    {
        var (supported, detail) = WindowsPolicyCapabilities.Query("apps");
        if (!supported || !OperatingSystem.IsWindows()) return new("", "", false, detail);
        try
        {
            bool unmanaged = IsUnmanaged();
            using var doc = JsonDocument.Parse(await RunAsync(ReadScript, null, null, ct));
            var json = doc.RootElement;
            bool running = json.GetProperty("running").GetBoolean();
            string local = json.GetProperty("local").GetString()!;
            string effective = json.GetProperty("effective").GetString()!;
            bool ready = unmanaged && running && !string.IsNullOrWhiteSpace(local) && !string.IsNullOrWhiteSpace(effective);
            return new(local, effective, ready, !unmanaged ? Managed
                : !running ? $"{detail}. Serviço Identidade do Aplicativo (AppIDSvc) parado. A auditoria exige o serviço ativo."
                : $"{detail}. AppIDSvc ativo, cmdlets locais disponíveis.");
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or UnauthorizedAccessException
            or System.ComponentModel.Win32Exception or JsonException or DllNotFoundException or EntryPointNotFoundException
            or OperationCanceledException && !ct.IsCancellationRequested)
        {
            return new("", "", false, $"{detail}. Não foi possível consultar o AppLocker e o serviço AppIDSvc.");
        }
    }

    public async Task<AppLockerSelection[]> ResolveSelectionsAsync(ExpansionPlan[] plans, CancellationToken ct)
    {
        var inventory = await scanner.ScanInventoryAsync(ct);
        var localSids = inventory.LocalUsers.Select(candidate => candidate.Sid)
            .Where(IsCanonicalSid).Select(candidate => candidate!).Distinct().Order(StringComparer.Ordinal).ToArray();
        return plans.Select(plan =>
        {
            var user = inventory.LocalUsers.SingleOrDefault(candidate => candidate.Sid == plan.Sid);
            ExpansionEngine.Ensure(user is { Enabled: true, IsAdmin: false, PrivilegeClassification: AccountPrivilegeClassification.StandardUser },
                "A conta deve ser local, comum, ativa e com privilégios confirmados.");
            var paths = !plan.AuditExecutables ? Array.Empty<string>() : plan.Apps.Select(id =>
            {
                var app = inventory.DetectedApps.SingleOrDefault(candidate => candidate.Id == id);
                if (app is not { Detected: true } || !IsMachineInstall(app.Path))
                    throw new InvalidOperationException($"O preset {id} exige a instalação detectável em Program Files.");
                return app.Path;
            }).ToArray();
            return new AppLockerSelection(plan.Sid!, paths, localSids);
        }).ToArray();
    }

    private static bool IsCanonicalSid(string? sid) =>
        sid != null && sid.StartsWith("S-1-5-21-", StringComparison.Ordinal) && sid.Length <= 68 &&
        sid.AsSpan(9).ToString().Split('-') is { Length: 4 } parts && parts.All(part => uint.TryParse(part, out _));

    private static bool IsMachineInstall(string path)
    {
        if (!OperatingSystem.IsWindows() || !Path.IsPathFullyQualified(path) || !File.Exists(path) ||
            !string.Equals(Path.GetExtension(path), ".exe", StringComparison.OrdinalIgnoreCase)) return false;
        string fullPath = Path.GetFullPath(path);
        return new[] { Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.ProgramFilesX86 }
            .Select(Environment.GetFolderPath).Any(root => root.Length != 0 &&
                fullPath.StartsWith(Path.TrimEndingDirectorySeparator(root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase));
    }

    public async Task WriteAsync(string xml, AppLockerObservation expected, CancellationToken ct)
    {
        if (!OperatingSystem.IsWindows() || !IsUnmanaged())
            throw new InvalidOperationException(Managed);
        // The helper runs from the per-machine installation and uses a protected directory for the XML.
        string root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WinLab");
        if (!string.Equals(Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory), root, StringComparison.OrdinalIgnoreCase)
            || !ExecutorInstallTrust.IsProtectedPath(root))
            throw new InvalidOperationException(ExecutorInstallTrust.ReadOnlyMessage);

        string policy = Path.Combine(root, $"applocker-{Guid.NewGuid():N}.xml");
        bool created = false;
        try
        {
            await using (var stream = new FileStream(policy, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                created = true;
                await stream.WriteAsync(Encoding.UTF8.GetBytes(xml), ct);
            }
            await RunAsync(WriteScript, expected, policy, ct);
        }
        finally
        {
            if (created) File.Delete(policy);
        }
    }

    private static async Task<string> RunAsync(string script, AppLockerObservation? expected, string? policy, CancellationToken ct)
    {
        string system = Environment.SystemDirectory;
        string psHome = Path.Combine(system, "WindowsPowerShell", "v1.0");
        var start = new ProcessStartInfo(Path.Combine(psHome, "powershell.exe"))
        {
            WorkingDirectory = system, UseShellExecute = false, CreateNoWindow = true,
            RedirectStandardOutput = true, RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8
        };
        start.Environment.Clear();
        start.Environment["SystemRoot"] = Path.GetDirectoryName(system)!;
        start.Environment["WINDIR"] = Path.GetDirectoryName(system)!;
        start.Environment["PATH"] = system;
        start.Environment["PSModulePath"] = Path.Combine(psHome, "Modules");
        if (expected != null && policy != null)
        {
            start.Environment["WINLAB_APPL_LOCAL"] = TextHash(expected.Local);
            start.Environment["WINLAB_APPL_EFFECTIVE"] = TextHash(expected.Effective);
            start.Environment["WINLAB_APPL_XML"] = policy;
        }

        const string setup = """
            $ErrorActionPreference = 'Stop'
            $ProgressPreference = 'SilentlyContinue'
            [Console]::OutputEncoding = [Text.Encoding]::UTF8
            $PSModuleAutoloadingPreference = 'None'
            Import-Module ([IO.Path]::Combine($PSHOME, 'Modules\AppLocker\AppLocker.psd1'))
            Import-Module ([IO.Path]::Combine($PSHOME, 'Modules\Microsoft.PowerShell.Management\Microsoft.PowerShell.Management.psd1'))
            Import-Module ([IO.Path]::Combine($PSHOME, 'Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'))
            """;
        foreach (string argument in new[] { "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
            Convert.ToBase64String(Encoding.Unicode.GetBytes(setup + "\n" + script)) })
            start.ArgumentList.Add(argument);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Componentes do AppLocker indisponíveis.");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(20));
        Task<string> stdout = process.StandardOutput.ReadToEndAsync(timeout.Token);
        Task<string> stderr = process.StandardError.ReadToEndAsync(timeout.Token);
        try
        {
            await process.WaitForExitAsync(timeout.Token);
            // Drain both streams. The system error stream may contain institutional configuration details.
            await stderr;
            string output = await stdout;
            if (process.ExitCode != 0 || output.Length > 1_000_000)
                throw new InvalidOperationException("O Windows recusou a operação AppLocker ou retornou uma política extensa.");
            return output.Trim();
        }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            throw;
        }
    }

    private static string TextHash(string value) =>
        Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    [SupportedOSPlatform("windows")]
    private static bool IsUnmanaged()
    {
        uint joinError = NetGetJoinInformation(null, out IntPtr workgroup, out int joinStatus);
        if (workgroup != IntPtr.Zero) NetApiBufferFree(workgroup);
        if (joinError != 0 || joinStatus is not (1 or 2)) return false;

        int aadError = NetGetAadJoinInformation(null, out IntPtr aadJoin);
        if (aadJoin != IntPtr.Zero) NetFreeAadJoinInformation(aadJoin);
        if (aadError != 0 || aadJoin != IntPtr.Zero) return false;

        int mdmError = IsDeviceRegisteredWithManagement(out bool enrolled, 0, IntPtr.Zero);
        return mdmError == 0 && !enrolled;
    }

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern uint NetGetJoinInformation(string? server, out IntPtr name, out int joinStatus);

    [DllImport("netapi32.dll")]
    private static extern uint NetApiBufferFree(IntPtr buffer);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
    private static extern int NetGetAadJoinInformation(string? tenantId, out IntPtr joinInfo);

    [DllImport("netapi32.dll")]
    private static extern void NetFreeAadJoinInformation(IntPtr joinInfo);

    [DllImport("mdmregistration.dll", ExactSpelling = true)]
    private static extern int IsDeviceRegisteredWithManagement([MarshalAs(UnmanagedType.Bool)] out bool registered, uint length, IntPtr upn);
}
