using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace WinLab.Contracts
{
    /// <summary>
    /// Orquestrador unificado de scanner do Windows.
    /// </summary>
    public interface IWindowsScanner
    {
        Task<MachineInventoryDto> ScanInventoryAsync(CancellationToken cancellationToken = default);
    }

    /// <summary>
    /// Scanner de dados do Sistema Operacional, Discos, TPM e Secure Boot (Feature 11).
    /// </summary>
    public interface ISystemInfoScanner
    {
        WindowsInfoDto ScanWindowsInfo();
        List<DiskInfoDto> ScanDisks();
    }

    /// <summary>
    /// Scanner de Contas Locais e Grupos de Administração (Feature 12).
    /// </summary>
    public interface ILocalAccountsScanner
    {
        List<LocalUserDto> ScanAccounts();
    }

    /// <summary>
    /// Scanner de Softwares Instalados no Registro e Appx (Feature 13).
    /// </summary>
    public interface IInstalledSoftwareScanner
    {
        List<InstalledAppDto> ScanInstalledSoftware();
        List<DetectedAppDto> ScanCatalogApps();
    }

    /// <summary>
    /// Contrato de serviço do agente para permitir alternância transparente
    /// entre MockAgentService (Demo/Testes) e RealAgentService / ElevatedExecutorClient (Computador Real).
    /// </summary>
    public interface IAgentService
    {
        bool IsRunning { get; }
        string ExecutionMode { get; }
        Task<IpcResponse<object>> HandleRequestAsync(string rawJson);
    }
}
