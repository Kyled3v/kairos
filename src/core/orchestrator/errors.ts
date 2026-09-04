export class OrchestrationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OrchestrationError";
  }
}

export class OrchestrationBlockedError extends OrchestrationError {
  constructor(message: string) {
    super(message);
    this.name = "OrchestrationBlockedError";
  }
}
