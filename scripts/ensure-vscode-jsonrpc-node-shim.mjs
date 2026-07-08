import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptDir, "..");
const packageDir = join(projectRoot, "node_modules", "vscode-jsonrpc");
const nodeJsEntry = join(packageDir, "node.js");
const extensionlessEntry = join(packageDir, "node");
const shimContent = 'export * from "./node.js";\n';

await access(nodeJsEntry);
await mkdir(packageDir, { recursive: true });

let currentContent = null;
try {
  currentContent = await readFile(extensionlessEntry, "utf-8");
} catch (err) {
  if (err?.code !== "ENOENT") {
    throw err;
  }
}

if (currentContent !== shimContent) {
  await writeFile(extensionlessEntry, shimContent, "utf-8");
}
