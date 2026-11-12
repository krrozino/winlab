namespace WinLab.Contracts
{
    /// <summary>
    /// Constantes centrais de comunicação IPC, segurança e versionamento do WinLab Desktop.
    /// </summary>
    public static class IpcConstants
    {
        public const string PipeName = "WinLabService";
        public const string FullPipeAddress = @"\\.\pipe\WinLabService";
        public const string ProtocolVersion = "1.0.0";

        // Ações de Consulta (Read-Only) homologadas
        public const string ActionQueryInventory = "inventory.query";
        public const string ActionQueryPolicyState = "policy.query_state";
        public const string ActionQueryPreflight = "preflight.query";
        public const string ActionListPresets = "presets.list";

        // Ações de Validação e Pré-visualização (Read-Only / Dry-Run)
        public const string ActionPreviewPolicyDiff = "policy.preview_diff";
        public const string ActionValidateConfig = "config.validate";

        // Ações de Criação de Baseline e Diagnóstico de Ambiente
        public const string ActionCreateBaseline = "baseline.create";
        public const string ActionCreateLocalAccount = "accounts.create_local";
        public const string ActionGetEnvironment = "system.environment";

        // Ações de Política Declarativa e Transações (Milestone 3)
        public const string ActionQueryPolicyCatalog = "policy.query_catalog";
        public const string ActionQueryPolicyStates = "policy.query_states";
        public const string ActionApplyTransaction = "policy.apply_transaction";
        public const string ActionRollbackTransaction = "policy.rollback_transaction";
        public const string ActionQueryTransactionStatus = "policy.query_status";

        // Ações Mutáveis Legadas (Fase Fundação — Bloqueadas por PRIVILEGED_EXECUTOR_DISABLED)
        public const string ActionApplyPolicies = "policy.apply";
        public const string ActionRollbackPolicies = "policy.rollback";

        // Lista estrita de ações permitidas no protocolo (Allowlist)
        public static readonly string[] AllowedActions = new[]
        {
            ActionQueryInventory,
            ActionQueryPolicyState,
            ActionQueryPreflight,
            ActionListPresets,
            ActionPreviewPolicyDiff,
            ActionValidateConfig,
            ActionCreateBaseline,
            ActionCreateLocalAccount,
            ActionGetEnvironment,
            ActionQueryPolicyCatalog,
            ActionQueryPolicyStates,
            ActionApplyTransaction,
            ActionRollbackTransaction,
            ActionQueryTransactionStatus,
            ActionApplyPolicies,
            ActionRollbackPolicies
        };

        // SDDL de segurança para criação do Named Pipe:
        // Acesso exclusivo concedido a SYSTEM (SY) e BUILTIN\Administrators (BA).
        // Nega acesso a usuários comuns ou processos não elevados.
        public const string PipeSecuritySddl = "D:(A;;GA;;;BA)(A;;GA;;;SY)";
    }
}
