import type { Decision } from "../decision/types.js";
import type { Evaluation } from "../evaluation/types.js";
import type { Observation } from "../observation/types.js";
import type { Plan } from "../planning/types.js";
import type { ReasoningResult } from "../reasoning/types.js";
import type { Reflection } from "../reflection/types.js";
import { withSpan } from "../../telemetry/index.js";

export interface PipelineDependencies {
  readonly reason: (goal: string, context: PipelineContext) => Promise<ReasoningResult>;
  readonly plan: (goal: string, reasoning: ReasoningResult, context: PipelineContext) => Promise<Plan>;
  readonly decide: (goal: string, plan: Plan, context: PipelineContext) => Promise<Decision>;
  readonly observe: (goal: string, decision: Decision, context: PipelineContext) => Promise<Observation>;
  readonly evaluate: (goal: string, observation: Observation, context: PipelineContext) => Promise<Evaluation>;
  readonly reflect: (goal: string, evaluation: Evaluation, context: PipelineContext) => Promise<Reflection>;
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

const TRACER = "kairos.pipeline";

export async function executePipeline(
  goal: string,
  dependencies: PipelineDependencies,
  context: PipelineContext,
): Promise<PipelineResult> {
  return withSpan(TRACER, "pipeline.cycle", { "kairos.cycle": context.cycle, "kairos.goal": goal.slice(0, 120) }, async () => {

    const reasoning = await withSpan(TRACER, "pipeline.reason", { "kairos.cycle": context.cycle }, () =>
      dependencies.reason(goal, context));

    const plan = await withSpan(TRACER, "pipeline.plan", { "kairos.cycle": context.cycle }, () =>
      dependencies.plan(goal, reasoning, context));

    const decision = await withSpan(TRACER, "pipeline.decide", { "kairos.cycle": context.cycle }, () =>
      dependencies.decide(goal, plan, context));

    const observation = await withSpan(TRACER, "pipeline.observe", { "kairos.cycle": context.cycle }, () =>
      dependencies.observe(goal, decision, context));

    const evaluation = await withSpan(TRACER, "pipeline.evaluate",
      { "kairos.cycle": context.cycle },
      async (span) => {
        const result = await dependencies.evaluate(goal, observation, context);
        span.setAttribute("kairos.evaluation.score", result.score);
        span.setAttribute("kairos.evaluation.completed", result.completed);
        return result;
      });

    const reflection = await withSpan(TRACER, "pipeline.reflect", { "kairos.cycle": context.cycle }, () =>
      dependencies.reflect(goal, evaluation, context));

    return { reasoning, plan, decision, observation, evaluation, reflection };
  });
}
