import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

process.env.WINLAB_DESKTOP_EXPORT = "true";

const nextBin = require.resolve("next/dist/bin/next");
const build = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: process.env,
  cwd: rootDir
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const verify = spawnSync(process.execPath, [path.join(__dirname, "verify-desktop-export.mjs")], {
  stdio: "inherit",
  env: process.env,
  cwd: rootDir
});

process.exit(verify.status ?? 1);
