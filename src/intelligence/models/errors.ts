export class ModelTimeoutError extends Error {
  readonly providerId: string;
  readonly timeoutMs: number;

  constructor(providerId: string, timeoutMs: number) {
    super(`Model provider "${providerId}" timed out after ${timeoutMs}ms.`);
    this.name = "ModelTimeoutError";
    this.providerId = providerId;
    this.timeoutMs = timeoutMs;
  }
}