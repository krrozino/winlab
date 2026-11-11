using System;
using System.Collections.Generic;
using WinLab.Contracts.RegistryServices;

namespace WinLab.Contracts.Policies
{
    public interface IPolicyHandler
    {
        string PolicyId { get; }
        string Category { get; }
        string Title { get; }
        string Description { get; }
        PolicyScope Scope { get; }
        PolicyRisk Risk { get; }
        bool RequiresRestart { get; }
        bool RequiresLogoff { get; }
        bool RequiresAppRestart { get; }
        bool Reversible { get; }
        string[] TargetProcesses { get; }

        PolicyProbeResult Probe(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager);
        PolicyApplyResult Apply(string? targetUserSid, PolicyDesiredState desiredState, IRegistryService registry, IUserHiveManager hiveManager);
        PolicyRevertResult Revert(string? targetUserSid, IRegistryService registry, IUserHiveManager hiveManager);
    }

    public interface IPolicyCatalog
    {
        IReadOnlyList<IPolicyHandler> GetAllPolicies();
        IPolicyHandler? GetPolicy(string policyId);
        IReadOnlyList<PolicyDefinitionDto> GetCatalogDefinitions();
    }
}
