import assert from "node:assert/strict";
import test from "node:test";
import { parseConfigJson, serializeConfig } from "../src/lib/config-io";
import { defaultConfig } from "../src/lib/default-config";
import { generateRollbackScript, generateSetupScript, generateVerifyScript } from "../src/lib/generator";
import { getBasePackageFiles } from "../src/lib/package-integrity";
import { getConfigErrors } from "../src/lib/validation";

test("browser lists accept supported site patterns and flag malformed entries", () => {
  const config = {
    ...defaultConfig,
    browserUrlMode: "BlockList" as const,
    blockedUrls: ["exemplo.edu.br", "https://*.example.org/*", "https://bad.example:99999", "https://bad.example/ com espaço"],
    allowedUrls: ["https://.portal.exemplo.edu.br:443/aulas", "http://[::1]:8080/", "javascript:alert(1)"],
    chromeAllowedExtensionIds: ["abcdefghijklmnopabcdefghijklmnop", "invalid-id"]
  };
  assert.deepEqual(getConfigErrors(config).map(({ field }) => field), [
    "blockedUrls", "blockedUrls", "allowedUrls", "chromeAllowedExtensionIds"
  ]);
});

test("browser exceptions round-trip and generate per-browser policies with rollback coverage", () => {
  const config = {
    ...defaultConfig,
    chromeAllowedExtensionIds: ["abcdefghijklmnopabcdefghijklmnop"],
    edgeAllowedExtensionIds: ["ponmlkjihgfedcbaponmlkjihgfedcba"],
    browserUrlMode: "BlockList" as const,
    blockedUrls: ["https://*.example.org/*"]
  };
  assert.deepEqual(parseConfigJson(serializeConfig(config)), config);
  const setup = generateSetupScript(config);
  for (const policy of ["BrowserAddProfileEnabled", "InPrivateModeAvailability", "ExtensionInstallAllowlist"]) {
    assert.ok(setup.includes(policy), policy);
    assert.ok(generateRollbackScript(config).includes(policy), policy);
  }
  assert.match(setup, /\$ChromeAllowedExtensionIds = @\(\s*'abcdefghijklmnopabcdefghijklmnop'/);
  assert.match(setup, /\$EdgeAllowedExtensionIds = @\(\s*'ponmlkjihgfedcbaponmlkjihgfedcba'/);
  assert.match(setup, /\$BlockedUrls = @\(\s*'https:\/\/example\.org\//);
});

test("custom paths reject folders and student locations before export", () => {
  const config = {
    ...defaultConfig,
    customAllowedPaths: [
      "C:\\Program Files\\Aulas\\curso.exe",
      "C:\\Users\\Aluno\\Downloads\\app.exe",
      "D:\\Aplicativos\\*",
      "C:\\Apps\\..\\example.exe"
    ]
  };
  assert.equal(getConfigErrors(config).filter(({ field }) => field === "customAllowedPaths").length, 3);
  const setup = generateSetupScript(config);
  assert.ok(setup.includes(config.customAllowedPaths[0]));
  for (const path of config.customAllowedPaths.slice(1)) assert.ok(!setup.includes(path));
});

test("standalone scripts keep UTF-8 BOM and require explicit confirmation before mutation", () => {
  const setup = generateSetupScript(defaultConfig, { confirmApply: true });
  const rollback = generateRollbackScript(defaultConfig, { confirmApply: true });
  const verify = generateVerifyScript(defaultConfig);
  for (const script of [setup, rollback, verify]) {
    assert.deepEqual(Buffer.from(script).subarray(0, 3), Buffer.from([0xef, 0xbb, 0xbf]));
  }
  assert.match(setup, /else \{\s+if \(\(Read-Host "Aplicar este perfil[^"]*"\) -ne "S"\)[\s\S]*?return[\s\S]*?Install-WinLabProfile/);
  assert.match(rollback, /\$state = Get-WinLabRollbackState\s+if \(\(Read-Host "Reverter[^"]*"\) -ne "S"\)[\s\S]*?return[\s\S]*?Restore-AppLockerBaseline -State/);
  const packaged = getBasePackageFiles(defaultConfig);
  for (const name of ["setup.ps1", "rollback.ps1"]) {
    assert.doesNotMatch(packaged.find((item) => item.name === name)!.content, /Digite S para confirmar/);
  }
});
