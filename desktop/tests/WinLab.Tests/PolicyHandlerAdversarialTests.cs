using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;
using Xunit;

namespace WinLab.Tests
{
    public class PolicyHandlerAdversarialTests
    {
        // -------------------------------------------------------------
        // Personalization Policies: Wallpaper, Sounds, Mouse Pointers
        // -------------------------------------------------------------

        [Fact]
        public void Personalization_UnmountedHive_Inaccessible_ReturnsInconclusive()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string inaccessibleSid = "S-1-5-21-99999-1099";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Papel de Parede",
                description: "Fixa papel de parede",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper"
            );

            // Hive manager returns inaccessible for simulated locked profile
            // We can test custom scope or mock manager behavior
            var customHiveManager = new CustomHiveManager(userSid =>
                new MockUserHiveScope(userSid ?? "UNKNOWN", userSid ?? "UNKNOWN", isAvailable: false, status: UserProfileStatus.Inaccessible, error: "NTUSER.DAT locked by another process"));

            var probe = handler.Probe(inaccessibleSid, registry, customHiveManager);

            Assert.False(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.Inconclusive, probe.EffectiveState);
            Assert.Contains("locked", probe.DetailMessage);

            // Apply on inaccessible hive fails gracefully
            var applyRes = handler.Apply(inaccessibleSid, PolicyDesiredState.Blocked, registry, customHiveManager);
            Assert.False(applyRes.Success);
            Assert.Equal(PolicyEffectiveState.Failed, applyRes.EffectiveState);

            // Revert on inaccessible hive fails gracefully
            var revertRes = handler.Revert(inaccessibleSid, registry, customHiveManager);
            Assert.False(revertRes.Success);
            Assert.Equal(PolicyEffectiveState.Failed, revertRes.EffectiveState);
        }

        [Fact]
        public void Personalization_UninitializedProfile_ReturnsPendingFirstLogon()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string uninitSid = "S-1-5-21-88888-1008";
            hiveManager.SetUserUninitialized(uninitSid);

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.sounds",
                category: "Personalização",
                title: "Bloquear Esquema de Sons",
                description: "Fixa sons",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingSoundScheme"
            );

            var probe = handler.Probe(uninitSid, registry, hiveManager);

            Assert.False(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.PendingFirstLogon, probe.EffectiveState);
            Assert.Contains("primeiro logon", probe.DetailMessage);
        }

        [Fact]
        public void Personalization_MissingSubkey_ReturnsNotConfiguredWithoutThrowing()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string studentSid = "S-1-5-21-12345-1002";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.mouse_pointers",
                category: "Personalização",
                title: "Bloquear Ponteiros",
                description: "Fixa ponteiros",
                relativeSubKeyPath: @"Software\Policies\NonExistentSubkey\Deep\Tree",
                valueName: "NoChangingMousePointers"
            );

            var probe = handler.Probe(studentSid, registry, hiveManager);

            Assert.False(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, probe.EffectiveState);
            Assert.Null(probe.LiveValue);
        }

        [Theory]
        [InlineData("1")]                   // REG_SZ string with "1"
        [InlineData("true")]                // REG_SZ string with "true"
        [InlineData("corrupted")]           // REG_SZ string with arbitrary text
        [InlineData(-1)]                    // Negative integer
        [InlineData(999)]                   // Value other than enforced (1)
        public void Personalization_InvalidValueTypeOrValue_RejectedAsInactive(object rawValue)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string studentSid = "S-1-5-21-12345-1002";
            string keyPath = $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.mouse_pointers",
                category: "Personalização",
                title: "Bloquear Ponteiros",
                description: "Fixa ponteiros",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingMousePointers",
                enforcedValue: 1
            );

            // Inject non-DWORD or invalid value into registry
            var kind = rawValue is string ? RegistryValueType.String : RegistryValueType.DWord;
            registry.SetValue(RegistryHiveType.Users, keyPath, "NoChangingMousePointers", rawValue, kind);

            var probe = handler.Probe(studentSid, registry, hiveManager);

            Assert.False(probe.IsActive, $"Value '{rawValue}' of type {rawValue.GetType().Name} must not be accepted as Active");
            Assert.Equal(PolicyEffectiveState.NotConfigured, probe.EffectiveState);
        }

        [Fact]
        public void Personalization_ByteArrayValue_RejectedAsInactive()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string studentSid = "S-1-5-21-12345-1002";
            string keyPath = $@"{studentSid}\Software\Policies\Microsoft\Windows\Personalization";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.sounds",
                category: "Personalização",
                title: "Bloquear Sons",
                description: "Fixa sons",
                relativeSubKeyPath: @"Software\Policies\Microsoft\Windows\Personalization",
                valueName: "NoChangingSoundScheme",
                enforcedValue: 1
            );

            registry.SetValue(RegistryHiveType.Users, keyPath, "NoChangingSoundScheme", new byte[] { 1, 0, 0, 0 }, RegistryValueType.Binary);

            var probe = handler.Probe(studentSid, registry, hiveManager);

            Assert.False(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, probe.EffectiveState);
        }

        [Theory]
        [InlineData("S-1-5-32-544")]
        [InlineData("  S-1-5-32-544  ")]
        [InlineData("S-1-5-21-999-500")]
        [InlineData("  S-1-5-21-999-500  ")]
        [InlineData("Administrador")]
        [InlineData("  Administrador  ")]
        [InlineData("administrator")]
        [InlineData("  ADMINISTRATOR  ")]
        public void Personalization_AdminImmunity_StrictlyBlocksApplication(string adminSidOrName)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Wallpaper",
                description: "Fixa wallpaper",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper"
            );

            var result = handler.Apply(adminSidOrName, PolicyDesiredState.Blocked, registry, hiveManager);

            Assert.False(result.Success);
            Assert.Equal(PolicyEffectiveState.Failed, result.EffectiveState);
            Assert.Contains("imunidade de administrador", result.Error);
        }

        [Fact]
        public void Personalization_EmptyOrWhitespaceSid_FallsBackToCurrentUser()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Wallpaper",
                description: "Fixa wallpaper",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper",
                enforcedValue: 1,
                unconfiguredValue: 0,
                requiresLogoff: true
            );

            // Apply with whitespace SID
            var applyRes = handler.Apply("   ", PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyRes.Success);

            // Verify written under CurrentUser (HKCU)
            Assert.Equal(1, registry.GetValue(RegistryHiveType.CurrentUser, @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop", "NoChangingWallPaper"));

            // Probe with empty SID
            var probeRes = handler.Probe("", registry, hiveManager);
            Assert.True(probeRes.IsActive);
            Assert.Equal(PolicyEffectiveState.PendingLogoff, probeRes.EffectiveState);
        }

        [Fact]
        public void Personalization_RegistryFault_HandledGracefullyWithoutCrashing()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();
            string studentSid = "S-1-5-21-12345-1002";

            var handler = new RegistryDWordPolicyHandler(
                policyId: "personalization.wallpaper",
                category: "Personalização",
                title: "Bloquear Wallpaper",
                description: "Fixa wallpaper",
                relativeSubKeyPath: @"Software\Microsoft\Windows\CurrentVersion\Policies\ActiveDesktop",
                valueName: "NoChangingWallPaper"
            );

            // Inject probe fault
            registry.SetProbeFault("NoChangingWallPaper", new UnauthorizedAccessException("Simulated read access denied"));
            var probe = handler.Probe(studentSid, registry, hiveManager);
            Assert.False(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.Inconclusive, probe.EffectiveState);
            registry.ClearProbeFault("NoChangingWallPaper");

            // Inject write fault
            registry.SetWriteFault("NoChangingWallPaper", new UnauthorizedAccessException("Simulated write access denied"));
            var apply = handler.Apply(studentSid, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.False(apply.Success);
            Assert.Equal(PolicyEffectiveState.Failed, apply.EffectiveState);
            registry.ClearWriteFault("NoChangingWallPaper");
        }

        // -------------------------------------------------------------
        // Dual Browser Policies: Chrome Incognito, Chrome Guest Mode
        // -------------------------------------------------------------

        [Fact]
        public void DualBrowser_Incognito_PartialDrift_Matrix()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

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
                processChecker: p => false
            );

            string chromeKey = @"SOFTWARE\Policies\Google\Chrome";
            string edgeKey = @"SOFTWARE\Policies\Microsoft\Edge";

            // 1. Chrome applied (1), Edge missing (null) -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability", 1, RegistryValueType.DWord);
            registry.DeleteValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability");
            var p1 = handler.Probe(null, registry, hiveManager);
            Assert.False(p1.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p1.EffectiveState);

            // 2. Chrome missing (null), Edge applied (1) -> Drifted
            registry.DeleteValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability");
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability", 1, RegistryValueType.DWord);
            var p2 = handler.Probe(null, registry, hiveManager);
            Assert.False(p2.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p2.EffectiveState);

            // 3. Chrome applied (1), Edge opposite (0) -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability", 1, RegistryValueType.DWord);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability", 0, RegistryValueType.DWord);
            var p3 = handler.Probe(null, registry, hiveManager);
            Assert.False(p3.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p3.EffectiveState);

            // 4. Chrome opposite (0), Edge applied (1) -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability", 0, RegistryValueType.DWord);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability", 1, RegistryValueType.DWord);
            var p4 = handler.Probe(null, registry, hiveManager);
            Assert.False(p4.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p4.EffectiveState);

            // 5. Both opposite (0, 0) -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability", 0, RegistryValueType.DWord);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability", 0, RegistryValueType.DWord);
            var p5 = handler.Probe(null, registry, hiveManager);
            Assert.False(p5.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p5.EffectiveState);

            // 6. Chrome string "1" (REG_SZ), Edge DWORD 1 -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability", "1", RegistryValueType.String);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability", 1, RegistryValueType.DWord);
            var p6 = handler.Probe(null, registry, hiveManager);
            Assert.False(p6.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p6.EffectiveState);

            // 7. Both absent (null, null) -> NotConfigured
            registry.DeleteValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability");
            registry.DeleteValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability");
            var p7 = handler.Probe(null, registry, hiveManager);
            Assert.False(p7.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, p7.EffectiveState);

            // 8. Both DWORD 1 -> Applied
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "IncognitoModeAvailability", 1, RegistryValueType.DWord);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "InPrivateModeAvailability", 1, RegistryValueType.DWord);
            var p8 = handler.Probe(null, registry, hiveManager);
            Assert.True(p8.IsActive);
            Assert.Equal(PolicyEffectiveState.Applied, p8.EffectiveState);
        }

        [Fact]
        public void DualBrowser_GuestMode_PartialDrift_Matrix()
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

            string chromeKey = @"SOFTWARE\Policies\Google\Chrome";
            string edgeKey = @"SOFTWARE\Policies\Microsoft\Edge";

            // 1. Chrome applied (0), Edge missing (null) -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "BrowserGuestModeEnabled", 0, RegistryValueType.DWord);
            registry.DeleteValue(RegistryHiveType.LocalMachine, edgeKey, "BrowserGuestModeEnabled");
            var p1 = handler.Probe(null, registry, hiveManager);
            Assert.False(p1.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p1.EffectiveState);

            // 2. Chrome missing (null), Edge applied (0) -> Drifted
            registry.DeleteValue(RegistryHiveType.LocalMachine, chromeKey, "BrowserGuestModeEnabled");
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "BrowserGuestModeEnabled", 0, RegistryValueType.DWord);
            var p2 = handler.Probe(null, registry, hiveManager);
            Assert.False(p2.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p2.EffectiveState);

            // 3. Chrome applied (0), Edge opposite (1) -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "BrowserGuestModeEnabled", 0, RegistryValueType.DWord);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "BrowserGuestModeEnabled", 1, RegistryValueType.DWord);
            var p3 = handler.Probe(null, registry, hiveManager);
            Assert.False(p3.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p3.EffectiveState);

            // 4. Both opposite (1, 1) -> Drifted
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "BrowserGuestModeEnabled", 1, RegistryValueType.DWord);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "BrowserGuestModeEnabled", 1, RegistryValueType.DWord);
            var p4 = handler.Probe(null, registry, hiveManager);
            Assert.False(p4.IsActive);
            Assert.Equal(PolicyEffectiveState.Drifted, p4.EffectiveState);

            // 5. Both absent (null, null) -> NotConfigured
            registry.DeleteValue(RegistryHiveType.LocalMachine, chromeKey, "BrowserGuestModeEnabled");
            registry.DeleteValue(RegistryHiveType.LocalMachine, edgeKey, "BrowserGuestModeEnabled");
            var p5 = handler.Probe(null, registry, hiveManager);
            Assert.False(p5.IsActive);
            Assert.Equal(PolicyEffectiveState.NotConfigured, p5.EffectiveState);

            // 6. Both applied (0, 0) -> Applied
            registry.SetValue(RegistryHiveType.LocalMachine, chromeKey, "BrowserGuestModeEnabled", 0, RegistryValueType.DWord);
            registry.SetValue(RegistryHiveType.LocalMachine, edgeKey, "BrowserGuestModeEnabled", 0, RegistryValueType.DWord);
            var p6 = handler.Probe(null, registry, hiveManager);
            Assert.True(p6.IsActive);
            Assert.Equal(PolicyEffectiveState.Applied, p6.EffectiveState);
        }

        [Theory]
        [InlineData("chrome")]
        [InlineData("msedge")]
        [InlineData("both")]
        public void DualBrowser_ProcessDetection_ReportsPendingAppRestart_AndTransitionsToApplied(string activeBrowser)
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

            bool chromeRunning = activeBrowser == "chrome" || activeBrowser == "both";
            bool edgeRunning = activeBrowser == "msedge" || activeBrowser == "both";

            var handler = new DualBrowserPolicyHandler(
                policyId: "browser.chrome.incognito",
                title: "Bloquear Anônima",
                description: "Bloqueio de anônima",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "IncognitoModeAvailability",
                chromeEnforcedValue: 1,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "InPrivateModeAvailability",
                edgeEnforcedValue: 1,
                processChecker: p =>
                {
                    if (p.Equals("chrome", StringComparison.OrdinalIgnoreCase)) return chromeRunning;
                    if (p.Equals("msedge", StringComparison.OrdinalIgnoreCase)) return edgeRunning;
                    return false;
                }
            );

            // Apply policy with browser active
            var applyRes = handler.Apply(null, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyRes.Success);
            Assert.Equal(PolicyEffectiveState.PendingAppRestart, applyRes.EffectiveState);

            // Probe confirms PendingAppRestart while active
            var probeRunning = handler.Probe(null, registry, hiveManager);
            Assert.True(probeRunning.IsActive);
            Assert.Equal(PolicyEffectiveState.PendingAppRestart, probeRunning.EffectiveState);

            // Both browsers terminate
            chromeRunning = false;
            edgeRunning = false;

            // Probe confirms clean transition to Applied
            var probeClosed = handler.Probe(null, registry, hiveManager);
            Assert.True(probeClosed.IsActive);
            Assert.Equal(PolicyEffectiveState.Applied, probeClosed.EffectiveState);
        }

        [Fact]
        public void DualBrowser_ProcessChecker_FaultInjection_SwallowedGracefully()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

            // Simulate process checker throwing Win32Exception / UnauthorizedAccessException
            var handler = new DualBrowserPolicyHandler(
                policyId: "browser.chrome.incognito",
                title: "Bloquear Anônima",
                description: "Bloqueio anônima",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "IncognitoModeAvailability",
                chromeEnforcedValue: 1,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "InPrivateModeAvailability",
                edgeEnforcedValue: 1,
                processChecker: p => throw new System.ComponentModel.Win32Exception("Access denied accessing process table")
            );

            // Apply Blocked: must not crash with unhandled exception
            var applyRes = handler.Apply(null, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.True(applyRes.Success);

            // Probe: must not crash with unhandled exception
            var probe = handler.Probe(null, registry, hiveManager);
            Assert.True(probe.IsActive);
            // Since process checking failed safely, it falls back to Applied (no process confirmed running)
            Assert.Equal(PolicyEffectiveState.Applied, probe.EffectiveState);
        }

        [Fact]
        public void DualBrowser_RegistryFault_HandledGracefully()
        {
            var registry = new InMemoryRegistryService();
            var hiveManager = new MockUserHiveManager();

            var handler = new DualBrowserPolicyHandler(
                policyId: "browser.chrome.incognito",
                title: "Bloquear Anônima",
                description: "Bloqueio",
                chromeSubKey: @"SOFTWARE\Policies\Google\Chrome",
                chromeValueName: "IncognitoModeAvailability",
                chromeEnforcedValue: 1,
                edgeSubKey: @"SOFTWARE\Policies\Microsoft\Edge",
                edgeValueName: "InPrivateModeAvailability",
                edgeEnforcedValue: 1,
                processChecker: p => false
            );

            // Inject probe fault on Chrome key
            registry.SetProbeFault("IncognitoModeAvailability", new UnauthorizedAccessException("Registry locked"));
            var probe = handler.Probe(null, registry, hiveManager);
            Assert.False(probe.IsActive);
            Assert.Equal(PolicyEffectiveState.Inconclusive, probe.EffectiveState);
            registry.ClearProbeFault("IncognitoModeAvailability");

            // Inject write fault on Chrome key
            registry.SetWriteFault("IncognitoModeAvailability", new UnauthorizedAccessException("Write denied"));
            var apply = handler.Apply(null, PolicyDesiredState.Blocked, registry, hiveManager);
            Assert.False(apply.Success);
            Assert.Equal(PolicyEffectiveState.Failed, apply.EffectiveState);
            registry.ClearWriteFault("IncognitoModeAvailability");
        }

        // Helper custom hive manager for testing unmounted hives
        private class CustomHiveManager : IUserHiveManager
        {
            private readonly Func<string?, IUserHiveScope> _scopeFactory;
            public CustomHiveManager(Func<string?, IUserHiveScope> scopeFactory) => _scopeFactory = scopeFactory;
            public IUserHiveScope OpenUserHive(string? userSid) => _scopeFactory(userSid);
            public bool IsUserLoggedOn(string? userSid) => false;
            public string? GetUserProfilePath(string? userSid) => null;
            public bool IsUserAdministrator(string? userSid) => false;
        }
    }
}
