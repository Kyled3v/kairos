import { describe, expect, it } from "vitest";
import { ModelRouter } from "../../src/intelligence/models/router.js";
import { AnthropicProvider } from "../../src/intelligence/models/providers/anthropic-provider.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";
import { SessionOrchestrator } from "../../src/core/orchestrator/session-orchestrator.js";

const apiKey = process.env["ANTHROPIC_API_KEY"];

// Skipped by default: only runs when ANTHROPIC_API_KEY is set in the
// environment, so `npm test` never makes a real network call or incurs
// cost unless explicitly opted in. Set ANTHROPIC_TEST_MODEL to override
// the default model used.
describe.skipIf(apiKey === undefined)("Real Anthropic provider integration", () => {
  it("runs a full cognitive session against a live model", async () => {
    const router = new ModelRouter();
    router.register(new AnthropicProvider({ apiKey: apiKey as string }));

    const dependencies = createPipelineDependencies({
      mode: "model",
      router,
      providerId: "anthropic",
      modelId: process.env["ANTHROPIC_TEST_MODEL"] ?? "claude-3-5-haiku-20241022",
    });

    const session = new SessionOrchestrator(dependencies, { maxCycles: 1 });
    const result = await session.run("Say hello in exactly one short sentence.");

    expect(result.totalCycles).toBeGreaterThan(0);
    expect(result.finalReasoning?.conclusion.length ?? 0).toBeGreaterThan(0);
  }, 30000);
});