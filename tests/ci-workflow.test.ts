import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(
  fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)),
  "utf8"
);

const installerScript = readFileSync(
  fileURLToPath(new URL("../desktop/packaging/winlab.iss", import.meta.url)),
  "utf8"
);

const executorClient = readFileSync(
  fileURLToPath(new URL("../desktop/src/WinLab.Desktop/Services/ElevatedExecutorClient.cs", import.meta.url)),
  "utf8"
);

test("CI must never upload artifacts after a failed validation step", () => {
  assert.equal(
    workflow.includes("if: always()"),
    false,
    "artifact uploads must not run when any earlier build/validation step failed"
  );
});

test("CI artifact uploads must fail when no files are produced", () => {
  const occurrences = workflow.split("if-no-files-found: error").length - 1;
  assert.equal(
    occurrences,
    2,
    "both the desktop publish and the installer uploads must fail on missing files"
  );
});

test("installer upload must be preceded by its validation step", () => {
  const validation = workflow.indexOf("Validate Installer Artifact");
  const upload = workflow.indexOf("Upload Installer Artifact");
  assert.notEqual(validation, -1, "installer validation step must exist");
  assert.notEqual(upload, -1, "installer upload step must exist");
  assert.ok(
    validation < upload,
    "installer validation must run before the installer upload"
  );
});

test("published executable validation must precede installer compilation", () => {
  const publishedValidation = workflow.indexOf("Validate Published Artifacts");
  const installerCompilation = workflow.indexOf("Compile Inno Setup Installer");
  assert.notEqual(publishedValidation, -1, "published artifact validation step must exist");
  assert.notEqual(installerCompilation, -1, "installer compilation step must exist");
  assert.ok(
    publishedValidation < installerCompilation,
    "the installer must only be built after the published package passed validation"
  );
});

test("CI must publish the elevated executor helper into the packaged output", () => {
  const helperPublish = workflow.indexOf("WinLab.Executor/WinLab.Executor.csproj");
  assert.notEqual(helperPublish, -1, "a publish step for WinLab.Executor must exist");
  const helperPublishBlock = workflow.slice(helperPublish, helperPublish + 400);
  assert.match(helperPublishBlock, /artifacts\/publish\/desktop/, "the helper must be published into the same directory the installer packages");

  const desktopPublish = workflow.indexOf("WinLab.Desktop.csproj -c Release -r win-x64");
  const validation = workflow.indexOf("Validate Published Artifacts");
  assert.ok(desktopPublish !== -1 && helperPublish > desktopPublish, "helper publish must follow the desktop publish");
  assert.ok(helperPublish < validation, "helper publish must precede artifact validation");
});

const publishedValidationBlock = workflow.slice(
  workflow.indexOf("Validate Published Artifacts"),
  workflow.indexOf("Compile Inno Setup Installer")
);

test("artifact validation must reject a published package without the helper", () => {
  assert.match(publishedValidationBlock, /WinLab\.Executor\.exe/, "validation must reference the helper executable");
  assert.match(publishedValidationBlock, /Missing elevated executor helper/, "a missing helper must fail the job");
  assert.match(publishedValidationBlock, /exit 1/, "validation failures must abort the workflow");
});

test("the helper must have a SHA-256 sidecar produced by validation", () => {
  const helperHashIndex = publishedValidationBlock.indexOf("Get-FileHash $helper");
  assert.notEqual(helperHashIndex, -1, "validation must hash the helper executable");
  const sidecar = publishedValidationBlock.slice(helperHashIndex);
  assert.match(sidecar, /\$helper\.sha256/, "the helper hash must be persisted to a sidecar file");
});

test("the installer must package the directory where the helper is published", () => {
  assert.match(installerScript, /Source: "\.\.\\.\.\\artifacts\\publish\\desktop\\\*"/, "the installer must pack the full published output");
  assert.match(installerScript, /DestDir: "\{app\}"/, "published output must land in the installation root");
});

test("the helper location the Desktop probes must match the distributed location", () => {
  assert.match(executorClient, /Path\.Combine\(AppDomain\.CurrentDomain\.BaseDirectory, "WinLab\.Executor\.exe"\)/, "the Desktop must probe the helper at the installation root");
  const appDir = installerScript.match(/DefaultDirName=\{autopf\}\\WinLab/);
  assert.notEqual(appDir, null, "the installer must use a fixed installation root so BaseDirectory is predictable");
});
