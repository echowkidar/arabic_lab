; Script generated for Arabic Language Lab Suite
; Creates a Single Standalone Setup.exe Installer

#define MyAppName "Arabic Language Lab"
#define MyAppVersion "1.3.0"
#define MyAppPublisher "Department of Arabic, AMU"
#define MyAppURL "https://arabic.echowkidar.in"
#define MyAppExeName "ArabicLab.exe"

[Setup]
AppId={{D3E1A294-8591-4C5C-9A82-5F6D971234AB}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\ArabicLab
DisableProgramGroupPage=yes
OutputBaseFilename=ArabicLab-Setup
OutputDir=server\downloads
Compression=lzma2/ultra64
SolidCompression=yes
LZMADictionarySize=1048576
LZMAUseSeparateProcess=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startupicon"; Description: "Automatically start Arabic Language Lab on Windows boot (Restarts)"; GroupDescription: "Surveillance & Auto-Start:"; Flags: checkedonce

[Files]
Source: "dist-electron\ArabicLab-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startupicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall
