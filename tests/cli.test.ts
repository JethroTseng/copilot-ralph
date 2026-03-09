import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildLoopConfig,
  createSDKClient,
  displayEvents,
  formatSDKClientError,
  printDryRun,
  resolvePrompt,
  runLogLevel,
  runMaxIterations,
  runModel,
  runPromise,
  runSystemPrompt,
  runSystemPromptMode,
  runTimeoutMs,
  runWorkingDir,
  setRunOptions,
  validateRunConfig,
  validateSettings
} from "../src/cli/commands/run-command.js";
import {
  AIResponseEvent,
  IterationStartEvent,
  LoopCancelledEvent,
  LoopStartEvent,
  PromiseDetectedEvent,
  type LoopEvent
} from "../src/core/loop-events.js";
import type { LoopConfig } from "../src/core/loop-config.js";
import { AsyncQueue } from "../src/shared/async-queue.js";

const captureOutput = async (fn: () => Promise<void> | void): Promise<string> => {
  const chunks: string[] = [];
  const originalWrite = process.stdout.write.bind(process.stdout);
  const originalLog = console.log.bind(console);

  (process.stdout as unknown as { write: typeof process.stdout.write }).write = (
    chunk: string | Uint8Array
  ) => {
    chunks.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return true;
  };

  console.log = (...args: unknown[]) => {
    const line = args.map((arg) => String(arg)).join(" ");
    chunks.push(`${line}\n`);
  };

  try {
    await fn();
  } finally {
    (process.stdout as unknown as { write: typeof process.stdout.write }).write = originalWrite;
    console.log = originalLog;
  }

  return chunks.join("");
};

describe("resolvePrompt", () => {
  it("returns raw prompt for non-file input", async () => {
    const result = await resolvePrompt("test prompt");
    expect(result).toBe("test prompt");
  });

  it("reads markdown file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ralph-"));
    const path = join(dir, "task.md");
    writeFileSync(path, "# Task\nHello");

    const result = await resolvePrompt(path);
    expect(result).toContain("# Task");
  });

  it("reads text file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ralph-"));
    const path = join(dir, "task.txt");
    writeFileSync(path, "Task details");

    const result = await resolvePrompt(path);
    expect(result).toContain("Task details");
  });

  it("throws on empty prompt", async () => {
    await expect(resolvePrompt("")).rejects.toThrow(/no prompt provided/);
  });
});

describe("validateRunConfig", () => {
  it("accepts valid config", () => {
    const cfg: LoopConfig = {
      prompt: "task",
      maxIterations: 2,
      timeoutMs: 60_000,
      promisePhrase: "Done",
      model: "gpt-5-mini",
      workingDir: ".",
      dryRun: false
    };

    expect(() => validateRunConfig(cfg)).not.toThrow();
  });

  it("rejects empty prompt", () => {
    const cfg: LoopConfig = {
      prompt: "",
      maxIterations: 2,
      timeoutMs: 60_000,
      promisePhrase: "Done",
      model: "gpt-5-mini",
      workingDir: ".",
      dryRun: false
    };

    expect(() => validateRunConfig(cfg)).toThrow(/prompt cannot be empty/);
  });
});

describe("validateSettings", () => {
  it("rejects invalid system prompt mode", () => {
    const previous = runSystemPromptMode;
    try {
      setRunOptions({ systemPromptMode: "invalid" as "append" | "replace" });
      expect(() => validateSettings()).toThrow(/invalid system-prompt-mode/);
    } finally {
      setRunOptions({ systemPromptMode: previous });
    }
  });
});

describe("buildLoopConfig", () => {
  it("applies global overrides", () => {
    const oldValues = {
      runMaxIterations,
      runTimeoutMs,
      runPromise,
      runModel,
      runWorkingDir
    };

    setRunOptions({
      maxIterations: 5,
      timeout: 120_000,
      promise: "Done",
      model: "gpt-test",
      workingDir: "/tmp"
    });

    const cfg = buildLoopConfig("task");
    expect(cfg.maxIterations).toBe(5);
    expect(cfg.promisePhrase).toBe("Done");

    setRunOptions({
      maxIterations: oldValues.runMaxIterations,
      timeout: oldValues.runTimeoutMs,
      promise: oldValues.runPromise,
      model: oldValues.runModel,
      workingDir: oldValues.runWorkingDir
    });
  });
});

describe("printDryRun", () => {
  it("prints configuration", async () => {
    const cfg: LoopConfig = {
      prompt: "task",
      maxIterations: 1,
      timeoutMs: 60_000,
      promisePhrase: "Done",
      model: "gpt-5-mini",
      workingDir: ".",
      dryRun: true
    };

    const output = await captureOutput(() => printDryRun(cfg));
    expect(output).toContain("Configuration Preview");
    expect(output).toContain("task");
  });
});

describe("displayEvents", () => {
  it("prints loop progress", async () => {
    const events = new AsyncQueue<LoopEvent>(10);
    const cfg: LoopConfig = {
      prompt: "task",
      maxIterations: 5,
      timeoutMs: 60_000,
      promisePhrase: "Done",
      model: "gpt-5-mini",
      workingDir: ".",
      dryRun: false
    };

    const outputPromise = captureOutput(async () => {
      const displayPromise = displayEvents(events, cfg);

      events.push(new LoopStartEvent(cfg));
      events.push(new IterationStartEvent(1, 5));
      events.push(new AIResponseEvent("Hello ", 1));
      events.push(new AIResponseEvent("world", 1));
      events.push(new PromiseDetectedEvent("Done", "ai_response", 1));
      events.push(new LoopCancelledEvent({
        state: "cancelled",
        iterations: 1,
        durationMs: 0,
        error: null
      }));
      events.close();

      await displayPromise;
    });

    const output = await outputPromise;
    expect(output).toContain("Loop started");
    expect(output).toContain("Iteration 1/5");
    expect(output).toContain("Promise detected");
  });
});

describe("createSDKClient", () => {
  it("returns a client with model", async () => {
    const cfg: LoopConfig = {
      prompt: "task",
      maxIterations: 1,
      timeoutMs: 60_000,
      promisePhrase: "Done",
      model: "gpt-test",
      workingDir: ".",
      dryRun: false
    };

    const oldSystemPrompt = runSystemPrompt;
    const oldSystemMode = runSystemPromptMode;
    const oldLogLevel = runLogLevel;

    setRunOptions({
      systemPrompt: "",
      systemPromptMode: "append",
      logLevel: "info"
    });

    const client = await createSDKClient(cfg);
    expect(client.model()).toBe("gpt-test");

    setRunOptions({
      systemPrompt: oldSystemPrompt,
      systemPromptMode: oldSystemMode,
      logLevel: oldLogLevel
    });
  });
});

describe("formatSDKClientError", () => {
  it("adds upgrade guidance for protocol mismatches", () => {
    const message = formatSDKClientError(
      new Error(
        "SDK protocol version mismatch: SDK expects version 2, but server reports version 3."
      )
    );

    expect(message).toContain("failed to start Copilot SDK client");
    expect(message).toContain("@github/copilot-sdk");
    expect(message).toContain("npm install");
  });

  it("preserves non-protocol startup errors", () => {
    const message = formatSDKClientError(new Error("permission denied"));
    expect(message).toBe("failed to start Copilot SDK client: permission denied");
  });
});
