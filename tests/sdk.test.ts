import { describe, expect, it } from "vitest";

import {
  DefaultModel,
  isRetryableError,
  newCopilotClient,
  resolveCopilotCliPath,
  safeEventSender,
  withModel,
  withTimeout
} from "../src/sdk/client.js";
import { ErrorEvent, TextEvent, type Event as SdkEvent } from "../src/sdk/events.js";
import { AsyncQueue } from "../src/shared/async-queue.js";

const errorString = (message: string): Error => new Error(message);

describe("newCopilotClient", () => {
  it("uses defaults", () => {
    const client = newCopilotClient();
    expect(client.model()).toBe(DefaultModel);
  });

  it("rejects empty model", () => {
    expect(() => newCopilotClient(withModel(""))).toThrow(/model cannot be empty/);
  });

  it("rejects non-positive timeout", () => {
    expect(() => newCopilotClient(withTimeout(0))).toThrow(/timeout must be positive/);
  });
});

describe("safeEventSender", () => {
  it("returns error on closed channel", () => {
    const events = new AsyncQueue<SdkEvent>(1);
    events.close();
    const err = safeEventSender(events, new ErrorEvent(new Error("boom")));
    expect(err).toBeInstanceOf(Error);
  });

  it("sends event on open channel", () => {
    const events = new AsyncQueue<SdkEvent>(1);
    const err = safeEventSender(events, new TextEvent("hello", false));
    expect(err).toBeNull();
  });
});

describe("isRetryableError", () => {
  it("matches retryable messages", () => {
    expect(isRetryableError(errorString("HTTP/2 GOAWAY"))).toBe(true);
    expect(isRetryableError(errorString("connection reset"))).toBe(true);
    expect(isRetryableError(errorString("timeout"))).toBe(true);
  });

  it("ignores non-retryable errors", () => {
    expect(isRetryableError(errorString("invalid argument"))).toBe(false);
  });
});

describe("resolveCopilotCliPath", () => {
  it("prefers environment override", () => {
    const previous = process.env.COPILOT_CLI_PATH;
    process.env.COPILOT_CLI_PATH = "/custom/copilot.js";
    try {
      expect(resolveCopilotCliPath()).toBe("/custom/copilot.js");
    } finally {
      if (previous === undefined) {
        delete process.env.COPILOT_CLI_PATH;
      } else {
        process.env.COPILOT_CLI_PATH = previous;
      }
    }
  });
});
