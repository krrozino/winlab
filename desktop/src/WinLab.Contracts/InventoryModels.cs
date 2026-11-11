using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace WinLab.Contracts
{
    /// <summary>
    /// Modelos de dados para o inventário de hardware e software (somente leitura).
    /// </summary>
    public class MachineInventoryDto
    {
        [JsonPropertyName("computerName")]
        public string ComputerName { get; set; } = string.Empty;

        [JsonPropertyName("scannedAt")]
        public string ScannedAt { get; set; } = DateTime.UtcNow.ToString("o");

        [JsonPropertyName("windows")]
        public WindowsInfoDto Windows { get; set; } = new WindowsInfoDto();

        [JsonPropertyName("detectedApps")]
        public List<DetectedAppDto> DetectedApps { get; set; } = new List<DetectedAppDto>();

        [JsonPropertyName("installedApps")]
        public List<InstalledAppDto> InstalledApps { get; set; } = new List<InstalledAppDto>();

        [JsonPropertyName("localUsers")]
        public List<LocalUserDto> LocalUsers { get; set; } = new List<LocalUserDto>();

        [JsonPropertyName("disks")]
        public List<DiskInfoDto> Disks { get; set; } = new List<DiskInfoDto>();
        [JsonPropertyName("isMock")]
        public bool? IsMock { get; set; }
    }

    public class WindowsInfoDto
    {
        [JsonPropertyName("caption")]
        public string Caption { get; set; } = string.Empty;

        [JsonPropertyName("version")]
        public string Version { get; set; } = string.Empty;

        [JsonPropertyName("buildNumber")]
        public string BuildNumber { get; set; } = string.Empty;

        [JsonPropertyName("architecture")]
        public string Architecture { get; set; } = string.Empty;

        [JsonPropertyName("edition")]
        public string Edition { get; set; } = string.Empty;

        [JsonPropertyName("displayVersion")]
        public string DisplayVersion { get; set; } = string.Empty;

        [JsonPropertyName("ubr")]
        public int? Ubr { get; set; }

        [JsonPropertyName("is64Bit")]
        public bool Is64Bit { get; set; } = true;

        [JsonPropertyName("tpmPresent")]
        public bool TpmPresent { get; set; }

        [JsonPropertyName("tpmVersion")]
        public string? TpmVersion { get; set; }

        [JsonPropertyName("secureBootEnabled")]
        public bool SecureBootEnabled { get; set; }
    }

    public class DetectedAppDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("detected")]
        public bool Detected { get; set; }

        [JsonPropertyName("allowed")]
        public bool Allowed { get; set; }
    }

    public class InstalledAppDto
    {
        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("displayVersion")]
        public string DisplayVersion { get; set; } = string.Empty;

        [JsonPropertyName("publisher")]
        public string Publisher { get; set; } = string.Empty;

        [JsonPropertyName("installLocation")]
        public string? InstallLocation { get; set; }

        [JsonPropertyName("isAppx")]
        public bool IsAppx { get; set; }
    }

    public class LocalUserDto
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("enabled")]
        public bool Enabled { get; set; }

        [JsonPropertyName("isAdmin")]
        public bool IsAdmin { get; set; }

        [JsonPropertyName("sid")]
        public string? Sid { get; set; }
    }

    public class DiskInfoDto
    {
        [JsonPropertyName("device")]
        public string Device { get; set; } = string.Empty;

        [JsonPropertyName("totalGb")]
        public double TotalGb { get; set; }

        [JsonPropertyName("freeGb")]
        public double FreeGb { get; set; }

        [JsonPropertyName("freePercent")]
        public double FreePercent { get; set; }
    }
}
