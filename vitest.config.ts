import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const vscodeJsonRpcNodeShim = fileURLToPath(
  new URL("./tests/shims/vscode-jsonrpc-node.ts", import.meta.url)
);

export default defineConfig({
  resolve: {
    alias: {
      "vscode-jsonrpc/node": vscodeJsonRpcNodeShim
    }
  },
  test: {
    server: {
      deps: {
        inline: ["@github/copilot-sdk", "vscode-jsonrpc"]
      }
    },
    environment: "node",
    include: ["tests/**/*.test.ts"]
  }
});
