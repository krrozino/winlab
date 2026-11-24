import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DEFAULT_NETWORK_SHARE,
  generateShareClientScript,
  generateShareDiagnosticsScript,
  generateShareServerScript,
  validateNetworkShare
} from "../src/lib/network-share";
import { buildWinLabPackageFiles, verifyPackageFiles, PackageManifest } from "../src/lib/package-integrity";
import { defaultConfig } from "../src/lib/default-config";
import { WebPackageWizard } from "../src/components/WebPackageWizard";

const plan = { ...DEFAULT_NETWORK_SHARE, server: "PC-SERVIDOR" };

test("pasta de alunos (Modelo A coletivo): plano LAN valido gera scripts separados", () => {
  assert.deepEqual(validateNetworkShare(plan), []);
  const server = generateShareServerScript(plan);
  const client = generateShareClientScript(plan);
  const diag = generateShareDiagnosticsScript(plan);
  assert.match(server, /New-SmbShare -Name/);
  assert.match(server, /S-1-5-11/);
  assert.match(server, /Set-Acl/);
  assert.match(client, /New-PSDrive/);
  assert.match(client, /Test-NetConnection -ComputerName \$server -Port 445/);
  assert.match(client, /\\\\PC-SERVIDOR\\Alunos/);
  assert.doesNotMatch(client, /New-SmbShare/);
  assert.match(diag, /Diagnostico de Rede SMB WinLab/);
});

test("pasta de alunos (Modelo B individual por aluno): isola ACLs NTFS com heranca desativada", () => {
  const perStudentPlan = {
    ...plan,
    model: "per_student" as const,
    studentAccounts: ["Aluno01", "Aluno02"]
  };
  assert.deepEqual(validateNetworkShare(perStudentPlan), []);

  const server = generateShareServerScript(perStudentPlan);
  const client = generateShareClientScript(perStudentPlan);

  assert.match(server, /SetAccessRuleProtection\(\$true, \$false\)/);
  assert.match(server, /'Aluno01', 'Aluno02'/);
  assert.match(server, /ReadAndExecute/);
  assert.match(client, /Join-Path \$baseUnc \$env:USERNAME/);

  // Rejects empty or administrative accounts in per_student mode
  assert.ok(
    validateNetworkShare({ ...perStudentPlan, studentAccounts: [] }).length > 0
  );
  assert.ok(
    validateNetworkShare({ ...perStudentPlan, studentAccounts: ["Administrador"] }).length > 0
  );
  assert.ok(
    validateNetworkShare({ ...perStudentPlan, studentAccounts: ["Aluno01", "aluno01"] }).length > 0
  );
});

test("pasta de alunos: rejeita nomes e caminhos injetaveis", () => {
  for (const name of ["a;Start-Process", "a b", "share'evil"]) {
    const invalid = { ...plan, shareName: name };
    assert.ok(validateNetworkShare(invalid).length);
    assert.throws(() => generateShareServerScript(invalid));
  }
  for (const rootPath of ["C:\\WinLab\\..\\outro", "\\\\SERVER\\Alunos", "relative\\share", "C:\\A'B"]) {
    assert.ok(validateNetworkShare({ ...plan, rootPath }).length);
  }
});

test("pasta de alunos: não cria compartilhamento anônimo nem ativa SMB1", () => {
  const server = generateShareServerScript(plan);
  assert.doesNotMatch(server, /-FullAccess 'Everyone'/);
  assert.doesNotMatch(server, /Enable-WindowsOptionalFeature.*SMB1/i);
  assert.match(server, /New-SmbShare/);
  assert.match(server, /Get-SmbShare/);
});

test("pacote pós-formatação inclui Configurar-Computador.cmd e Reverter-Configuracao.cmd verificados por SHA-256", async () => {
  const files = await buildWinLabPackageFiles(defaultConfig, {
    extraFiles: [
      { name: "servidor-pasta-smb.ps1", content: generateShareServerScript(plan) },
      { name: "estacao-mapear-smb.ps1", content: generateShareClientScript(plan) }
    ]
  });

  const launcher = files.find((f) => f.name === "Configurar-Computador.cmd");
  const rollbackLauncher = files.find((f) => f.name === "Reverter-Configuracao.cmd");
  const manifestFile = files.find((f) => f.name === "manifest.json");

  assert.ok(launcher, "Must include Configurar-Computador.cmd");
  assert.ok(rollbackLauncher, "Must include Reverter-Configuracao.cmd");
  assert.ok(manifestFile, "Must include manifest.json");

  assert.match(launcher.content, /verify-package\.ps1/);
  assert.match(launcher.content, /setup\.ps1" -Apply/);
  assert.match(launcher.content, /-Verb RunAs/);
  assert.doesNotMatch(launcher.content, /Set-ExecutionPolicy/i);

  const manifest = JSON.parse(manifestFile.content) as PackageManifest;
  assert.ok(manifest.files.some((f) => f.name === "Configurar-Computador.cmd"));
  assert.ok(manifest.files.some((f) => f.name === "Reverter-Configuracao.cmd"));
  assert.ok(manifest.files.some((f) => f.name === "servidor-pasta-smb.ps1"));

  const nonManifestFiles = files.filter((f) => f.name !== "manifest.json");
  const verification = await verifyPackageFiles(manifest, nonManifestFiles);
  assert.equal(verification.ok, true);
});

test("WinLab Web renders dedicated 8-step post-format wizard distinct from DesktopControlCenter", () => {
  const html = renderToStaticMarkup(
    React.createElement(WebPackageWizard, {
      config: defaultConfig,
      setConfig: () => {}
    })
  );

  assert.match(html, /WINLAB WEB/);
  assert.match(html, /Prepare computadores recém-formatados/);
  assert.match(html, /1\. Ambiente e perfil/);
  assert.match(html, /6\. Rede e pasta SMB/);
  assert.match(html, /8\. Gerar pacote ZIP/);
});
