import { describe, expect, it } from "vitest";

import { ErrLoopCancelled, ErrLoopTimeout } from "../src/core/errors.js";
import { defaultLoopConfig, type LoopConfig } from "../src/core/loop-config.js";
import { LoopEngine } from "../src/core/loop-engine.js";
import { PromiseDetectedEvent, ToolEvent } from "../src/core/loop-events.js";
import { detectPromise } from "../src/core/promise-detection.js";
import type { SDKClient } from "../src/core/sdk-client.js";
import { AsyncQueue } from "../src/shared/async-queue.js";
import { TextEvent, type Event as SdkEvent } from "../src/sdk/events.js";

class MockSDKClient implements SDKClient {
  constructor(
    private responseText = "Mock response",
    private promisePhrase = "",
    private simulatePromise = false
  ) {}

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async createSession(): Promise<void> {}
  async destroySession(): Promise<void> {}
  model(): string {
    return "mock-model";
  }

  async sendPrompt(_signal: AbortSignal, _prompt: string): Promise<AsyncQueue<SdkEvent>> {
    const events = new AsyncQueue<SdkEvent>(10);

    const text = this.simulatePromise && this.promisePhrase
      ? `${this.responseText} <promise>${this.promisePhrase}</promise>`
      : this.responseText;

    queueMicrotask(() => {
      if (_signal.aborted) {
        events.close();
        return;
      }
      events.push(new TextEvent(text, false));
      events.close();
    });

    return events;
  }
}

class SlowMockSDKClient extends MockSDKClient {
  constructor(private delayMs: number) {
    super("Slow response");
  }

  async sendPrompt(signal: AbortSignal, _prompt: string): Promise<AsyncQueue<SdkEvent>> {
    const events = new AsyncQueue<SdkEvent>(10);

    const timer = setTimeout(() => {
      if (!signal.aborted) {
        events.push(new TextEvent("Slow response", false));
      }
      events.close();
    }, this.delayMs);

    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        events.close();
      },
      { once: true }
    );

    return events;
  }
}

const buildConfig = (overrides: Partial<LoopConfig> = {}): LoopConfig => ({
  ...defaultLoopConfig(),
  prompt: "Test task",
  ...overrides
});

const drainEvents = async (engine: LoopEngine): Promise<unknown[]> => {
  const events: unknown[] = [];
  for await (const event of engine.eventsStream()) {
    events.push(event);
  }
  return events;
};

describe("detectPromise", () => {
  it("matches wrapped promise phrase", () => {
    expect(detectPromise("<promise>I'm done!</promise>", "I'm done!")).toBe(true);
  });

  it("is case sensitive", () => {
    expect(detectPromise("<promise>IM DONE!</promise>", "I'm done!")).toBe(false);
  });

  it("returns false for empty promise", () => {
    expect(detectPromise("done", "")).toBe(false);
  });
});

describe("LoopEngine", () => {
  it("completes after max iterations", async () => {
    const sdk = new MockSDKClient();
    const config = buildConfig({ maxIterations: 3, promisePhrase: "never" });
    const engine = new LoopEngine(config, sdk);

    const result = await engine.start(new AbortController().signal);

    expect(result.state).toBe("complete");
    expect(result.iterations).toBe(3);
  });

  it("emits promise detected event", async () => {
    const sdk = new MockSDKClient("done", "DONE", true);
    const config = buildConfig({ maxIterations: 1, promisePhrase: "DONE" });
    const engine = new LoopEngine(config, sdk);

    const eventsPromise = drainEvents(engine);
    await engine.start(new AbortController().signal);
    const events = await eventsPromise;

    const promiseEvent = events.find((event) => event instanceof PromiseDetectedEvent);
    expect(promiseEvent).toBeDefined();
  });

  it("completes early when promise is detected", async () => {
    const sdk = new MockSDKClient("done", "DONE", true);
    const config = buildConfig({ maxIterations: 4, promisePhrase: "DONE" });
    const engine = new LoopEngine(config, sdk);

    const result = await engine.start(new AbortController().signal);

    expect(result.state).toBe("complete");
    expect(result.iterations).toBe(1);
  });

  it("cancels when aborted", async () => {
    const sdk = new SlowMockSDKClient(200);
    const config = buildConfig({ maxIterations: 5, promisePhrase: "never" });
    const engine = new LoopEngine(config, sdk);
    const controller = new AbortController();

    const startPromise = engine.start(controller.signal);
    setTimeout(() => controller.abort(ErrLoopCancelled), 50);
    const result = await startPromise;

    expect(result.state).toBe("cancelled");
    expect(result.error).toBe(ErrLoopCancelled);
  });

  it("fails on timeout", async () => {
    const sdk = new SlowMockSDKClient(200);
    const config = buildConfig({ maxIterations: 10, timeoutMs: 100 });
    const engine = new LoopEngine(config, sdk);

    const result = await engine.start(new AbortController().signal);

    expect(result.state).toBe("failed");
    expect(result.error).toBe(ErrLoopTimeout);
  });
});

describe("ToolEvent", () => {
  it("formats info with parameters", () => {
    const event = new ToolEvent("edit", { path: "file.txt", line: 2 }, 1);
    const info = event.info("!");
    expect(info).toContain("edit");
    expect(info).toContain("file.txt");
  });
});
