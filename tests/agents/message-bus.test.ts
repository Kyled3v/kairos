import { describe, expect, it } from "vitest";
import { AgentMessageBus } from "../../src/agents/message-bus.js";

describe("AgentMessageBus", () => {
  it("delivers a message to the recipient's inbox", () => {
    const bus = new AgentMessageBus();
    bus.send({ from: "a1", to: "a2", content: "hello" });
    const inbox = bus.peek("a2");
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.content).toBe("hello");
    expect(inbox[0]?.from).toBe("a1");
  });

  it("drain clears the inbox after reading", () => {
    const bus = new AgentMessageBus();
    bus.send({ from: "a1", to: "a2", content: "first" });
    const drained = bus.drain("a2");
    expect(drained).toHaveLength(1);
    expect(bus.peek("a2")).toHaveLength(0);
  });

  it("keeps inboxes isolated per agent", () => {
    const bus = new AgentMessageBus();
    bus.send({ from: "a1", to: "a2", content: "for a2" });
    bus.send({ from: "a1", to: "a3", content: "for a3" });
    expect(bus.peek("a2")).toHaveLength(1);
    expect(bus.peek("a3")).toHaveLength(1);
    expect(bus.peek("a2")[0]?.content).toBe("for a2");
  });
});