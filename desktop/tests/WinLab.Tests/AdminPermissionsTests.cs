using System;
using System.Collections.Generic;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Administration;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;
using Xunit;

namespace WinLab.Tests;

public sealed class AdminPermissionsTests : IDisposable
{
    private const string Policy = "storage.usb_write_protect";
    private const string Path = @"SYSTEM\CurrentControlSet\Control\StorageDevicePolicies";
    private const string Value = "WriteProtect";
    private const string MsiPolicy = "apps.block_unmanaged_msi";
    private const string MsiPath = @"SOFTWARE\Policies\Microsoft\Windows\Installer";
    private const string StudentSid = "S-1-5-21-1-2-3-1004";
    private readonly string _directory = System.IO.Path.Combine(System.IO.Path.GetTempPath(), Guid.NewGuid().ToString("N"));
    private readonly InMemoryRegistryService _registry = new();
    private readonly AdminPermissionService _service;
    private readonly TransactionEngine _engine;
    private AdminManagementDto _management = new("NotDetected", "NotDetected", "NotDetected", "NotDetected");

    public AdminPermissionsTests()
    {
        var catalog = new PolicyCatalog(includeAdminPermissions: true);
        var hives = new MockUserHiveManager();
        _engine = new TransactionEngine(catalog, _registry, hives, _directory);
        var expansion = new ExpansionEngine(_registry, _ => (true, "Synthetic capability"));
        _service = new(catalog, _registry, hives, new Journal(_engine), new Accounts(), () => _management,
            _ => (true, "Synthetic capability"), expansion);
    }

    [Fact]
    public async Task PreviewShowsObservedRegistryAndProposedValueWithoutApplying()
    {
        var plan = new AdminPermissionPlan(Policy, "Block");
        var preview = await _service.PreviewAsync(plan, true);

        Assert.True(preview.CanApply);
        Assert.Equal("NotConfigured", preview.Before.ConfiguredState);
        Assert.Equal("Blocked", preview.After.ConfiguredState);
        Assert.Equal("NotVerified", preview.After.EffectiveState);
        Assert.Null(_registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));
    }

    [Fact]
    public async Task ExistingExternalRestrictionCannotBeRemovedOrClaimed()
    {
        _registry.SetValue(RegistryHiveType.LocalMachine, Path, Value, 1);

        var block = await _service.PreviewAsync(new(Policy, "Block"), true);
        var allow = await _service.PreviewAsync(new(Policy, "Allow"), true);

        Assert.Equal("ExternalLocal", block.Before.Origin);
        Assert.False(block.CanApply);
        Assert.False(allow.CanApply);
    }

    [Fact]
    public async Task ConfirmedWinLabRestrictionRestoresRecordedBaselineWithoutClaimingPermission()
    {
        var block = new AdminPermissionPlan(Policy, "Block");
        var preview = await _service.PreviewAsync(block, true);
        var applied = await _service.ApplyAsync(block, preview.Revision);
        Assert.Equal("WinLab", applied.Permission.State.Origin);
        Assert.Equal(1, _registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));

        var allow = new AdminPermissionPlan(Policy, "Allow");
        var recovery = await _service.PreviewAsync(allow, true);
        Assert.True(recovery.CanApply);
        Assert.Equal("NotVerified", recovery.After.EffectiveState);
        await _service.ApplyAsync(allow, recovery.Revision);
        Assert.Null(_registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));
    }

    [Fact]
    public async Task ExternalChangeAfterPreviewPreventsRollback()
    {
        var block = new AdminPermissionPlan(Policy, "Block");
        await _service.ApplyAsync(block, (await _service.PreviewAsync(block, true)).Revision);

        var restore = new AdminPermissionPlan(Policy, "Restore");
        var preview = await _service.PreviewAsync(restore, true);
        _registry.SetValue(RegistryHiveType.LocalMachine, Path, Value, 0);

        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.ApplyAsync(restore, preview.Revision));
        Assert.Equal(0, _registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));
    }

    [Fact]
    public async Task InstitutionalEvidenceBlocksMachineWrites()
    {
        _management = _management with { Status = "Detected", Domain = "Detected" };
        _registry.SetValue(RegistryHiveType.LocalMachine, Path, Value, 1);

        var preview = await _service.PreviewAsync(new(Policy, "Block"), true);
        Assert.Equal("InstitutionalPossible", preview.Before.Origin);
        Assert.False(preview.CanApply);
    }

    [Fact]
    public async Task RestoringOnePolicyFromAnExistingBatchLeavesOtherPoliciesIntact()
    {
        var applied = await _engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
        {
            Policies =
            [
                new PolicyApplyItemDto { PolicyId = Policy, DesiredState = "Blocked" },
                new PolicyApplyItemDto { PolicyId = MsiPolicy, DesiredState = "Blocked" }
            ]
        });
        Assert.True(applied.Success);

        var plan = new AdminPermissionPlan(Policy, "Restore");
        var preview = await _service.PreviewAsync(plan, true);
        Assert.True(preview.CanApply);
        await _service.ApplyAsync(plan, preview.Revision);

        Assert.Null(_registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));
        Assert.Equal(1, _registry.GetValue(RegistryHiveType.LocalMachine, MsiPath, "DisableMSI"));
        Assert.True((await _service.PreviewAsync(new(MsiPolicy, "Restore"), true)).CanApply);
    }

    [Fact]
    public async Task SettingsPageRestrictionUsesARealUserScopedRegistryString()
    {
        var plan = new AdminPermissionPlan("settings.hide_network_pages", "Block", StudentSid);
        var preview = await _service.PreviewAsync(plan, true);
        Assert.Equal(StudentSid, preview.Target?.Sid);
        Assert.Equal("User", preview.Scope);

        await _service.ApplyAsync(plan, preview.Revision);

        const string settings = StudentSid + @"\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer";
        Assert.Equal("hide:network-status;network-ethernet;network-wifi;network-proxy",
            _registry.GetValue(RegistryHiveType.Users, settings, "SettingsPageVisibility"));
        Assert.Null(_registry.GetValue(RegistryHiveType.LocalMachine, settings, "SettingsPageVisibility"));
    }

    private sealed class Accounts : IAdminAccountStore
    {
        public AdminAccountInventory Read() => new(
            [new("aluno", StudentSid, true, "Student", "StandardUser", false, [AdminAccountService.UsersGroupSid])], null, true);
    }

    private sealed class Journal(TransactionEngine engine) : IAdminPolicyJournal
    {
        public bool CanWrite => true;
        public TransactionEngine OpenForWrite() => engine;

        public async Task<AdminPolicyHistory> ReadAsync(CancellationToken ct)
        {
            var records = new List<AdminPolicyRecord>();
            foreach (var record in await engine.ListTransactionsAsync(ct))
                records.Add(new(engine, record));
            return new(records, true);
        }
    }

    public void Dispose()
    {
        if (Directory.Exists(_directory)) Directory.Delete(_directory, recursive: true);
    }
}
