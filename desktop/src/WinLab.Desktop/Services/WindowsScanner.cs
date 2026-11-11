using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts;
using WinLab.Contracts.Scanning;

namespace WinLab.Desktop.Services
{
    /// <summary>
    /// Serviço de scanner do Windows executado no contexto do WinLab Desktop.
    /// Encapsula o orquestrador unificado de scanner do Windows (Features 11, 12 e 13).
    /// </summary>
    public class WindowsScanner : IWindowsScanner
    {
        private readonly IWindowsScanner _innerScanner;

        public WindowsScanner(IWindowsScanner? innerScanner = null)
        {
            _innerScanner = innerScanner ?? new WinLab.Contracts.Scanning.WindowsScanner();
        }

        public Task<MachineInventoryDto> ScanInventoryAsync(CancellationToken cancellationToken = default)
        {
            return _innerScanner.ScanInventoryAsync(cancellationToken);
        }
    }
}
