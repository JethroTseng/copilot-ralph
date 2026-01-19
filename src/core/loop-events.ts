import type { LoopConfig, LoopResult } from "./loop-config.js";

export interface LoopEvent {
  type: string;
}

export class LoopStartEvent implements LoopEvent {
  readonly type = "loop_start";

  constructor(public config: LoopConfig) {}
}

export class LoopCompleteEvent implements LoopEvent {
  readonly type = "loop_complete";

  constructor(public result: LoopResult) {}
}

export class LoopFailedEvent implements LoopEvent {
  readonly type = "loop_failed";

  constructor(public error: Error, public result: LoopResult) {}
}

export class LoopCancelledEvent implements LoopEvent {
  readonly type = "loop_cancelled";

  constructor(public result: LoopResult) {}
}

export class IterationStartEvent implements LoopEvent {
  readonly type = "iteration_start";

  constructor(public iteration: number, public maxIterations: number) {}
}

export class IterationCompleteEvent implements LoopEvent {
  readonly type = "iteration_complete";

  constructor(public iteration: number, public durationMs: number) {}
}

export class AIResponseEvent implements LoopEvent {
  readonly type = "ai_response";

  constructor(public text: string, public iteration: number) {}
}

export class ToolEvent {
  constructor(
    public toolName: string,
    public parameters: Record<string, unknown>,
    public iteration: number
  ) {}

  info(emoji: string): string {
    if (!this.parameters || Object.keys(this.parameters).length === 0) {
      return `${emoji} ${this.toolName}`;
    }

    const values = Object.values(this.parameters).map((value) => `${value}`);
    return `${emoji} ${this.toolName}: ${values.join(", ")}`;
  }
}

export class ToolExecutionEvent extends ToolEvent implements LoopEvent {
  readonly type = "tool_execution";

  constructor(
    toolName: string,
    parameters: Record<string, unknown>,
    public result: string,
    public error: Error | null,
    public durationMs: number,
    iteration: number
  ) {
    super(toolName, parameters, iteration);
  }
}

export class ToolExecutionStartEvent extends ToolEvent implements LoopEvent {
  readonly type = "tool_execution_start";
}

export class PromiseDetectedEvent implements LoopEvent {
  readonly type = "promise_detected";

  constructor(
    public phrase: string,
    public source: string,
    public iteration: number
  ) {}
}

export class ErrorEvent implements LoopEvent {
  readonly type = "error";

  constructor(
    public error: Error,
    public iteration: number,
    public recoverable: boolean
  ) {}
}
