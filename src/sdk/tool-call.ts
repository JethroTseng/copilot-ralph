export interface ToolCall {
  id: string;
  name: string;
  parameters: Record<string, unknown>;
}
