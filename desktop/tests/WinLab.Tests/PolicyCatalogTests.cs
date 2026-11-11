using System;
using System.Linq;
using WinLab.Contracts;
using WinLab.Contracts.Policies;
using Xunit;

namespace WinLab.Tests
{
    public class PolicyCatalogTests
    {
        [Fact]
        public void PolicyCatalog_RegistersExactly5Milestone3Policies()
        {
            var catalog = new PolicyCatalog();
            var all = catalog.GetAllPolicies();

            Assert.Equal(5, all.Count);

            var expectedIds = new[]
            {
                "personalization.wallpaper",
                "personalization.sounds",
                "personalization.mouse_pointers",
                "browser.chrome.incognito",
                "browser.chrome.guest"
            };

            foreach (var id in expectedIds)
            {
                var policy = catalog.GetPolicy(id);
                Assert.NotNull(policy);
                Assert.Equal(id, policy.PolicyId);
                Assert.Equal(PolicyRisk.Low, policy.Risk);
                Assert.True(policy.Reversible);
                Assert.False(string.IsNullOrWhiteSpace(policy.Title));
                Assert.False(string.IsNullOrWhiteSpace(policy.Description));
            }
        }

        [Fact]
        public void PolicyCatalog_PersonalizationPolicies_HaveUserScopeAndExpectedFlags()
        {
            var catalog = new PolicyCatalog();

            // Feature 18: Wallpaper
            var wallpaper = catalog.GetPolicy("personalization.wallpaper");
            Assert.NotNull(wallpaper);
            Assert.Equal(PolicyScope.User, wallpaper.Scope);
            Assert.True(wallpaper.RequiresLogoff);
            Assert.False(wallpaper.RequiresRestart);
            Assert.False(wallpaper.RequiresAppRestart);

            // Feature 19: Sounds
            var sounds = catalog.GetPolicy("personalization.sounds");
            Assert.NotNull(sounds);
            Assert.Equal(PolicyScope.User, sounds.Scope);
            Assert.False(sounds.RequiresLogoff);
            Assert.False(sounds.RequiresRestart);
            Assert.False(sounds.RequiresAppRestart);

            // Feature 20: Mouse Pointers
            var mouse = catalog.GetPolicy("personalization.mouse_pointers");
            Assert.NotNull(mouse);
            Assert.Equal(PolicyScope.User, mouse.Scope);
            Assert.False(mouse.RequiresLogoff);
            Assert.False(mouse.RequiresRestart);
            Assert.False(mouse.RequiresAppRestart);
        }

        [Fact]
        public void PolicyCatalog_BrowserPolicies_HaveMachineScopeAndAppRestartFlag()
        {
            var catalog = new PolicyCatalog();

            // Feature 21: Chrome Incognito Lock
            var incognito = catalog.GetPolicy("browser.chrome.incognito");
            Assert.NotNull(incognito);
            Assert.Equal(PolicyScope.Machine, incognito.Scope);
            Assert.True(incognito.RequiresAppRestart);
            Assert.False(incognito.RequiresLogoff);
            Assert.False(incognito.RequiresRestart);
            Assert.Contains("chrome", incognito.TargetProcesses);
            Assert.Contains("msedge", incognito.TargetProcesses);

            // Feature 22: Chrome Guest Mode Lock
            var guest = catalog.GetPolicy("browser.chrome.guest");
            Assert.NotNull(guest);
            Assert.Equal(PolicyScope.Machine, guest.Scope);
            Assert.True(guest.RequiresAppRestart);
            Assert.False(guest.RequiresLogoff);
            Assert.False(guest.RequiresRestart);
            Assert.Contains("chrome", guest.TargetProcesses);
            Assert.Contains("msedge", guest.TargetProcesses);
        }

        [Fact]
        public void PolicyCatalog_GetCatalogDefinitions_ReturnsConsistentMetadata()
        {
            var catalog = new PolicyCatalog();
            var defs = catalog.GetCatalogDefinitions();

            Assert.Equal(5, defs.Count);
            Assert.All(defs, d =>
            {
                Assert.False(string.IsNullOrWhiteSpace(d.Id));
                Assert.False(string.IsNullOrWhiteSpace(d.Name));
                Assert.False(string.IsNullOrWhiteSpace(d.Category));
                Assert.Equal("Low", d.RiskLevel);
                Assert.True(d.Reversible);
            });
        }

        [Fact]
        public void PolicyCatalog_GetPolicy_CaseInsensitiveAndNullForUnknown()
        {
            var catalog = new PolicyCatalog();

            Assert.NotNull(catalog.GetPolicy("PERSONALIZATION.WALLPAPER"));
            Assert.NotNull(catalog.GetPolicy("Browser.Chrome.Incognito"));
            Assert.Null(catalog.GetPolicy("unknown.policy"));
        }
    }
}
