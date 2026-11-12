using System;
using System.Runtime.InteropServices;
using System.Security.Principal;

#pragma warning disable CA1416 // Chamado somente pelo executor elevado no Windows.

namespace WinLab.Executor.Services
{
    /// <summary>
    /// Cria contas locais por API Win32, sem executar comandos de shell ou persistir senhas.
    /// Nunca modifica ou substitui contas existentes.
    /// </summary>
    internal static class LocalAccountProvisioner
    {
        private const uint UserPrivUser = 1;
        private const uint UfScript = 0x0001;
        private const uint UfNormalAccount = 0x0200;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct UserInfo1
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string Name;
            [MarshalAs(UnmanagedType.LPWStr)] public string Password;
            public uint PasswordAge;
            public uint Privilege;
            [MarshalAs(UnmanagedType.LPWStr)] public string? HomeDirectory;
            [MarshalAs(UnmanagedType.LPWStr)] public string? Comment;
            public uint Flags;
            [MarshalAs(UnmanagedType.LPWStr)] public string? ScriptPath;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        private struct LocalGroupMemberInfo3
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string DomainAndName;
        }

        [DllImport("Netapi32.dll", CharSet = CharSet.Unicode)]
        private static extern int NetUserAdd(
            string? serverName,
            uint level,
            ref UserInfo1 userInfo,
            out uint parameterError);

        [DllImport("Netapi32.dll", CharSet = CharSet.Unicode)]
        private static extern int NetLocalGroupAddMembers(
            string? serverName,
            string groupName,
            uint level,
            ref LocalGroupMemberInfo3 memberInfo,
            uint totalEntries);

        public static (bool Success, string Message) Create(string name, string password, bool isAdmin)
        {
            if (!OperatingSystem.IsWindows())
                return (false, "Criação de contas locais disponível somente no Windows.");

            using (var identity = WindowsIdentity.GetCurrent())
            {
                if (!new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator))
                    return (false, "É necessário autorizar a operação como administrador no Windows.");
            }

            if (string.IsNullOrWhiteSpace(name) ||
                name != name.Trim() ||
                name.Length > 20 ||
                name == "." || name == ".." ||
                name.IndexOfAny(new[] { '"', '/', '\\', '[', ']', ':', ';', '|', '=', ',', '+', '*', '?', '<', '>', '@' }) >= 0)
                return (false, "Nome de usuário inválido: utilize até 20 caracteres sem símbolos reservados.");

            if (string.IsNullOrEmpty(password) || password.Length < 8 || password.Length > 127)
                return (false, "A senha deve conter entre 8 e 127 caracteres.");

            var userInfo = new UserInfo1
            {
                Name = name,
                Password = password,
                Privilege = UserPrivUser,
                Flags = UfScript | UfNormalAccount,
                Comment = isAdmin ? "WinLab - Administrador local" : "WinLab - Usuário padrão"
            };

            int created = NetUserAdd(null, 1, ref userInfo, out _);
            if (created == 2224)
                return (false, "Esta conta já existe. Nenhuma alteração foi feita.");
            if (created != 0)
                return (false, $"O Windows recusou a criação da conta (código {created}). Verifique a política local de senhas.");

            var groupSid = new SecurityIdentifier(
                isAdmin ? WellKnownSidType.BuiltinAdministratorsSid : WellKnownSidType.BuiltinUsersSid,
                null);
            var groupAccount = (NTAccount)groupSid.Translate(typeof(NTAccount));
            string groupName = groupAccount.Value.Contains('\\')
                ? groupAccount.Value[(groupAccount.Value.LastIndexOf('\\') + 1)..]
                : groupAccount.Value;

            var member = new LocalGroupMemberInfo3 { DomainAndName = name };
            int added = NetLocalGroupAddMembers(null, groupName, 3, ref member, 1);
            if (added != 0 && added != 1378)
                return (false, $"A conta '{name}' foi criada, mas o Windows não confirmou a associação ao grupo '{groupName}' (código {added}). Verifique a conta no gerenciamento de usuários.");

            return (true, isAdmin
                ? $"Conta administrativa '{name}' criada no Windows."
                : $"Conta comum '{name}' criada no Windows.");
        }
    }
}
