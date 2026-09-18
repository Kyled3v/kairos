import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { AtlasAgent } from "../../../src/agents/executive/atlas-agent.js";
import { OrionAgent } from "../../../src/agents/research/orion-agent.js";
import { SageAgent } from "../../../src/agents/knowledge/sage-agent.js";
import type { SageAgentOptions } from "../../../src/agents/knowledge/sage-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";

function makeSage(overrides: Partial<SageAgentOptions> = {}): SageAgent {
  return new SageAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

describe("SageAgent", () => {
  it("has a stable identity describing the SAGE knowledge role", () => {
    const sage = makeSage();
    expect(sage.identity.name).toBe("sage");
    expect(sage.identity.metadata.role).toBe("knowledge");
    expect(sage.identity.metadata.specialty).toBe("knowledge-and-memory");
    expect(sage.identity.metadata.capabilities).toContain("knowledge-acquisition");
    expect(sage.identity.metadata.constraints).toContain("writes only to own memory scope");
  });

  it("registers the knowledge/source toolset — no write or execute tools", () => {
    const sage = makeSage();
    const ids = sage.toolRegistry.getAll().map((t) => t.definition.id);

    expect(ids).toContain("kairos.read-file");
    expect(ids).toContain("kairos.list-directory");
    expect(ids).toContain("kairos.search-code");
    expect(ids).toContain("kairos.data-lookup");
    expect(ids).toContain("kairos.date-time");

    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
  });

  it("rejects write/execute extras and blocks them at policy", async () => {
    expect(() => makeSage({ extraTools: [writeFileTool] })).toThrow(/write|execute/i);

    const sage = makeSage();
    sage.toolRegistry.register(runCommandTool);
    const output = await sage.toolGateway.execute(sage.identity.id, {
      toolId: "kairos.run-command",
      parameters: { command: "echo hacked" },
      requestedBy: sage.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("stores and recalls facts as scoped semantic memory", async () => {
    const sage = makeSage();
    await sage.learnFact("The cognitive loop starts at GOAL and ends at COMPLETE", {
      topic: "cognitive-loop",
    });

    const facts = await sage.recallFacts("cognitive loop");
    expect(facts).toHaveLength(1);
    expect(facts[0]?.type).toBe("semantic");
    expect(facts[0]?.metadata.source).toBe("sage");
    expect(facts[0]?.metadata.topic).toBe("cognitive-loop");
  });

  it("stores and recalls procedures as procedural memory", async () => {
    const sage = makeSage();
    await sage.learnProcedure("To release: run typecheck, then vitest, then commit.");

    const procedures = await sage.recallProcedures("release");
    expect(procedures).toHaveLength(1);
    expect(procedures[0]?.type).toBe("procedural");
  });

  it("ingests a batch of facts under one topic and records an ingest session", async () => {
    const sage = makeSage();
    const stored = await sage.ingest("tools", [
      "ToolPolicy evaluates enabled, risk and permission checks.",
      "ObservedToolGateway records every call into a collector.",
      "ToolSelectionPolicy ranks by risk then permission.",
    ]);

    expect(stored).toHaveLength(3);
    expect(stored.every((m) => m.metadata.topic === "tools")).toBe(true);

    const history = await sage.ingestHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.content).toContain('topic "tools"');
  });

  it("runs a knowledge goal through its own cognitive loop", async () => {
    const sage = makeSage();
    const result = await sage.organise("Index the memory subsystem documentation");
    expect(result.totalCycles).toBeGreaterThan(0);
  });

  it("records experience tagged with its own session id", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const sage = makeSage({ experienceStore });
    await sage.run("Organise findings");

    const records = await experienceStore.query({ sessionId: sage.identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(sage.identity.id);
  });

  it("keeps SAGE memories isolated from agents sharing the same store", async () => {
    const shared = new InMemoryMemoryStore();
    const sage = makeSage({ memoryStore: shared });
    const orion = new OrionAgent({ agentId: "orion", memoryStore: shared, session: { maxCycles: 1 } });

    await sage.learnFact("SAGE-only fact", { topic: "private" });
    await orion.rememberFinding("ORION-only note", {});

    const sageFacts = await sage.recallFacts("SAGE-only");
    expect(sageFacts).toHaveLength(1);

    const sageSeesOrion = await sage.memory.semantic.recall("ORION-only");
    expect(sageSeesOrion).toHaveLength(0);
  });

  it("exchanges messages over a shared bus", () => {
    const bus = new AgentMessageBus();
    const sage = makeSage({ messageBus: bus });

    const sent = sage.sendToAgent("atlas", "Knowledge base indexed");
    expect(sent.from).toBe(sage.identity.id);

    const inbox = bus.drain("atlas");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toContain("indexed");
  });

  it("is routed knowledge clauses by ATLAS smart strategy", async () => {
    const sage = makeSage({ agentId: "sage" });
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });

    const atlas = new AtlasAgent({
      memoryStore: new InMemoryMemoryStore(),
      session: { maxCycles: 1 },
    });
    atlas.addWorker(orion);
    atlas.addWorker(sage);

    const outcome = await atlas.orchestrate(
      "Research the tool gateway; then document the findings; then summarise the results",
      { record: false },
    );

    expect(outcome.delegationResults.length).toBeGreaterThanOrEqual(2);
    const sageTasks = outcome.delegationResults.filter((r) => r.toAgentId === "sage");
    expect(sageTasks.length).toBeGreaterThanOrEqual(1);
    // Research clause went to ORION, documentation clause to SAGE.
    expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
  });
});
