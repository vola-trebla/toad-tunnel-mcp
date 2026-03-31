import * as z from "zod/v4";

const TunnelConfigSchema = z.object({
  bastion: z.string(),
  bastion_port: z.number().default(22),
  username: z.string(),
  key_path: z.string(),
  passphrase: z.string().optional(),
  local_port: z.number(),
  /** DB host as seen from the bastion. Defaults to env.host if omitted. */
  remote_host: z.string().optional(),
  /** DB port as seen from the bastion. Defaults to env.port if omitted. */
  remote_port: z.number().optional(),
});

const EnvConfigSchema = z.object({
  host: z.string(),
  port: z.number().default(5432),
  database: z.string(),
  user: z.string(),
  password: z.string(),
  permissions: z.enum(["read-write", "read-only"]),
  approval: z.enum(["auto", "hitl"]),
  tunnel: TunnelConfigSchema.optional(),
});

const SafetyConfigSchema = z.object({
  blocked_keywords: z.array(z.string()).default([]),
  max_rows: z.number().default(100),
});

export const ConfigSchema = z.object({
  project: z.string(),
  environments: z.record(z.string(), EnvConfigSchema),
  tunnel_options: z
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
