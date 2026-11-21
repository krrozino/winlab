using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.Win32;

#pragma warning disable CA1416 // Validated by OperatingSystem.IsWindows() check

namespace WinLab.Contracts.Scanning
{
    /// <summary>
    /// Inspeção não-elevada de unidades de rede mapeadas, compartilhamentos SMB locais e estado do protocolo SMBv1.
    /// Nunca solicita UAC nem executa processos externos.
    /// </summary>
    public static class NetworkShareScanner
    {
        public static NetworkShareEnvironmentDto Scan()
        {
            var result = new NetworkShareEnvironmentDto
            {
                ScannedAt = DateTime.UtcNow.ToString("o"),
                IsMock = false
            };

            if (!OperatingSystem.IsWindows())
            {
                return result;
            }

            // 1. Estado do SMBv1 (HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters\SMB1)
            try
            {
                using var lanmanParams = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters");
                if (lanmanParams != null)
                {
                    object? smb1Val = lanmanParams.GetValue("SMB1");
                    if (smb1Val is int smb1Int)
                    {
                        result.Smb1Enabled = smb1Int != 0;
                    }
                    else
                    {
                        // Windows 10 1709+ e Windows 11 desativam o SMBv1 por padrão quando o valor não está explícito
                        result.Smb1Enabled = false;
                    }
                }
            }
            catch
            {
                result.Smb1Enabled = null;
            }

            // 2. Unidades de rede persistentes em HKCU\Network e unidades de rede ativas na sessão
            var drivesByLetter = new Dictionary<string, MappedDriveDto>(StringComparer.OrdinalIgnoreCase);
            try
            {
                using var netKey = Registry.CurrentUser.OpenSubKey("Network");
                if (netKey != null)
                {
                    foreach (string subName in netKey.GetSubKeyNames())
                    {
                        if (string.IsNullOrWhiteSpace(subName)) continue;
                        using var letterKey = netKey.OpenSubKey(subName);
                        string remotePath = letterKey?.GetValue("RemotePath") as string ?? string.Empty;
                        if (string.IsNullOrWhiteSpace(remotePath)) continue;

                        string letter = subName.Trim().TrimEnd(':').ToUpperInvariant();
                        drivesByLetter[letter] = new MappedDriveDto
                        {
                            DriveLetter = letter,
                            RemotePath = remotePath,
                            Persistent = true,
                            Status = Directory.Exists($"{letter}:\\") ? "Conectada" : "Persistente (reconecta no logon)"
                        };
                    }
                }
            }
            catch
            {
                // Continua com leitura via DriveInfo
            }

            try
            {
                foreach (var drive in DriveInfo.GetDrives().Where(d => d.DriveType == DriveType.Network))
                {
                    string letter = drive.Name.TrimEnd('\\', ':').ToUpperInvariant();
                    if (!drivesByLetter.ContainsKey(letter))
                    {
                        drivesByLetter[letter] = new MappedDriveDto
                        {
                            DriveLetter = letter,
                            RemotePath = "Unidade de rede da sessão",
                            Persistent = false,
                            Status = drive.IsReady ? "Conectada" : "Indisponível"
                        };
                    }
                }
            }
            catch
            {
                // Ignora falhas transitórias de enumeração de volumes
            }

            result.MappedDrives = drivesByLetter.Values
                .OrderBy(d => d.DriveLetter, StringComparer.OrdinalIgnoreCase)
                .ToList();

            // 3. Compartilhamentos SMB publicados localmente (HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Shares)
            try
            {
                using var sharesKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Services\LanmanServer\Shares");
                if (sharesKey != null)
                {
                    foreach (string shareName in sharesKey.GetValueNames())
                    {
                        // Ignora compartilhamentos administrativos ocultos (C$, ADMIN$, IPC$)
                        if (string.IsNullOrWhiteSpace(shareName) || shareName.EndsWith("$", StringComparison.Ordinal))
                        {
                            continue;
                        }

                        if (sharesKey.GetValue(shareName) is string[] lines)
                        {
                            string localPath = string.Empty;
                            string remark = string.Empty;
                            foreach (string line in lines)
                            {
                                if (line.StartsWith("Path=", StringComparison.OrdinalIgnoreCase))
                                {
                                    localPath = line.Substring("Path=".Length);
                                }
                                else if (line.StartsWith("Remark=", StringComparison.OrdinalIgnoreCase))
                                {
                                    remark = line.Substring("Remark=".Length);
                                }
                            }

                            result.LocalShares.Add(new LocalSmbShareDto
                            {
                                Name = shareName,
                                LocalPath = localPath,
                                Remark = remark
                            });
                        }
                    }
                }
            }
            catch
            {
                // Sem compartilhamentos acessíveis
            }

            return result;
        }
    }
}
