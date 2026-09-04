import type { KairosExecution } from "./types.js";

export interface KairosRuntime {
  execute(goal: string): Promise<KairosExecution>;
}
