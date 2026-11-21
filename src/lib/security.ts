const RISKY_MARKERS = [
  "\\users\\",
  "%userprofile%",
  "%localappdata%",
  "%appdata%",
  "\\downloads\\",
  "\\desktop\\",
  "\\temp\\"
];

export function pathRisk(path: string): string | null {
  const normalized = path.trim().toLowerCase();

  if (!normalized) return "Caminho vazio.";

  if (!normalized.endsWith(".exe") && !normalized.endsWith("\\*")) {
    return "Prefira apontar para um .exe específico ou para uma pasta terminada em \\*.";
  }

  if (RISKY_MARKERS.some((marker) => normalized.includes(marker))) {
    return "Esse caminho parece gravável pelo usuário. Allowlist em pasta gravável pode permitir que outro executável contorne o bloqueio.";
  }

  return null;
}

export function customExecutablePathError(path: string): string | null {
  const value = path.trim();
  const match = /^(?:[a-z]:|%programfiles(?:\(x86\))?%)\\(.+\.exe)$/i.exec(value);
  if (!match || /[<>"/|?*\u0000-\u001f]/.test(match[1]) || /[:%]/.test(match[1])) {
    return "Informe o caminho local completo de um arquivo .exe específico.";
  }
  if (match[1].split("\\").some((part) => !part || /[. ]$/.test(part) || /~\d/.test(part))) {
    return "Use o caminho completo do executável, sem atalhos ou segmentos relativos.";
  }
  return pathRisk(value);
}
