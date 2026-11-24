using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text.Json;

namespace WinLab.Contracts.Administration;

public sealed record AdminAccountPlan(string Operation, string? Name = null, string? Role = null,
    string? Sid = null, bool? Enabled = null);

public sealed record AdminAccountInventory(IReadOnlyList<AdminAccountDto> Accounts, string? RecoverySid, bool Complete);

public interface IAdminAccountStore
{
    AdminAccountInventory Read();
}

public interface IAdminAccountWriter
{
    AdminAccountDto CreateDisabled(string name, string password);
    void AddGroup(AdminAccountDto account, string groupSid);
    void SetEnabled(AdminAccountDto account, bool enabled);
    void SetStudentEnabled(AdminAccountDto account, bool enabled);
    void QuarantineCreatedAccount(AdminAccountDto account);
    bool VerifyLocalLogon(AdminAccountDto account, string password);
    void RecordRecovery(string sid);
    void RecordRole(string sid, string role);
}

public sealed class AdminAccountService(IAdminAccountStore store, Func<AdminManagementDto> management)
{
    public const string AdministratorsGroupSid = "S-1-5-32-544";
    public const string UsersGroupSid = "S-1-5-32-545";
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const string Protection = "O WinLab só altera o estado de contas de aluno que provisionou e verificou. Administradores e contas de privilégio inconclusivo são protegidos.";
    private const string RecoveryProof = "A designação exige verificar a senha e o logon local. A consulta posterior confirma apenas a conta habilitada e sua associação ao grupo.";

    public AdminAccountsDto Query(bool canWrite)
    {
        var inventory = store.Read();
        var environment = management();
        return new(inventory.Accounts, inventory.RecoverySid,
            !inventory.Complete ? "Inconclusive" : inventory.RecoverySid == null ? "NotDesignated" :
                IsRecovery(Find(inventory, inventory.RecoverySid)) ? "Observed" : "Inconclusive",
            canWrite && inventory.Complete && environment.Status == "NotDetected", [Protection, RecoveryProof]);
    }

    public AdminAccountPreviewDto Preview(AdminAccountPlan plan, bool canWrite) =>
        Preview(plan, store.Read(), management(), canWrite);

    private static AdminAccountPreviewDto Preview(AdminAccountPlan plan, AdminAccountInventory inventory,
        AdminManagementDto environment, bool canWrite)
    {
        var notes = new List<string> { Protection };
        var canApply = canWrite && inventory.Complete && environment.Status == "NotDetected";
        if (!inventory.Complete) notes.Add("O Windows não confirmou o inventário local de contas.");
        if (environment.Status != "NotDetected") notes.Add("Gerenciamento institucional detectado ou inconclusivo. Operações de conta suspensas.");
        if (!canWrite) notes.Add("A operação exige uma instalação confiável e autorização administrativa do Windows.");

        AdminAccountDto? before;
        AdminAccountDto after;
        switch (plan.Operation)
        {
            case "Create":
                if (!IsValidName(plan.Name) || plan.Role is not ("Student" or "Superadmin"))
                    throw new ArgumentException("Informe um nome de conta local e uma função válidos.");
                before = inventory.Accounts.FirstOrDefault(account => string.Equals(account.Name, plan.Name, StringComparison.OrdinalIgnoreCase));
                bool admin = plan.Role == "Superadmin";
                after = new(plan.Name!, null, true, plan.Role, admin ? "Administrator" : "StandardUser", admin,
                    [admin ? AdministratorsGroupSid : UsersGroupSid]);
                if (before != null)
                {
                    canApply = false;
                    notes.Add("O nome já pertence a uma conta local.");
                }
                if (admin && (inventory.RecoverySid == null || !IsRecovery(Find(inventory, inventory.RecoverySid))))
                {
                    canApply = false;
                    notes.Add("Designe primeiro uma conta administrativa independente para recuperação.");
                }
                break;
            case "ProtectRecovery":
                before = Find(inventory, plan.Sid) ?? throw new ArgumentException("Selecione uma conta local existente por SID.");
                after = before with { Role = "Recovery", Protected = true };
                canApply &= before.Role is "Unmanaged" or "Recovery" && IsRecovery(before);
                canApply &= inventory.RecoverySid == null || inventory.RecoverySid == before.Sid ||
                    !IsRecovery(Find(inventory, inventory.RecoverySid));
                notes.Add(RecoveryProof);
                break;
            case "SetEnabled":
                before = Find(inventory, plan.Sid) ?? throw new ArgumentException("Selecione uma conta local existente por SID.");
                after = before with { Enabled = plan.Enabled ?? throw new ArgumentException("Informe o estado da conta.") };
                canApply &= IsManagedStudent(before) && before.Enabled != after.Enabled;
                if (!after.Enabled && !HasObservedRecovery(inventory))
                {
                    canApply = false;
                    notes.Add("A desativação exige uma conta administrativa de recuperação habilitada e com associação confirmada.");
                }
                break;
            default:
                throw new ArgumentException("Operação de conta desconhecida.");
        }

        string revision = Revision(new { plan, inventory, environment });
        return new(revision, "Machine", before, after, canApply, notes);
    }

    public AdminAccountResultDto Apply(AdminAccountPlan plan, string revision, string? password)
    {
        if (store is not IAdminAccountWriter writer)
            throw new InvalidOperationException("A consulta está em modo somente leitura.");
        var preview = Preview(plan, true);
        if (!preview.CanApply || !string.Equals(preview.Revision, revision, StringComparison.Ordinal))
            throw new InvalidOperationException("Operação de conta indisponível ou desatualizada. Consulte a prévia novamente.");

        if (plan.Operation == "SetEnabled")
        {
            writer.SetStudentEnabled(preview.Before!, preview.After.Enabled);
            var updated = Find(store.Read(), plan.Sid);
            if (updated == null || updated.Enabled != preview.After.Enabled || !IsManagedStudent(updated))
            {
                if (updated is { Enabled: false } && preview.Before!.Enabled)
                    writer.SetEnabled(updated, true);
                throw new InvalidOperationException("O Windows não confirmou o novo estado da conta.");
            }
            return new(updated, "Estado da conta de aluno verificado no Windows.");
        }

        if (password == null || password.Length > 127 || password.Length < (plan.Operation == "Create" ? 8 : 1) || password.Contains('\0'))
            throw new ArgumentException("Informe uma credencial local válida.");

        if (plan.Operation == "ProtectRecovery")
        {
            if (!writer.VerifyLocalLogon(preview.Before!, password) || !IsRecovery(Find(store.Read(), plan.Sid)))
                throw new InvalidOperationException("O Windows não confirmou o logon local da conta administrativa de recuperação.");
            writer.RecordRecovery(plan.Sid!);
            var account = Find(store.Read(), plan.Sid);
            if (account?.Role != "Recovery" || !IsRecovery(account))
                throw new InvalidOperationException("O WinLab não confirmou a designação da recuperação.");
            return new(account, "Logon local verificado e conta de recuperação protegida pelo WinLab.");
        }

        var created = writer.CreateDisabled(plan.Name!, password);
        try
        {
            string groupSid = preview.After.GroupSids[0];
            writer.AddGroup(created, groupSid);
            var verified = Find(store.Read(), created.Sid);
            if (!MatchesNewAccount(verified, preview.After) || verified!.Enabled)
                throw new InvalidOperationException();

            writer.RecordRole(created.Sid!, plan.Role!);
            writer.SetEnabled(verified, true);
            verified = Find(store.Read(), created.Sid);
            if (!MatchesNewAccount(verified, preview.After) || !verified!.Enabled || verified.Role != plan.Role)
                throw new InvalidOperationException();

            return new(verified, "Conta local criada e associação ao grupo verificada por SID.");
        }
        catch (Exception ex) when (IsAccountFailure(ex))
        {
            try { writer.QuarantineCreatedAccount(created); }
            catch (Exception cleanup) when (IsAccountFailure(cleanup))
            {
                throw new InvalidOperationException("Falha parcial na criação. Confira o estado da nova conta no gerenciamento de usuários do Windows.");
            }
            throw new InvalidOperationException("O Windows não confirmou o provisionamento. A conta incompleta permanece desabilitada para revisão pelo operador.");
        }
    }

    private static bool IsAccountFailure(Exception ex) => ex is InvalidOperationException or System.IO.IOException or
        UnauthorizedAccessException or System.Security.SecurityException or System.ComponentModel.Win32Exception or ArgumentException
        or IdentityNotMappedException;

    public static bool IsManagedStudent(AdminAccountDto account) => !account.Protected && account.Role == "Student" &&
        account.PrivilegeClassification == "StandardUser" && account.GroupSids.Contains(UsersGroupSid) &&
        !account.GroupSids.Contains(AdministratorsGroupSid);

    private static bool IsRecovery(AdminAccountDto? account) => account is { Enabled: true, PrivilegeClassification: "Administrator" }
        && account.GroupSids.Contains(AdministratorsGroupSid) && account.Role != "Superadmin";

    public static bool HasObservedRecovery(AdminAccountInventory inventory) => inventory.Complete &&
        inventory.RecoverySid != null && IsRecovery(Find(inventory, inventory.RecoverySid));

    private static bool MatchesNewAccount(AdminAccountDto? account, AdminAccountDto proposal) => account != null &&
        account.PrivilegeClassification == proposal.PrivilegeClassification &&
        account.GroupSids.Contains(proposal.GroupSids[0]) &&
        (proposal.Role != "Student" || !account.GroupSids.Contains(AdministratorsGroupSid));

    private static AdminAccountDto? Find(AdminAccountInventory inventory, string? sid) => sid == null ? null :
        inventory.Accounts.SingleOrDefault(account => string.Equals(account.Sid, sid, StringComparison.Ordinal));

    internal static bool IsValidName(string? name) => name is { Length: > 0 and <= 20 } && name == name.Trim() &&
        name != "." && name != ".." && !name.EndsWith('.') && !name.Any(char.IsControl) &&
        name.IndexOfAny(['"', '/', '\\', '[', ']', ':', ';', '|', '=', ',', '+', '*', '?', '<', '>', '@']) < 0;

    internal static string Revision<T>(T state) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(state, Json)));
}
