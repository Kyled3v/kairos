import { ModelRouter } from "../models/router.js";
import { ModelReasoningEngine } from "../reasoning/model-reasoning-engine.js";
import { ModelPlanningEngine } from "../planning/model-planning-engine.js";
import { ModelDecisionEngine } from "../decision/model-decision-engine.js";
import { ModelEvaluationEngine } from "../evaluation/model-evaluation-engine.js";
import { ModelReflectionEngine } from "../reflection/model-reflection-engine.js";
import { BasicObservationEngine } from "../../core/observation/basic-engine.js";
import { BasicKairosOrchestrator } from "../../core/orchestrator/orchestrator.js";
import type { OrchestrationResult } from "../../core/orchestrator/types.js";
import type { PipelineDependencies } from "../../core/orchestrator/pipeline.js";

export interface ModelRuntimeOptions {
  readonly providerId: string;
  readonly modelId: string;
  readonly maxCycles?: number;
}

export class ModelKairosRuntime {
  private readonly orchestrator: BasicKairosOrchestrator;

  constructor(
    router: ModelRouter,
    options: ModelRuntimeOptions,
  ) {
    const reasoning = new ModelReasoningEngine(router, {
      providerId: options.providerId,
      modelId: options.modelId,
    });

    const planning = new ModelPlanningEngine(router, {
      providerId: options.providerId,
      modelId: options.modelId,
    });

    const decision = new ModelDecisionEngine(router, {
      providerId: options.providerId,
      modelId: options.modelId,
    });

    const observation = new BasicObservationEngine();

    const evaluation = new ModelEvaluationEngine(router, {
      providerId: options.providerId,
      modelId: options.modelId,
    });

    const reflection = new ModelReflectionEngine(router, {
      providerId: options.providerId,
      modelId: options.modelId,
    });

    const dependencies: PipelineDependencies = {
      reason: (goal) =>
        reasoning.reason({ goal, observations: [], constraints: [] }),

      plan: (goal, reasoningResult) =>
        planning.plan({ goal, reasoning: reasoningResult }),

      decide: (goal, plan) =>
        decision.decide({ goal, plan, authorized: true }),

      observe: (_goal, dec) =>
        observation.observe({
          actionId: dec.selectedOptionId ?? "unknown",
          actualOutcome: { status: "completed", decision: dec },
        }),

      evaluate: (goal, obs) =>
        evaluation.evaluate({ goal, observation: obs }),

      reflect: (goal, eva) =>
        reflection.reflect({ goal, evaluation: eva }),
    };

    this.orchestrator = new BasicKairosOrchestrator(dependencies);
  }

  async run(
    goal: string,
    maxCycles?: number,
  ): Promise<OrchestrationResult> {
    return this.orchestrator.run({
      goal,
      ...(maxCycles !== undefined ? { maxCycles } : {}),
    });
  }
}