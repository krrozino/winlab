using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Contracts.Scanning
{
    public sealed record EnumeratedLocalUser(
        string Name,
        bool Enabled,
        bool IsPrivilegeAdminFlag,
        string? Sid);

    public interface ILocalAccountsProbe
    {
        bool IsWindowsPlatform { get; }
        bool IsCurrentProcessElevated { get; }
        string CurrentUserName { get; }
        string? CurrentUserSid { get; }
        string? LocalizedAdministratorsGroupName { get; }
        AdminGroupMembersSnapshot QueryAdminGroupMembers();
        (bool Succeeded, IReadOnlyList<EnumeratedLocalUser> Users, string? Error) EnumerateNormalUsers();
        UserLocalGroupsSnapshot QueryUserLocalGroups(string userName);
    }

    internal sealed class WindowsLocalAccountsProbe : ILocalAccountsProbe
    {
        public bool IsWindowsPlatform => OperatingSystem.IsWindows();

        public bool IsCurrentProcessElevated
        {
            get
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
        }

        public string CurrentUserName => Environment.UserName;

        public string? CurrentUserSid
        {
            get
            {
                if (!OperatingSystem.IsWindows()) return null;
                try
                {
                    return WindowsIdentity.GetCurrent().User?.Value;
                }
                catch
                {
                    return null;
                }
            }
        }

        public string? LocalizedAdministratorsGroupName
        {
            get
            {
                WindowsAccountPrivilegeHelper.TryGetLocalizedAdministratorsGroupName(out string? groupName, out _);
                return groupName;
            }
        }

        public AdminGroupMembersSnapshot QueryAdminGroupMembers()
        {
            return WindowsAccountPrivilegeHelper.QueryAdminGroupMembers();
        }

        public (bool Succeeded, IReadOnlyList<EnumeratedLocalUser> Users, string? Error) EnumerateNormalUsers()
        {
            if (!OperatingSystem.IsWindows())
            {
                return (false, Array.Empty<EnumeratedLocalUser>(), "Plataforma não é Windows.");
            }

            var users = new List<EnumeratedLocalUser>();
            IntPtr bufPtr = IntPtr.Zero;

            try
            {
                uint entriesRead = 0;
                uint totalEntries = 0;
                uint resumeHandle = 0;

                uint status = WindowsAccountPrivilegeHelper.NativeNetApi.NetUserEnum(
                    null,
                    1,
                    WindowsAccountPrivilegeHelper.NativeNetApi.FILTER_NORMAL_ACCOUNT,
                    out bufPtr,
                    WindowsAccountPrivilegeHelper.NativeNetApi.MAX_PREFERRED_LENGTH,
                    out entriesRead,
                    out totalEntries,
                    ref resumeHandle
                );

                if (status != 0 || (entriesRead > 0 && bufPtr == IntPtr.Zero))
                {
                    return (false, Array.Empty<EnumeratedLocalUser>(), $"NetUserEnum falhou com código Win32 {status}.");
                }

                if (bufPtr != IntPtr.Zero)
                {
                    int structSize = Marshal.SizeOf<WindowsAccountPrivilegeHelper.NativeNetApi.USER_INFO_1>();
                    for (int i = 0; i < entriesRead; i++)
                    {
                        IntPtr currentPtr = IntPtr.Add(bufPtr, i * structSize);
                        var user = Marshal.PtrToStructure<WindowsAccountPrivilegeHelper.NativeNetApi.USER_INFO_1>(currentPtr);

                        string name = user.usri1_name ?? string.Empty;
                        if (string.IsNullOrWhiteSpace(name)) continue;

                        bool isEnabled = (user.usri1_flags & WindowsAccountPrivilegeHelper.NativeNetApi.UF_ACCOUNTDISABLE) == 0;
                        bool isPrivAdmin = user.usri1_priv == WindowsAccountPrivilegeHelper.NativeNetApi.USER_PRIV_ADMIN;
                        string? sid = WindowsAccountPrivilegeHelper.ResolveUserSid(name);

                        users.Add(new EnumeratedLocalUser(name, isEnabled, isPrivAdmin, sid));
                    }
                }

                return (true, users, null);
            }
            catch (Exception ex)
            {
                return (false, Array.Empty<EnumeratedLocalUser>(), $"Exceção ao enumerar contas locais: {ex.Message}");
            }
            finally
            {
                if (bufPtr != IntPtr.Zero)
                {
                    WindowsAccountPrivilegeHelper.NativeNetApi.NetApiBufferFree(bufPtr);
                }
            }
        }

        public UserLocalGroupsSnapshot QueryUserLocalGroups(string userName)
        {
            return WindowsAccountPrivilegeHelper.QueryUserLocalGroups(userName);
        }
    }

    public class LocalAccountsScanner : ILocalAccountsScanner
    {
        private readonly ILocalAccountsProbe _probe;

        public LocalAccountsScanner() : this(new WindowsLocalAccountsProbe())
        {
        }

        public LocalAccountsScanner(ILocalAccountsProbe probe)
        {
            _probe = probe ?? throw new ArgumentNullException(nameof(probe));
        }

        public List<LocalUserDto> ScanAccounts()
        {
            if (!_probe.IsWindowsPlatform)
            {
                return new List<LocalUserDto>
                {
                    new LocalUserDto
                    {
                        Name = _probe.CurrentUserName,
                        Enabled = true,
                        IsAdmin = true,
                        PrivilegeClassification = AccountPrivilegeClassification.Administrator,
                        ClassificationDetail = "Ambiente não-Windows (execução de desenvolvimento).",
                        Sid = "S-1-5-21-NON-WINDOWS"
                    }
                };
            }

            var adminSnapshot = _probe.QueryAdminGroupMembers();
            var adminSids = new HashSet<string>(adminSnapshot.MemberSids ?? Array.Empty<string>(), StringComparer.OrdinalIgnoreCase);
            string? adminGroupName = _probe.LocalizedAdministratorsGroupName;

            var (enumSucceeded, rawUsers, enumError) = _probe.EnumerateNormalUsers();
            var users = new List<LocalUserDto>();

            if (!enumSucceeded)
            {
                bool isElevated = _probe.IsCurrentProcessElevated;
                string? currentSid = _probe.CurrentUserSid;
                bool isKnownAdmin = isElevated ||
                                    (!string.IsNullOrWhiteSpace(currentSid) &&
                                     (adminSids.Contains(currentSid) || currentSid.EndsWith("-500", StringComparison.OrdinalIgnoreCase)));

                users.Add(new LocalUserDto
                {
                    Name = _probe.CurrentUserName,
                    Enabled = true,
                    IsAdmin = isKnownAdmin,
                    PrivilegeClassification = isKnownAdmin
                        ? AccountPrivilegeClassification.Administrator
                        : AccountPrivilegeClassification.Unknown,
                    ClassificationDetail = isKnownAdmin
                        ? null
                        : (enumError ?? "Falha ao enumerar contas locais; classificação de privilégio desconhecida."),
                    Sid = currentSid
                });
                return users;
            }

            foreach (var raw in rawUsers)
            {
                if (string.IsNullOrWhiteSpace(raw.Name)) continue;

                bool isRid500 = !string.IsNullOrWhiteSpace(raw.Sid) &&
                                raw.Sid.EndsWith("-500", StringComparison.OrdinalIgnoreCase);
                bool isDirectAdmin = !string.IsNullOrWhiteSpace(raw.Sid) &&
                                     adminSids.Contains(raw.Sid);

                var localGroups = _probe.QueryUserLocalGroups(raw.Name);
                bool isIndirectAdmin = localGroups.Succeeded &&
                                       !string.IsNullOrWhiteSpace(adminGroupName) &&
                                       localGroups.GroupNames.Contains(adminGroupName, StringComparer.OrdinalIgnoreCase);

                if (isRid500 || raw.IsPrivilegeAdminFlag || isDirectAdmin || isIndirectAdmin)
                {
                    users.Add(new LocalUserDto
                    {
                        Name = raw.Name,
                        Enabled = raw.Enabled,
                        IsAdmin = true,
                        PrivilegeClassification = AccountPrivilegeClassification.Administrator,
                        Sid = raw.Sid
                    });
                }
                else if (string.IsNullOrWhiteSpace(raw.Sid))
                {
                    users.Add(new LocalUserDto
                    {
                        Name = raw.Name,
                        Enabled = raw.Enabled,
                        IsAdmin = false,
                        PrivilegeClassification = AccountPrivilegeClassification.Unknown,
                        ClassificationDetail = "Não foi possível resolver o SID da conta; classificação desconhecida.",
                        Sid = null
                    });
                }
                else if (!adminSnapshot.Succeeded)
                {
                    users.Add(new LocalUserDto
                    {
                        Name = raw.Name,
                        Enabled = raw.Enabled,
                        IsAdmin = false,
                        PrivilegeClassification = AccountPrivilegeClassification.Unknown,
                        ClassificationDetail = adminSnapshot.Error ?? "Falha ao consultar o grupo Administradores; conta não classificada como comum.",
                        Sid = raw.Sid
                    });
                }
                else if (adminSnapshot.HasNestedGroupMembers && !localGroups.Succeeded)
                {
                    users.Add(new LocalUserDto
                    {
                        Name = raw.Name,
                        Enabled = raw.Enabled,
                        IsAdmin = false,
                        PrivilegeClassification = AccountPrivilegeClassification.Unknown,
                        ClassificationDetail = localGroups.Error ?? "Grupo Administradores contém grupos aninhados e a associação indireta não pôde ser verificada.",
                        Sid = raw.Sid
                    });
                }
                else
                {
                    users.Add(new LocalUserDto
                    {
                        Name = raw.Name,
                        Enabled = raw.Enabled,
                        IsAdmin = false,
                        PrivilegeClassification = AccountPrivilegeClassification.StandardUser,
                        Sid = raw.Sid
                    });
                }
            }

            if (users.Count == 0)
            {
                users.Add(new LocalUserDto
                {
                    Name = _probe.CurrentUserName,
                    Enabled = true,
                    IsAdmin = false,
                    PrivilegeClassification = AccountPrivilegeClassification.Unknown,
                    ClassificationDetail = "Nenhuma conta local retornada na enumeração; elegibilidade desconhecida.",
                    Sid = null
                });
            }

            return users;
        }
    }
}
