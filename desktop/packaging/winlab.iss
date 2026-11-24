; Script do Inno Setup para o WinLab Desktop
; Gera o instalador autocontido WinLabSetup-{versão}-x64.exe para Windows x64

#define MyAppName "WinLab Desktop"
#define MyAppVersion "0.9.2"
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
DisableDirPage=yes
UsePreviousAppDir=no
OutputDir=..\..\artifacts\installers
OutputBaseFilename=WinLabSetup-{#MyAppVersion}-x64
VersionInfoVersion={#MyAppVersion}.0
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\{#MyAppExeName}
MinVersion=10.0.19041
CloseApplications=yes

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Binários autocontidos publicados do WinLab Desktop (.NET 10 + WebView2 + wwwroot + WinLab.Executor.exe)
Source: "..\..\artifacts\publish\desktop\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Registry]
Root: HKLM64; Subkey: "SOFTWARE\WinLab\DesktopInstallation"; Flags: uninsdeletekey
Root: HKLM64; Subkey: "SOFTWARE\WinLab\PolicyExpansion"

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; Limpa arquivos temporários da instalação, preservando C:\ProgramData\WinLab para integridade de baselines e transações
Type: files; Name: "{app}\*.log"

[Messages]
brazilianportuguese.BeveledLabel=WinLab Desktop {#MyAppVersion} (Build de Piloto / Não Assinada)
english.BeveledLabel=WinLab Desktop {#MyAppVersion} (Pilot Build / Unsigned)

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  Result := '';
  if CompareText(ExpandConstant('{app}'), ExpandConstant('{autopf}\WinLab')) <> 0 then
    Result := 'O WinLab por máquina exige a pasta WinLab em Program Files.';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExecutorHash: String;
begin
  if CurStep = ssPostInstall then
  begin
    ExecutorHash := GetSHA256OfFile(ExpandConstant('{app}\WinLab.Executor.exe'));
    if not RegWriteStringValue(HKLM64, 'SOFTWARE\WinLab\DesktopInstallation', 'ExecutorSha256', ExecutorHash) then
      RaiseException('Falha ao registrar a integridade do executor WinLab.');
  end;
end;

function InitializeSetup(): Boolean;
var
  VelopackUpdater: String;
begin
  Result := True;
  VelopackUpdater := ExpandConstant('{localappdata}\WinLab.Desktop\Update.exe');
  if FileExists(VelopackUpdater) and (not WizardSilent()) then
  begin
    if MsgBox(
      'Foi detectada uma instalação do WinLab no canal auto-atualizável (Velopack) em AppData Local.' + #13#10 + #13#10 +
      'Para evitar dois atalhos do WinLab no mesmo computador, recomenda-se manter apenas um canal de instalação (Inno Setup fixo em Program Files OU Velopack auto-atualizável).' + #13#10 + #13#10 +
      'Deseja continuar a instalação em Program Files mesmo assim?',
      mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
    end;
  end;
end;
