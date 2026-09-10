import type { ModelMessage } from "../models/types.js";
import { ModelRouter } from "../models/router.js";
import type { Reflection, ReflectionContext, ReflectionEngine } from "../../core/reflection/types.js";

export interface ModelReflectionOptions {
  readonly providerId: string;
  readonly modelId: string;
  readonly systemPrompt?: string;
}

export class ModelReflectionEngine implements ReflectionEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly options: ModelReflectionOptions,
  ) {}

  async reflect(context: ReflectionContext): Promise<Reflection> {
    const messages: ModelMessage[] = [
      {
        role: "system",
        content:
          this.options.systemPrompt ??
          "You are KAIROS, an autonomous reflection engine. Given a goal and evaluation, reflect on what was learned and whether the task should continue. Respond ONLY with valid JSON: { \"summary\": string, \"lessons\": string[], \"continueTask\": boolean, \"reason\": string }. No markdown, no extra text.",
      },
      {
        role: "user",
        content: [
          `Goal: ${context.goal}`,
          "",
          "Evaluation:",
          `  success: ${context.evaluation.success}`,
          `  completed: ${context.evaluation.completed}`,
          `  score: ${context.evaluation.score}`,
          `  explanation: ${context.evaluation.explanation}`,
          `  discrepancies: ${context.evaluation.discrepancies.join(", ") || "none"}`,
          "",
          "Reflect now.",
        ].join("\n"),
      },
    ];

    const response = await this.router.generate(
      this.options.providerId,
      {
        model: this.options.modelId,
        messages,
        temperature: 0.3,
        maxTokens: 500,
        responseFormat: "json",
      },
    );

    return this.parseResponse(
      response.content,
      context.goal,
      context.evaluation.success,
    );
  }

  private parseResponse(
    content: string,
    goal: string,
    success: boolean,
  ): Reflection {
    try {
      const clean = content
        .replace(/^```(?:json)?/m, "")
        .replace(/```$/m, "")
        .trim();

      const parsed = JSON.parse(clean) as {
        summary?: unknown;
        lessons?: unknown;
        continueTask?: unknown;
        reason?: unknown;
      };

      const summary =
        typeof parsed.summary === "string"
          ? parsed.summary
          : `Reflection for: ${goal}`;

      const lessons = Array.isArray(parsed.lessons)
        ? parsed.lessons.filter((l): l is string => typeof l === "string")
        : [];

      const continueTask =
        typeof parsed.continueTask === "boolean"
          ? parsed.continueTask
          : !success;

      const reason =
        typeof parsed.reason === "string"
          ? parsed.reason
          : continueTask
            ? "Further cycles required."
            : "Objective achieved.";

      return { summary, lessons, continueTask, reason };
    } catch {
      return {
        summary: `Reflection parse failed for: ${goal}`,
        lessons: [],
        continueTask: !success,
        reason: success ? "Objective achieved." : "Further cycles required.",
      };
    }
  }
}