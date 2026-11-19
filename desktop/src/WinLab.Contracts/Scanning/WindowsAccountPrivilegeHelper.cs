using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Contracts.Scanning
{
    public sealed record AdminGroupMembersSnapshot(
        bool Succeeded,
        IReadOnlyCollection<string> MemberSids,
        bool HasNestedGroupMembers,
        string? Error = null);

    public sealed record UserLocalGroupsSnapshot(
        bool Succeeded,
        IReadOnlyCollection<string> GroupNames,
        string? Error = null);

    public static class WindowsAccountPrivilegeHelper
    {
        public static bool TryGetLocalizedAdministratorsGroupName(out string? groupName, out string? error)
        {
            groupName = null;
            error = null;
            if (!OperatingSystem.IsWindows())
            {
                error = "Resolução de grupos do Windows indisponível fora do Windows.";
                return false;
            }

            try
            {
                var adminGroupSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
                var adminGroupAccount = (NTAccount)adminGroupSid.Translate(typeof(NTAccount));
                string fullName = adminGroupAccount.Value;
                groupName = fullName.Contains('\\') ? fullName.Split('\\')[1] : fullName;
                return !string.IsNullOrWhiteSpace(groupName);
            }
            catch (Exception ex)
            {
                error = $"Falha ao resolver nome do grupo Administradores: {ex.Message}";
                return false;
            }
        }

        public static AdminGroupMembersSnapshot QueryAdminGroupMembers()
        {
            if (!OperatingSystem.IsWindows())
            {
                return new AdminGroupMembersSnapshot(false, Array.Empty<string>(), false, "Plataforma não é Windows.");
            }

            if (!TryGetLocalizedAdministratorsGroupName(out string? groupName, out string? groupError) || string.IsNullOrWhiteSpace(groupName))
            {
                return new AdminGroupMembersSnapshot(false, Array.Empty<string>(), false, groupError ?? "Grupo Administradores não resolvido.");
            }

            var adminSids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            bool hasNestedGroups = false;
            IntPtr bufPtr = IntPtr.Zero;

            try
            {
                uint entriesRead = 0;
                uint totalEntries = 0;
                IntPtr resumeHandle = IntPtr.Zero;

                uint status = NativeNetApi.NetLocalGroupGetMembers(
                    null,
                    groupName,
                    2,
                    out bufPtr,
                    NativeNetApi.MAX_PREFERRED_LENGTH,
                    out entriesRead,
                    out totalEntries,
                    ref resumeHandle
                );

                if (status != 0)
                {
                    return new AdminGroupMembersSnapshot(false, Array.Empty<string>(), false, $"NetLocalGroupGetMembers falhou com código Win32 {status}.");
                }

                if (entriesRead > 0 && bufPtr == IntPtr.Zero)
                {
                    return new AdminGroupMembersSnapshot(false, Array.Empty<string>(), false, "NetLocalGroupGetMembers retornou buffer nulo.");
                }

                if (bufPtr != IntPtr.Zero)
                {
                    int structSize = Marshal.SizeOf<NativeNetApi.LOCALGROUP_MEMBERS_INFO_2>();
                    for (int i = 0; i < entriesRead; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(bufPtr, i * structSize);
                        var member = Marshal.PtrToStructure<NativeNetApi.LOCALGROUP_MEMBERS_INFO_2>(currentPtr);

                        // SidTypeUser = 1; any other non-user SID (Group, Alias, WellKnownGroup) represents nested/indirect membership
                        if (member.lgrmi2_sidusage != 1)
                        {
                            hasNestedGroups = true;
                        }

                        if (member.lgrmi2_sid == IntPtr.Zero)
                        {
                            return new AdminGroupMembersSnapshot(false, Array.Empty<string>(), hasNestedGroups, "Membro do grupo Administradores possui ponteiro SID nulo.");
                        }

                        var sid = new SecurityIdentifier(member.lgrmi2_sid);
                        adminSids.Add(sid.Value);
                    }
                }

                return new AdminGroupMembersSnapshot(true, adminSids, hasNestedGroups);
            }
            catch (Exception ex)
            {
                return new AdminGroupMembersSnapshot(false, Array.Empty<string>(), hasNestedGroups, $"Exceção ao consultar membros do grupo Administradores: {ex.Message}");
            }
            finally
            {
                if (bufPtr != IntPtr.Zero)
                {
                    NativeNetApi.NetApiBufferFree(bufPtr);
                }
            }
        }

        public static UserLocalGroupsSnapshot QueryUserLocalGroups(string userName)
        {
            if (!OperatingSystem.IsWindows())
            {
                return new UserLocalGroupsSnapshot(false, Array.Empty<string>(), "Plataforma não é Windows.");
            }

            if (string.IsNullOrWhiteSpace(userName))
            {
                return new UserLocalGroupsSnapshot(false, Array.Empty<string>(), "Nome de usuário vazio.");
            }

            var groups = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            IntPtr bufPtr = IntPtr.Zero;

            try
            {
                uint entriesRead = 0;
                uint totalEntries = 0;

                uint status = NativeNetApi.NetUserGetLocalGroups(
                    null,
                    userName,
                    0,
                    NativeNetApi.LG_INCLUDE_INDIRECT,
                    out bufPtr,
                    NativeNetApi.MAX_PREFERRED_LENGTH,
                    out entriesRead,
                    out totalEntries
                );

                if (status != 0)
                {
                    return new UserLocalGroupsSnapshot(false, Array.Empty<string>(), $"NetUserGetLocalGroups falhou com código Win32 {status}.");
                }

                if (bufPtr != IntPtr.Zero)
                {
                    int structSize = Marshal.SizeOf<NativeNetApi.LOCALGROUP_USERS_INFO_0>();
                    for (int i = 0; i < entriesRead; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(bufPtr, i * structSize);
                        var info = Marshal.PtrToStructure<NativeNetApi.LOCALGROUP_USERS_INFO_0>(currentPtr);
                        if (!string.IsNullOrWhiteSpace(info.lgrui0_name))
                        {
                            groups.Add(info.lgrui0_name);
                        }
                    }
                }

                return new UserLocalGroupsSnapshot(true, groups);
            }
            catch (Exception ex)
            {
                return new UserLocalGroupsSnapshot(false, Array.Empty<string>(), $"Exceção ao consultar grupos locais do usuário: {ex.Message}");
            }
            finally
            {
                if (bufPtr != IntPtr.Zero)
                {
                    NativeNetApi.NetApiBufferFree(bufPtr);
                }
            }
        }

        public static AccountPrivilegeClassification ClassifyAccountPrivilege(
            string? userSidOrName,
            Func<string, AccountPrivilegeClassification>? customProbe = null)
        {
            if (string.IsNullOrWhiteSpace(userSidOrName))
            {
                return AccountPrivilegeClassification.Unknown;
            }

            string trimmed = userSidOrName.Trim();

            if (string.Equals(trimmed, "S-1-5-32-544", StringComparison.OrdinalIgnoreCase) ||
                trimmed.EndsWith("-500", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "Administrador", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(trimmed, "Administrator", StringComparison.OrdinalIgnoreCase))
            {
                return AccountPrivilegeClassification.Administrator;
            }

            if (customProbe != null)
            {
                try
                {
                    return customProbe(trimmed);
                }
                catch
                {
                    return AccountPrivilegeClassification.Unknown;
                }
            }

            if (!OperatingSystem.IsWindows())
            {
                return AccountPrivilegeClassification.Unknown;
            }

            SecurityIdentifier sid;
            try
            {
                if (trimmed.StartsWith("S-1-", StringComparison.OrdinalIgnoreCase))
                {
                    sid = new SecurityIdentifier(trimmed);
                }
                else
                {
                    try
                    {
                        var localAccount = new NTAccount(Environment.MachineName, trimmed);
                        sid = (SecurityIdentifier)localAccount.Translate(typeof(SecurityIdentifier));
                    }
                    catch
                    {
                        var account = new NTAccount(trimmed);
                        sid = (SecurityIdentifier)account.Translate(typeof(SecurityIdentifier));
                    }
                }
            }
            catch
            {
                return AccountPrivilegeClassification.Unknown;
            }

            if (sid.IsWellKnown(WellKnownSidType.BuiltinAdministratorsSid) ||
                sid.IsWellKnown(WellKnownSidType.LocalSystemSid) ||
                sid.Value.EndsWith("-500", StringComparison.OrdinalIgnoreCase))
            {
                return AccountPrivilegeClassification.Administrator;
            }

            string accountFullName;
            try
            {
                accountFullName = ((NTAccount)sid.Translate(typeof(NTAccount))).Value;
            }
            catch
            {
                return AccountPrivilegeClassification.Unknown;
            }

            string accountName = accountFullName.Contains('\\')
                ? accountFullName[(accountFullName.IndexOf('\\') + 1)..]
                : accountFullName;

            var adminGroup = QueryAdminGroupMembers();
            if (adminGroup.Succeeded && adminGroup.MemberSids.Contains(sid.Value, StringComparer.OrdinalIgnoreCase))
            {
                return AccountPrivilegeClassification.Administrator;
            }

            var localGroups = QueryUserLocalGroups(accountName);
            if (TryGetLocalizedAdministratorsGroupName(out string? adminGroupName, out _) &&
                !string.IsNullOrWhiteSpace(adminGroupName) &&
                localGroups.Succeeded &&
                localGroups.GroupNames.Contains(adminGroupName, StringComparer.OrdinalIgnoreCase))
            {
                return AccountPrivilegeClassification.Administrator;
            }

            if (!adminGroup.Succeeded)
            {
                return AccountPrivilegeClassification.Unknown;
            }

            if (adminGroup.HasNestedGroupMembers && !localGroups.Succeeded)
            {
                return AccountPrivilegeClassification.Unknown;
            }

            return AccountPrivilegeClassification.StandardUser;
        }

        public static string? ResolveUserSid(string userName)
        {
            if (!OperatingSystem.IsWindows()) return null;

            try
            {
                var account = new NTAccount(Environment.MachineName, userName);
                return ((SecurityIdentifier)account.Translate(typeof(SecurityIdentifier))).Value;
            }
            catch
            {
                try
                {
                    var account = new NTAccount(userName);
                    return ((SecurityIdentifier)account.Translate(typeof(SecurityIdentifier))).Value;
                }
                catch
                {
                    return null;
                }
            }
        }

        internal static class NativeNetApi
        {
            public const uint FILTER_NORMAL_ACCOUNT = 0x0002;
            public const uint MAX_PREFERRED_LENGTH = 0xFFFFFFFF;
            public const uint UF_ACCOUNTDISABLE = 0x0002;
            public const uint USER_PRIV_ADMIN = 2;
            public const uint LG_INCLUDE_INDIRECT = 0x0001;

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public struct USER_INFO_1
            {
                public string usri1_name;
                public string usri1_password;
                public uint usri1_password_age;
                public uint usri1_priv;
                public string usri1_home_dir;
                public string usri1_comment;
                public uint usri1_flags;
                public string usri1_script_path;
            }

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public struct LOCALGROUP_MEMBERS_INFO_2
            {
                public IntPtr lgrmi2_sid;
                public int lgrmi2_sidusage;
                public string lgrmi2_domainandname;
            }

            [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
            public struct LOCALGROUP_USERS_INFO_0
            {
                public string lgrui0_name;
            }

            [DllImport("netapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern uint NetUserEnum(
                string? servername,
                uint level,
                uint filter,
                out IntPtr bufptr,
                uint prefmaxlen,
                out uint entriesread,
                out uint totalentries,
                ref uint resume_handle);

            [DllImport("netapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern uint NetLocalGroupGetMembers(
                string? servername,
                string groupname,
                uint level,
                out IntPtr bufptr,
                uint prefmaxlen,
                out uint entriesread,
                out uint totalentries,
                ref IntPtr resumehandle);

            [DllImport("netapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
            public static extern uint NetUserGetLocalGroups(
                string? servername,
                string username,
                uint level,
                uint flags,
                out IntPtr bufptr,
                uint prefmaxlen,
                out uint entriesread,
                out uint totalentries);

            [DllImport("netapi32.dll", SetLastError = true)]
            public static extern uint NetApiBufferFree(IntPtr buffer);
        }
    }
}
