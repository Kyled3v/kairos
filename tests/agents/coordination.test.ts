import { describe, expect, it } from "vitest";
import { AgentRegistry } from "../../src/agents/identity.js";
import { KairosAgent } from "../../src/agents/agent.js";
import { AgentCoordinator } from "../../src/agents/coordinator.js";
import { SupervisorAgent } from "../../src/agents/supervisor.js";
import { InMemoryMemoryStore } from "../../src/core/memory/in-memory-store.js";
import { createPipelineDependencies } from "../../src/factory/pipeline-dependencies.js";

function makeAgent(name: string): KairosAgent {
  const registry = new AgentRegistry();
  const identity = registry.register({ name });
  return new KairosAgent({
    identity,
    dependencies: createPipelineDependencies({ mode: "basic" }),
    memoryStore: new InMemoryMemoryStore(),
    session: { maxCycles: 1 },
  });
}

describe("AgentCoordinator", () => {
  it("registers agents and delegates a task to a worker", async () => {
    const supervisor = makeAgent("Supervisor");
    const worker = makeAgent("Worker");
    const coordinator = new AgentCoordinator();
    coordinator.register(supervisor);
    coordinator.register(worker);
    const result = await coordinator.delegate({
      taskId: "t1",
      fromAgentId: supervisor.identity.id,
      toAgentId: worker.identity.id,
      goal: "do the work",
    });
    expect(result.status).toBe("success");
    expect(result.taskId).toBe("t1");
    expect(result.toAgentId).toBe(worker.identity.id);
  });

  it("returns failure when target agent id is not registered", async () => {
    const supervisor = makeAgent("Supervisor");
    const coordinator = new AgentCoordinator();
    coordinator.register(supervisor);
    const result = await coordinator.delegate({
      taskId: "t2",
      fromAgentId: supervisor.identity.id,
      toAgentId: "unknown-agent-id",
      goal: "do the work",
    });
    expect(result.status).toBe("failure");
    expect(result.error).toContain("not registered");
  });

  it("rejects registering the same agent twice", () => {
    const agent = makeAgent("Agent");
    const coordinator = new AgentCoordinator();
    coordinator.register(agent);
    expect(() => coordinator.register(agent)).toThrow();
  });
});

describe("SupervisorAgent", () => {
  it("delegates sub-tasks to workers and collects results", async () => {
    const supervisorAgent = makeAgent("Supervisor");
    const workerA = makeAgent("WorkerA");
    const workerB = makeAgent("WorkerB");
    const supervisor = new SupervisorAgent(supervisorAgent, [workerA, workerB]);
    const result = await supervisor.run("big goal", (_goal) => [
      { id: "st1", goal: "sub-task A", workerId: workerA.identity.id },
      { id: "st2", goal: "sub-task B", workerId: workerB.identity.id },
    ]);
    expect(result.delegationResults).toHaveLength(2);
    expect(result.delegationResults.every((r) => r.status === "success")).toBe(true);
    expect(result.supervisorId).toBe(supervisorAgent.identity.id);
  });

  it("returns failure result when worker agent id is unknown", async () => {
    const supervisorAgent = makeAgent("Supervisor");
    const supervisor = new SupervisorAgent(supervisorAgent, []);
    const result = await supervisor.run("goal", (_goal) => [
      { id: "st1", goal: "orphan task", workerId: "ghost-agent" },
    ]);
    expect(result.delegationResults[0]?.status).toBe("failure");
    expect(result.delegationResults[0]?.error).toContain("not registered");
  });
});
