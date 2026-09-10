import { describe, expect, it } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("CLI parseArgs", () => {
  it("parses a positional goal and flag values", () => {
    const args = parseArgs(["do the thing", "--cycles", "5", "--decompose", "--tools"]);
    expect(args["goal"]).toBe("do the thing");
    expect(args["cycles"]).toBe("5");
    expect(args["decompose"]).toBe(true);
    expect(args["tools"]).toBe(true);
  });

  it("parses provider flags", () => {
    const args = parseArgs([
      "goal text",
      "--provider",
      "anthropic",
      "--model",
      "claude-sonnet-4-6",
      "--api-key",
      "sk-test",
    ]);
    expect(args["provider"]).toBe("anthropic");
    expect(args["model"]).toBe("claude-sonnet-4-6");
    expect(args["api-key"]).toBe("sk-test");
  });

  it("parses the ollama flag as boolean when no value follows", () => {
    const args = parseArgs(["goal", "--ollama", "--model", "llama3"]);
    expect(args["ollama"]).toBe(true);
    expect(args["model"]).toBe("llama3");
  });

  it("parses --stream as boolean", () => {
    const args = parseArgs(["my goal", "--stream"]);
    expect(args["stream"]).toBe(true);
  });
});