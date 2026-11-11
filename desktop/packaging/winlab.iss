; Script do Inno Setup para o WinLab Desktop
; Gera o instalador autocontido WinLabSetup-0.9.0-x64.exe para Windows x64

#define MyAppName "WinLab Desktop"
#define MyAppVersion "0.9.0"
#define MyAppPublisher "WinLab Project"
#define MyAppURL "https://github.com/krrozino/winlab"
#define MyAppExeName "WinLab.Desktop.exe"
#define MyAppId "{{D41640D1-84E3-4D90-8E07-1F459039E1B8}}"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\WinLab
DefaultGroupName=WinLab
AllowNoIcons=yes
; Requer privilégios administrativos para instalação em Program Files
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline
OutputDir=..\..\artifacts\installers
OutputBaseFilename=WinLabSetup-0.9.0-x64
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
MinVersion=10.0.19041

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Binários autocontidos publicados do WinLab Desktop (.NET 10 + WebView2 + wwwroot)
Source: "..\..\artifacts\publish\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Limpa arquivos temporários da instalação, preservando C:\ProgramData\WinLab para integridade de baselines
Type: files; Name: "{app}\*.log"

[Messages]
brazilianportuguese.BeveledLabel=WinLab Desktop 0.9.0 (Build de Piloto / Não Assinada)
english.BeveledLabel=WinLab Desktop 0.9.0 (Pilot Build / Unsigned)
