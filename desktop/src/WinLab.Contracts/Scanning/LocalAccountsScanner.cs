using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Principal;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Contracts.Scanning
{
    public class LocalAccountsScanner : ILocalAccountsScanner
    {
        public List<LocalUserDto> ScanAccounts()
        {
            if (!OperatingSystem.IsWindows())
            {
                return new List<LocalUserDto>
                {
                    new LocalUserDto
                    {
                        Name = Environment.UserName,
                        Enabled = true,
                        IsAdmin = true,
                        Sid = "S-1-5-21-NON-WINDOWS"
                    }
                };
            }

            var adminSids = GetAdminMemberSids();
            var users = new List<LocalUserDto>();

            IntPtr bufPtr = IntPtr.Zero;
            try
            {
                uint entriesRead = 0;
                uint totalEntries = 0;
                uint resumeHandle = 0;

                // Nível 1: USER_INFO_1
                uint status = NativeNetApi.NetUserEnum(
                    null,
                    1,
                    NativeNetApi.FILTER_NORMAL_ACCOUNT,
                    out bufPtr,
                    NativeNetApi.MAX_PREFERRED_LENGTH,
                    out entriesRead,
                    out totalEntries,
                    ref resumeHandle
                );

                if (status == 0 && bufPtr != IntPtr.Zero)
                {
                    int structSize = Marshal.SizeOf<NativeNetApi.USER_INFO_1>();
                    for (int i = 0; i < entriesRead; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(bufPtr, i * structSize);
                        var user = Marshal.PtrToStructure<NativeNetApi.USER_INFO_1>(currentPtr);

                        string name = user.usri1_name ?? string.Empty;
                        if (string.IsNullOrWhiteSpace(name)) continue;

                        bool isEnabled = (user.usri1_flags & NativeNetApi.UF_ACCOUNTDISABLE) == 0;
                        string? sid = ResolveUserSid(name);

                        // Administrador se estiver no grupo Administradores ou se for a conta de RID 500
                        bool isAdmin = (sid != null && adminSids.Contains(sid)) ||
                                       (sid != null && sid.EndsWith("-500", StringComparison.OrdinalIgnoreCase));

                        users.Add(new LocalUserDto
                        {
                            Name = name,
                            Enabled = isEnabled,
                            IsAdmin = isAdmin,
                            Sid = sid
                        });
                    }
                }
            }
            catch
            {
                // Fallback defensivo: conta atual
                users.Add(new LocalUserDto
                {
                    Name = Environment.UserName,
                    Enabled = true,
                    IsAdmin = IsCurrentProcessElevated(),
                    Sid = WindowsIdentity.GetCurrent().User?.Value
                });
            }
            finally
            {
                if (bufPtr != IntPtr.Zero)
                {
                    NativeNetApi.NetApiBufferFree(bufPtr);
                }
            }

            if (users.Count == 0)
            {
                users.Add(new LocalUserDto
                {
                    Name = Environment.UserName,
                    Enabled = true,
                    IsAdmin = true,
                    Sid = "S-1-5-21-FALLBACK"
                });
            }

            return users;
        }

        private HashSet<string> GetAdminMemberSids()
        {
            var adminSids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!OperatingSystem.IsWindows()) return adminSids;

            IntPtr bufPtr = IntPtr.Zero;
            try
            {
                // 1. Resolução do nome localizado do grupo a partir do SID canônico S-1-5-32-544
                var adminGroupSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
                var adminGroupAccount = (NTAccount)adminGroupSid.Translate(typeof(NTAccount));
                string groupFullName = adminGroupAccount.Value;
                string groupName = groupFullName.Contains('\\') ? groupFullName.Split('\\')[1] : groupFullName;

                uint entriesRead = 0;
                uint totalEntries = 0;
                IntPtr resumeHandle = IntPtr.Zero;

                // Nível 2: LOCALGROUP_MEMBERS_INFO_2 (contém o ponteiro de SID lgrmi2_sid)
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

                if (status == 0 && bufPtr != IntPtr.Zero)
                {
                    int structSize = Marshal.SizeOf<NativeNetApi.LOCALGROUP_MEMBERS_INFO_2>();
                    for (int i = 0; i < entriesRead; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(bufPtr, i * structSize);
                        var member = Marshal.PtrToStructure<NativeNetApi.LOCALGROUP_MEMBERS_INFO_2>(currentPtr);
                        if (member.lgrmi2_sid != IntPtr.Zero)
                        {
                            try
                            {
                                var sid = new SecurityIdentifier(member.lgrmi2_sid);
                                adminSids.Add(sid.Value);
                            }
                            catch { }
                        }
                    }
                }
            }
            catch { }
            finally
            {
                if (bufPtr != IntPtr.Zero)
                {
                    NativeNetApi.NetApiBufferFree(bufPtr);
                }
            }

            return adminSids;
        }

        private static string? ResolveUserSid(string userName)
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

        private static bool IsCurrentProcessElevated()
        {
            if (!OperatingSystem.IsWindows()) return false;

            try
            {
                var identity = WindowsIdentity.GetCurrent();
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
            catch
            {
                return false;
            }
        }

        private static class NativeNetApi
        {
            public const uint FILTER_NORMAL_ACCOUNT = 0x0002;
            public const uint MAX_PREFERRED_LENGTH = 0xFFFFFFFF;
            public const uint UF_ACCOUNTDISABLE = 0x0002;

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

            [DllImport("netapi32.dll", SetLastError = true)]
            public static extern uint NetApiBufferFree(IntPtr buffer);
        }
    }
}
