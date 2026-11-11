using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace WinLab.Contracts
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum PolicyState
    {
        NotConfigured,
        Applied,
        PendingLogoff,
        PendingReboot,
        PendingAppRestart,
        PendingFirstLogon,
        Drifted,
        Failed,
        Inconclusive,
        NotSupported,
        Reverted
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum PolicyDesiredState
    {
        NotConfigured = 0,
        Blocked = 1,
        Allowed = 2
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum PolicyEffectiveState
    {
        NotConfigured,
        Applying,
        Applied,
        PendingRefresh,
        PendingLogoff,
        PendingReboot,
        PendingAppRestart,
        PendingFirstLogon,
        Drifted,
        Failed,
        Inconclusive,
        NotSupported,
        Reverted
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum PolicyRisk
    {
        Low,
        Medium,
        High,
        Critical
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum PolicyRiskLevel
    {
        Low,
        Medium,
        High,
        Critical
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum PolicyScope
    {
        User,
        Device,
        Machine
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum PolicyCategory
    {
        Personalization,
        Browsers,
        System,
        Accounts,
        Storage,
        Maintenance
    }

    public class TriStateDto
    {
        [JsonPropertyName("desiredState")]
        public string DesiredState { get; set; } = "NotConfigured";

        [JsonPropertyName("configuredState")]
        public string ConfiguredState { get; set; } = "NotConfigured";

        [JsonPropertyName("effectiveState")]
        public string EffectiveState { get; set; } = "NotConfigured";

        [JsonPropertyName("evidence")]
        public string? Evidence { get; set; }
    }

    public class PolicyDefinitionDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("riskLevel")]
        public string RiskLevel { get; set; } = "Low";

        [JsonPropertyName("scope")]
        public string Scope { get; set; } = "User";

        [JsonPropertyName("reversible")]
        public bool Reversible { get; set; } = true;

        [JsonPropertyName("requiresRestart")]
        public bool RequiresRestart { get; set; }

        [JsonPropertyName("requiresLogoff")]
        public bool RequiresLogoff { get; set; }

        [JsonPropertyName("requiresAppRestart")]
        public bool RequiresAppRestart { get; set; }

        [JsonPropertyName("targetProcesses")]
        public string[] TargetProcesses { get; set; } = Array.Empty<string>();
    }

    public class PolicyStateDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("scope")]
        public string Scope { get; set; } = "User";

        [JsonPropertyName("risk")]
        public string Risk { get; set; } = "Low";

        [JsonPropertyName("currentState")]
        public string CurrentState { get; set; } = "NotConfigured";

        [JsonPropertyName("desiredState")]
        public string DesiredState { get; set; } = "NotConfigured";

        [JsonPropertyName("configuredState")]
        public string ConfiguredState { get; set; } = "NotConfigured";

        [JsonPropertyName("effectiveState")]
        public string EffectiveState { get; set; } = "NotConfigured";

        [JsonPropertyName("requiresRestart")]
        public bool RequiresRestart { get; set; }

        [JsonPropertyName("requiresLogoff")]
        public bool RequiresLogoff { get; set; }

        [JsonPropertyName("requiresAppRestart")]
        public bool RequiresAppRestart { get; set; }

        [JsonPropertyName("reversible")]
        public bool Reversible { get; set; } = true;

        [JsonPropertyName("evidence")]
        public string? Evidence { get; set; }

        [JsonPropertyName("lastVerified")]
        public string? LastVerified { get; set; }
    }

    public class PolicyItemDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public string Category { get; set; } = string.Empty;

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("description")]
        public string Description { get; set; } = string.Empty;

        [JsonPropertyName("scope")]
        public PolicyScope Scope { get; set; }

        [JsonPropertyName("risk")]
        public PolicyRisk Risk { get; set; }

        [JsonPropertyName("currentState")]
        public PolicyState CurrentState { get; set; } = PolicyState.NotConfigured;

        [JsonPropertyName("desiredState")]
        public PolicyState DesiredState { get; set; } = PolicyState.NotConfigured;

        [JsonPropertyName("configuredState")]
        public PolicyState ConfiguredState { get; set; } = PolicyState.NotConfigured;

        [JsonPropertyName("effectiveState")]
        public PolicyEffectiveState EffectiveState { get; set; } = PolicyEffectiveState.NotConfigured;

        [JsonPropertyName("requiresRestart")]
        public bool RequiresRestart { get; set; }

        [JsonPropertyName("requiresLogoff")]
        public bool RequiresLogoff { get; set; }

        [JsonPropertyName("requiresAppRestart")]
        public bool RequiresAppRestart { get; set; }

        [JsonPropertyName("reversible")]
        public bool Reversible { get; set; } = true;

        [JsonPropertyName("evidence")]
        public string? Evidence { get; set; }

        [JsonPropertyName("lastVerified")]
        public string? LastVerified { get; set; }
    }

    public class PolicyStateSummaryDto
    {
        [JsonPropertyName("totalPolicies")]
        public int TotalPolicies { get; set; }

        [JsonPropertyName("appliedCount")]
        public int AppliedCount { get; set; }

        [JsonPropertyName("notConfiguredCount")]
        public int NotConfiguredCount { get; set; }

        [JsonPropertyName("pendingCount")]
        public int PendingCount { get; set; }

        [JsonPropertyName("items")]
        public List<PolicyItemDto> Items { get; set; } = new List<PolicyItemDto>();
    }

    public class PolicyProbeResult
    {
        public string PolicyId { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public object? LiveValue { get; set; }
        public bool RequiresLogoff { get; set; }
        public bool RequiresRestart { get; set; }
        public bool RequiresAppRestart { get; set; }
        public string? TargetSid { get; set; }
        public PolicyEffectiveState EffectiveState { get; set; }
        public string? DetailMessage { get; set; }
        public DateTime ProbedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class PolicyApplyResult
    {
        public string PolicyId { get; set; } = string.Empty;
        public bool Success { get; set; }
        public PolicyEffectiveState EffectiveState { get; set; }
        public string? Error { get; set; }
        public bool RequiresLogoff { get; set; }
        public bool RequiresRestart { get; set; }
        public bool RequiresAppRestart { get; set; }
        public DateTime AppliedAtUtc { get; set; } = DateTime.UtcNow;
    }

    public class PolicyRevertResult
    {
        public string PolicyId { get; set; } = string.Empty;
        public bool Success { get; set; }
        public PolicyEffectiveState EffectiveState { get; set; } = PolicyEffectiveState.NotConfigured;
        public string? Error { get; set; }
        public DateTime RevertedAtUtc { get; set; } = DateTime.UtcNow;
    }
}
