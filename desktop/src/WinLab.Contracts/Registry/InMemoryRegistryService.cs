using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.RegistryServices
{
    public class InMemoryRegistryService : IRegistryService
    {
        private readonly object _lock = new();
        private readonly HashSet<string> _keys = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, (RegistryValueType Kind, object Value)> _values = new(StringComparer.OrdinalIgnoreCase);

        // Fault injection hooks for testing
        private readonly Dictionary<string, Exception> _writeFaults = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, Exception> _probeFaults = new(StringComparer.OrdinalIgnoreCase);

        public InMemoryRegistryService()
        {
            // Seed standard root policy keys
            CreateSubKey(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies");
            CreateSubKey(RegistryHiveType.CurrentUser, @"Software\Policies");
        }

        public static RegistryHiveType ParseHive(string hive)
        {
            if (string.IsNullOrWhiteSpace(hive)) return RegistryHiveType.LocalMachine;

            if (Enum.TryParse<RegistryHiveType>(hive.Trim(), true, out var parsed))
                return parsed;

            string upper = hive.Trim().ToUpperInvariant();
            if (upper.StartsWith("HKCU") || upper.StartsWith("HKEY_CURRENT_USER") || upper.Equals("CURRENTUSER", StringComparison.OrdinalIgnoreCase))
                return RegistryHiveType.CurrentUser;
            if (upper.StartsWith("HKLM") || upper.StartsWith("HKEY_LOCAL_MACHINE") || upper.Equals("LOCALMACHINE", StringComparison.OrdinalIgnoreCase))
                return RegistryHiveType.LocalMachine;
            if (upper.StartsWith("HKU") || upper.StartsWith("HKEY_USERS") || upper.Equals("USERS", StringComparison.OrdinalIgnoreCase))
                return RegistryHiveType.Users;

            return RegistryHiveType.LocalMachine;
        }

        private static string NormalizeKey(RegistryHiveType hive, string subKey)
        {
            string cleanKey = (subKey ?? string.Empty).Trim().Trim('\\');
            return $"{hive}\\{cleanKey}";
        }

        private static string NormalizeValuePath(RegistryHiveType hive, string subKey, string valueName)
        {
            return $"{NormalizeKey(hive, subKey)}|{(valueName ?? string.Empty).Trim()}";
        }

        public void SetWriteFault(string valueName, Exception ex)
        {
            lock (_lock)
            {
                _writeFaults[valueName] = ex;
            }
        }

        public void ClearWriteFault(string valueName)
        {
            lock (_lock)
            {
                _writeFaults.Remove(valueName);
            }
        }

        public void SetProbeFault(string valueName, Exception ex)
        {
            lock (_lock)
            {
                _probeFaults[valueName] = ex;
            }
        }

        public void ClearProbeFault(string valueName)
        {
            lock (_lock)
            {
                _probeFaults.Remove(valueName);
            }
        }

        public bool KeyExists(RegistryHiveType hive, string subKeyPath)
        {
            lock (_lock)
            {
                string norm = NormalizeKey(hive, subKeyPath);
                return _keys.Contains(norm);
            }
        }

        public bool ValueExists(RegistryHiveType hive, string subKeyPath, string valueName)
        {
            lock (_lock)
            {
                if (_probeFaults.TryGetValue(valueName, out var ex))
                {
                    throw ex;
                }
                string norm = NormalizeValuePath(hive, subKeyPath, valueName);
                return _values.ContainsKey(norm);
            }
        }

        public object? GetValue(RegistryHiveType hive, string subKeyPath, string valueName, object? defaultValue = null)
        {
            lock (_lock)
            {
                if (_probeFaults.TryGetValue(valueName, out var ex))
                {
                    throw ex;
                }
                string norm = NormalizeValuePath(hive, subKeyPath, valueName);
                if (_values.TryGetValue(norm, out var entry))
                {
                    return entry.Value;
                }
                return defaultValue;
            }
        }

        public RegistryValueType? GetValueKind(RegistryHiveType hive, string subKeyPath, string valueName)
        {
            lock (_lock)
            {
                string norm = NormalizeValuePath(hive, subKeyPath, valueName);
                if (_values.TryGetValue(norm, out var entry))
                {
                    return entry.Kind;
                }
                return null;
            }
        }

        public void SetValue(RegistryHiveType hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord)
        {
            lock (_lock)
            {
                if (_writeFaults.TryGetValue(valueName, out var ex))
                {
                    throw ex;
                }

                // Auto-create subkey hierarchy
                CreateSubKey(hive, subKeyPath);

                string norm = NormalizeValuePath(hive, subKeyPath, valueName);
                _values[norm] = (valueType, value);
            }
        }

        public void DeleteValue(RegistryHiveType hive, string subKeyPath, string valueName)
        {
            lock (_lock)
            {
                string norm = NormalizeValuePath(hive, subKeyPath, valueName);
                _values.Remove(norm);
            }
        }

        public void CreateSubKey(RegistryHiveType hive, string subKeyPath)
        {
            lock (_lock)
            {
                string[] parts = (subKeyPath ?? string.Empty).Split('\\', StringSplitOptions.RemoveEmptyEntries);
                string current = string.Empty;
                foreach (var part in parts)
                {
                    current = string.IsNullOrEmpty(current) ? part : $"{current}\\{part}";
                    _keys.Add(NormalizeKey(hive, current));
                }
            }
        }

        public void DeleteSubKeyTree(RegistryHiveType hive, string subKeyPath)
        {
            lock (_lock)
            {
                string prefix = NormalizeKey(hive, subKeyPath);
                _keys.RemoveWhere(k => k.Equals(prefix, StringComparison.OrdinalIgnoreCase) || k.StartsWith(prefix + "\\", StringComparison.OrdinalIgnoreCase));
                
                var valuesToRemove = _values.Keys
                    .Where(k => k.StartsWith(prefix + "|", StringComparison.OrdinalIgnoreCase) || k.StartsWith(prefix + "\\", StringComparison.OrdinalIgnoreCase))
                    .ToList();
                
                foreach (var v in valuesToRemove)
                {
                    _values.Remove(v);
                }
            }
        }

        public string[] GetSubKeyNames(RegistryHiveType hive, string subKeyPath)
        {
            lock (_lock)
            {
                string prefix = NormalizeKey(hive, subKeyPath) + "\\";
                return _keys
                    .Where(k => k.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    .Select(k => k.Substring(prefix.Length).Split('\\').First())
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
            }
        }

        public string[] GetValueNames(RegistryHiveType hive, string subKeyPath)
        {
            lock (_lock)
            {
                string prefix = NormalizeKey(hive, subKeyPath) + "|";
                return _values.Keys
                    .Where(k => k.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    .Select(k => k.Substring(prefix.Length))
                    .ToArray();
            }
        }

        public IDictionary<string, object?> SnapshotKey(RegistryHiveType hive, string subKeyPath)
        {
            lock (_lock)
            {
                var dict = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                string prefix = NormalizeKey(hive, subKeyPath) + "|";
                foreach (var kvp in _values.Where(k => k.Key.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
                {
                    string valName = kvp.Key.Substring(prefix.Length);
                    dict[valName] = kvp.Value.Value;
                }
                return dict;
            }
        }

        // Convenience string overloads
        public bool KeyExists(string hive, string subKeyPath) => KeyExists(ParseHive(hive), subKeyPath);
        public bool ValueExists(string hive, string subKeyPath, string valueName) => ValueExists(ParseHive(hive), subKeyPath, valueName);
        public object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null) => GetValue(ParseHive(hive), subKeyPath, valueName, defaultValue);
        public RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName) => GetValueKind(ParseHive(hive), subKeyPath, valueName);
        public void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => SetValue(ParseHive(hive), subKeyPath, valueName, value, valueType);
        public void DeleteValue(string hive, string subKeyPath, string valueName) => DeleteValue(ParseHive(hive), subKeyPath, valueName);
    }

    public class MockUserHiveScope : IUserHiveScope
    {
        public string UserSid { get; }
        public string RootPath { get; }
        public bool IsAvailable { get; }
        public bool WasLoadedFromDisk { get; }
        public UserProfileStatus ProfileStatus { get; }
        public string? ErrorMessage { get; }

        public MockUserHiveScope(string userSid, string rootPath, bool isAvailable = true, UserProfileStatus status = UserProfileStatus.ActiveSession, string? error = null)
        {
            UserSid = userSid;
            RootPath = rootPath;
            IsAvailable = isAvailable;
            WasLoadedFromDisk = false;
            ProfileStatus = status;
            ErrorMessage = error;
        }

        public void Dispose()
        {
            // No-op for mock
        }
    }

    public class MockUserHiveManager : IUserHiveManager
    {
        private readonly HashSet<string> _adminSids = new(StringComparer.OrdinalIgnoreCase)
        {
            "S-1-5-32-544" // WellKnown Builtin Administrators
        };

        private readonly HashSet<string> _loggedOnUsers = new(StringComparer.OrdinalIgnoreCase);
        private readonly Dictionary<string, string> _profilePaths = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _uninitializedUsers = new(StringComparer.OrdinalIgnoreCase);

        public void AddAdministratorSid(string sid) => _adminSids.Add(sid);
        public void SetUserLoggedOn(string sid, bool loggedOn = true)
        {
            if (loggedOn) _loggedOnUsers.Add(sid);
            else _loggedOnUsers.Remove(sid);
        }
        public void SetProfilePath(string sid, string path) => _profilePaths[sid] = path;
        public void SetUserUninitialized(string sid) => _uninitializedUsers.Add(sid);

        public IUserHiveScope OpenUserHive(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid))
            {
                // Current user context
                return new MockUserHiveScope("CURRENT_USER", "Software", isAvailable: true, status: UserProfileStatus.ActiveSession);
            }

            if (_uninitializedUsers.Contains(userSid))
            {
                return new MockUserHiveScope(userSid, userSid, isAvailable: false, status: UserProfileStatus.NotCreated, error: "Perfil do usuário ainda não inicializado no disco.");
            }

            bool isLoggedOn = _loggedOnUsers.Contains(userSid);
            string root = userSid; // Under HKU\<userSid>
            return new MockUserHiveScope(userSid, root, isAvailable: true, status: isLoggedOn ? UserProfileStatus.ActiveSession : UserProfileStatus.OfflineProfileReady);
        }

        public bool IsUserLoggedOn(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid)) return true;
            return _loggedOnUsers.Contains(userSid);
        }

        public string? GetUserProfilePath(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid)) return @"C:\Users\Default";
            _profilePaths.TryGetValue(userSid, out var path);
            return path ?? $@"C:\Users\{userSid}";
        }

        public bool IsUserAdministrator(string? userSid)
        {
            if (string.IsNullOrWhiteSpace(userSid)) return false;
            string trimmed = userSid.Trim();
            if (_adminSids.Contains(trimmed)) return true;
            if (trimmed.EndsWith("-500", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(trimmed, "Administrador", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "Administrator", StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }
    }
}
