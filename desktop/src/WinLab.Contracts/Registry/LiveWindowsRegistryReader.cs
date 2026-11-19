using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security;
using System.Security.Principal;
using Microsoft.Win32;
using WinLab.Contracts.Scanning;
using WinLab.Contracts.Transactions;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Contracts.RegistryServices
{
    /// <summary>
    /// Implementação real de IRegistryService sobre Microsoft.Win32.Registry.
    /// Pode ser utilizada para leitura não-elevada no WinLab.Desktop (respeitando ACLs do Windows)
    /// ou para leitura/escrita no WinLab.Executor.
    /// </summary>
    public class LiveWindowsRegistryService : IRegistryService
    {
        private static RegistryKey? GetBaseKey(RegistryHiveType hive)
        {
            if (!OperatingSystem.IsWindows()) return null;

            return hive switch
            {
                RegistryHiveType.LocalMachine => RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Default),
                RegistryHiveType.CurrentUser => RegistryKey.OpenBaseKey(RegistryHive.CurrentUser, RegistryView.Default),
                RegistryHiveType.Users => RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Default),
                _ => RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Default)
            };
        }

        private static RegistryValueKind ToWin32Kind(RegistryValueType kind)
        {
            return kind switch
            {
                RegistryValueType.DWord => RegistryValueKind.DWord,
                RegistryValueType.String => RegistryValueKind.String,
                RegistryValueType.ExpandString => RegistryValueKind.ExpandString,
                RegistryValueType.Binary => RegistryValueKind.Binary,
                RegistryValueType.MultiString => RegistryValueKind.MultiString,
                RegistryValueType.QWord => RegistryValueKind.QWord,
                _ => RegistryValueKind.DWord
            };
        }

        private static RegistryValueType FromWin32Kind(RegistryValueKind kind)
        {
            return kind switch
            {
                RegistryValueKind.DWord => RegistryValueType.DWord,
                RegistryValueKind.String => RegistryValueType.String,
                RegistryValueKind.ExpandString => RegistryValueType.ExpandString,
                RegistryValueKind.Binary => RegistryValueType.Binary,
                RegistryValueKind.MultiString => RegistryValueType.MultiString,
                RegistryValueKind.QWord => RegistryValueType.QWord,
                _ => RegistryValueType.DWord
            };
        }

        public bool KeyExists(RegistryHiveType hive, string subKeyPath)
        {
            if (!OperatingSystem.IsWindows()) return false;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return false;

            using var key = baseKey.OpenSubKey(subKeyPath, writable: false);
            return key != null;
        }

        public bool ValueExists(RegistryHiveType hive, string subKeyPath, string valueName)
        {
            if (!OperatingSystem.IsWindows()) return false;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return false;

            using var key = baseKey.OpenSubKey(subKeyPath, writable: false);
            if (key == null) return false;

            return key.GetValueNames().Contains(valueName, StringComparer.OrdinalIgnoreCase);
        }

        public object? GetValue(RegistryHiveType hive, string subKeyPath, string valueName, object? defaultValue = null)
        {
            if (!OperatingSystem.IsWindows()) return defaultValue;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return defaultValue;

            using var key = baseKey.OpenSubKey(subKeyPath, writable: false);
            if (key == null) return defaultValue;

            return key.GetValue(valueName, defaultValue);
        }

        public RegistryValueType? GetValueKind(RegistryHiveType hive, string subKeyPath, string valueName)
        {
            if (!OperatingSystem.IsWindows()) return null;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return null;

            using var key = baseKey.OpenSubKey(subKeyPath, writable: false);
            if (key == null) return null;

            try
            {
                var kind = key.GetValueKind(valueName);
                return FromWin32Kind(kind);
            }
            catch (IOException)
            {
                return null;
            }
        }

        public void SetValue(RegistryHiveType hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord)
        {
            if (!OperatingSystem.IsWindows()) return;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return;

            using var key = baseKey.CreateSubKey(subKeyPath, writable: true);
            if (key == null)
            {
                throw new InvalidOperationException($"Não foi possível criar ou abrir a subchave do registro '{subKeyPath}'.");
            }

            key.SetValue(valueName, value, ToWin32Kind(valueType));
            key.Flush();
        }

        public void DeleteValue(RegistryHiveType hive, string subKeyPath, string valueName)
        {
            if (!OperatingSystem.IsWindows()) return;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return;

            using var key = baseKey.OpenSubKey(subKeyPath, writable: true);
            if (key != null)
            {
                key.DeleteValue(valueName, throwOnMissingValue: false);
                key.Flush();
            }
        }

        public void CreateSubKey(RegistryHiveType hive, string subKeyPath)
        {
            if (!OperatingSystem.IsWindows()) return;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return;

            using var key = baseKey.CreateSubKey(subKeyPath);
        }

        public void DeleteSubKeyTree(RegistryHiveType hive, string subKeyPath)
        {
            if (!OperatingSystem.IsWindows()) return;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return;

            baseKey.DeleteSubKeyTree(subKeyPath, throwOnMissingSubKey: false);
        }

        public string[] GetSubKeyNames(RegistryHiveType hive, string subKeyPath)
        {
            if (!OperatingSystem.IsWindows()) return Array.Empty<string>();

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return Array.Empty<string>();

            using var key = baseKey.OpenSubKey(subKeyPath, writable: false);
            return key?.GetSubKeyNames() ?? Array.Empty<string>();
        }

        public string[] GetValueNames(RegistryHiveType hive, string subKeyPath)
        {
            if (!OperatingSystem.IsWindows()) return Array.Empty<string>();

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return Array.Empty<string>();

            using var key = baseKey.OpenSubKey(subKeyPath, writable: false);
            return key?.GetValueNames() ?? Array.Empty<string>();
        }

        public IDictionary<string, object?> SnapshotKey(RegistryHiveType hive, string subKeyPath)
        {
            var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
            if (!OperatingSystem.IsWindows()) return dict;

            using var baseKey = GetBaseKey(hive);
            if (baseKey == null) return dict;

            using var key = baseKey.OpenSubKey(subKeyPath, writable: false);
            if (key != null)
            {
                foreach (var valName in key.GetValueNames())
                {
                    dict[valName] = key.GetValue(valName);
                }
            }

            return dict;
        }

        public bool KeyExists(string hive, string subKeyPath) => KeyExists(InMemoryRegistryService.ParseHive(hive), subKeyPath);
        public bool ValueExists(string hive, string subKeyPath, string valueName) => ValueExists(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName);
        public object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null) => GetValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName, defaultValue);
        public RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName) => GetValueKind(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName);
        public void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => SetValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName, value, valueType);
        public void DeleteValue(string hive, string subKeyPath, string valueName) => DeleteValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName);
    }

    /// <summary>
    /// Leitor não-elevado de hives de usuário (processo UI asInvoker).
    /// Nunca executa RegLoadKey nem solicita UAC; caso o hive esteja offline ou protegido por ACL,
    /// reporta explicitamente a necessidade de permissão administrativa (Inconclusive) sem mascarar estados.
    /// </summary>
    public class NonElevatedUserHiveReader : IUserHiveManager
    {
        private sealed class ReadOnlyHiveScope : IUserHiveScope
        {
            public string UserSid { get; }
            public string RootPath { get; }
            public bool IsAvailable { get; }
            public bool WasLoadedFromDisk => false;
            public UserProfileStatus ProfileStatus { get; }
            public string? ErrorMessage { get; }

            public ReadOnlyHiveScope(
                string userSid,
                string rootPath,
                bool isAvailable,
                UserProfileStatus status,
                string? errorMessage = null)
            {
                UserSid = userSid;
                RootPath = rootPath;
                IsAvailable = isAvailable;
                ProfileStatus = status;
                ErrorMessage = errorMessage;
            }

            public void Dispose() { }
        }

        public bool IsUserLoggedOn(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid) || !OperatingSystem.IsWindows()) return false;

            try
            {
                using var usersKey = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Default);
                using var subKey = usersKey.OpenSubKey(userSid.Trim(), writable: false);
                return subKey != null;
            }
            catch
            {
                return false;
            }
        }

        public string? GetUserProfilePath(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid) || !OperatingSystem.IsWindows()) return null;

            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, RegistryView.Default);
                using var profileKey = baseKey.OpenSubKey($@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\{userSid.Trim()}", writable: false);
                if (profileKey != null)
                {
                    string? rawPath = profileKey.GetValue("ProfileImagePath") as string;
                    if (!string.IsNullOrWhiteSpace(rawPath))
                    {
                        return Environment.ExpandEnvironmentVariables(rawPath);
                    }
                }
            }
            catch
            {
                // Ignora falhas de leitura
            }

            return null;
        }

        private readonly Func<string, AccountPrivilegeClassification>? _privilegeProbe;

        public NonElevatedUserHiveReader(Func<string, AccountPrivilegeClassification>? privilegeProbe = null)
        {
            _privilegeProbe = privilegeProbe;
        }

        public AccountPrivilegeClassification ClassifyAccountPrivilege(string? userSidOrName)
        {
            return WindowsAccountPrivilegeHelper.ClassifyAccountPrivilege(userSidOrName, _privilegeProbe);
        }

        public bool IsUserAdministrator(string? userSid)
        {
            return ClassifyAccountPrivilege(userSid) == AccountPrivilegeClassification.Administrator;
        }

        public IUserHiveScope OpenUserHive(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid))
            {
                return new ReadOnlyHiveScope(
                    string.Empty,
                    string.Empty,
                    isAvailable: false,
                    status: UserProfileStatus.Inaccessible,
                    errorMessage: "Selecione uma conta comum para consultar políticas de usuário.");
            }

            string cleanSid = userSid.Trim();

            if (!OperatingSystem.IsWindows())
            {
                return new ReadOnlyHiveScope(
                    cleanSid,
                    cleanSid,
                    isAvailable: false,
                    status: UserProfileStatus.Inaccessible,
                    errorMessage: "Leitura de registro Windows indisponível neste sistema operacional.");
            }

            try
            {
                using var usersKey = RegistryKey.OpenBaseKey(RegistryHive.Users, RegistryView.Default);
                using var subKey = usersKey.OpenSubKey(cleanSid, writable: false);
                if (subKey != null)
                {
                    return new ReadOnlyHiveScope(
                        cleanSid,
                        cleanSid,
                        isAvailable: true,
                        status: UserProfileStatus.ActiveSession);
                }
            }
            catch (SecurityException)
            {
                return new ReadOnlyHiveScope(
                    cleanSid,
                    cleanSid,
                    isAvailable: false,
                    status: UserProfileStatus.Inaccessible,
                    errorMessage: "Permissão administrativa necessária para ler o registro desta conta de usuário.");
            }
            catch (UnauthorizedAccessException)
            {
                return new ReadOnlyHiveScope(
                    cleanSid,
                    cleanSid,
                    isAvailable: false,
                    status: UserProfileStatus.Inaccessible,
                    errorMessage: "Permissão administrativa necessária para ler o registro desta conta de usuário.");
            }
            catch (Exception ex)
            {
                return new ReadOnlyHiveScope(
                    cleanSid,
                    cleanSid,
                    isAvailable: false,
                    status: UserProfileStatus.Inaccessible,
                    errorMessage: $"Falha ao acessar hive do usuário: {ex.Message}");
            }

            string? profilePath = GetUserProfilePath(cleanSid);
            if (string.IsNullOrWhiteSpace(profilePath))
            {
                return new ReadOnlyHiveScope(
                    cleanSid,
                    cleanSid,
                    isAvailable: false,
                    status: UserProfileStatus.NotCreated,
                    errorMessage: "Esta conta ainda não realizou o primeiro login no Windows (perfil ainda não criado).");
            }

            return new ReadOnlyHiveScope(
                cleanSid,
                cleanSid,
                isAvailable: false,
                status: UserProfileStatus.Inaccessible,
                errorMessage: "O perfil desta conta está offline. Use a consulta com permissão administrativa para carregar o perfil sem iniciar sessão.");
        }
    }
}
