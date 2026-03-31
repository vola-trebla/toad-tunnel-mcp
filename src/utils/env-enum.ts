import * as z from "zod/v4";

export function envEnum(names: string[]) {
  if (names.length === 0) {
    throw new Error("At least one environment must be configured");
  }
  return z.enum(names as [string, ...string[]]);
}
