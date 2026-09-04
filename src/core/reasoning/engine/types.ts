import type { ReasoningContext, ReasoningResult } from "../types.js";

export interface ReasoningEngine {
  reason(context: ReasoningContext): Promise<ReasoningResult>;
}
