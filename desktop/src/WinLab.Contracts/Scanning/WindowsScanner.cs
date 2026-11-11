using System;
using System.Threading;
using System.Threading.Tasks;

namespace WinLab.Contracts.Scanning
{
    public class WindowsScanner : IWindowsScanner
    {
        private readonly ISystemInfoScanner _systemInfoScanner;
        private readonly ILocalAccountsScanner _accountsScanner;
        private readonly IInstalledSoftwareScanner _softwareScanner;

        public WindowsScanner(
            ISystemInfoScanner? systemInfoScanner = null,
            ILocalAccountsScanner? accountsScanner = null,
            IInstalledSoftwareScanner? softwareScanner = null)
        {
            _systemInfoScanner = systemInfoScanner ?? new SystemInfoScanner();
            _accountsScanner = accountsScanner ?? new LocalAccountsScanner();
            _softwareScanner = softwareScanner ?? new InstalledSoftwareScanner();
        }

        public async Task<MachineInventoryDto> ScanInventoryAsync(CancellationToken cancellationToken = default)
        {
            await Task.Yield();

            var winInfo = _systemInfoScanner.ScanWindowsInfo();
            var disks = _systemInfoScanner.ScanDisks();
            var users = _accountsScanner.ScanAccounts();
            var installedApps = _softwareScanner.ScanInstalledSoftware();
            var detectedCatalog = _softwareScanner.ScanCatalogApps();

            return new MachineInventoryDto
            {
                ComputerName = Environment.MachineName,
                ScannedAt = DateTime.UtcNow.ToString("o"),
                IsMock = false,
                Windows = winInfo,
                Disks = disks,
                LocalUsers = users,
                InstalledApps = installedApps,
                DetectedApps = detectedCatalog
            };
        }
    }
}
