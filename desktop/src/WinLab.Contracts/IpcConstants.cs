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

        // Ações Mutáveis Futuras (Exigem Elevação e Executor Privilegiado em Fases Posteriores)
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
            ActionApplyPolicies,
            ActionRollbackPolicies
        };

        // SDDL de segurança para criação do Named Pipe:
        // Acesso exclusivo concedido a SYSTEM (SY) e BUILTIN\Administrators (BA).
        // Nega acesso a usuários comuns ou processos não elevados.
        public const string PipeSecuritySddl = "D:(A;;GA;;;BA)(A;;GA;;;SY)";
    }
}
