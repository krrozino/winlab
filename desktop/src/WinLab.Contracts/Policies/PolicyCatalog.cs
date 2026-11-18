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

            // 6. Browser Password Manager Lock (Chrome + Edge)
            Register(new DualBrowserPolicyHandler(
                policyId: "browser.password_manager",
                title: "Bloquear Gerenciador de Senhas (Chrome e Edge)",
                description: "Impede que os navegadores salvem senhas de alunos em estações compartilhadas.",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "PasswordManagerEnabled",
                chromeEnforcedValue: 0,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "PasswordManagerEnabled",
                edgeEnforcedValue: 0,
                processChecker: processChecker
            ));

            // 7. Browser Developer Tools Lock (Chrome + Edge)
            Register(new DualBrowserPolicyHandler(
                policyId: "browser.developer_tools",
                title: "Bloquear Ferramentas do Desenvolvedor (F12)",
                description: "Desativa o inspetor de elementos e o console JavaScript (F12) no Chrome e no Edge.",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "DeveloperToolsAvailability",
                chromeEnforcedValue: 2,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "DeveloperToolsAvailability",
                edgeEnforcedValue: 2,
                processChecker: processChecker
            ));

            // 8. System: Block Interactive Command Prompt (User-scoped — preserves Admin & batch login scripts)
            Register(new RegistryDWordPolicyHandler(
                policyId: "system.disable_cmd",
                category: "Sistema",
                title: "Bloquear Prompt de Comando (CMD)",
                description: "Impede que a conta comum abra o Prompt de Comando interativo, mantendo scripts administrativos funcionais.",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\System",
                valueName: "DisableCMD",
                enforcedValue: 2,
                unconfiguredValue: 0,
                requiresLogoff: false,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Medium,
                scope: PolicyScope.User
            ));

            // 9. System: Block Registry Editor (User-scoped — preserves Admin & Win32 API executor)
            Register(new RegistryDWordPolicyHandler(
                policyId: "system.disable_regedit",
                category: "Sistema",
                title: "Bloquear Editor do Registro (Regedit)",
                description: "Impede que a conta comum execute o regedit.exe ou importe arquivos .reg manualmente.",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\System",
                valueName: "DisableRegistryTools",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: false,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Medium,
                scope: PolicyScope.User
            ));

            // 10. System: Restrict Control Panel & Windows Settings (User-scoped — preserves Admin)
            Register(new RegistryDWordPolicyHandler(
                policyId: "system.restrict_control_panel",
                category: "Sistema",
                title: "Restringir Painel de Controle e Configurações",
                description: "Impede que a conta comum abra o Painel de Controle clássico e o aplicativo Configurações do Windows.",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\Explorer",
                valueName: "NoControlPanel",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: true,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Medium,
                scope: PolicyScope.User
            ));

            // 11. Removable Storage: USB Write Protection (Machine-scoped — preserves keyboards, mice & read access)
            Register(new RegistryDWordPolicyHandler(
                policyId: "storage.usb_write_protect",
                category: "Armazenamento",
                title: "Bloquear Gravação em Pendrives USB",
                description: "Impede copiar ou gravar arquivos em unidades removíveis USB sem desativar teclado, mouse ou leitura.",
                relativeSubKeyPath: @"SYSTEM\CurrentControlSet\Control\StorageDevicePolicies",
                valueName: "WriteProtect",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: false,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.Machine
            ));

            // 12. Applications: Disable Microsoft Store for Target User
            Register(new RegistryDWordPolicyHandler(
                policyId: "apps.disable_microsoft_store",
                category: "Aplicativos",
                title: "Bloquear Acesso à Microsoft Store",
                description: "Impede que a conta comum abra a loja de aplicativos para instalar jogos ou programas não autorizados.",
                relativeSubKeyPath: @"Software\Policies\Microsoft\WindowsStore",
                valueName: "RemoveWindowsStore",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: false,
                requiresRestart: false,
                requiresAppRestart: false,
                risk: PolicyRisk.Low,
                scope: PolicyScope.User
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
