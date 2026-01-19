import { execSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const versionFile = join(projectRoot, "dist", "version", "version-info.js");
const packageJsonFile = join(projectRoot, "package.json");

// 讀取 package.json 取得版本號
const packageJson = JSON.parse(await readFile(packageJsonFile, "utf-8"));
const version = packageJson.version;

// 取得 Git commit hash
let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
} catch (err) {
  console.warn("Warning: Could not get git commit hash");
}

// 取得建置時間 (ISO 8601 格式)
const buildDate = new Date().toISOString();

// 讀取已編譯的 version-info.js
let content = await readFile(versionFile, "utf-8");

// 替換預設值
content = content.replace(
  /export let Version = "dev";/,
  `export let Version = "${version}";`
);
content = content.replace(
  /export let Commit = "unknown";/,
  `export let Commit = "${commit}";`
);
content = content.replace(
  /export let BuildDate = "unknown";/,
  `export let BuildDate = "${buildDate}";`
);

// 寫回檔案
await writeFile(versionFile, content, "utf-8");

console.log(`✓ Injected version info: version=${version}, commit=${commit}, buildDate=${buildDate}`);
