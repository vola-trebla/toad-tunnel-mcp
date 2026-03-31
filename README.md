# toad-tunnel-mcp

Multi-environment PostgreSQL MCP router with SSH tunnel management.

One MCP server, all your environments, auto-managed SSH tunnels.

## What it does

- **5 tools** instead of a separate MCP instance per database
- **Env-gated routing** via Zod enum — `dev`, `stage`, `prod` as first-class parameter
- **SSH tunnels** with lazy connect, keep-alive, idle disconnect, reconnect with backoff
- **Progressive disclosure** — discover envs → tables → columns, load only what's needed
- **Safety** — PG read-only roles + keyword blocklist + HITL confirmation + row budgets + audit log

## Quick Start

```bash
git clone https://github.com/vola-trebla/toad-tunnel-mcp.git
cd toad-tunnel-mcp && npm install

# Sandbox: 4 PostgreSQL envs via Docker
npm run sandbox:up

# Run
npm run dev
```

## Configuration

```yaml
# config/toad-tunnel.yaml
project: my-project

environments:
  dev:
    host: localhost
    port: 5432
    database: app_dev
    user: dev_user
    password: dev_secret
    permissions: read-write # read-write | read-only
    approval: auto # auto | hitl

  prod:
    host: prod-db.internal
    port: 5432
    database: app_prod
    user: prod_reader
    password: prod_secret
    permissions: read-only
    approval: hitl # requires human confirmation
    tunnel:
      bastion: bastion.company.com
      username: deploy
      key_path: ~/.ssh/prod_key
      local_port: 5434

# Optional
safety:
  blocked_keywords: [DROP, DELETE, ALTER, TRUNCATE]
  max_rows: 100
  hitl_timeout_ms: 60000
```

Full config reference: see `config/toad-tunnel.yaml` and `src/config/schema.ts`.

## Tools

| Tool                            | Description                                       |
| ------------------------------- | ------------------------------------------------- |
| `toad_tunnel__list_nodes`       | Discover environments, permissions, approval mode |
| `toad_tunnel__get_overview`     | Tables + estimated row counts (cached 5min)       |
| `toad_tunnel__describe_columns` | Compact column schema for a table (cached 5min)   |
| `toad_tunnel__execute_query`    | Run SQL with blocklist, HITL, row budget          |
| `toad_tunnel__tunnel_status`    | SSH tunnel state per environment                  |

## MCP Integration

Add to Claude Desktop `claude_desktop_config.json` or Claude Code `.mcp.json`:

```json
{
  "mcpServers": {
    "toad-tunnel": {
      "command": "npx",
      "args": ["tsx", "/path/to/toad-tunnel-mcp/src/index.ts"],
      "env": {
        "TOAD_CONFIG": "/path/to/toad-tunnel.yaml"
      }
    }
  }
}
```

## License

MIT
