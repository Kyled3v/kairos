// Risk classification for a tool
export type ToolRisk = "none" | "low" | "medium" | "high" | "critical";

// Capability tags — what a tool can do
export type ToolCapability =
  | "compute"
  | "read-local"
  | "write-local"
  | "read-network"
  | "write-network"
  | "execute-shell"
  | "read-memory"
  | "write-memory";

// Permission required to invoke the tool
export type ToolPermission =
  | "public"
  | "restricted"
  | "privileged"
  | "admin";

// Static definition — describes a tool without executing it
export interface ToolDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly capabilities: readonly ToolCapability[];
  readonly permission: ToolPermission;
  readonly risk: ToolRisk;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
}

// Input payload passed to a tool at runtime
export interface ToolInput {
  readonly toolId: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly requestedBy: string;
  readonly requestId: string;
}

// Output returned by a tool
export interface ToolOutput {
  readonly toolId: string;
  readonly requestId: string;
  readonly status: "success" | "failure" | "blocked";
  readonly result?: unknown;
  readonly error?: string;
  readonly executedAt: Date;
  readonly durationMs: number;
}

// A runnable tool — definition + handler
export interface Tool {
  readonly definition: ToolDefinition;
  execute(input: ToolInput): Promise<ToolOutput>;
}

// Policy decision for a tool invocation
export interface ToolPolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly policyId: string;
}

// Registry query options
export interface ToolQuery {
  readonly capability?: ToolCapability;
  readonly permission?: ToolPermission;
  readonly risk?: ToolRisk;
  readonly enabled?: boolean;
}

// Minimal capability contract shared by ToolGateway and ObservedToolGateway.
// Lets consumers (like ToolAwareObservationEngine) accept either without
// depending on a concrete class.
export interface ToolInvoker {
  execute(actorId: string, input: ToolInput): Promise<ToolOutput>;
}