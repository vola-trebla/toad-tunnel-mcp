# toad-tunnel-mcp

[![npm version](https://img.shields.io/npm/v/toad-tunnel-mcp)](https://www.npmjs.com/package/toad-tunnel-mcp)
[![npm downloads](https://img.shields.io/npm/dm/toad-tunnel-mcp)](https://www.npmjs.com/package/toad-tunnel-mcp)
[![CI](https://github.com/vola-trebla/toad-tunnel-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/vola-trebla/toad-tunnel-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-blue?logo=postgresql&logoColor=white)](https://www.postgresql.org)

Multi-environment PostgreSQL MCP router with SSH tunnel management.

One MCP server, all your environments, auto-managed SSH tunnels.

## What it does

- **5 tools** instead of a separate MCP instance per database
- **Env-gated routing** via Zod enum — `dev`, `stage`, `prod` as first-class parameter
- **SSH tunnels** with lazy connect, keep-alive, idle disconnect, reconnect with backoff
- **Progressive disclosure** — discover envs → tables → columns, load only what's needed
- **Safety** — PG read-only roles + keyword blocklist + HITL confirmation + row budgets + audit log

## Install

```bash
npm install -g toad-tunnel-mcp
```

## Quick Start

```bash
# Create a config from the example
curl -o toad-tunnel.yaml https://raw.githubusercontent.com/vola-trebla/toad-tunnel-mcp/main/config/toad-tunnel.example.yaml

# Edit for your setup, then validate
toad-tunnel-mcp validate --config toad-tunnel.yaml

# Run (stdio MCP server)
toad-tunnel-mcp --config toad-tunnel.yaml
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

Full annotated example: [`config/toad-tunnel.example.yaml`](config/toad-tunnel.example.yaml)

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
      "args": ["toad-tunnel-mcp", "--config", "/path/to/toad-tunnel.yaml"]
    }
  }
}
```

## CLI

```
toad-tunnel-mcp --version
toad-tunnel-mcp --help
toad-tunnel-mcp validate [--config <path>]
toad-tunnel-mcp [--config <path>]          # start MCP server
```

## Safety model

Defense-in-depth with four layers:

1. **PostgreSQL read-only roles** — primary defence, enforced at the DB level
2. **Keyword blocklist** — fast-fail for destructive SQL (`DROP`, `DELETE`, etc.) before reaching the DB
3. **Row budget** — wraps SELECT/CTE queries in a subquery with `LIMIT max_rows+1`
4. **HITL elicitation** — environments with `approval: hitl` require human confirmation

### Blocklist limitations

The blocklist operates on normalized SQL text, not a parsed AST. This means:

- **Over-blocking**: keywords inside string literals trigger the blocklist (e.g. `WHERE msg = 'Please DELETE this'`)
- **Not a security boundary**: the primary defence is always the PostgreSQL read-only role

When `blocked_keywords` is omitted from config, the following defaults are used:
`DROP`, `DELETE`, `ALTER`, `TRUNCATE`, `GRANT`, `REVOKE`, `CREATE`, `UPDATE`, `INSERT`.

Passwords in config support `${ENV_VAR}` interpolation to avoid plaintext secrets.

## License

MIT
