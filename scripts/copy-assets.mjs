import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const source = join(projectRoot, "src", "core", "system.md");
const dest = join(projectRoot, "dist", "core", "system.md");

await mkdir(dirname(dest), { recursive: true });
await copyFile(source, dest);
