# Copilot Ralph Node

[中文](README.md) | [English](README.en.md)

以 Node.js 實作的 Ralph 迭代式 AI 開發迴圈工具，透過 GitHub Copilot SDK 與事件串流，讓 AI 依照同一個任務反覆迭代，直到達成完成條件或達到限制。

## 使用 Release 獨立可執行檔（免安裝 Node/Bun）

Create release 會提供跨平台的獨立可執行檔，下載後放到 PATH 即可使用。

### macOS（Apple Silicon / Intel）

Apple Silicon 請用 `arm64`，Intel 請用 `x64`（可用 `uname -m` 確認）。

```bash
# Apple Silicon (M1/M2/M3)
curl -L -o copilot-ralph https://github.com/doggy8088/copilot-ralph/releases/latest/download/copilot-ralph-macos-arm64

# Intel
# curl -L -o copilot-ralph https://github.com/doggy8088/copilot-ralph/releases/latest/download/copilot-ralph-macos-x64

chmod +x copilot-ralph
sudo mv copilot-ralph /usr/local/bin/
```

### Linux x64

```bash
curl -L -o copilot-ralph https://github.com/doggy8088/copilot-ralph/releases/latest/download/copilot-ralph-linux-x64
chmod +x copilot-ralph
sudo mv copilot-ralph /usr/local/bin/
```

### Windows（PowerShell）

```powershell
$dest = "$env:LOCALAPPDATA\\copilot-ralph"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Invoke-WebRequest -Uri "https://github.com/doggy8088/copilot-ralph/releases/latest/download/copilot-ralph.exe" -OutFile "$dest\\copilot-ralph.exe"
[Environment]::SetEnvironmentVariable("Path", $env:Path + ";$dest", "User")
```

### macOS 無法執行（安全性/權限）

若出現「已損毀」、「無法開啟，因為無法驗證開發者」或直接被系統 `killed`，多半是檔案帶有 quarantine 屬性或尚未被 macOS 放行。

請先走 **官方安全流程**（推薦）：

1. 於 Finder 對檔案按右鍵 → **打開**，或
2. 到 **系統設定 → 隱私權與安全性**，在底部按 **仍要打開**

若上述方式仍無法執行，再使用以下方式移除 quarantine（屬於繞過 Gatekeeper）：

```bash
xattr -d com.apple.quarantine /path/to/copilot-ralph
chmod +x /path/to/copilot-ralph
```

## 本機安裝與測試

### 前置需求

- Node.js 18 或以上版本
- Bun（建置與測試用）
- npm 或 yarn
- GitHub Copilot 帳號與授權（需要有效的 Copilot 訂閱）

### 安裝步驟

1. **複製或下載專案**

   ```bash
   git clone <repository-url>
   cd copilot-ralph-node
   ```

2. **安裝相依套件**

   ```bash
   npm install
   ```

3. **執行型別檢查**

   ```bash
   npm run typecheck
   ```

4. **執行單元測試**

   ```bash
   bun run test
   ```

   或使用 watch 模式進行開發：

   ```bash
   bun run test:watch
   ```

### 開發模式執行

使用 `tsx` 直接執行 TypeScript 原始碼（無需先建置）：

```bash
npm run dev -- run "請加上單元測試"
```

### 建置與執行（發行模式）

1. **建置專案**

   ```bash
   bun run build
   ```

   建置後的檔案會輸出至 `dist/` 目錄。

2. **執行建置後的 CLI**

   ```bash
   node dist/cli-entry.js run "請加上單元測試"
   ```

### 常用範例

```bash
# 指定迭代次數與完成短語
node dist/cli-entry.js run --max-iterations 3 --promise "Task complete!" "修正登入流程"

# 讀取 Markdown 或文字檔案作為 prompt
node dist/cli-entry.js run task.md
```

### 本機 Global 安裝（開發用）

在開發期間，你可以將此工具安裝為全域指令，這樣就能在任何目錄直接使用 `copilot-ralph` 指令。

### 全域安裝（一般使用）

```bash
npm i -g @willh/copilot-ralph
```

#### 方法一：使用 npm link（推薦）

這是最適合開發階段的方法，程式碼修改後會立即生效，無需重新安裝。

```bash
# 1. 先建置專案
bun run build

# 2. 建立全域符號連結
npm link

# 3. 現在可以在任何目錄執行
copilot-ralph run "你的任務"
```

**解除安裝：**

```bash
# 在專案目錄下執行
npm unlink

# 或者在任何目錄執行
npm unlink -g @willh/copilot-ralph
```

#### 方法二：使用 npm install -g（正式測試用）

這個方法會實際安裝到全域，適合測試正式安裝後的行為。

```bash
# 1. 先建置專案
bun run build

# 2. 全域安裝（從當前目錄）
npm install -g .

# 3. 現在可以在任何目錄執行
copilot-ralph run "你的任務"
```

**解除安裝：**

```bash
npm uninstall -g @willh/copilot-ralph
```

#### 注意事項

- 使用 `npm link` 後，每次修改原始碼都需要重新執行 `bun run build`，才能讓全域指令使用到最新的程式碼。
- 如果遇到權限問題（Windows 需要管理員權限，macOS/Linux 可能需要 `sudo`），請以管理員身份執行終端機。
- 開發完成後記得解除連結，避免與正式發布的版本衝突。

## 運作原理（概觀）

1. CLI 解析參數與 prompt，組成 `LoopConfig`。
2. 依設定建立 Copilot SDK Client 並啟動 session。
3. 啟動 `LoopEngine`，進入迭代迴圈。
4. 每輪迭代傳送 prompt，讀取 SDK 事件串流（文字、工具呼叫、錯誤）。
5. 偵測完成短語（promise）或達到條件後結束。
6. 輸出摘要與退出碼。

完整細節可參考 `docs/運作流程詳解.md`。

## 主要功能

- 迭代式 AI 迴圈執行
- 事件串流即時輸出
- 完成短語（promise）偵測
- 工具呼叫事件顯示
- 逾時與取消處理

## 使用方式

### 基本指令

```bash
copilot-ralph run "<你的任務描述>"
```

### 參數說明

- `--max-iterations`：最大迭代次數（預設 10）
- `--timeout`：最大執行時間（預設 30m）
- `--promise`：完成短語（預設 `任務完成！🥇`）
- `--model`：模型名稱（預設 `gpt-5-mini`）
- `--working-dir`：工作目錄（預設 `.`）
- `--streaming`：是否開啟串流（預設 `true`）
- `--system-prompt`：自訂系統提示（可為文字、Markdown 或 .txt 檔案）
- `--system-prompt-file`：系統提示模板檔案路徑（支援 `{{PROMISE}}`；與 `--system-prompt` 同時使用時會被忽略）
- `--system-prompt-mode`：`append` 或 `replace`（搭配 `--system-prompt` 或 `--system-prompt-file`）
- `--log-level`：`debug`、`info`、`warn`、`error`
- `--session-id`：指定 Copilot session ID 以便在下一次執行時延續上下文
- `--dry-run`：僅顯示設定，不執行迴圈
- `--azure-endpoint`：Azure OpenAI 端點 URL
- `--azure-api-key`：Azure OpenAI API 金鑰
- `--azure-api-version`：Azure OpenAI API 版本（預設 `2024-10-21`）
- `--azure-wire-api`：API 格式，`completions` 或 `responses`（預設 `completions`）

## 自訂 AI Provider（BYOK）

Copilot Ralph 支援「自帶金鑰」（Bring Your Own Key, BYOK）模式，讓你可以使用自己的 Azure OpenAI、OpenAI 或 Anthropic API，而非預設的 GitHub Copilot API。

### Azure OpenAI

#### AZURE_OPENAI_ENDPOINT 格式說明

`AZURE_OPENAI_ENDPOINT` 是你的 Azure OpenAI 資源端點 URL，格式如下：

```
https://<your-resource-name>.openai.azure.com/
```

**範例：**

| 資源名稱 | 端點 URL |
|----------|----------|
| `my-openai` | `https://my-openai.openai.azure.com/` |
| `contoso-ai` | `https://contoso-ai.openai.azure.com/` |
| `duotify-ai-coding-agent` | `https://duotify-ai-coding-agent.openai.azure.com/` |

> **注意**：結尾的 `/` 可加可不加，系統會自動處理。

你可以在 Azure Portal 的 Azure OpenAI 資源頁面 → 「Keys and Endpoint」找到此端點。

#### Deployment Name（部署名稱）

在 Azure OpenAI 中，**Deployment Name 就是 `--model` 參數的值**。當你在 Azure Portal 建立模型部署時設定的名稱，就是要傳入 `--model` 的值。

例如：
- 如果你在 Azure 建立了一個名為 `gpt-4o-deployment` 的部署，則使用 `--model gpt-4o-deployment`
- 如果部署名稱是 `my-gpt-4o`，則使用 `--model my-gpt-4o`

#### 方法一：使用環境變數（推薦）

將金鑰存放在環境變數中，避免在命令列中暴露敏感資訊。

```bash
# 設定環境變數
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
export AZURE_OPENAI_API_KEY="your-api-key"
export AZURE_OPENAI_API_VERSION="2024-10-21"  # 可選，預設為 2024-10-21
export AZURE_OPENAI_WIRE_API="completions"    # 可選，預設為 completions

# 執行命令（--model 填入你的 deployment name）
copilot-ralph run --model your-deployment-name "請幫我加上單元測試"
```

Windows PowerShell：

```powershell
$env:AZURE_OPENAI_ENDPOINT = "https://your-resource.openai.azure.com/"
$env:AZURE_OPENAI_API_KEY = "your-api-key"
$env:AZURE_OPENAI_API_VERSION = "2024-10-21"
$env:AZURE_OPENAI_WIRE_API = "completions"

copilot-ralph run --model your-deployment-name "請幫我加上單元測試"
```

Windows CMD：

```cmd
set AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
set AZURE_OPENAI_API_KEY=your-api-key
set AZURE_OPENAI_API_VERSION=2024-10-21
set AZURE_OPENAI_WIRE_API=completions

copilot-ralph run --model your-deployment-name "請幫我加上單元測試"
```

#### 方法二：使用 CLI 參數

```bash
copilot-ralph run \
  --model your-deployment-name \
  --azure-endpoint "https://your-resource.openai.azure.com/" \
  --azure-api-key "your-api-key" \
  --azure-api-version "2024-10-21" \
  --azure-wire-api "completions" \
  "請幫我加上單元測試"
```

> **注意**：CLI 參數的優先順序高於環境變數。

#### 使用 Responses API

如果你要使用 Azure OpenAI 的 **Responses API**（而非傳統的 Chat Completions API），請將 `wireApi` 設為 `responses`：

```bash
# 環境變數方式
export AZURE_OPENAI_WIRE_API="responses"

# 或 CLI 參數方式
copilot-ralph run \
  --model your-deployment-name \
  --azure-endpoint "https://your-resource.openai.azure.com/" \
  --azure-api-key "your-api-key" \
  --azure-wire-api "responses" \
  "請幫我加上單元測試"
```

| wireApi 值 | 說明 |
|------------|------|
| `completions` | 使用 Chat Completions API（預設） |
| `responses` | 使用 Responses API |

### 程式碼中使用 Provider（SDK 用法）

如果你在程式碼中直接使用 SDK，可以透過 `withProvider` 或 `ProviderConfig` 設定自訂 provider。

#### Azure OpenAI 範例

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

// 使用 Chat Completions API（預設）
const client = newCopilotClient(
  withModel("your-deployment-name"),  // deployment name
  withProvider({
    type: "azure",
    baseUrl: "https://your-resource.openai.azure.com/",
    apiKey: "your-api-key",
    wireApi: "completions",  // 可選，預設為 "completions"
    azure: {
      apiVersion: "2024-10-21"  // 可選，預設為 "2024-10-21"
    }
  })
);
```

#### Azure OpenAI 使用 Responses API

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

// 使用 Responses API
const client = newCopilotClient(
  withModel("your-deployment-name"),  // deployment name
  withProvider({
    type: "azure",
    baseUrl: "https://your-resource.openai.azure.com/",
    apiKey: "your-api-key",
    wireApi: "responses",  // 使用 Responses API
    azure: {
      apiVersion: "2024-10-21"
    }
  })
);
```

#### OpenAI 範例

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

const client = newCopilotClient(
  withModel("gpt-4o"),
  withProvider({
    type: "openai",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-your-openai-api-key"
  })
);
```

#### Anthropic 範例

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

const client = newCopilotClient(
  withModel("claude-sonnet-4-20250514"),
  withProvider({
    type: "anthropic",
    baseUrl: "https://api.anthropic.com",
    apiKey: "your-anthropic-api-key"
  })
);
```

#### 使用 Bearer Token（進階）

某些服務需要使用 Bearer Token 而非 API Key：

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

const client = newCopilotClient(
  withModel("your-model"),
  withProvider({
    type: "openai",
    baseUrl: "https://your-custom-endpoint.com/v1",
    bearerToken: "your-bearer-token"  // 會設定 Authorization: Bearer header
  })
);
```

#### 本地模型（Ollama）範例

對於本地運行的模型（如 Ollama），API Key 是可選的：

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

const client = newCopilotClient(
  withModel("llama3.2"),
  withProvider({
    type: "openai",
    baseUrl: "http://localhost:11434/v1"
    // apiKey 可省略
  })
);
```

### ProviderConfig 完整參數說明

| 參數 | 類型 | 必填 | 說明 |
|------|------|------|------|
| `type` | `"openai"` \| `"azure"` \| `"anthropic"` | 否 | Provider 類型，預設為 `"openai"` |
| `baseUrl` | `string` | 是 | API 端點 URL |
| `apiKey` | `string` | 否 | API 金鑰（本地模型可省略） |
| `bearerToken` | `string` | 否 | Bearer Token，優先於 `apiKey` |
| `wireApi` | `"completions"` \| `"responses"` | 否 | API 格式（僅 openai/azure），預設 `"completions"` |
| `azure.apiVersion` | `string` | 否 | Azure API 版本，預設 `"2024-10-21"` |

### 環境變數對照表

| 環境變數 | CLI 參數 | 說明 |
|----------|----------|------|
| `AZURE_OPENAI_ENDPOINT` | `--azure-endpoint` | Azure OpenAI 端點 URL |
| `AZURE_OPENAI_API_KEY` | `--azure-api-key` | Azure OpenAI API 金鑰 |
| `AZURE_OPENAI_API_VERSION` | `--azure-api-version` | Azure API 版本（預設 `2024-10-21`） |
| `AZURE_OPENAI_WIRE_API` | `--azure-wire-api` | API 格式：`completions` 或 `responses`（預設 `completions`） |

### 完成短語（Promise）

系統訊息模板會要求模型在任務**完全完成**時輸出：

```
<promise>{你的完成短語}</promise>
```

只有當 AI 回覆中**精準包含**該字串（大小寫與字元完全一致）時，才會被視為完成信號。未輸出 promise 並不代表失敗，可能只是達到 `--max-iterations` 或 timeout。

## 退出碼

- `0`：完成
- `1`：失敗
- `2`：取消
- `3`：逾時
- `4`：達到最大迭代次數（保留）

## 相關文件

- 運作流程詳解：`docs/運作流程詳解.md`

## 開發指令總覽

```bash
# 型別檢查
npm run typecheck

# 執行測試
bun run test

# 測試 watch 模式（開發時使用）
bun run test:watch

# 建置專案
bun run build

# 開發模式執行
npm run dev -- run "<你的任務>"

# 版本號碼更新
npm run bump
```
