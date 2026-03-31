import { describe, it, expect, vi, afterEach } from "vitest";
import { SchemaCache } from "./cache.js";

describe("SchemaCache", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for missing key", () => {
    const cache = new SchemaCache();
    expect(cache.get("nope")).toBeUndefined();
  });

  it("returns stored value within TTL", () => {
    const cache = new SchemaCache(60_000);
    cache.set("key", "value");
    expect(cache.get("key")).toBe("value");
  });

  it("returns undefined after TTL expires", () => {
    vi.useFakeTimers();
    const cache = new SchemaCache(1_000);
    cache.set("key", "value");
    vi.advanceTimersByTime(1_001);
    expect(cache.get("key")).toBeUndefined();
  });

  it("invalidate() clears all entries", () => {
    const cache = new SchemaCache();
    cache.set("a", 1);
    cache.set("b", 2);
    cache.invalidate();
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  it("invalidate(prefix) clears only matching entries", () => {
    const cache = new SchemaCache();
    cache.set("overview:dev", "tables");
    cache.set("overview:prod", "tables");
    cache.set("columns:dev:public.users", "cols");
    cache.invalidate("overview:");
    expect(cache.get("overview:dev")).toBeUndefined();
    expect(cache.get("overview:prod")).toBeUndefined();
    expect(cache.get("columns:dev:public.users")).toBe("cols");
  });

  it("overwrites existing entry on set", () => {
    const cache = new SchemaCache();
    cache.set("key", "first");
    cache.set("key", "second");
    expect(cache.get("key")).toBe("second");
  });
});
