import type { CognitiveContext } from "../context.js";
import type { ReasoningResult } from "../../reasoning/types.js";
import type { ReasoningEngine } from "../../reasoning/engine/types.js";
import { reasonWithContext } from "../../reasoning/bridge.js";

export interface CognitiveReasoningResult {
  readonly context: CognitiveContext;
  readonly reasoning: ReasoningResult;
}

export async function executeReasoning(
  engine: ReasoningEngine,
  context: CognitiveContext,
): Promise<CognitiveReasoningResult> {
  if (context.state !== "REASON") {
    throw new Error(
      `Reasoning can only execute in the REASON state. Current state: ${context.state}`,
    );
  }

  const reasoning = await reasonWithContext(engine, context);

  return {
    context,
    reasoning,
  };
}
