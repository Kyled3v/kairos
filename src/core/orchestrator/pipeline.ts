import type { Decision } from "../decision/types.js";
import type { Evaluation } from "../evaluation/types.js";
import type { Observation } from "../observation/types.js";
import type { Plan } from "../planning/types.js";
import type { ReasoningResult } from "../reasoning/types.js";
import type { Reflection } from "../reflection/types.js";

export interface PipelineDependencies {
  readonly reason: (
    goal: string,
    context: PipelineContext,
  ) => Promise<ReasoningResult>;

  readonly plan: (
    goal: string,
    reasoning: ReasoningResult,
    context: PipelineContext,
  ) => Promise<Plan>;

  readonly decide: (
    goal: string,
    plan: Plan,
    context: PipelineContext,
  ) => Promise<Decision>;

  readonly observe: (
    goal: string,
    decision: Decision,
    context: PipelineContext,
  ) => Promise<Observation>;

  readonly evaluate: (
    goal: string,
    observation: Observation,
    context: PipelineContext,
  ) => Promise<Evaluation>;

  readonly reflect: (
    goal: string,
    evaluation: Evaluation,
    context: PipelineContext,
  ) => Promise<Reflection>;
}

export interface PipelineContext {
  readonly cycle: number;
  readonly previousReflection?: Reflection;
}

export interface PipelineResult {
  readonly reasoning: ReasoningResult;
  readonly plan: Plan;
  readonly decision: Decision;
  readonly observation: Observation;
  readonly evaluation: Evaluation;
  readonly reflection: Reflection;
}

export async function executePipeline(
  goal: string,
  dependencies: PipelineDependencies,
  context: PipelineContext,
): Promise<PipelineResult> {
  const reasoning = await dependencies.reason(goal, context);

  const plan = await dependencies.plan(
    goal,
    reasoning,
    context,
  );

  const decision = await dependencies.decide(
    goal,
    plan,
    context,
  );

  const observation = await dependencies.observe(
    goal,
    decision,
    context,
  );

  const evaluation = await dependencies.evaluate(
    goal,
    observation,
    context,
  );

  const reflection = await dependencies.reflect(
    goal,
    evaluation,
    context,
  );

  return {
    reasoning,
    plan,
    decision,
    observation,
    evaluation,
    reflection,
  };
}
