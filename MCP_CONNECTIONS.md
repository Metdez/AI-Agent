# MCP Connections

All active MCP server connections across Claude Code and Gemini environments.

Last updated: 2026-03-17

---

## Claude Code (via Plugins)

Managed via `claude plugins install <name>`. Authenticate via `/mcp` → "Authenticate".

| Name | URL | Transport | Status |
|------|-----|-----------|--------|
| Figma | https://mcp.figma.com/mcp | HTTP | Needs authentication |
| GitHub | https://api.githubcopilot.com/mcp/ | HTTP | Needs authentication |
| Notion | https://mcp.notion.com/mcp | HTTP | Needs authentication |
| Chrome DevTools | `cmd /c npx -y chrome-devtools-mcp@latest` | stdio | Active |
| FireCrawl | `https://mcp.firecrawl.dev/.../v2/mcp` | HTTP | Active |

To re-authenticate or check status: type `/mcp` in Claude Code.

---

## Gemini (mcp_config.json)

Config at: `C:\Users\John Doe\.gemini\antigravity\mcp_config.json`

| Name | Command | Env Vars | Status |
|------|---------|----------|--------|
| n8n-mcp | `C:\mcptools\n8n.bat` | — | **Disabled** |
| supabase-mcp-server | `C:\mcptools\supabase.bat` | — | Active |
| firecrawl | `C:\mcptools\firecrawl.bat` | `FIRECRAWL_API_KEY` | Active |

---

## Quick Reference

```bash
# List all Claude Code MCP servers
claude mcp list

# Add HTTP server
claude mcp add --transport http <name> <url>

# Add stdio server (Windows requires cmd /c wrapper)
claude mcp add --transport stdio <name> -- cmd /c npx -y <package>

# Add with auth header
claude mcp add --transport http <name> <url> --header "Authorization: Bearer <token>"

# Check status / authenticate
/mcp

# Remove a server
claude mcp remove <name>
```

## Scopes

| Flag | Where stored | Visibility |
|------|-------------|------------|
| (default) `--scope local` | `~/.claude.json` | You only, current project |
| `--scope user` | `~/.claude.json` | You only, all projects |
| `--scope project` | `.mcp.json` in repo | Everyone on the team |

---

## Adding New MCPs

Run `/add-mcp <docs-url>` in Claude Code — it will fetch the docs and run the install command for you.

Or see `directives/add_mcp_connection.md` for the manual process.
