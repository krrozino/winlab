using System;
using System.Collections.Generic;
using System.Linq;

namespace WinLab.Contracts.Policies
{
    public class PolicyCatalog : IPolicyCatalog
    {
        private readonly Dictionary<string, IPolicyHandler> _policies;

        public PolicyCatalog(Func<string, bool>? processChecker = null)
        {
            _policies = new Dictionary<string, IPolicyHandler>(StringComparer.OrdinalIgnoreCase);
            RegisterDefaults(processChecker);
        }

        private void RegisterDefaults(Func<string, bool>? processChecker)
        {
            // 1. Feature 18: Wallpaper Lock
            Register(new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Alteração de Plano de Fundo",
                description: "Fixa o papel de parede institucional e impede alterações pelo aluno no painel e Explorer.",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: true,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.User
            ));

            // 2. Feature 19: Sounds Lock
            Register(new RegistryDWordPolicyHandler(
                policyId: "personalization.sounds",
                category: "Personalização",
                title: "Bloquear Alteração de Esquema de Sons",
                description: "Impede alterar os esquemas de áudio do Windows no Painel de Sons e Configurações.",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingSoundScheme",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: false,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.User
            ));

            // 3. Feature 20: Mouse Pointers Lock
            Register(new RegistryDWordPolicyHandler(
                policyId: "personalization.mouse_pointers",
                category: "Personalização",
                title: "Bloquear Alteração de Ponteiros do Mouse",
                description: "Impede alterar esquema de cursores do mouse e impede carregar ponteiros .cur/.ani.",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingMousePointers",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: false,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.User
            ));

            // 4. Feature 21: Chrome Incognito Lock (Chrome + Edge)
            Register(new DualBrowserPolicyHandler(
                policyId: "browser.chrome.incognito",
                title: "Bloquear Navegação Anônima (Chrome e Edge)",
                description: "Desativa permanentemente o modo anônimo no Google Chrome e InPrivate no Microsoft Edge.",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "IncognitoModeAvailability",
                chromeEnforcedValue: 1,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "InPrivateModeAvailability",
                edgeEnforcedValue: 1,
                processChecker: processChecker
            ));

            // 5. Feature 22: Chrome Guest Mode Lock (Chrome + Edge)
            Register(new DualBrowserPolicyHandler(
                policyId: "browser.chrome.guest",
                title: "Bloquear Modo Convidado (Chrome e Edge)",
                description: "Remove o perfil de visitante/convidado em navegadores Chrome e Edge compartilhados.",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "BrowserGuestModeEnabled",
                chromeEnforcedValue: 0,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "BrowserGuestModeEnabled",
                edgeEnforcedValue: 0,
                processChecker: processChecker
            ));
        }

        public void Register(IPolicyHandler handler)
        {
            _policies[handler.PolicyId] = handler;
        }

        public IReadOnlyList<IPolicyHandler> GetAllPolicies()
        {
            return _policies.Values.ToList();
        }

        public IPolicyHandler? GetPolicy(string policyId)
        {
            _policies.TryGetValue(policyId, out var handler);
            return handler;
        }

        public IReadOnlyList<PolicyDefinitionDto> GetCatalogDefinitions()
        {
            return _policies.Values.Select(p => new PolicyDefinitionDto
            {
                Id = p.PolicyId,
                Name = p.Title,
                Category = p.Category,
                Description = p.Description,
                RiskLevel = p.Risk.ToString(),
                Scope = p.Scope.ToString(),
                Reversible = p.Reversible,
                RequiresRestart = p.RequiresRestart,
                RequiresLogoff = p.RequiresLogoff,
                RequiresAppRestart = p.RequiresAppRestart,
                TargetProcesses = p.TargetProcesses
            }).ToList();
        }
    }
}
