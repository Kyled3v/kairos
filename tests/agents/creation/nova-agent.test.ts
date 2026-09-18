import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { AtlasAgent } from "../../../src/agents/executive/atlas-agent.js";
import { NovaAgent } from "../../../src/agents/creation/nova-agent.js";
import type { NovaAgentOptions } from "../../../src/agents/creation/nova-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";
import type { Tool } from "../../../src/core/tools/types.js";

const safeExtraTool: Tool = {
  definition: {
    id: "kairos.test-safe-extra",
    name: "Safe Extra",
    description: "Read-only tool used to prove extras registration works.",
    version: "1.0.0",
    capabilities: ["read-memory"],
    permission: "public",
    risk: "none",
    inputSchema: {},
    outputSchema: {},
    enabled: true,
  },
  async execute(input) {
    return {
      toolId: input.toolId,
      requestId: input.requestId,
      status: "success",
      result: { ok: true },
      executedAt: new Date(),
      durationMs: 0,
    };
  },
};
function makeNova(overrides: Partial<NovaAgentOptions> = {}): NovaAgent {
  return new NovaAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

describe("NovaAgent", () => {
  it("has a stable identity describing the NOVA creation role", () => {
    const nova = makeNova();
    expect(nova.identity.name).toBe("nova");
    expect(nova.identity.metadata.role).toBe("creation");
    expect(nova.identity.metadata.specialty).toBe("creation-and-synthesis");
    expect(nova.identity.metadata.capabilities).toContain("content-synthesis");
    expect(nova.identity.metadata.constraints).toContain("read-only tool access");
  });

  it("registers the creation toolset — read-only, no write or execute tools", () => {
    const nova = makeNova();
    const ids = nova.toolRegistry.getAll().map((t) => t.definition.id);

    expect(ids).toContain("kairos.date-time");
    expect(ids).toContain("kairos.calculator");
    expect(ids).toContain("kairos.data-lookup");
    expect(ids).toContain("kairos.mock-http");
    expect(ids).toContain("kairos.read-file");

    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
  });

  it("rejects write/execute extras and blocks them at policy", async () => {
    expect(() => makeNova({ extraTools: [writeFileTool] })).toThrow(/write|execute/i);
    expect(() => makeNova({ extraTools: [runCommandTool] })).toThrow(/write|execute/i);

    const nova = makeNova();
    nova.toolRegistry.register(runCommandTool);
    const output = await nova.toolGateway.execute(nova.identity.id, {
      toolId: "kairos.run-command",
      parameters: { command: "echo hacked" },
      requestedBy: nova.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("accepts safe extra tools", () => {
    const nova = makeNova({ extraTools: [safeExtraTool] });
    expect(
      nova.toolRegistry.getAll().map((t) => t.definition.id),
    ).toContain("kairos.test-safe-extra");
  });

  it("supports filesystem sources being disabled", () => {
    const nova = makeNova({ allowFilesystemSources: false });
    const ids = nova.toolRegistry.getAll().map((t) => t.definition.id);
    expect(ids).not.toContain("kairos.read-file");
    expect(ids).not.toContain("kairos.list-directory");
    expect(ids).not.toContain("kairos.search-code");
  });

  it("runs a synthesis goal through its own cognitive loop", async () => {
    const nova = makeNova();
    const result = await nova.create("Draft a summary of the delegation model");
    expect(result.totalCycles).toBeGreaterThan(0);
    expect(result.goal).toBe("Draft a summary of the delegation model");
  });

  it("saves an artifact draft as scoped semantic memory", async () => {
    const nova = makeNova();
    const memory = await nova.saveDraft(
      "Delegation preserves authorization, traceability, context and attribution.",
      { artifact: "delegation-brief", kind: "text" },
    );

    expect(memory.type).toBe("semantic");
    expect(memory.metadata.source).toBe("nova");
    expect(memory.metadata.artifact).toBe("delegation-brief");

    const drafts = await nova.drafts("delegation");
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.content).toContain("traceability");
  });

  it("synthesizes notes from multiple sources into one scoped semantic memory", async () => {
    const nova = makeNova();
    const synthesis = await nova.synthesize(
      "orchestration",
      "Smart routing is deterministic.",
      "Model mode proposes, the router assigns.",
    );

    expect(synthesis.content).toContain("Smart routing is deterministic.");
    expect(synthesis.content).toContain("the router assigns");
    expect(synthesis.metadata.topic).toBe("orchestration");
    expect(synthesis.metadata.sourceCount).toBe(2);
  });

  it("records a creation session summary as episodic memory", async () => {
    const nova = makeNova();
    const result = await nova.create("Write the release notes skeleton");
    await nova.recordSessionSummary(result);

    const episodes = await nova.sessionHistory();
    expect(episodes.length).toBeGreaterThan(0);
    expect(episodes[0]?.type).toBe("episodic");
    expect(episodes[0]?.content).toContain("NOVA creation session");
  });

  it("records experience tagged with its own session id", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const nova = makeNova({ experienceStore });
    await nova.run("Synthesize the evaluation strategy");

    const records = await experienceStore.query({ sessionId: nova.identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(nova.identity.id);
  });

  it("keeps NOVA drafts isolated from other agents sharing the same store", async () => {
    const shared = new InMemoryMemoryStore();
    const nova = makeNova({ memoryStore: shared, agentId: "nova" });
    const { OrionAgent } = await import("../../../src/agents/research/orion-agent.js");
    const orion = new OrionAgent({
      agentId: "orion",
      memoryStore: shared,
      session: { maxCycles: 1 },
    });

    await nova.saveDraft("NOVA-only draft about composition");
    await orion.rememberFinding("ORION-only finding about composition");

    const novaView = await nova.drafts("composition");
    expect(novaView).toHaveLength(1);
    expect(novaView[0]?.content).toContain("NOVA-only");

    const novaSeesOrion = await nova.memory.semantic.recall("ORION-only");
    expect(novaSeesOrion).toHaveLength(0);
  });

  it("exchanges messages over a shared bus", () => {
    const bus = new AgentMessageBus();
    const nova = makeNova({ messageBus: bus });

    nova.sendToAgent("atlas", "Draft ready for review");
    const inbox = bus.drain("atlas");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toContain("Draft ready");
  });

  it("reports collected tool calls", async () => {
    const nova = makeNova();
    await nova.toolGateway.execute(nova.identity.id, {
      toolId: "kairos.date-time",
      parameters: {},
      requestedBy: nova.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(nova.getToolCalls().map((tc) => tc.toolId)).toContain("kairos.date-time");
  });

  it("is routed creation clauses by ATLAS smart strategy", async () => {
    const nova = makeNova({ agentId: "nova" });
    const { OrionAgent } = await import("../../../src/agents/research/orion-agent.js");
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
    atlas.addWorker(nova);

    const outcome = await atlas.orchestrate(
      "Research the delegation model; then create the summary brief",
      { record: false },
    );

    expect(outcome.delegationResults.length).toBe(2);
    expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
    expect(outcome.delegationResults[1]?.toAgentId).toBe("nova");
  });
});
