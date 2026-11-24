using System.Collections.Generic;

namespace WinLab.Contracts.Administration;

public static class AdminActions
{
    public const string AccountsQuery = "admin.accounts.query";
    public const string AccountsPreview = "admin.accounts.preview";
    public const string AccountsApply = "admin.accounts.apply";
    public const string DiagnosticsQuery = "admin.diagnostics.query";
    public const string PermissionsQuery = "admin.permissions.query";
    public const string PermissionsPreview = "admin.permissions.preview";
    public const string PermissionsApply = "admin.permissions.apply";

    public static bool Contains(string action) => action is AccountsQuery or AccountsPreview or AccountsApply
        or DiagnosticsQuery or PermissionsQuery or PermissionsPreview or PermissionsApply;

    public static bool IsMutation(string action) => action is AccountsApply or PermissionsApply;
}

public sealed record AdminAccountDto(string Name, string? Sid, bool Enabled, string Role,
    string PrivilegeClassification, bool Protected, IReadOnlyList<string> GroupSids);

public sealed record AdminAccountsDto(IReadOnlyList<AdminAccountDto> Accounts, string? RecoverySid,
    string RecoveryStatus, bool CanWrite, IReadOnlyList<string> Limitations);

public sealed record AdminAccountPreviewDto(string Revision, string Scope, AdminAccountDto? Before,
    AdminAccountDto After, bool CanApply, IReadOnlyList<string> Limitations);

public sealed record AdminAccountResultDto(AdminAccountDto Account, string Message);

public sealed record AdminManagementDto(string Status, string Domain, string Entra, string Mdm);

public sealed record AdminDiagnosticSignalDto(string Id, string Name, string Scope, string ObservedState,
    string Origin, string EffectiveState, string Detail);

public sealed record AdminDiagnosticsDto(AdminManagementDto Management, IReadOnlyList<AdminDiagnosticSignalDto> Signals,
    IReadOnlyList<AdminPermissionDto> Restrictions, IReadOnlyList<string> Limitations);

public sealed record AdminPermissionStateDto(string Origin, string ConfiguredState, string EffectiveState,
    object? ObservedValue, string? Evidence);

public sealed record AdminPermissionDto(string Id, string Name, string Category, string Description,
    string ExpectedEffect, string Scope, string Risk, string Compatibility, bool Supported,
    bool RequiresRestart, bool RequiresLogoff, bool RequiresAppRestart, string Mechanism,
    IReadOnlyList<string> Intents, IReadOnlyList<string> Limitations, AdminPermissionStateDto State,
    string? ExpansionTarget = null);

public sealed record AdminPermissionsDto(AdminAccountDto? Target, AdminManagementDto Management,
    IReadOnlyList<AdminPermissionDto> Permissions, bool CanWrite);

public sealed record AdminPermissionPlan(string PermissionId, string Intent, string? TargetUserSid = null);

public sealed record AdminPermissionPreviewDto(string Revision, string PermissionId, string Intent, string Scope,
    AdminAccountDto? Target, AdminPermissionStateDto Before, AdminPermissionStateDto After, bool CanApply,
    IReadOnlyList<string> Limitations);

public sealed record AdminPermissionResultDto(AdminPermissionDto Permission, string? TransactionId, string Message);
