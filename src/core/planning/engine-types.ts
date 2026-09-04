import type { Plan } from "./types.js";
import type { ReasoningResult } from "../reasoning/types.js";

export interface PlanningContext {
  readonly goal: string;
  readonly reasoning: ReasoningResult;
}

export interface PlanningEngine {
  plan(context: PlanningContext): Promise<Plan>;
}
