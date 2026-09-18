export const APP_CATALOG = {
  chrome: {
    label: "Google Chrome",
    category: "Navegadores",
    paths: [
      "%PROGRAMFILES%\\Google\\Chrome\\Application\\chrome.exe",
      "%PROGRAMFILES(X86)%\\Google\\Chrome\\Application\\chrome.exe"
    ]
  },
  edge: {
    label: "Microsoft Edge",
    category: "Navegadores",
    paths: [
      "%PROGRAMFILES%\\Microsoft\\Edge\\Application\\msedge.exe",
      "%PROGRAMFILES(X86)%\\Microsoft\\Edge\\Application\\msedge.exe"
    ]
  },
  firefox: {
    label: "Mozilla Firefox",
    category: "Navegadores",
    paths: [
      "%PROGRAMFILES%\\Mozilla Firefox\\firefox.exe",
      "%PROGRAMFILES(X86)%\\Mozilla Firefox\\firefox.exe"
    ]
  },
  word: {
    label: "Microsoft Word",
    category: "Office",
    paths: [
      "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
      "%PROGRAMFILES(X86)%\\Microsoft Office\\root\\Office16\\WINWORD.EXE"
    ]
  },
  excel: {
    label: "Microsoft Excel",
    category: "Office",
    paths: [
      "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\EXCEL.EXE",
      "%PROGRAMFILES(X86)%\\Microsoft Office\\root\\Office16\\EXCEL.EXE"
    ]
  },
  powerpoint: {
    label: "Microsoft PowerPoint",
    category: "Office",
    paths: [
      "%PROGRAMFILES%\\Microsoft Office\\root\\Office16\\POWERPNT.EXE",
      "%PROGRAMFILES(X86)%\\Microsoft Office\\root\\Office16\\POWERPNT.EXE"
    ]
  },
  powerbi: {
    label: "Power BI Desktop",
    category: "Dados",
    paths: [
      "%PROGRAMFILES%\\Microsoft Power BI Desktop\\bin\\PBIDesktop.exe",
      "%PROGRAMFILES(X86)%\\Microsoft Power BI Desktop\\bin\\PBIDesktop.exe"
    ]
  },
  acrobat: {
    label: "Adobe Acrobat / Reader",
    category: "Documentos",
    paths: [
      "%PROGRAMFILES%\\Adobe\\Acrobat DC\\Acrobat\\Acrobat.exe",
      "%PROGRAMFILES(X86)%\\Adobe\\Acrobat Reader\\Reader\\AcroRd32.exe"
    ]
  },
  vscode: {
    label: "Visual Studio Code",
    category: "Desenvolvimento",
    paths: [
      "%PROGRAMFILES%\\Microsoft VS Code\\Code.exe",
      "%PROGRAMFILES(X86)%\\Microsoft VS Code\\Code.exe"
    ]
  },
  vlc: {
    label: "VLC Media Player",
    category: "Mídia",
    paths: [
      "%PROGRAMFILES%\\VideoLAN\\VLC\\vlc.exe",
      "%PROGRAMFILES(X86)%\\VideoLAN\\VLC\\vlc.exe"
    ]
  }
} as const;

export type AllowedAppId = keyof typeof APP_CATALOG;

export const ALLOWED_APP_IDS = Object.keys(APP_CATALOG) as AllowedAppId[];
