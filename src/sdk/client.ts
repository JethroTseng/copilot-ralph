import {
  CopilotClient as CopilotSDKClient,
  approveAll,
  type CopilotClientOptions,
  type CopilotSession,
  type ResumeSessionConfig,
  type SessionConfig,
  type SessionEvent
} from "@github/copilot-sdk";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { AsyncQueue } from "../shared/async-queue.js";
import {
  ErrorEvent,
  TextEvent,
  ToolCallEvent,
  ToolResultEvent,
  type Event as ClientEvent
} from "./events.js";
import type { ToolCall } from "./tool-call.js";

export const DefaultModel = "gpt-5-mini";
export const DefaultLogLevel = "info";
export const DefaultTimeoutMs = 60_000;
export const DefaultStreaming = true;

const retryBackoffsMs = [1000, 2000, 5000];

export const isRetryableError = (err: Error | null): boolean => {
  if (!err) {
    return false;
  }

  const message = err.message;
  if (message.includes("GOAWAY")) {
    return true;
  }
  if (message.includes("connection reset")) {
    return true;
  }
  if (message.includes("connection refused")) {
    return true;
  }
  if (message.includes("connection terminated")) {
    return true;
  }
  if (message.includes("EOF")) {
    return true;
  }
  if (message.includes("timeout")) {
    return true;
  }

  return false;
};

export type ClientOption = (config: ClientConfig) => void;

/**
 * Configuration for a custom API provider (BYOK - Bring Your Own Key).
 */
export interface ProviderConfig {
  /**
   * Provider type. Defaults to "openai" for generic OpenAI-compatible APIs.
   */
  type?: "openai" | "azure" | "anthropic";
  /**
   * API format (openai/azure only). Defaults to "completions".
   */
  wireApi?: "completions" | "responses";
  /**
   * API endpoint URL
   */
  baseUrl: string;
  /**
   * API key. Optional for local providers like Ollama.
   */
  apiKey?: string;
  /**
   * Bearer token for authentication. Sets the Authorization header directly.
   * Use this for services requiring bearer token auth instead of API key.
   * Takes precedence over apiKey when both are set.
   */
  bearerToken?: string;
  /**
   * Azure-specific options
   */
  azure?: {
    /**
     * API version. Defaults to "2024-10-21".
     */
    apiVersion?: string;
  };
}

interface ClientConfig {
  model: string;
  logLevel: string;
  workingDir: string;
  systemMessageMode: "append" | "replace";
  systemMessage: string;
  timeoutMs: number;
  streaming: boolean;
  sessionId?: string;
  provider?: ProviderConfig;
}

export const withModel = (model: string): ClientOption => (config) => {
  config.model = model;
};

export const withLogLevel = (level: string): ClientOption => (config) => {
  config.logLevel = level;
};

export const withWorkingDir = (dir: string): ClientOption => (config) => {
  config.workingDir = dir;
};

export const withStreaming = (streaming: boolean): ClientOption => (config) => {
  config.streaming = streaming;
};

export const withSystemMessage = (
  message: string,
  mode: "append" | "replace"
): ClientOption => (config) => {
  config.systemMessage = message;
  config.systemMessageMode = mode;
};

export const withTimeout = (timeoutMs: number): ClientOption => (config) => {
  config.timeoutMs = timeoutMs;
};

export const withProvider = (provider: ProviderConfig): ClientOption => (config) => {
  config.provider = provider;
};

export const withSessionId = (sessionId: string): ClientOption => (config) => {
  config.sessionId = sessionId;
};

/**
 * Creates a ProviderConfig from environment variables.
 *
 * Environment variables:
 * - AZURE_OPENAI_ENDPOINT: Azure OpenAI endpoint URL (required for Azure)
 * - AZURE_OPENAI_API_KEY: Azure OpenAI API key (required for Azure)
 * - AZURE_OPENAI_API_VERSION: API version (optional, defaults to "2024-10-21")
 * - AZURE_OPENAI_WIRE_API: API format - "completions" or "responses" (optional, defaults to "completions")
 *
 * @returns ProviderConfig if environment variables are set, undefined otherwise
 */
export const getProviderFromEnv = (): ProviderConfig | undefined => {
  const baseUrl = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;

  if (!baseUrl || !apiKey) {
    return undefined;
  }

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
  const wireApi = process.env.AZURE_OPENAI_WIRE_API as
    | "completions"
    | "responses"
    | undefined;

  return {
    type: "azure",
    baseUrl,
    apiKey,
    ...(wireApi && { wireApi }),
    azure: {
      apiVersion
    }
  };
};

export const newCopilotClient = (...opts: ClientOption[]): CopilotClient => {
  const config: ClientConfig = {
    model: DefaultModel,
    logLevel: DefaultLogLevel,
    workingDir: ".",
    streaming: DefaultStreaming,
    systemMessageMode: "append",
    systemMessage: "",
    timeoutMs: DefaultTimeoutMs,
    sessionId: undefined
  };

  for (const opt of opts) {
    opt(config);
  }

  if (!config.model) {
    throw new Error("model cannot be empty");
  }

  if (config.timeoutMs <= 0) {
    throw new Error("timeout must be positive");
  }

  if (config.sessionId !== undefined) {
    const trimmed = config.sessionId.trim();
    if (!trimmed) {
      throw new Error("sessionId cannot be empty");
    }
    config.sessionId = trimmed;
  }

  return new CopilotClient(config);
};

export const safeEventSender = (
  events: AsyncQueue<ClientEvent>,
  event: ClientEvent
): Error | null => {
  try {
    events.push(event);
    return null;
  } catch (err) {
    return err instanceof Error ? err : new Error("event channel closed");
  }
};

export const resolveCopilotCliPath = (): string | null => {
  const envPath = process.env.COPILOT_CLI_PATH;
  if (envPath && envPath.trim()) {
    return envPath;
  }

  const packaged = resolveCopilotFromPackageJson();
  if (packaged) {
    return packaged;
  }

  return resolveCopilotFromNodeModules();
};

const resolveCopilotFromPackageJson = (): string | null => {
  try {
    const require = createRequire(import.meta.url);
    const packageJsonPath = require.resolve("@github/copilot/package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      bin?: { copilot?: string };
    };
    const binRelative = pkg?.bin?.copilot;
    if (!binRelative) {
      return null;
    }
    const binPath = join(dirname(packageJsonPath), binRelative);
    return existsSync(binPath) ? binPath : null;
  } catch {
    return null;
  }
};

const resolveCopilotFromNodeModules = (): string | null => {
  let current = dirname(fileURLToPath(import.meta.url));

  for (let i = 0; i < 10; i += 1) {
    const candidate = join(
      current,
      "node_modules",
      "@github",
      "copilot",
      "npm-loader.js"
    );
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
};

export class CopilotClient {
  private sdkClient: CopilotSDKClient | null = null;
  private sdkSession: CopilotSession | null = null;
  private started = false;
  private sessionId: string | null = null;

  constructor(private readonly config: ClientConfig) {
    this.sessionId = config.sessionId ?? null;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    const cliPath = resolveCopilotCliPath();
    this.sdkClient = new CopilotSDKClient({
      logLevel: this.config.logLevel as CopilotClientOptions["logLevel"],
      cwd: this.config.workingDir,
      ...(cliPath ? { cliPath } : {})
    });

    await this.sdkClient.start();
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started && !this.sdkClient && !this.sdkSession) {
      return;
    }

    this.started = false;

    if (this.sdkSession) {
      try {
        await this.sdkSession.destroy();
      } catch {
        // Ignore cleanup errors.
      }
      this.sdkSession = null;
    }

    if (this.sdkClient) {
      try {
        await this.sdkClient.stop();
      } catch {
        // Ignore cleanup errors.
      }
      this.sdkClient = null;
    }
  }

  async createSession(_signal?: AbortSignal): Promise<void> {
    if (!this.sdkClient) {
      throw new Error("SDK client not initialized");
    }

    const sessionConfig: SessionConfig = {
      model: this.config.model,
      streaming: this.config.streaming,
      onPermissionRequest: approveAll
    };

    if (this.config.systemMessage) {
      sessionConfig.systemMessage = {
        mode: this.config.systemMessageMode,
        content: this.config.systemMessage
      };
    }

    if (this.config.provider) {
      sessionConfig.provider = this.config.provider;
    }

    const resumeConfig: ResumeSessionConfig = {
      streaming: this.config.streaming,
      onPermissionRequest: approveAll,
      ...(this.config.provider ? { provider: this.config.provider } : {})
    };

    if (this.sessionId) {
      try {
        this.sdkSession = await this.sdkClient.resumeSession(
          this.sessionId,
          resumeConfig
        );
        this.sessionId = this.sdkSession.sessionId;
        return;
      } catch {
        sessionConfig.sessionId = this.sessionId;
      }
    }

    this.sdkSession = await this.sdkClient.createSession(sessionConfig);
    this.sessionId = this.sdkSession.sessionId;
  }

  async destroySession(_signal?: AbortSignal): Promise<void> {
    if (!this.sdkSession) {
      return;
    }

    await this.sdkSession.destroy();
    this.sdkSession = null;
  }

  model(): string {
    return this.config.model;
  }

  async sendPrompt(
    signal: AbortSignal,
    prompt: string
  ): Promise<AsyncQueue<ClientEvent>> {
    if (!this.sdkSession) {
      throw new Error("no active session");
    }

    const events = new AsyncQueue<ClientEvent>(100);

    void (async () => {
      try {
        await this.sendPromptWithRetry(signal, prompt, events);
      } finally {
        events.close();
      }
    })();

    return events;
  }

  private async sendPromptWithRetry(
    signal: AbortSignal,
    prompt: string,
    events: AsyncQueue<ClientEvent>
  ): Promise<void> {
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt <= retryBackoffsMs.length; attempt += 1) {
      if (signal.aborted) {
        return;
      }

      if (attempt > 0) {
        const backoff = retryBackoffsMs[attempt - 1];
        const aborted = await sleep(backoff, signal);
        if (aborted) {
          const abortErr = toAbortError(signal);
          safeEventSender(events, new ErrorEvent(abortErr));
          return;
        }
      }

      const err = await this.sendPromptOnce(signal, prompt, events);
      if (!err) {
        return;
      }

      lastErr = err;

      if (!isRetryableError(err)) {
        safeEventSender(events, new ErrorEvent(err));
        return;
      }
    }

    if (lastErr) {
      safeEventSender(
        events,
        new ErrorEvent(new Error(`max retries exceeded: ${lastErr.message}`))
      );
    }
  }

  private async sendPromptOnce(
    signal: AbortSignal,
    prompt: string,
    events: AsyncQueue<ClientEvent>
  ): Promise<Error | null> {
    if (!this.sdkSession) {
      return new Error("no active session");
    }

    let sessionErr: Error | null = null;
    const pendingToolCalls = new Map<string, ToolCall>();

    const done = createDeferred<void>();
    const closeDone = () => done.resolve();

    const unsubscribe = this.sdkSession.on((event) => {
      if (signal.aborted) {
        closeDone();
        return;
      }

      if (event.type === "session.error") {
        sessionErr = new Error(`SDK error: ${event.data.message}`);
      }

      this.handleSDKEvent(event, events, closeDone, pendingToolCalls);
    });

    const abortHandler = () => {
      void this.sdkSession?.abort();
      closeDone();
    };
    signal.addEventListener("abort", abortHandler, { once: true });

    try {
      await this.sdkSession.send({ prompt });
    } catch (err) {
      signal.removeEventListener("abort", abortHandler);
      unsubscribe();
      return err instanceof Error ? err : new Error("failed to send message");
    }

    await Promise.race([done.promise, waitForAbort(signal)]);

    signal.removeEventListener("abort", abortHandler);
    unsubscribe();

    if (signal.aborted) {
      return toAbortError(signal);
    }

    if (sessionErr) {
      return sessionErr;
    }

    return null;
  }

  private handleSDKEvent(
    event: SessionEvent,
    events: AsyncQueue<ClientEvent>,
    closeDone: () => void,
    pendingToolCalls: Map<string, ToolCall>
  ): void {
    switch (event.type) {
      case "assistant.message_delta":
      case "assistant.reasoning_delta": {
        const delta = event.data.deltaContent;
        if (!delta) {
          return;
        }
        safeEventSender(
          events,
          new TextEvent(delta, event.type.includes("reasoning"))
        );
        return;
      }

      case "assistant.message":
      case "assistant.reasoning": {
        const content = event.data.content;
        if (!content) {
          return;
        }
        safeEventSender(
          events,
          new TextEvent(content, event.type.includes("reasoning"))
        );
        return;
      }

      case "tool.execution_start": {
        if (!event.data.toolName) {
          return;
        }

        const toolCall: ToolCall = {
          id: event.data.toolCallId || "",
          name: event.data.toolName,
          parameters: (event.data.arguments as Record<string, unknown>) || {}
        };

        if (toolCall.id) {
          pendingToolCalls.set(toolCall.id, toolCall);
        }

        safeEventSender(events, new ToolCallEvent(toolCall));
        return;
      }

      case "tool.execution_complete": {
        let toolCall: ToolCall = {
          id: event.data.toolCallId || "",
          name: "",
          parameters: {}
        };

        if (toolCall.id && pendingToolCalls.has(toolCall.id)) {
          toolCall = pendingToolCalls.get(toolCall.id) as ToolCall;
          pendingToolCalls.delete(toolCall.id);
        }

        const result = event.data.result?.content ?? "";
        let toolErr: Error | null = null;
        if (event.data.success === false && event.data.error) {
          toolErr = new Error(event.data.error.message);
        }

        safeEventSender(events, new ToolResultEvent(toolCall, result, toolErr));
        return;
      }

      case "session.idle": {
        closeDone();
        return;
      }

      case "session.error": {
        safeEventSender(
          events,
          new ErrorEvent(new Error(`SDK error: ${event.data.message}`))
        );
        return;
      }

      default:
        return;
    }
  }
}

const toAbortError = (signal: AbortSignal): Error => {
  if (signal.reason instanceof Error) {
    return signal.reason;
  }

  return new Error("aborted");
};

const waitForAbort = (signal: AbortSignal): Promise<void> => {
  if (signal.aborted) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
};

const sleep = (ms: number, signal: AbortSignal): Promise<boolean> => {
  if (signal.aborted) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve(true);
      },
      { once: true }
    );
  });
};

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};
