---
name: thunderbit
description: |
  Thunderbit gives AI agents and apps production-grade web extraction:
  distill URLs into clean Markdown, extract structured data, suggest
  fields, and batch-process up to 100 URLs. Use the CLI for live
  terminal work, MCP for agent-host tools, or REST API for app code.
---

# Thunderbit

Thunderbit helps agents turn known URLs into LLM-ready Markdown or
structured JSON while handling JavaScript rendering, anti-bot
infrastructure, geo-routing, and batch extraction.

Official docs: https://thunderbit.com/docs/api-reference/overview

## Install

Thunderbit currently ships separate npm packages for CLI and MCP. Both
use the same API key.

```bash
npm install -g @thunderbit/thunderbit-cli
export THUNDERBIT_API_KEY=tb_YOUR_API_KEY
```

Or run the CLI one-shot:

```bash
npx -y @thunderbit/thunderbit-cli --help
```

Verify the CLI:

```bash
mkdir -p .thunderbit
thunderbit --version
thunderbit distill "https://thunderbit.com/playground" --format markdown > .thunderbit/install-check.md
```

This gives you:

- **CLI tools** - `thunderbit distill`, `thunderbit extract`, `thunderbit suggest-fields`, `thunderbit batch distill`, `thunderbit batch extract`
- **MCP tools** - `thunderbit_distill`, `thunderbit_extract`, `thunderbit_suggest_fields`, `thunderbit_batch_distill_create`, `thunderbit_batch_distill_status`, `thunderbit_batch_extract_create`, `thunderbit_batch_extract_status`
- **REST API** - `/distill`, `/extract`, `/batch/distill`, `/batch/extract`
- **API key auth** - `THUNDERBIT_API_KEY`, format `tb_...`

## Choose Your Path

- **Need web data during this session** -> Path A (CLI)
- **Need an AI host to call Thunderbit as tools** -> Path B (MCP)
- **Need to add Thunderbit to product code** -> Path C (REST API)
- **Need an account or API key first** -> Path D (auth only)

---

## Path A: Live CLI Tools

Use this when you already have URLs and need Markdown or structured data
during your work.

Default flow:

1. use `distill` when you need clean Markdown
2. use `suggest-fields` when you do not know the schema yet
3. use `extract` when you need structured JSON
4. use `batch distill` or `batch extract` for up to 100 URLs
5. upgrade `--render-mode` from `none` to `basic` or `full` for JS-heavy pages

Examples:

```bash
thunderbit distill "https://example.com/article" --format markdown

thunderbit suggest-fields "https://example.com/product" \
  --prompt "focus on pricing and availability"

thunderbit extract "https://example.com/product" \
  --schema '{"name":"product name","price":"listed price as a number","currency":"3-letter currency code"}'

thunderbit batch distill --file urls.txt --format json
thunderbit batch extract --file urls.txt --schema ./schema.json --format json
```

Useful options:

- `--render-mode none|basic|full`
- `--country-code US`
- `--timeout 60000`
- `--sync`
- `--format json|table|markdown`
- `--api-key tb_...`
- `--base-url https://openapi.thunderbit.com`

If the task becomes "wire Thunderbit into product code," switch to Path C.

---

## Path B: MCP Server

Use this when Claude Desktop, Claude Code, Cursor, Cline, Windsurf, VS
Code, or another MCP-compatible host should call Thunderbit directly.

Run once with npx:

```bash
env THUNDERBIT_API_KEY=tb_YOUR_API_KEY npx -y @thunderbit/mcp-server
```

Generic MCP config:

```json
{
  "mcpServers": {
    "thunderbit": {
      "command": "npx",
      "args": ["-y", "@thunderbit/mcp-server"],
      "env": {
        "THUNDERBIT_API_KEY": "tb_YOUR_API_KEY"
      }
    }
  }
}
```

Claude Code:

```bash
claude mcp add thunderbit -e THUNDERBIT_API_KEY=tb_YOUR_API_KEY -- npx -y @thunderbit/mcp-server
```

Available MCP tools:

- `thunderbit_suggest_fields` - discover fields on a page
- `thunderbit_distill` - page to clean Markdown
- `thunderbit_extract` - page to structured JSON
- `thunderbit_batch_distill_create` / `thunderbit_batch_distill_status`
- `thunderbit_batch_extract_create` / `thunderbit_batch_extract_status`

Recommended MCP workflow:

1. `thunderbit_suggest_fields`
2. `thunderbit_extract` or `thunderbit_distill`
3. `thunderbit_batch_*_create` for bulk jobs
4. `thunderbit_batch_*_status` until terminal state

---

## Path C: Integrate Thunderbit Into An App

Use this when building an application, agent, or workflow that calls
Thunderbit from code.

Save the key in server-side config only:

```dotenv
THUNDERBIT_API_KEY=tb_...
```

Required product question:

- **What should Thunderbit do in the product?**

Route the answer:

- **Read a page for RAG or summarization** -> `POST /distill`
- **Extract fields from one URL** -> `POST /extract`
- **Process many pages as Markdown** -> `POST /batch/distill`
- **Process many pages as JSON** -> `POST /batch/extract`

Base URL:

```text
https://openapi.thunderbit.com/openapi/v1
```

Auth header:

```text
Authorization: Bearer tb_YOUR_API_KEY
```

Smoke test:

```bash
curl -X POST https://openapi.thunderbit.com/openapi/v1/distill \
  -H "Authorization: Bearer $THUNDERBIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://thunderbit.com/playground"}'
```

For CLI/MCP extraction, use a flat field-instruction map. For raw REST,
follow the current API docs for request shape.

---

## Path D: Account Authorization Or API Key

Use this when the human still needs to sign up, sign in, or create an
API key.

Get a key from:

- https://app.thunderbit.com/console

API key format:

```dotenv
THUNDERBIT_API_KEY=tb_...
```

Common auth failures:

- `401` - invalid, missing, revoked, disabled, or expired key
- `402` - insufficient credits
- `429` - rate limit exceeded

## Documentation and references

- CLI docs: https://thunderbit.com/docs/cli
- MCP docs: https://thunderbit.com/docs/mcp
- API overview: https://thunderbit.com/docs/api-reference/overview
- Quickstart: https://thunderbit.com/docs/quickstart
- MCP package: https://www.npmjs.com/package/@thunderbit/mcp-server
- CLI package: https://www.npmjs.com/package/@thunderbit/thunderbit-cli
