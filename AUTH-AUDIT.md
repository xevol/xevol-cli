# XEvol CLI API Auth Audit

Scope: all `apiFetch` calls in `src/commands/*.ts` within `xevol-cli`, mapped to their matching routes in `~/stack/xevol-api/src/routes/` and checked for CLI-token compatibility (CLI tokens set `accountId` only — no `user` or `sessionId`).

## Findings

| CLI Command | API Path | API File | Auth Check | CLI Compatible? | Issue |
| --- | --- | --- | --- | --- | --- |
| `add` | `GET /v1/add` | `~/stack/xevol-api/src/routes/v1/transcription.ts` | `tryAttachUser` + `checkSubscription`; uses `c.get("accountId")` or guest `sessionToken` | yes | — |
| `add` | `GET /v1/status/:id` | `~/stack/xevol-api/src/routes/v1/transcription.ts` | `tryAttachUser` + `allowGuests`; uses `accountId` or `sessionToken` | yes | — |
| `add` | `POST /spikes/:transcriptionId` | `~/stack/xevol-api/src/routes/spikes.ts` | `tryAttachUser` + `allowGuests` + `checkSubscription`; uses `accountId` or `sessionToken` | yes | — |
| `analyze` | `POST /spikes/:transcriptionId` | `~/stack/xevol-api/src/routes/spikes.ts` | `tryAttachUser` + `allowGuests` + `checkSubscription`; uses `accountId` or `sessionToken` | yes | — |
| `resume` | `POST /spikes/:transcriptionId` | `~/stack/xevol-api/src/routes/spikes.ts` | `tryAttachUser` + `allowGuests` + `checkSubscription`; uses `accountId` or `sessionToken` | yes | — |
| `delete` | `DELETE /v1/transcriptions/:id` | `~/stack/xevol-api/src/routes/v1/transcription.ts` | `tryAttachUser`; requires `accountId` (no `user` needed) | yes | — |
| `list` | `GET /v1/transcriptions` | `~/stack/xevol-api/src/routes/v1/transcription.ts` | `tryAttachUser` + `allowGuests`; uses `accountId` or guest `sessionToken` | yes | — |
| `view` | `GET /v1/analysis/:id` | `~/stack/xevol-api/src/routes/v1/transcription.ts` | No auth middleware; public | yes | — |
| `export` | `GET /v1/analysis/:id` | `~/stack/xevol-api/src/routes/v1/transcription.ts` | No auth middleware; public | yes | — |
| `prompts` | `GET /v1/prompts` | `~/stack/xevol-api/src/routes/v1/transcription.ts` | No auth middleware; public | yes | — |
| `login` | `GET /auth/session` | `~/stack/xevol-api/src/routes/auth/index.ts` | Cookie session preferred; falls back to `Authorization: Bearer xevol_cli_*` | yes | — |
| `login` | `POST /auth/cli/revoke` | `~/stack/xevol-api/src/routes/auth/cli.ts` | `requireCliToken`; reads Bearer CLI token | yes | — |
| `usage` | `GET /auth/cli/status` | `~/stack/xevol-api/src/routes/auth/cli.ts` | `requireCliToken`; uses `accountId` from CLI token | yes | — |
| `workspace` (`list`, `switch`) | `GET /v1/workspaces` | `~/stack/xevol-api/src/routes/v1/workspaces/index.js` | Uses `c.get("user")` but falls back to `c.get("accountId")` for list | yes | — |

## Notes

- No CLI-used endpoint performs a strict `c.get("user")` check without an `accountId` fallback.
- None of the CLI-used endpoints require `c.get("sessionId")`, `req.session`, or cookie-only checks.
- The only `sessionId`-required check I found is in `POST /auth/cli/approve`, which is **not** called by the CLI.
