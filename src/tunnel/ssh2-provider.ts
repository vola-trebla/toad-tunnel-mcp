import net from "net";
import { readFileSync } from "fs";
import { homedir } from "os";
import { Client } from "ssh2";
import type { TunnelProvider, TunnelConfig, Tunnel } from "./types.js";
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
}

export class Ssh2TunnelProvider implements TunnelProvider {
  private readonly active = new Map<string, ActiveTunnel>();

  async connect(env: string, config: TunnelConfig): Promise<Tunnel> {
    const existing = this.active.get(env);
    if (existing && existing.tunnel.status === "active") {
      return existing.tunnel;
    }

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
            this.active.set(env, { tunnel, conn, server });
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
        .connect({
          host: config.bastion,
          port: config.bastion_port,
          username: config.username,
          privateKey,
          passphrase: config.passphrase,
          readyTimeout: 10_000,
        });
    });
  }

  async disconnect(env: string): Promise<void> {
    const active = this.active.get(env);
    if (!active) return;

    await new Promise<void>((resolve) => {
      active.server.close(() => {
        active.conn.end();
        resolve();
      });
    });

    this.active.delete(env);
  }

  getStatus(env: string): Tunnel | null {
    return this.active.get(env)?.tunnel ?? null;
  }

  async disconnectAll(): Promise<void> {
    await Promise.all(
      [...this.active.keys()].map((env) => this.disconnect(env)),
    );
  }
}
