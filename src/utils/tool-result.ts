import { ToadError } from "./errors.js";

export function toolError(err: unknown) {
  const message = err instanceof ToadError ? err.message : String(err);
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true,
  };
}
