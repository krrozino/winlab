using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace WinLab.Contracts.Transactions
{
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum TransactionStatus
    {
        Pending,
        Applying,
        Verifying,
        Committed,
        RollingBack,
        RolledBack,
        Failed
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum BaselineValueState
    {
        Exists,
        DoesNotExist,
        KeyDoesNotExist
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum RegistryHiveType
    {
        CurrentUser,
        LocalMachine,
        Users
    }

    [JsonConverter(typeof(JsonStringEnumConverter))]
    public enum RegistryValueType
    {
        DWord,
        String,
        ExpandString,
        Binary,
        MultiString,
        QWord
    }

    public class RegistryValueSnapshotDto
    {
        [JsonPropertyName("policyId")]
        public string PolicyId { get; set; } = string.Empty;

        [JsonPropertyName("hive")]
        public string Hive { get; set; } = string.Empty; // "HKLM", "HKCU", "HKU"

        [JsonPropertyName("subKey")]
        public string SubKey { get; set; } = string.Empty;

        [JsonPropertyName("valueName")]
        public string ValueName { get; set; } = string.Empty;

        [JsonPropertyName("state")]
        public BaselineValueState State { get; set; } = BaselineValueState.DoesNotExist;

        [JsonPropertyName("valueKind")]
        public string? ValueKind { get; set; }

        [JsonPropertyName("originalValue")]
        public object? OriginalValue { get; set; }
    }

    public class BaselineSnapshotDto
    {
        [JsonPropertyName("capturedAt")]
        public DateTime CapturedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("entries")]
        public List<RegistryValueSnapshotDto> Entries { get; set; } = new();
    }

    public class TransactionActionRecordDto
    {
        [JsonPropertyName("sequence")]
        public int Sequence { get; set; }

        [JsonPropertyName("policyId")]
        public string PolicyId { get; set; } = string.Empty;

        [JsonPropertyName("hive")]
        public string Hive { get; set; } = string.Empty;

        [JsonPropertyName("subKey")]
        public string SubKey { get; set; } = string.Empty;

        [JsonPropertyName("valueName")]
        public string ValueName { get; set; } = string.Empty;

        [JsonPropertyName("valueKind")]
        public string ValueKind { get; set; } = "DWord";

        [JsonPropertyName("appliedValue")]
        public object? AppliedValue { get; set; }

        [JsonPropertyName("appliedAt")]
        public DateTime AppliedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("verifiedAt")]
        public DateTime? VerifiedAt { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = "AppliedAndVerified";
    }

    public class RollbackStepDto
    {
        [JsonPropertyName("sequence")]
        public int Sequence { get; set; }

        [JsonPropertyName("policyId")]
        public string PolicyId { get; set; } = string.Empty;

        [JsonPropertyName("operation")]
        public string Operation { get; set; } = "DeleteValue"; // "RestoreValue" or "DeleteValue"

        [JsonPropertyName("hive")]
        public string Hive { get; set; } = string.Empty;

        [JsonPropertyName("subKey")]
        public string SubKey { get; set; } = string.Empty;

        [JsonPropertyName("valueName")]
        public string ValueName { get; set; } = string.Empty;

        [JsonPropertyName("restoreKind")]
        public string? RestoreKind { get; set; }

        [JsonPropertyName("restoreValue")]
        public object? RestoreValue { get; set; }

        [JsonPropertyName("executedAt")]
        public DateTime? ExecutedAt { get; set; }

        [JsonPropertyName("verifiedAt")]
        public DateTime? VerifiedAt { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = "Pending";
    }

    public class TransactionDto
    {
        [JsonPropertyName("transactionId")]
        public string TransactionId { get; set; } = Guid.NewGuid().ToString("D");

        [JsonPropertyName("version")]
        public string Version { get; set; } = "1.0.0";

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        [JsonPropertyName("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        [JsonPropertyName("status")]
        public TransactionStatus Status { get; set; } = TransactionStatus.Pending;

        [JsonPropertyName("targetUserName")]
        public string? TargetUserName { get; set; }

        [JsonPropertyName("targetUserSid")]
        public string? TargetUserSid { get; set; }

        [JsonPropertyName("failedPolicyId")]
        public string? FailedPolicyId { get; set; }

        [JsonPropertyName("failureReason")]
        public string? FailureReason { get; set; }

        [JsonPropertyName("baseline")]
        public BaselineSnapshotDto Baseline { get; set; } = new();

        [JsonPropertyName("actions")]
        public List<TransactionActionRecordDto> Actions { get; set; } = new();

        [JsonPropertyName("rollbackPlan")]
        public List<RollbackStepDto> RollbackPlan { get; set; } = new();
    }

    public class PolicyApplyItemDto
    {
        [JsonPropertyName("policyId")]
        public string PolicyId { get; set; } = string.Empty;

        [JsonPropertyName("desiredState")]
        public string DesiredState { get; set; } = string.Empty;
    }

    public class ApplyTransactionRequestDto
    {
        [JsonPropertyName("transactionId")]
        public string? TransactionId { get; set; }

        [JsonPropertyName("targetUserName")]
        public string? TargetUserName { get; set; }

        [JsonPropertyName("targetUserSid")]
        public string? TargetUserSid { get; set; }

        [JsonPropertyName("policies")]
        public List<PolicyApplyItemDto> Policies { get; set; } = new();
    }

    public class ApplyTransactionResultDto
    {
        [JsonPropertyName("transactionId")]
        public string TransactionId { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public TransactionStatus Status { get; set; } = TransactionStatus.Committed;

        [JsonPropertyName("appliedCount")]
        public int AppliedCount { get; set; }

        [JsonPropertyName("failedPolicyId")]
        public string? FailedPolicyId { get; set; }

        [JsonPropertyName("failureReason")]
        public string? FailureReason { get; set; }

        [JsonPropertyName("rolledBackCount")]
        public int RolledBackCount { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("success")]
        public bool Success { get; set; } = true;
    }

    public class RollbackTransactionRequestDto
    {
        [JsonPropertyName("transactionId")]
        public string TransactionId { get; set; } = string.Empty;

        [JsonPropertyName("targetUserSid")]
        public string? TargetUserSid { get; set; }
    }

    public class RollbackResultDto
    {
        [JsonPropertyName("transactionId")]
        public string TransactionId { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public TransactionStatus Status { get; set; } = TransactionStatus.RolledBack;

        [JsonPropertyName("restoredCount")]
        public int RestoredCount { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("success")]
        public bool Success { get; set; } = true;

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
