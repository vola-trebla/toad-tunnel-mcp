import * as z from "zod/v4";

const EnvConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(5432),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  permissions: z.enum(["read-write", "read-only"]),
  approval: z.enum(["auto", "hitl"]),
});

const TunnelConfigSchema = z.object({
  bastion: z.string(),
  bastion_port: z.number().default(22),
  key_path: z.string(),
  local_port: z.number(),
});

const SafetyConfigSchema = z.object({
  blocked_keywords: z.array(z.string()).default([]),
  max_rows: z.number().default(100),
});

export const ConfigSchema = z.object({
  project: z.string(),
  environments: z.record(z.string(), EnvConfigSchema),
  tunnels: z
    .object({
      idle_timeout_ms: z.number().default(300_000),
      keepalive_interval_ms: z.number().default(30_000),
      max_retries: z.number().default(3),
      retry_delay_ms: z.number().default(2_000),
    })
    .optional(),
  safety: SafetyConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type EnvConfig = z.infer<typeof EnvConfigSchema>;
export type TunnelConfig = z.infer<typeof TunnelConfigSchema>;
