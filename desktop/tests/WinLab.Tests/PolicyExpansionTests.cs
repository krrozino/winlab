using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Scanning;
using Xunit;

namespace WinLab.Tests;

public class PolicyExpansionTests
{
    [Theory]
    [InlineData("""{"target":"chrome","blockExtensions":true,"allowedExtensions":["bad"],"blockedSites":[],"allowedSites":[],"restrictSites":false,"blockProfiles":false}""")]
    [InlineData("""{"target":"edge","blockExtensions":true,"allowedExtensions":[],"blockedSites":["*"],"allowedSites":[],"restrictSites":false,"blockProfiles":false}""")]
    [InlineData("""{"target":"edge","blockExtensions":true,"allowedExtensions":[],"blockedSites":[],"allowedSites":[],"restrictSites":true,"blockProfiles":false}""")]
    [InlineData("""{"target":"edge","target":"chrome","blockExtensions":true,"allowedExtensions":[],"blockedSites":[],"allowedSites":[],"restrictSites":false,"blockProfiles":false}""")]
    [InlineData("""{"target":"edge","blockExtensions":true,"allowedExtensions":[],"blockedSites":[],"allowedSites":[],"restrictSites":false,"blockProfiles":false,"registryPath":"elsewhere"}""")]
    public void InvalidBrowserPayloadCannotBecomeAPlan(string json)
    {
        using var document = JsonDocument.Parse(json);
        Assert.Throws<ArgumentException>(() => ExpansionRequest.ParsePlan(document.RootElement));
    }

    [Fact]
    public void BrowserPreviewDoesNotWriteAndRollbackRestoresTypedValuesAndAbsentKeys()
    {
        var registry = new InMemoryRegistryService();
        const string root = @"SOFTWARE\Policies\Google\Chrome";
        registry.SetValue("HKLM", root, "BrowserAddPersonEnabled", 1);
        registry.SetValue("HKLM", root + @"\URLBlocklist", "3", "old.example", Contracts.Transactions.RegistryValueType.String);
        var engine = new ExpansionEngine(registry, _ => (true, "disponível"));
        var plan = new ExpansionPlan { Target = "chrome", RestrictSites = true, AllowedSites = new[] { "https://school.example" }, BlockProfiles = true };
        var preview = engine.Preview(plan);
        Assert.Equal("old.example", registry.GetValue("HKLM", root + @"\URLBlocklist", "3"));
        Assert.False(registry.KeyExists(Contracts.Transactions.RegistryHiveType.LocalMachine, root + @"\URLAllowlist"));

        engine.Apply(plan, preview.Revision);
        Assert.Equal("*", registry.GetValue("HKLM", root + @"\URLBlocklist", "1"));
        Assert.Equal(0, registry.GetValue("HKLM", root, "BrowserAddPersonEnabled"));
        Assert.Equal("Configured", engine.Query("chrome").State);
        Assert.NotNull(engine.Query("chrome").RollbackRevision);

        var reopened = new ExpansionEngine(registry, _ => (true, "disponível"));
        reopened.Rollback("chrome", reopened.Query("chrome").RollbackRevision!);
        Assert.Equal("old.example", registry.GetValue("HKLM", root + @"\URLBlocklist", "3"));
        Assert.False(registry.KeyExists(Contracts.Transactions.RegistryHiveType.LocalMachine, root + @"\URLAllowlist"));
        Assert.Equal(1, registry.GetValue("HKLM", root, "BrowserAddPersonEnabled"));
    }

    [Fact]
    public void StaleConfirmationAndExternalDivergencePreventWrites()
    {
        var registry = new InMemoryRegistryService();
        const string root = @"SOFTWARE\Policies\Microsoft\Edge";
        var engine = new ExpansionEngine(registry, _ => (true, "disponível"));
        var plan = new ExpansionPlan { Target = "edge", BlockProfiles = true };
        var stale = engine.Preview(plan);
        registry.SetValue("HKLM", root, "BrowserAddProfileEnabled", 1);
        Assert.Throws<InvalidOperationException>(() => engine.Apply(plan, stale.Revision));
        engine.Apply(plan, engine.Preview(plan).Revision);
        registry.SetValue("HKLM", root, "BrowserAddProfileEnabled", 1);
        Assert.Equal("Drifted", engine.Query("edge").State);
        Assert.Throws<InvalidOperationException>(() => engine.Rollback("edge", engine.Query("edge").RollbackRevision!));
        Assert.Equal(1, registry.GetValue("HKLM", root, "BrowserAddProfileEnabled"));
    }

    [Fact]
    public void AppLockerCandidateUsesAuditOnlyAndKeepsRecoveryRules()
    {
        var xml = AppLockerAudit.BuildPolicy("S-1-5-21-1-2-3-1001", new[] { @"C:\Program Files\Google\chrome.exe" }, true, true, true);
        Assert.Equal(new[] { "Exe", "Msi" }, xml.Root!.Elements().Select(collection => (string?)collection.Attribute("Type")));
        Assert.All(xml.Root!.Elements(), collection => Assert.Equal("AuditOnly", (string?)collection.Attribute("EnforcementMode")));
        Assert.Contains("S-1-5-32-544", xml.ToString());
        Assert.Contains(@"%WINDIR%\*", xml.ToString());
        Assert.Contains("S-1-5-21-1-2-3-1001", xml.ToString());
        Assert.Contains("chrome.exe", xml.ToString());
    }

    [Fact]
    public async Task AppLockerPreservesInstitutionalPolicyAndRefusesUnreadyService()
    {
        var registry = new InMemoryRegistryService();
        var os = new FakeAppLocker();
        var audit = new AppLockerAudit(registry, os);
        var plan = AppPlan();
        os.Ready = false;
        await Assert.ThrowsAsync<InvalidOperationException>(() => audit.PreviewAsync(plan, default));
        os.Ready = true;
        os.Effective = os.Empty.Replace("/>", "><RuleCollection Type=\"Exe\" EnforcementMode=\"Enabled\" /></AppLockerPolicy>");
        await Assert.ThrowsAsync<InvalidOperationException>(() => audit.PreviewAsync(plan, default));
        Assert.Equal(0, os.Writes);
    }

    [Fact]
    public async Task AppLockerVerifiesEffectiveRulesAndRecoversFromInterruptedVerification()
    {
        var registry = new InMemoryRegistryService();
        var os = new FakeAppLocker();
        var audit = new AppLockerAudit(registry, os);
        var plan = AppPlan();
        var preview = await audit.PreviewAsync(plan, default);
        Assert.Equal(0, os.Writes);

        os.UpdateEffective = false;
        await Assert.ThrowsAsync<InvalidOperationException>(() => audit.ApplyAsync(plan, preview.Revision, default));
        var recreated = new AppLockerAudit(registry, os);
        var pending = await recreated.QueryAsync(default);
        Assert.Equal("RecoveryRequired", pending.State);
        os.UpdateEffective = true;
        var cleared = await recreated.RollbackAsync(pending.RollbackRevision!, default);
        Assert.Equal("NotConfigured", cleared.State);
        Assert.Equal(os.Empty, os.Local);

        preview = await recreated.PreviewAsync(plan, default);
        var applied = await recreated.ApplyAsync(plan, preview.Revision, default);
        Assert.Equal("AuditOnly", applied.State);
        Assert.Contains("AuditOnly", os.Effective);
        os.Effective = os.Effective.Replace("AuditOnly", "Enabled", StringComparison.Ordinal);
        var drift = await recreated.QueryAsync(default);
        Assert.Equal("Drifted", drift.State);
        await Assert.ThrowsAsync<InvalidOperationException>(() => recreated.RollbackAsync(drift.RollbackRevision!, default));
        Assert.Contains("Enabled", os.Effective);
    }

    [Fact]
    public void BrowserPartialFailureRestoresEarlierValuesAndLeavesNoCommittedHistory()
    {
        var registry = new InMemoryRegistryService();
        const string root = @"SOFTWARE\Policies\Google\Chrome";
        registry.SetValue("HKLM", root, "BrowserAddPersonEnabled", 1);
        var engine = new ExpansionEngine(registry, _ => (true, "disponível"));
        var plan = new ExpansionPlan { Target = "chrome", BlockProfiles = true, BlockedSites = new[] { "example.org" } };
        registry.SetWriteFault("1", new IOException("falha de gravação simulada"));
        Assert.Throws<IOException>(() => engine.Apply(plan, engine.Preview(plan).Revision));
        Assert.Equal(1, registry.GetValue("HKLM", root, "BrowserAddPersonEnabled"));
        Assert.False(registry.KeyExists("HKLM", root + @"\URLBlocklist"));
        Assert.Null(engine.Query("chrome").RollbackRevision);
    }

    [Fact]
    public async Task AppLockerKeepsIndependentSelectionsPerSid()
    {
        var registry = new InMemoryRegistryService();
        var os = new FakeAppLocker();
        var audit = new AppLockerAudit(registry, os);
        var first = AppPlan();
        var second = new ExpansionPlan { Target = "apps", Sid = "S-1-5-21-1-2-3-1002", AuditInstallers = true };
        await audit.ApplyAsync(first, (await audit.PreviewAsync(first, default)).Revision, default);
        await audit.ApplyAsync(second, (await audit.PreviewAsync(second, default)).Revision, default);
        Assert.Contains(first.Sid!, os.Effective);
        Assert.Contains(second.Sid!, os.Effective);

        var removeSecond = new ExpansionPlan { Target = "apps", Sid = second.Sid };
        await audit.ApplyAsync(removeSecond, (await audit.PreviewAsync(removeSecond, default)).Revision, default);
        Assert.Contains(first.Sid!, os.Effective);
        Assert.DoesNotContain("Type=\"Msi\"", os.Effective);
    }

    [Fact]
    public void UsbPolicyWritesOnlyRemovableDiskReadAndExecuteAndCanRestoreThem()
    {
        var registry = new InMemoryRegistryService();
        const string root = @"SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}";
        registry.SetValue("HKLM", root, "Deny_Write", 1);
        registry.SetValue("HKLM", root, "Deny_Read", 0);
        var engine = new ExpansionEngine(registry, _ => (true, "disponível"));
        var plan = new ExpansionPlan { Target = "usb", DenyRead = true, DenyExecute = true };
        var preview = engine.Preview(plan);
        Assert.True(preview.RequiresRestart);
        var applied = engine.Apply(plan, preview.Revision);
        Assert.Equal(1, registry.GetValue("HKLM", root, "Deny_Read"));
        Assert.Equal(1, registry.GetValue("HKLM", root, "Deny_Execute"));
        engine.Rollback("usb", applied.RollbackRevision!);
        Assert.Equal(0, registry.GetValue("HKLM", root, "Deny_Read"));
        Assert.Equal(1, registry.GetValue("HKLM", root, "Deny_Write"));
        Assert.Null(registry.GetValue("HKLM", root, "Deny_Execute"));
    }

    [Fact]
    public async Task ExpansionIpcRejectsUnconfirmedOrReadOnlyWrites()
    {
        var registry = new InMemoryRegistryService();
        var endpoint = new ExpansionIpc(registry, new WindowsScanner(), _ => (true, "disponível"), new FakeAppLocker());
        string revision = new('0', 64);
        using var wrongType = JsonDocument.Parse("""
            {"id":"exp-1","type":"query","action":"policy.expansion_rollback","payload":{"target":"edge","revision":"REVISION"}}
            """.Replace("REVISION", revision, StringComparison.Ordinal));
        using var command = JsonDocument.Parse(wrongType.RootElement.GetRawText().Replace("query", "command", StringComparison.Ordinal));
        var invalid = await endpoint.HandleAsync("exp-1", ExpansionRequest.Rollback, wrongType.RootElement, false,
            () => throw new Xunit.Sdk.XunitException("O executor não deve receber um envelope inválido."));
        Assert.Equal("INVALID_POLICY_EXPANSION_PAYLOAD", invalid.ErrorCode);
        var denied = await endpoint.HandleAsync("exp-1", ExpansionRequest.Rollback, command.RootElement, false);
        Assert.Equal("TRUSTED_EXECUTOR_REQUIRED", denied.ErrorCode);
    }

    [Fact]
    public void ExecutorTrustRequiresApprovedDirectoryAclAndDigest()
    {
        var checkedPaths = new List<string>();
        var root = System.IO.Path.GetFullPath("program-files-test");
        var install = System.IO.Path.Combine(root, "WinLab");
        var desktop = System.IO.Path.Combine(install, "WinLab.Desktop.exe");
        var helper = System.IO.Path.Combine(install, "WinLab.Executor.exe");
        Assert.Null(ExecutorInstallTrust.Resolve(root, System.IO.Path.Combine(root, "Portable", "WinLab.Desktop.exe"), "AA", _ => true, _ => "AA"));
        Assert.Null(ExecutorInstallTrust.Resolve(root, desktop, "AA", path => path != install, _ => "AA"));
        Assert.Null(ExecutorInstallTrust.Resolve(root, desktop, "AA", _ => true, _ => "BB"));
        Assert.Equal(helper, ExecutorInstallTrust.Resolve(root, desktop, "AA", path => { checkedPaths.Add(path); return true; }, _ => "AA"));
        Assert.Contains(install, checkedPaths);
        Assert.Contains(helper, checkedPaths);
    }

    private static ExpansionPlan AppPlan() => new()
    {
        Target = "apps", Sid = "S-1-5-21-1-2-3-1001", Apps = new[] { "chrome" }, AuditExecutables = true
    };

    private sealed class FakeAppLocker : IAppLockerAuditBackend
    {
        public string Empty { get; } = "<AppLockerPolicy Version=\"1\" />";
        public string Local { get; private set; }
        public string Effective { get; set; }
        public bool Ready { get; set; } = true;
        public bool UpdateEffective { get; set; } = true;
        public int Writes { get; private set; }

        public FakeAppLocker() => Local = Effective = Empty;

        public Task<AppLockerObservation> ReadAsync(CancellationToken cancellationToken) =>
            Task.FromResult(new AppLockerObservation(Local, Effective, Ready, "estado simulado"));

        public Task<AppLockerSelection[]> ResolveSelectionsAsync(ExpansionPlan[] plans, CancellationToken cancellationToken) =>
            Task.FromResult(plans.Select(plan => new AppLockerSelection(plan.Sid!,
                new[] { @"C:\Program Files\Chrome\chrome.exe" }, Array.Empty<string>())).ToArray());

        public Task WriteAsync(string xml, AppLockerObservation expected, CancellationToken cancellationToken)
        {
            Assert.Equal(Local, expected.Local);
            Assert.Equal(Effective, expected.Effective);
            Writes++;
            Local = xml;
            if (UpdateEffective) Effective = xml;
            return Task.CompletedTask;
        }
    }
}
