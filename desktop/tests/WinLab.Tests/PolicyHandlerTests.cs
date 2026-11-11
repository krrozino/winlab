using System;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;
using Xunit;

namespace WinLab.Tests
{
    public class PolicyHandlerTests
    {
        [Fact]
        public void WallpaperPolicy_FullLifecycle_ProbeApplyRevert()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string studentSid = "S-1-5-21-12345-1002";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Alteração de Plano de Fundo",
                description: "Fixa o papel de parede institucional",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper",
                enforcedValue: 1,
                requiresLogoff: true
            );

            // 1. Initial Probe -> NotConfigured
            var initialProbe = handler.Probe(studentSid, registry, hiveManager);
            Assert.False(initialProbe.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, initialProbe.EffectiveState);

            // 2. Apply Blocked -> Writes value and returns PendingLogoff
            var applyResult = handler.Apply(studentSid, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyResult.Success);
            Assert.Equal(PolicyEffectiveState.PendingLogoff, applyResult.EffectiveState);

            // 3. Probe -> Active, PendingLogoff
            var activeProbe = handler.Probe(studentSid, registry, hiveManager);
            Assert.True(activeProbe.IsActive);
            Assert.Equal(PolicyEffectiveState.PendingLogoff, activeProbe.EffectiveState);
            Assert.Equal(1, Convert.ToInt32(activeProbe.LiveValue));

            // 4. Revert -> Deletes value, returns NotConfigured
            var revertResult = handler.Revert(studentSid, registry, hiveManager);
            Assert.True(revertResult.Success);
            Assert.Equal(PolicyEffectiveState.NotConfigured, revertResult.EffectiveState);

            // 5. Final Probe -> NotConfigured
            var finalProbe = handler.Probe(studentSid, registry, hiveManager);
            Assert.False(finalProbe.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, finalProbe.EffectiveState);
        }

        [Fact]
        public void SoundsPolicy_FullLifecycle_ProbeApplyRevert()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string studentSid = "S-1-5-21-12345-1002";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.sounds",
                category: "Personalização",
                title: "Bloquear Alteração de Esquema de Sons",
                description: "Impede alterar esquemas de áudio",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingSoundScheme",
                enforcedValue: 1,
                requiresLogoff: false
            );

            // Initial
            Assert.False(handler.Probe(studentSid, registry, hiveManager).IsActive);

            // Apply Blocked -> Applied
            var applyRes = handler.Apply(studentSid, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyRes.Success);
            Assert.Equal(PolicyEffectiveState.Applied, applyRes.EffectiveState);

            // Probe -> Applied
            var probeRes = handler.Probe(studentSid, registry, hiveManager);
            Assert.True(probeRes.IsActive);
            Assert.Equal(PolicyEffectiveState.Applied, probeRes.EffectiveState);

            // Revert
            var revertRes = handler.Revert(studentSid, registry, hiveManager);
            Assert.True(revertRes.Success);
            Assert.Equal(PolicyEffectiveState.NotConfigured, revertRes.EffectiveState);
        }

        [Fact]
        public void MousePointersPolicy_FullLifecycle_ProbeApplyRevert()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string studentSid = "S-1-5-21-12345-1002";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.mouse_pointers",
                category: "Personalização",
                title: "Bloquear Alteração de Ponteiros do Mouse",
                description: "Impede alterar ponteiros",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingMousePointers",
                enforcedValue: 1,
                requiresLogoff: false
            );

            // Apply Blocked
            var applyRes = handler.Apply(studentSid, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyRes.Success);
            Assert.Equal(PolicyEffectiveState.Applied, applyRes.EffectiveState);

            // Probe
            var probe = handler.Probe(studentSid, registry, hiveManager);
            Assert.True(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.Applied, probe.EffectiveState);

            // Apply NotConfigured
            var unconfigRes = handler.Apply(studentSid, PolicyDesiredState.NotConfigured, registry, hiveManager);
            Assert.True(unconfigRes.Success);
            Assert.Equal(PolicyEffectiveState.NotConfigured, unconfigRes.EffectiveState);

            Assert.False(handler.Probe(studentSid, registry, hiveManager).IsActive);
        }

        [Fact]
        public void UserPolicy_AdministratorImmunity_RejectsApplicationToAdmin()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string adminSid = "S-1-5-32-544"; // Builtin Administrators

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Alteração de Plano de Fundo",
                description: "Fixa o papel de parede",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper"
            );

            var result = handler.Apply(adminSid, PolicyDesiredState.Blocked, registry, hiveManager);

            Assert.False(result.Success);
            Assert.Equal(PolicyEffectiveState.Failed, result.EffectiveState);
            Assert.Contains("imunidade de administrador", result.Error);
        }

        [Fact]
        public void UserPolicy_UninitializedProfile_ReturnsPendingFirstLogon()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string newStudentSid = "S-1-5-21-99999-1005";
            hiveManager.SetUserUninitialized(newStudentSid);

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Alteração de Plano de Fundo",
                description: "Fixa papel de parede",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper"
            );

            var probe = handler.Probe(newStudentSid, registry, hiveManager);

            Assert.False(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.PendingFirstLogon, probe.EffectiveState);
            Assert.Contains("primeiro logon", probe.DetailMessage);
        }

        [Fact]
        public void DualBrowserPolicy_Incognito_DualRegistryWriteAndProcessDetection()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

            bool browserRunning = false;
            var handler = new DualBrowserPolicyHandler(
                policyId: "browser.chrome.incognito",
                title: "Bloquear Navegação Anônima",
                description: "Desativa modo anônimo no Chrome e Edge",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "IncognitoModeAvailability",
                chromeEnforcedValue: 1,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "InPrivateModeAvailability",
                edgeEnforcedValue: 1,
                processChecker: p => browserRunning
            );

            // 1. Initial probe -> NotConfigured
            var initialProbe = handler.Probe(null, registry, hiveManager);
            Assert.False(initialProbe.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, initialProbe.EffectiveState);

            // 2. Apply with browser running -> PendingAppRestart
            browserRunning = true;
            var applyRunning = handler.Apply(null, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyRunning.Success);
            Assert.Equal(PolicyEffectiveState.PendingAppRestart, applyRunning.EffectiveState);

            var probeRunning = handler.Probe(null, registry, hiveManager);
            Assert.True(probeRunning.IsActive);
            Assert.Equal(PolicyEffectiveState.PendingAppRestart, probeRunning.EffectiveState);

            // 3. Browser closes -> Transitions to Applied
            browserRunning = false;
            var probeClosed = handler.Probe(null, registry, hiveManager);
            Assert.True(probeClosed.IsActive);
            Assert.Equal(PolicyEffectiveState.Applied, probeClosed.EffectiveState);

            // 4. Drift simulation: Edge key deleted externally
            registry.DeleteValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "InPrivateModeAvailability");
            var driftProbe = handler.Probe(null, registry, hiveManager);
            Assert.False(driftProbe.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, driftProbe.EffectiveState);

            // 5. Revert -> Cleans both
            handler.Revert(null, registry, hiveManager);
            var finalProbe = handler.Probe(null, registry, hiveManager);
            Assert.False(finalProbe.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, finalProbe.EffectiveState);
        }

        [Fact]
        public void DualBrowserPolicy_GuestMode_EnforcesZeroAndAppliesCleanly()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

            var handler = new DualBrowserPolicyHandler(
                policyId: "browser.chrome.guest",
                title: "Bloquear Modo Convidado",
                description: "Desativa perfil convidado",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "BrowserGuestModeEnabled",
                chromeEnforcedValue: 0,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "BrowserGuestModeEnabled",
                edgeEnforcedValue: 0,
                processChecker: p => false
            );

            // Apply Blocked (enforced value is 0)
            var applyRes = handler.Apply(null, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyRes.Success);
            Assert.Equal(PolicyEffectiveState.Applied, applyRes.EffectiveState);

            // Verify both Chrome and Edge have DWORD 0
            Assert.Equal(0, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "BrowserGuestModeEnabled"));
            Assert.Equal(0, registry.GetValue(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "BrowserGuestModeEnabled"));

            // Probe is active
            var probe = handler.Probe(null, registry, hiveManager);
            Assert.True(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.Applied, probe.EffectiveState);

            // Revert
            handler.Revert(null, registry, hiveManager);
            Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Google\Chrome", "BrowserGuestModeEnabled"));
            Assert.False(registry.ValueExists(RegistryHiveType.LocalMachine, @"SOFTWARE\Policies\Microsoft\Edge", "BrowserGuestModeEnabled"));
        }
    }
}
