import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../../src/agents/message-bus.js";
import { AtlasAgent } from "../../../src/agents/executive/atlas-agent.js";
import { VectorAgent } from "../../../src/agents/execution/vector-agent.js";
import type { VectorAgentOptions } from "../../../src/agents/execution/vector-agent.js";
import { InMemoryMemoryStore } from "../../../src/core/memory/in-memory-store.js";
import { InMemoryExperienceStore } from "../../../src/core/experience/in-memory-experience-store.js";
import { writeFileTool } from "../../../src/core/tools/built-in/write-file.js";
import { runCommandTool } from "../../../src/core/tools/built-in/run-command.js";
import { createRunCommandTool } from "../../../src/core/tools/built-in/run-command.js";
import { dataLookupTool } from "../../../src/core/tools/built-in/data-lookup.js";
import type { Tool } from "../../../src/core/tools/types.js";
import type { ActionRequest } from "../../../src/core/action/types.js";

function makeVector(overrides: Partial<VectorAgentOptions> = {}): VectorAgent {
  return new VectorAgent({
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
    ...overrides,
  });
}

const safeProbe: Tool = {
  definition: {
    id: "kairos.test-probe",
    name: "Probe",
    description: "Safe read-only probe for tests.",
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

function actionRequest(overrides: Partial<ActionRequest> = {}): ActionRequest {
  return {
    id: crypto.randomUUID(),
    name: "create-plan",
    description: "baseline-allowed action",
    parameters: {},
    requestedBy: "vector-test",
    ...overrides,
  };
}

describe("VectorAgent", () => {
  it("has a stable identity describing the VECTOR execution role", () => {
    const vector = makeVector();
    expect(vector.identity.name).toBe("vector");
    expect(vector.identity.metadata.role).toBe("execution");
    expect(vector.identity.metadata.specialty).toBe("authorized-execution");
    expect(vector.identity.metadata.capabilities).toContain("action-execution");
    expect(vector.identity.metadata.constraints).toContain("execution gated behind explicit grants");
  });

  it("registers read-only verification tools by default — no write or execute tools", () => {
    const vector = makeVector();
    const ids = vector.toolRegistry.getAll().map((t) => t.definition.id);

    expect(ids).toContain("kairos.date-time");
    expect(ids).toContain("kairos.data-lookup");
    expect(ids).toContain("kairos.read-file");
    expect(ids).toContain("kairos.list-directory");

    expect(ids).not.toContain("kairos.write-file");
    expect(ids).not.toContain("kairos.run-command");
  });

  it("gains the gated run-command tool only when allowExecute is explicitly true", () => {
    expect(
      makeVector().toolRegistry.getAll().map((t) => t.definition.id),
    ).not.toContain("kairos.run-command");

    expect(
      makeVector({ allowExecute: true }).toolRegistry.getAll().map((t) => t.definition.id),
    ).toContain("kairos.run-command");
  });

  it("confines the gated run-command tool to the declared workingRoot", async () => {
    const vector = makeVector({ allowExecute: true });
    const result = await vector.executeCommand("git status", "/definitely/outside");
    expect(result.status).toBe("blocked");
    expect(result.error).toMatch(/working root/i);
  });

  it("executes allowlisted commands inside the working root when granted", async () => {
    const vector = makeVector({ allowExecute: true });
    // Working root defaults to process.cwd() — this repository — and
    // "git status" is on the default allowlist.
    const result = await vector.executeCommand("git status");
    expect(["success", "failure"]).toContain(result.status);
    expect(result.error ?? "").not.toMatch(/working root/i);
  });

  it("still blocks non-allowlisted commands even with execution granted", async () => {
    const vector = makeVector({ allowExecute: true });
    const result = await vector.executeCommand("curl http://evil.example");
    expect(result.status).toBe("blocked");
  });

  it("gains the write-file tool only when allowWrite is explicitly true", () => {
    expect(
      makeVector().toolRegistry.getAll().map((t) => t.definition.id),
    ).not.toContain("kairos.write-file");
    expect(
      makeVector({ allowWrite: true }).toolRegistry.getAll().map((t) => t.definition.id),
    ).toContain("kairos.write-file");
  });

  it("rejects extras beyond granted access and blocks them at policy", async () => {
    expect(() => makeVector({ extraTools: [runCommandTool] })).toThrow(/write|execute/i);
    expect(() => makeVector({ allowWrite: true, extraTools: [runCommandTool] })).toThrow(/write|execute/i);

    const vector = makeVector();
    vector.toolRegistry.register(writeFileTool);
    const output = await vector.toolGateway.execute(vector.identity.id, {
      toolId: "kairos.write-file",
      parameters: { path: "/tmp/nope", content: "nope" },
      requestedBy: vector.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(output.status).toBe("blocked");
  });

  it("accepts safe extra tools", () => {
    const vector = makeVector({ extraTools: [safeProbe] });
    expect(
      vector.toolRegistry.getAll().map((t) => t.definition.id),
    ).toContain("kairos.test-probe");
  });

  it("executes actions through the authorization gateway and records them", async () => {
    const vector = makeVector();
    const result = await vector.executeAction(actionRequest({ name: "create-plan" }));
    expect(result.status).toBe("completed");

    const denied = await vector.executeAction(actionRequest({ name: "delete-database" }));
    expect(denied.status).toBe("blocked");
    expect(denied.reason).toMatch(/baseline policy/i);
  });

  it("runs an execution goal through its own cognitive loop", async () => {
    const vector = makeVector();
    const result = await vector.run("Verify the deployment checklist");
    expect(result.totalCycles).toBeGreaterThan(0);
  });

  it("records execution outcomes as episodic memory", async () => {
    const vector = makeVector();
    const outcome = await vector.executeAction(actionRequest({ name: "inspect-state" }));
    await vector.recordExecution(outcome.actionId, outcome.status);

    const history = await vector.executionHistory();
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]?.type).toBe("episodic");
    expect(history[0]?.content).toContain("VECTOR execution");
  });

  it("records experience tagged with its own session id", async () => {
    const experienceStore = new InMemoryExperienceStore();
    const vector = makeVector({ experienceStore });
    await vector.run("Execute the verification pass");

    const records = await experienceStore.query({ sessionId: vector.identity.id });
    expect(records).toHaveLength(1);
    expect(records[0]?.sessionId).toBe(vector.identity.id);
  });

  it("exchanges messages over a shared bus", () => {
    const bus = new AgentMessageBus();
    const vector = makeVector({ messageBus: bus });

    vector.sendToAgent("atlas", "Execution pass complete");
    const inbox = bus.drain("atlas");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toContain("Execution pass");
  });

  it("reports collected tool calls", async () => {
    const vector = makeVector();
    await vector.toolGateway.execute(vector.identity.id, {
      toolId: "kairos.date-time",
      parameters: {},
      requestedBy: vector.identity.id,
      requestId: crypto.randomUUID(),
    });
    expect(vector.getToolCalls().map((tc) => tc.toolId)).toContain("kairos.date-time");
  });

  it("is routed execution clauses by ATLAS smart strategy", async () => {
    const vector = makeVector({ agentId: "vector" });
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
    atlas.addWorker(vector);

    const outcome = await atlas.orchestrate(
      "Research the rollout plan; then execute and deploy the rollout steps",
      { record: false },
    );

    expect(outcome.delegationResults.length).toBe(2);
    expect(outcome.delegationResults[0]?.toAgentId).toBe("orion");
    expect(outcome.delegationResults[1]?.toAgentId).toBe("vector");
  });
});
