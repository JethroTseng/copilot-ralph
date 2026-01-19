import type { ToolCall } from "./tool-call.js";

export interface Message {
  timestamp: Date;
  content: string;
  toolCalls: ToolCall[];
}
