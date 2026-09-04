import type { CognitiveState } from "../states/types.js";

export const COGNITIVE_TRANSITIONS: Readonly<
  Record<CognitiveState, readonly CognitiveState[]>
> = {
  GOAL: ["UNDERSTAND"],
  UNDERSTAND: ["REASON"],
  REASON: ["PLAN"],
  PLAN: ["DECIDE"],
  DECIDE: ["ACT"],
  ACT: ["OBSERVE"],
  OBSERVE: ["EVALUATE"],
  EVALUATE: ["REFLECT"],
  REFLECT: ["UNDERSTAND", "COMPLETE"],
  COMPLETE: [],
};

export function canTransition(
  from: CognitiveState,
  to: CognitiveState,
): boolean {
  return COGNITIVE_TRANSITIONS[from].includes(to);
}
