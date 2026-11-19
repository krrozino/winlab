import { psString, withPsUtf8Bom } from "./powershell";

/**
 * Configuração de compartilhamento de arquivos local SMB (Modelos A e B).
 * Modelo A ("collective"): pasta única da turma compartilhada entre contas autenticadas.
 * Modelo B ("per_student"): pastas individuais privadas por aluno com herança NTFS desativada
 * e permissão exclusiva para cada conta de aluno + SYSTEM + Administradores.
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
const FORBIDDEN_ADMIN_NAMES = new Set([
  "administrador",
  "administrator",
  "guest",
  "convidado",
  "todos",
  "everyone",
  "system",
  "localservice",
  "networkservice",
  "defaultaccount",
  "wdagutilityaccount",
  "authenticated users"
]);

const SENSITIVE_SUBDIRECTORIES = [
  "windows",
  "program files",
  "program files (x86)",
  "programdata",
  "users",
  "recovery",
  "$recycle.bin",
  "system volume information",
  "boot",
  "perflogs"
] as const;

export function isSensitiveShareRootPath(rootPath: string): boolean {
  const normalized = rootPath.trim().replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  if (/^[a-z]:$/i.test(normalized)) {
    return true;
  }

  const match = /^[a-z]:\\(.*)$/i.exec(normalized);
  if (!match) {
    return true;
  }

  const relative = match[1];
  return SENSITIVE_SUBDIRECTORIES.some(
    (dir) => relative === dir || relative.startsWith(`${dir}\\`)
  );
}

export function validateNetworkShare(plan: NetworkSharePlan): string[] {
  const errors: string[] = [];
  if (!/^[a-z0-9][a-z0-9.-]{0,62}$/i.test(plan.server) || plan.server.includes("..") || plan.server.endsWith(".")) {
    errors.push("Informe o nome ou IP do computador servidor na rede local.");
  }
  if (!/^[a-z0-9_-]{1,48}$/i.test(plan.shareName)) {
    errors.push("Use um nome de compartilhamento sem espaços ou símbolos especiais.");
  }

  const rawRoot = typeof plan.rootPath === "string" ? plan.rootPath : "";
  const rootHasControlOrWhitespace = rawRoot !== rawRoot.trim() || /[\x00-\x1f\x7f]/.test(rawRoot);
  const rootSegments = rawRoot.split("\\").slice(1);
  const hasInvalidSegment =
    rawRoot.includes("/") ||
    rawRoot.slice(2).includes("\\\\") ||
    rootSegments.some((segment) => segment === "" || segment === "." || segment === "..");

  if (
    rootHasControlOrWhitespace ||
    !/^[a-z]:\\[^"'*?<>|]+$/i.test(rawRoot) ||
    rawRoot.endsWith("\\") ||
    hasInvalidSegment
  ) {
    errors.push("Use um caminho local absoluto no servidor, por exemplo C:\\WinLab\\Alunos.");
  } else if (isSensitiveShareRootPath(rawRoot)) {
    errors.push("O diretório escolhido é sensível do sistema operacional e não pode ser compartilhado via SMB.");
  }

  if (!/^[d-z]$/i.test(plan.driveLetter)) {
    errors.push("Escolha uma letra de unidade entre D e Z.");
  }

  const model = plan.model ?? "collective";
  if (model !== "collective" && model !== "per_student") {
    errors.push("Modelo de compartilhamento SMB inválido.");
  }

  if (model === "per_student") {
    const accounts = (plan.studentAccounts ?? []).map((a) => a.trim()).filter(Boolean);
    if (accounts.length === 0) {
      errors.push("No modelo de pastas individuais por aluno, informe pelo menos uma conta de aluno válida.");
    }
    const seen = new Set<string>();
    for (const acc of accounts) {
      const lower = acc.toLowerCase();
      if (!VALID_ACCOUNT_REGEX.test(acc) || acc.includes("..") || acc.endsWith(".")) {
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

export function generateShareServerScript(plan: NetworkSharePlan): string {
  const errors = validateNetworkShare(plan);
  if (errors.length) throw new Error(errors.join(" "));

  const model = plan.model ?? "collective";
  const accounts = (plan.studentAccounts ?? []).map((a) => a.trim()).filter(Boolean);
  const quotedAccounts = accounts.map((a) => psString(a)).join(", ");

  const lines: string[] = [
    "#requires -version 5.1",
    "# WinLab - configurar compartilhamento SMB no computador servidor.",
    `# Modelo selecionado: ${model === "per_student" ? "Pastas individuais privadas por aluno (Modelo B)" : "Pasta coletiva da turma (Modelo A)"}`,
    "# Execute como Administrador apenas no computador servidor. SMBv1 e acesso anônimo permanecem desativados.",
    "$ErrorActionPreference = 'Stop'",
    "$root = " + psString(plan.rootPath),
    "$name = " + psString(plan.shareName),
    "$model = " + psString(model),
    model === "per_student" ? `$students = @(${quotedAccounts})` : "$students = @()",
    "$systemSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18')",
    "$adminsSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')",
    "$authSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-11')",
    "$everyoneSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-1-0')",
    "$anonymousSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-7')",
    "$guestsSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-546')",
    "$auth = $authSid.Translate([System.Security.Principal.NTAccount]).Value",
    "$admins = $adminsSid.Translate([System.Security.Principal.NTAccount]).Value",
    "$currentUserSid = ([System.Security.Principal.WindowsIdentity]::GetCurrent()).User",
    "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
    "  throw 'Execute como Administrador.'",
    "}",
    "function Assert-SafeSharePath {",
    "  param([Parameter(Mandatory=$true)][string]$Path)",
    "  if ([string]::IsNullOrWhiteSpace($Path) -or -not [System.IO.Path]::IsPathRooted($Path) -or $Path.StartsWith('\\\\')) {",
    "    throw ('Caminho SMB invalido (deve ser caminho local absoluto): ' + $Path)",
    "  }",
    "  $fullPath = [System.IO.Path]::GetFullPath($Path).TrimEnd('\\')",
    "  if ($fullPath -match '^[A-Za-z]:$') {",
    "    throw ('Raiz de unidade nao pode ser usada como pasta SMB: ' + $fullPath)",
    "  }",
    "  $driveRoot = [System.IO.Path]::GetPathRoot($fullPath)",
    "  $blockedRoots = @($env:SystemRoot, $env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:ProgramData)",
    "  if ($env:SystemDrive) { $blockedRoots += (Join-Path $env:SystemDrive 'Users') }",
    "  foreach ($rel in @('Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'Users', 'Recovery', '$Recycle.Bin', 'System Volume Information', 'Boot', 'PerfLogs')) {",
    "    $blockedRoots += (Join-Path $driveRoot $rel)",
    "  }",
    "  foreach ($blocked in $blockedRoots) {",
    "    if ([string]::IsNullOrWhiteSpace($blocked)) { continue }",
    "    $normBlocked = [System.IO.Path]::GetFullPath($blocked).TrimEnd('\\')",
    "    if ($fullPath -ieq $normBlocked -or $fullPath.StartsWith($normBlocked + '\\', [System.StringComparison]::OrdinalIgnoreCase)) {",
    "      throw ('Diretorio protegido do sistema operacional nao permitido para compartilhamento SMB: ' + $fullPath)",
    "    }",
    "  }",
    "  $cursor = $fullPath",
    "  while ($cursor -and ($cursor.Length -gt $driveRoot.TrimEnd('\\').Length)) {",
    "    if (Test-Path -LiteralPath $cursor) {",
    "      $item = Get-Item -LiteralPath $cursor -Force",
    "      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {",
    "        throw ('Reparse point / link simbolico / junction detectado no caminho e bloqueado por seguranca: ' + $cursor)",
    "      }",
    "      if (($cursor -ieq $fullPath) -and -not $item.PSIsContainer) {",
    "        throw ('O caminho alvo existe como arquivo e nao como diretorio: ' + $cursor)",
    "      }",
    "    }",
    "    $parent = Split-Path -Path $cursor -Parent",
    "    if ($parent -eq $cursor) { break }",
    "    $cursor = $parent",
    "  }",
    "  return $fullPath",
    "}",
    "function Assert-NoChildReparsePoints {",
    "  param([Parameter(Mandatory=$true)][string]$DirectoryPath)",
    "  if (-not (Test-Path -LiteralPath $DirectoryPath -PathType Container)) { return }",
    "  foreach ($child in @(Get-ChildItem -LiteralPath $DirectoryPath -Force -Recurse -ErrorAction Stop)) {",
    "    if (($child.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {",
    "      throw ('Reparse point detectado dentro do diretorio preexistente: ' + $child.FullName)",
    "    }",
    "  }",
    "}",
    "function Get-AdminMemberSids {",
    "  $sids = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)",
    "  try {",
    "    $adminGroup = Get-LocalGroup -SID 'S-1-5-32-544' -ErrorAction Stop",
    "    foreach ($member in @(Get-LocalGroupMember -Group $adminGroup -ErrorAction SilentlyContinue)) {",
    "      if ($member.SID) { [void]$sids.Add($member.SID.Value) }",
    "    }",
    "  } catch {",
    "    Write-Warning 'Nao foi possivel enumerar todos os membros do grupo Administradores durante a pre-validacao.'",
    "  }",
    "  return ,$sids",
    "}",
    "function Get-DirectoryAccessSddl {",
    "  param([Parameter(Mandatory=$true)][string]$DirectoryPath)",
    "  $acl = Get-Acl -LiteralPath $DirectoryPath",
    "  return $acl.GetSecurityDescriptorSddlForm([System.Security.AccessControl.AccessControlSections]::Access)",
    "}",
    "function Restore-DirectoryAccessSddl {",
    "  param([Parameter(Mandatory=$true)][string]$DirectoryPath, [Parameter(Mandatory=$true)][string]$AccessSddl)",
    "  $acl = (Get-Item -LiteralPath $DirectoryPath).GetAccessControl([System.Security.AccessControl.AccessControlSections]::Access)",
    "  $acl.SetSecurityDescriptorSddlForm($AccessSddl, [System.Security.AccessControl.AccessControlSections]::Access)",
    "  [System.IO.Directory]::SetAccessControl($DirectoryPath, $acl)",
    "}",
    "$smb1 = Get-SmbServerConfiguration -ErrorAction SilentlyContinue",
    "if ($smb1 -and $smb1.EnableSMB1Protocol) {",
    "  Write-Warning 'Atencao: SMBv1 esta habilitado neste servidor. Recomenda-se desativar SMBv1 por seguranca.'",
    "}",
    "# Fase 1: Validacao completa de caminho, compartilhamento e contas ANTES de qualquer mutacao.",
    "$normalizedRoot = Assert-SafeSharePath -Path $root",
    "$existingShare = Get-SmbShare -Name $name -ErrorAction SilentlyContinue",
    "if ($existingShare) {",
    "  $existingSharePath = if ($existingShare.Path) { [System.IO.Path]::GetFullPath([string]$existingShare.Path).TrimEnd('\\') } else { '' }",
    "  if ($existingSharePath -ine $normalizedRoot) { throw ('Ja existe compartilhamento com outro destino: ' + $existingShare.Path) }",
    "}",
    "$validatedStudents = New-Object System.Collections.Generic.List[object]",
    "if ($model -eq 'per_student') {",
    "  if ($students.Count -eq 0) { throw 'Nenhuma conta de aluno informada para o modelo de pastas individuais.' }",
    "  $adminMemberSids = Get-AdminMemberSids",
    "  $seenStudents = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)",
    "  $validationErrors = New-Object System.Collections.Generic.List[string]",
    "  foreach ($student in $students) {",
    "    if (-not $seenStudents.Add($student)) {",
    "      [void]$validationErrors.Add('Conta duplicada: ' + $student)",
    "      continue",
    "    }",
    "    $localAcc = Get-LocalUser -Name $student -ErrorAction SilentlyContinue",
    "    if (-not $localAcc -or -not $localAcc.SID) {",
    "      [void]$validationErrors.Add('Conta local nao existe neste servidor: ' + $student)",
    "      continue",
    "    }",
    "    if ($localAcc.SID.IsWellKnown([System.Security.Principal.WellKnownSidType]::AccountAdministratorSid) -or ($adminMemberSids -and $adminMemberSids.Contains($localAcc.SID.Value))) {",
    "      [void]$validationErrors.Add('Conta administrativa nao pode ser usada como pasta de aluno: ' + $student)",
    "      continue",
    "    }",
    "    $studentDir = Join-Path $normalizedRoot $student",
    "    $fullStudentDir = Assert-SafeSharePath -Path $studentDir",
    "    if (-not $fullStudentDir.StartsWith($normalizedRoot + '\\', [System.StringComparison]::OrdinalIgnoreCase)) {",
    "      [void]$validationErrors.Add('Subpasta do aluno escapa do diretorio raiz: ' + $studentDir)",
    "      continue",
    "    }",
    "    $dirExisted = Test-Path -LiteralPath $fullStudentDir",
    "    $dirAccessSddl = $null",
    "    if ($dirExisted) {",
    "      Assert-NoChildReparsePoints -DirectoryPath $fullStudentDir",
    "      $existingSubAcl = Get-Acl -LiteralPath $fullStudentDir",
    "      $ownerSid = $null",
    "      try {",
    "        $ownerText = [string]$existingSubAcl.Owner",
    "        if ($ownerText -match '^S-1-\\d+') {",
    "          $ownerSid = New-Object System.Security.Principal.SecurityIdentifier($ownerText)",
    "        } elseif (-not [string]::IsNullOrWhiteSpace($ownerText)) {",
    "          $ownerSid = ([System.Security.Principal.NTAccount]$ownerText).Translate([System.Security.Principal.SecurityIdentifier])",
    "        }",
    "      } catch { $ownerSid = $null }",
    "      if ((-not $ownerSid) -or (($ownerSid -ne $systemSid) -and ($ownerSid -ne $adminsSid) -and ($ownerSid -ne $localAcc.SID) -and ($ownerSid -ne $currentUserSid))) {",
    "        [void]$validationErrors.Add('Diretorio preexistente pertence a outra conta (' + $existingSubAcl.Owner + '): ' + $fullStudentDir)",
    "        continue",
    "      }",
    "      $dirAccessSddl = Get-DirectoryAccessSddl -DirectoryPath $fullStudentDir",
    "    }",
    "    [void]$validatedStudents.Add([PSCustomObject]@{ Name = $student; Sid = $localAcc.SID; Path = $fullStudentDir; Existed = $dirExisted; OriginalAccessSddl = $dirAccessSddl })",
    "  }",
    "  if ($validationErrors.Count -gt 0) {",
    "    throw ('Pre-validacao SMB falhou sem aplicar alteracoes: ' + ($validationErrors -join '; '))",
    "  }",
    "}",
    "# Fase 2: Captura de ACLs originais e permissoes SMB antes de mutar.",
    "$rootExisted = Test-Path -LiteralPath $normalizedRoot",
    "$rootOriginalAccessSddl = if ($rootExisted) { Get-DirectoryAccessSddl -DirectoryPath $normalizedRoot } else { $null }",
    "$shareExisted = $null -ne $existingShare",
    "$originalShareAccess = if ($shareExisted) { @(Get-SmbShareAccess -Name $name) } else { @() }",
    "$createdRoot = $false",
    "$createdShare = $false",
    "$modifiedShareAccess = $false",
    "$modifiedRootAcl = $false",
    "$createdStudentDirs = New-Object System.Collections.Generic.List[string]",
    "$modifiedStudentEntries = New-Object System.Collections.Generic.List[object]",
    "try {",
    "  if (-not $rootExisted) {",
    "    New-Item -Path $normalizedRoot -ItemType Directory -Force | Out-Null",
    "    $createdRoot = $true",
    "    [void](Assert-SafeSharePath -Path $normalizedRoot)",
    "  }",
    "  if (-not $shareExisted) {",
    "    New-SmbShare -Name $name -Path $normalizedRoot -ChangeAccess $auth -FullAccess $admins | Out-Null",
    "    $createdShare = $true",
    "  } else {",
    "    $universalNames = @(",
    "      $everyoneSid.Translate([System.Security.Principal.NTAccount]).Value,",
    "      $anonymousSid.Translate([System.Security.Principal.NTAccount]).Value,",
    "      $guestsSid.Translate([System.Security.Principal.NTAccount]).Value",
    "    )",
    "    foreach ($ace in $originalShareAccess) {",
    "      if ($universalNames -contains $ace.AccountName) {",
    "        Revoke-SmbShareAccess -Name $name -AccountName $ace.AccountName -Force | Out-Null",
    "        $modifiedShareAccess = $true",
    "      }",
    "    }",
    "    Grant-SmbShareAccess -Name $name -AccountName $admins -AccessRight Full -Force | Out-Null",
    "    Grant-SmbShareAccess -Name $name -AccountName $auth -AccessRight Change -Force | Out-Null",
    "    $modifiedShareAccess = $true",
    "  }",
    "  $rootAcl = Get-Acl -LiteralPath $normalizedRoot",
    "  $rootSystemRule = New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "  $rootAdminRule = New-Object System.Security.AccessControl.FileSystemAccessRule($adminsSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "  if ($model -eq 'collective') {",
    "    $rootAuthRule = New-Object System.Security.AccessControl.FileSystemAccessRule($authSid, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "    $rootAcl.SetAccessRule($rootSystemRule)",
    "    $rootAcl.SetAccessRule($rootAdminRule)",
    "    $rootAcl.SetAccessRule($rootAuthRule)",
    "    $modifiedRootAcl = $true",
    "    Set-Acl -LiteralPath $normalizedRoot -AclObject $rootAcl",
    "    Write-Host ('Compartilhamento coletivo criado: \\\\' + $env:COMPUTERNAME + '\\' + $name) -ForegroundColor Green",
    "  } else {",
    "    # Raiz com heranca desativada: preserva SYSTEM e Administradores; alunos autenticados apenas atravessam a raiz.",
    "    $rootAcl.SetAccessRuleProtection($true, $false)",
    "    foreach ($old in @($rootAcl.Access)) { [void]$rootAcl.RemoveAccessRule($old) }",
    "    $rootTraverseRule = New-Object System.Security.AccessControl.FileSystemAccessRule($authSid, 'ReadAndExecute', 'None', 'None', 'Allow')",
    "    $rootAcl.AddAccessRule($rootSystemRule)",
    "    $rootAcl.AddAccessRule($rootAdminRule)",
    "    $rootAcl.AddAccessRule($rootTraverseRule)",
    "    $modifiedRootAcl = $true",
    "    Set-Acl -LiteralPath $normalizedRoot -AclObject $rootAcl",
    "    foreach ($entry in $validatedStudents) {",
    "      $studentDir = $entry.Path",
    "      if (-not $entry.Existed) {",
    "        New-Item -Path $studentDir -ItemType Directory -Force | Out-Null",
    "        [void]$createdStudentDirs.Add($studentDir)",
    "        [void](Assert-SafeSharePath -Path $studentDir)",
    "      }",
    "      $subAcl = Get-Acl -LiteralPath $studentDir",
    "      $subAcl.SetAccessRuleProtection($true, $false)",
    "      foreach ($old in @($subAcl.Access)) { [void]$subAcl.RemoveAccessRule($old) }",
    "      $subSystemRule = New-Object System.Security.AccessControl.FileSystemAccessRule($systemSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "      $subAdminRule = New-Object System.Security.AccessControl.FileSystemAccessRule($adminsSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "      $subStudentRule = New-Object System.Security.AccessControl.FileSystemAccessRule($entry.Sid, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')",
    "      $subAcl.AddAccessRule($subSystemRule)",
    "      $subAcl.AddAccessRule($subAdminRule)",
    "      $subAcl.AddAccessRule($subStudentRule)",
    "      [void]$modifiedStudentEntries.Add($entry)",
    "      Set-Acl -LiteralPath $studentDir -AclObject $subAcl",
    "      Write-Host ('Pasta privada isolada configurada para: ' + $entry.Name) -ForegroundColor Green",
    "    }",
    "    Write-Host ('Compartilhamento com pastas individuais pronto: \\\\' + $env:COMPUTERNAME + '\\' + $name) -ForegroundColor Green",
    "  }",
    "} catch {",
    "  $originalError = $_.Exception.Message",
    "  Write-Warning ('Falha durante configuracao SMB. Iniciando recuperacao para estado anterior: ' + $originalError)",
    "  $recoveryErrors = New-Object System.Collections.Generic.List[string]",
    "  for ($i = $modifiedStudentEntries.Count - 1; $i -ge 0; $i--) {",
    "    $entry = $modifiedStudentEntries[$i]",
    "    if ($entry.Existed -and $entry.OriginalAccessSddl) {",
    "      try { Restore-DirectoryAccessSddl -DirectoryPath $entry.Path -AccessSddl $entry.OriginalAccessSddl } catch { [void]$recoveryErrors.Add('ACL ' + $entry.Path + ': ' + $_.Exception.Message) }",
    "    }",
    "  }",
    "  for ($i = $createdStudentDirs.Count - 1; $i -ge 0; $i--) {",
    "    $dir = $createdStudentDirs[$i]",
    "    try {",
    "      if ((Test-Path -LiteralPath $dir) -and (@(Get-ChildItem -LiteralPath $dir -Force).Count -eq 0)) { Remove-Item -LiteralPath $dir -Force }",
    "    } catch { [void]$recoveryErrors.Add('Remover pasta ' + $dir + ': ' + $_.Exception.Message) }",
    "  }",
    "  if ($modifiedRootAcl -and $rootExisted -and $rootOriginalAccessSddl) {",
    "    try { Restore-DirectoryAccessSddl -DirectoryPath $normalizedRoot -AccessSddl $rootOriginalAccessSddl } catch { [void]$recoveryErrors.Add('ACL raiz: ' + $_.Exception.Message) }",
    "  }",
    "  if ($createdShare) {",
    "    try { Remove-SmbShare -Name $name -Force } catch { [void]$recoveryErrors.Add('Remover share ' + $name + ': ' + $_.Exception.Message) }",
    "  } elseif ($modifiedShareAccess -and $shareExisted) {",
    "    try {",
    "      foreach ($curr in @(Get-SmbShareAccess -Name $name -ErrorAction SilentlyContinue)) {",
    "        Revoke-SmbShareAccess -Name $name -AccountName $curr.AccountName -Force -ErrorAction SilentlyContinue | Out-Null",
    "      }",
    "      foreach ($orig in $originalShareAccess) {",
    "        if ($orig.AccessControlType -eq 'Deny') {",
    "          Block-SmbShareAccess -Name $name -AccountName $orig.AccountName -Force | Out-Null",
    "        } else {",
    "          Grant-SmbShareAccess -Name $name -AccountName $orig.AccountName -AccessRight $orig.AccessRight -Force | Out-Null",
    "        }",
    "      }",
    "    } catch { [void]$recoveryErrors.Add('Restaurar permissoes SMB: ' + $_.Exception.Message) }",
    "  }",
    "  if ($createdRoot) {",
    "    try {",
    "      if ((Test-Path -LiteralPath $normalizedRoot) -and (@(Get-ChildItem -LiteralPath $normalizedRoot -Force).Count -eq 0)) { Remove-Item -LiteralPath $normalizedRoot -Force }",
    "    } catch { [void]$recoveryErrors.Add('Remover raiz ' + $normalizedRoot + ': ' + $_.Exception.Message) }",
    "  }",
    "  if ($recoveryErrors.Count -gt 0) {",
    "    throw ('Configuracao SMB falhou (' + $originalError + ') e a recuperacao teve erros: ' + ($recoveryErrors -join '; '))",
    "  }",
    "  throw ('Configuracao SMB falhou, mas o estado anterior foi restaurado com seguranca: ' + $originalError)",
    "}",
    "# Clientes devem se autenticar no servidor SMB; nunca libere acesso de convidado.",
    "# Confirme firewall (porta TCP 445 em rede privada) antes de conectar as estações."
  ];

  return withPsUtf8Bom(lines.join("\r\n") + "\r\n");
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
    "$server = " + psString(plan.server),
    "$letter = " + psString(plan.driveLetter.toUpperCase()),
    "$baseUnc = " + psString(baseUnc),
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

  return withPsUtf8Bom(lines.join("\r\n") + "\r\n");
}

export function generateShareDiagnosticsScript(plan: NetworkSharePlan): string {
  const errors = validateNetworkShare(plan);
  if (errors.length) throw new Error(errors.join(" "));

  const model = plan.model ?? "collective";
  const baseUnc = "\\\\" + plan.server + "\\" + plan.shareName;

  return withPsUtf8Bom([
    "#requires -version 5.1",
    "# WinLab - diagnostico somente leitura de conectividade SMB.",
    "$ErrorActionPreference = 'Stop'",
    "$server = " + psString(plan.server),
    "$baseUnc = " + psString(baseUnc),
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
  ].join("\r\n") + "\r\n");
}
