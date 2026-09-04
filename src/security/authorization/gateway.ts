import type { ActionExecutor } from "../../core/action/executor.js";
import type { ActionRequest, ActionResult } from "../../core/action/types.js";
import type { AuthorizationEngine } from "./types.js";

export class AuthorizedActionGateway {
  constructor(
    private readonly authorization: AuthorizationEngine,
    private readonly executor: ActionExecutor,
  ) {}

  async execute(
    actorId: string,
    request: ActionRequest,
  ): Promise<ActionResult> {
    const decision = await this.authorization.authorize({
      actorId,
      action: request,
    });

    if (!decision.allowed) {
      return {
        actionId: request.id,
        status: "blocked",
        reason: decision.reason,
      };
    }

    return this.executor.execute(request);
  }
}
