using System;
using System.Security.Principal;
using System.Threading.Tasks;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Executor
{
    public static class Program
    {
        [STAThread]
        public static async Task<int> Main(string[] args)
        {
            // 1. Enforce Administrator role when running on Windows
            if (OperatingSystem.IsWindows())
            {
                var identity = WindowsIdentity.GetCurrent();
                var principal = new WindowsPrincipal(identity);
                if (!principal.IsInRole(WindowsBuiltInRole.Administrator))
                {
                    Console.Error.WriteLine("Error: WinLab.Executor requires elevated administrator privileges.");
                    return 5; // ERROR_ACCESS_DENIED
                }
            }

            // 2. Parse command line parameters
            string? pipeName = null;
            string? token = null;
            int parentPid = 0;

            for (int i = 0; i < args.Length; i++)
            {
                if (string.Equals(args[i], "--pipe", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                {
                    pipeName = args[++i];
                }
                else if (string.Equals(args[i], "--token", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                {
                    token = args[++i];
                }
                else if (string.Equals(args[i], "--parent-pid", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
                {
                    if (int.TryParse(args[++i], out int pid))
                    {
                        parentPid = pid;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(pipeName) || string.IsNullOrWhiteSpace(token))
            {
                Console.Error.WriteLine("Usage: WinLab.Executor --pipe <pipe_name> --token <secret_token> --parent-pid <pid>");
                return 160; // ERROR_BAD_ARGUMENTS
            }

            // 3. Launch host
            var host = new ExecutorHost(pipeName, token, parentPid);
            return await host.RunAsync();
        }
    }
}
