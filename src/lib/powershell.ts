/**
 * Utilitários seguros para serialização de dados literais em scripts PowerShell e CMD.
 * Entradas fornecidas pelo usuário devem ser tratadas exclusivamente como dados.
 */

const POWERSHELL_SINGLE_QUOTES_REGEX = /['\u2018\u2019\u201A\u201B]/g;
const CMD_UNSAFE_LABEL_REGEX = /["&|<>^%()!\r\n\t\0\x00-\x1f\x7f]/g;

export function psString(value: string): string {
  const sanitized = String(value ?? "").replaceAll("\0", "");
  return `'${sanitized.replace(POWERSHELL_SINGLE_QUOTES_REGEX, "$&$&")}'`;
}

export function psBool(value: boolean): string {
  return value ? "$true" : "$false";
}

export function psArray(values: readonly string[], indent = "    "): string {
  if (!values.length) return "@()";
  return `@(\n${values.map((value) => `${indent}${psString(value)}`).join(",\n")}\n)`;
}

export function psCommentText(value: string): string {
  return String(value ?? "")
    .replaceAll("\0", "")
    .replace(/[\r\n\u0085\u2028\u2029]+/g, " ")
    .replaceAll("<#", "< #")
    .replaceAll("#>", "# >")
    .trim();
}

export function psBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function psEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string
): T {
  if (typeof value === "string" && allowed.includes(value as T)) {
    return value as T;
  }
  throw new Error(`Valor inválido para '${fieldName}': ${String(value)}`);
}

export function cmdSafeLabel(value: string, fallback = "WinLab"): string {
  const cleaned = String(value ?? "")
    .replace(CMD_UNSAFE_LABEL_REGEX, "")
    .trim();
  return cleaned || fallback;
}

export function withPsUtf8Bom(script: string): string {
  return script.startsWith("\uFEFF") ? script : `\uFEFF${script}`;
}
