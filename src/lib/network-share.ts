/**
 * Configuração de compartilhamento de arquivos local SMB (Modelos A e B).
 * Modelo A ("collective"): pasta única da turma compartilhada entre contas autenticadas.
 * Modelo B ("per_student"): pastas individuais privadas por aluno com herança NTFS desativada
 * e permissão exclusiva para cada conta de aluno + Administradores.
 * Nenhum script habilita SMB1 ou acesso anônimo/convidado.
 */
export type NetworkShareModel = "collective" | "per_student";

export interface NetworkSharePlan {
  server: string;
  shareName: string;
  rootPath: string;
  driveLetter: string;
  model?: NetworkShareModel;
  studentAccounts?: string[];
}

export const DEFAULT_NETWORK_SHARE: NetworkSharePlan = {
  server: "",
  shareName: "Alunos",
  rootPath: "C:\\WinLab\\Alunos",
  driveLetter: "Z",
  model: "collective",
  studentAccounts: ["Aluno"]
};

const VALID_ACCOUNT_REGEX = /^[a-z0-9][a-z0-9._-]{0,19}$/i;
const FORBIDDEN_ADMIN_NAMES = new Set(["administrador", "administrator", "guest", "convidado", "todos", "everyone"]);

export function validateNetworkShare(plan: NetworkSharePlan): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9.-]{0,62}$/i.test(plan.server) || plan.server.includes("..") || plan.server.endsWith(".")) {
    errors.push("Informe o nome ou IP do computador servidor na rede local.");
  }
  if (!/^[a-z0-9_-]{1,48}$/i.test(plan.shareName)) {
    errors.push("Use um nome de compartilhamento sem espaços ou símbolos especiais.");
  }
  if (!/^[a-z]:\\[^"'*?<>|]+$/i.test(plan.rootPath) || plan.rootPath.includes("..") || plan.rootPath.endsWith("\\")) {
    errors.push("Use um caminho local absoluto no servidor, por exemplo C:\\WinLab\\Alunos.");
  }
  if (!/^[d-z]$/i.test(plan.driveLetter)) {
    errors.push("Escolha uma letra de unidade entre D e Z.");
  }

  const model = plan.model ?? "collective";
  if (model === "per_student") {
    const accounts = (plan.studentAccounts ?? []).map((a) => a.trim()).filter(Boolean);
    if (accounts.length === 0) {
      errors.push("No modelo de pastas individuais por aluno, informe pelo menos uma conta de aluno válida.");
    }
    const seen = new Set<string>();
    for (const acc of accounts) {
      const lower = acc.toLowerCase();
      if (!VALID_ACCOUNT_REGEX.test(acc) || acc.includes("..")) {
        errors.push(`Nome de conta inválido para subpasta individual: '${acc}'.`);
      } else if (FORBIDDEN_ADMIN_NAMES.has(lower)) {
        errors.push(`A conta '${acc}' é administrativa ou reservada e não deve ser usada como pasta de aluno.`);
      } else if (seen.has(lower)) {
        errors.push(`Conta duplicada na lista de pastas individuais: '${acc}'.`);
      }
      seen.add(lower);
    }
  }

  return errors;
}

function quote(value: string): string {
  return "'" + value.replace(/'/g, "''") + "'";
}

export function generateShareServerScript(plan: NetworkSharePlan): string {
  const errors = validateNetworkShare(plan);
  if (errors.length) throw new Error(errors.join(" "));

  const model = plan.model ?? "collective";
  const accounts = (plan.studentAccounts ?? []).map((a) => a.trim()).filter(Boolean);

  const lines: string[] = [
    "#requires -version 5.1",
    "# WinLab - configurar compartilhamento SMB no computador servidor.",
    `# Modelo selecionado: ${model === "per_student" ? "Pastas individuais privadas por aluno (Modelo B)" : "Pasta coletiva da turma (Modelo A)"}`,
    "# Execute como Administrador apenas no computador servidor. SMBv1 e acesso anônimo permanecem desativados.",
    "$ErrorActionPreference = 'Stop'",
    "$root = " + quote(plan.rootPath),
    "$name = " + quote(plan.shareName),
    "$auth = ([System.Security.Principal.SecurityIdentifier]'S-1-5-11').Translate([System.Security.Principal.NTAccount]).Value",
    "$admins = ([System.Security.Principal.SecurityIdentifier]'S-1-5-32-544').Translate([System.Security.Principal.NTAccount]).Value",
    "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
    "  throw 'Execute como Administrador.'",
    "}",
    "$smb1 = Get-SmbServerConfiguration -ErrorAction SilentlyContinue",
    "if ($smb1 -and $smb1.EnableSMB1Protocol) {",
    "  Write-Warning 'Atenção: SMBv1 está habilitado neste servidor. Recomenda-se desativar SMBv1 por segurança.'",
    "}",
    "New-Item -Path $root -ItemType Directory -Force | Out-Null",
    "$existing = Get-SmbShare -Name $name -ErrorAction SilentlyContinue",
    "if ($existing) {",
    "  if ($existing.Path -ine $root) { throw 'Ja existe compartilhamento com outro destino.' }",
    "} else {",
    "  New-SmbShare -Name $name -Path $root -ChangeAccess $auth -FullAccess $admins | Out-Null",
    "}"
  ];

  if (model === "collective") {
    lines.push(
      "$acl = Get-Acl -Path $root",
      "$adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule($admins, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
      "$authRule = New-Object System.Security.AccessControl.FileSystemAccessRule($auth, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
      "$acl.SetAccessRule($adminRule)",
      "$acl.SetAccessRule($authRule)",
      "Set-Acl -Path $root -AclObject $acl",
      "Write-Host ('Compartilhamento coletivo criado: \\\\' + $env:COMPUTERNAME + '\\' + $name) -ForegroundColor Green"
    );
  } else {
    const quotedAccounts = accounts.map((a) => quote(a)).join(", ");
    lines.push(
      "# Raiz com herança desativada: alunos autenticados apenas atravessam a raiz até sua própria subpasta.",
      "$rootAcl = Get-Acl -Path $root",
      "$rootAcl.SetAccessRuleProtection($true, $false)",
      "foreach ($old in @($rootAcl.Access)) { [void]$rootAcl.RemoveAccessRule($old) }",
      "$rootAdminRule = New-Object System.Security.AccessControl.FileSystemAccessRule($admins, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
      "$rootTraverseRule = New-Object System.Security.AccessControl.FileSystemAccessRule($auth, 'ReadAndExecute', 'None', 'None', 'Allow')",
      "$rootAcl.AddAccessRule($rootAdminRule)",
      "$rootAcl.AddAccessRule($rootTraverseRule)",
      "Set-Acl -Path $root -AclObject $rootAcl",
      `$students = @(${quotedAccounts})`,
      "foreach ($student in $students) {",
      "  $localAcc = Get-LocalUser -Name $student -ErrorAction SilentlyContinue",
      "  if (-not $localAcc) {",
      "    throw ('Conta local ' + $student + ' nao existe neste servidor. Crie a conta antes de configurar sua pasta privada.')",
      "  }",
      "  $studentDir = Join-Path $root $student",
      "  New-Item -Path $studentDir -ItemType Directory -Force | Out-Null",
      "  $subAcl = Get-Acl -Path $studentDir",
      "  $subAcl.SetAccessRuleProtection($true, $false)",
      "  foreach ($old in @($subAcl.Access)) { [void]$subAcl.RemoveAccessRule($old) }",
      "  $subAdminRule = New-Object System.Security.AccessControl.FileSystemAccessRule($admins, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
      "  $studentIdentity = $env:COMPUTERNAME + '\\' + $student",
      "  $subStudentRule = New-Object System.Security.AccessControl.FileSystemAccessRule($studentIdentity, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
      "  $subAcl.AddAccessRule($subAdminRule)",
      "  $subAcl.AddAccessRule($subStudentRule)",
      "  Set-Acl -Path $studentDir -AclObject $subAcl",
      "  Write-Host ('Pasta privada isolada configurada para: ' + $student) -ForegroundColor Green",
      "}",
      "Write-Host ('Compartilhamento com pastas individuais pronto: \\\\' + $env:COMPUTERNAME + '\\' + $name) -ForegroundColor Green"
    );
  }

  lines.push(
    "# Clientes devem se autenticar no servidor SMB; nunca libere acesso de convidado.",
    "# Confirme firewall (porta TCP 445 em rede privada) antes de conectar as estações."
  );

  return lines.join("\r\n") + "\r\n";
}

export function generateShareClientScript(plan: NetworkSharePlan): string {
  const errors = validateNetworkShare(plan);
  if (errors.length) throw new Error(errors.join(" "));

  const model = plan.model ?? "collective";
  const baseUnc = "\\\\" + plan.server + "\\" + plan.shareName;

  const lines: string[] = [
    "#requires -version 5.1",
    "# WinLab - conectar a pasta compartilhada na sessao do aluno.",
    "# Execute dentro da conta Windows que usara os arquivos.",
    "$ErrorActionPreference = 'Stop'",
    "$server = " + quote(plan.server),
    "$letter = " + quote(plan.driveLetter.toUpperCase()),
    "$baseUnc = " + quote(baseUnc),
    model === "per_student"
      ? "$unc = Join-Path $baseUnc $env:USERNAME"
      : "$unc = $baseUnc",
    "if (Get-Command Test-NetConnection -ErrorAction SilentlyContinue) {",
    "  $tcpOk = Test-NetConnection -ComputerName $server -Port 445 -InformationLevel Quiet -WarningAction SilentlyContinue",
    "  if (-not $tcpOk) {",
    "    throw ('Servidor SMB inacessivel na porta TCP 445: ' + $server + '. Verifique cabo/Wi-Fi e Firewall de Compartilhamento de Arquivos.')",
    "  }",
    "}",
    "if (-not (Test-Path -LiteralPath $unc)) {",
    "  throw ('Pasta inacessivel: ' + $unc + '. Verifique rede, credenciais e permissoes SMB.')",
    "}",
    "$used = Get-PSDrive -Name $letter -ErrorAction SilentlyContinue",
    "if ($used) {",
    "  if ($used.Root -ieq $unc) { Write-Host ('Pasta ja conectada em ' + $letter + ': -> ' + $unc) -ForegroundColor Green; return }",
    "  throw ('Unidade ' + $letter + ': ja esta em uso por outro caminho (' + $used.Root + ').')",
    "}",
    "New-PSDrive -Name $letter -PSProvider FileSystem -Root $unc -Persist -Scope Global | Out-Null",
    "Write-Host ('Pasta conectada com sucesso em ' + $letter + ': (' + $unc + ')') -ForegroundColor Green",
    "# Se o servidor exigir credenciais diferentes das da sessao, autentique com a conta fornecida pelo administrador."
  ];

  return lines.join("\r\n") + "\r\n";
}

export function generateShareDiagnosticsScript(plan: NetworkSharePlan): string {
  const errors = validateNetworkShare(plan);
  if (errors.length) throw new Error(errors.join(" "));

  const model = plan.model ?? "collective";
  const baseUnc = "\\\\" + plan.server + "\\" + plan.shareName;

  return [
    "#requires -version 5.1",
    "# WinLab - diagnostico somente leitura de conectividade SMB.",
    "$ErrorActionPreference = 'Stop'",
    "$server = " + quote(plan.server),
    "$baseUnc = " + quote(baseUnc),
    model === "per_student"
      ? "$targetUnc = Join-Path $baseUnc $env:USERNAME"
      : "$targetUnc = $baseUnc",
    "Write-Host '=== Diagnostico de Rede SMB WinLab ===' -ForegroundColor Cyan",
    "Write-Host ('Usuario atual: ' + $env:USERNAME)",
    "Write-Host ('Destino esperado: ' + $targetUnc)",
    "if (Get-Command Test-NetConnection -ErrorAction SilentlyContinue) {",
    "  $net = Test-NetConnection -ComputerName $server -Port 445 -WarningAction SilentlyContinue",
    "  Write-Host ('Porta TCP 445 (SMB) em ' + $server + ': ' + ($(if ($net.TcpTestSucceeded) { 'ACESSIVEL' } else { 'BLOQUEADA/INACESSIVEL' })))",
    "}",
    "if (Test-Path -LiteralPath $targetUnc) {",
    "  Write-Host 'Acesso de leitura a pasta remota: OK' -ForegroundColor Green",
    "} else {",
    "  Write-Host 'Acesso de leitura a pasta remota: FALHOU (verifique credenciais e permissoes NTFS/SMB)' -ForegroundColor Red",
    "}",
    "if (Get-Command Get-SmbMapping -ErrorAction SilentlyContinue) {",
    "  $mappings = @(Get-SmbMapping -ErrorAction SilentlyContinue)",
    "  Write-Host ('Mapeamentos SMB ativos na sessao: ' + $mappings.Count)",
    "}"
  ].join("\r\n") + "\r\n";
}
