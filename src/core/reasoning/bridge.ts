import type { CognitiveContext } from "../cognition/context.js";
import type { ReasoningContext, ReasoningResult } from "./types.js";
import type { ReasoningEngine } from "./engine/types.js";

export function createReasoningContext(
  context: CognitiveContext,
): ReasoningContext {
  return {
    goal: context.goal,
    observations: context.observations,
    constraints: [],
  };
}

export async function reasonWithContext(
  engine: ReasoningEngine,
  context: CognitiveContext,
): Promise<ReasoningResult> {
  const reasoningContext = createReasoningContext(context);

  return engine.reason(reasoningContext);
}
