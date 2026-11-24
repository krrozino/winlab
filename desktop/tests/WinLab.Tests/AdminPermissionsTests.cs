using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
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
    public void ExpansionPreservesExistingExternalRemovableDiskPolicy()
    {
        const string removableDisks = @"SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}";
        _registry.SetValue(RegistryHiveType.LocalMachine, removableDisks, "Deny_Read", 1);
        var expansion = new ExpansionEngine(_registry, _ => (true, "Synthetic capability"), protectExternal: true);
        var plan = new ExpansionPlan { Target = "usb", DenyExecute = true };

        var preview = expansion.Preview(plan);

        Assert.False(preview.CanApply);
        Assert.Throws<InvalidOperationException>(() => expansion.Apply(plan, preview.Revision));
        Assert.Equal(1, _registry.GetValue(RegistryHiveType.LocalMachine, removableDisks, "Deny_Read"));
        Assert.Null(_registry.GetValue(RegistryHiveType.LocalMachine, removableDisks, "Deny_Execute"));
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

    [Theory]
    [InlineData("personalization.lock_screen", false, @"SOFTWARE\Policies\Microsoft\Windows\Personalization", "NoChangingLockScreen", 1)]
    [InlineData("system.task_manager", true, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System", "DisableTaskMgr", 1)]
    [InlineData("network.lan_properties", true, @"SOFTWARE\Policies\Microsoft\Windows\Network Connections", "NC_LanProperties", 0)]
    [InlineData("settings.hide_network_pages", true, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\Explorer", "SettingsPageVisibility", "hide:network-status;network-ethernet;network-wifi;network-proxy")]
    [InlineData("apps.block_unmanaged_msi", false, MsiPath, "DisableMSI", 1)]
    public async Task HistoryRestoresAdministrativePolicyFromItsOwnTransaction(string id, bool perUser, string path, string valueName, object appliedValue)
    {
        string? sid = perUser ? StudentSid : null;
        var hive = perUser ? RegistryHiveType.Users : RegistryHiveType.LocalMachine;
        string key = perUser ? $@"{sid}\{path}" : path;
        var block = new AdminPermissionPlan(id, "Block", sid);
        var result = await _service.ApplyAsync(block, (await _service.PreviewAsync(block, true)).Revision);
        string transactionId = Assert.IsType<string>(result.TransactionId);
        Assert.Equal(appliedValue, _registry.GetValue(hive, key, valueName));

        var payload = new Dictionary<string, string>
        {
            ["permissionId"] = id, ["intent"] = "Restore", ["transactionId"] = transactionId
        };
        if (sid != null) payload["targetUserSid"] = sid;
        var envelope = JsonSerializer.SerializeToElement(new { type = "query", payload });
        var restore = Assert.IsType<AdminPermissionPlan>(
            AdminRequest.Parse(AdminActions.PermissionsPreview, envelope).PermissionPlan);
        var preview = await _service.PreviewAsync(restore, true);
        Assert.True(preview.CanApply);
        Assert.Equal(transactionId, preview.TransactionId);
        Assert.Equal(sid, preview.Target?.Sid);

        await _service.ApplyAsync(restore, preview.Revision);

        Assert.Null(_registry.GetValue(hive, key, valueName));
        Assert.Equal(TransactionStatus.RolledBack, (await _engine.GetTransactionAsync(transactionId))?.Status);
    }

    [Fact]
    public async Task HistoryCannotRestoreAnOlderAdministrativeTransactionOverTheCurrentOne()
    {
        var request = new ApplyTransactionRequestDto
        {
            Policies = [new PolicyApplyItemDto { PolicyId = MsiPolicy, DesiredState = "Blocked" }]
        };
        var older = await _engine.ApplyTransactionAsync(request);
        var newer = await _engine.ApplyTransactionAsync(request);
        Assert.True(older.Success && newer.Success);

        var restoreOld = new AdminPermissionPlan(MsiPolicy, "Restore", TransactionId: older.TransactionId);
        var oldPreview = await _service.PreviewAsync(restoreOld, true);
        var currentPreview = await _service.PreviewAsync(restoreOld with { TransactionId = newer.TransactionId }, true);

        Assert.False(oldPreview.CanApply);
        Assert.True(currentPreview.CanApply);
        await Assert.ThrowsAsync<InvalidOperationException>(() => _service.ApplyAsync(restoreOld, oldPreview.Revision));
        Assert.Equal(1, _registry.GetValue(RegistryHiveType.LocalMachine, MsiPath, "DisableMSI"));
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
    public async Task LegacyBatchCannotOverwriteDriftInAnotherPolicy()
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
        _registry.SetValue(RegistryHiveType.LocalMachine, MsiPath, "DisableMSI", 2);

        var history = await new Journal(_engine).ReadAsync(CancellationToken.None);
        var rolledBack = await _engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
        {
            TransactionId = applied.TransactionId
        }, confirmCurrent: tx => _service.CanRestoreBatch(tx, history));

        Assert.False(rolledBack.Success);
        Assert.Equal(1, _registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));
        Assert.Equal(2, _registry.GetValue(RegistryHiveType.LocalMachine, MsiPath, "DisableMSI"));
    }

    [Fact]
    public async Task LegacyBatchCannotRestoreAnOlderBaselineOverTheSameValueFromANewerTransaction()
    {
        var change = new ApplyTransactionRequestDto
        {
            Policies = [new PolicyApplyItemDto { PolicyId = Policy, DesiredState = "Blocked" }]
        };
        var older = await _engine.ApplyTransactionAsync(change);
        var newer = await _engine.ApplyTransactionAsync(change);
        Assert.True(older.Success && newer.Success);
        var history = await new Journal(_engine).ReadAsync(CancellationToken.None);

        var outcome = await _engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
        {
            TransactionId = older.TransactionId
        }, confirmCurrent: tx => _service.CanRestoreBatch(tx, history));

        Assert.False(outcome.Success);
        Assert.Equal(1, _registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));
    }

    [Fact]
    public async Task ProtectedJournalPublishesNewStateWhileAPreviousRecordIsOpen()
    {
        var engine = new TransactionEngine(new PolicyCatalog(), _registry, new MockUserHiveManager(), _directory,
            protectedRecordWriter: (file, mode) => new FileStream(file, mode, FileAccess.Write, FileShare.None));
        var applied = await engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
        {
            Policies = [new PolicyApplyItemDto { PolicyId = Policy, DesiredState = "Blocked" }]
        });
        Assert.True(applied.Success);
        string anchor = System.IO.Path.Combine(_directory, applied.TransactionId + ".json");
        var previous = Directory.GetFiles(_directory, "*.snapshot").Order(StringComparer.Ordinal).Last();
        using var anchorReader = File.Open(anchor, FileMode.Open, FileAccess.Read, FileShare.Read);
        using var priorReader = File.Open(previous, FileMode.Open, FileAccess.Read, FileShare.Read);

        var rollback = await engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
        {
            TransactionId = applied.TransactionId
        });

        Assert.True(rollback.Success);
        Assert.Equal(TransactionStatus.RolledBack, (await engine.GetTransactionAsync(applied.TransactionId))?.Status);
        Assert.Null(_registry.GetValue(RegistryHiveType.LocalMachine, Path, Value));
    }

    [Fact]
    public async Task InconsistentMultiValueBaselineCannotBePreviewedAsRestorable()
    {
        const string browserPolicy = "browser.chrome.incognito";
        var applied = await _engine.ApplyTransactionAsync(new ApplyTransactionRequestDto
        {
            Policies = [new PolicyApplyItemDto { PolicyId = browserPolicy, DesiredState = "Blocked" }]
        });
        Assert.True(applied.Success);
        await ChangeStoredTransaction(applied.TransactionId, tx => tx.RollbackPlan.Last().Operation = "InvalidOperation");

        var preview = await _service.PreviewAsync(new(browserPolicy, "Restore"), true);

        Assert.False(preview.CanApply);
    }

    [Fact]
    public async Task FailedSelectiveRollbackDoesNotInvalidateOtherBaselinesInItsBatch()
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
        await ChangeStoredTransaction(applied.TransactionId,
            tx => tx.RollbackPlan.Single(step => step.PolicyId == Policy).Operation = "InvalidOperation");

        var failed = await _engine.RollbackTransactionAsync(new RollbackTransactionRequestDto
        {
            TransactionId = applied.TransactionId
        }, policyId: Policy);

        Assert.False(failed.Success);
        Assert.True((await _service.PreviewAsync(new(MsiPolicy, "Restore"), true)).CanApply);
    }

    private async Task ChangeStoredTransaction(string id, Action<TransactionDto> change)
    {
        var transaction = Assert.IsType<TransactionDto>(await _engine.GetTransactionAsync(id));
        change(transaction);
        await File.WriteAllTextAsync(System.IO.Path.Combine(_directory, id + ".json"), JsonSerializer.Serialize(transaction));
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
