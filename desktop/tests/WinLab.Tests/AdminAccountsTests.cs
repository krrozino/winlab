using System;
using System.Collections.Generic;
using System.Linq;
using WinLab.Contracts.Administration;
using Xunit;

namespace WinLab.Tests;

public class AdminAccountsTests
{
    private const string RecoverySid = "S-1-5-21-1-2-3-1001";
    private const string StudentSid = "S-1-5-21-1-2-3-1002";
    private static readonly AdminManagementDto Standalone = new("NotDetected", "NotDetected", "NotDetected", "NotDetected");
    private static string Credential => new('x', 12);

    [Fact]
    public void RefusesToChangeAnAdministratorEvenWithARecoveryAccount()
    {
        var store = new AccountStore { RecoverySid = RecoverySid };
        var plan = new AdminAccountPlan("SetEnabled", Sid: RecoverySid, Enabled: false);
        var service = Service(store);

        Assert.False(service.Preview(plan, true).CanApply);
        Assert.Throws<InvalidOperationException>(() => service.Apply(plan, "", null));
        Assert.True(store.Accounts[0].Enabled);
    }

    [Fact]
    public void SuperadminCreationRequiresAnIndependentEnabledRecoveryAccount()
    {
        var store = new AccountStore();
        var service = Service(store);
        var plan = new AdminAccountPlan("Create", "gestor", "Superadmin");

        Assert.False(service.Preview(plan, true).CanApply);
        Assert.Throws<InvalidOperationException>(() => service.Apply(plan, "", Credential));
        Assert.Single(store.Accounts);
    }

    [Fact]
    public void RecoveryDesignationRequiresSuccessfulLocalLogon()
    {
        var store = new AccountStore { CanLogOn = false };
        var service = Service(store);
        var plan = new AdminAccountPlan("ProtectRecovery", Sid: RecoverySid);
        var before = service.Preview(plan, true);

        Assert.True(before.CanApply);
        Assert.Throws<InvalidOperationException>(() => service.Apply(plan, before.Revision, Credential));
        Assert.Null(store.RecoverySid);
    }

    [Fact]
    public void NewAccountRemainsDisabledWhenMembershipCannotBeVerified()
    {
        var store = new AccountStore { ConfirmGroups = false };
        var service = Service(store);
        var plan = new AdminAccountPlan("Create", "aluno", "Student");

        var preview = service.Preview(plan, true);
        Assert.Throws<InvalidOperationException>(() => service.Apply(plan, preview.Revision, Credential));
        Assert.False(Assert.Single(store.Accounts, account => account.Sid == StudentSid).Enabled);
        Assert.False(store.EnabledNewAccount);
    }

    [Fact]
    public void SuccessfulStudentCreationReportsObservedSidAndMembership()
    {
        var store = new AccountStore();
        var service = Service(store);
        var plan = new AdminAccountPlan("Create", "aluno", "Student");

        var result = service.Apply(plan, service.Preview(plan, true).Revision, Credential);

        Assert.Equal(StudentSid, result.Account.Sid);
        Assert.Contains(AdminAccountService.UsersGroupSid, result.Account.GroupSids);
        Assert.True(result.Account.Enabled);
    }

    [Fact]
    public void StalePreviewDoesNotChangeAccount()
    {
        var store = new AccountStore();
        var service = Service(store);
        var plan = new AdminAccountPlan("Create", "aluno", "Student");
        var preview = service.Preview(plan, true);

        store.Accounts.Add(new("aluno", StudentSid, true, "Unmanaged", "StandardUser", true, []));

        Assert.Throws<InvalidOperationException>(() => service.Apply(plan, preview.Revision, Credential));
        Assert.True(store.Accounts[1].Enabled);
    }

    [Fact]
    public void InstitutionalManagementPreventsAccountChanges()
    {
        var store = new AccountStore();
        var service = new AdminAccountService(store, () => Standalone with { Status = "Inconclusive" });
        var plan = new AdminAccountPlan("Create", "aluno", "Student");

        Assert.False(service.Preview(plan, true).CanApply);
        Assert.Throws<InvalidOperationException>(() => service.Apply(plan, "", Credential));
    }

    [Fact]
    public void StudentCannotBeDisabledWhenRecoveryIsUnavailable()
    {
        var store = new AccountStore();
        store.Accounts.Add(new("aluno", StudentSid, true, "Student", "StandardUser", false, [AdminAccountService.UsersGroupSid]));
        var service = Service(store);
        var plan = new AdminAccountPlan("SetEnabled", Sid: StudentSid, Enabled: false);

        Assert.False(service.Preview(plan, true).CanApply);
        Assert.True(store.Accounts[1].Enabled);
    }

    private static AdminAccountService Service(AccountStore store) => new(store, () => Standalone);

    private sealed class AccountStore : IAdminAccountStore, IAdminAccountWriter
    {
        public List<AdminAccountDto> Accounts { get; } =
            [new("recuperacao", AdminAccountsTests.RecoverySid, true, "Unmanaged", "Administrator", true, [AdminAccountService.AdministratorsGroupSid])];
        public string? RecoverySid { get; set; }
        public bool ConfirmGroups { get; init; } = true;
        public bool CanLogOn { get; init; } = true;
        public bool EnabledNewAccount { get; private set; }

        public AdminAccountInventory Read() => new(Accounts.ToArray(), RecoverySid, true);

        public AdminAccountDto CreateDisabled(string name, string password)
        {
            var account = new AdminAccountDto(name, StudentSid, false, "Unmanaged", "StandardUser", true, []);
            Accounts.Add(account);
            return account;
        }

        public void AddGroup(AdminAccountDto account, string groupSid)
        {
            if (ConfirmGroups)
                Update(account, old => old with { GroupSids = [groupSid], PrivilegeClassification =
                    groupSid == AdminAccountService.AdministratorsGroupSid ? "Administrator" : "StandardUser" });
        }

        public void SetEnabled(AdminAccountDto account, bool enabled)
        {
            EnabledNewAccount |= account.Sid == StudentSid && enabled;
            Update(account, old => old with { Enabled = enabled });
        }

        public void SetStudentEnabled(AdminAccountDto account, bool enabled) => SetEnabled(account, enabled);

        public void QuarantineCreatedAccount(AdminAccountDto account) =>
            Update(account, old => old with { Enabled = false, Role = "Unmanaged", Protected = true });
        public bool VerifyLocalLogon(AdminAccountDto account, string password) => CanLogOn;
        public void RecordRecovery(string sid)
        {
            RecoverySid = sid;
            Update(Accounts.First(x => x.Sid == sid), old => old with { Role = "Recovery" });
        }

        public void RecordRole(string sid, string role) => Update(Accounts.First(x => x.Sid == sid),
            old => old with { Role = role, Protected = role != "Student" });

        private void Update(AdminAccountDto account, Func<AdminAccountDto, AdminAccountDto> change)
        {
            int index = Accounts.FindIndex(x => x.Sid == account.Sid);
            Accounts[index] = change(Accounts[index]);
        }
    }
}
