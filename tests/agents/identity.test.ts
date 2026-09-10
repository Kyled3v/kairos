import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../../src/agents/identity.js";

describe("AgentRegistry", () => {
  it("registers an agent and generates an id when none is given", () => {
    const registry = new AgentRegistry();
    const identity = registry.register({ name: "Researcher" });
    expect(identity.id).toBeDefined();
    expect(identity.name).toBe("Researcher");
    expect(registry.get(identity.id)).toEqual(identity);
  });

  it("accepts an explicit id", () => {
    const registry = new AgentRegistry();
    const identity = registry.register({ id: "agent-1", name: "Planner" });
    expect(identity.id).toBe("agent-1");
  });

  it("rejects registering the same id twice", () => {
    const registry = new AgentRegistry();
    registry.register({ id: "agent-1", name: "Planner" });
    expect(() => registry.register({ id: "agent-1", name: "Duplicate" })).toThrow();
  });

  it("lists and unregisters agents", () => {
    const registry = new AgentRegistry();
    registry.register({ id: "a1", name: "One" });
    registry.register({ id: "a2", name: "Two" });
    expect(registry.list()).toHaveLength(2);
    expect(registry.unregister("a1")).toBe(true);
    expect(registry.list()).toHaveLength(1);
    expect(registry.get("a1")).toBeUndefined();
  });
});