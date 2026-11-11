using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Win32;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Executor.Services
{
    public class WindowsRegistryService : IRegistryService
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
            catch
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
                try
                {
                    key.DeleteValue(valueName, throwOnMissingValue: false);
                    key.Flush();
                }
                catch
                {
                    // Ignore if missing
                }
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

            try
            {
                baseKey.DeleteSubKeyTree(subKeyPath, throwOnMissingSubKey: false);
            }
            catch
            {
                // Ignore missing
            }
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

        // Convenience string overloads
        public bool KeyExists(string hive, string subKeyPath) => KeyExists(InMemoryRegistryService.ParseHive(hive), subKeyPath);
        public bool ValueExists(string hive, string subKeyPath, string valueName) => ValueExists(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName);
        public object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null) => GetValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName, defaultValue);
        public RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName) => GetValueKind(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName);
        public void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord) => SetValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName, value, valueType);
        public void DeleteValue(string hive, string subKeyPath, string valueName) => DeleteValue(InMemoryRegistryService.ParseHive(hive), subKeyPath, valueName);
    }
}
