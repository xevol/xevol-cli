# CLI-AUDIT.md — xevol-cli Gap Analysis

> Generated 2025-07-20. CLI-first strategy: build CLI commands first, API endpoints follow, web last.

---

## A. Current State

### CLI Commands (9 command files)

| Command | File | API Endpoint(s) | What it does |
|---------|------|-----------------|--------------|
| `login` | `src/commands/login.ts` | `POST /auth/cli/device-code`, `POST /auth/cli/device-token` | OAuth 2.0 Device Code flow — opens browser, polls for approval, stores CLI token |
| `logout` | `src/commands/login.ts` | `DELETE /auth/cli/revoke` | Revokes CLI token, clears local config |
| `whoami` | `src/commands/login.ts` | `GET /auth/session` | Shows email, plan, usage from session data |
| `list` | `src/commands/list.ts` | `GET /v1/transcriptions` | Paginated list of transcriptions with card-style output |
| `add <url>` | `src/commands/add.ts` | `POST /v1/transcriptions` | Submit YouTube URL for processing. Supports `--wait`, `--analyze`, `--lang` |
| `view <id>` | `src/commands/view.ts` | `GET /v1/transcriptions/:id` | View transcription details, transcript text, spike content |
| `analyze <id>` / `spikes <id>` | `src/commands/analyze.ts` | `GET /spikes?transcriptionId=:id`, `POST /spikes/:transcriptionId` | List or generate analyses (spikes) for a transcription |
| `prompts` | `src/commands/prompts.ts` | `GET /v1/prompts` | List available analysis prompts |
| `stream <spikeId>` | `src/commands/stream.ts` | `GET /stream/spikes/:spikeId` (SSE) | Stream spike content in real-time via SSE |
| `resume <id>` | `src/commands/resume.ts` | Multiple (loads job state, streams pending spikes) | Resume interrupted streaming sessions |
| `config` | `src/commands/config.ts` | None (local only) | Get/set local config (`apiUrl`, `default.lang`, `default.limit`, `api.timeout`) |

### Lib modules
- `src/lib/api.ts` — `apiFetch()` wrapper with auth headers
- `src/lib/config.ts` — Token storage, API URL resolution (`~/.xevol/config.json`)
- `src/lib/sse.ts` — SSE streaming client
- `src/lib/jobs.ts` — Local job state persistence for resume support
- `src/lib/output.ts` — Cards, tables, spinners, formatters

### Key observations
- All commands are **read-only** or **create-only** — no delete, update, or search
- `add` is YouTube-specific (`YOUTUBE_URL_RE` regex validation)
- No filtering on `list` (no `--status`, `--search`, `--sort`)
- No export capability
- No workspace/billing commands
- `config` is hidden from help

---

## B. Gap Analysis

### P0 — Critical for CLI-first

| Missing Command | Description | API Exists? | CLI File Needed |
|----------------|-------------|-------------|-----------------|
| `list --status <s>` | Filter by status (processing, complete, error) | ⚠️ Partial — `GET /v1/transcriptions` may accept query params but CLI doesn't pass them | Modify `src/commands/list.ts` |
| `list --search <q>` | Full-text search across titles/URLs | ❌ No search endpoint | New API endpoint + CLI flag |
| `delete <id>` | Delete/archive a transcription | ❌ No `DELETE /v1/transcriptions/:id` | New command + API endpoint |
| `export <id>` | Export transcript/spike as markdown, text, or JSON to stdout/file | ⚠️ Partial — `/export/:promptId/:id/epub` and `/export/:promptId/:id/pdf` exist but no markdown/text | New command, possibly new API endpoint |
| `usage` | Show current usage, limits, billing period | ✅ `GET /v1/usage` + `GET /v1/subscription` | New command `src/commands/usage.ts` |
| `workspace list` | List user's workspaces | ✅ `GET /v1/workspaces` (with invites, balance, etc.) | New command `src/commands/workspace.ts` |
| `workspace switch <id>` | Switch active workspace context | ❌ No API — likely local config | Add to config.ts or workspace.ts |
| `add --batch <file>` | Add multiple URLs from a file | ❌ No batch endpoint | CLI-side loop over existing `POST /v1/transcriptions` |

### P1 — Power User Features

| Missing Command | Description | API Exists? |
|----------------|-------------|-------------|
| `metrics` | Admin dashboard metrics (GMV, churn, ARPU, MRR, etc.) | ✅ Rich endpoint: `GET /v1/metrics/*` (20+ sub-endpoints) |
| `projects list` | List user's projects | ✅ `GET /v1/projects` |
| `projects create` | Create a new project | ✅ `POST /v1/projects` |
| `api-keys create` | Create API key for a project | ✅ `POST /v1/api-keys` |
| `api-keys list` | List API keys | ❌ No list endpoint (only create) |
| `library` | List user's purchased/saved products | ✅ `GET /v1/library` |
| `browse` | Browse/discover products | ✅ `GET /v1/products/featured`, `/trending`, `/browse` |
| `add <url> <url2> ...` | Variadic URL arguments | ❌ CLI accepts single URL only |

### P2 — Nice to Have

| Feature | Description |
|---------|-------------|
| Shell completions | `xevol completion bash/zsh/fish` — Commander.js has built-in support |
| `--output <format>` global flag | Consistent `json`, `table`, `csv` across all commands |
| Interactive mode | `xevol interactive` — guided TUI for common workflows |
| `update` | Self-update command (`npm update -g xevol`) |
| `doctor` | Health check (API reachable, token valid, version check) |
| `open <id>` | Open transcription in browser |

---

## C. Missing API Endpoints

These endpoints **do not exist** in `xevol-api` and are **required** for CLI-first:

| Endpoint | Method | Purpose | Priority |
|----------|--------|---------|----------|
| `DELETE /v1/transcriptions/:id` | DELETE | Delete/archive transcription | P0 |
| `GET /v1/transcriptions?q=<search>` | GET | Full-text search across transcriptions | P0 |
| `GET /v1/transcriptions/:id/export?format=md\|txt\|json` | GET | Export transcript content in plain formats | P0 |
| `POST /v1/transcriptions/batch` | POST | Submit multiple URLs at once | P1 |
| `GET /v1/api-keys` | GET | List API keys for a project | P1 |
| `DELETE /v1/api-keys/:id` | DELETE | Revoke an API key | P1 |
| `GET /v1/spikes/:id/export?format=md\|txt` | GET | Export spike content as markdown/text | P0 |

### Endpoints that exist but CLI doesn't use

| Endpoint | Available at | Notes |
|----------|-------------|-------|
| `GET /v1/usage` | `src/routes/v1/usage.ts` | 30-day usage stats — unused by CLI |
| `GET /v1/subscription` | `src/routes/v1/subscription.ts` | Plan, limits, Stripe data — unused |
| `GET /v1/subscription/config` | `src/routes/v1/subscription.ts` | Pricing config — unused |
| `GET /v1/workspaces/*` | `src/routes/v1/workspaces/` | Full workspace management (12 sub-routes) — unused |
| `GET /v1/projects` | `src/routes/projects.ts` | Project CRUD — unused |
| `POST /v1/projects` | `src/routes/projects.ts` | Create project — unused |
| `GET /v1/metrics/*` | `src/routes/v1/metrics/index.js` | 20+ business metrics endpoints — unused |
| `GET /export/:promptId/:id/epub` | `src/routes/export.ts` | EPUB export — unused |
| `GET /export/:promptId/:id/pdf` | `src/routes/export.ts` | PDF export — unused |
| `POST /export/email` | `src/routes/export.ts` | Email delivery — unused |
| `POST /export/kindle` | `src/routes/export.ts` | Kindle delivery — unused |
| `GET /v1/library` | `src/routes/v1/library/index.js` | User's library — unused |
| `GET /v1/products/featured` | `src/routes/v1/products/index.js` | Featured products — unused |

---

## D. Recommended Implementation Order

### Sprint 1 — Make CLI usable as primary interface

1. **`usage` command** — Wire up `GET /v1/usage` + `GET /v1/subscription`. Zero API work needed. Shows plan, limits, usage in terminal.

2. **`list` filtering** — Add `--status`, `--limit`, `--page` flags. Check if API already accepts query params (likely does via Drizzle). Minimal API changes.

3. **`delete <id>` command + API endpoint** — Add `DELETE /v1/transcriptions/:id` to API (soft-delete: set `deletedAt`). New CLI command file.

4. **`export <id>` command** — Start with JSON/markdown export using existing `view` data (transcript text is already returned). Later add dedicated API endpoint for cleaner exports.

5. **`--output` global flag** — Add `--json`, `--csv`, `--raw` to all commands consistently. Existing `--json` flags exist on some commands; standardize.

### Sprint 2 — Power features

6. **`workspace` subcommand** — Wire up existing workspace API. `workspace list`, `workspace switch <id>`, `workspace create <name>`.

7. **`add --batch`** — Accept file with URLs (one per line) or multiple positional args. Client-side loop, parallel with concurrency limit.

8. **`list --search`** — Requires new API endpoint or adding full-text search to `GET /v1/transcriptions`. Consider PostgreSQL `tsvector`.

9. **`projects` + `api-keys` subcommands** — Wire up existing project CRUD. Add `GET /v1/api-keys` list endpoint.

10. **`metrics` command** — Admin-only. Wire up existing rich metrics API. Output as table or JSON.

### Sprint 3 — Polish

11. **Shell completions** — Commander.js `program.completion()` or manual generator.
12. **`doctor` command** — Health check, version comparison, token validity.
13. **`open <id>` command** — Opens `xevol.com/t/:id` in default browser.
14. **`update` command** — Self-update via npm.

---

## Architecture Notes

- **API framework:** Hono (not Express) — routes in `src/routes/`
- **DB:** PostgreSQL + Drizzle ORM
- **Auth:** Lucia + CLI device code flow (RFC 8628)
- **Queue:** BullMQ (transcription processing, spikes generation, email/kindle delivery)
- **SSE:** Redis Streams via `sseManager` + `publisher`
- **Route mounting:** Mixed — transcription/spikes/stream at root level, most features under `/v1/`
- **Workspace routes:** Still using Knex (legacy), while newer routes use Drizzle
