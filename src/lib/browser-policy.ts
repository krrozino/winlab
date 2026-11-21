const FILTER_PATTERN = /^(?:https?:\/\/)?(\*|\[[0-9a-f:.]+\]|\.?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.?)(?::(\d{1,5}))?([/?@].*)?$/i;
const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

// Older WinLab profiles used URL match patterns. Chromium policies match
// subdomains and path prefixes without these asterisks.
export function normalizeBrowserSiteFilter(value: string): string {
  return value.trim()
    .replace(/^((?:https?:\/\/)?)\*\.(?=[a-z0-9])/i, "$1")
    .replace(/^([^?@]*\/)\*(?=[?@]|$)/, "$1");
}

export function isBrowserSiteFilter(value: string): boolean {
  const filter = normalizeBrowserSiteFilter(value);
  if (filter.length > 2048 || /[\s\u0000-\u001f\u007f\\#<>"'`]|\$\(|%(?![0-9a-f]{2})/i.test(filter)) {
    return false;
  }
  const match = FILTER_PATTERN.exec(filter);
  if (!match) return false;

  const [, rawHost, port, suffix = ""] = match;
  if (port && (Number(port) < 1 || Number(port) > 65535)) return false;

  const path = suffix.split(/[?@]/, 1)[0];
  if (path.includes("*") || suffix.startsWith("@") || /[?@]$/.test(suffix)) return false;
  if (rawHost === "*") return true;

  const host = rawHost.replace(/^\./, "").replace(/\.$/, "");
  if (!host.startsWith("[") && (host.length > 253 || !host.split(".").every((label) => HOST_LABEL.test(label)))) {
    return false;
  }
  try {
    // The URL parser also rejects malformed IP literals.
    new URL("https://" + host);
    return true;
  } catch {
    return false;
  }
}

export function isBrowserExtensionId(value: string): boolean {
  return /^[a-p]{32}$/.test(value);
}

export const BROWSER_POLICY_LIST_LIMIT = 1000;
