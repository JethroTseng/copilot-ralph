# Progress

## 本次處理內容

- 已先備份原本可正常運作的全域 `copilot-ralph`
- 已將目前 repo 建置後用 `npm link` 切換為最新版本
- 已驗證目前啟用的 `copilot-ralph` 來自這個 repo 的最新 build

## 備份位置

- `C:\Users\1418\AppData\Local\copilot-ralph-backups\20260309-1024`

備份內容包含：

- 全域 npm 套件：`@willh/copilot-ralph`
- 全域 shim：`copilot-ralph.ps1`、`copilot-ralph.cmd`、`copilot-ralph`
- 獨立執行檔：`C:\Users\1418\AppData\Local\copilot-ralph\copilot-ralph.exe`

## 目前啟用版本

- Version: `0.3.2`
- Commit: `c27a1fc`
- BuildDate: `2026-03-09T10:25:25.500Z`

目前全域指令來源：

- `C:\Users\1418\AppData\Roaming\npm\copilot-ralph.ps1`

目前全域 npm 套件位置已透過 junction 指向：

- `C:\Users\1418\Documents\projects\copilot-ralph`

## 驗證結果

已成功執行：

```powershell
copilot-ralph run --dry-run "verify install"
```

表示目前 link 後的版本可正常啟動。

## 額外處理

為了讓目前 link 後的版本在此 Node.js 環境下能正常執行，已補上一個本機 runtime shim：

- `node_modules\vscode-jsonrpc\node`

內容會轉出到：

- `vscode-jsonrpc/node.js`

## 如需回復舊版

1. 解除目前的 link：

   ```powershell
   npm unlink -g @willh/copilot-ralph
   ```

2. 將備份目錄中的內容複製回原本位置：

   - `global-package` -> `C:\Users\1418\AppData\Roaming\npm\node_modules\@willh\copilot-ralph`
   - `copilot-ralph.ps1` -> `C:\Users\1418\AppData\Roaming\npm\copilot-ralph.ps1`
   - `copilot-ralph.cmd` -> `C:\Users\1418\AppData\Roaming\npm\copilot-ralph.cmd`
   - `copilot-ralph` -> `C:\Users\1418\AppData\Roaming\npm\copilot-ralph`
   - `copilot-ralph.exe` -> `C:\Users\1418\AppData\Local\copilot-ralph\copilot-ralph.exe`

3. 重新開啟終端機後再次確認：

   ```powershell
   copilot-ralph run --dry-run "restore check"
   ```
