import * as z from "zod/v4";

export function envEnum(names: string[]) {
  return z.enum(names as [string, ...string[]]);
}
