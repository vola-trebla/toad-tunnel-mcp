import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ConfigSchema, type Config } from "./schema.js";
import { ConfigError } from "../utils/errors.js";

/** Replace ${VAR_NAME} patterns with process.env values */
function interpolateEnvVars(content: string): string {
  return content.replace(/\$\{(\w+)\}/g, (match, varName: string) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new ConfigError(
        `Environment variable "${varName}" is not set (referenced in config)`,
      );
    }
    return value;
  });
}

export function loadConfig(path: string): Config {
  let raw: unknown;

  try {
    const content = readFileSync(path, "utf8");
    const interpolated = interpolateEnvVars(content);
    raw = parse(interpolated);
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError(`Cannot read config file: ${path}`, err);
  }

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(
      `Invalid config: ${result.error.message}`,
      result.error,
    );
  }

  return result.data;
}
