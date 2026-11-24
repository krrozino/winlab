using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Versioning;
using System.Security;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Threading.Tasks;
using WinLab.Contracts.Expansion;
using WinLab.Contracts.Policies;
using WinLab.Contracts.RegistryServices;
using WinLab.Contracts.Transactions;

namespace WinLab.Contracts.Administration;

public sealed record AdminPolicyRecord(TransactionEngine Engine, TransactionDto Transaction);
public sealed record AdminPolicyHistory(IReadOnlyList<AdminPolicyRecord> Records, bool Complete);

public interface IAdminPolicyJournal
{
    bool CanWrite { get; }
    TransactionEngine OpenForWrite();
    Task<AdminPolicyHistory> ReadAsync(CancellationToken ct);
}

public sealed class AdminPolicyJournal(IPolicyCatalog catalog, IRegistryService registry, IUserHiveManager hives)
    : IAdminPolicyJournal
{
    private static string InstallRoot =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "WinLab");
    private static string JournalPath => Path.Combine(InstallRoot, "AdministrationTransactions");

    public bool CanWrite => OperatingSystem.IsWindows() && IsProtectedDirectory(InstallRoot)
        && (!Directory.Exists(JournalPath) || IsProtectedDirectory(JournalPath));

    public async Task<AdminPolicyRecord?> FindAsync(string transactionId, CancellationToken ct = default)
        => Find(await ReadAsync(ct), transactionId);

    public static AdminPolicyRecord? Find(AdminPolicyHistory history, string transactionId)
    {
        if (!history.Complete) throw new InvalidOperationException("O histórico de baselines não pôde ser confirmado.");
        var records = history.Records.Where(record => string.Equals(record.Transaction.TransactionId, transactionId,
            StringComparison.OrdinalIgnoreCase)).Take(2).ToArray();
        return records.Length == 1 ? records[0] : null;
    }

    public TransactionEngine OpenForWrite()
    {
        if (!OperatingSystem.IsWindows() || !CanWrite)
            throw new InvalidOperationException("O diretório de baselines administrativos não é confiável.");

        if (!Directory.Exists(JournalPath))
        {
            var administrators = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
            var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
            var authenticated = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
            var security = new DirectorySecurity();
            security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
            security.SetOwner(administrators);
            AddRule(security, administrators, FileSystemRights.FullControl);
            AddRule(security, system, FileSystemRights.FullControl);
            AddRule(security, authenticated, FileSystemRights.ReadAndExecute);
            new DirectoryInfo(JournalPath).Create(security);
        }

        if (!IsProtectedDirectory(JournalPath)) throw new InvalidOperationException("O Windows não confirmou o diretório protegido de baselines.");
        return Engine(JournalPath, OpenProtectedRecord);
    }

    public async Task<AdminPolicyHistory> ReadAsync(CancellationToken ct)
    {
        var records = new List<AdminPolicyRecord>();
        if (!OperatingSystem.IsWindows()) return new(records, false);

        var legacyRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "WinLab");
        var legacyPath = Path.Combine(legacyRoot, "transactions");
        bool complete = await ReadDirectoryAsync(JournalPath, InstallRoot, records, ct);
        // Baselines antigos só são considerados quando o diretório e os arquivos têm ACLs confiáveis.
        if (Directory.Exists(legacyPath) && IsProtectedDirectory(legacyRoot) && IsProtectedDirectory(legacyPath))
            complete &= await ReadDirectoryAsync(legacyPath, legacyRoot, records, ct);
        return new(records, complete);
    }

    [SupportedOSPlatform("windows")]
    private async Task<bool> ReadDirectoryAsync(string path, string parent, List<AdminPolicyRecord> records, CancellationToken ct)
    {
        if (!Directory.Exists(path)) return !File.Exists(path);
        if (!IsProtectedDirectory(parent) || !IsProtectedDirectory(path)) return false;
        var engine = Engine(path, OpenProtectedRecord);
        try
        {
            foreach (string file in Directory.EnumerateFiles(path, "*.json"))
            {
                ct.ThrowIfCancellationRequested();
                if (!ExecutorInstallTrust.IsProtectedPath(file)) return false;
                string id = Path.GetFileNameWithoutExtension(file);
                var transaction = await engine.GetTransactionAsync(id, ct);
                if (transaction == null || transaction.TransactionId != id) return false;
                records.Add(new(engine, transaction));
            }
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SecurityException or System.Text.Json.JsonException)
        {
            return false;
        }
    }

    [SupportedOSPlatform("windows")]
    private TransactionEngine Engine(string path, Func<string, FileMode, Stream> writer) =>
        new(catalog, registry, hives, path, createDirectory: false, protectedRecordWriter: writer,
            verifyProtectedRecord: ExecutorInstallTrust.IsProtectedPath);

    [SupportedOSPlatform("windows")]
    private static Stream OpenProtectedRecord(string path, FileMode mode)
    {
        var administrators = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        var system = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        var authenticated = new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null);
        var security = new FileSecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        security.SetOwner(administrators);
        security.AddAccessRule(new FileSystemAccessRule(administrators, FileSystemRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(system, FileSystemRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(authenticated, FileSystemRights.Read, AccessControlType.Allow));
        return new FileInfo(path).Create(mode, FileSystemRights.Write, FileShare.None, 4096, FileOptions.None, security);
    }

    [SupportedOSPlatform("windows")]
    private static bool IsProtectedDirectory(string path)
    {
        try { return Directory.Exists(path) && ExecutorInstallTrust.IsProtectedPath(path); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SecurityException) { return false; }
    }

    [SupportedOSPlatform("windows")]
    private static void AddRule(DirectorySecurity security, SecurityIdentifier identity, FileSystemRights rights) =>
        security.AddAccessRule(new FileSystemAccessRule(identity, rights, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit,
            PropagationFlags.None, AccessControlType.Allow));
}
