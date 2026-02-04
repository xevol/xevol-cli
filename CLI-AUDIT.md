# CLI-AUDIT.md — xevol-cli Implementation Plan

> Updated 2025-07-21. CLI-first strategy: build CLI commands first, API endpoints follow, web last.

---

## 1. Current State

### CLI Commands (13 registered)

| # | Command | File | API Endpoint(s) | Status |
|---|---------|------|-----------------|--------|
| 1 | `login` | `src/commands/login.ts` | `POST /auth/cli/device-code`, `POST /auth/cli/device-token` | ✅ |
| 2 | `logout` | `src/commands/login.ts` | `POST /auth/cli/revoke` | ✅ |
| 3 | `whoami` | `src/commands/login.ts` | `GET /auth/session` | ✅ |
| 4 | `list` | `src/commands/list.ts` | `GET /v1/transcriptions?status=&sort=&page=&limit=` | ✅ |
| 5 | `add <url>` | `src/commands/add.ts` | `POST /v1/transcriptions` (via `GET /v1/add`) | ✅ |
| 6 | `view <id>` | `src/commands/view.ts` | `GET /v1/transcriptions/:id` (via `GET /v1/status/:id`) | ✅ |
| 7 | `analyze <id>` / `spikes <id>` | `src/commands/analyze.ts` | `GET /spikes?transcriptionId=:id`, `POST /spikes/:transcriptionId` | ✅ |
| 8 | `prompts` | `src/commands/prompts.ts` | `GET /v1/prompts` | ✅ |
| 9 | `stream <spikeId>` | `src/commands/stream.ts` | `GET /stream/spikes/:spikeId` (SSE) | ✅ |
| 10 | `resume <id>` | `src/commands/resume.ts` | Multiple (loads job state, streams pending spikes) | ✅ |
| 11 | `config` | `src/commands/config.ts` | None (local only) | ✅ |
| 12 | `usage` | `src/commands/usage.ts` | `GET /auth/cli/status` | ✅ |
| 13 | `export <id>` | `src/commands/export.ts` | `GET /v1/status/:id` (reuses view data) | ✅ |

### Flags implemented

| Flag | Commands | Notes |
|------|----------|-------|
| `--json` | `usage`, `list`, `export` | Raw JSON output |
| `--csv` | `list` | CSV table output |
| `--status <s>` | `list` | Filter by status (processing, complete, error) |
| `--sort <field:dir>` | `list` | Sort by createdAt, title, duration, status |
| `--format <f>` | `export` | json, markdown, text |
| `--output <file>` | `export` | Write to file instead of stdout |

### Lib modules

| Module | Purpose |
|--------|---------|
| `src/lib/api.ts` | `apiFetch()` wrapper with auth headers |
| `src/lib/config.ts` | Token storage, API URL resolution (`~/.xevol/config.json`) |
| `src/lib/sse.ts` | SSE streaming client |
| `src/lib/jobs.ts` | Local job state persistence for resume support |
| `src/lib/output.ts` | Cards, tables, spinners, formatters |
| `src/lib/utils.ts` | Shared utilities (pickValue, etc.) |

---

## 2. Completed

| Date | Item | Details |
|------|------|---------|
| 2025-07-21 | `usage` command | `src/commands/usage.ts` — calls `GET /auth/cli/status` (combined endpoint: account + subscription + usage in parallel). Supports `--json`. |
| 2025-07-21 | `list --status` & `--sort` | CLI passes `?status=` and `?sort=field:direction` params. API `GET /v1/transcriptions` updated with sort field map + status filter in where clause. |
| 2025-07-21 | `export <id>` command | `src/commands/export.ts` — exports transcription as JSON, markdown, or text. `--format`, `--output`, `--json` flags. |
| 2025-07-21 | `--json` flag | Added to `usage`, `list`, `export` commands |
| 2025-07-21 | `--csv` flag | Added to `list` command |
| 2025-07-21 | Registered usage + export | Both registered in `src/index.ts` |

---

## 3. P0 Plan — CLI as Primary Interface

### 3.1 `delete <id>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol delete <id> [--force]` |
| **Description** | Soft-delete a transcription (sets `deletedAt` timestamp) |
| **API endpoint** | ❌ `DELETE /v1/transcriptions/:id` — **needs creation** |
| **API file** | `src/routes/v1/transcription.ts` |
| **CLI file** | Create `src/commands/delete.ts`, register in `src/index.ts` |
| **Implementation** | API: add `app.delete("/transcriptions/:id", requireCliToken, ...)` — set `deletedAt = new Date()` where `id = param AND accountId = authed`. CLI: confirm prompt unless `--force`, call DELETE, print result. Update `list` query to exclude `deletedAt IS NOT NULL`. |
| **Complexity** | **S** |
| **Dependencies** | Need `deletedAt` column on transcriptions table (check if exists, add migration if not) |

### 3.2 `list --search <q>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol list --search "keyword"` |
| **Description** | Full-text search across transcription titles and URLs |
| **API endpoint** | ⚠️ Extend `GET /v1/transcriptions?q=<search>` — **needs API update** |
| **API file** | `src/routes/v1/transcription.ts` — add `q` query param handling |
| **CLI file** | Modify `src/commands/list.ts` — add `--search` option, pass as `?q=` |
| **Implementation** | API: add `ilike` filter on `title` and `youtubeUrl` columns when `q` param present. Phase 2: add PostgreSQL `tsvector` index for proper full-text search. CLI: pass `--search` value as `?q=` query param. |
| **Complexity** | **M** |
| **Dependencies** | None for ilike. tsvector needs migration. |

### 3.3 `add --batch <file>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol add --batch urls.txt [--wait] [--concurrency 3]` |
| **Description** | Submit multiple URLs from a file (one per line) |
| **API endpoint** | ✅ Reuses existing `POST /v1/transcriptions` per URL |
| **CLI file** | Modify `src/commands/add.ts` — add `--batch` option |
| **Implementation** | Read file line-by-line, filter empty/comment lines. Loop with concurrency limit (default 3). Show progress table: URL, status, ID. Aggregate results at end. |
| **Complexity** | **M** |
| **Dependencies** | None |

### 3.4 `workspace list`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol workspace list [--json]` |
| **Description** | List user's workspaces with balance, member count, status |
| **API endpoint** | ✅ `GET /v1/workspaces` — exists (`src/routes/v1/workspaces/index.js`) |
| **CLI file** | Create `src/commands/workspace.ts`, register in `src/index.ts` |
| **Implementation** | Call `GET /v1/workspaces`, display as table: id, name, role, balance, members. Mark active workspace (from local config). |
| **Complexity** | **S** |
| **Dependencies** | None |

### 3.5 `workspace switch <id>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol workspace switch <id>` |
| **Description** | Set active workspace in local config |
| **API endpoint** | None needed — local config only |
| **CLI file** | Add to `src/commands/workspace.ts`, modify `src/lib/config.ts` |
| **Implementation** | Validate workspace ID exists via `GET /v1/workspaces/:id`. Store `workspaceId` in `~/.xevol/config.json`. Update `apiFetch()` to include `X-Workspace-Id` header when set. |
| **Complexity** | **S** |
| **Dependencies** | `workspace list` (validates ID) |

### 3.6 `open <id>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol open <id>` |
| **Description** | Open transcription in default browser |
| **API endpoint** | None needed |
| **CLI file** | Create `src/commands/open.ts`, register in `src/index.ts` |
| **Implementation** | Use `open` (macOS) / `xdg-open` (Linux) / `start` (Windows) to open `https://xevol.com/t/<id>`. Optionally verify ID exists first via API. |
| **Complexity** | **S** |
| **Dependencies** | None |

### P0 Complexity Summary

| Size | Count | Items |
|------|-------|-------|
| S | 4 | delete, workspace list, workspace switch, open |
| M | 2 | list --search, add --batch |
| **Total** | **6** | ~3-4 days estimated |

---

## 4. P1 Plan — Power User Features

### 4.1 `projects list`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol projects list [--json]` |
| **Description** | List user's projects |
| **API endpoint** | ✅ `GET /v1/projects` — exists (`src/routes/projects.ts`) |
| **CLI file** | Create `src/commands/projects.ts`, register in `src/index.ts` |
| **Implementation** | Call endpoint, display as table: id, slug, name. |
| **Complexity** | **S** |

### 4.2 `projects create <name>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol projects create <name>` |
| **Description** | Create a new project |
| **API endpoint** | ✅ `POST /v1/projects` — exists |
| **CLI file** | Add to `src/commands/projects.ts` |
| **Implementation** | POST with `{ name }`, display created project details. |
| **Complexity** | **S** |

### 4.3 `projects delete <id>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol projects delete <id> [--force]` |
| **Description** | Delete a project |
| **API endpoint** | ❌ `DELETE /v1/projects/:id` — **needs creation** |
| **API file** | `src/routes/projects.ts` |
| **CLI file** | Add to `src/commands/projects.ts` |
| **Implementation** | API: add delete handler with ownership check. CLI: confirm unless `--force`. |
| **Complexity** | **S** |
| **Dependencies** | Check cascade behavior (objects, items, api-keys) |

### 4.4 `api-keys list [--project <id>]`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol api-keys list [--project <id>] [--json]` |
| **Description** | List API keys, optionally filtered by project |
| **API endpoint** | ❌ `GET /v1/api-keys?project_id=` — **needs creation** |
| **API file** | `src/routes/apiKeys.ts` |
| **CLI file** | Create `src/commands/api-keys.ts`, register in `src/index.ts` |
| **Implementation** | API: query apiKeys table by accountId (+ optional project_id filter). Mask key values (show last 8 chars). CLI: table display. |
| **Complexity** | **M** |

### 4.5 `api-keys create --project <id>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol api-keys create --project <id>` |
| **Description** | Create a new API key for a project |
| **API endpoint** | ✅ `POST /v1/api-keys` — exists |
| **CLI file** | Add to `src/commands/api-keys.ts` |
| **Implementation** | POST with `{ project_id }`. Display full key value once (warn: won't be shown again). |
| **Complexity** | **S** |

### 4.6 `api-keys revoke <id>`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol api-keys revoke <id> [--force]` |
| **Description** | Revoke an API key |
| **API endpoint** | ❌ `DELETE /v1/api-keys/:id` — **needs creation** |
| **API file** | `src/routes/apiKeys.ts` |
| **CLI file** | Add to `src/commands/api-keys.ts` |
| **Implementation** | API: soft-delete (set revokedAt). CLI: confirm unless `--force`. |
| **Complexity** | **S** |

### 4.7 `metrics`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol metrics [--json]` |
| **Description** | Admin dashboard — GMV, ARPU, MRR, churn, valuation |
| **API endpoint** | ✅ `GET /v1/metrics` — exists (`src/routes/v1/metrics/index.js`). Admin-only (email whitelist). |
| **CLI file** | Create `src/commands/metrics.ts`, register in `src/index.ts` |
| **Implementation** | Call endpoint, format key metrics as styled cards. Include timeseries data in `--json` mode. |
| **Complexity** | **M** |

### 4.8 `add` — multiple URLs / non-YouTube

| Field | Value |
|-------|-------|
| **Syntax** | `xevol add <url1> [url2] [url3] ...` |
| **Description** | Accept multiple URLs as positional args; relax YouTube-only validation |
| **CLI file** | Modify `src/commands/add.ts` |
| **Implementation** | Change from single arg to variadic. Loop with concurrency limit. For non-YouTube: remove/relax `YOUTUBE_URL_RE` validation (API-side check still applies). |
| **Complexity** | **M** |
| **Dependencies** | API must accept non-YouTube URLs (may need `src/routes/v1/transcription.ts` update) |

### 4.9 `library`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol library [--json]` |
| **Description** | List user's purchased/saved products |
| **API endpoint** | ✅ `GET /v1/library` — exists (`src/routes/v1/library/index.js`) |
| **CLI file** | Create `src/commands/library.ts`, register in `src/index.ts` |
| **Implementation** | Call endpoint, display as table/cards. |
| **Complexity** | **S** |

### 4.10 `browse`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol browse [--trending] [--featured] [--json]` |
| **Description** | Browse/discover products |
| **API endpoint** | ✅ `GET /v1/products/featured`, `/trending` — exist (`src/routes/v1/products/index.js`) |
| **CLI file** | Create `src/commands/browse.ts`, register in `src/index.ts` |
| **Implementation** | Default to featured. `--trending` flag switches. Paginated output. |
| **Complexity** | **S** |

### P1 Complexity Summary

| Size | Count | Items |
|------|-------|-------|
| S | 7 | projects list, projects create, projects delete, api-keys create, api-keys revoke, library, browse |
| M | 3 | api-keys list, metrics, add multi-url |
| **Total** | **10** | ~5-7 days estimated |

---

## 5. P2 Plan — Polish & QoL

### 5.1 Shell completions

| Field | Value |
|-------|-------|
| **Syntax** | `xevol completion bash\|zsh\|fish` |
| **Description** | Generate shell completion scripts |
| **CLI file** | Create `src/commands/completion.ts` |
| **Implementation** | Use Commander.js built-in completion or generate manually. Output script to stdout for `eval $(xevol completion bash)` pattern. |
| **Complexity** | **M** |

### 5.2 `doctor`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol doctor` |
| **Description** | Health check: API reachable, token valid, version current |
| **CLI file** | Create `src/commands/doctor.ts` |
| **Implementation** | Check: API ping (`GET /health`), token validity (`GET /auth/cli/status`), CLI version vs npm latest, config file readable. Show checkmarks/crosses. |
| **Complexity** | **S** |

### 5.3 `update`

| Field | Value |
|-------|-------|
| **Syntax** | `xevol update` |
| **Description** | Self-update CLI to latest version |
| **CLI file** | Create `src/commands/update.ts` |
| **Implementation** | Check npm registry for latest version. If newer, run `npm update -g xevol` (or detect bun/pnpm). Show changelog link. |
| **Complexity** | **S** |

### 5.4 Interactive/TUI mode

| Field | Value |
|-------|-------|
| **Syntax** | `xevol` (no args) or `xevol interactive` |
| **Description** | Guided TUI for common workflows |
| **CLI file** | Create `src/commands/interactive.ts` |
| **Implementation** | Use `inquirer` or `@clack/prompts` for interactive selection. Menu: Add URL, List transcriptions, View details, Export, Usage. |
| **Complexity** | **L** |

### 5.5 `--output` global format flag

| Field | Value |
|-------|-------|
| **Description** | Standardize output format across all commands: `--output json\|table\|csv\|raw` |
| **Files** | `src/index.ts` (global option), `src/lib/output.ts` (formatter dispatch) |
| **Implementation** | Add global `--output` option on program. Each command checks `program.opts().output`. Consolidate existing `--json`/`--csv` into this. Keep `--json` as shorthand alias. |
| **Complexity** | **M** |

### 5.6 Colored status indicators

| Field | Value |
|-------|-------|
| **Description** | Consistent color-coded status badges across all commands |
| **Files** | `src/lib/output.ts` |
| **Implementation** | Status map: `complete` → green, `processing` → yellow/spinner, `error` → red, `pending` → dim. Apply in list, view, export, add outputs. |
| **Complexity** | **S** |

### 5.7 Progress bars

| Field | Value |
|-------|-------|
| **Description** | Progress bars for batch operations and long-running tasks |
| **Files** | `src/lib/output.ts`, `src/commands/add.ts` |
| **Implementation** | Use `cli-progress` or `ora` progress mode. Apply to `add --batch`, `add --wait`, `stream`. |
| **Complexity** | **S** |

### P2 Complexity Summary

| Size | Count | Items |
|------|-------|-------|
| S | 4 | doctor, update, colored status, progress bars |
| M | 2 | shell completions, --output global flag |
| L | 1 | interactive/TUI mode |
| **Total** | **7** | ~4-5 days estimated |

---

## 6. API Gaps

Endpoints that **need to be created** for the plans above.

### Required for P0

| Method | Endpoint | Purpose | Route File | Schema |
|--------|----------|---------|------------|--------|
| `DELETE` | `/v1/transcriptions/:id` | Soft-delete transcription | `src/routes/v1/transcription.ts` | Params: `id` (string). Sets `deletedAt = now()`. Returns `{ ok: true }`. Requires auth + ownership check. |
| — | `GET /v1/transcriptions?q=<search>` | Add search param to existing endpoint | `src/routes/v1/transcription.ts` | Add `q` query param. Filter: `WHERE title ILIKE '%q%' OR youtubeUrl ILIKE '%q%'`. Phase 2: `tsvector` index. |

### Required for P1

| Method | Endpoint | Purpose | Route File | Schema |
|--------|----------|---------|------------|--------|
| `DELETE` | `/v1/projects/:id` | Delete project | `src/routes/projects.ts` | Params: `id`. Ownership check. Cascade: delete api-keys, unlink objects. Returns `{ ok: true }`. |
| `GET` | `/v1/api-keys?project_id=` | List API keys | `src/routes/apiKeys.ts` | Query: optional `project_id`. Returns `[{ id, projectId, createdAt, lastUsedAt, keyPrefix }]`. Mask full key. |
| `DELETE` | `/v1/api-keys/:id` | Revoke API key | `src/routes/apiKeys.ts` | Params: `id`. Sets `revokedAt = now()`. Ownership check via project → account. |

### Existing but unused by CLI

| Endpoint | Route File | Relevant CLI Command |
|----------|------------|---------------------|
| `GET /v1/workspaces` | `src/routes/v1/workspaces/index.js` | `workspace list` |
| `GET /v1/workspaces/:id` | `src/routes/v1/workspaces/index.js` | `workspace switch` (validation) |
| `POST /v1/workspaces` | `src/routes/v1/workspaces/index.js` | future `workspace create` |
| `GET /v1/projects` | `src/routes/projects.ts` | `projects list` |
| `POST /v1/projects` | `src/routes/projects.ts` | `projects create` |
| `POST /v1/api-keys` | `src/routes/apiKeys.ts` | `api-keys create` |
| `GET /v1/metrics` | `src/routes/v1/metrics/index.js` | `metrics` (admin) |
| `GET /v1/library` | `src/routes/v1/library/index.js` | `library` |
| `GET /v1/products/featured` | `src/routes/v1/products/index.js` | `browse` |
| `GET /v1/products/trending` | `src/routes/v1/products/trendingList.js` | `browse --trending` |
| `GET /export/:promptId/:id/epub` | `src/routes/export.ts` | future epub export |
| `GET /export/:promptId/:id/pdf` | `src/routes/export.ts` | future pdf export |

---

## 7. Architecture Notes

- **API framework:** Hono (not Express) — routes in `src/routes/`
- **DB:** PostgreSQL + Drizzle ORM (newer routes). Legacy workspace routes still use Knex.
- **Auth:** Lucia sessions (browser) + CLI device code flow (RFC 8628). CLI tokens: `xevol_cli_*` prefix, 6-month expiry, stored in `cliTokens` table.
- **Auth middleware:** `requireAuth` (session or CLI), `requireCliToken` (CLI only), `tryAttachUser` + `allowGuests` (optional auth)
- **Queue:** BullMQ — transcription processing, spike generation, email/kindle delivery
- **SSE:** Redis Streams via `sseManager` + `publisher`
- **Route mounting:** Transcription routes at v1 root level (no prefix in file, mounted under `/v1` in index). Projects and apiKeys at root level with `/v1/` prefix in route definitions. Legacy routes (workspaces, metrics, library, products) are JS files mounted under `/v1/`.
- **CLI config:** `~/.xevol/config.json` — stores `token`, `apiUrl`, defaults
- **CLI auth flow:** Device code → user approves in browser → CLI gets `xevol_cli_*` token → stored in config
- **Output patterns:** `src/lib/output.ts` has `printJson()`, `startSpinner()`, card/table formatters. Commands check `--json` flag to switch between human and machine output.
