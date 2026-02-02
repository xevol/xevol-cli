# xevol-cli — Plan

Minimal CLI for xevol-api. Auth + transcriptions only.

## Scope

4 features, nothing else:

1. **Auth** — login/logout + token-based auth
2. **List transcriptions** — paginated, filterable
3. **Add YouTube URL** — submit for processing, poll status
4. **View transcript** — raw content + formatted spikes

## Tech

- **Runtime:** Bun
- **Framework:** Commander.js
- **HTTP:** native fetch
- **Output:** `cli-table3` + `chalk`
- **Config:** `~/.xevol/config.json`
- **Lang:** TypeScript

## Auth — Device Authorization Flow (public-facing)

No passwords in the CLI. Browser handles all auth complexity (2FA, OAuth, SSO, password managers).

### Login flow
```
xevol login
```

1. CLI calls `POST /auth/cli/device-code` → gets `{ deviceCode, userCode, verificationUrl, expiresIn, interval }`
2. Opens browser to `https://xevol.com/cli-auth?code=ABCD-1234`
3. Prints fallback for headless environments:

```
Open this URL to authenticate:
  https://xevol.com/cli-auth?code=ABCD-1234

Waiting for approval... (expires in 5 min)
```

4. CLI polls `POST /auth/cli/device-token` with `{ deviceCode }` every `interval` seconds
5. User logs in on browser (existing session or fresh), sees "Authorize XEVol CLI?" + the user code for verification
6. User clicks Approve
7. CLI receives long-lived token, stores in `~/.xevol/config.json`:

```json
{
  "apiUrl": "https://api.xevol.com",
  "token": "xevol_cli_...",
  "accountId": "...",
  "email": "kuka@xevol.com",
  "expiresAt": "2026-08-02T00:00:00Z"
}
```

### Token mode (CI/CD, servers)
```
xevol login --token <token>
```
Validates via `GET /auth/session`, stores if valid. For automation where browser isn't available.

### Logout
```
xevol logout
```
Revokes token server-side, clears local config.

### Who am I
```
xevol whoami
> kuka@xevol.com (Pro plan, 47 transcriptions this month)
```

### Env override
```
XEVOL_API_URL=http://localhost:8081
XEVOL_TOKEN=<token>
```

### Precedence
1. `--token` flag
2. `XEVOL_TOKEN` env var
3. `~/.xevol/config.json`

### New API endpoints needed (xevol-api)

| Endpoint | Method | Description |
|---|---|---|
| `/auth/cli/device-code` | POST | Generate device code + user code |
| `/auth/cli/device-token` | POST | Poll for token (pending/approved/expired) |
| `/auth/cli/revoke` | POST | Revoke CLI token |
| `/cli-auth` (frontend) | GET | Browser page showing user code + approve button |

Token format: `xevol_cli_<random>` — separate from session tokens, longer-lived (6 months), revocable from account settings.

## Commands

### `xevol list`

List transcriptions with pagination.

```
xevol list
xevol list --page 2 --limit 50
xevol list --json
```

**API:** `GET /v1/transcription/transcriptions?page=N&limit=N`
**Auth:** session token in cookie header

**Default output:**
```
Transcriptions (page 1/3, 47 total)

ID            Status      Lang  Duration  Channel               Title
─────────────────────────────────────────────────────────────────────────
abc123def45   completed   en    12:34     Y Combinator          How to Build a Startup
xyz789ghi01   completed   de    45:12     Lex Fridman           Interview with...
...

Page 1 of 3 — use --page 2 for next
```

**JSON output:** raw API response.

### `xevol add <youtube-url>`

Submit a YouTube URL for transcription.

```
xevol add "https://youtube.com/watch?v=abc123"
xevol add "https://youtube.com/watch?v=abc123" --lang de
xevol add "https://youtube.com/watch?v=abc123" --wait
```

**API:** `GET /v1/transcription/add?url=<url>&outputLang=<lang>`
**Auth:** session token in cookie header

**Default output:**
```
✓ Transcription created: abc123def45
Status: pending
```

**With `--wait`:** polls `GET /v1/transcription/status/:id` every 5s until completed/error.
```
✓ Transcription created: abc123def45
⠋ Processing... (30s)
✓ Completed: "How to Build a Startup" (12:34)
```

**Options:**
- `--lang <code>` — output language (default: `en`)
- `--wait` — poll until complete
- `--json` — raw JSON response

### `xevol view <id>`

View a transcription's raw content.

```
xevol view abc123def45
xevol view abc123def45 --raw
xevol view abc123def45 --json
```

**API:** `GET /v1/transcription/analysis/:id`

**Default output:**
```
How to Build a Startup
Channel: Y Combinator (@ycombinator)
Duration: 12:34 | Lang: en | Status: completed
URL: https://youtube.com/watch?v=abc123
───────────────────────────────────────

[summary text]

───────────────────────────────────────
Full transcript: use --raw
```

**With `--raw`:** prints full `content` or `cleanContent` field to stdout (pipeable).

```
xevol view abc123def45 --raw > transcript.txt
xevol view abc123def45 --raw --clean  # cleanContent instead of content
```

### `xevol spikes <id>`

View formatted AI-generated spikes for a transcription.

```
xevol spikes abc123def45
xevol spikes abc123def45 --json
```

**API:** Direct query — `GET /spikes` where `transcriptionId = :id`

Since spikes are generated on-demand via `POST /spikes/:transcriptionId` with a `promptId`, the CLI needs to:

1. Check if spikes exist for this transcription
2. If yes, display them
3. If no, offer to generate (requires `--prompt <id>`)

```
xevol spikes abc123def45
```

**Output (if spikes exist):**
```
Spikes for "How to Build a Startup"
───────────────────────────────────────

[formatted spike content — markdown rendered to terminal]
```

**Output (no spikes):**
```
No spikes found for abc123def45.
Generate with: xevol spikes abc123def45 --generate --prompt <promptId>
```

**Generate:**
```
xevol spikes abc123def45 --generate --prompt default --lang en
```
Calls `POST /spikes/:id` with `{ promptId, outputLang }`, then polls stream until complete.

## Project Structure

```
xevol-cli/
├── src/
│   ├── index.ts              # Entry: commander setup, register commands
│   ├── commands/
│   │   ├── login.ts          # login + logout
│   │   ├── list.ts           # list transcriptions
│   │   ├── add.ts            # add youtube url
│   │   ├── view.ts           # view transcript
│   │   └── spikes.ts         # view/generate spikes
│   └── lib/
│       ├── api.ts            # fetch wrapper (base URL, auth headers, error handling)
│       ├── config.ts         # read/write ~/.xevol/config.json
│       └── output.ts         # table formatting, spinners, colors
├── package.json
├── tsconfig.json
├── PLAN.md
└── README.md
```

## package.json

```json
{
  "name": "xevol-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "xevol": "./src/index.ts"
  },
  "dependencies": {
    "commander": "^13.0.0",
    "chalk": "^5.4.0",
    "cli-table3": "^0.6.5",
    "ora": "^8.0.0",
    "@inquirer/prompts": "^7.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.7.0"
  }
}
```

## Install & Link

```bash
cd ~/stack/xevol-cli
bun install
bun link   # → `xevol` available globally
```

## Implementation Order

### Phase 1: API-side (xevol-api)
1. `POST /auth/cli/device-code` — generate device + user codes, store in Redis with TTL
2. `POST /auth/cli/device-token` — poll endpoint, returns pending/approved/expired
3. `POST /auth/cli/revoke` — revoke CLI token
4. CLI token model — new table or extend existing API keys with `type: "cli"`
5. Frontend: `/cli-auth` page — show user code, approve button, calls device-token approve

### Phase 2: CLI
1. `lib/config.ts` + `lib/api.ts` — foundation
2. `commands/login.ts` — device auth flow + `--token` fallback
3. `commands/list.ts` — list transcriptions
4. `commands/add.ts` — add URL + polling
5. `commands/view.ts` — view transcript
6. `commands/spikes.ts` — view/generate spikes
7. `lib/output.ts` — polish formatting

### Phase 3: Distribution
1. npm publish as `xevol` (claimed, published v0.0.1 on 2026-02-02)
2. README with install + auth flow
3. `xevol update` — self-update command

**npm package:** `xevol` — https://www.npmjs.com/package/xevol
**Install:** `npm i -g xevol` / `bun add -g xevol` / `npx xevol`
**Binary name:** `xevol`
**Publishing:** granular access token (2FA bypass) stored in npm config
**Publish command:** `npm publish --access public` from `~/stack/xevol-cli`

Estimate: Phase 1 ~3-4h, Phase 2 ~2-3h, Phase 3 ~1h.
