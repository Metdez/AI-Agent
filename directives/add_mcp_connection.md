# Directive: Add MCP Connection

## Goal

Install a new MCP server into Claude Code given a documentation URL. Parse the install instructions and run the correct `claude mcp add` command.

## Inputs

- `docs_url`: URL to the MCP server's documentation page (e.g., `https://mcp.notion.com/docs`)

## Steps

### 1. Fetch the documentation

Use WebFetch to retrieve the docs page at `docs_url`. Extract:
- Server name (slug for the `claude mcp add` command)
- Transport type: `http`, `sse`, or `stdio`
- Server URL (for HTTP/SSE) OR command + args (for stdio)
- Required environment variables or API keys
- Authentication method (OAuth, API key, Bearer token, etc.)

If the page doesn't contain install instructions, check for a link to a "Quick Start", "Setup", or "Getting Started" section and follow it.

### 2. Determine the correct command

**HTTP server:**
```bash
claude mcp add --transport http <name> <url>
# With auth header:
claude mcp add --transport http <name> <url> --header "Authorization: Bearer <token>"
```

**SSE server (deprecated but still used):**
```bash
claude mcp add --transport sse <name> <url>
```

**stdio server (Windows — always use cmd /c wrapper):**
```bash
claude mcp add --transport stdio <name> -- cmd /c npx -y <package>
# With env vars:
claude mcp add --transport stdio --env KEY=VALUE <name> -- cmd /c npx -y <package>
```

### 3. Handle authentication

- **OAuth**: Run the command first, then authenticate via `/mcp` → "Authenticate"
- **API key in env var**: Include `--env API_KEY=<value>` — ask user for the value if unknown
- **Bearer token header**: Include `--header "Authorization: Bearer <token>"`

### 4. Run the command

Execute the `claude mcp add` command in the terminal.

Then verify with:
```bash
claude mcp list
```

### 5. Update MCP_CONNECTIONS.md

Add the new server to `MCP_CONNECTIONS.md` with:
- Name
- URL or command
- Transport type
- Auth method / status
- Date added

### 6. Test the connection

Run `/mcp` inside Claude Code to confirm the server shows up and is reachable. If it shows "Needs authentication", complete the OAuth flow.

## Edge Cases

- **Windows stdio servers**: Always wrap with `cmd /c` — e.g., `-- cmd /c npx -y <package>`. Without this, you get "Connection closed" errors.
- **Templated URLs**: Some docs show `https://{your-org}.example.com/mcp` — ask the user for their specific URL before running.
- **Private/paid APIs**: If the server requires an API key, ask the user for it rather than guessing. Never hardcode keys.
- **Scope**: Default scope is `local` (current project only). Use `--scope user` if the server should be available in all projects.

## Output

- New MCP server added and verified in `claude mcp list`
- `MCP_CONNECTIONS.md` updated with new entry
