using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Contracts.Scanning
{
    public class SystemInfoScanner : ISystemInfoScanner
    {
        public WindowsInfoDto ScanWindowsInfo()
        {
            if (!OperatingSystem.IsWindows())
            {
                return new WindowsInfoDto
                {
                    Caption = RuntimeInformation.OSDescription,
                    Version = Environment.OSVersion.Version.ToString(),
                    BuildNumber = "0",
                    Architecture = RuntimeInformation.OSArchitecture.ToString(),
                    Edition = "Non-Windows Host",
                    DisplayVersion = "N/A",
                    Is64Bit = Environment.Is64BitOperatingSystem,
                    TpmPresent = false,
                    TpmVersion = null,
                    SecureBootEnabled = false
                };
            }

            var info = new WindowsInfoDto
            {
                Architecture = Environment.Is64BitOperatingSystem ? "64 bits" : "32 bits",
                Is64Bit = Environment.Is64BitOperatingSystem
            };

            // 1. Registro do Windows NT: CurrentVersion
            try
            {
                using var cvKey = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion");
                if (cvKey != null)
                {
                    string productName = cvKey.GetValue("ProductName") as string ?? "Windows";
                    string editionId = cvKey.GetValue("EditionID") as string ?? string.Empty;
                    string displayVersion = cvKey.GetValue("DisplayVersion") as string 
                                            ?? cvKey.GetValue("ReleaseId") as string 
                                            ?? string.Empty;
                    string buildNumber = cvKey.GetValue("CurrentBuildNumber") as string 
                                         ?? cvKey.GetValue("CurrentBuild") as string 
                                         ?? Environment.OSVersion.Version.Build.ToString();
                    int ubr = Convert.ToInt32(cvKey.GetValue("UBR", 0));

                    info.Edition = editionId;
                    info.DisplayVersion = displayVersion;
                    info.BuildNumber = buildNumber;
                    info.Ubr = ubr > 0 ? ubr : null;
                    info.Version = ubr > 0 ? $"10.0.{buildNumber}.{ubr}" : $"10.0.{buildNumber}";

                    // Correção inteligente para Windows 11
                    if (int.TryParse(buildNumber, out int buildInt) && buildInt >= 22000)
                    {
                        if (productName.StartsWith("Windows 10", StringComparison.OrdinalIgnoreCase))
                        {
                            info.Caption = productName.Replace("Windows 10", "Windows 11");
                        }
                        else
                        {
                            info.Caption = string.IsNullOrEmpty(productName) ? $"Windows 11 {editionId}".Trim() : productName;
                        }
                    }
                    else
                    {
                        info.Caption = productName;
                    }
                }
            }
            catch
            {
                info.Caption = RuntimeInformation.OSDescription;
                info.Version = Environment.OSVersion.Version.ToString();
                info.BuildNumber = Environment.OSVersion.Version.Build.ToString();
            }

            // 2. Status do Secure Boot (Registro do Kernel)
            try
            {
                using var sbKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\SecureBoot\State");
                if (sbKey != null)
                {
                    int uefiSecureBoot = Convert.ToInt32(sbKey.GetValue("UEFISecureBootEnabled", 0));
                    info.SecureBootEnabled = (uefiSecureBoot == 1);
                }
                else
                {
                    info.SecureBootEnabled = false;
                }
            }
            catch
            {
                info.SecureBootEnabled = false;
            }

            // 3. Status do TPM via tbs.dll
            try
            {
                var tpmResult = NativeTpm.GetTpmStatus();
                info.TpmPresent = tpmResult.IsPresent;
                info.TpmVersion = tpmResult.Version;
            }
            catch
            {
                info.TpmPresent = false;
                info.TpmVersion = null;
            }

            return info;
        }

        public List<DiskInfoDto> ScanDisks()
        {
            var result = new List<DiskInfoDto>();
            try
            {
                string systemRoot = OperatingSystem.IsWindows()
                    ? (Path.GetPathRoot(Environment.SystemDirectory) ?? "C:\\")
                    : "/";

                foreach (var drive in DriveInfo.GetDrives())
                {
                    if (!drive.IsReady) continue;
                    if (OperatingSystem.IsWindows())
                    {
                        if (drive.DriveType != DriveType.Fixed && !drive.Name.Equals(systemRoot, StringComparison.OrdinalIgnoreCase))
                            continue;
                    }

                    double totalGb = Math.Round((double)drive.TotalSize / (1024 * 1024 * 1024), 1);
                    double freeGb = Math.Round((double)drive.AvailableFreeSpace / (1024 * 1024 * 1024), 1);
                    double freePercent = totalGb > 0 ? Math.Round((freeGb / totalGb) * 100, 1) : 0;

                    result.Add(new DiskInfoDto
                    {
                        Device = drive.Name.TrimEnd('\\'),
                        TotalGb = totalGb,
                        FreeGb = freeGb,
                        FreePercent = freePercent
                    });
                }
            }
            catch
            {
                // Fallback seguro caso haja restrição
                result.Add(new DiskInfoDto { Device = OperatingSystem.IsWindows() ? "C:" : "/", TotalGb = 0, FreeGb = 0, FreePercent = 0 });
            }

            if (result.Count == 0)
            {
                result.Add(new DiskInfoDto { Device = OperatingSystem.IsWindows() ? "C:" : "/", TotalGb = 0, FreeGb = 0, FreePercent = 0 });
            }

            return result;
        }

        private static class NativeTpm
        {
            [StructLayout(LayoutKind.Sequential)]
            private struct TPM_DEVICE_INFO
            {
                public uint structVersion;
                public uint tpmVersion;
                public uint tpmInterfaceType;
                public uint tpmImpVersion;
            }

            [DllImport("tbs.dll", CharSet = CharSet.Unicode)]
            private static extern uint Tbsi_GetDeviceInfo(uint size, out TPM_DEVICE_INFO info);

            public static (bool IsPresent, string? Version) GetTpmStatus()
            {
                if (!OperatingSystem.IsWindows()) return (false, null);

                try
                {
                    var info = new TPM_DEVICE_INFO { structVersion = 1 };
                    uint status = Tbsi_GetDeviceInfo((uint)Marshal.SizeOf<TPM_DEVICE_INFO>(), out info);
                    if (status == 0) // TBS_SUCCESS
                    {
                        string version = info.tpmVersion == 2 ? "2.0" : (info.tpmVersion == 1 ? "1.2" : $"v{info.tpmVersion}");
                        return (true, version);
                    }
                }
                catch
                {
                    // Fallback passivo no registro
                    try
                    {
                        using var tpmKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\TPM");
                        if (tpmKey != null) return (true, "Detectado via Driver");
                    }
                    catch { }
                }

                return (false, null);
            }
        }
    }
}
