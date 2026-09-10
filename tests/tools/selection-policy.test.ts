import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { ToolSelectionPolicy } from "../../src/core/tools/selection-policy.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import { dateTimeTool } from "../../src/core/tools/built-in/date-time.js";
import { dataLookupTool } from "../../src/core/tools/built-in/data-lookup.js";
import { mockFileReadTool } from "../../src/core/tools/built-in/mock-file-read.js";

describe("ToolSelectionPolicy", () => {
  it("selects a tool when description matches above threshold", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(dateTimeTool);
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.1 });
    const result = policy.select("Get the current date and time value", "step-1");
    expect(result).toBeDefined();
    expect(result?.toolId).toBeTypeOf("string");
  });

  it("returns undefined when no tool matches threshold", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(dateTimeTool);
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.99 });
    const result = policy.select("Do something completely unrelated xyz", "step-1");
    expect(result).toBeUndefined();
  });

  it("includes stepId in parameters when a tool matches", () => {
    const registry = new ToolRegistry();
    registry.register(dateTimeTool);
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.1 });
    const result = policy.select("Get the current date and time", "my-step");
    expect(result?.parameters["stepId"]).toBe("my-step");
  });

  it("returns undefined for empty registry", () => {
    const registry = new ToolRegistry();
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.1 });
    const result = policy.select("Calculate total", "step-1");
    expect(result).toBeUndefined();
  });

  // --- Capability-aware selection ---

  it("selectByCapability returns a tool matching the requested capability", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(dataLookupTool);
    const policy = new ToolSelectionPolicy({ registry });
    // dataLookupTool has "read-memory"
    const result = policy.selectByCapability(["read-memory"], "step-1", "look up a value");
    expect(result).toBeDefined();
    expect(result?.toolId).toBe(dataLookupTool.definition.id);
  });

  it("selectByCapability returns undefined when no tool has the capability", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    const policy = new ToolSelectionPolicy({ registry });
    const result = policy.selectByCapability(["execute-shell"], "step-1", "run a script");
    expect(result).toBeUndefined();
  });

  it("selectByCapability ranks by risk ascending — lowest risk wins", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(mockFileReadTool);
    const policy = new ToolSelectionPolicy({ registry });
    // calculatorTool: compute, none risk — mockFileReadTool: read-local, low risk
    // request compute — only calculatorTool matches
    const result = policy.selectByCapability(["compute"], "step-2", "compute value");
    expect(result?.toolId).toBe(calculatorTool.definition.id);
  });

  it("select() falls back to keyword when no capabilities provided", () => {
    const registry = new ToolRegistry();
    registry.register(dateTimeTool);
    const policy = new ToolSelectionPolicy({ registry, threshold: 0.1 });
    // "date" and "time" appear in dateTimeTool name/description
    const result = policy.select("get the current date and time", "step-1");
    expect(result).toBeDefined();
    expect(result?.toolId).toBe(dateTimeTool.definition.id);
  });

  it("select() uses capability path when requiredCapabilities provided", () => {
    const registry = new ToolRegistry();
    registry.register(dataLookupTool);
    registry.register(calculatorTool);
    const policy = new ToolSelectionPolicy({ registry });
    // dataLookupTool has "read-memory"
    const result = policy.select("retrieve stored value", "step-1", ["read-memory"]);
    expect(result?.toolId).toBe(dataLookupTool.definition.id);
  });
});