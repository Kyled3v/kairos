import type { AgentIdentity } from "./identity.js";
import type { MultiCycleResult } from "../core/orchestrator/types.js";
import type { Tool } from "../core/tools/types.js";

/**
 * Capabilities that research/executive agents must never hold: any tool
 * that can write locally, write to the network, or execute shell commands.
 */
export const FORBIDDEN_WRITE_EXECUTE_CAPABILITIES: ReadonlySet<string> = new Set([
  "write-local",
  "write-network",
  "execute-shell",
]);

/**
 * Throws when a tool carries a write or execute capability. Used at
 * specialist-agent construction time so forbidden tools are rejected
 * before they can ever be registered or invoked.
 */
export function assertNoWriteExecuteCapability(tool: Tool, owner: string): void {
  for (const capability of tool.definition.capabilities) {
    if (FORBIDDEN_WRITE_EXECUTE_CAPABILITIES.has(capability)) {
      throw new Error(
        `${owner} forbids tool ${tool.definition.id} with capability "${capability}" (write/execute).`,
      );
    }
  }
}

/**
 * Structural minimum the AgentCoordinator needs in order to route work to
 * an agent. KairosAgent satisfies this directly, and specialist agents
 * that compose a KairosAgent (OrionAgent, AtlasAgent, ...) satisfy it
 * structurally — no inheritance required.
 */
export interface DelegatableAgent {
  readonly identity: AgentIdentity;
  run(goal: string): Promise<MultiCycleResult>;
  send?(to: string, content: string, metadata?: Readonly<Record<string, unknown>>): unknown;
  receiveMessages?(): readonly unknown[];
}
