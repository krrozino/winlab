import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { defaultConfig } from "../src/lib/default-config";
import {
  generateAuditScript,
  generateMaintenanceScript,
  generateRollbackScript,
  generateSetupScript,
  generateUnlockWallpaperScript,
  generateVerifyScript
} from "../src/lib/generator";
import {
  DEFAULT_NETWORK_SHARE,
  generateShareClientScript,
  generateShareDiagnosticsScript,
  generateShareServerScript,
  isSensitiveShareRootPath,
  validateNetworkShare
} from "../src/lib/network-share";
import {
  CMD_EXIT_CODES,
  generateLauncherCmdScript,
  generateRollbackCmdScript
} from "../src/lib/package-integrity";
import { psCommentText, psString } from "../src/lib/powershell";
import { generatePreflightScript } from "../src/lib/preflight-script";
import type { Config } from "../src/lib/types";

const isWindows = process.platform === "win32";

function runPowerShell(script: string): { status: number | null; stdout: string; stderr: string } {
  const dir = makeTempDir("winlab-ps-run-");
  const scriptPath = path.join(dir, "run.ps1");
  const content = script.startsWith("\uFEFF") ? script : `\uFEFF${script}`;
  writeFileSync(scriptPath, content, "utf8");
  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
      { encoding: "utf8" }
    );
    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeWorkspaceTempDir(prefix: string): string {
  const base = path.join(process.cwd(), "artifacts", "test-tmp");
  mkdirSync(base, { recursive: true });
  return mkdtempSync(path.join(base, prefix));
}

// ============================================================================
// TAREFA 1 — SEGURANÇA SMB
// ============================================================================

test("SMB: rejeita diretórios sensíveis do Windows, travessia e contas reservadas/administrativas", () => {
  const basePlan = { ...DEFAULT_NETWORK_SHARE, server: "PC-SERVIDOR" };

  const sensitiveRoots = [
    "C:\\",
    "C:\\Windows",
    "C:\\Windows\\System32",
    "C:\\Program Files",
    "C:\\Program Files\\WinLab",
    "C:\\Program Files (x86)\\WinLab",
    "C:\\ProgramData",
    "C:\\ProgramData\\WinLab",
    "C:\\Users",
    "C:\\Users\\Aluno\\Compartilhado",
    "D:\\Recovery",
    "D:\\$Recycle.Bin",
    "C:\\System Volume Information",
    "C:\\WinLab\\..\\outro",
    "C:\\WinLab\\.\\Alunos",
    "C:\\WinLab\\\\Alunos",
    "C:/WinLab/Alunos",
    " C:\\WinLab\\Alunos",
    "C:\\WinLab\\Alunos\n"
  ];

  for (const rootPath of sensitiveRoots) {
    assert.ok(
      validateNetworkShare({ ...basePlan, rootPath }).length > 0,
      `Deveria rejeitar rootPath inseguro: ${JSON.stringify(rootPath)}`
    );
    assert.throws(() => generateShareServerScript({ ...basePlan, rootPath }));
  }

  assert.equal(isSensitiveShareRootPath("C:\\WinLab\\Alunos"), false);
  assert.equal(isSensitiveShareRootPath("D:\\Laboratorio\\TurmaA"), false);

  const reservedAccounts = [
    "Administrator",
    "Administrador",
    "Guest",
    "Convidado",
    "Everyone",
    "Todos",
    "SYSTEM",
    "LocalService",
    "NetworkService",
    "DefaultAccount",
    "WDAGUtilityAccount"
  ];

  for (const account of reservedAccounts) {
    assert.ok(
      validateNetworkShare({
        ...basePlan,
        model: "per_student",
        studentAccounts: [account]
      }).length > 0,
      `Deveria rejeitar conta reservada: ${account}`
    );
  }
});

test("SMB: preserva SYSTEM e Administradores, valida antes de mutar e isola pastas no Windows", () => {
  const plan = {
    ...DEFAULT_NETWORK_SHARE,
    server: "PC-SERVIDOR",
    model: "per_student" as const,
    studentAccounts: ["Aluno01", "Aluno02"]
  };
  const script = generateShareServerScript(plan);

  assert.match(script, /S-1-5-18/);
  assert.match(script, /S-1-5-32-544/);
  assert.match(script, /S-1-5-11/);
  assert.match(script, /ReparsePoint/);
  assert.match(script, /GetSecurityDescriptorSddlForm/);
  assert.match(script, /SetSecurityDescriptorSddlForm/);

  if (!isWindows) return;

  const tempDir = makeWorkspaceTempDir("winlab-smb-");
  try {
    const shareRoot = path.join(tempDir, "Alunos");
    const serverScript = generateShareServerScript({
      ...plan,
      rootPath: shareRoot
    }).replace(/^\uFEFF/, "");

    // 1) Conta inexistente na 2a posição NÃO pode mutar nada nem criar a 1a pasta ou share
    const stateDir = path.join(tempDir, "WinLabState");
    const preValidationHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(stateDir)}
$script:mutations = @()
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { param($Name, $Path, $ChangeAccess, $FullAccess) $script:mutations += 'New-SmbShare' }
function Get-SmbShareAccess { param([string]$Name) @() }
function Get-LocalGroup { param($SID, $ErrorAction) [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
function Get-LocalGroupMember { param($Group, $ErrorAction) @() }
function Get-LocalUser {
  param([string]$Name, $ErrorAction)
  if ($Name -eq 'Aluno01') {
    return [PSCustomObject]@{ Name = 'Aluno01'; Enabled = $true; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-21-999999999-1-1-1001')) }
  }
  return $null
}
${serverScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const preFail = runPowerShell(preValidationHarness);
    assert.notEqual(preFail.status, 0, "Deve falhar quando Aluno02 não existe");
    assert.match(preFail.stderr + preFail.stdout, /Pre-validacao SMB falhou sem aplicar alteracoes/i);
    assert.equal(existsSync(shareRoot), false, "Não deve criar pasta raiz antes de validar todas as contas");

    // 1b) Get-AdminMemberSids deve falhar fechado se enumeração de Administradores falhar
    const failClosedAdminEnum = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(stateDir)}
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria chamar New-SmbShare' }
function Get-LocalGroup { param($SID, $ErrorAction) [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
function Get-LocalGroupMember { param($Group, $ErrorAction) throw 'Falha simulada AD/SAM' }
${serverScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const failClosedRes = runPowerShell(failClosedAdminEnum);
    assert.notEqual(failClosedRes.status, 0, "Get-AdminMemberSids deve falhar fechado");
    assert.match(failClosedRes.stderr + failClosedRes.stdout, /Falha simulada AD\/SAM/);
    assert.equal(existsSync(shareRoot), false);

    // 1c) Conta desativada deve ser rejeitada antes de mutar
    const disabledAccountHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(stateDir)}
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria chamar New-SmbShare' }
function Get-LocalGroup { param($SID, $ErrorAction) [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
function Get-LocalGroupMember { param($Group, $ErrorAction) @() }
function Get-LocalUser {
  param([string]$Name, $ErrorAction)
  $rid = if ($Name -eq 'Aluno01') { '1001' } else { '1002' }
  [PSCustomObject]@{ Name = $Name; Enabled = ($Name -ne 'Aluno02'); SID = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-21-999999999-1-1-" + $rid)) }
}
${serverScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const disabledRes = runPowerShell(disabledAccountHarness);
    assert.notEqual(disabledRes.status, 0);
    assert.match(disabledRes.stderr + disabledRes.stdout, /Conta de aluno desativada/);
    assert.equal(existsSync(shareRoot), false);

    // 2) Conta de aluno membro de Administradores (inclusive via grupo indireto) deve falhar antes de mutar
    const adminStudentHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(stateDir)}
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria chamar New-SmbShare' }
function Get-LocalGroup {
  param($SID, $ErrorAction)
  if ($SID -eq 'S-1-5-32-544') { return [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
  if ($SID -eq 'S-1-5-21-999999999-1-1-2001') { return [PSCustomObject]@{ Name = 'NestedAdmins'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-21-999999999-1-1-2001')) } }
  return $null
}
function Get-LocalGroupMember {
  param($Group, $ErrorAction)
  if ($Group.SID.Value -eq 'S-1-5-32-544') {
    return @([PSCustomObject]@{ Name = 'NestedAdmins'; ObjectClass = 'Group'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-21-999999999-1-1-2001')) })
  }
  return @([PSCustomObject]@{ Name = 'Aluno02'; ObjectClass = 'User'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-21-999999999-1-1-1002')) })
}
function Get-LocalUser {
  param([string]$Name, $ErrorAction)
  $rid = if ($Name -eq 'Aluno01') { '1001' } else { '1002' }
  [PSCustomObject]@{ Name = $Name; Enabled = $true; SID = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-21-999999999-1-1-" + $rid)) }
}
${serverScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const adminStudentRes = runPowerShell(adminStudentHarness);
    assert.notEqual(adminStudentRes.status, 0);
    assert.match(adminStudentRes.stderr + adminStudentRes.stdout, /Conta administrativa nao pode ser usada/);
    assert.equal(existsSync(shareRoot), false);

    // 2b) Diretório preexistente não gerenciado pelo WinLab deve ser rejeitado
    const unmanagedRoot = path.join(tempDir, "UnmanagedShare");
    mkdirSync(unmanagedRoot, { recursive: true });
    const unmanagedScript = generateShareServerScript({
      ...plan,
      rootPath: unmanagedRoot
    }).replace(/^\uFEFF/, "");
    const unmanagedHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(stateDir)}
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria criar share em pasta nao gerenciada' }
${unmanagedScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const unmanagedRes = runPowerShell(unmanagedHarness);
    assert.notEqual(unmanagedRes.status, 0);
    assert.match(unmanagedRes.stderr + unmanagedRes.stdout, /nao gerenciado pelo WinLab/i);

    // 3) Reparse point (NTFS Junction) deve ser bloqueado antes de qualquer mutação
    const targetDir = path.join(tempDir, "RealTarget");
    const junctionRoot = path.join(tempDir, "JunctionShare");
    mkdirSync(targetDir, { recursive: true });
    execFileSync("cmd.exe", ["/c", "mklink", "/J", junctionRoot, targetDir], { stdio: "pipe" });
    const junctionScript = generateShareServerScript({
      ...plan,
      rootPath: junctionRoot
    }).replace(/^\uFEFF/, "");
    const junctionHarness = `
$ErrorActionPreference = 'Stop'
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria criar share em junction' }
${junctionScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const junctionRes = runPowerShell(junctionHarness);
    assert.notEqual(junctionRes.status, 0);
    assert.match(junctionRes.stderr + junctionRes.stdout, /Reparse point/i);

    // 4) Execução válida finaliza e valida ACLs ANTES de disponibilizar o novo compartilhamento SMB
    const isolatedRoot = path.join(tempDir, "IsolatedShare");
    const validScript = generateShareServerScript({
      ...plan,
      rootPath: isolatedRoot
    }).replace(/^\uFEFF/, "");
    const validHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(stateDir)}
$script:capturedAcls = @{}
$script:eventOrder = New-Object System.Collections.Generic.List[string]
function Write-Host { param([Parameter(ValueFromRemainingArguments=$true)]$Args) }
function Write-Warning { param([Parameter(ValueFromRemainingArguments=$true)]$Args) }
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { param($Name, $Path, $ChangeAccess, $FullAccess) [void]$script:eventOrder.Add('New-SmbShare') }
function Remove-SmbShare { param($Name, [switch]$Force, $ErrorAction) }
function Get-LocalGroup { param($SID, $ErrorAction) [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
function Get-LocalGroupMember { param($Group, $ErrorAction) @() }
function Get-LocalUser {
  param([string]$Name, $ErrorAction)
  $rid = if ($Name -eq 'Aluno01') { '1001' } else { '1002' }
  [PSCustomObject]@{ Name = $Name; Enabled = $true; SID = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-21-999999999-1-1-" + $rid)) }
}
function Convert-RuleSids($acl) {
  @($acl.Access | ForEach-Object {
    try { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value + ':' + $_.FileSystemRights + ':' + $_.InheritanceFlags }
    catch { $_.IdentityReference.Value + ':' + $_.FileSystemRights + ':' + $_.InheritanceFlags }
  })
}
$isElevated = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
function Set-Acl {
  param([string]$LiteralPath, $AclObject)
  [void]$script:eventOrder.Add('Set-Acl:' + (Split-Path -Leaf $LiteralPath))
  $script:capturedAcls[$LiteralPath] = [PSCustomObject]@{
    protected = $AclObject.AreAccessRulesProtected
    rules = Convert-RuleSids $AclObject
  }
  if ($isElevated) {
    Microsoft.PowerShell.Security\\Set-Acl -LiteralPath $LiteralPath -AclObject $AclObject
  } else {
    $clone = New-Object System.Security.AccessControl.DirectorySecurity
    $clone.SetSecurityDescriptorSddlForm($AclObject.GetSecurityDescriptorSddlForm('All'))
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $clone.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Microsoft.PowerShell.Security\\Set-Acl -LiteralPath $LiteralPath -AclObject $clone
  }
}
${validScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
$rootAclCheck = $script:capturedAcls[${psString(isolatedRoot)}]
$a1AclCheck = $script:capturedAcls[${psString(path.join(isolatedRoot, "Aluno01"))}]
$a2AclCheck = $script:capturedAcls[${psString(path.join(isolatedRoot, "Aluno02"))}]
[PSCustomObject]@{
  eventOrder = @($script:eventOrder)
  rootProtected = $rootAclCheck.protected
  rootRules = $rootAclCheck.rules
  a1Protected = $a1AclCheck.protected
  a1Rules = $a1AclCheck.rules
  a2Protected = $a2AclCheck.protected
  a2Rules = $a2AclCheck.rules
} | ConvertTo-Json -Depth 4
`;
    const validRes = runPowerShell(validHarness);
    assert.equal(validRes.status, 0, validRes.stderr);
    const aclReport = JSON.parse(validRes.stdout);
    assert.deepEqual(aclReport.eventOrder, [
      "Set-Acl:IsolatedShare",
      "Set-Acl:Aluno01",
      "Set-Acl:Aluno02",
      "New-SmbShare"
    ]);
    assert.equal(aclReport.rootProtected, true);
    assert.equal(aclReport.a1Protected, true);
    assert.equal(aclReport.a2Protected, true);

    assert.ok(aclReport.rootRules.some((r: string) => r.startsWith("S-1-5-18:FullControl")));
    assert.ok(aclReport.rootRules.some((r: string) => r.startsWith("S-1-5-32-544:FullControl")));
    assert.ok(aclReport.rootRules.some((r: string) => r.startsWith("S-1-5-11:ReadAndExecute")));
    assert.ok(!aclReport.rootRules.some((r: string) => r.startsWith("S-1-1-0:")));

    assert.ok(aclReport.a1Rules.some((r: string) => r.startsWith("S-1-5-18:FullControl")));
    assert.ok(aclReport.a1Rules.some((r: string) => r.startsWith("S-1-5-32-544:FullControl")));
    assert.ok(aclReport.a1Rules.some((r: string) => r.startsWith("S-1-5-21-999999999-1-1-1001:Modify")));
    assert.ok(!aclReport.a1Rules.some((r: string) => r.includes("1002")));
    assert.ok(!aclReport.a1Rules.some((r: string) => r.startsWith("S-1-5-11:")));

    assert.ok(aclReport.a2Rules.some((r: string) => r.startsWith("S-1-5-21-999999999-1-1-1002:Modify")));
    assert.ok(!aclReport.a2Rules.some((r: string) => r.includes("1001")));

    // 4b) Migração insegura de modelo (per_student -> collective) em diretório gerenciado deve ser bloqueada
    const migrationScript = generateShareServerScript({
      ...plan,
      model: "collective",
      rootPath: isolatedRoot
    }).replace(/^\uFEFF/, "");
    const migrationHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(stateDir)}
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria migrar modelo' }
${migrationScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const migrationRes = runPowerShell(migrationHarness);
    assert.notEqual(migrationRes.status, 0);
    assert.match(migrationRes.stderr + migrationRes.stdout, /Migracao insegura de modelo SMB bloqueada/i);

    // 5) Falha intermediária em Aluno02 restaura e confirma ACL original de raiz e Aluno01, remove Aluno02 vazia
    const rollbackRoot = path.join(tempDir, "RollbackShare");
    const preAluno01 = path.join(rollbackRoot, "Aluno01");
    mkdirSync(preAluno01, { recursive: true });
    writeFileSync(path.join(preAluno01, "prova.txt"), "dados existentes", "utf8");
    const rbStateDir = path.join(tempDir, "WinLabRbState", "WinLab", "Shares");
    mkdirSync(rbStateDir, { recursive: true });
    writeFileSync(
      path.join(rbStateDir, "Alunos.json"),
      JSON.stringify({
        schemaVersion: 1,
        managedBy: "WinLab",
        shareName: "Alunos",
        rootPath: rollbackRoot,
        model: "per_student",
        students: ["Aluno01"]
      }),
      "utf8"
    );

    const rollbackScript = generateShareServerScript({
      ...plan,
      rootPath: rollbackRoot
    }).replace(/^\uFEFF/, "");
    const rollbackHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(path.join(tempDir, "WinLabRbState"))}
function Write-Host { param([Parameter(ValueFromRemainingArguments=$true)]$Args) }
function Write-Warning { param([Parameter(ValueFromRemainingArguments=$true)]$Args) }
$markerSid = New-Object System.Security.Principal.SecurityIdentifier('S-1-5-21-999999999-1-1-1555')
$markerRule = New-Object System.Security.AccessControl.FileSystemAccessRule($markerSid, 'ReadAndExecute', 'None', 'None', 'Allow')
$initA1 = Get-Acl -LiteralPath ${psString(preAluno01)}
$initA1.AddAccessRule($markerRule)
Set-Acl -LiteralPath ${psString(preAluno01)} -AclObject $initA1

function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria criar share antes de finalizar ACLs' }
function Get-LocalGroup { param($SID, $ErrorAction) [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
function Get-LocalGroupMember { param($Group, $ErrorAction) @() }
function Get-LocalUser {
  param([string]$Name, $ErrorAction)
  $rid = if ($Name -eq 'Aluno01') { '1001' } else { '1002' }
  [PSCustomObject]@{ Name = $Name; Enabled = $true; SID = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-21-999999999-1-1-" + $rid)) }
}
$isElevatedRb = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
function Set-Acl {
  param([string]$LiteralPath, $AclObject)
  if ($LiteralPath -like '*Aluno02' -and -not $script:failedOnce) {
    $script:failedOnce = $true
    throw 'Falha simulada em Aluno02'
  }
  if ($isElevatedRb) {
    Microsoft.PowerShell.Security\\Set-Acl -LiteralPath $LiteralPath -AclObject $AclObject
  } else {
    $clone = New-Object System.Security.AccessControl.DirectorySecurity
    $clone.SetSecurityDescriptorSddlForm($AclObject.GetSecurityDescriptorSddlForm('All'))
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $clone.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Microsoft.PowerShell.Security\\Set-Acl -LiteralPath $LiteralPath -AclObject $clone
  }
}
$caughtMessage = ''
try {
${rollbackScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
} catch {
  $caughtMessage = $_.Exception.Message
}
$afterA1 = Get-Acl -LiteralPath ${psString(preAluno01)}
$hasMarker = @($afterA1.Access | Where-Object {
  try { $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -eq 'S-1-5-21-999999999-1-1-1555' } catch { $false }
}).Count -gt 0
[PSCustomObject]@{
  caughtMessage = $caughtMessage
  hasMarkerAfterRollback = $hasMarker
  aluno02Exists = Test-Path -LiteralPath ${psString(path.join(rollbackRoot, "Aluno02"))}
  provaExists = Test-Path -LiteralPath ${psString(path.join(preAluno01, "prova.txt"))}
} | ConvertTo-Json
`;
    const rbRes = runPowerShell(rollbackHarness);
    assert.equal(rbRes.status, 0, rbRes.stderr);
    const rbReport = JSON.parse(rbRes.stdout);
    assert.match(rbReport.caughtMessage, /restaurado e confirmado/i);
    assert.equal(rbReport.hasMarkerAfterRollback, true, "Deve restaurar ACL original de Aluno01");
    assert.equal(rbReport.aluno02Exists, false, "Deve remover subpasta vazia recém-criada em falha");
    assert.equal(rbReport.provaExists, true, "Não deve apagar arquivos preexistentes");

    // 6) Diretório preexistente pertencente a conta não-administrativa estranha é bloqueado antes de mutar
    const foreignRoot = path.join(tempDir, "ForeignShare");
    const foreignSub = path.join(foreignRoot, "Aluno01");
    mkdirSync(foreignSub, { recursive: true });
    const foreignStateDir = path.join(tempDir, "WinLabForeignState", "WinLab", "Shares");
    mkdirSync(foreignStateDir, { recursive: true });
    writeFileSync(
      path.join(foreignStateDir, "Alunos.json"),
      JSON.stringify({
        schemaVersion: 1,
        managedBy: "WinLab",
        shareName: "Alunos",
        rootPath: foreignRoot,
        model: "per_student",
        students: ["Aluno01"]
      }),
      "utf8"
    );
    const foreignScript = generateShareServerScript({
      ...plan,
      rootPath: foreignRoot
    }).replace(/^\uFEFF/, "");
    const foreignHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(path.join(tempDir, "WinLabForeignState"))}
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { throw 'Nao deveria criar share quando dono preexistente e estranho' }
function Get-LocalGroup { param($SID, $ErrorAction) [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
function Get-LocalGroupMember { param($Group, $ErrorAction) @() }
function Get-LocalUser {
  param([string]$Name, $ErrorAction)
  $rid = if ($Name -eq 'Aluno01') { '1001' } else { '1002' }
  [PSCustomObject]@{ Name = $Name; Enabled = $true; SID = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-21-999999999-1-1-" + $rid)) }
}
function Get-Acl {
  param([string]$LiteralPath)
  $real = Microsoft.PowerShell.Security\\Get-Acl -LiteralPath $LiteralPath
  if ($LiteralPath -like '*Aluno01') {
    $fake = New-Object System.Security.AccessControl.DirectorySecurity
    $fake.SetSecurityDescriptorSddlForm('O:S-1-5-21-999999999-1-1-1999D:AI')
    return $fake
  }
  return $real
}
${foreignScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const foreignRes = runPowerShell(foreignHarness);
    assert.notEqual(foreignRes.status, 0);
    assert.match(foreignRes.stderr + foreignRes.stdout, /Diretorio preexistente pertence a outra conta/i);

    // 7) Falha durante rollback não é silenciada e impede anúncio de recuperação completa
    const rbFailRoot = path.join(tempDir, "RollbackFailureShare");
    const rbFailScript = generateShareServerScript({
      ...plan,
      rootPath: rbFailRoot
    }).replace(/^\uFEFF/, "");
    const rbFailHarness = `
$ErrorActionPreference = 'Stop'
$env:ProgramData = ${psString(path.join(tempDir, "WinLabRbFailState"))}
function Write-Host { param([Parameter(ValueFromRemainingArguments=$true)]$Args) }
function Write-Warning { param([Parameter(ValueFromRemainingArguments=$true)]$Args) }
function Get-SmbServerConfiguration { param($ErrorAction) $null }
function Get-SmbShare { param([string]$Name, $ErrorAction) $null }
function New-SmbShare { param($Name, $Path, $ChangeAccess, $FullAccess) }
function Remove-SmbShare { param($Name, [switch]$Force, $ErrorAction) throw 'Falha simulada ao remover share' }
function Set-Content { param($LiteralPath, $Value, $Encoding) throw 'Falha simulada ao gravar estado' }
function Get-LocalGroup { param($SID, $ErrorAction) [PSCustomObject]@{ Name = 'Administrators'; SID = (New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544')) } }
function Get-LocalGroupMember { param($Group, $ErrorAction) @() }
function Get-LocalUser {
  param([string]$Name, $ErrorAction)
  $rid = if ($Name -eq 'Aluno01') { '1001' } else { '1002' }
  [PSCustomObject]@{ Name = $Name; Enabled = $true; SID = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-21-999999999-1-1-" + $rid)) }
}
$isElevatedRf = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
function Set-Acl {
  param([string]$LiteralPath, $AclObject)
  if ($isElevatedRf) {
    Microsoft.PowerShell.Security\\Set-Acl -LiteralPath $LiteralPath -AclObject $AclObject
  } else {
    $clone = New-Object System.Security.AccessControl.DirectorySecurity
    $clone.SetSecurityDescriptorSddlForm($AclObject.GetSecurityDescriptorSddlForm('All'))
    $me = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $clone.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($me, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Microsoft.PowerShell.Security\\Set-Acl -LiteralPath $LiteralPath -AclObject $clone
  }
}
${rbFailScript.replace(
  "if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {",
  "if ($false) {"
)}
`;
    const rbFailRes = runPowerShell(rbFailHarness);
    assert.notEqual(rbFailRes.status, 0);
    assert.match(rbFailRes.stderr + rbFailRes.stdout, /recuperacao teve erros/i);
    assert.doesNotMatch(rbFailRes.stderr + rbFailRes.stdout, /restaurado e confirmado/i);
  } finally {
    const junctionPath = path.join(tempDir, "JunctionShare");
    if (existsSync(junctionPath)) {
      try { execFileSync("cmd.exe", ["/c", "rmdir", junctionPath], { stdio: "pipe" }); } catch {}
    }
    const user = process.env.USERNAME;
    if (user) {
      try {
        execFileSync("icacls", [tempDir, "/grant", `${user}:(OI)(CI)F`, "/T", "/Q"], { stdio: "pipe" });
      } catch {}
    }
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ============================================================================
// TAREFA 2 — SEGURANÇA POWERSHELL
// ============================================================================

test("PowerShell: profileName e entradas de usuário com aspas, expressões, caminhos e multilinha são tratados como dados", () => {
  const sentinelPath = isWindows
    ? path.join(os.tmpdir(), `winlab-inj-${Date.now()}.txt`)
    : "C:\\Temp\\winlab-inj.txt";

  const adversarialProfiles = [
    `Lab 'Simples' & "Duplas"`,
    `Lab com aspas curvas ‘esquerda’ ’direita’ ‚baixa‚ ‛alta‛ “duplas”`,
    `Lab $(New-Item -Path '${sentinelPath}' -ItemType File) $env:USERNAME \${env:COMPUTERNAME}`,
    "Lab `n`r ; Start-Process calc.exe | Out-Null & whoami",
    `C:\\Program Files (x86)\\Lab's "App"\\bin $(1+1)`,
    `Lab #>\nNew-Item -Path '${sentinelPath}' -ItemType File\n<# Multilinha`
  ];

  assert.equal(psCommentText("A\r\n#>\n<#B").includes("#>"), false);
  assert.equal(psCommentText("A\r\n#>\n<#B").includes("\n"), false);

  for (const profileName of adversarialProfiles) {
    const cfg: Config = {
      ...defaultConfig,
      profileName,
      customAllowedPaths: [
        `C:\\Apps\\O'Reilly\\Tool $(1).exe`,
        `C:\\Apps\\Curly’s\\run.exe`
      ],
      blockedUrls: [`https://example.com/q='a"&b=$(1)`],
      allowedUrls: [`https://ok.local/$(calc)#>`]
    };

    const scripts = [
      { name: "setup.ps1", content: generateSetupScript(cfg) },
      { name: "rollback.ps1", content: generateRollbackScript(cfg) },
      { name: "liberar-wallpaper.ps1", content: generateUnlockWallpaperScript(cfg) },
      { name: "audit.ps1", content: generateAuditScript(cfg) },
      { name: "verify.ps1", content: generateVerifyScript(cfg) },
      { name: "maintenance.ps1", content: generateMaintenanceScript(cfg) },
      { name: "preflight.ps1", content: generatePreflightScript(cfg) }
    ];

    for (const script of scripts) {
      assert.doesNotMatch(
        script.content,
        /Write-Host\s+\("Perfil:\s+[^"{]/,
        `${script.name} não deve interpolar profileName diretamente em Write-Host`
      );
      assert.ok(
        script.content.includes(`$ProfileName = ${psString(profileName)}`),
        `${script.name} deve armazenar $ProfileName como literal single-quoted`
      );
    }

    if (isWindows) {
      const tempDir = makeTempDir("winlab-ps-inj-");
      try {
        for (const script of scripts) {
          const filePath = path.join(tempDir, script.name);
          writeFileSync(filePath, script.content, "utf8");
        }

        // 1. Parser PowerShell 5.1 com 0 erros em todos os 7 scripts gerados
        const parseCheck = runPowerShell(`
$ErrorActionPreference = 'Stop'
$files = Get-ChildItem -LiteralPath ${psString(tempDir)} -Filter '*.ps1'
foreach ($f in $files) {
  $tokens = $null
  $errors = $null
  [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$tokens, [ref]$errors)
  if ($errors.Count -gt 0) {
    throw ('Parse error em ' + $f.Name + ': ' + ($errors[0].Message))
  }
}
`);
        assert.equal(parseCheck.status, 0, `Falha de parse para perfil ${JSON.stringify(profileName)}: ${parseCheck.stderr}`);

        // 2. Execução do setup.ps1 em modo preview (sem -Apply) deve manter $ProfileName literal e não criar sentinel
        const execCheck = runPowerShell(`
$ErrorActionPreference = 'Stop'
. ${psString(path.join(tempDir, "setup.ps1"))} 6>$null | Out-Null
[PSCustomObject]@{
  profileName = $ProfileName
  customCount = $AllowedExecutables.Count
} | ConvertTo-Json
`);
        assert.equal(execCheck.status, 0, execCheck.stderr);
        const parsedOut = JSON.parse(execCheck.stdout);
        assert.equal(parsedOut.profileName, profileName);
        assert.equal(existsSync(sentinelPath), false, "Injeção não pode executar código");
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        if (existsSync(sentinelPath)) rmSync(sentinelPath, { force: true });
      }
    }
  }

  // Teste negativo: enums inválidos não podem ser injetados programaticamente
  assert.throws(() =>
    generateSetupScript({
      ...defaultConfig,
      enforcementMode: 'AuditOnly"; Start-Process calc #' as unknown as Config["enforcementMode"]
    })
  );
  assert.throws(() =>
    generateSetupScript({
      ...defaultConfig,
      browserUrlMode: 'Unrestricted"; Start-Process calc #' as unknown as Config["browserUrlMode"]
    })
  );
  assert.throws(() =>
    generateMaintenanceScript({
      ...defaultConfig,
      profileCleanupMode: 'Off"; Start-Process calc #' as unknown as Config["profileCleanupMode"]
    })
  );
});

test("PowerShell: scripts SMB também aceitam nomes e caminhos válidos sem interpolação insegura", () => {
  const client = generateShareClientScript({
    ...DEFAULT_NETWORK_SHARE,
    server: "PC-01",
    rootPath: "C:\\WinLab\\Lab (Turma-A)\\Alunos"
  });
  const diag = generateShareDiagnosticsScript({
    ...DEFAULT_NETWORK_SHARE,
    server: "PC-01",
    rootPath: "C:\\WinLab\\Lab (Turma-A)\\Alunos"
  });
  assert.match(client, /\$server = 'PC-01'/);
  assert.match(diag, /\$server = 'PC-01'/);
});

// ============================================================================
// TAREFA 3 — LAUNCHERS CMD
// ============================================================================

test("Launchers CMD: preservam SHA-256, UAC sob demanda e sanitizam profileName", () => {
  const dirtyConfig: Config = {
    ...defaultConfig,
    profileName: 'Lab & calc.exe | dir ^ %PATH% (teste) "1" \r\n echo HACKED'
  };
  const launcher = generateLauncherCmdScript(dirtyConfig);
  const rollbackLauncher = generateRollbackCmdScript(dirtyConfig);

  assert.doesNotMatch(launcher, /[\r\n]echo HACKED/);
  assert.doesNotMatch(rollbackLauncher, /[\r\n]echo HACKED/);
  const titleLine = launcher.split("\r\n").find((l) => l.startsWith("title ")) ?? "";
  assert.doesNotMatch(titleLine, /[&|<>^%"!\r\n]/);
  assert.match(launcher, /verify-package\.ps1/);
  assert.match(rollbackLauncher, /verify-package\.ps1/);
  assert.match(launcher, /-Verb RunAs/);
  assert.match(rollbackLauncher, /-Verb RunAs/);
  assert.match(launcher, /verify\.ps1" -PostApply/);
  assert.match(launcher, /exit \/b 3/);
  assert.match(launcher, /exit \/b 5/);
  assert.match(rollbackLauncher, /exit \/b 4/);
  assert.match(rollbackLauncher, /exit \/b 5/);
  assert.match(rollbackLauncher, /set "WINLAB_EXIT=%errorLevel%"/);
});

test("Launchers CMD: comportamento real em cmd.exe para falha de verify.ps1, cancelamento e rollback incompleto", () => {
  if (!isWindows) return;

  const tempDir = makeTempDir("winlab-cmd-");
  try {
    writeFileSync(path.join(tempDir, "manifest.json"), "{}\r\n", "utf8");
    // Substitui apenas o check de sessão elevada no arquivo de teste para simular sessão admin sem UAC interativo
    writeFileSync(
      path.join(tempDir, "Configurar-Computador.cmd"),
      generateLauncherCmdScript(defaultConfig).replace("net session >nul 2>&1", "ver >nul"),
      "utf8"
    );
    writeFileSync(
      path.join(tempDir, "Reverter-Configuracao.cmd"),
      generateRollbackCmdScript(defaultConfig).replace("net session >nul 2>&1", "ver >nul"),
      "utf8"
    );

    const runCmd = (batName: string, stdin: string) =>
      spawnSync("cmd.exe", ["/c", pathto(tempDir, batName)], {
        cwd: tempDir,
        input: stdin,
        encoding: "utf8"
      });

    // Cenário 1: verify-package.ps1 falha -> exit 2
    writeFileSync(path.join(tempDir, "verify-package.ps1"), "exit 1\r\n", "utf8");
    writeFileSync(path.join(tempDir, "setup.ps1"), "exit 0\r\n", "utf8");
    writeFileSync(path.join(tempDir, "verify.ps1"), "exit 0\r\n", "utf8");
    let res = runCmd("Configurar-Computador.cmd", "S\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.INTEGRITY_FAILURE);
    assert.match(res.stdout, /BLOQUEADO/);
    assert.doesNotMatch(res.stdout, /Concluido!/);

    // Cenário 2: operador cancela com N -> exit 5 (não-zero) e não executa setup -Apply
    writeFileSync(path.join(tempDir, "verify-package.ps1"), "exit 0\r\n", "utf8");
    writeFileSync(
      path.join(tempDir, "setup.ps1"),
      "param([switch]$Apply)\r\nif ($Apply) { throw 'Nao deveria aplicar' }\r\nexit 0\r\n",
      "utf8"
    );
    res = runCmd("Configurar-Computador.cmd", "N\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.CANCELLED);
    assert.match(res.stdout, /Operacao cancelada/);
    assert.doesNotMatch(res.stdout, /Concluido!/);

    // Cenário 3: setup -Apply passa, mas verify.ps1 FALHA -> NÃO anuncia sucesso e sai com código 3
    writeFileSync(path.join(tempDir, "setup.ps1"), "exit 0\r\n", "utf8");
    writeFileSync(path.join(tempDir, "verify.ps1"), "exit 1\r\n", "utf8");
    res = runCmd("Configurar-Computador.cmd", "S\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.VERIFICATION_FAILURE);
    assert.match(res.stdout, /verificacao final/i);
    assert.doesNotMatch(res.stdout, /Concluido!/);

    // Cenário 4: setup -Apply passa e verify.ps1 passa -> exit 0 e anuncia Concluido!
    writeFileSync(path.join(tempDir, "verify.ps1"), "exit 0\r\n", "utf8");
    res = runCmd("Configurar-Computador.cmd", "S\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.SUCCESS);
    assert.match(res.stdout, /Concluido!/);

    // Cenário 5: Reverter-Configuracao.cmd — SHA-256 inválido -> exit 2
    writeFileSync(path.join(tempDir, "verify-package.ps1"), "exit 1\r\n", "utf8");
    writeFileSync(path.join(tempDir, "rollback.ps1"), "exit 0\r\n", "utf8");
    res = runCmd("Reverter-Configuracao.cmd", "S\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.INTEGRITY_FAILURE);
    assert.match(res.stdout, /BLOQUEADO/);

    // Cenário 6: Reverter-Configuracao.cmd — cancelado -> exit 5
    writeFileSync(path.join(tempDir, "verify-package.ps1"), "exit 0\r\n", "utf8");
    res = runCmd("Reverter-Configuracao.cmd", "N\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.CANCELLED);
    assert.match(res.stdout, /Operacao cancelada/);

    // Cenário 7: Reverter-Configuracao.cmd — rollback incompleto (exit 4) -> sai com 4 (mesmo após pause!)
    writeFileSync(path.join(tempDir, "rollback.ps1"), "exit 4\r\n", "utf8");
    res = runCmd("Reverter-Configuracao.cmd", "S\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.ROLLBACK_INCOMPLETE);
    assert.match(res.stdout, /Rollback incompleto/);
    assert.doesNotMatch(res.stdout, /Rollback concluido com sucesso/);

    // Cenário 8: Reverter-Configuracao.cmd — erro geral no rollback (exit 1) -> sai com 1
    writeFileSync(path.join(tempDir, "rollback.ps1"), "exit 1\r\n", "utf8");
    res = runCmd("Reverter-Configuracao.cmd", "S\r\n");
    assert.equal(res.status, 1);
    assert.doesNotMatch(res.stdout, /Rollback concluido com sucesso/);

    // Cenário 9: Reverter-Configuracao.cmd — rollback completo -> exit 0
    writeFileSync(path.join(tempDir, "rollback.ps1"), "exit 0\r\n", "utf8");
    res = runCmd("Reverter-Configuracao.cmd", "S\r\n");
    assert.equal(res.status, CMD_EXIT_CODES.SUCCESS);
    assert.match(res.stdout, /Rollback concluido com sucesso/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("PowerShell: verify.ps1 -PostApply falha quando state.json está ausente e rollback.ps1 retorna 4 se falhar após mutação", () => {
  if (!isWindows) return;

  const tempDir = makeTempDir("winlab-ps-verify-");
  try {
    const verifyPath = path.join(tempDir, "verify.ps1");
    const rollbackPath = path.join(tempDir, "rollback.ps1");
    writeFileSync(verifyPath, generateVerifyScript(defaultConfig), "utf8");
    writeFileSync(rollbackPath, generateRollbackScript(defaultConfig), "utf8");

    // 1. verify.ps1 -PostApply sem state.json deve falhar (exit 1)
    const verifyContent = generateVerifyScript(defaultConfig)
      .replace("Assert-Administrator", "# admin mocked")
      .replace('C:\\ProgramData\\WinLab', tempDir);
    writeFileSync(verifyPath, verifyContent, "utf8");
    const vRes = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", verifyPath, "-PostApply"],
      { encoding: "utf8" }
    );
    assert.notEqual(vRes.status, 0, "verify.ps1 -PostApply deve retornar código não-zero quando state.json não existe");

    // 2. rollback.ps1 -Apply que falha depois de Restore-AppLockerBaseline deve sair com código 4
    const backupXml = path.join(tempDir, "baseline.xml");
    const regDir = path.join(tempDir, "reg");
    mkdirSync(regDir, { recursive: true });
    writeFileSync(backupXml, "<AppLockerPolicy Version='1' />", "utf8");
    writeFileSync(path.join(regDir, "Chrome.reg"), "Windows Registry Editor Version 5.00\r\n", "utf8");
    writeFileSync(
      path.join(tempDir, "state.json"),
      JSON.stringify({
        studentUser: defaultConfig.studentUser,
        adminUser: defaultConfig.adminUser,
        baselineAppLockerBackup: backupXml,
        registryBaselineDir: regDir
      }),
      "utf8"
    );

    const rbScript = generateRollbackScript(defaultConfig)
      .replace('$WinLabRoot = "C:\\ProgramData\\WinLab"', `$WinLabRoot = ${psString(tempDir)}`)
      .replace(
        "function Assert-Administrator {",
        "function Assert-Administrator {}\nfunction Assert-Administrator-Unused {"
      )
      .replace(
        "function Assert-WinLabPackageIntegrity {",
        "function Assert-WinLabPackageIntegrity {}\nfunction Assert-WinLabPackageIntegrity-Unused {"
      )
      .replace(
        "if ($Apply) {",
        "function Get-LocalUser { param($Name, $ErrorAction) $null }\nfunction Set-AppLockerPolicy { param($XmlPolicy) }\nfunction Get-CimInstance { param($ClassName, $Filter, $ErrorAction) $null }\nif ($Apply) {"
      );
    // Execute rollback with -Apply (registry backup exists, profile doesn't -> Restore-RegistryBaseline throws after Restore-AppLockerBaseline!)
    const rbFile = path.join(tempDir, "rb-harness.ps1");
    writeFileSync(rbFile, rbScript, "utf8");
    const rbRes = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", rbFile, "-Apply"],
      { encoding: "utf8" }
    );
    assert.equal(rbRes.status, 4, `Esperado exit 4 em rollback incompleto, obtido ${rbRes.status}: ${rbRes.stdout} ${rbRes.stderr}`);
    assert.match(rbRes.stdout + rbRes.stderr, /ROLLBACK INCOMPLETO/);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function pathto(dir: string, file: string): string {
  return path.join(dir, file);
}
