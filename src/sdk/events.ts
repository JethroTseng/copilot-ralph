import type { ToolCall } from "./tool-call.js";

export type EventType =
  | "text"
  | "tool_call"
  | "tool_result"
  | "response_complete"
  | "error";

export interface Event {
  type: EventType;
  timestamp: Date;
}

export class TextEvent implements Event {
  readonly type: EventType = "text";
  readonly timestamp = new Date();

  constructor(public text: string, public reasoning: boolean) {}
}

export class ToolCallEvent implements Event {
  readonly type: EventType = "tool_call";
  readonly timestamp = new Date();

  constructor(public toolCall: ToolCall) {}
}

export class ToolResultEvent implements Event {
  readonly type: EventType = "tool_result";
  readonly timestamp = new Date();

  constructor(
    public toolCall: ToolCall,
    public result: string,
    public error: Error | null
  ) {}
}

export class ErrorEvent implements Event {
  readonly type: EventType = "error";
  readonly timestamp = new Date();

  constructor(public err: Error | null) {}

  errorMessage(): string {
    if (!this.err) {
      return "";
    }

    return this.err.message;
  }
}
