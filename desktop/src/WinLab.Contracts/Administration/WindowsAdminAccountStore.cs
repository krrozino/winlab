using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Versioning;
using System.Security.Principal;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Scanning;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Administration;

public sealed class WindowsAdminAccountStore(IRegistryService registry, Func<bool> trustStore) : IAdminAccountStore
{
    public const string RegistryPath = @"SOFTWARE\WinLab\Administration\Accounts";
    public const string RecoveryValue = "RecoverySid";

    public AdminAccountInventory Read()
    {
        if (!OperatingSystem.IsWindows()) return new([], null, false);

        var probe = new WindowsLocalAccountsProbe();
        var (enumerated, users, _) = probe.EnumerateNormalUsers();
        if (!enumerated) return new([], null, false);

        var admins = probe.QueryAdminGroupMembers();
        var standard = WindowsAccountPrivilegeHelper.QueryBuiltinGroupMembers(WellKnownSidType.BuiltinUsersSid);
        bool trusted = trustStore();
        string? recoverySid = trusted ? registry.GetValue(RegistryHiveType.LocalMachine, RegistryPath, RecoveryValue) as string : null;
        string? adminGroup = probe.LocalizedAdministratorsGroupName;

        var accounts = new List<AdminAccountDto>(users.Count);
        foreach (var user in users.OrderBy(account => account.Name, StringComparer.OrdinalIgnoreCase))
        {
            string? sid = ResolveLocalSid(user.Name);
            var direct = new List<string>(2);
            if (admins.Succeeded && sid != null && admins.MemberSids.Contains(sid)) direct.Add(AdminAccountService.AdministratorsGroupSid);
            if (standard.Succeeded && sid != null && standard.MemberSids.Contains(sid)) direct.Add(AdminAccountService.UsersGroupSid);

            var groups = sid == null ? null : probe.QueryUserLocalGroups($"{Environment.MachineName}\\{user.Name}");
            bool isIndirectAdmin = groups?.Succeeded == true && adminGroup != null &&
                groups.GroupNames.Contains(adminGroup, StringComparer.OrdinalIgnoreCase);
            string privilege = sid == null ? "Unknown"
                : direct.Contains(AdminAccountService.AdministratorsGroupSid) || isIndirectAdmin || user.IsPrivilegeAdminFlag || sid.EndsWith("-500", StringComparison.Ordinal)
                    ? "Administrator"
                    : admins.Succeeded && adminGroup != null && (!admins.HasNestedGroupMembers || groups?.Succeeded == true)
                        ? "StandardUser" : "Unknown";
            string? registered = trusted && sid != null
                ? registry.GetValue(RegistryHiveType.LocalMachine, RegistryPath, sid) as string : null;
            string role = sid != null && sid == recoverySid ? "Recovery" : registered is "Student" or "Superadmin" ? registered : "Unmanaged";
            bool protectedAccount = privilege != "StandardUser" || role != "Student" || sid == null ||
                !uint.TryParse(sid[(sid.LastIndexOf('-') + 1)..], out var rid) || rid < 1000;
            accounts.Add(new(user.Name, sid, user.Enabled, role, privilege, protectedAccount, direct));
        }
        return new(accounts, recoverySid, admins.Succeeded && standard.Succeeded && trusted &&
            accounts.All(account => account.Sid != null) &&
            (recoverySid == null || AdminRequest.IsLocalSid(recoverySid)));
    }

    [SupportedOSPlatform("windows")]
    public static string? ResolveLocalSid(string name)
    {
        try
        {
            var account = new NTAccount(Environment.MachineName, name);
            var sid = (SecurityIdentifier)account.Translate(typeof(SecurityIdentifier));
            return AdminRequest.IsLocalSid(sid.Value) ? sid.Value : null;
        }
        catch (IdentityNotMappedException)
        {
            return null;
        }
    }
}
