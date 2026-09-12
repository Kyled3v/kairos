import type { ExperienceStore } from "../experience/record.js";
import type { PipelineDependencies, PipelineContext } from "../orchestrator/pipeline.js";
import type { ReasoningResult } from "../reasoning/types.js";

/**
 * Wraps PipelineDependencies to inject experience-derived insights into
 * the reasoning stage. Before each reason() call, the bridge queries the
 * experience store for past sessions with similar goals and prepends a
 * structured insight summary to the goal string passed to the reasoning
 * engine. This requires no changes to existing engine interfaces.
 */
export interface ExperienceFeedbackOptions {
  readonly store: ExperienceStore;
  readonly maxInsights?: number;
  readonly minOutcome?: "success" | "partial";
}

export function withExperienceFeedback(
  dependencies: PipelineDependencies,
  options: ExperienceFeedbackOptions,
): PipelineDependencies {
  const { store, maxInsights = 3 } = options;

  const reason = async (goal: string, context: PipelineContext): Promise<ReasoningResult> => {
    let enrichedGoal = goal;
    try {
      const keyword = goal.split(" ").slice(0, 4).join(" ");
      const past = await store.query({ goalContains: keyword, outcome: "success", limit: maxInsights });
      if (past.length > 0) {
        const insights = past
          .map((r, i) => `${i + 1}. Past session (${r.totalCycles} cycles): ${r.finalReflection !== undefined ? (r.finalReflection as { summary?: string }).summary ?? "completed" : "completed"}`)
          .join("\n");
        enrichedGoal = `${goal}\n\n[Experience insights from ${past.length} similar past session(s)]:\n${insights}`;
      }
    } catch {
      // Never block reasoning due to experience query failure
    }
    return dependencies.reason(enrichedGoal, context);
  };

  return { ...dependencies, reason };
}
