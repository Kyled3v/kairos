import type { ActionExecutor } from "./executor.js";
import type { ActionRequest, ActionResult } from "./types.js";
import type { ToolGateway } from "../tools/gateway.js";

export class ToolActionExecutor implements ActionExecutor {
  constructor(private readonly gateway: ToolGateway) {}

  async execute(request: ActionRequest): Promise<ActionResult> {
    const output = await this.gateway.execute(
      request.requestedBy,
      {
        toolId: request.name,
        parameters: request.parameters,
        requestedBy: request.requestedBy,
        requestId: request.id,
      },
    );

    if (output.status === "blocked") {
      return output.error !== undefined
        ? { actionId: request.id, status: "blocked", reason: output.error }
        : { actionId: request.id, status: "blocked" };
    }

    if (output.status === "failure") {
      return output.error !== undefined
        ? { actionId: request.id, status: "failed", reason: output.error }
        : { actionId: request.id, status: "failed" };
    }

    return output.result !== undefined
      ? { actionId: request.id, status: "completed", output: output.result }
      : { actionId: request.id, status: "completed" };
  }
}
