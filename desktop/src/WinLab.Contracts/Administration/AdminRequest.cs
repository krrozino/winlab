using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;

namespace WinLab.Contracts.Administration;

public sealed class AdminRequest
{
    public AdminAccountPlan? AccountPlan { get; private init; }
    public AdminPermissionPlan? PermissionPlan { get; private init; }
    public string? TargetUserSid { get; private init; }
    public string? Revision { get; private init; }
    public bool ElevatedRead { get; private init; }
    public JsonElement Credential { private get; init; }

    public string? ReadCredential() => Credential.ValueKind == JsonValueKind.String ? Credential.GetString() : null;

    public static bool IsTypedEnvelope(string rawJson)
    {
        try
        {
            using var document = JsonDocument.Parse(rawJson);
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("action", out var actionValue) ||
                actionValue.ValueKind != JsonValueKind.String)
                return false;
            string action = actionValue.GetString()!;
            if (AdminActions.Contains(action))
                Parse(action, root);
            else if (action == IpcConstants.ActionCreateLocalAccount)
                ParseLegacyAccount(root);
            else
                return false;
            return true;
        }
        catch (Exception ex) when (ex is ArgumentException or JsonException)
        {
            return false;
        }
    }

    public static AdminRequest Parse(string action, JsonElement root)
    {
        var payload = Payload(root, AdminActions.IsMutation(action) ? "command" : "query");
        switch (action)
        {
            case AdminActions.AccountsQuery:
                Fields(payload, []);
                return new();
            case AdminActions.AccountsPreview:
                return new() { AccountPlan = ParseAccountPlan(payload) };
            case AdminActions.AccountsApply:
            {
                Fields(payload, ["plan", "revision"], ["password"]);
                var plan = ParseAccountPlan(payload.GetProperty("plan"));
                bool hasCredential = payload.TryGetProperty("password", out var credential);
                if (hasCredential != (plan.Operation != "SetEnabled") ||
                    (hasCredential && credential.ValueKind != JsonValueKind.String))
                    throw Invalid();
                return new() { AccountPlan = plan, Revision = ParseRevision(payload), Credential = credential };
            }
            case AdminActions.DiagnosticsQuery:
            case AdminActions.PermissionsQuery:
                Fields(payload, [], ["targetUserSid", "elevatedRead"]);
                return new() { TargetUserSid = OptionalSid(payload), ElevatedRead = ReadElevation(payload) };
            case AdminActions.PermissionsPreview:
                return new() { PermissionPlan = ParsePermissionPlan(payload, preview: true), ElevatedRead = ReadElevation(payload) };
            case AdminActions.PermissionsApply:
                Fields(payload, ["plan", "revision"]);
                return new() { PermissionPlan = ParsePermissionPlan(payload.GetProperty("plan")), Revision = ParseRevision(payload) };
            default:
                throw Invalid();
        }
    }

    public static AdminRequest ParseLegacyAccount(JsonElement root)
    {
        var payload = Payload(root, "command");
        Fields(payload, ["name", "password", "isAdmin"]);
        var credential = payload.GetProperty("password");
        if (credential.ValueKind != JsonValueKind.String) throw Invalid();
        return new()
        {
            AccountPlan = new("Create", Text(payload, "name"), Flag(payload, "isAdmin") ? "Superadmin" : "Student"),
            Credential = credential
        };
    }

    private static AdminAccountPlan ParseAccountPlan(JsonElement plan)
    {
        return Text(plan, "operation") switch
        {
            "Create" => ParseCreate(plan),
            "ProtectRecovery" => ParseRecovery(plan),
            "SetEnabled" => ParseEnabled(plan),
            _ => throw Invalid()
        };
    }

    private static AdminAccountPlan ParseCreate(JsonElement plan)
    {
        Fields(plan, ["operation", "name", "role"]);
        string name = Text(plan, "name");
        string role = Text(plan, "role");
        if (!AdminAccountService.IsValidName(name) || role is not ("Superadmin" or "Student")) throw Invalid();
        return new("Create", name, role);
    }

    private static AdminAccountPlan ParseRecovery(JsonElement plan)
    {
        Fields(plan, ["operation", "sid"]);
        return new("ProtectRecovery", Sid: ParseSid(Text(plan, "sid")));
    }

    private static AdminAccountPlan ParseEnabled(JsonElement plan)
    {
        Fields(plan, ["operation", "sid", "enabled"]);
        return new("SetEnabled", Sid: ParseSid(Text(plan, "sid")), Enabled: Flag(plan, "enabled"));
    }

    private static AdminPermissionPlan ParsePermissionPlan(JsonElement plan, bool preview = false)
    {
        Fields(plan, ["permissionId", "intent"], preview
            ? ["targetUserSid", "elevatedRead", "transactionId"] : ["targetUserSid", "transactionId"]);
        string id = Text(plan, "permissionId");
        string intent = Text(plan, "intent");
        if (id.Length is < 1 or > 80 || id.Any(character => !(char.IsAsciiLetterLower(character) ||
                char.IsAsciiDigit(character) || character is '.' or '_')) ||
            intent is not ("Allow" or "Block" or "Preserve" or "Restore"))
            throw Invalid();
        string? transactionId = null;
        if (plan.TryGetProperty("transactionId", out _))
        {
            if (intent != "Restore" || !Guid.TryParseExact(Text(plan, "transactionId"), "D", out var parsed) ||
                parsed == Guid.Empty)
                throw Invalid();
            transactionId = parsed.ToString("D");
        }
        return new(id, intent, OptionalSid(plan), transactionId);
    }

    private static JsonElement Payload(JsonElement root, string type)
    {
        if (root.ValueKind != JsonValueKind.Object || Text(root, "type") != type ||
            !root.TryGetProperty("payload", out var payload))
            throw Invalid();
        var members = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (root.EnumerateObject().Any(field => !members.Add(field.Name)))
            throw Invalid();
        return payload;
    }

    private static void Fields(JsonElement element, string[] required, string[]? optional = null)
    {
        if (element.ValueKind != JsonValueKind.Object) throw Invalid();
        var actual = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in element.EnumerateObject())
        {
            if (!actual.Add(property.Name) || (!required.Contains(property.Name) &&
                (optional == null || !optional.Contains(property.Name))))
                throw Invalid();
        }
        if (required.Any(field => !actual.Contains(field))) throw Invalid();
    }

    private static string Text(JsonElement element, string name) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var property) &&
        property.ValueKind == JsonValueKind.String ? property.GetString()! : throw Invalid();

    private static bool Flag(JsonElement element, string name) =>
        element.TryGetProperty(name, out var property) && property.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? property.GetBoolean() : throw Invalid();

    private static string ParseRevision(JsonElement payload)
    {
        string revision = Text(payload, "revision");
        if (revision.Length != 64 || !revision.All(Uri.IsHexDigit)) throw Invalid();
        return revision.ToUpperInvariant();
    }

    private static string? OptionalSid(JsonElement payload) =>
        payload.TryGetProperty("targetUserSid", out _) ? ParseSid(Text(payload, "targetUserSid")) : null;

    private static bool ReadElevation(JsonElement payload) =>
        payload.TryGetProperty("elevatedRead", out _) && Flag(payload, "elevatedRead");

    private static string ParseSid(string sid) => IsLocalSid(sid) ? sid : throw Invalid();

    public static bool IsLocalSid(string sid) => sid.Length <= 60 && sid.StartsWith("S-1-5-21-", StringComparison.Ordinal) &&
        sid[9..].Split('-') is { Length: 4 } parts && parts.All(part =>
            uint.TryParse(part, NumberStyles.None, CultureInfo.InvariantCulture, out uint number) &&
            number.ToString(CultureInfo.InvariantCulture) == part);

    private static ArgumentException Invalid() => new("O payload não corresponde à operação administrativa solicitada.");
}
