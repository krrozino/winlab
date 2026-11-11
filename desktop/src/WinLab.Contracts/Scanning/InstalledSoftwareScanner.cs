using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Contracts.Scanning
{
    public class InstalledSoftwareScanner : IInstalledSoftwareScanner
    {
        public List<InstalledAppDto> ScanInstalledSoftware()
        {
            if (!OperatingSystem.IsWindows())
            {
                return new List<InstalledAppDto>
                {
                    new InstalledAppDto
                    {
                        DisplayName = ".NET SDK",
                        DisplayVersion = Environment.Version.ToString(),
                        Publisher = "Microsoft Corporation",
                        InstallLocation = null,
                        IsAppx = false
                    }
                };
            }

            var apps = new List<InstalledAppDto>();

            // 1. Registro de Desinstalação (64-bit, 32-bit e HKCU)
            var targets = new (RegistryHive Hive, RegistryView View, string SubKey)[]
            {
                (RegistryHive.LocalMachine, RegistryView.Registry64, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                (RegistryHive.LocalMachine, RegistryView.Registry32, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
                (RegistryHive.CurrentUser, RegistryView.Default, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall")
            };

            foreach (var target in targets)
            {
                try
                {
                    using var baseKey = RegistryKey.OpenBaseKey(target.Hive, target.View);
                    using var uninstallKey = baseKey.OpenSubKey(target.SubKey, false);
                    if (uninstallKey == null) continue;

                    foreach (var subKeyName in uninstallKey.GetSubKeyNames())
                    {
                        try
                        {
                            using var appKey = uninstallKey.OpenSubKey(subKeyName, false);
                            if (appKey == null) continue;

                            string? displayName = appKey.GetValue("DisplayName") as string;
                            if (string.IsNullOrWhiteSpace(displayName)) continue;

                            int systemComponent = Convert.ToInt32(appKey.GetValue("SystemComponent", 0));
                            if (systemComponent == 1) continue;

                            string? parentKeyName = appKey.GetValue("ParentKeyName") as string;
                            if (!string.IsNullOrEmpty(parentKeyName)) continue;

                            string? releaseType = appKey.GetValue("ReleaseType") as string;
                            if (!string.IsNullOrEmpty(releaseType) &&
                                (releaseType.Contains("Update", StringComparison.OrdinalIgnoreCase) ||
                                 releaseType.Contains("Hotfix", StringComparison.OrdinalIgnoreCase) ||
                                 releaseType.Contains("Security Update", StringComparison.OrdinalIgnoreCase)))
                            {
                                continue;
                            }

                            string displayVersion = appKey.GetValue("DisplayVersion") as string ?? string.Empty;
                            string publisher = appKey.GetValue("Publisher") as string ?? string.Empty;
                            string? installLocation = appKey.GetValue("InstallLocation") as string;

                            apps.Add(new InstalledAppDto
                            {
                                DisplayName = displayName.Trim(),
                                DisplayVersion = displayVersion.Trim(),
                                Publisher = publisher.Trim(),
                                InstallLocation = string.IsNullOrWhiteSpace(installLocation) ? null : installLocation.Trim(),
                                IsAppx = false
                            });
                        }
                        catch { }
                    }
                }
                catch { }
            }

            // 2. Pacotes Appx / Store instalados para o usuário
            try
            {
                using var appxKey = Registry.CurrentUser.OpenSubKey(@"Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\Repository\Packages");
                if (appxKey != null)
                {
                    foreach (var pkgName in appxKey.GetSubKeyNames())
                    {
                        if (pkgName.StartsWith("Microsoft.VCLibs", StringComparison.OrdinalIgnoreCase) ||
                            pkgName.StartsWith("Microsoft.NET.", StringComparison.OrdinalIgnoreCase) ||
                            pkgName.StartsWith("Microsoft.UI.Xaml", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }

                        try
                        {
                            using var pkgSubKey = appxKey.OpenSubKey(pkgName, false);
                            if (pkgSubKey == null) continue;

                            string? rawDisplayName = pkgSubKey.GetValue("DisplayName") as string;
                            string? publisher = pkgSubKey.GetValue("PublisherDisplayName") as string ?? "Microsoft Corporation";

                            string cleanName = ResolveAppxDisplayName(rawDisplayName, pkgName);
                            if (string.IsNullOrWhiteSpace(cleanName)) continue;

                            string version = ExtractVersionFromPackageName(pkgName);

                            apps.Add(new InstalledAppDto
                            {
                                DisplayName = cleanName,
                                DisplayVersion = version,
                                Publisher = publisher,
                                IsAppx = true
                            });
                        }
                        catch { }
                    }
                }
            }
            catch { }

            // 3. Deduplicação e Ordenação
            return apps
                .GroupBy(a => (a.DisplayName.ToLowerInvariant(), a.DisplayVersion.ToLowerInvariant()))
                .Select(g => g.First())
                .OrderBy(a => a.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        public List<DetectedAppDto> ScanCatalogApps()
        {
            var detected = new List<DetectedAppDto>();

            var catalog = new (string Id, string Name, string[] CandidatePaths)[]
            {
                ("chrome", "Google Chrome", new[]
                {
                    @"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
                    @"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
                    @"%LocalAppData%\Google\Chrome\Application\chrome.exe"
                }),
                ("edge", "Microsoft Edge", new[]
                {
                    @"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
                    @"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
                }),
                ("firefox", "Mozilla Firefox", new[]
                {
                    @"%ProgramFiles%\Mozilla Firefox\firefox.exe",
                    @"%ProgramFiles(x86)%\Mozilla Firefox\firefox.exe"
                }),
                ("word", "Microsoft Word", new[]
                {
                    @"%ProgramFiles%\Microsoft Office\root\Office16\WINWORD.EXE",
                    @"%ProgramFiles(x86)%\Microsoft Office\root\Office16\WINWORD.EXE"
                }),
                ("excel", "Microsoft Excel", new[]
                {
                    @"%ProgramFiles%\Microsoft Office\root\Office16\EXCEL.EXE",
                    @"%ProgramFiles(x86)%\Microsoft Office\root\Office16\EXCEL.EXE"
                }),
                ("powerpoint", "Microsoft PowerPoint", new[]
                {
                    @"%ProgramFiles%\Microsoft Office\root\Office16\POWERPNT.EXE",
                    @"%ProgramFiles(x86)%\Microsoft Office\root\Office16\POWERPNT.EXE"
                }),
                ("powerbi", "Power BI Desktop", new[]
                {
                    @"%ProgramFiles%\Microsoft Power BI Desktop\bin\PBIDesktop.exe",
                    @"%ProgramFiles(x86)%\Microsoft Power BI Desktop\bin\PBIDesktop.exe"
                }),
                ("acrobat", "Adobe Acrobat / Reader", new[]
                {
                    @"%ProgramFiles%\Adobe\Acrobat DC\Acrobat\Acrobat.exe",
                    @"%ProgramFiles(x86)%\Adobe\Acrobat Reader\Reader\AcroRd32.exe"
                }),
                ("vscode", "Visual Studio Code", new[]
                {
                    @"%ProgramFiles%\Microsoft VS Code\Code.exe",
                    @"%ProgramFiles(x86)%\Microsoft VS Code\Code.exe",
                    @"%LocalAppData%\Programs\Microsoft VS Code\Code.exe"
                }),
                ("vlc", "VLC Media Player", new[]
                {
                    @"%ProgramFiles%\VideoLAN\VLC\vlc.exe",
                    @"%ProgramFiles(x86)%\VideoLAN\VLC\vlc.exe"
                })
            };

            foreach (var item in catalog)
            {
                string? matchedPath = null;
                foreach (var candidate in item.CandidatePaths)
                {
                    try
                    {
                        string expanded = Environment.ExpandEnvironmentVariables(candidate);
                        if (File.Exists(expanded))
                        {
                            matchedPath = expanded;
                            break;
                        }
                    }
                    catch { }
                }

                detected.Add(new DetectedAppDto
                {
                    Id = item.Id,
                    Name = item.Name,
                    Path = matchedPath ?? string.Empty,
                    Detected = matchedPath != null,
                    Allowed = matchedPath != null
                });
            }

            return detected;
        }

        private static string ResolveAppxDisplayName(string? rawDisplayName, string packageName)
        {
            if (string.IsNullOrWhiteSpace(rawDisplayName))
            {
                return CleanPackageFamilyName(packageName);
            }

            if (rawDisplayName.StartsWith("@", StringComparison.Ordinal) && OperatingSystem.IsWindows())
            {
                try
                {
                    var sb = new StringBuilder(512);
                    int hr = NativeShlwapi.SHLoadIndirectString(rawDisplayName, sb, (uint)sb.Capacity, IntPtr.Zero);
                    if (hr == 0 && sb.Length > 0)
                    {
                        return sb.ToString();
                    }
                }
                catch { }

                return CleanPackageFamilyName(packageName);
            }

            return rawDisplayName;
        }

        private static string CleanPackageFamilyName(string packageName)
        {
            var parts = packageName.Split('_');
            if (parts.Length > 0)
            {
                string id = parts[0];
                if (id.StartsWith("Microsoft.", StringComparison.OrdinalIgnoreCase))
                {
                    id = id.Substring("Microsoft.".Length);
                }
                return id;
            }
            return packageName;
        }

        private static string ExtractVersionFromPackageName(string packageName)
        {
            var parts = packageName.Split('_');
            return parts.Length >= 2 ? parts[1] : string.Empty;
        }

        private static class NativeShlwapi
        {
            [DllImport("shlwapi.dll", CharSet = CharSet.Unicode, ExactSpelling = true)]
            public static extern int SHLoadIndirectString(
                string pszSource,
                StringBuilder pszOutBuf,
                uint cchOutBuf,
                IntPtr ppvReserved);
        }
    }
}
