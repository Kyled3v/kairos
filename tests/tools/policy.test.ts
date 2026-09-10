import { describe, expect, it } from "vitest";
import { ToolPolicy } from "../../src/core/tools/policy.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import { mockFileReadTool } from "../../src/core/tools/built-in/mock-file-read.js";
import { mockFileWriteTool } from "../../src/core/tools/built-in/mock-file-write.js";
import type { ToolDefinition } from "../../src/core/tools/types.js";

const disabledTool: ToolDefinition = {
  ...calculatorTool.definition,
  id: "kairos.disabled-calculator",
  enabled: false,
};

describe("ToolPolicy", () => {
  it("allows a public tool for any actor", () => {
    const policy = new ToolPolicy({ actorPermissions: ["public"], maxRisk: "low" });
    const decision = policy.evaluate("kairos", calculatorTool.definition);
    expect(decision.allowed).toBe(true);
  });

  it("blocks a restricted tool for a public-only actor", () => {
    const policy = new ToolPolicy({ actorPermissions: ["public"], maxRisk: "low" });
    const decision = policy.evaluate("kairos", mockFileReadTool.definition);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("lacks permission");
  });

  it("allows a restricted tool for a restricted actor", () => {
    const policy = new ToolPolicy({ actorPermissions: ["public", "restricted"], maxRisk: "low" });
    const decision = policy.evaluate("kairos", mockFileReadTool.definition);
    expect(decision.allowed).toBe(true);
  });

  it("blocks a medium-risk tool when max risk is low", () => {
    const policy = new ToolPolicy({ actorPermissions: ["public", "restricted", "privileged"], maxRisk: "low" });
    const decision = policy.evaluate("kairos", mockFileWriteTool.definition);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("risk level");
  });

  it("allows a medium-risk tool when max risk is medium", () => {
    const policy = new ToolPolicy({ actorPermissions: ["public", "restricted", "privileged"], maxRisk: "medium" });
    const decision = policy.evaluate("kairos", mockFileWriteTool.definition);
    expect(decision.allowed).toBe(true);
  });

  it("blocks a disabled tool regardless of permission and risk", () => {
    const policy = new ToolPolicy({ actorPermissions: ["public", "restricted", "privileged", "admin"], maxRisk: "critical" });
    const decision = policy.evaluate("kairos", disabledTool);
    expect(decision.allowed).toBe(false);
    expect(decision.reason.toLowerCase()).toMatch(/disabled|not enabled/);
  });

  it("blocks a privileged tool for a restricted actor", () => {
    const policy = new ToolPolicy({ actorPermissions: ["public", "restricted"], maxRisk: "critical" });
    const decision = policy.evaluate("kairos", mockFileWriteTool.definition);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("lacks permission");
  });

  it("blocks a high-risk tool when maxRisk is low", () => {
    const highRiskTool: ToolDefinition = {
      ...calculatorTool.definition,
      id: "kairos.high-risk",
      risk: "high",
      permission: "public",
    };
    const policy = new ToolPolicy({ actorPermissions: ["public", "restricted", "privileged", "admin"], maxRisk: "low" });
    const decision = policy.evaluate("kairos", highRiskTool);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("risk level");
  });
});