import { describe, expect, it } from "vitest";
import { ToolRegistry } from "../../src/core/tools/registry.js";
import { calculatorTool } from "../../src/core/tools/built-in/calculator.js";
import { dateTimeTool } from "../../src/core/tools/built-in/date-time.js";
import { mockFileReadTool } from "../../src/core/tools/built-in/mock-file-read.js";

describe("ToolRegistry", () => {
  it("registers and retrieves a tool", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    expect(registry.has("kairos.calculator")).toBe(true);
    expect(registry.get("kairos.calculator")?.definition.name).toBe("Calculator");
  });

  it("prevents duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    expect(() => registry.register(calculatorTool)).toThrow(
      "Tool already registered: kairos.calculator",
    );
  });

  it("queries by capability", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(dateTimeTool);
    registry.register(mockFileReadTool);

    const compute = registry.query({ capability: "compute" });
    expect(compute.length).toBe(2);

    const readLocal = registry.query({ capability: "read-local" });
    expect(readLocal.length).toBe(1);
  });

  it("queries by permission", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(mockFileReadTool);

    const publicTools = registry.query({ permission: "public" });
    expect(publicTools.length).toBe(1);
    expect(publicTools[0]?.definition.id).toBe("kairos.calculator");
  });

  it("queries enabled tools only", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    registry.register(dateTimeTool);

    const enabled = registry.getEnabled();
    expect(enabled.length).toBe(2);
  });

  it("unregisters a tool", () => {
    const registry = new ToolRegistry();
    registry.register(calculatorTool);
    expect(registry.unregister("kairos.calculator")).toBe(true);
    expect(registry.has("kairos.calculator")).toBe(false);
  });
});