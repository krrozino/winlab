using System;
using System.Text.Json;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Scanning;
using Xunit;

namespace WinLab.Tests
{
    public class WindowsScannerTests
    {
        [Fact]
        public void SystemInfoScanner_ScanWindowsInfo_DoesNotThrowOnCurrentPlatform()
        {
            var scanner = new SystemInfoScanner();
            var info = scanner.ScanWindowsInfo();

            Assert.NotNull(info);
            Assert.False(string.IsNullOrEmpty(info.Caption));
            Assert.False(string.IsNullOrEmpty(info.Version));
            Assert.False(string.IsNullOrEmpty(info.Architecture));
        }

        [Fact]
        public void SystemInfoScanner_ScanDisks_ReturnsAtLeastOneDisk()
        {
            var scanner = new SystemInfoScanner();
            var disks = scanner.ScanDisks();

            Assert.NotNull(disks);
            Assert.NotEmpty(disks);
            Assert.False(string.IsNullOrEmpty(disks[0].Device));
        }

        [Fact]
        public void LocalAccountsScanner_ScanAccounts_DoesNotThrowOnCurrentPlatform()
        {
            var scanner = new LocalAccountsScanner();
            var accounts = scanner.ScanAccounts();

            Assert.NotNull(accounts);
            Assert.NotEmpty(accounts);
            Assert.False(string.IsNullOrEmpty(accounts[0].Name));
        }

        [Fact]
        public void InstalledSoftwareScanner_ScanInstalledSoftware_DoesNotThrowOnCurrentPlatform()
        {
            var scanner = new InstalledSoftwareScanner();
            var apps = scanner.ScanInstalledSoftware();

            Assert.NotNull(apps);
            Assert.NotEmpty(apps);
            Assert.False(string.IsNullOrEmpty(apps[0].DisplayName));
        }

        [Fact]
        public void InstalledSoftwareScanner_ScanCatalogApps_ReturnsCatalogDefinitions()
        {
            var scanner = new InstalledSoftwareScanner();
            var catalog = scanner.ScanCatalogApps();

            Assert.NotNull(catalog);
            Assert.Equal(10, catalog.Count);
            Assert.Contains(catalog, a => a.Id == "chrome");
            Assert.Contains(catalog, a => a.Id == "edge");
            Assert.Contains(catalog, a => a.Id == "word");
            Assert.Contains(catalog, a => a.Id == "vscode");
        }

        [Fact]
        public async Task WindowsScanner_ScanInventoryAsync_OrchestratesFullInventory()
        {
            var scanner = new WindowsScanner();
            var inventory = await scanner.ScanInventoryAsync();

            Assert.NotNull(inventory);
            Assert.False(string.IsNullOrEmpty(inventory.ComputerName));
            Assert.False(string.IsNullOrEmpty(inventory.ScannedAt));
            Assert.NotNull(inventory.Windows);
            Assert.NotNull(inventory.Disks);
            Assert.NotNull(inventory.LocalUsers);
            Assert.NotNull(inventory.InstalledApps);
            Assert.NotNull(inventory.DetectedApps);
            Assert.Equal(false, inventory.IsMock); // Zero-masquerade: real scanner sets IsMock = false
        }

        [Fact]
        public void WindowsInfoDto_JsonSerialization_PreservesAllMilestone2Fields()
        {
            var dto = new WindowsInfoDto
            {
                Caption = "Windows 11 Pro",
                Version = "10.0.26100.1742",
                BuildNumber = "26100",
                Architecture = "64 bits",
                Edition = "Professional",
                DisplayVersion = "24H2",
                Ubr = 1742,
                Is64Bit = true,
                TpmPresent = true,
                TpmVersion = "2.0",
                SecureBootEnabled = true
            };

            string json = JsonSerializer.Serialize(dto);
            var deserialized = JsonSerializer.Deserialize<WindowsInfoDto>(json);

            Assert.NotNull(deserialized);
            Assert.Equal("Windows 11 Pro", deserialized.Caption);
            Assert.Equal("10.0.26100.1742", deserialized.Version);
            Assert.Equal("26100", deserialized.BuildNumber);
            Assert.Equal("64 bits", deserialized.Architecture);
            Assert.Equal("Professional", deserialized.Edition);
            Assert.Equal("24H2", deserialized.DisplayVersion);
            Assert.Equal(1742, deserialized.Ubr);
            Assert.True(deserialized.Is64Bit);
            Assert.True(deserialized.TpmPresent);
            Assert.Equal("2.0", deserialized.TpmVersion);
            Assert.True(deserialized.SecureBootEnabled);
        }

        [Fact]
        public void InstalledAppDto_JsonSerialization_PreservesInstallLocationAndIsAppx()
        {
            var dto = new InstalledAppDto
            {
                DisplayName = "Visual Studio Code",
                DisplayVersion = "1.95.0",
                Publisher = "Microsoft Corporation",
                InstallLocation = @"C:\Program Files\Microsoft VS Code",
                IsAppx = false
            };

            string json = JsonSerializer.Serialize(dto);
            var deserialized = JsonSerializer.Deserialize<InstalledAppDto>(json);

            Assert.NotNull(deserialized);
            Assert.Equal("Visual Studio Code", deserialized.DisplayName);
            Assert.Equal(@"C:\Program Files\Microsoft VS Code", deserialized.InstallLocation);
            Assert.False(deserialized.IsAppx);
        }
    }
}
