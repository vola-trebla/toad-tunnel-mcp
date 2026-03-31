import net from "net";
import { readFileSync } from "fs";
import { homedir } from "os";
import { Client } from "ssh2";
import type { TunnelProvider, TunnelConfig, Tunnel } from "./types.js";
import {
  IdleTracker,
  DEFAULT_LIFECYCLE,
  type TunnelLifecycleOptions,
} from "./lifecycle.js";
import { ToadError } from "../utils/errors.js";

export class TunnelError extends ToadError {
  constructor(
    public readonly env: string,
    message: string,
    cause?: unknown,
  ) {
    super(`Tunnel error for "${env}": ${message}`, cause);
    this.name = "TunnelError";
  }
}

interface ActiveTunnel {
  tunnel: Tunnel;
  conn: Client;
  server: net.Server;
  config: TunnelConfig;
  intentionalClose: boolean;
  retryCount: number;
}

export class Ssh2TunnelProvider implements TunnelProvider {
  private readonly active = new Map<string, ActiveTunnel>();
  private readonly usedPorts = new Set<number>();
  private readonly opts: TunnelLifecycleOptions;
  private readonly idle: IdleTracker;

  /** Set externally after construction to avoid circular references */
  onReconnect?: (env: string) => void;

  constructor(opts: Partial<TunnelLifecycleOptions> = {}) {
    this.opts = { ...DEFAULT_LIFECYCLE, ...opts };
    this.idle = new IdleTracker(this.opts.idle_timeout_ms, (env) => {
      void this.disconnect(env);
    });
  }

  async connect(env: string, config: TunnelConfig): Promise<Tunnel> {
    const existing = this.active.get(env);
    if (existing && existing.tunnel.status === "active") {
      return existing.tunnel;
    }

    // Validate local_port uniqueness across active tunnels
    if (this.usedPorts.has(config.local_port)) {
      throw new TunnelError(
        env,
        `local_port ${config.local_port} is already in use by another tunnel`,
      );
    }

    return this._openConnection(env, config);
  }

  private _openConnection(env: string, config: TunnelConfig): Promise<Tunnel> {
    return new Promise<Tunnel>((resolve, reject) => {
      const conn = new Client();

      const keyPath = config.key_path.replace(/^~/, homedir());
      let privateKey: Buffer;
      try {
        privateKey = readFileSync(keyPath);
      } catch (err) {
        return reject(
          new TunnelError(env, `Cannot read key file: ${keyPath}`, err),
        );
      }

      conn
        .on("ready", () => {
          const server = net.createServer((socket) => {
            this.idle.touch(env);
            const active = this.active.get(env);
            if (active) active.tunnel.last_query_at = new Date();

            conn.forwardOut(
              "127.0.0.1",
              0,
              config.remote_host,
              config.remote_port,
              (err, stream) => {
                if (err) {
                  socket.destroy();
                  return;
                }
                socket.pipe(stream).pipe(socket);
                stream.on("close", () => socket.destroy());
                socket.on("close", () => stream.destroy());
              },
            );
          });

          server.listen(config.local_port, "127.0.0.1", () => {
            const tunnel: Tunnel = {
              env,
              local_port: config.local_port,
              status: "active",
              connected_at: new Date(),
              last_query_at: new Date(),
            };
            const record: ActiveTunnel = {
              tunnel,
              conn,
              server,
              config,
              intentionalClose: false,
              retryCount: 0,
            };
            this.active.set(env, record);
            this.usedPorts.add(config.local_port);
            this.idle.start(env);
            resolve(tunnel);
          });

          server.on("error", (err) => {
            conn.end();
            reject(
              new TunnelError(
                env,
                `Local server error on port ${config.local_port}`,
                err,
              ),
            );
          });
        })
        .on("error", (err) => {
          reject(new TunnelError(env, "SSH connection error", err));
        })
        .on("close", () => {
          const record = this.active.get(env);
          if (record && !record.intentionalClose) {
            void this._scheduleReconnect(env, record);
          }
        })
        .connect({
          host: config.bastion,
          port: config.bastion_port,
          username: config.username,
          privateKey,
          passphrase: config.passphrase,
          readyTimeout: 10_000,
          keepaliveInterval: this.opts.keepalive_interval_ms,
          keepaliveCountMax: 3,
        });
    });
  }

  private async _scheduleReconnect(
    env: string,
    record: ActiveTunnel,
  ): Promise<void> {
    if (record.retryCount >= this.opts.max_retries) {
      record.tunnel.status = "disconnected";
      this.idle.stop(env);
      this.opts.onGiveUp?.(env);
      this.active.delete(env);
      return;
    }

    record.tunnel.status = "connecting";
    record.retryCount += 1;
    const delay = this.opts.retry_delay_ms * Math.pow(2, record.retryCount - 1);

    await new Promise<void>((r) => setTimeout(r, delay));

    // Close the old net.Server before reopening
    await new Promise<void>((resolve) => {
      record.server.close(() => resolve());
    });

    this.active.delete(env);

    try {
      await this._openConnection(env, record.config);
      const reconnected = this.active.get(env);
      if (reconnected) reconnected.retryCount = 0;
      this.onReconnect?.(env);
    } catch {
      // _openConnection already set status; _scheduleReconnect will be called
      // again via the 'close' event on the new conn if it connects and then drops.
      // If it never connects, reject() is called and we give up here.
      const stale = this.active.get(env);
      if (stale && stale.retryCount < this.opts.max_retries) {
        void this._scheduleReconnect(env, stale);
      } else {
        this.opts.onGiveUp?.(env);
        this.active.delete(env);
      }
    }
  }

  async disconnect(env: string): Promise<void> {
    const active = this.active.get(env);
    if (!active) return;

    active.intentionalClose = true;
    this.idle.stop(env);

    await new Promise<void>((resolve) => {
      active.server.close(() => {
        active.conn.end();
        resolve();
      });
    });

    this.usedPorts.delete(active.config.local_port);
    this.active.delete(env);
  }

  getStatus(env: string): Tunnel | null {
    return this.active.get(env)?.tunnel ?? null;
  }

  async disconnectAll(): Promise<void> {
    this.idle.stopAll();
    await Promise.all(
      [...this.active.keys()].map((env) => this.disconnect(env)),
    );
  }
}
