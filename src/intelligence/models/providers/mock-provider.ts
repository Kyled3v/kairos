import type {
  ModelProvider,
  ModelRequest,
  ModelResponse,
} from "../types.js";

export class MockModelProvider implements ModelProvider {
  readonly id = "mock";
  readonly name = "KAIROS Mock Provider";

  async generate(
    request: ModelRequest,
  ): Promise<ModelResponse> {
    const userMessage =
      [...request.messages]
        .reverse()
        .find((message) => message.role === "user")
        ?.content ?? "";

    return {
      content: `Mock reasoning response for: ${userMessage}`,
      model: request.model,
      provider: this.id,
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
      finishReason: "stop",
    };
  }
}
