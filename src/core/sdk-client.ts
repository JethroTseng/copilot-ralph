import type { Event as SdkEvent } from "../sdk/events.js";
import { AsyncQueue } from "../shared/async-queue.js";

export interface SDKClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  createSession(signal?: AbortSignal): Promise<void>;
  destroySession(signal?: AbortSignal): Promise<void>;
  sendPrompt(signal: AbortSignal, prompt: string): Promise<AsyncQueue<SdkEvent>>;
  model(): string;
}
