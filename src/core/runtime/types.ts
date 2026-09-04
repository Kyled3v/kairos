import type { CognitiveState } from "../cognition/states/types.js";
import type { ReasoningResult } from "../reasoning/types.js";
import type { Plan } from "../planning/types.js";
import type { Decision } from "../decision/types.js";
import type { AuthorizationDecision } from "../../security/authorization/types.js";
import type { ActionResult } from "../action/types.js";
import type { Observation } from "../observation/types.js";
import type { Evaluation } from "../evaluation/types.js";
import type { Reflection } from "../reflection/types.js";

export interface KairosExecution {
  readonly id: string;
  readonly goal: string;
  readonly currentState: CognitiveState;
  readonly cycle: number;
  readonly reasoning?: ReasoningResult;
  readonly plan?: Plan;
  readonly decision?: Decision;
  readonly authorization?: AuthorizationDecision;
  readonly action?: ActionResult;
  readonly observation?: Observation;
  readonly evaluation?: Evaluation;
  readonly reflection?: Reflection;
  readonly completed: boolean;
  readonly terminationReason?: string;
  readonly createdAt: Date;
  readonly completedAt?: Date;
}
