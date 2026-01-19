export interface LoopConfig {
  prompt: string;
  promisePhrase: string;
  model: string;
  workingDir: string;
  maxIterations: number;
  timeoutMs: number;
  dryRun: boolean;
}

export type LoopState = "idle" | "running" | "complete" | "failed" | "cancelled";

export interface LoopResult {
  error: Error | null;
  state: LoopState;
  iterations: number;
  durationMs: number;
}

export const defaultLoopConfig = (): LoopConfig => ({
  prompt: "",
  maxIterations: 10,
  timeoutMs: 30 * 60 * 1000,
  promisePhrase: "任務完成！🥇",
  model: "gpt-5-mini",
  workingDir: ".",
  dryRun: false
});
