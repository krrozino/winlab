import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NETWORK_SHARE, generateShareClientScript, generateShareServerScript, validateNetworkShare } from "../src/lib/network-share";

const plan = { ...DEFAULT_NETWORK_SHARE, server: "PC-SERVIDOR" };

test("pasta de alunos: plano LAN valido gera scripts separados", () => {
  assert.deepEqual(validateNetworkShare(plan), []);
  const server = generateShareServerScript(plan);
  const client = generateShareClientScript(plan);
  assert.match(server, /New-SmbShare -Name/);
  assert.match(server, /S-1-5-11/);
  assert.match(server, /Set-Acl/);
  assert.match(client, /New-PSDrive/);
  assert.match(client, /\\\\PC-SERVIDOR\\Alunos/);
  assert.doesNotMatch(client, /New-SmbShare/);
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

test("pasta de alunos: não cria compartilhamento anônimo", () => {
  const server = generateShareServerScript(plan);
  assert.doesNotMatch(server, /-FullAccess 'Everyone'/);
  assert.match(server, /New-SmbShare/);
  assert.match(server, /Get-SmbShare/);
});
