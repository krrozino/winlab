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
