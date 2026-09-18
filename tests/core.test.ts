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
import {
  applyInventorySuggestions,
  parseInventoryJson,
  suggestedAllowedApps
} from "../src/lib/inventory";
import { generateInventoryScannerScript } from "../src/lib/inventory-script";

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


test("parses pc inventory and suggests detected catalog apps", () => {
  const inventory = parseInventoryJson(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "2026-09-18T00:00:00-03:00",
      computerName: "LAB-01",
      windows: {
        caption: "Microsoft Windows 11 Pro",
        version: "10.0.26100",
        buildNumber: "26100",
        architecture: "64 bits"
      },
      appLocker: {
        available: true,
        applicationIdentityStatus: "Running"
      },
      localUsers: [
        { name: "Aluno", enabled: true, isAdministrator: false },
        { name: "Admin", enabled: true, isAdministrator: true }
      ],
      knownApps: [
        {
          id: "chrome",
          label: "Google Chrome",
          found: true,
          path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
        },
        {
          id: "vscode",
          label: "Visual Studio Code",
          found: true,
          path: "C:\\Program Files\\Microsoft VS Code\\Code.exe"
        }
      ],
      installedApps: [
        {
          name: "Google Chrome",
          version: "140.0",
          publisher: "Google LLC",
          installLocation: "C:\\Program Files\\Google\\Chrome"
        }
      ]
    })
  );

  assert.equal(inventory.computerName, "LAB-01");
  assert.equal(inventory.appLocker.available, true);
  assert.deepEqual(suggestedAllowedApps(inventory, defaultConfig), ["vscode"]);
});

test("applies inventory suggestions without removing existing allowlist apps", () => {
  const inventory = parseInventoryJson(
    JSON.stringify({
      schemaVersion: 1,
      generatedAt: "",
      computerName: "LAB-02",
      windows: {
        caption: "Windows 11 Pro",
        version: "10.0",
        buildNumber: "26100",
        architecture: "64 bits"
      },
      appLocker: {
        available: true,
        applicationIdentityStatus: "Stopped"
      },
      localUsers: [],
      knownApps: [
        { id: "vlc", label: "VLC Media Player", found: true, path: "C:\\Program Files\\VideoLAN\\VLC\\vlc.exe" }
      ],
      installedApps: []
    })
  );

  const updated = applyInventorySuggestions(defaultConfig, inventory);
  assert.ok(updated.allowedApps.includes("chrome"));
  assert.ok(updated.allowedApps.includes("vlc"));
});

test("inventory scanner avoids personal content and writes portable json", () => {
  const script = generateInventoryScannerScript();

  assert.match(script, /winlab-inventory-/);
  assert.match(script, /CurrentVersion\\Uninstall/);
  assert.match(script, /Get-LocalUser/);
  assert.match(script, /ConvertTo-Json/);
  assert.doesNotMatch(script, /Get-Content .*Documents/i);
  assert.doesNotMatch(script, /password/i);
});
