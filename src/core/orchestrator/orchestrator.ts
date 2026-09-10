import type { KairosOrchestrator } from "./interface.js";
import type {
  OrchestrationRequest,
  OrchestrationResult,
} from "./types.js";
import { OrchestrationError } from "./errors.js";
import {
  executePipeline,
  type PipelineDependencies,
  type PipelineContext,
} from "./pipeline.js";
import type { Reflection } from "../reflection/types.js";

export class BasicKairosOrchestrator
  implements KairosOrchestrator
{
  constructor(
    private readonly dependencies: PipelineDependencies,
  ) {}

  async run(
    request: OrchestrationRequest,
  ): Promise<OrchestrationResult> {
    const maxCycles = request.maxCycles ?? 1;

    if (!request.goal.trim()) {
      throw new OrchestrationError(
        "Orchestration goal cannot be empty.",
      );
    }

    if (maxCycles < 1) {
      throw new OrchestrationError(
        "maxCycles must be at least 1.",
      );
    }

    let previousReflection: Reflection | undefined;

    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
      try {
        const context: PipelineContext =
          previousReflection !== undefined
            ? { cycle, previousReflection }
            : { cycle };

        const result = await executePipeline(
          request.goal,
          this.dependencies,
          context,
        );

        previousReflection = result.reflection;

        if (result.evaluation.completed) {
          return {
            goal: request.goal,
            status: "completed",
            cycles: cycle,
            ...result,
            terminationReason: "Objective completed.",
          };
        }
      } catch (error) {
        throw new OrchestrationError(
          `KAIROS orchestration failed during cycle ${cycle}.`,
          error,
        );
      }
    }

    return {
      goal: request.goal,
      status: "running",
      cycles: maxCycles,
      ...(previousReflection !== undefined
        ? { reflection: previousReflection }
        : {}),
      terminationReason:
        "Maximum orchestration cycles reached.",
    };
  }
}
