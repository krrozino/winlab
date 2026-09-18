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

  if (!config.profileName.trim()) {
    errors.push({
      field: "profileName",
      message: "O nome do perfil WinLab não pode ficar vazio."
    });
  }

  errors.push(
    ...validateUserName(config.studentUser, "studentUser", "Usuário restrito"),
    ...validateUserName(config.adminUser, "adminUser", "Administrador")
  );

  if (
    config.studentUser.trim() &&
    config.adminUser.trim() &&
    config.studentUser.localeCompare(config.adminUser, undefined, {
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
