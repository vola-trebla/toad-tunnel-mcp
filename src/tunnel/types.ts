export type TunnelStatus = "active" | "idle" | "disconnected" | "connecting";

export interface TunnelConfig {
  /** SSH bastion hostname */
  bastion: string;
  /** SSH port on the bastion (default 22) */
  bastion_port: number;
  /** Path to SSH private key file */
  key_path: string;
  /** Local TCP port to bind — pg.Pool connects here */
  local_port: number;
  /** Target DB host as seen from the bastion (e.g. "localhost" or internal hostname) */
  remote_host: string;
  /** Target DB port as seen from the bastion */
  remote_port: number;
}

export interface Tunnel {
  /** Environment this tunnel belongs to */
  env: string;
  /** Local port that pg.Pool should connect to */
  local_port: number;
  /** Current status */
  status: TunnelStatus;
  /** When the tunnel was opened */
  connected_at: Date;
  /** Timestamp of the last query that used this tunnel */
  last_query_at: Date;
}

export interface TunnelProvider {
  /**
   * Open a tunnel for the given env.
   * No-op if a tunnel is already active for this env.
   */
  connect(env: string, config: TunnelConfig): Promise<Tunnel>;

  /** Close the tunnel for the given env. No-op if not connected. */
  disconnect(env: string): Promise<void>;

  /** Returns current tunnel state, or null if no tunnel exists for this env. */
  getStatus(env: string): Tunnel | null;

  /** Close all open tunnels. */
  disconnectAll(): Promise<void>;
}
