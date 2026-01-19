import { AsyncQueue } from "../shared/async-queue.js";
import {
  ErrorEvent as SdkErrorEvent,
  TextEvent,
  ToolCallEvent,
  ToolResultEvent
} from "../sdk/events.js";

import { ErrLoopCancelled, ErrLoopTimeout } from "./errors.js";
import { defaultLoopConfig, type LoopConfig, type LoopResult, type LoopState } from "./loop-config.js";
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
} from "./loop-events.js";
import { detectPromise } from "./promise-detection.js";
import type { SDKClient } from "./sdk-client.js";

const eventChannelBufferSize = 100;

export class LoopEngine {
  private startTimeMs = 0;
  private events = new AsyncQueue<LoopEvent>(eventChannelBufferSize);
  private eventsClosed = false;
  private state: LoopState = "idle";
  private iteration = 0;
  private abortController: AbortController | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private promiseDetected = false;

  constructor(private config: LoopConfig, private sdk: SDKClient | null) {
    if (!this.config) {
      this.config = defaultLoopConfig();
    }
  }

  getState(): LoopState {
    return this.state;
  }

  getIteration(): number {
    return this.iteration;
  }

  getConfig(): LoopConfig {
    return this.config;
  }

  eventsStream(): AsyncIterable<LoopEvent> {
    return this.events;
  }

  async start(signal?: AbortSignal): Promise<LoopResult> {
    if (this.state !== "idle") {
      throw new Error("loop already running");
    }

    const controller = new AbortController();
    this.abortController = controller;

    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener("abort", () => controller.abort(signal.reason), {
          once: true
        });
      }
    }

    if (this.config.timeoutMs > 0) {
      this.timeoutId = setTimeout(() => {
        controller.abort(ErrLoopTimeout);
      }, this.config.timeoutMs);
    }

    this.state = "running";
    this.startTimeMs = Date.now();
    this.iteration = 0;
    this.promiseDetected = false;

    try {
      this.emit(new LoopStartEvent(this.config));

      if (this.sdk) {
        try {
          await this.sdk.start();
        } catch (err) {
          const error = err instanceof Error ? err : new Error("sdk start failed");
          throw new Error(`failed to start SDK: ${error.message}`);
        }

        try {
          await this.sdk.createSession(controller.signal);
        } catch (err) {
          const error = err instanceof Error ? err : new Error("session creation failed");
          throw new Error(`failed to create SDK session: ${error.message}`);
        }
      }

      const result = await this.runLoop(controller.signal);

      if (this.sdk) {
        if (result.state === "cancelled") {
          void this.backgroundCleanup();
        } else {
          await this.cleanup();
        }
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error("loop failed");
      const result = await this.fail(error);
      return result;
    } finally {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
      }
      this.eventsClosed = true;
      this.events.close();
    }
  }

  private async runLoop(signal: AbortSignal): Promise<LoopResult> {
    while (true) {
      const result = this.preIterationCheck(signal);
      if (result) {
        return result;
      }

      try {
        await this.executeIteration(signal);
      } catch (err) {
        const error = err instanceof Error ? err : new Error("iteration failed");
        if (error === ErrLoopTimeout || signal.reason === ErrLoopTimeout) {
          return this.fail(ErrLoopTimeout);
        }
        if (error === ErrLoopCancelled || signal.aborted) {
          return this.cancelled();
        }

        return this.fail(new Error(`iteration ${this.iteration} failed: ${error.message}`));
      }

      if (this.promiseDetected) {
        return this.complete();
      }
    }
  }

  private preIterationCheck(signal: AbortSignal): LoopResult | null {
    if (signal.aborted) {
      return this.cancelled();
    }

    if (this.state === "cancelled") {
      return this.cancelled();
    }

    if (this.config.timeoutMs > 0) {
      const elapsed = Date.now() - this.startTimeMs;
      if (elapsed > this.config.timeoutMs) {
        return this.fail(ErrLoopTimeout);
      }
    }

    if (this.config.maxIterations > 0 && this.iteration >= this.config.maxIterations) {
      return this.complete();
    }

    return null;
  }

  private async executeIteration(signal: AbortSignal): Promise<void> {
    this.iteration += 1;
    const iteration = this.iteration;

    const iterationStart = Date.now();
    this.emit(new IterationStartEvent(iteration, this.config.maxIterations));

    const prompt = this.buildIterationPrompt(iteration);

    if (this.sdk) {
      const events = await this.sdk.sendPrompt(signal, prompt);

      for await (const event of events) {
        if (signal.aborted) {
          throw ErrLoopCancelled;
        }

        if (event instanceof TextEvent) {
          this.emit(new AIResponseEvent(event.text, iteration));

          if (!event.reasoning && detectPromise(event.text, this.config.promisePhrase)) {
            this.promiseDetected = true;
            this.emit(new PromiseDetectedEvent(this.config.promisePhrase, "ai_response", iteration));
          }
        }

        if (event instanceof ToolCallEvent) {
          this.emit(
            new ToolExecutionStartEvent(
              event.toolCall.name,
              event.toolCall.parameters,
              iteration
            )
          );
        }

        if (event instanceof ToolResultEvent) {
          this.emit(
            new ToolExecutionEvent(
              event.toolCall.name,
              event.toolCall.parameters,
              event.result,
              event.error,
              0,
              iteration
            )
          );
        }

        if (event instanceof SdkErrorEvent) {
          const err = event.err ?? new Error("SDK error");
          this.emit(new ErrorEvent(err, iteration, true));
        }
      }

      if (signal.aborted) {
        throw ErrLoopCancelled;
      }
    }

    const iterationDuration = Date.now() - iterationStart;
    this.emit(new IterationCompleteEvent(iteration, iterationDuration));
  }

  private buildIterationPrompt(iteration: number): string {
    return `[Iteration ${iteration}/${this.config.maxIterations}]\n\n${this.config.prompt}`;
  }

  private complete(): LoopResult {
    this.state = "complete";
    const result = this.buildResult();
    this.emit(new LoopCompleteEvent(result));
    return result;
  }

  private fail(err: Error): LoopResult {
    this.state = "failed";
    const result = this.buildResult();
    result.error = err;
    this.emit(new LoopFailedEvent(err, result));
    return result;
  }

  private cancelled(): LoopResult {
    this.state = "cancelled";
    const result = this.buildResult();
    result.error = ErrLoopCancelled;
    this.emit(new LoopCancelledEvent(result));
    return result;
  }

  private buildResult(): LoopResult {
    return {
      state: this.state,
      iterations: this.iteration,
      durationMs: Date.now() - this.startTimeMs,
      error: null
    };
  }

  private emit(event: LoopEvent): void {
    if (this.eventsClosed) {
      return;
    }

    try {
      this.events.push(event);
    } catch {
      // Drop event if channel closed.
    }
  }

  private async backgroundCleanup(): Promise<void> {
    const deadline = Date.now() + 1000;
    await this.cleanupUntil(deadline);
  }

  private async cleanup(): Promise<void> {
    const deadline = Date.now() + 5000;
    await this.cleanupUntil(deadline);
  }

  private async cleanupUntil(deadlineMs: number): Promise<void> {
    if (!this.sdk) {
      return;
    }

    await Promise.race([this.sdk.destroySession(), sleepUntil(deadlineMs)]);
    await Promise.race([this.sdk.stop(), sleepUntil(deadlineMs)]);
  }
}

const sleepUntil = (deadlineMs: number): Promise<void> => {
  const remaining = Math.max(0, deadlineMs - Date.now());
  return new Promise((resolve) => setTimeout(resolve, remaining));
};
