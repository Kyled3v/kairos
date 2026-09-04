import type { ActionExecutor } from "./executor.js";
import type { ActionRequest, ActionResult } from "./types.js";

export class BasicActionExecutor implements ActionExecutor {
  async execute(request: ActionRequest): Promise<ActionResult> {
    return {
      actionId: request.id,
      status: "completed",
      output: {
        simulated: true,
        action: request.name,
        parameters: request.parameters,
      },
    };
  }
}
