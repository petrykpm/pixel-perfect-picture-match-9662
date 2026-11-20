; Instalador do Gerenciador de Conquistas (Inno Setup 6)
#define AppName "Gerenciador de Conquistas"
#define AppExe "GerenciadorConquistas.exe"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{B8F3C2A1-6D4E-4F7A-9C21-5E7A1D3B9F40}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Petryk Machozeki
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=saida
OutputBaseFilename=GerenciadorConquistas-Setup-{#AppVersion}
SetupIconFile=icone.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar atalho na área de trabalho"; Flags: unchecked
Name: "startup"; Description: "Iniciar com o Windows (em segundo plano)"; Flags: unchecked

[Files]
Source: "dist\GerenciadorConquistas\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "GerenciadorConquistas"; ValueData: """{app}\{#AppExe}"" --sem-navegador"; Tasks: startup; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExe}"; Description: "Abrir o {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExe}"; Parameters: "--sair"; Flags: runhidden; RunOnceId: "SairDoPrograma"

[Code]
// Fecha a versão que estiver rodando antes de atualizar os arquivos.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Codigo: Integer;
  Exe: String;
begin
  Exe := ExpandConstant('{app}\{#AppExe}');
  if FileExists(Exe) then
  begin
    Exec(Exe, '--sair', '', SW_HIDE, ewWaitUntilTerminated, Codigo);
    Sleep(1500);
  end;
  Result := '';
end;
