import type { ModelMessage } from "../models/types.js";
import { ModelRouter } from "../models/router.js";
import type { Decision, DecisionOption } from "../../core/decision/types.js";
import type { DecisionContext, DecisionEngine } from "../../core/decision/engine/types.js";

export interface ModelDecisionOptions {
  readonly providerId: string;
  readonly modelId: string;
  readonly systemPrompt?: string;
}

export class ModelDecisionEngine implements DecisionEngine {
  constructor(
    private readonly router: ModelRouter,
    private readonly options: ModelDecisionOptions,
  ) {}

  async decide(context: DecisionContext): Promise<Decision> {
    if (!context.authorized) {
      const options: DecisionOption[] = context.plan.steps.map(
        (step, index) => ({
          id: step.id,
          description: step.description,
          goalFit: Math.max(0, 1 - index * 0.1),
          confidence: Math.max(0, 1 - index * 0.1),
          risk: Math.min(1, index * 0.2),
          authorized: false,
        }),
      );

      return {
        rationale: "Execution is blocked because authorization is unavailable.",
        confidence: 0,
        requiresAuthorization: true,
        blocked: true,
        options,
      };
    }

    const stepList = context.plan.steps
      .map((s) => `- id: ${s.id} | description: ${s.description}`)
      .join("\n");

    const messages: ModelMessage[] = [
      {
        role: "system",
        content:
          this.options.systemPrompt ??
          "You are KAIROS, an autonomous decision engine. Given a goal and a set of plan steps, select the best step to execute first. Respond ONLY with valid JSON: { \"selectedOptionId\": string, \"rationale\": string, \"confidence\": number }. No markdown, no extra text.",
      },
      {
        role: "user",
        content: [
          `Goal: ${context.goal}`,
          "",
          "Available steps:",
          stepList,
          "",
          "Select the best step now.",
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
      },
    );

    const options: DecisionOption[] = context.plan.steps.map(
      (step, index) => ({
        id: step.id,
        description: step.description,
        goalFit: Math.max(0, 1 - index * 0.1),
        confidence: Math.max(0, 1 - index * 0.1),
        risk: Math.min(1, index * 0.2),
        authorized: true,
      }),
    );

    return this.parseResponse(response.content, context.goal, options);
  }

  private parseResponse(
    content: string,
    goal: string,
    options: readonly DecisionOption[],
  ): Decision {
    const fallbackId = options[0]?.id;

    try {
      const clean = content
        .replace(/^```(?:json)?/m, "")
        .replace(/```$/m, "")
        .trim();

      const parsed = JSON.parse(clean) as {
        selectedOptionId?: unknown;
        rationale?: unknown;
        confidence?: unknown;
      };

      const resolvedId =
        typeof parsed.selectedOptionId === "string" &&
        options.some((o) => o.id === parsed.selectedOptionId)
          ? parsed.selectedOptionId
          : fallbackId;

      const rationale =
        typeof parsed.rationale === "string"
          ? parsed.rationale
          : `Selected best option for: ${goal}`;

      const confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.7;

      return resolvedId !== undefined
        ? { selectedOptionId: resolvedId, rationale, confidence, requiresAuthorization: false, blocked: false, options }
        : { rationale, confidence, requiresAuthorization: false, blocked: false, options };
    } catch {
      return fallbackId !== undefined
        ? { selectedOptionId: fallbackId, rationale: `Fallback decision for: ${goal}`, confidence: 0.5, requiresAuthorization: false, blocked: false, options }
        : { rationale: `Fallback decision for: ${goal}`, confidence: 0.5, requiresAuthorization: false, blocked: false, options };
    }
  }
}