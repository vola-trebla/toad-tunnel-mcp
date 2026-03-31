import { describe, it, expect, vi, afterEach } from "vitest";
import { IdleTracker } from "./lifecycle.js";

describe("IdleTracker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire onIdle before timeout", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    vi.advanceTimersByTime(999);
    expect(onIdle).not.toHaveBeenCalled();
    tracker.stopAll();
  });

  it("fires onIdle after idle_timeout_ms", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    vi.advanceTimersByTime(1_001);
    expect(onIdle).toHaveBeenCalledWith("stage");
    tracker.stopAll();
  });

  it("touch() resets the idle clock", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    vi.advanceTimersByTime(800);
    tracker.touch("stage"); // reset
    vi.advanceTimersByTime(800); // total 1600ms but only 800ms since touch
    expect(onIdle).not.toHaveBeenCalled();
    tracker.stopAll();
  });

  it("onIdle fires after timeout post-touch", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    vi.advanceTimersByTime(800);
    tracker.touch("stage");
    vi.advanceTimersByTime(1_200); // 1200ms after touch — fires
    expect(onIdle).toHaveBeenCalledWith("stage");
    tracker.stopAll();
  });

  it("start() is idempotent — second call does not create a second timer", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    tracker.start("stage"); // second call
    vi.advanceTimersByTime(1_100);
    expect(onIdle).toHaveBeenCalledTimes(1);
    tracker.stopAll();
  });

  it("stop() prevents onIdle from firing", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    tracker.stop("stage");
    vi.advanceTimersByTime(2_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("stopAll() stops all envs", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    tracker.start("prod");
    tracker.stopAll();
    vi.advanceTimersByTime(2_000);
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("tracks multiple envs independently", () => {
    vi.useFakeTimers();
    const onIdle = vi.fn();
    const tracker = new IdleTracker(1_000, onIdle);
    tracker.start("stage");
    tracker.start("prod");
    vi.advanceTimersByTime(800);
    tracker.touch("stage"); // only stage gets reset
    vi.advanceTimersByTime(300); // prod hits 1100ms → idle; stage at 300ms
    expect(onIdle).toHaveBeenCalledWith("prod");
    expect(onIdle).not.toHaveBeenCalledWith("stage");
    tracker.stopAll();
  });
});
