import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { ConfigSchema, type Config } from "./schema.js";
import { ConfigError } from "../utils/errors.js";

export function loadConfig(path: string): Config {
  let raw: unknown;

  try {
    const content = readFileSync(path, "utf8");
    raw = parse(content);
  } catch (err) {
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
