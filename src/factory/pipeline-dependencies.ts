import { BasicReasoningEngine } from "../core/reasoning/engine/basic-engine.js";
import { BasicPlanningEngine } from "../core/planning/basic-engine.js";
import { BasicDecisionEngine } from "../core/decision/engine/basic-engine.js";
import { BasicObservationEngine } from "../core/observation/basic-engine.js";
import { BasicEvaluationEngine } from "../core/evaluation/basic-engine.js";
import { BasicReflectionEngine } from "../core/reflection/basic-engine.js";
import { ModelReasoningEngine } from "../intelligence/reasoning/model-reasoning-engine.js";
import { ModelPlanningEngine } from "../intelligence/planning/model-planning-engine.js";
import { ModelDecisionEngine } from "../intelligence/decision/model-decision-engine.js";
import { ModelEvaluationEngine } from "../intelligence/evaluation/model-evaluation-engine.js";
import { ModelReflectionEngine } from "../intelligence/reflection/model-reflection-engine.js";
import { ModelRouter } from "../intelligence/models/router.js";
import { ToolAwareObservationEngine } from "../core/observation/tool-aware-engine.js";
import { ToolAwareDecisionEngine } from "../core/decision/engine/tool-aware-engine.js";
import { ToolSelectionPolicy } from "../core/tools/selection-policy.js";
import type { ToolInvoker } from "../core/tools/types.js";
import type { ToolRegistry } from "../core/tools/registry.js";
import type { PipelineDependencies } from "../core/orchestrator/pipeline.js";

export interface StreamingOptions {
  readonly streaming?: boolean;
  readonly onDelta?: (stage: string, delta: string) => void;
}

export interface BasicPipelineConfig {
  readonly mode: "basic";
  readonly toolGateway?: ToolInvoker;
  readonly toolRegistry?: ToolRegistry;
  readonly actorId?: string;
  readonly streaming?: StreamingOptions;
}

export interface ModelPipelineConfig {
  readonly mode: "model";
  readonly router: ModelRouter;
  readonly providerId: string;
  readonly modelId: string;
  readonly toolGateway?: ToolInvoker;
  readonly toolRegistry?: ToolRegistry;
  readonly actorId?: string;
  readonly streaming?: StreamingOptions;
}

export type PipelineConfig = BasicPipelineConfig | ModelPipelineConfig;

export function createPipelineDependencies(
  config: PipelineConfig,
): PipelineDependencies {
  const observationStage =
    config.toolGateway !== undefined
      ? new ToolAwareObservationEngine(config.toolGateway, {
          ...(config.actorId !== undefined ? { actorId: config.actorId } : {}),
        })
      : undefined;

  const basicObservation = new BasicObservationEngine();

  const observe: PipelineDependencies["observe"] = (_goal, decision) =>
    observationStage !== undefined
      ? observationStage.observeDecision(decision)
      : basicObservation.observe({
          actionId: decision.selectedOptionId ?? "unknown",
          actualOutcome: { status: "completed", decision },
        });

  if (config.mode === "model") {
    const reasoning = new ModelReasoningEngine(config.router, {
      providerId: config.providerId,
      modelId: config.modelId,
      ...(config.streaming?.streaming === true ? { streaming: true } : {}),
      ...(config.streaming?.onDelta !== undefined
        ? { onDelta: (d: string) => config.streaming?.onDelta?.("reason", d) }
        : {}),
    });
    const planning = new ModelPlanningEngine(config.router, {
      providerId: config.providerId,
      modelId: config.modelId,
    });

    let decisionEngine = new ModelDecisionEngine(config.router, {
      providerId: config.providerId,
      modelId: config.modelId,
    });

    const evaluation = new ModelEvaluationEngine(config.router, {
      providerId: config.providerId,
      modelId: config.modelId,
    });
    const reflection = new ModelReflectionEngine(config.router, {
      providerId: config.providerId,
      modelId: config.modelId,
    });

    const decisionStage =
      config.toolRegistry !== undefined
        ? new ToolAwareDecisionEngine(
            decisionEngine,
            new ToolSelectionPolicy({ registry: config.toolRegistry }),
          )
        : decisionEngine;

    return {
      reason: (g) => reasoning.reason({ goal: g, observations: [], constraints: [] }),
      plan: (g, r) => planning.plan({ goal: g, reasoning: r }),
      decide: (g, p) => decisionStage.decide({ goal: g, plan: p, authorized: true }),
      observe,
      evaluate: (g, o) => evaluation.evaluate({ goal: g, observation: o }),
      reflect: (g, e) => reflection.reflect({ goal: g, evaluation: e }),
    };
  }

  let basicDecision = new BasicDecisionEngine();

  const basicDecisionStage =
    config.toolRegistry !== undefined
      ? new ToolAwareDecisionEngine(
          basicDecision,
          new ToolSelectionPolicy({ registry: config.toolRegistry }),
        )
      : basicDecision;

  const reasoning = new BasicReasoningEngine();
  const planning = new BasicPlanningEngine();
  const evaluation = new BasicEvaluationEngine();
  const reflection = new BasicReflectionEngine();

  return {
    reason: (g) => reasoning.reason({ goal: g, observations: [], constraints: [] }),
    plan: (g, r) => planning.plan({ goal: g, reasoning: r }),
    decide: (g, p) => basicDecisionStage.decide({ goal: g, plan: p, authorized: true }),
    observe,
    evaluate: (g, o) => evaluation.evaluate({ goal: g, observation: o }),
    reflect: (g, e) => reflection.reflect({ goal: g, evaluation: e }),
  };
}
