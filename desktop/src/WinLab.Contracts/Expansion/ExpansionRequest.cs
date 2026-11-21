using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace WinLab.Contracts.Expansion;

public sealed class ExpansionPlan
{
    public string Target { get; init; } = "";
    public bool BlockExtensions { get; init; }
    public string[] AllowedExtensions { get; init; } = Array.Empty<string>();
    public string[] BlockedSites { get; init; } = Array.Empty<string>();
    public string[] AllowedSites { get; init; } = Array.Empty<string>();
    public bool RestrictSites { get; init; }
    public bool BlockProfiles { get; init; }
    public string? Sid { get; init; }
    public string[] Apps { get; init; } = Array.Empty<string>();
    public bool AuditExecutables { get; init; }
    public bool AuditInstallers { get; init; }
    public bool AuditPowerShell { get; init; }
    public bool DenyRead { get; init; }
    public bool DenyExecute { get; init; }
}

public static class ExpansionRequest
{
    public const string Query = "policy.expansion_query";
    public const string Preview = "policy.expansion_preview";
    public const string Apply = "policy.expansion_apply";
    public const string Rollback = "policy.expansion_rollback";

    public static bool IsAction(string action) => action is Query or Preview or Apply or Rollback;
    public static bool IsMutation(string action) => action is Apply or Rollback;

    public static bool IsTypedEnvelope(string rawJson)
    {
        try
        {
            using var document = JsonDocument.Parse(rawJson);
            var root = document.RootElement;
            return root.ValueKind == JsonValueKind.Object && root.TryGetProperty("action", out var action)
                && action.ValueKind == JsonValueKind.String && IsAction(action.GetString()!);
        }
        catch (JsonException)
        {
            return false;
        }
    }

    public static readonly string[] Presets = { "chrome", "edge", "word", "excel", "powerpoint", "powerbi" };
    private static readonly Regex ExtensionId = new(@"\A[a-p]{32}\z", RegexOptions.CultureInvariant);
    private static readonly Regex SiteText = new(@"\A(?:https?://)?\.?[a-zA-Z0-9.-]+(?::[0-9]{1,5})?(?:/[a-zA-Z0-9._~/-]*)?\z", RegexOptions.CultureInvariant);
    private static readonly Regex LocalSid = new(@"\AS-1-5-21-(?:[0-9]{1,10}-){3}[0-9]{1,10}\z", RegexOptions.CultureInvariant);

    public static (string Target, ExpansionPlan? Plan, string? Revision) Parse(JsonElement root, string action)
    {
        if (root.EnumerateObject().Select(property => property.Name).Distinct().Count() != root.EnumerateObject().Count()
            || root.GetProperty("type").GetString() != (IsMutation(action) ? "command" : "query"))
            throw new ArgumentException("Envelope IPC inválido para esta operação.");
        if (!root.TryGetProperty("payload", out var payload))
            throw new ArgumentException("Payload obrigatório.");

        if (action == Preview)
        {
            var plan = ParsePlan(payload);
            return (plan.Target, plan, null);
        }

        var fields = Fields(payload, action == Apply ? new[] { "plan", "revision" }
            : action == Rollback ? new[] { "target", "revision" } : new[] { "target" });
        string? revision = action == Query ? null : StringValue(fields, "revision");
        if (revision != null && (revision.Length != 64 || !revision.All(Uri.IsHexDigit)))
            throw new ArgumentException("Confirmação inválida. Gere uma nova prévia.");
        if (action == Apply)
        {
            var plan = ParsePlan(fields["plan"]);
            return (plan.Target, plan, revision);
        }

        return (Target(StringValue(fields, "target")), null, revision);
    }

    public static ExpansionPlan ParsePlan(JsonElement payload)
    {
        if (payload.ValueKind != JsonValueKind.Object || !payload.TryGetProperty("target", out var targetProperty)
            || targetProperty.ValueKind != JsonValueKind.String)
            throw new ArgumentException("Destino obrigatório.");
        string target = Target(targetProperty.GetString()!);
        if (target == "apps")
        {
            var fields = Fields(payload, "target", "sid", "apps", "auditExecutables", "auditInstallers", "auditPowerShell");
            string sid = StringValue(fields, "sid");
            if (sid.Length > 68 || !LocalSid.IsMatch(sid))
                throw new ArgumentException("Selecione uma conta local comum válida.");
            bool executables = Bool(fields, "auditExecutables");
            bool installers = Bool(fields, "auditInstallers");
            bool powerShell = Bool(fields, "auditPowerShell");
            string[] apps = List(fields, "apps", Presets.Length, app => Presets.Contains(app));
            if ((executables && apps.Length == 0) || (powerShell && !executables))
                throw new ArgumentException("Inclua pelo menos um aplicativo para auditar executáveis.");
            return new ExpansionPlan { Target = target, Sid = sid, Apps = apps,
                AuditExecutables = executables, AuditInstallers = installers, AuditPowerShell = powerShell };
        }

        if (target == "usb")
        {
            var fields = Fields(payload, "target", "denyRead", "denyExecute");
            return new ExpansionPlan { Target = target, DenyRead = Bool(fields, "denyRead"), DenyExecute = Bool(fields, "denyExecute") };
        }

        {
            var fields = Fields(payload, "target", "blockExtensions", "allowedExtensions", "blockedSites", "allowedSites", "restrictSites", "blockProfiles");
            bool restrict = Bool(fields, "restrictSites");
            bool blockExtensions = Bool(fields, "blockExtensions");
            var allowedSites = List(fields, "allowedSites", 100, IsSite);
            var blockedSites = List(fields, "blockedSites", 100, IsSite);
            var extensions = List(fields, "allowedExtensions", 100, x => ExtensionId.IsMatch(x));
            if (restrict && (allowedSites.Length == 0 || blockedSites.Length != 0))
                throw new ArgumentException("Navegação restrita exige ao menos um site permitido e substitui a lista de bloqueio.");
            if (blockedSites.Intersect(allowedSites, StringComparer.OrdinalIgnoreCase).Any())
                throw new ArgumentException("Um site não pode constar nas duas listas.");
            return new ExpansionPlan { Target = target, BlockExtensions = blockExtensions,
                AllowedExtensions = extensions, BlockedSites = blockedSites, AllowedSites = allowedSites,
                RestrictSites = restrict, BlockProfiles = Bool(fields, "blockProfiles") };
        }
    }

    private static string Target(string value) => value is "chrome" or "edge" or "apps" or "usb"
        ? value : throw new ArgumentException("Destino da política desconhecido.");

    private static Dictionary<string, JsonElement> Fields(JsonElement json, params string[] names)
    {
        if (json.ValueKind != JsonValueKind.Object)
            throw new ArgumentException("O payload deve ser um objeto.");
        var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
        foreach (var field in json.EnumerateObject())
            if (!names.Contains(field.Name) || !fields.TryAdd(field.Name, field.Value))
                throw new ArgumentException("Campo inesperado ou duplicado.");
        if (fields.Count != names.Length) throw new ArgumentException("Há campos obrigatórios ausentes.");
        return fields;
    }

    private static bool Bool(Dictionary<string, JsonElement> fields, string name) =>
        fields[name].ValueKind is JsonValueKind.True or JsonValueKind.False
            ? fields[name].GetBoolean() : throw new ArgumentException($"'{name}' deve ser booleano.");

    private static string StringValue(Dictionary<string, JsonElement> fields, string name) =>
        fields[name].ValueKind == JsonValueKind.String
            ? fields[name].GetString()! : throw new ArgumentException($"'{name}' deve ser texto.");

    private static string[] List(Dictionary<string, JsonElement> fields, string name, int maximum, Func<string, bool> validate)
    {
        var value = fields[name];
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > maximum)
            throw new ArgumentException($"'{name}' deve ser uma lista com até {maximum} itens.");
        var items = new List<string>();
        var unique = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in value.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.String || item.GetString() is not { Length: > 0 and <= 256 } text
                || !validate(text) || !unique.Add(text))
                throw new ArgumentException($"'{name}' contém item inválido ou duplicado.");
            items.Add(text);
        }
        return items.ToArray();
    }

    private static bool IsSite(string value)
    {
        if (!SiteText.IsMatch(value)) return false;
        string absolute = value.Contains("://", StringComparison.Ordinal) ? value : "https://" + value;
        if (absolute.Contains("://.", StringComparison.Ordinal)) absolute = absolute.Replace("://.", "://", StringComparison.Ordinal);
        return Uri.TryCreate(absolute, UriKind.Absolute, out var uri)
            && uri.HostNameType is UriHostNameType.Dns or UriHostNameType.IPv4
            && !uri.Host.Contains("..", StringComparison.Ordinal);
    }
}
