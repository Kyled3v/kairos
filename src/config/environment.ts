import { z } from "zod";

export const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(
  values: Record<string, string | undefined>,
): Environment {
  return environmentSchema.parse(values);
}
