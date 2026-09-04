export interface ActionRequest {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly requestedBy: string;
}

export interface ActionResult {
  readonly actionId: string;
  readonly status: "completed" | "blocked" | "failed";
  readonly output?: unknown;
  readonly reason?: string;
}
