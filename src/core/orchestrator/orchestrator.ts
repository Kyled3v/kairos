import type { KairosOrchestrator } from "./interface.js";
import type {
  OrchestrationRequest,
  OrchestrationResult,
} from "./types.js";
import { OrchestrationError } from "./errors.js";
import {
  executePipeline,
  type PipelineDependencies,
} from "./pipeline.js";

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

    let previousReflection;

    for (let cycle = 1; cycle <= maxCycles; cycle += 1) {
      try {
        const result = await executePipeline(
          request.goal,
          this.dependencies,
          {
            cycle,
            previousReflection,
          },
        );

        previousReflection = result.reflection;

        if (result.evaluation.completed) {
          return {
            goal: request.goal,
            status: "completed",
            cycles: cycle,
            ...result,
            terminationReason:
              "Objective completed.",
          };
        }
      } catch (error) {
        throw new OrchestrationError(
          `KAIROS orchestration failed during cycle ${cycle}.`,
          error,
        );
      }
    }

    // Omit optional properties entirely rather than assigning undefined
    // (required by exactOptionalPropertyTypes: true)
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
