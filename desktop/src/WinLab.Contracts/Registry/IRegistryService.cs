using System;
using System.Collections.Generic;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.RegistryServices
{
    /// <summary>
    /// Abstração para operações no Registro do Windows.
    /// Suporta RegistryHiveType ou strings canônicas ("HKLM", "HKCU", "HKU").
    /// </summary>
    public interface IRegistryService
    {
        bool KeyExists(RegistryHiveType hive, string subKeyPath);
        bool ValueExists(RegistryHiveType hive, string subKeyPath, string valueName);
        object? GetValue(RegistryHiveType hive, string subKeyPath, string valueName, object? defaultValue = null);
        RegistryValueType? GetValueKind(RegistryHiveType hive, string subKeyPath, string valueName);
        void SetValue(RegistryHiveType hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord);
        void DeleteValue(RegistryHiveType hive, string subKeyPath, string valueName);
        void CreateSubKey(RegistryHiveType hive, string subKeyPath);
        void DeleteSubKeyTree(RegistryHiveType hive, string subKeyPath);
        string[] GetSubKeyNames(RegistryHiveType hive, string subKeyPath);
        string[] GetValueNames(RegistryHiveType hive, string subKeyPath);
        IDictionary<string, object?> SnapshotKey(RegistryHiveType hive, string subKeyPath);

        // String-based hive convenience overloads
        bool KeyExists(string hive, string subKeyPath);
        bool ValueExists(string hive, string subKeyPath, string valueName);
        object? GetValue(string hive, string subKeyPath, string valueName, object? defaultValue = null);
        RegistryValueType? GetValueKind(string hive, string subKeyPath, string valueName);
        void SetValue(string hive, string subKeyPath, string valueName, object value, RegistryValueType valueType = RegistryValueType.DWord);
        void DeleteValue(string hive, string subKeyPath, string valueName);
    }
}
