import type { ModelMessage } from "../models/types.js";
import { ModelRouter } from "../models/router.js";
import type {
  ReasoningContext,
  ReasoningResult,
} from "../../core/reasoning/types.js";
import type { ReasoningEngine } from "../../core/reasoning/engine/types.js";

export interface ModelReasoningOptions {
  readonly providerId: string;
  readonly modelId: string;
  readonly systemPrompt?: string;
}

export class ModelReasoningEngine
  implements ReasoningEngine
{
  constructor(
    private readonly router: ModelRouter,
    private readonly options: ModelReasoningOptions,
  ) {}

  async reason(
    context: ReasoningContext,
  ): Promise<ReasoningResult> {
    const messages: ModelMessage[] = [
      {
        role: "system",
        content:
          this.options.systemPrompt ??
          "You are KAIROS, an artificial intelligence reasoning system. Analyze the supplied goal carefully and produce a concise conclusion with explicit reasoning steps.",
      },
      {
        role: "user",
        content: [
          `Goal: ${context.goal}`,
          "",
          "Observations:",
          ...context.observations.map(
            (observation) => `- ${observation}`,
          ),
          "",
          "Constraints:",
          ...context.constraints.map(
            (constraint) => `- ${constraint}`,
          ),
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
      },
    );

    return {
      conclusion: response.content,
      confidence: 0.7,
      reasoningSteps: [
        "Constructed a model-backed reasoning context.",
        "Submitted the context through the model router.",
        "Received and incorporated the model response.",
      ],
    };
  }
}
