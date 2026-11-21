using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Expansion;

public sealed record AppLockerObservation(string Local, string Effective, bool Ready, string Detail);
public sealed record AppLockerSelection(string Sid, string[] PresetPaths, string[] OtherLocalSids);

public interface IAppLockerAuditBackend
{
    Task<AppLockerObservation> ReadAsync(CancellationToken cancellationToken);
    Task<AppLockerSelection[]> ResolveSelectionsAsync(ExpansionPlan[] plans, CancellationToken cancellationToken);
    Task WriteAsync(string xml, AppLockerObservation expected, CancellationToken cancellationToken);
}

public sealed class AppLockerAudit(IRegistryService registry, IAppLockerAuditBackend backend)
{
    private const string Target = "apps";
    private const RegistryHiveType Hive = RegistryHiveType.LocalMachine;
    private static readonly XDocument Empty = new(new XElement("AppLockerPolicy", new XAttribute("Version", "1")));

    public async Task<ExpansionStatus> QueryAsync(CancellationToken ct)
    {
        var observed = await backend.ReadAsync(ct);
        var record = Load();
        bool hasPolicy = HasPolicy(observed.Local) || HasPolicy(observed.Effective);
        bool ready = observed.Ready && (!hasPolicy || record != null);
        string state = record?.Pending == true ? "RecoveryRequired"
            : record != null && !MatchesBoth(record.Desired, observed) ? "Drifted"
            : record != null && observed.Ready ? "AuditOnly"
            : observed.Local.Length == 0 ? "Inconclusive"
            : hasPolicy ? "Configured" : "NotConfigured";
        string detail = observed.Ready && hasPolicy && record == null
            ? "AppLocker já possui política local ou efetiva. O WinLab preserva essa configuração institucional."
            : observed.Detail;
        return new(Target, ready, detail, state, new
        {
            selections = record?.Plans,
            local = Summary(observed.Local),
            effective = Summary(observed.Effective)
        }, record == null || observed.Local.Length == 0 ? null : Revision(observed, record), false, false);
    }

    public async Task<ExpansionPreview> PreviewAsync(ExpansionPlan plan, CancellationToken ct)
    {
        var observed = await backend.ReadAsync(ct);
        var (candidate, selections, previous) = await PrepareAsync(plan, observed, ct);
        return new(ExpansionEngine.Hash(new { Plan = plan, Observed = observed, Candidate = candidate, Previous = previous }),
            Summary(observed.Effective),
            new
            {
                collections = Summary(candidate),
                accounts = selections.Select(item => new
                {
                    item.Selection.Sid, item.Selection.PresetPaths, auditsPortableExecutables = item.Plan.AuditExecutables,
                    auditsMsiMspMst = item.Plan.AuditInstallers, auditsPowerShell = item.Plan.AuditPowerShell
                }).ToArray()
            },
            "Coleções AppLocker por máquina, com regras para o SID escolhido e recuperação administrativa. AuditOnly registra o que seria bloqueado.",
            false, false);
    }

    public async Task<ExpansionStatus> ApplyAsync(ExpansionPlan plan, string revision, CancellationToken ct)
    {
        var observed = await backend.ReadAsync(ct);
        var (candidate, selections, old) = await PrepareAsync(plan, observed, ct);
        ExpansionEngine.Ensure(revision == ExpansionEngine.Hash(new { Plan = plan, Observed = observed, Candidate = candidate, Previous = old }),
            "A política, as contas ou os aplicativos mudaram desde a prévia.");
        var pending = new History(selections.Select(item => item.Plan).ToArray(), old?.Baseline ?? observed.Local, candidate, observed.Local, true);
        Save(pending);
        await backend.WriteAsync(candidate, observed, ct);
        var verified = await backend.ReadAsync(ct);
        ExpansionEngine.Ensure(verified.Ready && MatchesBoth(candidate, verified),
            "AuditOnly não foi confirmado na política efetiva. Consulte a configuração e restaure a linha de base.");
        Save(selections.Length == 0 ? null : pending with { Pending = false });
        return await QueryAsync(ct);
    }

    public async Task<ExpansionStatus> RollbackAsync(string revision, CancellationToken ct)
    {
        var record = Load() ?? throw new InvalidOperationException("Sem configuração AppLocker anterior registrada.");
        var observed = await backend.ReadAsync(ct);
        ExpansionEngine.Ensure(revision == Revision(observed, record) && observed.Local.Length != 0,
            "O estado do AppLocker mudou. Consulte novamente antes de restaurar.");
        ExpansionEngine.Ensure(MatchesBoth(record.Desired, observed) ||
            (record.Pending && IsKnownTransition(observed, record)),
            "A política AppLocker divergiu do histórico do WinLab. A restauração automática foi suspensa.");
        if (!MatchesBoth(record.Baseline, observed))
        {
            Save(record with { Pending = true });
            await backend.WriteAsync(record.Baseline, observed, ct);
        }
        var verified = await backend.ReadAsync(ct);
        ExpansionEngine.Ensure(MatchesBoth(record.Baseline, verified), "O Windows não confirmou a restauração do AppLocker.");
        Save(null);
        return await QueryAsync(ct);
    }

    private async Task<(string Candidate, AccountAudit[] Selections, History? Previous)> PrepareAsync(
        ExpansionPlan plan, AppLockerObservation observed, CancellationToken ct)
    {
        ExpansionEngine.Ensure(observed.Ready, observed.Detail);
        var previous = Load();
        ExpansionEngine.Ensure(previous == null ? !HasPolicy(observed.Local) && !HasPolicy(observed.Effective)
            : !previous.Pending && MatchesBoth(previous.Desired, observed),
            "AppLocker possui configuração externa ou operação pendente. As regras existentes foram preservadas.");
        bool active = plan.AuditExecutables || plan.AuditInstallers;
        var current = previous?.Plans ?? Array.Empty<ExpansionPlan>();
        ExpansionEngine.Ensure(active || current.Any(item => item.Sid == plan.Sid), "Esta conta ainda não possui auditoria WinLab.");
        var plans = current.Where(item => item.Sid != plan.Sid)
            .Concat(active ? new[] { plan } : Array.Empty<ExpansionPlan>()).OrderBy(item => item.Sid, StringComparer.Ordinal).ToArray();
        ExpansionEngine.Ensure(plans.Length <= 16, "O perfil local de auditoria aceita até 16 contas.");
        if (plans.Length == 0) return (previous!.Baseline, Array.Empty<AccountAudit>(), previous);
        var resolved = await backend.ResolveSelectionsAsync(plans, ct);
        ExpansionEngine.Ensure(plans.Length == resolved.Length && plans.Select(item => item.Sid).SequenceEqual(resolved.Select(item => item.Sid)),
            "O Windows não confirmou todas as contas da política.");
        var selections = plans.Zip(resolved, (item, selection) => new AccountAudit(item, selection)).ToArray();
        var candidate = BuildPolicy(selections).ToString(SaveOptions.DisableFormatting);
        return (candidate, selections, previous);
    }

    public static XDocument BuildPolicy(string standardSid, IEnumerable<string> presetPaths,
        bool executables, bool installers, bool auditPowerShell, IEnumerable<string>? otherLocalSids = null)
        => BuildPolicy(new[] { new AccountAudit(new ExpansionPlan
            { AuditExecutables = executables, AuditInstallers = installers, AuditPowerShell = auditPowerShell },
            new AppLockerSelection(standardSid, presetPaths.ToArray(), otherLocalSids?.ToArray() ?? Array.Empty<string>())) });

    private static XDocument BuildPolicy(IReadOnlyCollection<AccountAudit> accounts)
    {
        var doc = new XDocument(Empty);
        var knownSids = new[] { "S-1-5-32-544", "S-1-5-18", "S-1-5-19", "S-1-5-20" }
            .Concat(accounts.SelectMany(item => item.Selection.OtherLocalSids.Append(item.Selection.Sid))).Distinct()
            .OrderBy(sid => sid, StringComparer.Ordinal).ToArray();
        foreach (string type in new[] { "Exe", "Msi" })
        {
            var audited = accounts.Where(account => type == "Exe" ? account.Plan.AuditExecutables : account.Plan.AuditInstallers).ToArray();
            if (audited.Length == 0) continue;
            var scopedSids = audited.Select(account => account.Selection.Sid).ToHashSet(StringComparer.Ordinal);
            var collection = new XElement("RuleCollection", new XAttribute("Type", type), new XAttribute("EnforcementMode", "AuditOnly"));
            foreach (string sid in knownSids.Where(sid => !scopedSids.Contains(sid)))
                AddRule(collection, sid, "*");

            foreach (var account in audited)
            {
                string sid = account.Selection.Sid;
                if (type == "Exe")
                {
                    AddRule(collection, sid, @"%WINDIR%\*");
                    foreach (string path in account.Selection.PresetPaths.Distinct(StringComparer.OrdinalIgnoreCase)
                        .OrderBy(path => path, StringComparer.OrdinalIgnoreCase))
                        AddRule(collection, sid, path);
                    if (account.Plan.AuditPowerShell)
                        foreach (string path in new[] { @"*\powershell.exe", @"*\powershell_ise.exe", @"*\pwsh.exe" })
                            AddRule(collection, sid, path, "Deny");
                }
                else
                {
                    AddRule(collection, sid, @"%WINDIR%\Installer\*");
                }
            }
            doc.Root!.Add(collection);
        }
        return doc;
    }

    private static void AddRule(XElement collection, string sid, string path, string action = "Allow")
    {
        string type = (string)collection.Attribute("Type")!;
        string id = new Guid(Convert.FromHexString(ExpansionEngine.Hash(new[] { type, sid, path, action })[..32])).ToString();
        collection.Add(new XElement("FilePathRule", new XAttribute("Id", id), new XAttribute("Name", "WinLab " + path),
            new XAttribute("Description", ""), new XAttribute("UserOrGroupSid", sid), new XAttribute("Action", action),
            new XElement("Conditions", new XElement("FilePathCondition", new XAttribute("Path", path)))));
    }

    private static bool HasPolicy(string xml) => xml.Length != 0 && Collections(xml).Any();
    private static IEnumerable<XElement> Collections(string xml)
    {
        var root = XDocument.Parse(xml).Root;
        ExpansionEngine.Ensure(root?.Name == "AppLockerPolicy", "Resposta AppLocker inválida.");
        return root!.Elements().Where(element => element.Name != "RuleCollection" || element.HasElements ||
            (string?)element.Attribute("EnforcementMode") is not (null or "NotConfigured"));
    }

    private static object[] Summary(string xml) => xml.Length == 0 ? Array.Empty<object>() : Collections(xml)
        .Select(element => (object)new { type = (string?)element.Attribute("Type"), mode = (string?)element.Attribute("EnforcementMode"),
            ruleCount = element.Elements().Count() }).ToArray();

    private static bool MatchesBoth(string expected, AppLockerObservation observed) =>
        observed.Local.Length != 0 && observed.Effective.Length != 0 &&
        PolicyHash(expected) == PolicyHash(observed.Local) && PolicyHash(expected) == PolicyHash(observed.Effective);

    private static bool IsKnownTransition(AppLockerObservation observed, History record)
    {
        string[] known = { PolicyHash(record.Baseline), PolicyHash(record.Previous), PolicyHash(record.Desired) };
        return observed.Local.Length != 0 && observed.Effective.Length != 0
            && known.Contains(PolicyHash(observed.Local)) && known.Contains(PolicyHash(observed.Effective));
    }

    private static string PolicyHash(string xml) => ExpansionEngine.Hash(Collections(xml)
        .Select(Canonical).OrderBy(text => text, StringComparer.Ordinal).ToArray());

    private static string Canonical(XElement element) =>
        new XElement(element.Name, element.Attributes().OrderBy(attribute => attribute.Name.ToString(), StringComparer.Ordinal),
            element.HasElements ? null : element.Value,
            element.Elements().OrderBy(child => (string?)child.Attribute("Id") ?? child.Name.ToString(), StringComparer.Ordinal)
                .Select(child => XElement.Parse(Canonical(child)))).ToString(SaveOptions.DisableFormatting);

    private History? Load() => registry.GetValue(Hive, ExpansionEngine.Journal, Target) switch
    {
        null => null,
        string text => JsonSerializer.Deserialize<History>(text, ExpansionEngine.Json)
            ?? throw new InvalidOperationException("Histórico AppLocker inválido."),
        _ => throw new InvalidOperationException("Histórico AppLocker inválido.")
    };

    private void Save(History? history)
    {
        if (history == null) registry.DeleteValue(Hive, ExpansionEngine.Journal, Target);
        else registry.SetValue(Hive, ExpansionEngine.Journal, Target,
            JsonSerializer.Serialize(history, ExpansionEngine.Json), RegistryValueType.String);
    }

    private static string Revision(AppLockerObservation observed, History record) => ExpansionEngine.Hash(new { Observed = observed, Record = record });
    private sealed record AccountAudit(ExpansionPlan Plan, AppLockerSelection Selection);
    private sealed record History(ExpansionPlan[] Plans, string Baseline, string Desired, string Previous, bool Pending);
}
