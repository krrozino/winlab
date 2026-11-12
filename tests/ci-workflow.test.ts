import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workflow = readFileSync(
  fileURLToPath(new URL("../.github/workflows/ci.yml", import.meta.url)),
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
