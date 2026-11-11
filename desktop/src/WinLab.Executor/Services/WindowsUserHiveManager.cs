using System;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32;
using WinLab.Contracts.RegistryServices;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Executor.Services
{
    public class WindowsUserHiveScope : IUserHiveScope
    {
        public string UserSid { get; }
        public string RootPath { get; }
        public bool IsAvailable { get; }
        public bool WasLoadedFromDisk { get; }
        public UserProfileStatus ProfileStatus { get; }
        public string? ErrorMessage { get; }

        private readonly Action? _onDispose;
        private bool _isDisposed;

        public WindowsUserHiveScope(
            string userSid,
            string rootPath,
            bool isAvailable,
            bool wasLoadedFromDisk,
            UserProfileStatus profileStatus,
            string? errorMessage = null,
            Action? onDispose = null)
        {
            UserSid = userSid;
            RootPath = rootPath;
            IsAvailable = isAvailable;
            WasLoadedFromDisk = wasLoadedFromDisk;
            ProfileStatus = profileStatus;
            ErrorMessage = errorMessage;
            _onDispose = onDispose;
        }

        public void Dispose()
        {
            if (_isDisposed) return;
            _isDisposed = true;
            _onDispose?.Invoke();
        }
    }

    public class WindowsUserHiveManager : IUserHiveManager
    {
        private static readonly IntPtr HKEY_USERS = new(unchecked((int)0x80000003));

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int RegLoadKey(IntPtr hKey, string lpSubKey, string lpFile);

        [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        private static extern int RegUnLoadKey(IntPtr hKey, string lpSubKey);

        public bool IsUserLoggedOn(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid) || !OperatingSystem.IsWindows()) return true;

            try
            {
                using var usersKey = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Default);
                using var userSubKey = usersKey.OpenSubKey(userSid, writable: false);
                return userSubKey != null;
            }
            catch
            {
                return false;
            }
        }

        public string? GetUserProfilePath(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid) || !OperatingSystem.IsWindows())
            {
                return Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            }

            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Default);
                using var profileKey = baseKey.OpenSubKey($@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\{userSid}", writable: false);
                if (profileKey != null)
                {
                    string? rawPath = profileKey.GetValue("ProfileImagePath") as string;
                    if (!string.IsNullOrWhiteSpace(rawPath))
                    {
                        return Environment.ExpandEnvironmentVariables(rawPath);
                    }
                }
            }
            catch { }

            return null;
        }

        public bool IsUserAdministrator(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid)) return false;

            string trimmed = userSid.Trim();

            // Inviolable checks
            if (string.Equals(trimmed, "S-1-5-32-544", StringComparison.OrdinalIgnoreCase)) return true;
            if (trimmed.EndsWith("-500", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(trimmed, "Administrador", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "Administrator", StringComparison.OrdinalIgnoreCase)) return true;

            if (!OperatingSystem.IsWindows()) return false;

            try
            {
                var sid = new SecurityIdentifier(trimmed);
                // Check if account resolves to an administrator
                var adminSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
                if (sid.Equals(adminSid)) return true;

                // Check local admin membership
                var account = sid.Translate(typeof(NTAccount));
                using var identity = new WindowsIdentity(account.Value);
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                // If translation fails, safely check well-known patterns
                return trimmed.EndsWith("-500", StringComparison.OrdinalIgnoreCase);
            }
        }

        public IUserHiveScope OpenUserHive(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid) || !OperatingSystem.IsWindows())
            {
                return new WindowsUserHiveScope(
                    userSid ?? string.Empty,
                    "Software",
                    isAvailable: true,
                    wasLoadedFromDisk: false,
                    profileStatus: UserProfileStatus.ActiveSession);
            }

            // Scenario A: User is logged on (interactive session)
            if (IsUserLoggedOn(userSid))
            {
                return new WindowsUserHiveScope(
                    userSid,
                    userSid,
                    isAvailable: true,
                    wasLoadedFromDisk: false,
                    profileStatus: UserProfileStatus.ActiveSession);
            }

            // Scenario B / C: User is offline
            string? profilePath = GetUserProfilePath(userSid);
            if (string.IsNullOrWhiteSpace(profilePath))
            {
                return new WindowsUserHiveScope(
                    userSid,
                    userSid,
                    isAvailable: false,
                    wasLoadedFromDisk: false,
                    profileStatus: UserProfileStatus.NotCreated,
                    errorMessage: "Perfil do usuário não encontrado na lista de perfis do sistema.");
            }

            string ntuserPath = Path.Combine(profilePath, "NTUSER.DAT");
            if (!File.Exists(ntuserPath))
            {
                return new WindowsUserHiveScope(
                    userSid,
                    userSid,
                    isAvailable: false,
                    wasLoadedFromDisk: false,
                    profileStatus: UserProfileStatus.NotCreated,
                    errorMessage: "Arquivo NTUSER.DAT ainda não gerado. Perfil pendente de primeiro logon.");
            }

            // Mount offline hive
            string mountSubKey = $"WinLab_Mounted_{userSid}";
            int result = RegLoadKey(HKEY_USERS, mountSubKey, ntuserPath);
            if (result != 0)
            {
                return new WindowsUserHiveScope(
                    userSid,
                    mountSubKey,
                    isAvailable: false,
                    wasLoadedFromDisk: false,
                    profileStatus: UserProfileStatus.Inaccessible,
                    errorMessage: $"Falha ao carregar hive do usuário (RegLoadKey Win32 Error {result}).");
            }

            return new WindowsUserHiveScope(
                userSid,
                mountSubKey,
                isAvailable: true,
                wasLoadedFromDisk: true,
                profileStatus: UserProfileStatus.OfflineProfileReady,
                onDispose: () =>
                {
                    // Unload hive protocol: collect handles and flush before unload
                    GC.Collect();
                    GC.WaitForPendingFinalizers();
                    RegUnLoadKey(HKEY_USERS, mountSubKey);
                });
        }
    }
}
