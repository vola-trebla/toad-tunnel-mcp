# toad-tunnel-mcp

Multi-environment PostgreSQL MCP router with SSH tunnel management.

> One MCP endpoint. All your environments. Auto-managed SSH tunnels.

## Problem

Enterprise PostgreSQL setups span multiple environments (dev, stage, prod), each with separate credentials and often behind SSH bastions. Current MCP database tools require a separate server instance per database, bloating the context window with 60k-150k tokens of metadata and dropping tool selection accuracy to ~49%.

## Solution

A unified MCP server that:

- Exposes **3+1 tools** instead of 72+ (99% token reduction)
- Routes queries via `env` enum validated by Zod — protocol-enforced safety
- Auto-manages **SSH tunnels** per environment (lazy connect → keep-alive → idle disconnect)
- Implements **progressive disclosure** — model only loads schema it needs
- Enforces **HITL confirmation** for prod, keyword blocklists, row budgets

## Quick Start

```bash
npm install
npm run build

# or dev mode
npm run dev
```

## Status

Phase 0 — Sandbox Setup (in progress)

## License

MIT
