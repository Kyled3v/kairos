import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { AtlasAgent } from "../../../src/agents/executive/atlas-agent.js";
import { PulseAgent } from "../../../src/agents/observation/pulse-agent.js";
import type { PulseAgentOptions } from "../../../src/agents/observation/pulse-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";

function makePulse(overrides: Partial<PulseAgentOptions> = {}): PulseAgent {
  return new PulseAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

describe("PulseAgent", () => {
  it("has a stable identity describing the PULSE observation role", () => {
    const pulse = makePulse();
    expect(pulse.identity.name).toBe("pulse");
    expect(pulse.identity.metadata.role).toBe("observation");
    expect(pulse.identity.metadata.specialty).toBe("observation-and-monitoring");
    expect(pulse.identity.metadata.capabilities).toContain("environment-monitoring");
    expect(pulse.identity.metadata.constraints).toContain("read-only tool access");
  });

  it("registers the monitoring toolset — no write or execute tools", () => {
    const pulse = makePulse();
    const ids = pulse.toolRegistry.getAll().map((t) => t.definition.id);

    expect(ids).toContain("kairos.date-time");
    expect(ids).toContain("kairos.data-lookup");
    expect(ids).toContain("kairos.mock-http");
    expect(ids).toContain("kairos.list-directory");
    expect(ids).toContain("kairos.search-code");

    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
    expect(ids).not.toContain("kairos.read-file");
  });

  it("rejects write/execute extras and blocks them at policy", async () => {
    expect(() => makePulse({ extraTools: [writeFileTool] })).toThrow(/write|execute/i);

    const pulse = makePulse();
    pulse.toolRegistry.register(runCommandTool);
    const output = await pulse.toolGateway.execute(pulse.identity.id, {
      toolId: "kairos.run-command",
      parameters: { command: "echo hacked" },
      requestedBy: pulse.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("checkStatus invokes tools through the gateway and records an observation", async () => {
    const pulse = makePulse();
    const status = await pulse.checkStatus();

    expect(status.status).toBe("operational");
    expect(status.observedAt).toBeInstanceOf(Date);
    expect(status.toolCallCount).toBeGreaterThanOrEqual(2);

    const observations = await pulse.observations("status");
    expect(observations.length).toBeGreaterThan(0);
    expect(observations[0]?.type).toBe("episodic");
  });

  it("records and recalls observations as episodic memory", async () => {
    const pulse = makePulse();
    await pulse.recordObservation("tool-registry", "12 tools enabled, 0 blocked in last cycle", {
      severity: "info",
    });

    const found = await pulse.observations("tool-registry");
    expect(found).toHaveLength(1);
    expect(found[0]?.content).toContain("12 tools enabled");
    expect(found[0]?.metadata.subject).toBe("tool-registry");
    expect(found[0]?.metadata.severity).toBe("info");
  });

  it("runs a monitoring goal through its own cognitive loop", async () => {
    const pulse = makePulse();
    const result = await pulse.monitor("Watch the orchestration pipeline health");
    expect(result.totalCycles).toBeGreaterThan(0);
  });

  it("records experience tagged with its own session id", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const pulse = makePulse({ experienceStore });
    await pulse.run("Observe the tool gateway");

    const records = await experienceStore.query({ sessionId: pulse.identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(pulse.identity.id);
  });

  it("keeps PULSE observations isolated from agents sharing the same store", async () => {
    const shared = new InMemoryMemoryStore();
    const pulse = makePulse({ memoryStore: shared });
    const { OrionAgent } = await import("../../../src/agents/research/orion-agent.js");
    const orion = new OrionAgent({ agentId: "orion", memoryStore: shared, session: { maxCycles: 1 } });

    await pulse.recordObservation("gateway", "PULSE-only observation", {});
    await orion.rememberFinding("ORION-only note", {});

    const pulseView = await pulse.observations("gateway");
    expect(pulseView).toHaveLength(1);

    const pulseSeesOrion = await pulse.memory.episodic.recall("ORION-only");
    expect(pulseSeesOrion).toHaveLength(0);
  });

  it("exchanges messages over a shared bus", () => {
    const bus = new AgentMessageBus();
    const pulse = makePulse({ messageBus: bus });

    const sent = pulse.sendToAgent("atlas", "All systems nominal");
    expect(sent.from).toBe(pulse.identity.id);

    const inbox = bus.drain("atlas");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toContain("nominal");
  });

  it("reports collected tool calls", async () => {
    const pulse = makePulse();
    await pulse.checkStatus();
    const calls = pulse.getToolCalls().map((tc) => tc.toolId);
    expect(calls).toContain("kairos.data-lookup");
    expect(calls).toContain("kairos.date-time");
  });

  it("is routed observation clauses by ATLAS smart strategy", async () => {
    const pulse = makePulse({ agentId: "pulse" });
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
    atlas.addWorker(pulse);

    const outcome = await atlas.orchestrate(
      "Research the gateway internals; then monitor the pipeline for failures",
      { record: false },
    );

    expect(outcome.delegationResults.length).toBe(2);
    expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
    expect(outcome.delegationResults[1]?.toAgentId).toBe("pulse");
  });
});
