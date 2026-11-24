using System;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;
using WinLab.Contracts.Administration;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

#pragma warning disable CA1416 // O processo executor só chama as operações nativas no Windows.

namespace WinLab.Executor.Services;

internal sealed class LocalAccountProvisioner(IRegistryService registry, WindowsAdminAccountStore reader)
    : IAdminAccountStore, IAdminAccountWriter
{
    private const uint UserPrivUser = 1;
    private const uint UfScript = 0x0001;
    private const uint UfAccountDisabled = 0x0002;
    private const uint UfNormalAccount = 0x0200;

    public AdminAccountInventory Read() => reader.Read();

    public AdminAccountDto CreateDisabled(string name, string password)
    {
        EnsureAdministrator();
        IntPtr nativeCredential = Marshal.StringToCoTaskMemUni(password);
        try
        {
            var info = new UserInfo1
            {
                Name = name,
                Password = nativeCredential,
                Privilege = UserPrivUser,
                Flags = UfScript | UfNormalAccount | UfAccountDisabled,
                Comment = "Conta local provisionada pelo WinLab"
            };
            int result = NetUserAdd(null, 1, ref info, out _);
            if (result == 2224)
                throw new InvalidOperationException("Esta conta já existe.");
            CheckResult(result, "criar a conta desabilitada");
        }
        finally
        {
            Marshal.ZeroFreeCoTaskMemUnicode(nativeCredential);
        }

        string? sid = WindowsAdminAccountStore.ResolveLocalSid(name);
        if (sid == null)
            throw new InvalidOperationException("O Windows criou a conta desabilitada, mas o SID não foi confirmado. Verifique a conta no Windows.");
        return new(name, sid, false, "Unmanaged", "Unknown", true, []);
    }

    public void AddGroup(AdminAccountDto account, string groupSid)
    {
        EnsureAdministrator();
        EnsureSameAccount(account);
        if (groupSid is not (AdminAccountService.AdministratorsGroupSid or AdminAccountService.UsersGroupSid))
            throw new InvalidOperationException("Grupo interno não permitido.");

        var group = new SecurityIdentifier(groupSid);
        string qualifiedGroup = group.Translate(typeof(NTAccount)).Value;
        string groupName = qualifiedGroup[(qualifiedGroup.LastIndexOf('\\') + 1)..];
        var memberSid = new SecurityIdentifier(account.Sid!);
        byte[] binary = new byte[memberSid.BinaryLength];
        memberSid.GetBinaryForm(binary, 0);
        var pinned = GCHandle.Alloc(binary, GCHandleType.Pinned);
        try
        {
            // LOCALGROUP_MEMBERS_INFO_0 contém apenas o ponteiro para o SID.
            IntPtr member = pinned.AddrOfPinnedObject();
            int result = NetLocalGroupAddMembers(null, groupName, 0, ref member, 1);
            if (result != 1378) CheckResult(result, "associar a conta ao grupo");
        }
        finally
        {
            pinned.Free();
        }
    }

    public void SetEnabled(AdminAccountDto account, bool enabled)
    {
        EnsureAdministrator();
        uint flags = GetVerifiedFlags(account);
        flags = enabled ? flags & ~UfAccountDisabled : flags | UfAccountDisabled;
        EnsureSameAccount(account);
        CheckResult(NetUserSetInfo(null, account.Name, 1008, ref flags, out _), "alterar o estado da conta");
    }

    public void RemoveCreatedAccount(AdminAccountDto account)
    {
        // Uma criação interrompida antes da limpeza continua desabilitada.
        SetEnabled(account, false);
        EnsureSameAccount(account);
        CheckResult(NetUserDel(null, account.Name), "remover a conta recém-criada e incompleta");
        registry.DeleteValue(RegistryHiveType.LocalMachine, WindowsAdminAccountStore.RegistryPath, account.Sid!);
    }

    public bool VerifyLocalLogon(AdminAccountDto account, string password)
    {
        EnsureAdministrator();
        EnsureSameAccount(account);
        IntPtr nativeCredential = Marshal.StringToCoTaskMemUni(password);
        try
        {
            const int Interactive = 2;
            const int DefaultProvider = 0;
            bool authenticated = LogonUser(account.Name, ".", nativeCredential, Interactive, DefaultProvider, out var token);
            using (token)
            {
                if (!authenticated) return false;
                using var identity = new WindowsIdentity(token.DangerousGetHandle());
                return identity.User?.Value == account.Sid;
            }
        }
        finally
        {
            Marshal.ZeroFreeCoTaskMemUnicode(nativeCredential);
        }
    }

    public void RecordRecovery(string sid) => Record(WindowsAdminAccountStore.RecoveryValue, sid);
    public void RecordRole(string sid, string role) => Record(sid, role);

    private void Record(string name, string value)
    {
        EnsureAdministrator();
        registry.SetValue(RegistryHiveType.LocalMachine, WindowsAdminAccountStore.RegistryPath, name, value, RegistryValueType.String);
    }

    private static uint GetVerifiedFlags(AdminAccountDto account)
    {
        int result = NetUserGetInfo(null, account.Name, 23, out var pointer);
        try
        {
            CheckResult(result, "consultar a conta local");
            var info = Marshal.PtrToStructure<UserInfo23>(pointer);
            if (info.UserSid == IntPtr.Zero || new SecurityIdentifier(info.UserSid).Value != account.Sid)
                throw new InvalidOperationException("O SID da conta mudou. Atualize o inventário.");
            return info.Flags;
        }
        finally
        {
            if (pointer != IntPtr.Zero) NetApiBufferFree(pointer);
        }
    }

    private static void EnsureSameAccount(AdminAccountDto account)
    {
        if (account.Sid == null || WindowsAdminAccountStore.ResolveLocalSid(account.Name) != account.Sid)
            throw new InvalidOperationException("O SID da conta mudou. Atualize o inventário.");
    }

    private static void EnsureAdministrator()
    {
        if (!OperatingSystem.IsWindows())
            throw new InvalidOperationException("Operação disponível somente no Windows.");
        using var identity = WindowsIdentity.GetCurrent();
        if (identity.User == null || !AdminRequest.IsLocalSid(identity.User.Value)
            || !new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
            throw new InvalidOperationException("É necessária autorização administrativa local do Windows.");
    }

    private static void CheckResult(int code, string action)
    {
        if (code != 0)
            throw new InvalidOperationException($"O Windows recusou a operação de {action} (código {code}).");
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct UserInfo1
    {
        public string Name;
        public IntPtr Password;
        public uint PasswordAge;
        public uint Privilege;
        public string? HomeDirectory;
        public string? Comment;
        public uint Flags;
        public string? ScriptPath;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct UserInfo23
    {
        public IntPtr Name;
        public IntPtr FullName;
        public IntPtr Comment;
        public uint Flags;
        public IntPtr UserSid;
    }

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetUserAdd(string? server, uint level, ref UserInfo1 info, out uint parameterError);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetUserGetInfo(string? server, string name, uint level, out IntPtr info);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetUserSetInfo(string? server, string name, uint level, ref uint flags, out uint parameterError);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetUserDel(string? server, string name);

    [DllImport("netapi32.dll", CharSet = CharSet.Unicode)]
    private static extern int NetLocalGroupAddMembers(string? server, string group, uint level, ref IntPtr member, uint count);

    [DllImport("netapi32.dll")]
    private static extern int NetApiBufferFree(IntPtr buffer);

    [DllImport("advapi32.dll", EntryPoint = "LogonUserW", CharSet = CharSet.Unicode, SetLastError = true, ExactSpelling = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool LogonUser(string user, string domain, IntPtr password, int logonType, int provider, out SafeAccessTokenHandle token);
}
