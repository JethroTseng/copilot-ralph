# Copilot Ralph Node

[English](README.en.md) | [中文](README.md)

Ralph iterative AI development loop tool implemented in Node.js. It uses the GitHub Copilot SDK and event streaming to let AI iterate on the same task until it meets a completion condition or hits a limit.

## Local Installation and Testing

### Prerequisites

- Node.js 18 or newer
- Bun (for build and tests)
- npm or yarn
- GitHub Copilot account and authorization (requires an active Copilot subscription)

### Installation Steps

1. **Clone or download the repository**

   ```bash
   git clone <repository-url>
   cd copilot-ralph-node
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Run type checking**

   ```bash
   npm run typecheck
   ```

4. **Run unit tests**

   ```bash
   bun run test
   ```

   Or use watch mode during development:

   ```bash
   bun run test:watch
   ```

### Run in Development Mode

Use `tsx` to execute TypeScript source directly (no build required):

```bash
npm run dev -- run "Please add unit tests"
```

### Build and Run (Release Mode)

1. **Build the project**

   ```bash
   bun run build
   ```

   Build output is written to the `dist/` directory.

2. **Run the built CLI**

   ```bash
   node dist/cli-entry.js run "Please add unit tests"
   ```

### Common Examples

```bash
# Specify max iterations and completion phrase
node dist/cli-entry.js run --max-iterations 3 --promise "Task complete!" "Fix the sign-in flow"

# Read a Markdown or text file as the prompt
node dist/cli-entry.js run task.md
```

### Local Global Installation (Development)

During development, you can install this tool as a global command so you can run `copilot-ralph` from any directory.

### Global Installation (General Use)

```bash
npm i -g @willh/copilot-ralph
```

#### Method 1: Use npm link (recommended)

This is best for development. Code changes take effect immediately without reinstalling.

```bash
# 1. Build the project
bun run build

# 2. Create a global symlink
npm link

# 3. Now run from anywhere
copilot-ralph run "Your task"
```

**Uninstall:**

```bash
# Run in the project directory
npm unlink

# Or run from any directory
npm unlink -g @willh/copilot-ralph
```

#### Method 2: Use npm install -g (for production testing)

This method installs globally and is suitable for testing the installed behavior.

```bash
# 1. Build the project
bun run build

# 2. Global install (from current directory)
npm install -g .

# 3. Now run from anywhere
copilot-ralph run "Your task"
```

**Uninstall:**

```bash
npm uninstall -g @willh/copilot-ralph
```

#### Notes

- After using `npm link`, run `bun run build` after each source change so the global command uses the latest code.
- If you hit permission issues (Windows requires admin; macOS/Linux may need `sudo`), run the terminal as administrator.
- Remember to unlink after development to avoid conflicts with the released version.

## How It Works (Overview)

1. The CLI parses arguments and prompt to build a `LoopConfig`.
2. It creates a Copilot SDK client and starts a session.
3. It starts the `LoopEngine` and enters the iteration loop.
4. Each iteration sends the prompt and reads the SDK event stream (text, tool calls, errors).
5. It stops when the completion phrase (promise) is detected or limits are reached.
6. It outputs a summary and exit code.

See `docs/運作流程詳解.md` for full details.

## Key Features

- Iterative AI loop execution
- Real-time event stream output
- Completion phrase (promise) detection
- Tool call event display
- Timeout and cancellation handling

## Usage

### Basic Command

```bash
copilot-ralph run "<your task description>"
```

### Parameters

- `--max-iterations`: maximum iterations (default 10)
- `--timeout`: maximum runtime (default 30m)
- `--promise`: completion phrase (default `任務完成！🥇`)
- `--model`: model name (default `gpt-5-mini`)
- `--working-dir`: working directory (default `.`)
- `--streaming`: enable streaming (default `true`)
- `--system-prompt`: custom system prompt (text, Markdown, or .txt file)
- `--system-prompt-file`: system prompt template file path (supports `{{PROMISE}}`; ignored when `--system-prompt` is set)
- `--system-prompt-mode`: `append` or `replace` (used with `--system-prompt` or `--system-prompt-file`)
- `--log-level`: `debug`, `info`, `warn`, `error`
- `--session-id`: specify Copilot session ID to continue context on the next run
- `--dry-run`: show settings only, do not run the loop
- `--azure-endpoint`: Azure OpenAI endpoint URL
- `--azure-api-key`: Azure OpenAI API key
- `--azure-api-version`: Azure OpenAI API version (default `2024-10-21`)
- `--azure-wire-api`: API format, `completions` or `responses` (default `completions`)

## Custom AI Provider (BYOK)

Copilot Ralph supports Bring Your Own Key (BYOK) mode, so you can use your own Azure OpenAI, OpenAI, or Anthropic API instead of the default GitHub Copilot API.

### Azure OpenAI

#### AZURE_OPENAI_ENDPOINT Format

`AZURE_OPENAI_ENDPOINT` is your Azure OpenAI resource endpoint URL, with the following format:

```
https://<your-resource-name>.openai.azure.com/
```

**Examples:**

| Resource name | Endpoint URL |
|--------------|--------------|
| `my-openai` | `https://my-openai.openai.azure.com/` |
| `contoso-ai` | `https://contoso-ai.openai.azure.com/` |
| `duotify-ai-coding-agent` | `https://duotify-ai-coding-agent.openai.azure.com/` |

> **Note**: The trailing `/` is optional. The system handles either form.

You can find this endpoint in the Azure Portal under the Azure OpenAI resource page → "Keys and Endpoint".

#### Deployment Name

In Azure OpenAI, **Deployment Name is the value for the `--model` parameter**. The name you set when you create the model deployment is what you pass to `--model`.

Examples:
- If you create a deployment named `gpt-4o-deployment`, use `--model gpt-4o-deployment`
- If the deployment name is `my-gpt-4o`, use `--model my-gpt-4o`

#### Method 1: Use environment variables (recommended)

Store keys in environment variables to avoid exposing sensitive values on the command line.

```bash
# Set environment variables
export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com/"
export AZURE_OPENAI_API_KEY="your-api-key"
export AZURE_OPENAI_API_VERSION="2024-10-21"  # Optional, default is 2024-10-21
export AZURE_OPENAI_WIRE_API="completions"    # Optional, default is completions

# Run the command (--model is your deployment name)
copilot-ralph run --model your-deployment-name "Please add unit tests"
```

Windows PowerShell:

```powershell
$env:AZURE_OPENAI_ENDPOINT = "https://your-resource.openai.azure.com/"
$env:AZURE_OPENAI_API_KEY = "your-api-key"
$env:AZURE_OPENAI_API_VERSION = "2024-10-21"
$env:AZURE_OPENAI_WIRE_API = "completions"

copilot-ralph run --model your-deployment-name "Please add unit tests"
```

Windows CMD:

```cmd
set AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
set AZURE_OPENAI_API_KEY=your-api-key
set AZURE_OPENAI_API_VERSION=2024-10-21
set AZURE_OPENAI_WIRE_API=completions

copilot-ralph run --model your-deployment-name "Please add unit tests"
```

#### Method 2: Use CLI parameters

```bash
copilot-ralph run \
  --model your-deployment-name \
  --azure-endpoint "https://your-resource.openai.azure.com/" \
  --azure-api-key "your-api-key" \
  --azure-api-version "2024-10-21" \
  --azure-wire-api "completions" \
  "Please add unit tests"
```

> **Note**: CLI parameters take precedence over environment variables.

#### Use Responses API

If you want to use Azure OpenAI **Responses API** (instead of the traditional Chat Completions API), set `wireApi` to `responses`:

```bash
# Environment variable method
export AZURE_OPENAI_WIRE_API="responses"

# Or CLI parameters
copilot-ralph run \
  --model your-deployment-name \
  --azure-endpoint "https://your-resource.openai.azure.com/" \
  --azure-api-key "your-api-key" \
  --azure-wire-api "responses" \
  "Please add unit tests"
```

| wireApi value | Description |
|-------------|-------------|
| `completions` | Uses the Chat Completions API (default) |
| `responses` | Uses the Responses API |

### Using Providers in Code (SDK Usage)

If you use the SDK directly, configure a custom provider with `withProvider` or `ProviderConfig`.

#### Azure OpenAI Example

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

// Use Chat Completions API (default)
const client = newCopilotClient(
  withModel("your-deployment-name"),  // deployment name
  withProvider({
    type: "azure",
    baseUrl: "https://your-resource.openai.azure.com/",
    apiKey: "your-api-key",
    wireApi: "completions",  // Optional, default is "completions"
    azure: {
      apiVersion: "2024-10-21"  // Optional, default is "2024-10-21"
    }
  })
);
```

#### Azure OpenAI with Responses API

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

// Use Responses API
const client = newCopilotClient(
  withModel("your-deployment-name"),  // deployment name
  withProvider({
    type: "azure",
    baseUrl: "https://your-resource.openai.azure.com/",
    apiKey: "your-api-key",
    wireApi: "responses",  // Use Responses API
    azure: {
      apiVersion: "2024-10-21"
    }
  })
);
```

#### OpenAI Example

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

#### Anthropic Example

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

#### Using Bearer Token (Advanced)

Some services use a Bearer token instead of an API key:

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

const client = newCopilotClient(
  withModel("your-model"),
  withProvider({
    type: "openai",
    baseUrl: "https://your-custom-endpoint.com/v1",
    bearerToken: "your-bearer-token"  // Sets Authorization: Bearer header
  })
);
```

#### Local Models (Ollama) Example

For local models (e.g., Ollama), the API key is optional:

```typescript
import { newCopilotClient, withModel, withProvider } from "@willh/copilot-ralph";

const client = newCopilotClient(
  withModel("llama3.2"),
  withProvider({
    type: "openai",
    baseUrl: "http://localhost:11434/v1"
    // apiKey optional
  })
);
```

### ProviderConfig Full Parameters

| Parameter | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | `"openai"` \| `"azure"` \| `"anthropic"` | No | Provider type, default is `"openai"` |
| `baseUrl` | `string` | Yes | API endpoint URL |
| `apiKey` | `string` | No | API key (optional for local models) |
| `bearerToken` | `string` | No | Bearer token, takes precedence over `apiKey` |
| `wireApi` | `"completions"` \| `"responses"` | No | API format (openai/azure only), default `"completions"` |
| `azure.apiVersion` | `string` | No | Azure API version, default `"2024-10-21"` |

### Environment Variable Mapping

| Environment variable | CLI parameter | Description |
|----------------------|--------------|-------------|
| `AZURE_OPENAI_ENDPOINT` | `--azure-endpoint` | Azure OpenAI endpoint URL |
| `AZURE_OPENAI_API_KEY` | `--azure-api-key` | Azure OpenAI API key |
| `AZURE_OPENAI_API_VERSION` | `--azure-api-version` | Azure API version (default `2024-10-21`) |
| `AZURE_OPENAI_WIRE_API` | `--azure-wire-api` | API format: `completions` or `responses` (default `completions`) |

### Completion Phrase (Promise)

The system prompt template asks the model to output the following when the task is **fully completed**:

```
<promise>{your completion phrase}</promise>
```

Completion is detected only when the AI response **exactly contains** that string (case and characters must match). Not emitting the promise does not mean failure; it may have hit `--max-iterations` or a timeout.

## Exit Codes

- `0`: completed
- `1`: failed
- `2`: cancelled
- `3`: timed out
- `4`: max iterations reached (reserved)

## Related Docs

- Process details: `docs/運作流程詳解.md`

## Development Commands

```bash
# Type checking
npm run typecheck

# Run tests
bun run test

# Test watch mode (development)
bun run test:watch

# Build the project
bun run build

# Run in development mode
npm run dev -- run "<your task>"

# Bump version
npm run bump
```
