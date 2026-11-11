import type { Config } from "./types";

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
  field: "profileName" | "studentUser" | "adminUser";
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

