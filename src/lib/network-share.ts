/**
 * Configuração de compartilhamento de arquivos local SMB.
 * O servidor e as estações recebem scripts exportáveis; não há execução implícita.
 */
export interface NetworkSharePlan {
  server: string;
  shareName: string;
  rootPath: string;
  driveLetter: string;
}

export const DEFAULT_NETWORK_SHARE: NetworkSharePlan = {
  server: "",
  shareName: "Alunos",
  rootPath: "C:\\WinLab\\Alunos",
  driveLetter: "Z"
};

export function validateNetworkShare(plan: NetworkSharePlan): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9.-]{0,62}$/i.test(plan.server) || plan.server.includes("..") || plan.server.endsWith(".")) {
    errors.push("Informe o nome do computador servidor na rede local.");
  }
  if (!/^[a-z0-9_-]{1,48}$/i.test(plan.shareName)) {
    errors.push("Use um nome de pasta sem espaços ou símbolos especiais.");
  }
  if (!/^[a-z]:\\[^"'*?<>|]+$/i.test(plan.rootPath) || plan.rootPath.includes("..") || plan.rootPath.endsWith("\\")) {
    errors.push("Use um caminho local absoluto, por exemplo C:\\WinLab\\Alunos.");
  }
  if (!/^[d-z]$/i.test(plan.driveLetter)) {
    errors.push("Escolha uma letra de unidade entre D e Z.");
  }
  return errors;
}

function quote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

export function generateShareServerScript(plan: NetworkSharePlan): string {
  const errors = validateNetworkShare(plan);
  if (errors.length) throw new Error(errors.join(" "));
  return [
    "# WinLab - configurar pasta de alunos no computador servidor.",
    "# Execute como Administrador apenas no computador servidor.",
    "$ErrorActionPreference = 'Stop'",
    "$root = " + quote(plan.rootPath),
    "$name = " + quote(plan.shareName),
    "$auth = ([System.Security.Principal.SecurityIdentifier]'S-1-5-11').Translate([System.Security.Principal.NTAccount]).Value",
    "$admins = ([System.Security.Principal.SecurityIdentifier]'S-1-5-32-544').Translate([System.Security.Principal.NTAccount]).Value",
    "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
    "  throw 'Execute como Administrador.'",
    "}",
    "New-Item -Path $root -ItemType Directory -Force | Out-Null",
    "$existing = Get-SmbShare -Name $name -ErrorAction SilentlyContinue",
    "if ($existing) {",
    "  if ($existing.Path -ine $root) { throw 'Ja existe compartilhamento com outro destino.' }",
    "} else {",
    "  New-SmbShare -Name $name -Path $root -ChangeAccess $auth -FullAccess $admins | Out-Null",
    "}",
    "$acl = Get-Acl -Path $root",
    "$rule = New-Object System.Security.AccessControl.FileSystemAccessRule($auth, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "$acl.SetAccessRule($rule)",
    "Set-Acl -Path $root -AclObject $acl",
    "Write-Host ('Compartilhamento criado: ' + $name)",
    "# Clientes devem se autenticar no servidor SMB; nunca libere acesso de convidado.",
    "# Confirme firewall, perfil de rede e permissões antes de disponibilizar a pasta."
  ].join("\r\n") + "\r\n";
}

export function generateShareClientScript(plan: NetworkSharePlan): string {
  const errors = validateNetworkShare(plan);
  if (errors.length) throw new Error(errors.join(" "));
  return [
    "# WinLab - conectar a pasta compartilhada na sessao do aluno.",
    "# Execute dentro da conta Windows que usara os arquivos.",
    "$ErrorActionPreference = 'Stop'",
    "$letter = " + quote(plan.driveLetter.toUpperCase()),
    "$unc = " + quote("\\\\" + plan.server + "\\" + plan.shareName),
    "if (-not (Test-Path -LiteralPath $unc)) { throw ('Pasta inacessivel: ' + $unc + '. Verifique rede e acesso SMB.') }",
    "$used = Get-PSDrive -Name $letter -ErrorAction SilentlyContinue",
    "if ($used) {",
    "  if ($used.Root -ieq $unc) { Write-Host 'Pasta ja conectada.'; return }",
    "  throw ('Unidade ' + $letter + ': ja esta em uso.')",
    "}",
    "New-PSDrive -Name $letter -PSProvider FileSystem -Root $unc -Persist -Scope Global | Out-Null",
    "Write-Host ('Pasta dos alunos conectada em ' + $letter + ':')",
    "# Se o servidor exigir credenciais diferentes das da sessao, autentique com a conta fornecida pelo administrador."
  ].join("\r\n") + "\r\n";
}
