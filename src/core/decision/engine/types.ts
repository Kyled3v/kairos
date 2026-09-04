import type { Plan } from "../../planning/types.js";
import type { Decision } from "../types.js";

export interface DecisionContext {
  readonly goal: string;
  readonly plan: Plan;
  readonly authorized: boolean;
}

export interface DecisionEngine {
  decide(context: DecisionContext): Promise<Decision>;
}
