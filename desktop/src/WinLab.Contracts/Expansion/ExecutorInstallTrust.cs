using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using Microsoft.Win32;
using Microsoft.Win32.SafeHandles;
using WinLab.Contracts.Administration;

namespace WinLab.Contracts.Expansion;

public static class ExecutorInstallTrust
{
    public const string ReadOnlyMessage =
        "Somente leitura. Abra a instalação WinLab por máquina em Program Files com uma conta administrativa.";

    private const string Administrator = "S-1-5-32-544";
    private const string SystemAccount = "S-1-5-18";
    private const string TrustedInstaller = "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464";
    private const string InstallKey = @"SOFTWARE\WinLab\DesktopInstallation";
    private const int TokenElevationType = 18;
    private const int LimitedAdministrator = 3;
    private const uint TokenQueryAndDuplicate = 0x000A;

    public static string? FindInstalledExecutor()
    {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitProcess)
            return null;

        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            return IsAdministrativeAccount(identity) ? ResolveInstalledExecutor(Environment.ProcessPath) : null;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException or System.Security.SecurityException)
        {
            return null;
        }
    }

    public static bool CanAcceptParent(int parentPid)
    {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitProcess || parentPid <= 0) return false;
        try
        {
            using var process = Process.GetProcessById(parentPid);
            if (!OpenProcessToken(process.SafeHandle, TokenQueryAndDuplicate, out var token)) return false;
            using (token)
            using (var parent = new WindowsIdentity(token.DangerousGetHandle()))
            using (var current = WindowsIdentity.GetCurrent())
            {
                var currentSid = current.User;
                if (currentSid == null || parent.User?.Equals(currentSid) != true || !IsAdministrativeAccount(parent))
                    return false;
            }

            var installed = ResolveInstalledExecutor(process.MainModule?.FileName);
            return installed != null && string.Equals(installed, Environment.ProcessPath, StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or ArgumentException
            or InvalidOperationException or System.ComponentModel.Win32Exception or System.Security.SecurityException)
        {
            return false;
        }
    }

    [SupportedOSPlatform("windows")]
    private static bool IsAdministrativeAccount(WindowsIdentity identity) =>
        new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator)
        || (GetTokenInformation(identity.AccessToken, TokenElevationType, out int elevationType, sizeof(int), out _)
            && elevationType == LimitedAdministrator);

    [SupportedOSPlatform("windows")]
    private static string? ResolveInstalledExecutor(string? desktopPath)
    {
        using var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
        using var publisher = machine.OpenSubKey(@"SOFTWARE\WinLab");
        using var metadata = machine.OpenSubKey(InstallKey);
        if (publisher == null || !IsTrustedRegistryKey(publisher) || metadata == null || !IsTrustedRegistryKey(metadata))
            return null;
        string? digest = metadata.GetValue("ExecutorSha256") as string;
        if (digest?.Length != 64) return null;

        var helper = Resolve(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), desktopPath, digest, IsProtectedPath, HashFile);
        if (helper == null) return null;
        var adjacent = Directory.EnumerateFiles(Path.GetDirectoryName(helper)!);
        return adjacent.Where(path => path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".runtimeconfig.json", StringComparison.OrdinalIgnoreCase)
            || path.EndsWith(".deps.json", StringComparison.OrdinalIgnoreCase)).All(IsProtectedPath) ? helper : null;
    }

    public static string? Resolve(string programFiles, string? desktop, string? digest,
        Func<string, bool> isProtected, Func<string, string> hash)
    {
        if (!Path.IsPathFullyQualified(programFiles) || desktop == null || string.IsNullOrEmpty(digest))
            return null;

        var install = Path.Combine(programFiles, "WinLab");
        var helper = Path.Combine(install, "WinLab.Executor.exe");
        if (!string.Equals(Path.GetFullPath(desktop), Path.Combine(install, "WinLab.Desktop.exe"), StringComparison.OrdinalIgnoreCase))
            return null;

        return new[] { programFiles, install, desktop, helper }.All(isProtected)
            && string.Equals(hash(helper), digest, StringComparison.OrdinalIgnoreCase) ? helper : null;
    }

    public static bool IsPolicyStoreProtected()
    {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitProcess) return false;
        try
        {
            using var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            using var publisher = machine.OpenSubKey(@"SOFTWARE\WinLab");
            using var journal = machine.OpenSubKey(ExpansionEngine.Journal);
            return publisher != null && IsTrustedRegistryKey(publisher) && (journal == null || IsTrustedRegistryKey(journal));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            return false;
        }
    }

    public static bool IsAdministrationStoreProtected()
    {
        if (!OperatingSystem.IsWindows() || !Environment.Is64BitProcess) return false;
        try
        {
            using var machine = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Registry64);
            using var publisher = machine.OpenSubKey(@"SOFTWARE\WinLab");
            using var administration = machine.OpenSubKey(@"SOFTWARE\WinLab\Administration");
            using var accounts = machine.OpenSubKey(WindowsAdminAccountStore.RegistryPath);
            return publisher != null && IsTrustedRegistryKey(publisher)
                && (administration == null || IsTrustedRegistryKey(administration))
                && (accounts == null || IsTrustedRegistryKey(accounts));
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            return false;
        }
    }

    private static string HashFile(string path)
    {
        using var file = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(file));
    }

    [SupportedOSPlatform("windows")]
    public static bool IsProtectedPath(string path)
    {
        var attributes = File.GetAttributes(path);
        if (attributes.HasFlag(FileAttributes.ReparsePoint)) return false;
        var acl = attributes.HasFlag(FileAttributes.Directory)
            ? (FileSystemSecurity)new DirectoryInfo(path).GetAccessControl()
            : new FileInfo(path).GetAccessControl();
        const FileSystemRights writes = (FileSystemRights)0x50000000 | FileSystemRights.Write | FileSystemRights.Delete
            | FileSystemRights.DeleteSubdirectoriesAndFiles | FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership;
        return Trusted(acl.GetOwner(typeof(SecurityIdentifier))) &&
            acl.GetAccessRules(true, true, typeof(SecurityIdentifier)).OfType<FileSystemAccessRule>().All(rule =>
                rule.AccessControlType != AccessControlType.Allow ||
                rule.PropagationFlags.HasFlag(PropagationFlags.InheritOnly) ||
                (rule.FileSystemRights & writes) == 0 || Trusted(rule.IdentityReference));
    }

    [SupportedOSPlatform("windows")]
    private static bool IsTrustedRegistryKey(RegistryKey key)
    {
        var acl = key.GetAccessControl();
        const RegistryRights writes = (RegistryRights)0x50000000 | RegistryRights.SetValue | RegistryRights.CreateSubKey | RegistryRights.Delete
            | RegistryRights.ChangePermissions | RegistryRights.TakeOwnership;
        return Trusted(acl.GetOwner(typeof(SecurityIdentifier))) &&
            acl.GetAccessRules(true, true, typeof(SecurityIdentifier)).OfType<RegistryAccessRule>().All(rule =>
                rule.AccessControlType != AccessControlType.Allow ||
                rule.PropagationFlags.HasFlag(PropagationFlags.InheritOnly) ||
                (rule.RegistryRights & writes) == 0 || Trusted(rule.IdentityReference));
    }

    [SupportedOSPlatform("windows")]
    private static bool Trusted(IdentityReference? sid) =>
        sid?.Value is Administrator or SystemAccount or TrustedInstaller;

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetTokenInformation(SafeAccessTokenHandle token, int informationClass,
        out int value, int length, out int returnLength);

    [DllImport("advapi32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool OpenProcessToken(SafeProcessHandle process, uint access, out SafeAccessTokenHandle token);
}
