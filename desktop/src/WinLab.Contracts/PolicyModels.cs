using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace WinLab.Contracts
{
    public enum PolicyState
    {
        NotConfigured,
        Applied,
        PendingLogoff,
        PendingReboot,
        Failed,
        Reverted
    }

    public enum PolicyRisk
    {
        Low,
        Medium,
        High,
        Critical
    }

    public enum PolicyScope
    {
        User,
        Device
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

        [JsonPropertyName("requiresRestart")]
        public bool RequiresRestart { get; set; }

        [JsonPropertyName("requiresLogoff")]
        public bool RequiresLogoff { get; set; }

        [JsonPropertyName("reversible")]
        public bool Reversible { get; set; } = true;
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
}
