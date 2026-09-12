import type { ModelMessage } from "../models/types.js";
import { ModelRouter } from "../models/router.js";
import type { Evaluation, EvaluationContext, EvaluationEngine } from "../../core/evaluation/types.js";

export interface ModelEvaluationOptions {
  readonly providerId: string;
  readonly modelId: string;
  readonly systemPrompt?: string;
  readonly streaming?: boolean;
  readonly onDelta?: (delta: string) => void;
}

export class ModelEvaluationEngine implements EvaluationEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly options: ModelEvaluationOptions,
  ) {}

  async evaluate(context: EvaluationContext): Promise<Evaluation> {
    const messages: ModelMessage[] = [
      {
        role: "system",
        content:
          this.options.systemPrompt ??
          "You are KAIROS, an autonomous evaluation engine. Given a goal and an observation, assess whether the goal was achieved. Respond ONLY with valid JSON: { \"success\": boolean, \"completed\": boolean, \"score\": number, \"explanation\": string, \"discrepancies\": string[] }. Score is 0.0 to 1.0. No markdown, no extra text.",
      },
      {
        role: "user",
        content: [
          `Goal: ${context.goal}`,
          "",
          "Observation:",
          `  source: ${context.observation.source}`,
          `  data: ${JSON.stringify(context.observation.data)}`,
          "",
          "Evaluate now.",
        ].join("\n"),
      },
    ];

    const response = await this.router.generate(
      this.options.providerId,
      {
        model: this.options.modelId,
        messages,
        temperature: 0.1,
        maxTokens: 500,
        responseFormat: "json",
        ...(this.options.streaming === true ? { streaming: true } : {}),
        ...(this.options.onDelta !== undefined ? { onDelta: this.options.onDelta } : {}),
      },
    );

    return this.parseResponse(response.content, context.goal);
  }

  private parseResponse(content: string, goal: string): Evaluation {
    try {
      const clean = content
        .replace(/^```(?:json)?/m, "")
        .replace(/```$/m, "")
        .trim();

      const parsed = JSON.parse(clean) as {
        success?: unknown;
        completed?: unknown;
        score?: unknown;
        explanation?: unknown;
        discrepancies?: unknown;
      };

      const success = parsed.success === true;
      const completed = parsed.completed === true;
      const score =
        typeof parsed.score === "number"
          ? Math.max(0, Math.min(1, parsed.score))
          : success ? 1 : 0;
      const explanation =
        typeof parsed.explanation === "string"
          ? parsed.explanation
          : `Model evaluation for: ${goal}`;
      const discrepancies = Array.isArray(parsed.discrepancies)
        ? parsed.discrepancies.filter((d): d is string => typeof d === "string")
        : [];

      return { success, completed, score, explanation, discrepancies };
    } catch {
      return {
        success: false,
        completed: false,
        score: 0,
        explanation: `Evaluation parse failed for: ${goal}`,
        discrepancies: ["Could not parse model evaluation response."],
      };
    }
  }
}
