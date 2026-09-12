import type { ModelMessage } from "../models/types.js";
import { ModelRouter } from "../models/router.js";
import type { Plan } from "../../core/planning/types.js";
import type { PlanningContext, PlanningEngine } from "../../core/planning/engine-types.js";

export interface ModelPlanningOptions {
  readonly providerId: string;
  readonly modelId: string;
  readonly systemPrompt?: string;
  readonly streaming?: boolean;
  readonly onDelta?: (delta: string) => void;
}

export class ModelPlanningEngine implements PlanningEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly options: ModelPlanningOptions,
  ) {}

  async plan(context: PlanningContext): Promise<Plan> {
    const messages: ModelMessage[] = [
      {
        role: "system",
        content:
          this.options.systemPrompt ??
          "You are KAIROS, an autonomous planning system. Given a goal and reasoning, produce a concise JSON plan with exactly three sequential steps. Respond ONLY with valid JSON matching this shape: { \"rationale\": string, \"steps\": [ { \"id\": string, \"description\": string, \"order\": number } ] }. No markdown, no explanation outside the JSON.",
      },
      {
        role: "user",
        content: [
          `Goal: ${context.goal}`,
          "",
          `Reasoning conclusion: ${context.reasoning.conclusion}`,
          "",
          "Produce the plan now.",
        ].join("\n"),
      },
    ];

    const response = await this.router.generate(
      this.options.providerId,
      {
        model: this.options.modelId,
        messages,
        temperature: 0.2,
        maxTokens: 1000,
        responseFormat: "json",
        ...(this.options.streaming === true ? { streaming: true } : {}),
        ...(this.options.onDelta !== undefined ? { onDelta: this.options.onDelta } : {}),
      },
    );

    return this.parseResponse(response.content, context.goal);
  }

  private parseResponse(content: string, goal: string): Plan {
    try {
      const clean = content
        .replace(/^```(?:json)?/m, "")
        .replace(/```$/m, "")
        .trim();

      const parsed = JSON.parse(clean) as {
        rationale?: unknown;
        steps?: unknown[];
      };

      const rationale =
        typeof parsed.rationale === "string"
          ? parsed.rationale
          : `Model-generated plan for: ${goal}`;

      const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : [];

      const steps = rawSteps
        .filter(
          (s): s is { id: unknown; description: unknown; order: unknown } =>
            typeof s === "object" && s !== null,
        )
        .map((s, index) => ({
          id: typeof s.id === "string" ? s.id : `step-${index + 1}`,
          description:
            typeof s.description === "string"
              ? s.description
              : `Step ${index + 1}`,
          order: typeof s.order === "number" ? s.order : index + 1,
        }));

      if (steps.length === 0) {
        return this.fallback(goal);
      }

      return { goal, rationale, steps };
    } catch {
      return this.fallback(goal);
    }
  }

  private fallback(goal: string): Plan {
    return {
      goal,
      rationale: `Fallback plan generated for: ${goal}`,
      steps: [
        { id: "step-1", description: "Clarify the requirements.", order: 1 },
        { id: "step-2", description: "Determine required actions.", order: 2 },
        { id: "step-3", description: "Evaluate the outcome.", order: 3 },
      ],
    };
  }
}
