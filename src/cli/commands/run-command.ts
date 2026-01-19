import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { extname } from "node:path";
import { Command } from "commander";

import { ErrLoopCancelled, ErrLoopTimeout, ErrMaxIterations } from "../../core/errors.js";
import { LoopEngine } from "../../core/loop-engine.js";
import { defaultLoopConfig, type LoopConfig, type LoopResult } from "../../core/loop-config.js";
import {
  AIResponseEvent,
  ErrorEvent,
  IterationCompleteEvent,
  IterationStartEvent,
  LoopCancelledEvent,
  LoopCompleteEvent,
  LoopFailedEvent,
  LoopStartEvent,
  PromiseDetectedEvent,
  ToolExecutionEvent,
  ToolExecutionStartEvent,
  type LoopEvent
} from "../../core/loop-events.js";
import { buildSystemPrompt } from "../../core/system-prompt.js";
import {
  getProviderFromEnv,
  newCopilotClient,
  withLogLevel,
  withModel,
  withProvider,
  withSessionId,
  withStreaming,
  withSystemMessage,
  withTimeout,
  withWorkingDir,
  type ProviderConfig
} from "../../sdk/client.js";
import { formatDuration, parseDuration } from "../../utils/duration.js";
import {
  ErrorStyle,
  InfoStyle,
  PrimaryStyle,
  SuccessStyle,
  TitleStyle,
  WarningStyle
} from "../../tui/styles/styles.js";
import { RalphWiggum } from "../../tui/styles/ralph.js";

export const exitSuccess = 0;
export const exitFailed = 1;
export const exitCancelled = 2;
export const exitTimeout = 3;
export const exitMaxIterations = 4;

export let runMaxIterations = 10;
export let runTimeoutMs = 30 * 60 * 1000;
export let runPromise = "任務完成！🥇";
export let runModel = "gpt-5-mini";
export let runWorkingDir = ".";
export let runDryRun = false;
export let runStreaming = true;
export let runSystemPrompt = "";
export let runSystemPromptMode: "append" | "replace" = "append";
export let runLogLevel = "info";
export let runSessionId = "";
export let runAzureEndpoint = "";
export let runAzureApiKey = "";
export let runAzureApiVersion = "2024-10-21";
export let runAzureWireApi: "completions" | "responses" = "completions";

export interface RunOptions {
  maxIterations: number;
  timeout: number;
  promise: string;
  model: string;
  workingDir: string;
  dryRun: boolean;
  streaming: boolean;
  systemPrompt: string;
  systemPromptMode: "append" | "replace";
  logLevel: string;
  sessionId: string;
  azureEndpoint: string;
  azureApiKey: string;
  azureApiVersion: string;
  azureWireApi: "completions" | "responses";
}

const parseBoolean = (value: string): boolean => {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`invalid boolean: ${value}`);
};

export const createRunCommand = (): Command => {
  const cmd = new Command("run");
  cmd
    .description("Run an AI development loop")
    .argument("[prompt]", "prompt text or path to Markdown/text file")
    .option("-m, --max-iterations <number>", "maximum loop iterations", (v) => parseInt(v, 10), runMaxIterations)
    .option("-t, --timeout <duration>", "maximum loop runtime", parseDuration, runTimeoutMs)
    .option("--promise <phrase>", "completion promise phrase", runPromise)
    .option("--model <model>", "AI model to use", runModel)
    .option("--working-dir <dir>", "working directory for loop execution", runWorkingDir)
    .option("--dry-run", "show what would be executed without running", runDryRun)
    .option("--streaming <boolean>", "enable streaming responses", parseBoolean, runStreaming)
    .option("--system-prompt <prompt>", "custom system message, prompt text or Markdown/text path", runSystemPrompt)
    .option("--system-prompt-mode <mode>", "system message mode: append or replace", runSystemPromptMode)
    .option("--log-level <level>", "log level: debug, info, warn, error", runLogLevel)
    .option("--session-id <id>", "reuse a Copilot session id to resume context", runSessionId)
    .option("--azure-endpoint <url>", "Azure OpenAI endpoint URL (or use AZURE_OPENAI_ENDPOINT env)", runAzureEndpoint)
    .option("--azure-api-key <key>", "Azure OpenAI API key (or use AZURE_OPENAI_API_KEY env)", runAzureApiKey)
    .option("--azure-api-version <version>", "Azure OpenAI API version (or use AZURE_OPENAI_API_VERSION env)", runAzureApiVersion)
    .option("--azure-wire-api <api>", "Azure OpenAI API format: completions or responses (or use AZURE_OPENAI_WIRE_API env)", runAzureWireApi)
    .action(async (promptArg: string | undefined, options) => {
      applyRunOptions(options);
      try {
        const exitCode = await runLoop(promptArg);
        process.exit(exitCode);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(message);
        process.exit(exitFailed);
      }
    });

  return cmd;
};

export const runLoop = async (promptArg: string | undefined): Promise<number> => {
  const resolved = await resolvePrompt(promptArg ?? "");
  if (!resolved) {
    throw new Error("prompt is required (provide as argument or via stdin)");
  }

  const loopConfig = buildLoopConfig(resolved);

  validateRunConfig(loopConfig);
  validateSettings();

  if (loopConfig.dryRun) {
    printDryRun(loopConfig);
    return exitSuccess;
  }

  const provider = getAzureProviderConfig();
  printLoopConfig(loopConfig, provider);

  let sdkClient;
  try {
    sdkClient = await createSDKClient(loopConfig);
  } catch (err) {
    const error = err instanceof Error ? err : new Error("sdk client creation failed");
    throw new Error(`failed to create SDK client: ${error.message}`);
  }
  await sdkClient.start();

  try {
    const engine = new LoopEngine(loopConfig, sdkClient);

    const controller = new AbortController();
    const startTime = Date.now();

    let interruptCount = 0;
    const handleSignal = () => {
      interruptCount += 1;
      if (interruptCount === 1) {
        console.log(WarningStyle("\n⚠ Received interrupt signal, cancelling loop..."));
        controller.abort(ErrLoopCancelled);
        return;
      }
      console.log(ErrorStyle("\n⚠ Second interrupt received, forcing exit..."));
      process.exit(exitCancelled);
    };

    process.on("SIGINT", handleSignal);
    process.on("SIGTERM", handleSignal);

    const eventsDone = displayEvents(engine.eventsStream(), loopConfig);
    const result = await engine.start(controller.signal);

    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);

    await Promise.race([eventsDone, sleep(1000)]);

    printSummary(result, startTime);

    return exitCodeFromResult(result);
  } finally {
    await sdkClient.stop();
  }
};

export const resolvePrompt = async (prompt: string): Promise<string> => {
  if (!prompt) {
    throw new Error("no prompt provided");
  }

  let stat;
  try {
    stat = statSync(prompt);
  } catch {
    return prompt;
  }

  if (stat.isDirectory()) {
    throw new Error(`prompt path ${prompt} is a directory, must be a Markdown or text file`);
  }

  const ext = extname(prompt).toLowerCase();
  if (ext !== ".md" && ext !== ".markdown" && ext !== ".txt") {
    throw new Error(
      `file ${prompt} must be a Markdown or text file with extension .md, .markdown, or .txt`
    );
  }

  const data = await readFile(prompt, "utf8");
  return data;
};

export const buildLoopConfig = (prompt: string): LoopConfig => {
  return {
    ...defaultLoopConfig(),
    prompt,
    maxIterations: runMaxIterations,
    timeoutMs: runTimeoutMs,
    promisePhrase: runPromise,
    model: runModel,
    workingDir: runWorkingDir,
    dryRun: runDryRun
  };
};

export const validateRunConfig = (cfg: LoopConfig): void => {
  if (!cfg.prompt) {
    throw new Error("prompt cannot be empty");
  }

  if (cfg.maxIterations <= 0) {
    throw new Error(`max-iterations must be positive (got: ${cfg.maxIterations})`);
  }

  if (cfg.timeoutMs <= 0) {
    throw new Error(`timeout must be positive (got: ${formatDuration(cfg.timeoutMs)})`);
  }
};

export const validateSettings = (): void => {
  if (runSystemPromptMode !== "append" && runSystemPromptMode !== "replace") {
    throw new Error(`invalid system-prompt-mode: "${runSystemPromptMode}" (must be append or replace)`);
  }
};

export const printDryRun = (cfg: LoopConfig): void => {
  console.log(TitleStyle("🔍 Dry Run - Configuration Preview"));
  console.log("");
  console.log(InfoStyle("  Prompt:            ") + cfg.prompt);
  console.log(InfoStyle("  Model:             ") + cfg.model);
  console.log(InfoStyle("  Max iterations:    ") + cfg.maxIterations);
  console.log(InfoStyle("  Timeout:           ") + formatDuration(cfg.timeoutMs));
  console.log(InfoStyle("  Promise phrase:    ") + cfg.promisePhrase);
  console.log(InfoStyle("  Working directory: ") + cfg.workingDir);
  console.log("");
};

export const printLoopConfig = (cfg: LoopConfig, provider?: ProviderConfig): void => {
  console.log(InfoStyle(RalphWiggum));
  console.log("");

  console.log(TitleStyle("▶  Starting Ralph Loop"));
  console.log(WarningStyle("Prompt:         ") + cfg.prompt);
  console.log(WarningStyle("Model:          ") + cfg.model);
  console.log(WarningStyle("Max iterations: ") + cfg.maxIterations);
  console.log(WarningStyle("Timeout:        ") + formatDuration(cfg.timeoutMs));
  console.log(WarningStyle("Working dir:    ") + cfg.workingDir);
  if (runSessionId) {
    console.log(WarningStyle("Session ID:     ") + runSessionId);
  }

  if (provider) {
    console.log("");
    console.log(TitleStyle("🔑 Provider (BYOK)"));
    console.log(WarningStyle("Type:           ") + (provider.type ?? "openai"));
    console.log(WarningStyle("Base URL:       ") + provider.baseUrl);
    console.log(WarningStyle("Wire API:       ") + (provider.wireApi ?? "completions"));
    if (provider.type === "azure" && provider.azure?.apiVersion) {
      console.log(WarningStyle("API Version:    ") + provider.azure.apiVersion);
    }
    console.log(WarningStyle("API Key:        ") + (provider.apiKey ? "********" : "(not set)"));
  } else {
    console.log("");
    console.log(TitleStyle("🔑 Provider"));
    console.log(WarningStyle("Type:           ") + "GitHub Copilot (default)");
  }

  console.log("");
};

export const displayEvents = async (
  events: AsyncIterable<LoopEvent>,
  cfg: LoopConfig
): Promise<void> => {
  let lastEvent: object | null = null;

  for await (const event of events) {
    if (event instanceof LoopStartEvent) {
      console.log(PrimaryStyle("▶ Loop started"));
      console.log("");
    }

    if (event instanceof IterationStartEvent) {
      console.log(
        TitleStyle(`━━━ Iteration ${event.iteration}/${cfg.maxIterations} ━━━`)
      );
    }

    if (event instanceof AIResponseEvent) {
      process.stdout.write(event.text);
    }

    if (event instanceof ToolExecutionStartEvent) {
      if (lastEvent instanceof AIResponseEvent) {
        console.log("");
      }
      console.log(InfoStyle(event.info("🛠️")));
    }

    if (event instanceof ToolExecutionEvent) {
      if (event.error) {
        const err = ErrorStyle(`(${event.error.message})`);
        console.log(`${event.info("❌")} ${err}`);
      } else {
        console.log(SuccessStyle(event.info("✔️")));
      }
    }

    if (event instanceof IterationCompleteEvent) {
      if (lastEvent instanceof AIResponseEvent) {
        console.log("");
      }
      console.log(InfoStyle(`✓ Iteration ${event.iteration} complete`));
    }

    if (event instanceof PromiseDetectedEvent) {
      if (lastEvent instanceof AIResponseEvent) {
        console.log("");
      }
      console.log(SuccessStyle(`🎉 Promise detected: "${event.phrase}"`));
    }

    if (event instanceof ErrorEvent) {
      if (lastEvent instanceof AIResponseEvent) {
        console.log("");
      }
      console.log(ErrorStyle(`✗ Error: ${event.error.message}`));
    }

    if (event instanceof LoopCompleteEvent) {
      return;
    }

    if (event instanceof LoopFailedEvent) {
      return;
    }

    if (event instanceof LoopCancelledEvent) {
      if (lastEvent instanceof AIResponseEvent) {
        console.log("");
      }
      console.log(WarningStyle("⚠ Loop cancelled"));
      return;
    }

    lastEvent = event;
  }
};

export const printSummary = (result: LoopResult, startTimeMs: number): void => {
  const duration = Date.now() - startTimeMs;

  console.log("");
  console.log(PrimaryStyle("📊 Loop Summary"));
  console.log("");

  let status: string = result.state;
  if (result.state === "complete") {
    status = SuccessStyle("✓ Complete");
  } else if (result.state === "failed") {
    status = ErrorStyle("✗ Failed");
  } else if (result.state === "cancelled") {
    status = WarningStyle("⚠ Cancelled");
  }

  console.log(InfoStyle("Status:     ") + status);
  console.log(InfoStyle("Iterations: ") + result.iterations);
  console.log(InfoStyle("Duration:   ") + formatDuration(duration));

  if (result.error) {
    console.log(ErrorStyle("Error:      ") + result.error.message);
  }

  console.log("");
};

export const createSDKClient = async (loopConfig: LoopConfig) => {
  const opts = [
    withModel(loopConfig.model),
    withWorkingDir(loopConfig.workingDir),
    withTimeout(loopConfig.timeoutMs),
    withStreaming(runStreaming),
    withLogLevel(runLogLevel)
  ];

  const systemPrompt = buildSystemPrompt(loopConfig.promisePhrase);

  if (runSystemPrompt) {
    const resolved = await resolvePrompt(runSystemPrompt);
    opts.push(withSystemMessage(resolved, runSystemPromptMode));
  } else {
    opts.push(withSystemMessage(systemPrompt, "append"));
  }

  // Check for Azure provider config from CLI options or environment variables
  const provider = getAzureProviderConfig();
  if (provider) {
    opts.push(withProvider(provider));
  }

  if (runSessionId) {
    opts.push(withSessionId(runSessionId));
  }

  return newCopilotClient(...opts);
};

/**
 * Get Azure provider config from CLI options or environment variables.
 * CLI options take precedence over environment variables.
 */
const getAzureProviderConfig = (): ProviderConfig | undefined => {
  // First try CLI options
  if (runAzureEndpoint && runAzureApiKey) {
    return {
      type: "azure",
      baseUrl: runAzureEndpoint,
      apiKey: runAzureApiKey,
      wireApi: runAzureWireApi,
      azure: {
        apiVersion: runAzureApiVersion
      }
    };
  }

  // Fall back to environment variables
  return getProviderFromEnv();
};

const applyRunOptions = (options: Record<string, unknown>) => {
  if (typeof options.maxIterations === "number") {
    runMaxIterations = options.maxIterations;
  }
  if (typeof options.timeout === "number") {
    runTimeoutMs = options.timeout;
  }
  if (typeof options.promise === "string") {
    runPromise = options.promise;
  }
  if (typeof options.model === "string") {
    runModel = options.model;
  }
  if (typeof options.workingDir === "string") {
    runWorkingDir = options.workingDir;
  }
  if (typeof options.dryRun === "boolean") {
    runDryRun = options.dryRun;
  }
  if (typeof options.streaming === "boolean") {
    runStreaming = options.streaming;
  }
  if (typeof options.systemPrompt === "string") {
    runSystemPrompt = options.systemPrompt;
  }
  if (typeof options.systemPromptMode === "string") {
    runSystemPromptMode = options.systemPromptMode as "append" | "replace";
  }
  if (typeof options.logLevel === "string") {
    runLogLevel = options.logLevel;
  }
  if (typeof options.sessionId === "string") {
    runSessionId = options.sessionId;
  }
  if (typeof options.azureEndpoint === "string") {
    runAzureEndpoint = options.azureEndpoint;
  }
  if (typeof options.azureApiKey === "string") {
    runAzureApiKey = options.azureApiKey;
  }
  if (typeof options.azureApiVersion === "string") {
    runAzureApiVersion = options.azureApiVersion;
  }
  if (typeof options.azureWireApi === "string") {
    runAzureWireApi = options.azureWireApi as "completions" | "responses";
  }
};

export const setRunOptions = (options: Partial<RunOptions>): void => {
  applyRunOptions(options as Record<string, unknown>);
};

const exitCodeFromResult = (result: LoopResult): number => {
  if (result.state === "complete") {
    return exitSuccess;
  }

  if (result.state === "cancelled") {
    return exitCancelled;
  }

  if (result.state === "failed") {
    if (result.error === ErrLoopTimeout) {
      return exitTimeout;
    }
    if (result.error === ErrMaxIterations) {
      return exitMaxIterations;
    }
    return exitFailed;
  }

  return exitFailed;
};

const sleep = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};
