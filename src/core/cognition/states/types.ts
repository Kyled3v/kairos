export const COGNITIVE_STATES = [
  "GOAL",
  "UNDERSTAND",
  "REASON",
  "PLAN",
  "DECIDE",
  "ACT",
  "OBSERVE",
  "EVALUATE",
  "REFLECT",
  "COMPLETE",
] as const;

export type CognitiveState = (typeof COGNITIVE_STATES)[number];

export function isCognitiveState(value: string): value is CognitiveState {
  return (COGNITIVE_STATES as readonly string[]).includes(value);
}
