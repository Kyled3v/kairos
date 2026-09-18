import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { OrionAgent } from "../../../src/agents/research/orion-agent.js";
import type { OrionAgentOptions } from "../../../src/agents/research/orion-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { calculatorTool } from "../../../src/core/tools/built-in/calculator.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";

function makeOrion(overrides: Partial<OrionAgentOptions> = {}): OrionAgent {
  return new OrionAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

describe("OrionAgent", () => {
  it("has a stable identity describing the ORION research role", () => {
    const orion = makeOrion();
    expect(orion.identity.name).toBe("orion");
    expect(orion.identity.metadata.role).toBe("research");
    expect(orion.identity.metadata.specialty).toBe("research-and-discovery");
    expect(Array.isArray(orion.identity.metadata.capabilities)).toBe(true);
    expect(Array.isArray(orion.identity.metadata.constraints)).toBe(true);
    expect(orion.identity.metadata.constraints).toContain("read-only tool access");
  });

  it("runs a research goal and completes cycles", async () => {
    const orion = makeOrion();
    const result = await orion.research("Investigate the KAIROS test suite structure");
    expect(result.totalCycles).toBeGreaterThan(0);
    expect(result.goal).toBe("Investigate the KAIROS test suite structure");
  });

  it("only registers read-only research tools — no write or execute tools", () => {
    const orion = makeOrion();
    const ids = orion.toolRegistry.getAll().map((t) => t.definition.id);

    expect(ids).toContain("kairos.mock-http");
    expect(ids).toContain("kairos.data-lookup");
    expect(ids).toContain("kairos.read-file");
    expect(ids).toContain("kairos.list-directory");
    expect(ids).toContain("kairos.search-code");
    expect(ids).toContain("kairos.date-time");

    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
  });

  it("can disable filesystem research tools", () => {
    const orion = makeOrion({ allowFilesystemTools: false });
    const ids = orion.toolRegistry.getAll().map((t) => t.definition.id);
    expect(ids).not.toContain("kairos.read-file");
    expect(ids).not.toContain("kairos.list-directory");
    expect(ids).not.toContain("kairos.search-code");
    expect(ids).toContain("kairos.mock-http");
  });

  it("blocks write tools at the policy even if one is registered", async () => {
    const orion = makeOrion();
    orion.toolRegistry.register(writeFileTool);

    const decision = orion.policy.evaluate(orion.identity.id, writeFileTool.definition);
    expect(decision.allowed).toBe(false);

    const output = await orion.toolGateway.execute(orion.identity.id, {
      toolId: "kairos.write-file",
      parameters: { path: "/tmp/orion-should-not-write.txt", content: "nope" },
      requestedBy: orion.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("rejects extra tools that can write or execute", () => {
    expect(() => makeOrion({ extraTools: [writeFileTool] })).toThrow(/write|execute/i);
  });

  it("accepts safe extra tools", () => {
    const orion = makeOrion({ extraTools: [calculatorTool] });
    const ids = orion.toolRegistry.getAll().map((t) => t.definition.id);
    expect(ids).toContain("kairos.calculator");
  });

  it("records tool calls into experience records tagged with its session", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const orion = makeOrion({ experienceStore });

    // A manual gateway call must land in the next experience record,
    // proving the gateway → collector → session orchestrator wiring.
    await orion.toolGateway.execute(orion.identity.id, {
      toolId: "kairos.date-time",
      parameters: {},
      requestedBy: orion.identity.id,
      requestId: crypto.randomUUID(),
    });

    const result = await orion.research("Analyse the KAIROS repository layout");
    expect(result.totalCycles).toBeGreaterThan(0);

    const records = await experienceStore.query({ sessionId: orion.identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(orion.identity.id);
    const toolIds = records[0]?.toolCalls.map((tc) => tc.toolId) ?? [];
    expect(toolIds).toContain("kairos.date-time");
  });

  it("persists research findings as scoped semantic memories", async () => {
    const orion = makeOrion();
    await orion.rememberFinding(
      "KAIROS cognitive loop has 10 states from GOAL to COMPLETE",
      { topic: "cognitive-loop" },
    );

    const findings = await orion.findings("cognitive loop");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.content).toContain("10 states");
    expect(findings[0]?.metadata.topic).toBe("cognitive-loop");
  });

  it("keeps ORION findings isolated from other agents sharing the same store", async () => {
    const sharedMemory = new InMemoryMemoryStore();
    const orion = makeOrion({ memoryStore: sharedMemory });
    await orion.rememberFinding("ORION private research note", { topic: "private" });

    // A second agent over the same shared store must not see ORION's memory.
    const directView = await sharedMemory.retrieve({ query: "private" });
    expect(directView.every((m) => m.content.includes("ORION"))).toBe(true);

    const orionView = await orion.findings("private");
    expect(orionView).toHaveLength(1);
  });

  it("records a session summary as episodic memory and can recall it", async () => {
    const orion = makeOrion();
    const result = await orion.research("Summarise mock HTTP capabilities");
    const summary = await orion.recordSessionSummary(result);

    expect(summary).toContain("research session");
    const episodes = await orion.sessionHistory();
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes[0]?.type).toBe("episodic");
  });

  it("exchanges messages with other agents over a shared bus", () => {
    const bus = new AgentMessageBus();
    const orion = makeOrion({ messageBus: bus });

    const sent = orion.sendToAgent("atlas", "Research complete: 5 findings");
    expect(sent.from).toBe(orion.identity.id);

    const inbox = bus.drain("atlas");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toContain("5 findings");
  });

  it("throws when sending without a configured bus", () => {
    const orion = makeOrion();
    expect(() => orion.sendToAgent("atlas", "hello")).toThrow(/no message bus/i);
  });

  it("reports collected tool calls", async () => {
    const orion = makeOrion();
    await orion.toolGateway.execute(orion.identity.id, {
      toolId: "kairos.data-lookup",
      parameters: { key: "kairos.version" },
      requestedBy: orion.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(orion.getToolCalls().map((tc) => tc.toolId)).toContain("kairos.data-lookup");
  });
});
