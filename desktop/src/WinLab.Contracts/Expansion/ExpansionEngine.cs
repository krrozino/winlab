using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text.Json;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Expansion;

public sealed record ExpansionStatus(string Target, bool Supported, string Detail, string State,
    object? Configured, string? RollbackRevision, bool RequiresAppRestart, bool RequiresRestart, bool CanWrite = false);

public sealed record ExpansionPreview(string Revision, object? Before, object? After, string Detail,
    bool RequiresAppRestart, bool RequiresRestart, string Scope = "Machine", string? TargetUserSid = null,
    bool CanApply = true, IReadOnlyList<string>? Limitations = null);

public sealed class ExpansionEngine(IRegistryService registry, Func<string, (bool Supported, string Detail)> capability,
    bool protectExternal = false)
{
    internal static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private const RegistryHiveType Hive = RegistryHiveType.LocalMachine;
    internal const string Journal = @"SOFTWARE\WinLab\PolicyExpansion";
    private const string UsbRoot = @"SOFTWARE\Policies\Microsoft\Windows\RemovableStorageDevices";
    private const string Disks = UsbRoot + @"\{53f5630d-b6bf-11d0-94f2-00a0c91efb8b}";
    private static readonly string[] BrowserLists = { "ExtensionInstallBlocklist", "ExtensionInstallAllowlist", "URLBlocklist", "URLAllowlist" };

    public ExpansionStatus Query(string target)
    {
        var (supported, detail) = capability(target);
        var observed = Read(target);
        var saved = Load(target);
        string state = saved?.Pending != null ? "RecoveryRequired"
            : saved != null && !Match(observed, saved.Desired) ? "Drifted"
            : observed.Keys.Any(key => key.Values.Length != 0) ? "Configured" : "NotConfigured";
        return new(target, supported, detail, state, Describe(target, observed),
            saved == null ? null : Hash(new { Target = target, Saved = saved, Observed = observed }),
            target != "usb", target == "usb");
    }

    public ExpansionPreview Preview(ExpansionPlan plan)
    {
        var (supported, detail) = capability(plan.Target);
        Ensure(supported, detail);
        var observed = Read(plan.Target);
        var saved = Load(plan.Target);
        Ensure(saved?.Pending == null, "Há uma operação interrompida. Restaure a configuração anterior primeiro.");
        var proposed = Propose(plan, observed);
        bool canApply = !protectExternal || CanChange(observed, saved);
        return new(Hash(new { Plan = plan, Observed = observed, Saved = saved }),
            Describe(plan.Target, observed), Describe(plan.Target, proposed), detail, plan.Target != "usb", plan.Target == "usb",
            CanApply: canApply,
            Limitations: canApply
                ? ["A releitura confirma configuração do registro. Outros controles podem ter precedência."]
                : ["Há configuração externa ou divergência. O WinLab preservará os valores observados."]);
    }

    public ExpansionStatus Apply(ExpansionPlan plan, string revision)
    {
        var (supported, detail) = capability(plan.Target);
        Ensure(supported, detail);
        var observed = Read(plan.Target);
        var old = Load(plan.Target);
        Ensure(old?.Pending == null && revision == Hash(new { Plan = plan, Observed = observed, Saved = old }),
            "A política mudou desde a prévia. Consulte as diferenças novamente.");
        Ensure(!protectExternal || CanChange(observed, old), "Há configuração externa ou divergência. O WinLab preservou os valores observados.");
        var proposed = Propose(plan, observed);
        if (Match(proposed, observed) && (old == null || Match(observed, old.Desired))) return Query(plan.Target);
        var pending = new History(old?.Baseline ?? observed, proposed, observed);
        Save(plan.Target, pending);
        try
        {
            Change(plan.Target, observed, proposed);
            Save(plan.Target, pending with { Pending = null });
        }
        catch
        {
            RestoreAfterFailure(plan.Target, proposed, observed, old);
            throw;
        }
        return Query(plan.Target);
    }

    public ExpansionStatus Rollback(string target, string revision)
    {
        var saved = Load(target) ?? throw new InvalidOperationException("Sem configuração anterior registrada.");
        var observed = Read(target);
        Ensure(revision == Hash(new { Target = target, Saved = saved, Observed = observed }),
            "A política mudou desde a consulta. Atualize antes de restaurar.");
        if (saved.Pending == null)
        {
            Ensure(Match(observed, saved.Desired), "A configuração sofreu alteração externa. Restauração automática suspensa.");
            Save(target, saved with { Pending = observed, Desired = saved.Baseline });
        }
        else
        {
            CheckIntermediate(observed, saved.Pending, saved.Desired);
            // Um histórico pendente pode ter sido interrompido durante aplicação ou rollback.
            // Em ambos os casos, o operador confirmou a restauração da linha de base original.
            Save(target, saved with { Pending = observed, Desired = saved.Baseline });
        }

        Change(target, observed, saved.Baseline);
        Save(target, null);
        return Query(target);
    }

    private void RestoreAfterFailure(string target, Snapshot desired, Snapshot before, History? old)
    {
        try
        {
            var observed = Read(target);
            CheckIntermediate(observed, before, desired);
            Change(target, observed, before);
            Save(target, old);
        }
        catch (Exception ex) when (ex is IOException or InvalidOperationException or UnauthorizedAccessException)
        {
            throw new InvalidOperationException("Operação interrompida. Consulte a política para recuperar a linha de base.", ex);
        }
    }

    private static void CheckIntermediate(Snapshot observed, Snapshot before, Snapshot after)
    {
        for (int i = 0; i < observed.Keys.Length; i++)
        {
            var current = observed.Keys[i].Values;
            var previous = before.Keys[i].Values;
            var next = after.Keys[i].Values;
            foreach (var name in current.Concat(previous).Concat(next).Select(x => x.Name).Distinct(StringComparer.OrdinalIgnoreCase))
            {
                var value = Find(current, name);
                Ensure(Match(value, Find(previous, name)) || Match(value, Find(next, name)),
                    "Foram encontradas alterações externas durante a operação. Restauração suspensa.");
            }
        }
    }

    private Snapshot Read(string target)
    {
        var keys = Layout(target).Select(spec =>
        {
            bool exists = registry.KeyExists(Hive, spec.Path);
            var values = !exists ? Array.Empty<Value>() : registry.GetValueNames(Hive, spec.Path)
                .Where(name => spec.Names == null || spec.Names.Contains(name, StringComparer.OrdinalIgnoreCase))
                .OrderBy(name => name, StringComparer.OrdinalIgnoreCase).Select(name => ReadValue(spec.Path, name)).ToArray();
            return new Key(exists, values);
        }).ToArray();
        return new(keys);
    }

    private Value ReadValue(string path, string name)
    {
        var kind = registry.GetValueKind(Hive, path, name);
        var value = registry.GetValue(Hive, path, name);
        if (kind == null || value == null || !CanRestore(kind.Value, value))
            throw new InvalidOperationException("Uma configuração usa um tipo de registro que não pode ser restaurado com segurança.");
        return new(name, kind.Value, JsonSerializer.SerializeToElement(value, Json));
    }

    private static bool CanRestore(RegistryValueType type, object value) => type switch
    {
        RegistryValueType.DWord => value is int,
        RegistryValueType.QWord => value is long,
        RegistryValueType.String or RegistryValueType.ExpandString => value is string,
        RegistryValueType.Binary => value is byte[],
        RegistryValueType.MultiString => value is string[],
        _ => false
    };

    private static object Decode(Value value) => value.Kind switch
    {
        RegistryValueType.DWord => value.Data.GetInt32(),
        RegistryValueType.QWord => value.Data.GetInt64(),
        RegistryValueType.String or RegistryValueType.ExpandString => value.Data.GetString()!,
        RegistryValueType.Binary => value.Data.GetBytesFromBase64(),
        RegistryValueType.MultiString => value.Data.Deserialize<string[]>(Json)!,
        _ => throw new InvalidOperationException("Tipo de registro desconhecido.")
    };

    private void Change(string target, Snapshot from, Snapshot to)
    {
        Ensure(Match(Read(target), from), "Configuração alterada por outro processo.");
        var layout = Layout(target);
        for (int i = 0; i < layout.Length; i++)
        {
            string path = layout[i].Path;
            if (to.Keys[i].Exists && !from.Keys[i].Exists && !registry.KeyExists(Hive, path))
                registry.CreateSubKey(Hive, path);
            foreach (var value in to.Keys[i].Values)
                if (!Match(value, Find(from.Keys[i].Values, value.Name)))
                    registry.SetValue(Hive, path, value.Name, Decode(value), value.Kind);
            foreach (var value in from.Keys[i].Values)
                if (Find(to.Keys[i].Values, value.Name) == null)
                    registry.DeleteValue(Hive, path, value.Name);
        }
        for (int i = layout.Length - 1; i >= 0; i--)
        {
            string path = layout[i].Path;
            if (from.Keys[i].Exists && !to.Keys[i].Exists && registry.GetValueNames(Hive, path).Length == 0
                && registry.GetSubKeyNames(Hive, path).Length == 0)
                registry.DeleteSubKeyTree(Hive, path);
        }
        Ensure(Match(Read(target), to), "A releitura do registro divergiu da configuração prevista.");
    }

    private static Snapshot Propose(ExpansionPlan plan, Snapshot observed)
    {
        var keys = observed.Keys.ToArray();
        if (plan.Target == "usb")
        {
            Set(keys, 1, new[] { ("Deny_Read", plan.DenyRead), ("Deny_Execute", plan.DenyExecute) }
                .Where(item => item.Item2).Select(item => DWord(item.Item1, 1)).ToArray());
            keys[0] = keys[0] with { Exists = keys[0].Exists || keys[1].Exists };
            return new(keys);
        }

        Set(keys, 1, plan.BlockProfiles ? new[] { DWord(ProfileName(plan.Target), 0) } : Array.Empty<Value>());
        Set(keys, 2, Strings(plan.BlockExtensions ? new[] { "*" } : Array.Empty<string>()));
        Set(keys, 3, Strings(plan.AllowedExtensions));
        Set(keys, 4, Strings(plan.RestrictSites ? new[] { "*" } : plan.BlockedSites));
        Set(keys, 5, Strings(plan.AllowedSites));
        keys[1] = keys[1] with { Exists = keys.Skip(1).Any(key => key.Exists) };
        keys[0] = keys[0] with { Exists = keys[0].Exists || keys[1].Exists };
        return new(keys);
    }

    private static void Set(Key[] keys, int index, Value[] values) =>
        keys[index] = new(keys[index].Exists || values.Length > 0,
            values.OrderBy(value => value.Name, StringComparer.OrdinalIgnoreCase).ToArray());

    private static Value DWord(string name, int value) => new(name, RegistryValueType.DWord, JsonSerializer.SerializeToElement(value, Json));
    private static Value[] Strings(string[] items) => items.Select((item, index) =>
        new Value((index + 1).ToString(CultureInfo.InvariantCulture), RegistryValueType.String, JsonSerializer.SerializeToElement(item, Json))).ToArray();

    private static object Describe(string target, Snapshot snapshot) => Layout(target).Zip(snapshot.Keys)
        .Where(pair => pair.First.Names == null || pair.First.Names.Length != 0)
        .Select(pair => new { policy = pair.First.Names == null ? pair.First.Path.Split('\\').Last() : string.Join(", ", pair.First.Names),
            values = pair.Second.Values.Select(v => new { v.Name, kind = v.Kind.ToString(), value = v.Data }).ToArray() }).ToArray();

    private static string ProfileName(string target) => target == "chrome" ? "BrowserAddPersonEnabled" : "BrowserAddProfileEnabled";

    private static Spec[] Layout(string target)
    {
        if (target == "usb")
            return new[] { new Spec(UsbRoot, Array.Empty<string>()), new Spec(Disks, new[] { "Deny_Execute", "Deny_Read" }) };
        string parent = target switch
        {
            "edge" => @"SOFTWARE\Policies\Microsoft",
            "chrome" => @"SOFTWARE\Policies\Google",
            _ => throw new ArgumentException("Política desconhecida.")
        };
        string root = parent + (target == "chrome" ? @"\Chrome" : @"\Edge");
        return new[] { new Spec(parent, Array.Empty<string>()), new Spec(root, new[] { ProfileName(target) }) }
            .Concat(BrowserLists.Select(name => new Spec(root + "\\" + name, null))).ToArray();
    }

    private History? Load(string target) => registry.GetValue(Hive, Journal, target) switch
    {
        null => null,
        string recorded => JsonSerializer.Deserialize<History>(recorded, Json)
            ?? throw new InvalidOperationException("O histórico de configuração está incompleto."),
        _ => throw new InvalidOperationException("Formato inválido de histórico de configuração.")
    };

    private void Save(string target, History? history)
    {
        if (history == null) registry.DeleteValue(Hive, Journal, target);
        else registry.SetValue(Hive, Journal, target, JsonSerializer.Serialize(history, Json), RegistryValueType.String);
    }

    private static Value? Find(Value[] values, string name) =>
        Array.Find(values, value => string.Equals(value.Name, name, StringComparison.OrdinalIgnoreCase));

    private static bool CanChange(Snapshot observed, History? saved) => saved == null
        ? observed.Keys.All(key => key.Values.Length == 0)
        : saved.Pending == null && Match(observed, saved.Desired);

    internal static string Hash<T>(T value) => Convert.ToHexString(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(value, Json)));
    private static bool Match<T>(T left, T right) => Hash(left) == Hash(right);

    internal static void Ensure(bool condition, string detail)
    {
        if (!condition) throw new InvalidOperationException(detail);
    }

    private sealed record Spec(string Path, string[]? Names);
    private sealed record Value(string Name, RegistryValueType Kind, JsonElement Data);
    private sealed record Key(bool Exists, Value[] Values);
    private sealed record Snapshot(Key[] Keys);
    private sealed record History(Snapshot Baseline, Snapshot Desired, Snapshot? Pending);
}
