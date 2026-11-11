import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const wwwrootDir = path.join(rootDir, "desktop", "src", "WinLab.Desktop", "wwwroot");
const desktopHtml = path.join(wwwrootDir, "desktop", "index.html");

if (!fs.existsSync(wwwrootDir)) {
  console.error(`ERROR: wwwroot directory does not exist at ${wwwrootDir}`);
  process.exit(1);
}

if (!fs.existsSync(desktopHtml)) {
  console.error(`ERROR: desktop/index.html was not generated at ${desktopHtml}`);
  process.exit(1);
}

const stats = fs.statSync(desktopHtml);
if (stats.size === 0) {
  console.error(`ERROR: desktop/index.html is empty at ${desktopHtml}`);
  process.exit(1);
}

console.log(`✓ Offline static assets verified: ${desktopHtml} (${stats.size} bytes)`);
