import { describe, expect, it } from "vitest";
import { BasicAuthorizationEngine } from "../../src/security/authorization/basic-engine.js";

const action = (name: string) => ({
  id: "action-1",
  name,
  description: "Test action",
  parameters: {},
  requestedBy: "kairos",
});

describe("BasicAuthorizationEngine", () => {
  it("allows explicitly permitted actions", async () => {
    const engine = new BasicAuthorizationEngine();

    const result = await engine.authorize({
      actorId: "kairos",
      action: action("create-plan"),
    });

    expect(result.allowed).toBe(true);
    expect(result.policyId).toBe("baseline-deny-by-default-v1");
  });

  it("denies unknown actions by default", async () => {
    const engine = new BasicAuthorizationEngine();

    const result = await engine.authorize({
      actorId: "kairos",
      action: action("delete-production-database"),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not permitted");
  });
});
