import type { TunnelProvider, TunnelConfig, Tunnel } from "./types.js";

/**
 * In-memory mock TunnelProvider for testing.
 * Simulates connect/disconnect without any real SSH connections.
 */
export class MockTunnelProvider implements TunnelProvider {
  private readonly tunnels = new Map<string, Tunnel>();

  /** Simulate a forced disconnect (e.g. connection drop) */
  simulateDrop(env: string): void {
    const tunnel = this.tunnels.get(env);
    if (tunnel) tunnel.status = "disconnected";
  }

  async connect(env: string, config: TunnelConfig): Promise<Tunnel> {
    const existing = this.tunnels.get(env);
    if (existing && existing.status === "active") return existing;

    const tunnel: Tunnel = {
      env,
      local_port: config.local_port,
      status: "active",
      connected_at: new Date(),
      last_query_at: new Date(),
    };
    this.tunnels.set(env, tunnel);
    return tunnel;
  }

  async disconnect(env: string): Promise<void> {
    this.tunnels.delete(env);
  }

  getStatus(env: string): Tunnel | null {
    return this.tunnels.get(env) ?? null;
  }

  async disconnectAll(): Promise<void> {
    this.tunnels.clear();
  }
}
