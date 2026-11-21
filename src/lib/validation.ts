import type { Config } from "./types";
import { BROWSER_POLICY_LIST_LIMIT, isBrowserExtensionId, isBrowserSiteFilter } from "./browser-policy";
import { customExecutablePathError } from "./security";

const INVALID_LOCAL_USER_CHARS = new Set([
  '"',
  "/",
  "\\",
  "[",
  "]",
  ":",
  ";",
  "|",
  "=",
  ",",
  "+",
  "*",
  "?",
  "<",
  ">",
  "@"
]);

export type ConfigValidationError = {
  field: "profileName" | "studentUser" | "adminUser" | "blockedUrls" | "allowedUrls"
    | "chromeAllowedExtensionIds" | "edgeAllowedExtensionIds" | "customAllowedPaths";
  message: string;
};

function validateUserName(
  value: string,
  field: "studentUser" | "adminUser",
  label: string
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];
  if (value === null || value === undefined || typeof value !== "string") {
    errors.push({ field, message: `${label} não pode ficar vazio.` });
    return errors;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    errors.push({ field, message: `${label} não pode ficar vazio.` });
    return errors;
  }

  if (trimmed.length > 20) {
    errors.push({
      field,
      message: `${label} pode ter no máximo 20 caracteres.`
    });
  }

  if (/^[.\s]+$/.test(value)) {
    errors.push({
      field,
      message: `${label} não pode conter somente pontos ou espaços.`
    });
  }

  const invalid = [...value].find((char) => INVALID_LOCAL_USER_CHARS.has(char));
  if (invalid) {
    errors.push({
      field,
      message: `${label} contém caractere inválido: ${invalid}`
    });
  }

  return errors;
}

export function getConfigErrors(config: Config): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!config.profileName || typeof config.profileName !== "string" || !config.profileName.trim()) {
    errors.push({
      field: "profileName",
      message: "O nome do perfil WinLab não pode ficar vazio."
    });
  }

  errors.push(
    ...validateUserName(config.studentUser, "studentUser", "Usuário restrito"),
    ...validateUserName(config.adminUser, "adminUser", "Administrador")
  );

  const studentTrimmed = (config.studentUser ?? "").trim();
  const adminTrimmed = (config.adminUser ?? "").trim();

  if (
    studentTrimmed &&
    adminTrimmed &&
    studentTrimmed.localeCompare(adminTrimmed, undefined, {
      sensitivity: "accent"
    }) === 0
  ) {
    errors.push({
      field: "studentUser",
      message: "Usuário restrito e administrador precisam ter nomes diferentes."
    });
  }

  const siteLists = [
    ["blockedUrls", "Sites bloqueados"],
    ["allowedUrls", "Sites autorizados"]
  ] as const;
  for (const [field, label] of siteLists) {
    if (config[field].length > BROWSER_POLICY_LIST_LIMIT) {
      errors.push({ field, message: label + " aceita até 1.000 itens." });
    }
    for (const value of config[field]) {
      if (!isBrowserSiteFilter(value)) {
        errors.push({ field, message: label + " contém um endereço inválido (" + value + ")." });
      }
    }
  }

  const extensionLists = [
    ["chromeAllowedExtensionIds", "Chrome"],
    ["edgeAllowedExtensionIds", "Edge"]
  ] as const;
  for (const [field, browser] of extensionLists) {
    for (const id of config[field] ?? []) {
      if (!isBrowserExtensionId(id)) {
        errors.push({ field, message: "ID de extensão inválido no " + browser + " (" + id + ")." });
      }
    }
  }
  for (const value of config.customAllowedPaths) {
    const error = customExecutablePathError(value);
    if (error) errors.push({ field: "customAllowedPaths", message: value + " — " + error });
  }

  return errors;
}

export function validateAccountsSafety(
  studentUser: string,
  adminUser: string
): { isValid: boolean; error?: string } {
  const studentErrors = validateUserName(studentUser, "studentUser", "Usuário restrito");
  if (studentErrors.length > 0) {
    return { isValid: false, error: studentErrors[0].message };
  }

  const adminErrors = validateUserName(adminUser, "adminUser", "Administrador");
  if (adminErrors.length > 0) {
    return { isValid: false, error: adminErrors[0].message };
  }

  const studentTrimmed = (studentUser ?? "").trim();
  const adminTrimmed = (adminUser ?? "").trim();

  if (
    studentTrimmed &&
    adminTrimmed &&
    studentTrimmed.localeCompare(adminTrimmed, undefined, { sensitivity: "accent" }) === 0
  ) {
    return {
      isValid: false,
      error: "Usuário restrito e administrador precisam ter nomes diferentes."
    };
  }

  return { isValid: true };
}

