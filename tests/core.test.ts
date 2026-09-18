import assert from "node:assert/strict";
import test from "node:test";

import { defaultConfig } from "../src/lib/default-config";
import { parseConfigJson, serializeConfig } from "../src/lib/config-io";
import {
  generateConfigJson,
  generateSetupScript,
  generateVerifyScript
} from "../src/lib/generator";
import { getConfigReview } from "../src/lib/review";

test("imports legacy 0.2 config without schemaVersion", () => {
  const imported = parseConfigJson(
    JSON.stringify({
      ...defaultConfig,
      profileName: "Laboratório Teste",
      enforcementMode: "Enabled"
    })
  );

  assert.equal(imported.profileName, "Laboratório Teste");
  assert.equal(imported.enforcementMode, "Enabled");
});

test("ignores unknown application ids during import", () => {
  const imported = parseConfigJson(
    JSON.stringify({
      ...defaultConfig,
      allowedApps: ["chrome", "programa-inventado"]
    })
  );

  assert.deepEqual(imported.allowedApps, ["chrome"]);
});

test("serializes schemaVersion 1", () => {
  const parsed = JSON.parse(serializeConfig(defaultConfig));
  assert.equal(parsed.schemaVersion, 1);
});

test("generated setup keeps administrator unrestricted and student targeted", () => {
  const script = generateSetupScript(defaultConfig);

  assert.match(script, /S-1-5-32-544/);
  assert.match(script, /Registry::HKEY_USERS/);
  assert.match(script, /AuditOnly/);
  assert.match(script, /MicrolinsAdmin/);
});

test("verify script checks AppLocker and configured executables", () => {
  const script = generateVerifyScript(defaultConfig);

  assert.match(script, /Get-AppLockerPolicy/);
  assert.match(script, /Application Identity/);
  assert.match(script, /chrome\.exe/i);
});

test("review warns about user-writable allowlist paths", () => {
  const review = getConfigReview({
    ...defaultConfig,
    customAllowedPaths: ["C:\\Users\\Aluno\\Downloads\\app.exe"]
  });

  assert.ok(review.some((item) => item.level === "warning"));
});

test("generated config json uses schemaVersion", () => {
  const parsed = JSON.parse(generateConfigJson(defaultConfig));
  assert.equal(parsed.schemaVersion, 1);
});
